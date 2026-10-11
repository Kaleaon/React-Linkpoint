import { Utils } from './utils';
import {
  AttachedSounds,
  AudioType,
  DEFAULT_AUDIO_LEVELS,
  DEFAULT_AUDIO_MUTES,
  NULL_UUID,
  REFERENCE_DISTANCE,
  ROLLOFF_FACTOR,
  UNDERWATER_ROLLOFF_FACTOR,
  UI_SOUNDS,
  categoryGain,
  isBeyondCutOff,
  shouldPlayTrigger,
  triggerGlobalPosition,
  type AttachedSoundAction,
  type AudioLevels,
  type AudioMutes,
  type SoundPolicy,
  type UiSoundName,
  type Vec3,
} from './sound-standards';

type SoundEvent = {
  action: string;
  soundId?: string;
  objectId?: string;
  ownerId?: string;
  parentId?: string;
  position?: number[];
  handle?: string;
  gain?: number;
  flags?: number;
  radius?: number;
  sounds?: Array<{ soundId: string }>;
};

interface AttachedPlayback {
  soundId: string;
  gain: number;
  loop: boolean;
  syncMaster: boolean;
  syncSlave: boolean;
}

export interface SoundObjectPose {
  position: Vec3;
  /** Attachment cut-off/parcel tests use the avatar position, not the joint offset. */
  policyPosition?: Vec3;
  avatarId?: string;
  hud?: boolean;
  unavailable?: boolean;
}

interface Playing {
  objectId: string;
  gain: GainNode;
  mute: GainNode;
  panner: PannerNode;
  source: AudioBufferSourceNode | null;
  soundId: string;
  loop: boolean;
  muted: boolean;
  syncMaster: boolean;
  syncSlave: boolean;
  syncPending: boolean;
  syncMasterId: string | null;
  startedAt: number | null;
  duration: number;
  loading: boolean;
  /** Sounds waiting for the current one to finish (the QUEUE flag). */
  queue: AttachedPlayback[];
}

/**
 * Web Audio renderer for Second Life sounds, following the official viewer's rules (see
 * `sound-standards.ts` for sources): SoundTrigger filtering, per-object attached sounds with loop,
 * queue and stop flags, gain changes, cut-off radius, parcel and mute rules, per-category levels
 * (master x SFX / UI / ambient), OpenAL's default inverse-distance rolloff, and UI sounds.
 *
 * Synchronized slaves wait for the highest-priority audible master's loop boundary. Object poses
 * may be resolved by the world to include linksets, attachment joints and HUDs.
 * Doppler (Web Audio has none) and footsteps are not implemented. Not exercised against a live grid.
 */
export class AudioManager extends Utils.EventEmitter {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private categories = new Map<AudioType, GainNode>();
  private buffers = new Map<string, AudioBuffer>();
  private waiting = new Map<string, Array<() => void>>();
  private requested = new Set<string>();
  private playing = new Map<string, Playing>();
  private oneShots = new Map<AudioBufferSourceNode, () => void>();
  private sessionToken = 0;
  private positions = new Map<string, Vec3>();
  private radii = new Map<string, number>();
  private owners = new Map<string, string>();
  /**
   * Per object: advanced whenever a stop, removal or replacing sound supersedes what was asked for, so a
   * sound still waiting on its download is dropped instead of playing late.
   */
  private epochs = new Map<string, number>();
  private attached: AttachedSounds;
  private levels: AudioLevels = { ...DEFAULT_AUDIO_LEVELS };
  private mutes: AudioMutes = { ...DEFAULT_AUDIO_MUTES };
  private policy: SoundPolicy;
  private regionOrigin: [number, number] = [0, 0];
  private listener: { position: Vec3; forward: Vec3; up: Vec3 } | null = null;
  private underwater = false;
  private muteTimer: ReturnType<typeof setInterval> | null = null;
  private initialised = false;
  private objectPose: ((id: string) => SoundObjectPose | null) | null = null;

