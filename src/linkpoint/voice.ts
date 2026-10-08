import { Utils } from './utils';
import { slBridge } from './sl-bridge';
import {
  DATA_CHANNEL_LABEL, EarLocation, POSITION_UPDATE_THROTTLE_MS, RetryBackoff, earPose, iceServersForGrid, joinMessage, mungeOpusSdp,
  muteMessage, neighborsToJoin, parseVoiceData, provisionBody, regionHandleFor, signalingBody, spatialMessage, userGainMessage,
  type NeighborRegion, type ParticipantUpdate, type Quat, type SpatialChoice, type Vec3, type VoiceChannel,
} from './voice-protocol';
import { VoiceNeighborConnection } from './voice-neighbor';

/** A refused, missing or unusable microphone: retrying would only ask again. */
const isMicrophoneError = (error: unknown) =>
  typeof error === 'object' && error !== null && ['NotAllowedError', 'NotFoundError', 'NotReadableError', 'SecurityError', 'OverconstrainedError'].includes((error as { name?: string }).name || '');

export type VoiceState = 'off' | 'connecting' | 'connected' | 'error';

export interface SpeakerInfo {
  /** Avatar UUID, as reported by the voice server's data channel. */
  id: string;
  name?: string;
  speaking: boolean;
  /** Voice power 0..1 as reported by the server (`p` / 128). */
  energy: number;
  position?: [number, number, number];
  distance?: number;
  moderatorMuted?: boolean;
  active: boolean;
}

interface Participant {
  id: string;
  /** The connection whose server announced this person as its own ('primary' or a neighbour's region handle). */
  source: string;
  level: number;
  speaking: boolean;
  moderatorMuted: boolean;
}

export interface VoiceConnectOptions {
  /** Spatial voice for a parcel (default) or an ad-hoc P2P / group channel. */
  channel?: VoiceChannel;
  /** Shorthand for a spatial channel on a parcel. */
  parcelLocalId?: number;
  /** Grid login id, e.g. "agni" or "aditi", for the STUN hosts. Default "agni". */
  grid?: string;
  inputDeviceId?: string;
  earLocation?: EarLocation;
}

/**
 * Second Life WebRTC voice client, following the official viewer (`llvoicewebrtc.cpp`,
 * `llwebrtc.cpp`, github.com/secondlife/viewer @ 7dd6de6120ce, 2026-10-07).
 *
 * The viewer is the WebRTC offerer. It opens one peer connection with a microphone track and an
 * ordered data channel labelled "SLData", provisions it through the region's
 * ProvisionVoiceAccountRequest capability, trickles ICE through VoiceSignalingRequest, and joins
 * over the data channel. It sends its own and its listener's position over that channel; the voice
 * server mixes everyone spatially and returns a single stereo stream, and reports who is speaking
 * (keyed by avatar UUID) over the same channel. So this client does no panning of its own.
 *
 * After a failed connection the viewer's retry schedule applies (`RetryBackoff`). The viewer retries
 * when provisioning fails or the peer asks to renegotiate; a browser has no such callback, so a peer
 * that reports `failed` or a data channel that closes unasked is treated the same way.
 *
 * Cross-region voice follows `updateNeighboringRegions`: while the avatar is on the estate channel, extra listen-only
 * connections (`VoiceNeighborConnection`) are held to every neighbouring region within 100 m, and people are taken from a
 * neighbour only when it says they belong to it (a join marked primary). When the avatar crosses a border the viewer
 * promotes the neighbour's connection in place; here the connections are rebuilt for the new region instead.
 *
 * What is not done: the mute click-fade. Nothing here has been run against a live voice server.
 */
export class VoiceManager extends Utils.EventEmitter {
  state: VoiceState = 'off';
  muted = true;

  private peer: RTCPeerConnection | null = null;
  /** The caller wants voice on: set by connect, cleared by disconnect. Only then are failures retried. */
  private wanted = false;
  private retry = new RetryBackoff();
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryAttempts = 0;
  /** Replaceable for tests; the backoff draws from it. */
  setRandom(random: () => number) { this.retry = new RetryBackoff(random); }
  private dataChannel: RTCDataChannel | null = null;
  private stream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private viewerSession = '';
  private channel: VoiceChannel = { kind: 'local' };
  private options: VoiceConnectOptions = {};
  private joined = false;
  private speakerVolume = 1;

