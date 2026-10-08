import { Utils } from './utils';
import { slBridge } from './sl-bridge';
import {
  DATA_CHANNEL_LABEL, EarLocation, POSITION_UPDATE_THROTTLE_MS, earPose, iceServersForGrid, joinMessage, mungeOpusSdp,
  muteMessage, parseVoiceData, provisionBody, signalingBody, spatialMessage, userGainMessage,
  type ParticipantUpdate, type Quat, type Vec3, type VoiceChannel,
} from './voice-protocol';

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
 * What is not done: reconnect with back-off after a drop, cross-region (neighbouring) connections,
 * push-to-talk, and the mute click-fade. Nothing here has been run against a live voice server.
 */
export class VoiceManager extends Utils.EventEmitter {
  state: VoiceState = 'off';
  muted = true;

  private peer: RTCPeerConnection | null = null;
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
    this.options = options;
    this.channel = options.channel ?? { kind: 'local', parcelLocalId: options.parcelLocalId };
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
        else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') this.setState('error', `WebRTC ${peer.connectionState}`);
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
      await this.disconnect();
      this.setState('error', error instanceof Error ? error.message : 'Voice connection failed');
      throw error;
    }
  }

  /**
   * The parcel or region changed. The viewer starts a new session on the new channel, so this tears
   * the connection down and connects again with the same options, keeping the mute state.
   */
  async reprovision(parcelLocalId?: number) {
    if (this.state !== 'connected' && this.state !== 'connecting') return;
    if (this.channel.kind === 'local' && this.channel.parcelLocalId === parcelLocalId) return;
    const options = { ...this.options, channel: undefined, parcelLocalId };
    await this.disconnect();
    try {
      await this.connect(options);
      this.emit('reprovisioned', { parcelLocalId, viewerSession: this.viewerSession });
    } catch (error) {
      this.emit('reprovision_error', error);
    }
  }

  async disconnect() {
    this.stopTimers();
    this.joined = false;
    this.participants.clear();
    if (this.dataChannel) { this.dataChannel.onopen = null; this.dataChannel.onmessage = null; try { this.dataChannel.close(); } catch { /* closed */ } }
    this.dataChannel = null;
    this.peer?.close(); this.peer = null;
    if (this.localSource) { try { this.localSource.disconnect(); } catch { /* ignore */ } this.localSource = null; }
    this.localAnalyser = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    if (this.remoteAudio) { this.remoteAudio.srcObject = null; this.remoteAudio = null; }
    const session = this.viewerSession; this.viewerSession = '';
    if (session) await slBridge.voiceLogout(session).catch(() => {});
    this.lastSpatialSent = -Infinity;
    this.setState('off');
  }

  // ---- data channel -------------------------------------------------------------------------------

  private send(json: string) {
    if (this.dataChannel?.readyState === 'open') this.dataChannel.send(json);
  }

  private onDataChannelOpen() {
    // As in the viewer: join, then declare the connection primary (it is for our own region).
    this.send(joinMessage(false));
    this.send(joinMessage(true));
    this.joined = true;
    this.applyMic();
    if (this.channel.kind === 'local') { this.spatialDirty = true; this.sendSpatial(true); this.spatialTimer ||= setInterval(() => this.sendSpatial(false), POSITION_UPDATE_THROTTLE_MS); }
    this.startAnalysis();
  }

  private onData(raw: string) {
    let changed = false;
    for (const update of parseVoiceData(raw)) changed = this.applyUpdate(update) || changed;
    if (changed) this.emitSpeakers();
  }

  private applyUpdate(update: ParticipantUpdate): boolean {
    let participant = this.participants.get(update.id);
    if (!participant && update.joined && (update.primary || this.channel.kind !== 'local')) {
      participant = { id: update.id, level: 0, speaking: false, moderatorMuted: false };
      this.participants.set(update.id, participant);
      // Re-apply what the resident chose for this person (the viewer does the same on join).
      if (this.userMutes.get(update.id)) this.send(muteMessage({ [update.id]: true }));
      const gain = this.userGains.get(update.id);
      if (gain !== undefined) this.send(userGainMessage({ [update.id]: gain }));
    }
    if (!participant) return false;
    if (update.left) { if (update.id !== this.selfId) this.participants.delete(update.id); return true; }
    if (update.level !== undefined) participant.level = update.level;
    if (update.speaking !== undefined) participant.speaking = update.speaking;
    if (update.moderatorMuted !== undefined) participant.moderatorMuted = update.moderatorMuted;
    return true;
  }

  // ---- microphone and playback --------------------------------------------------------------------

  private applyMic() {
    const live = this.joined && !this.muted;
    this.stream?.getAudioTracks().forEach((track) => { track.enabled = live; });
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMic();
    this.emit('state', { state: this.state, message: '', muted });
    this.emit('mute_changed', { muted });
  }

  /** Playback level of the whole voice stream, 0..1 (the viewer's `setReceiveVolume`). */
  setSpeakerVolume(volume: number) {
    this.speakerVolume = Math.max(0, Math.min(1, volume));
    if (this.remoteAudio) this.remoteAudio.volume = this.speakerVolume;
  }

  /** Per-person playback gain 0..1, applied by the voice server (`ug`). */
  setUserVolume(id: string, volume: number) {
    const key = id.toLowerCase();
    this.userGains.set(key, volume);
    this.send(userGainMessage({ [key]: volume }));
  }

  /** Mute one person for yourself (`m`). */
  setUserMuted(id: string, muted: boolean) {
    const key = id.toLowerCase();
    this.userMutes.set(key, muted);
    this.send(muteMessage({ [key]: muted }));
  }

  /** Send the output to a specific speaker, where the browser supports it. */
  async setOutputDevice(deviceId: string) {
    const audio = this.remoteAudio as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
    if (audio?.setSinkId) await audio.setSinkId(deviceId);
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
  setRegionOrigin(origin: [number, number]) { this.regionOrigin = origin; this.spatialDirty = true; }

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
    this.send(spatialMessage({ avatarPosition: head, avatarRotation: rotation, listenerPosition: ear.position, listenerRotation: ear.rotation }));
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