  constructor(
    private protocol: {
      on: (event: string, listener: Function) => void;
      fetchSound?: (id: string) => Promise<void>;
    },
  ) {
    super();
    this.policy = {
      agentId: '',
      isMuted: () => false,
      ownerSoundsMuted: () => false,
      canHearAt: () => true,
      canAccessMaturityAt: () => true,
      enableGestureSounds: true,
      enableCollisionSounds: true,
      isCollisionSound: () => false,
    };
    this.attached = new AttachedSounds(
      () => Date.now(),
      (id) => this.positions.has(id),
    );
  }

  init() {
    if (this.initialised) return;
    this.initialised = true;
    this.protocol.on('scene:sound-asset', (asset: any) => void this.acceptAsset(asset));
    this.protocol.on('scene:sound-event', (event: SoundEvent) => this.acceptEvent(event));
    const seen = (object: any) => {
      if (!object?.id || !Array.isArray(object.position)) return;
      const id = String(object.id);
      const known = this.positions.has(id);
      this.positions.set(id, object.position as Vec3);
      const live = this.playing.get(id);
      if (live) this.place(live, object.position as Vec3);
      if (!known) this.run(this.attached.objectArrived(id));
      this.refreshMutes(); // moving an avatar/root also moves sounds on its children
    };
    this.protocol.on('scene:object-add', seen);
    this.protocol.on('scene:object-update', seen);
    this.protocol.on('scene:object-remove', (object: any) => {
      const id = String(object.id);
      this.positions.delete(id);
      this.radii.delete(id);
      this.owners.delete(id);
      this.attached.remove(id);
      this.stopObject(id, true);
    });
    this.protocol.on('disconnected', () => this.stopAll());
    const unlock = () => {
      void this.context?.resume()?.catch((error: unknown) => this.emit('error', { error }));
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
  }

  // ---- settings ----------------------------------------------------------------------------------

  /** Master level 0..1 (`AudioLevelMaster`). */
  setVolume(value: number) {
    this.setLevels({ master: value });
  }

  setLevels(levels: Partial<AudioLevels>) {
    Object.assign(this.levels, levels);
    this.applyLevels();
  }
  setMutes(mutes: Partial<AudioMutes>) {
    Object.assign(this.mutes, mutes);
    this.applyLevels();
  }
  getLevels(): Readonly<AudioLevels> {
    return this.levels;
  }

  /** Mute list, parcel, maturity and "enable gesture / collision sounds" settings. */
  setPolicy(policy: Partial<SoundPolicy>) {
    Object.assign(this.policy, policy);
    this.refreshMutes();
  }
  setSelfId(id: string) {
    this.policy.agentId = id;
  }

  setObjectPoseResolver(resolve: (id: string) => SoundObjectPose | null) {
    this.objectPose = resolve;
  }

  private pose(id: string): SoundObjectPose | null {
    return (
      this.objectPose?.(id) ??
      (this.positions.has(id) ? { position: this.positions.get(id)! } : null)
    );
  }

  /** Global metres of the current region's south-west corner; positions from the scene are region-local. */
  setRegionOrigin(origin: [number, number]) {
    this.regionOrigin = origin;
  }

  /**
   * Where the ear is, region-local. The viewer's default is the camera (`MediaSoundsEarLocation` 0).
   * `forward` and `up` are SL-frame vectors; they default to looking north with up as +Z.
   */
  setListener(pose: { position: Vec3; forward?: Vec3; up?: Vec3 }) {
    this.listener = {
      position: pose.position,
      forward: pose.forward ?? [0, 1, 0],
      up: pose.up ?? [0, 0, 1],
    };
    const ctx = this.context;
    if (ctx) {
      const l = ctx.listener;
      const [x, y, z] = toAudio(this.listener.position);
      const [fx, fy, fz] = toAudio(this.listener.forward);
      const [ux, uy, uz] = toAudio(this.listener.up);
      if (l.positionX) {
        l.positionX.value = x;
        l.positionY.value = y;
        l.positionZ.value = z;
        l.forwardX.value = fx;
        l.forwardY.value = fy;
        l.forwardZ.value = fz;
        l.upX.value = ux;
        l.upY.value = uy;
        l.upZ.value = uz;
      }
    }
    this.refreshMutes();
  }

  /** The viewer raises rolloff to 5 when the camera is under water. */
  setUnderwater(underwater: boolean) {
    this.underwater = underwater;
    const rolloff = underwater ? UNDERWATER_ROLLOFF_FACTOR : ROLLOFF_FACTOR;
    for (const p of this.playing.values()) p.panner.rolloffFactor = rolloff;
  }

  private audioContext() {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'interactive' });
      this.master = this.context.createGain();
      this.master.connect(this.context.destination);
      for (const type of [AudioType.Sfx, AudioType.Ui, AudioType.Ambient]) {
        const node = this.context.createGain();
        node.connect(this.master);
        this.categories.set(type, node);
      }
      this.applyLevels();
      if (this.listener) this.setListener(this.listener);
    }
    return this.context;
  }

  private applyLevels() {
    if (!this.master) return;
    // The master is applied once; each category carries only its own level (the viewer's secondary gain).
    this.master.gain.value = this.mutes.all ? 0 : Math.max(0, Math.min(1, this.levels.master));
    for (const [type, node] of this.categories)
      node.gain.value = categoryGain(
        type,
        { ...this.levels, master: 1 },
        { ...this.mutes, all: false },
      );
  }

  // ---- assets ------------------------------------------------------------------------------------

  private async acceptAsset(asset: any) {
    if (!asset?.assetId || !asset.data) return;
    const token = this.sessionToken;
    try {
      const bytes = Uint8Array.from(atob(asset.data), (char) => char.charCodeAt(0));
      const buffer = await this.audioContext().decodeAudioData(bytes.buffer);
      this.buffers.set(asset.assetId, buffer);
      for (const resume of this.waiting.get(asset.assetId) ?? []) resume();
      this.waiting.delete(asset.assetId);
    } catch (error) {
      if (token === this.sessionToken) {
        this.requested.delete(asset.assetId);
        this.waiting.delete(asset.assetId);
      }
      this.emit('error', { assetId: asset.assetId, error });
    }
  }

  /** Run `play` once the sound is decoded, requesting it first if nobody has. */
  private whenLoaded(soundId: string, play: () => void) {
    if (this.buffers.has(soundId)) {
      play();
      return;
    }
    this.waiting.set(soundId, [...(this.waiting.get(soundId) ?? []), play]);
    if (!this.requested.has(soundId)) {
      this.requested.add(soundId);
      const token = this.sessionToken;
      void this.protocol.fetchSound?.(soundId)?.catch?.(() => {
        if (token !== this.sessionToken) return;
        this.requested.delete(soundId);
        this.waiting.delete(soundId);
      });
    }
  }

  // ---- events ------------------------------------------------------------------------------------

  private acceptEvent(event: SoundEvent) {
    switch (event.action) {
      case 'trigger':
        this.trigger(event);
        break;
      case 'attached': {
        const objectId = String(event.objectId);
        if (Array.isArray(event.position) && !this.positions.has(objectId))
          this.positions.set(objectId, event.position as unknown as Vec3);
        if (typeof event.radius === 'number') this.radii.set(objectId, event.radius);
        if (event.ownerId) this.owners.set(objectId, event.ownerId);
        if (this.policy.ownerSoundsMuted(event.ownerId ?? '') || this.policy.isMuted(objectId))
          return; // set_attached_sound
        this.run(
          this.attached.apply(objectId, {
            soundId: event.soundId || NULL_UUID,
            ownerId: event.ownerId ?? '',
            gain: event.gain ?? 1,
            flags: event.flags ?? 0,
          }),
        );
        break;
      }
      case 'gain': {
        const gain = this.attached.gainChange(String(event.objectId), event.gain ?? 0);
        const live = this.playing.get(String(event.objectId));
        if (gain !== null && live)
          live.gain.gain.setTargetAtTime(gain, this.audioContext().currentTime, 0.02);
        this.refreshMutes();
        break;
      }
      case 'stop':
        this.stopObject(String(event.objectId));
        break;
      case 'preload':
        break; // the host already starts the download
    }
  }

  private trigger(event: SoundEvent) {
    if (!event.soundId || !Array.isArray(event.position)) return;
    const trigger = {
      soundId: event.soundId,
      objectId: String(event.objectId ?? ''),
      ownerId: String(event.ownerId ?? ''),
      parentId: event.parentId,
      position: event.position as unknown as Vec3,
      handle: event.handle,
    };
    if (!shouldPlayTrigger(trigger, this.policy)) return;
    const [ox, oy] = this.regionOrigin;
    const global = triggerGlobalPosition(trigger);
    const local: Vec3 =
      event.handle === undefined ? global : [global[0] - ox, global[1] - oy, global[2]];
    const gain = Math.max(0, Math.min(1, event.gain ?? 1));
    this.whenLoaded(event.soundId, () =>
      this.playOneShot(event.soundId!, gain, local, AudioType.Sfx),
    );
  }

  private playOneShot(soundId: string, gain: number, position: Vec3 | null, type: AudioType) {
    const ctx = this.audioContext();
    const buffer = this.buffers.get(soundId);
    const out = this.categories.get(type);
    if (!buffer || !out) return;
    const source = ctx.createBufferSource();
    const level = ctx.createGain();
    level.gain.value = gain;
    source.buffer = buffer;
    source.connect(level);
    const panner = position ? this.makePanner(ctx, position) : null;
    if (panner) {
      level.connect(panner).connect(out);
    } else level.connect(out);
    const cleanup = () => {
      source.onended = null;
      source.disconnect();
      level.disconnect();
      panner?.disconnect();
      this.oneShots.delete(source);
    };
    this.oneShots.set(source, cleanup);
    source.onended = cleanup;
    source.start();
  }

  private makePanner(ctx: AudioContext, position: Vec3): PannerNode {
    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    // OpenAL's default model, which the viewer uses: inverse distance, clamped at the reference distance.
    panner.distanceModel = 'inverse';
    panner.refDistance = REFERENCE_DISTANCE;
    panner.rolloffFactor = this.underwater ? UNDERWATER_ROLLOFF_FACTOR : ROLLOFF_FACTOR;
    this.setPannerPosition(panner, position);
    return panner;
  }

  private setPannerPosition(panner: PannerNode, position: Vec3) {
    const [x, y, z] = toAudio(position);
    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    }
  }

  /** A UI sound (`UISnd*`): not positional, on the UI level. */
  playUi(name: UiSoundName) {
    if (this.mutes.ui) return;
    const id = UI_SOUNDS[name];
    this.whenLoaded(id, () => this.playOneShot(id, 1, null, AudioType.Ui));
  }

  // ---- attached sounds ---------------------------------------------------------------------------

  private epoch(objectId: string) {
    return this.epochs.get(objectId) ?? 0;
  }
  private supersede(objectId: string) {
    this.epochs.set(objectId, this.epoch(objectId) + 1);
  }

  private run(actions: AttachedSoundAction[]) {
    for (const action of actions) {
      if (action.type === 'cleanup') this.stopObject(action.objectId, true);
      else if (action.type === 'stop') this.stopObject(action.objectId);
      else {
        if (action.stopFirst) this.supersede(action.objectId); // a non-queued sound replaces any still downloading
        // Reserve the current/queue slots in message order, not download order.
        this.startAttached(action);
      }
    }
  }

  private startAttached(action: Extract<AttachedSoundAction, { type: 'play' }>) {
    const ctx = this.audioContext();
    const out = this.categories.get(AudioType.Sfx);
    const position = this.pose(action.objectId)?.position;
    if (!out || !position) return;
    let live = this.playing.get(action.objectId);
    if (!live) {
      const gain = ctx.createGain();
      const mute = ctx.createGain();
      const panner = this.makePanner(ctx, position);
      gain.connect(mute).connect(panner).connect(out);
      live = {
        objectId: action.objectId,
        gain,
        mute,
        panner,
        source: null,
        soundId: '',
        loop: false,
        muted: false,
        syncMaster: false,
        syncSlave: false,
        syncPending: false,
        syncMasterId: null,
        startedAt: null,
        duration: 0,
        loading: false,
        queue: [],
      };
      this.playing.set(action.objectId, live);
      this.ensureMuteTimer();
    }
    if (action.stopFirst) {
      live.queue.length = 0;
      this.stopSource(live);
    } else if (live.source || live.syncPending || live.loading) {
      // LLAudioSource::addAudioData has one FIFO slot, and ignores the same looping sound.
      if (!live.queue.length && !(live.loop && live.soundId === action.soundId)) {
        live.queue.push(action);
        this.whenLoaded(action.soundId, () => {}); // preload the one pending FIFO slot
      }
      return;
    }
    this.playOn(live, action);
    this.refreshMutes();
  }

  private playOn(live: Playing, playback: AttachedPlayback) {
    const { soundId, gain, loop } = playback;
    if (this.playing.get(live.objectId) !== live) return; // the object was cleaned up while this waited
    const buffer = this.buffers.get(soundId);
    live.gain.gain.value = gain;
    live.soundId = soundId;
    live.loop = loop;
    live.syncMaster = playback.syncMaster;
    live.syncSlave = playback.syncSlave;
    live.syncPending = playback.syncSlave;
    live.duration = buffer?.duration ?? 0;
    live.loading = !buffer;
    live.startedAt = null;
    live.syncMasterId = null;
    if (!buffer) {
      const epoch = this.epoch(live.objectId);
      this.whenLoaded(soundId, () => {
        if (this.epoch(live.objectId) === epoch) this.playOn(live, playback);
        this.refreshMutes();
      });
      return;
    }
    if (!live.syncSlave) this.startSource(live, this.audioContext().currentTime);
  }

  private startSource(live: Playing, when: number) {
    const source = this.audioContext().createBufferSource();
    source.buffer = this.buffers.get(live.soundId)!;
    source.loop = live.loop;
    source.connect(live.gain);
    live.source = source;
    live.startedAt = when;
    source.onended = () => {
      if (live.source !== source) return;
      source.disconnect();
      live.source = null;
      live.syncPending = false;
      live.startedAt = null;
      const next = live.queue.shift();
      if (next) {
        this.playOn(live, next);
        this.refreshMutes();
      } else this.attached.markDone(live.objectId);
    };
    source.start(when);
  }

  /** LLAudioEngine::idle: one global master, selected by gain / max(1, distance²).
   * Web Audio schedules the loop boundary on its clock rather than polling a backend loop flag. */
  private refreshSync() {
    if (!this.context) return;
    const now = this.context.currentTime;
    let master: Playing | null = null;
    let priority = -1;
    for (const live of this.playing.values()) {
      if (
        !live.syncMaster ||
        live.muted ||
        !live.source ||
        live.duration <= 0 ||
        live.startedAt === null
      )
        continue;
      const position = this.pose(live.objectId)?.position;
      const ear = this.listener?.position;
      const distance2 =
        position && ear ? position.reduce((sum, v, axis) => sum + (v - ear[axis]) ** 2, 0) : 0;
      const p = live.gain.gain.value / Math.max(1, distance2);
      if (p > priority) {
        master = live;
        priority = p;
      }
    }
    for (const live of this.playing.values()) {
      if (!live.syncPending) continue;
      if (live.source && live.startedAt !== null && live.startedAt <= now) {
        live.syncPending = false;
        continue;
      }
      if (live.source && (live.muted || live.syncMasterId !== master?.objectId))
        this.stopSource(live);
      if (live.source || live.loading || live.muted || !master?.loop) continue;
      const start = master.startedAt!;
      const loop = Math.max(1, Math.floor((now - start) / master.duration) + 1);
      live.syncMasterId = master.objectId;
      this.startSource(live, start + loop * master.duration);
    }
  }

  private stopSource(live: Playing) {
    const source = live.source;
    live.source = null;
    live.startedAt = null;
    if (source) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already ended */
      }
      source.disconnect();
    }
  }

  private stopObject(objectId: string, cleanup = false) {
    this.supersede(objectId); // even with nothing playing yet: a sound still downloading must not start
    if (!cleanup) this.attached.markDone(objectId);
    const live = this.playing.get(objectId);
    if (!live) return;
    live.queue.length = 0;
    live.syncPending = false;
    live.loading = false;
    this.stopSource(live);
    if (cleanup) {
      try {
        live.gain.disconnect();
        live.mute.disconnect();
        live.panner.disconnect();
      } catch {
        /* ignore */
      }
      this.playing.delete(objectId);
      if (!this.playing.size) this.stopMuteTimer();
    }
    this.refreshSync();
  }

  stopAll() {
    this.sessionToken++;
    this.waiting.clear();
    this.requested.clear();
    for (const [source, cleanup] of this.oneShots) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        /* already ended */
      }
      cleanup();
    }
    for (const id of [...this.playing.keys()]) this.stopObject(id, true);
    this.attached.clear();
    this.positions.clear();
    this.radii.clear();
    this.owners.clear();
    this.epochs.clear();
    this.stopMuteTimer();
  }

  private place(live: Playing, position: Vec3) {
    this.setPannerPosition(live.panner, position);
  }

  // ---- cut-off radius, parcel and mute rules ---------------------------------------------------------

  private ensureMuteTimer() {
    this.muteTimer ||= setInterval(() => this.refreshMutes(), 250);
  }
  private stopMuteTimer() {
    if (this.muteTimer) clearInterval(this.muteTimer);
    this.muteTimer = null;
  }

  /** `LLAudioSourceVO::updateMute`: a sound is silenced beyond its cut-off radius, across a local-sound parcel, or when muted. */
  private refreshMutes() {
    if (!this.context) return;
    if (!this.listener) {
      this.refreshSync();
      return;
    }
    const ear = this.listener.position;
    const [ox, oy] = this.regionOrigin;
    for (const live of this.playing.values()) {
      const pose = this.pose(live.objectId);
      if (!pose) continue;
      this.place(live, pose.hud ? ear : pose.position);
      const position = pose.policyPosition ?? pose.position;
      const distance = Math.hypot(position[0] - ear[0], position[1] - ear[1], position[2] - ear[2]);
      const global: Vec3 = [position[0] + ox, position[1] + oy, position[2]];
      const muted =
        Boolean(pose.unavailable) ||
        isBeyondCutOff(distance, this.radii.get(live.objectId) ?? 0) ||
        !this.policy.canHearAt(global) ||
        this.policy.isMuted(live.objectId) ||
        Boolean(pose.avatarId && this.policy.isMuted(pose.avatarId)) ||
        this.policy.ownerSoundsMuted(this.owners.get(live.objectId) ?? '');
      if (muted !== live.muted) {
        live.muted = muted;
        live.mute.gain.setTargetAtTime(muted ? 0 : 1, this.context.currentTime, 0.02); // a short ramp avoids a click
        this.attached.setMuted(live.objectId, muted);
      }
    }
    this.refreshSync();
  }
}

/** SL frame (x east, y north, z up) to Web Audio (x right, y up, -z forward). */
function toAudio(v: Vec3): Vec3 {
  return [v[0], v[2], -v[1]];
}