  private audioContext: AudioContext | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private analysisTimer: ReturnType<typeof setInterval> | null = null;

  private selfId = '';
  private participants = new Map<string, Participant>();
  private names = new Map<string, string>();
  private positions = new Map<string, [number, number, number]>();
  private userGains = new Map<string, number>();
  private userMutes = new Map<string, boolean>();

  private regionOrigin: [number, number] = [0, 0];
  /** Handle of the region the avatar is in, from its origin. */
  private regionHandle = regionHandleFor([0, 0]);
  /** The region the primary connection was provisioned for. */
  private connectedRegionHandle = '';
  private spatialChoice: SpatialChoice = { enabled: true, estate: true };
  private neighborRegions: NeighborRegion[] = [];
  private neighbors = new Map<string, VoiceNeighborConnection>();
  private neighborRetryAt = new Map<string, number>();
  private neighborAudio = new Map<string, HTMLAudioElement>();
  private lastNeighborSync = -Infinity;
  private avatar: { position?: Vec3; rotation?: Quat } = {};
  private camera: { position?: Vec3; rotation?: Quat } = {};
  private earLocation: EarLocation = EarLocation.Avatar;
  private spatialDirty = false;
  private lastSpatialSent = -Infinity;
  private spatialTimer: ReturnType<typeof setInterval> | null = null;

  private setState(state: VoiceState, message = '') {
    this.state = state;
    this.emit('state', { state, message, muted: this.muted });
  }

  /** Identify the logged-in avatar, so its own entries on the data channel are recognised. */
  setSelfId(id: string) { this.selfId = (id || '').toLowerCase(); }

  // ---- connection ---------------------------------------------------------------------------------

  async connect(options: VoiceConnectOptions = {}) {
    if (this.peer) return;
    this.wanted = true;
    this.clearRetryTimer();
    this.options = options;
    const explicit = options.channel !== undefined || options.parcelLocalId !== undefined;
    if (!explicit && !this.spatialChoice.enabled) {
      const reason = this.spatialChoice.reason;
      this.setState('error', reason);
      throw new Error(reason);
    }
    this.channel = options.channel ?? (explicit
      ? { kind: 'local', parcelLocalId: options.parcelLocalId }
      : this.spatialChoice.enabled && !this.spatialChoice.estate ? { kind: 'local', parcelLocalId: this.spatialChoice.parcelLocalId } : { kind: 'local' });
    this.connectedRegionHandle = this.regionHandle;
    if (options.earLocation !== undefined) this.earLocation = options.earLocation;
    this.setState('connecting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        // The viewer's defaults: echo cancellation, automatic gain control and noise suppression on.
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(options.inputDeviceId ? { deviceId: { exact: options.inputDeviceId } } : {}) },
        video: false,
      });
      this.startLocalMeter();

      const peer = new RTCPeerConnection({ iceServers: iceServersForGrid(options.grid) });
      this.peer = peer;
      this.dataChannel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      this.dataChannel.onopen = () => this.onDataChannelOpen();
      this.dataChannel.onmessage = (event) => { if (typeof event.data === 'string') this.onData(event.data); };
      const channel = this.dataChannel;
      channel.onclose = () => { if (this.dataChannel === channel && this.joined) void this.connectionLost('The voice data channel closed'); };

      // Like the viewer, the microphone stays muted until the join has completed.
      this.stream.getAudioTracks().forEach((track) => { track.enabled = false; peer.addTrack(track, this.stream!); });
      peer.ontrack = ({ track, streams }) => this.playRemote(streams[0] || new MediaStream([track]));

      const pending: RTCIceCandidateInit[] = [];
      let gatheringDone = false;
      const flush = async () => {
        if (!this.viewerSession) return;
        if (pending.length) {
          const body = signalingBody(this.viewerSession, pending.splice(0), false);
          if (body) await slBridge.voiceSignal(body).catch((e: unknown) => this.emit('error', e));
        }
        if (gatheringDone) {
          gatheringDone = false;
          const body = signalingBody(this.viewerSession, [], true);
          if (body) await slBridge.voiceSignal(body).catch((e: unknown) => this.emit('error', e));
        }
      };
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) { pending.push(candidate.toJSON()); flushTimer ||= setTimeout(() => { flushTimer = undefined; void flush(); }, 100); }
        else { gatheringDone = true; void flush(); }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') this.setState('connected');
        else if (peer.connectionState === 'failed') void this.connectionLost(`WebRTC ${peer.connectionState}`);
        else if (peer.connectionState === 'disconnected') this.setState('error', `WebRTC ${peer.connectionState}`);
      };

      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      const sdp = mungeOpusSdp(offer.sdp || '');
      await peer.setLocalDescription({ type: 'offer', sdp });

      const response = await slBridge.voiceProvision(provisionBody(sdp, this.channel));
      const answer = response?.jsep;
      if (!response?.viewer_session || answer?.type !== 'answer' || !answer?.sdp) throw new Error('The voice server returned an invalid answer');
      this.viewerSession = String(response.viewer_session);
      await peer.setRemoteDescription(answer);
      await flush();
    } catch (error) {
      await this.teardown();
      this.setState('error', error instanceof Error ? error.message : 'Voice connection failed');
      // A refused microphone will not be fixed by trying again; anything else follows the viewer's retry schedule.
      if (isMicrophoneError(error)) this.wanted = false;
      else this.scheduleRetry();
      throw error;
    }
  }

  private clearRetryTimer() {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
  }

  /** The connection dropped after it was up: tear it down and come back on the retry schedule. */
  private async connectionLost(message: string) {
    if (!this.wanted || this.retryTimer) return;
    await this.teardown();
    this.setState('error', message);
    this.scheduleRetry();
  }

  /** `VOICE_STATE_SESSION_RETRY`: wait `random + 0.5` s growing by the same each time to 10 s, then connect again. */
  private scheduleRetry() {
    if (!this.wanted || this.retryTimer) return;
    const delaySeconds = this.retry.next();
    this.retryAttempts++;
    this.emit('retrying', { attempt: this.retryAttempts, delaySeconds });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect(this.options).catch(() => { /* connect has scheduled the next attempt, or given up */ });
    }, delaySeconds * 1000);
  }

  /**
   * The parcel or region changed. The viewer starts a new session on the new channel, so this tears
   * the connection down and connects again with the same options, keeping the mute state.
   */
  async reprovision(parcelLocalId?: number) {
    await this.setSpatialChoice(parcelLocalId === undefined ? { enabled: true, estate: true } : { enabled: true, estate: false, parcelLocalId }, this.regionHandle);
  }

  /**
   * Which spatial channel applies (see `chooseSpatialChannel`) in the region with this handle. Remembered for the next
   * `connect()`; if voice is up on a different channel or region it is rebuilt, if the parcel forbids voice it is stopped
   * (and starts again by itself when a parcel that allows it is entered).
   */
  async setSpatialChoice(choice: SpatialChoice, regionHandle: string = this.regionHandle) {
    const sameRegion = regionHandle === this.regionHandle;
    this.spatialChoice = choice;
    if (!sameRegion) { this.regionHandle = regionHandle; this.spatialDirty = true; }
    if (this.wanted && this.retryTimer) { this.options = { ...this.options, channel: undefined, parcelLocalId: undefined }; return; }
    const live = this.state === 'connected' || this.state === 'connecting';
    if (!choice.enabled) {
      if (live && this.channel.kind === 'local') {
        this.suspended = true;
        await this.teardown();
        this.setState('off', choice.reason);
        this.emit('suspended', { reason: choice.reason });
      }
      return;
    }
    if (this.suspended && this.wanted) {
      this.suspended = false;
      try { await this.connect({ ...this.options, channel: undefined, parcelLocalId: undefined }); this.emit('reprovisioned', { viewerSession: this.viewerSession }); } catch (error) { this.emit('reprovision_error', error); }
      return;
    }
    if (!live || this.channel.kind !== 'local') return;
    const channelMatches = choice.estate ? this.channel.parcelLocalId === undefined : this.channel.parcelLocalId === choice.parcelLocalId;
    if (channelMatches && this.connectedRegionHandle === this.regionHandle) return;
    const options = { ...this.options, channel: undefined, parcelLocalId: undefined };
    await this.teardown();
    this.wanted = true;
    try {
      await this.connect(options);
      this.emit('reprovisioned', { viewerSession: this.viewerSession });
    } catch (error) {
      this.emit('reprovision_error', error);
    }
  }

  /** True while voice is stopped because the parcel does not allow it. */
  private suspended = false;

  /** The neighbouring regions that offer WebRTC voice (from the core). */
  setNeighborRegions(list: NeighborRegion[]) {
    this.neighborRegions = Array.isArray(list) ? list : [];
    this.lastNeighborSync = -Infinity;
  }

  /** Open and close the neighbour connections to match where the avatar is (`updateNeighboringRegions`). */
  private syncNeighbors() {
    const now = performance.now();
    if (now - this.lastNeighborSync < 1000) return;
    this.lastNeighborSync = now;
    const estate = this.channel.kind === 'local' && this.channel.parcelLocalId === undefined;
    const position = this.avatar.position;
    const wanted = new Set(estate && this.joined && position
      ? neighborsToJoin([position[0] + this.regionOrigin[0], position[1] + this.regionOrigin[1], position[2]], this.neighborRegions, this.connectedRegionHandle || this.regionHandle)
      : []);
    for (const [handle, connection] of [...this.neighbors]) {
      if (!wanted.has(handle)) { this.neighbors.delete(handle); void connection.close(); this.dropNeighborAudio(handle); this.dropParticipantsFrom(handle); }
    }
    for (const handle of wanted) {
      if (this.neighbors.has(handle) || (this.neighborRetryAt.get(handle) ?? 0) > now) continue;
      const connection = new VoiceNeighborConnection(handle, {
        grid: this.options.grid,
        onData: (raw, source) => this.onNeighborData(raw, source),
        onRemoteStream: (stream, source) => this.playNeighbor(stream, source),
        onLost: (source) => this.neighborLost(source),
      });
      this.neighbors.set(handle, connection);
      connection.connect().catch((error: unknown) => {
        console.warn('[VoiceManager] neighbouring region voice unavailable:', error);
        if (this.neighbors.get(handle) === connection) this.neighbors.delete(handle);
        this.neighborRetryAt.set(handle, performance.now() + 15000);
        this.emit('neighbor_error', { handle, error });
      });
    }
    this.emit('neighbors', { connected: [...this.neighbors.keys()] });
  }

  private greeted = new Set<string>();

  /** A neighbour that has just joined needs our position straight away. */
  private greetNeighbors() {
    for (const [handle, connection] of this.neighbors) {
      if (connection.isOpen && !this.greeted.has(handle)) { this.greeted.add(handle); this.spatialDirty = true; }
    }
    for (const handle of [...this.greeted]) if (!this.neighbors.has(handle)) this.greeted.delete(handle);
  }

  private neighborLost(handle: string) {
    const connection = this.neighbors.get(handle);
    if (!connection) return;
    this.neighbors.delete(handle);
    void connection.close();
    this.dropNeighborAudio(handle);
    this.dropParticipantsFrom(handle);
    this.neighborRetryAt.set(handle, performance.now() + 5000);
  }

  private dropParticipantsFrom(source: string) {
    for (const [id, participant] of this.participants) if (participant.source === source) this.participants.delete(id);
  }

  private dropNeighborAudio(handle: string) {
    const audio = this.neighborAudio.get(handle);
    if (audio) { audio.srcObject = null; this.neighborAudio.delete(handle); }
  }

  private playNeighbor(stream: MediaStream, handle: string) {
    let audio = this.neighborAudio.get(handle);
    if (!audio) { audio = new Audio(); this.neighborAudio.set(handle, audio); }
    audio.autoplay = true;
    audio.volume = this.speakerVolume;
    audio.srcObject = stream;
    void audio.play().catch(() => {});
  }

  private onNeighborData(raw: string, source: string) {
    let changed = false;
    for (const update of parseVoiceData(raw)) changed = this.applyUpdate(update, source) || changed;
    if (changed) this.emitSpeakers();
  }

  /** Close every neighbour connection (the avatar changed region, or voice stopped). */
  private async closeNeighbors() {
    const all = [...this.neighbors.values()];
    this.neighbors.clear();
    this.neighborRetryAt.clear();
    for (const handle of [...this.neighborAudio.keys()]) this.dropNeighborAudio(handle);
    await Promise.all(all.map((c) => c.close()));
  }

  async disconnect() {
    this.wanted = false;
    this.clearRetryTimer();
    this.retryAttempts = 0;
    this.retry.reset();
    await this.teardown();
    this.setState('off');
  }

  private async teardown() {
    this.stopTimers();
    this.joined = false;
    this.participants.clear();
    await this.closeNeighbors();
    if (this.peer) this.peer.onconnectionstatechange = null;
    if (this.dataChannel) { this.dataChannel.onopen = null; this.dataChannel.onmessage = null; this.dataChannel.onclose = null; try { this.dataChannel.close(); } catch { /* closed */ } }
    this.dataChannel = null;
    this.peer?.close(); this.peer = null;
    if (this.localSource) { try { this.localSource.disconnect(); } catch { /* ignore */ } this.localSource = null; }
    this.localAnalyser = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    if (this.remoteAudio) { this.remoteAudio.srcObject = null; this.remoteAudio = null; }
    const session = this.viewerSession; this.viewerSession = '';
    if (session) await slBridge.voiceLogout(session).catch(() => {});
    this.lastSpatialSent = -Infinity;
  }

  // ---- data channel -------------------------------------------------------------------------------

  private send(json: string) {
    if (this.dataChannel?.readyState === 'open') this.dataChannel.send(json);
  }

  /** To the primary connection and every neighbour. */
  private sendEverywhere(json: string) {
    this.send(json);
    for (const connection of this.neighbors.values()) connection.send(json);
  }

  private onDataChannelOpen() {
    // As in the viewer: join, then declare the connection primary (it is for our own region).
    this.send(joinMessage(false));
    this.send(joinMessage(true));
    this.joined = true;
    // VOICE_STATE_SESSION_UP: a working session starts the retry schedule over.
    this.retry.reset();
    this.retryAttempts = 0;
    this.applyMic();
    if (this.channel.kind === 'local') { this.spatialDirty = true; this.sendSpatial(true); this.spatialTimer ||= setInterval(() => { this.syncNeighbors(); this.greetNeighbors(); this.sendSpatial(false); }, POSITION_UPDATE_THROTTLE_MS); }
    this.startAnalysis();
  }

  private onData(raw: string) {
    let changed = false;
    for (const update of parseVoiceData(raw)) changed = this.applyUpdate(update, 'primary') || changed;
    if (changed) this.emitSpeakers();
  }

  /** Whether the mute list silences this person's voice. */
  setVoiceMuteChecker(check: ((id: string) => boolean) | null) { this.isVoiceMuted = check ?? undefined; }
  private isVoiceMuted: ((id: string) => boolean) | undefined;

  /**
   * `source` is the connection the message came from. People are added only when their own server says so (a join marked
   * primary) or on non-spatial channels; levels and speaking come from whichever server reports them; moderator mutes and
   * departures are believed only from the server that announced the person.
   */
  private applyUpdate(update: ParticipantUpdate, source = 'primary'): boolean {
    let participant = this.participants.get(update.id);
    if (!participant && update.joined && (update.primary || this.channel.kind !== 'local')) {
      participant = { id: update.id, source, level: 0, speaking: false, moderatorMuted: false };
      this.participants.set(update.id, participant);
      // Someone on the mute list with voice muted starts muted for us (`LLVoiceWebRTCConnection::OnDataReceivedImpl`).
      if (!this.userMutes.has(update.id) && this.isVoiceMuted?.(update.id)) this.userMutes.set(update.id, true);
      // Re-apply what the resident chose for this person (the viewer does the same on join).
      if (this.userMutes.get(update.id)) this.send(muteMessage({ [update.id]: true }));
      const gain = this.userGains.get(update.id);
      if (gain !== undefined) this.send(userGainMessage({ [update.id]: gain }));
    }
    if (!participant) return false;
    if (update.left) {
      if (participant.source !== source) return false; // a neighbour saying goodbye to someone who lives elsewhere
      if (update.id !== this.selfId) this.participants.delete(update.id);
      return true;
    }
    if (update.level !== undefined) participant.level = update.level;
    if (update.speaking !== undefined) participant.speaking = update.speaking;
    if (update.moderatorMuted !== undefined && participant.source === source) participant.moderatorMuted = update.moderatorMuted;
    return true;
  }

  // ---- microphone and playback --------------------------------------------------------------------

  private applyMic() {
    const live = this.joined && !this.muted;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = live; });
  }

  /**
   * The microphone button. With push-to-talk on (the viewer's default) it is the viewer's mic toggle: it sets the
   * push-to-talk state. With push-to-talk off it is the plain mute switch.
   */
  setMuted(muted: boolean) {
    if (this.usePtt) this.pttState = !muted;
    else this.muteMic = muted;
    this.updateMicMuteLogic();
  }

  // ---- push-to-talk (`LLVoiceClient::updateMicMuteLogic`, `inputUserControlState`, ...) -----------------

  private muteMic = false;
  private usePtt = true;
  private pttToggle = false;
  private pttState = false;

  /** `LLVoiceClient::updateMicMuteLogic`: with push-to-talk the mic is open only while the user state is on; a mute always wins. */
  private updateMicMuteLogic() {
    const muted = this.muteMic || (this.usePtt && !this.pttState);
    const changed = muted !== this.muted;
    this.muted = muted;
    this.applyMic();
    this.emit('state', { state: this.state, message: '', muted });
    if (changed) this.emit('mute_changed', { muted });
    this.emit('ptt_changed', { usePtt: this.usePtt, toggle: this.pttToggle, talking: this.pttState });
  }

  /** `setUsePTT`: turning push-to-talk on closes the mic. */
  setUsePtt(use: boolean) {
    if (use && !this.usePtt) this.pttState = false;
    this.usePtt = use;
    this.updateMicMuteLogic();
  }

  /** `setPTTIsToggle`: switching toggle mode off closes the mic. */
  setPttToggle(toggle: boolean) {
    if (!toggle && this.pttToggle) this.pttState = false;
    this.pttToggle = toggle;
    this.updateMicMuteLogic();
  }

  getUsePtt() { return this.usePtt; }
  getPttToggle() { return this.pttToggle; }
  getUserPttState() { return this.pttState; }

  setUserPttState(talking: boolean) {
    this.pttState = talking;
    this.updateMicMuteLogic();
  }

  toggleUserPttState() { this.setUserPttState(!this.pttState); }

  /** `inputUserControlState`: the push-to-talk key or button went down or up. Toggle mode flips on press; otherwise the state follows the key. */
  inputUserControlState(down: boolean) {
    if (this.pttToggle) {
      if (down) this.toggleUserPttState();
    } else {
      this.setUserPttState(down);
    }
  }

  /** Playback level of the whole voice stream, 0..1 (the viewer's `setReceiveVolume`). */
  setSpeakerVolume(volume: number) {
    this.speakerVolume = Math.max(0, Math.min(1, volume));
    if (this.remoteAudio) this.remoteAudio.volume = this.speakerVolume;
    for (const audio of this.neighborAudio.values()) audio.volume = this.speakerVolume;
  }

  /** Per-person playback gain 0..1, applied by the voice server (`ug`). */
  setUserVolume(id: string, volume: number) {
    const key = id.toLowerCase();
    this.userGains.set(key, volume);
    this.sendEverywhere(userGainMessage({ [key]: volume }));
  }

  /** Mute one person for yourself (`m`). */
  setUserMuted(id: string, muted: boolean) {
    const key = id.toLowerCase();
    this.userMutes.set(key, muted);
    this.sendEverywhere(muteMessage({ [key]: muted }));
  }

  /** Send the output to a specific speaker, where the browser supports it. */
  async setOutputDevice(deviceId: string) {
    const audio = this.remoteAudio as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (audio?.setSinkId) await audio.setSinkId(deviceId);
    for (const neighbor of this.neighborAudio.values()) {
      const sink = neighbor as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
      if (sink.setSinkId) await sink.setSinkId(deviceId);
    }
  }

  private playRemote(stream: MediaStream) {
    this.remoteAudio ||= new Audio();
    this.remoteAudio.autoplay = true;
    this.remoteAudio.volume = this.speakerVolume;
    this.remoteAudio.srcObject = stream;
    void this.remoteAudio.play().catch(() => {});
  }

  // ---- positions ----------------------------------------------------------------------------------

  /** Global metres of the current region's south-west corner; positions below are region-local. */
  setRegionOrigin(origin: [number, number]) {
    this.regionOrigin = origin;
    this.regionHandle = regionHandleFor(origin);
    this.spatialDirty = true;
  }

  setEarLocation(location: EarLocation) { this.earLocation = location; this.spatialDirty = true; }

  /** Region-local poses. Rotations are SL-frame quaternions [x, y, z, w]. */
  updateSpatial(pose: { avatarPosition?: Vec3; avatarRotation?: Quat; cameraPosition?: Vec3; cameraRotation?: Quat }) {
    if (pose.avatarPosition) this.avatar.position = pose.avatarPosition;
    if (pose.avatarRotation) this.avatar.rotation = pose.avatarRotation;
    if (pose.cameraPosition) this.camera.position = pose.cameraPosition;
    if (pose.cameraRotation) this.camera.rotation = pose.cameraRotation;
    this.spatialDirty = true;
  }

  /** Kept for callers that only know the avatar's position. */
  updateListenerPosition(position: [number, number, number]) { this.updateSpatial({ avatarPosition: position }); }

  /** Where another avatar is, for distance in the speaker list. Not sent to the server. */
  setSpeakerPosition(speakerId: string, position: [number, number, number], name?: string) {
    const key = speakerId.toLowerCase();
    this.positions.set(key, position);
    if (name) this.names.set(key, name);
  }

  private sendSpatial(force: boolean) {
    const now = performance.now();
    if ((!this.spatialDirty && !force) || now - this.lastSpatialSent < POSITION_UPDATE_THROTTLE_MS) return;
    const { position, rotation } = this.avatar;
    // Never invent a pose: wait until both position and rotation have come from the simulator.
    if (!position || !rotation) return;
    const [ox, oy] = this.regionOrigin;
    const global = (v: Vec3): Vec3 => [v[0] + ox, v[1] + oy, v[2]];
    const head = global([position[0], position[1], position[2] + 1]); // the viewer sends head height
    const wantsCamera = this.earLocation !== EarLocation.Avatar && this.camera.position && this.camera.rotation;
    const ear = earPose(wantsCamera ? this.earLocation : EarLocation.Avatar, { position: head, rotation },
      { position: global(this.camera.position ?? position), rotation: this.camera.rotation ?? rotation });
    const message = spatialMessage({ avatarPosition: head, avatarRotation: rotation, listenerPosition: ear.position, listenerRotation: ear.rotation });
    this.sendEverywhere(message);
    this.spatialDirty = false;
    this.lastSpatialSent = now;
  }

  // ---- speakers -----------------------------------------------------------------------------------

  private distanceTo(id: string): number | undefined {
    const pos = this.positions.get(id);
    const me = this.avatar.position;
    return pos && me ? Math.hypot(pos[0] - me[0], pos[1] - me[1], pos[2] - me[2]) : undefined;
  }

  getActiveSpeakers(): SpeakerInfo[] {
    return [...this.participants.values()].map((p) => ({
      id: p.id, name: this.names.get(p.id), speaking: p.speaking, energy: p.level,
      position: this.positions.get(p.id), distance: this.distanceTo(p.id), moderatorMuted: p.moderatorMuted, active: true,
    }));
  }

  isSpeaking(speakerId: string): boolean {
    const key = speakerId.toLowerCase();
    if (speakerId === 'local_mic') return Boolean(this.selfId && this.participants.get(this.selfId)?.speaking);
    return Boolean(this.participants.get(key)?.speaking);
  }

  getSpeakerEnergy(speakerId: string): number {
    return this.participants.get(speakerId.toLowerCase())?.level ?? 0;
  }

  private localEnergy = 0;

  /** Emit the current speaker list, including the microphone meter when unmuted. */
  analyzeSpeakers() {
    if (this.localAnalyser && !this.muted) {
      const data = new Uint8Array(this.localAnalyser.fftSize);
      this.localAnalyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) { const s = (v - 128) / 128; sum += s * s; }
      this.localEnergy = Math.sqrt(sum / data.length);
    } else this.localEnergy = 0;
    this.emitSpeakers();
  }

  private emitSpeakers() {
    const speakers = this.getActiveSpeakers();
    if (!this.muted && this.localAnalyser) {
      speakers.push({ id: 'local_mic', name: 'Me', speaking: this.isSpeaking('local_mic'), energy: this.localEnergy, active: true });
    }
    this.emit('speaking', { speakers });
  }

  private startLocalMeter() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx || !this.stream) return;
      this.audioContext ||= new Ctx({ latencyHint: 'interactive' });
      this.localSource = this.audioContext.createMediaStreamSource(this.stream);
      this.localAnalyser = this.audioContext.createAnalyser();
      this.localAnalyser.fftSize = 256;
      this.localSource.connect(this.localAnalyser);
    } catch (error) {
      console.warn('[VoiceManager] microphone meter unavailable:', error);
    }
  }

  private startAnalysis() {
    this.analysisTimer ||= setInterval(() => { if (this.localAnalyser) this.analyzeSpeakers(); }, 100);
  }

  private stopTimers() {
    if (this.analysisTimer) clearInterval(this.analysisTimer);
    if (this.spatialTimer) clearInterval(this.spatialTimer);
    this.analysisTimer = null; this.spatialTimer = null;
  }
}
