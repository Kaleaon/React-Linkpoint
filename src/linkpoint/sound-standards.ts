/**
 * Second Life sound rules, ported from the official viewer so object, gesture and UI sounds behave
 * the way residents expect. Pure functions and small state machines; the Web Audio side is in audio.ts.
 *
 * Sources, all from github.com/secondlife/viewer @ 7dd6de6120ce (2026-10-07):
 *  - flags: `indra/llcommon/lldefs.h` (`LL_SOUND_FLAG_*`);
 *  - message handling and filters: `indra/newview/llviewermessage.cpp`
 *    (`process_sound_trigger`, `process_attached_sound`, `process_preload_sound`, `set_attached_sound`,
 *    postponed sounds with `MAXIMUM_PLAY_DELAY` = 15 s);
 *  - attached sound state machine: `LLViewerObject::setAttachedSound` in `llviewerobject.cpp`;
 *  - cut-off radius, parcel and mute rules: `indra/newview/llaudiosourcevo.cpp`;
 *  - `canHearSound`: `LLViewerParcelMgr::canHearSound` in `llviewerparcelmgr.cpp`;
 *  - region handle: `indra/llmessage/llregionhandle.h` (`from_region_handle`);
 *  - levels, mutes and UI sound ids: `indra/newview/app_settings/settings.xml`
 *    (`AudioLevel*`, `Mute*`, `UISnd*`, `Enable*Sounds`);
 *  - rolloff / Doppler: `audio_update_volume` in `llvieweraudio.cpp`. The viewer never sets an OpenAL
 *    distance model, so OpenAL's default (inverse distance, clamped, reference distance 1) applies.
 * Not exercised against a live grid.
 */

export const SOUND_FLAG = {
  NONE: 0x0,
  LOOP: 1 << 0,
  SYNC_MASTER: 1 << 1,
  SYNC_SLAVE: 1 << 2,
  SYNC_PENDING: 1 << 3,
  QUEUE: 1 << 4,
  STOP: 1 << 5,
} as const;
export const SOUND_FLAG_SYNC_MASK =
  SOUND_FLAG.SYNC_MASTER | SOUND_FLAG.SYNC_SLAVE | SOUND_FLAG.SYNC_PENDING;

/** `LLAudioEngine::AUDIO_TYPE_*`. */
export enum AudioType {
  None = 0,
  Sfx = 1,
  Ui = 2,
  Ambient = 3,
}

export interface AudioLevels {
  master: number;
  ambient: number;
  media: number;
  mic: number;
  music: number;
  sfx: number;
  ui: number;
  voice: number;
  wind: number;
}
/** Defaults of `AudioLevel*` in settings.xml. */
export const DEFAULT_AUDIO_LEVELS: Readonly<AudioLevels> = {
  master: 1.0,
  ambient: 0.5,
  media: 0.3,
  mic: 1.0,
  music: 0.3,
  sfx: 0.5,
  ui: 0.5,
  voice: 0.5,
  wind: 0.5,
};

/** `MuteAudio`, `MuteSounds`, `MuteUI`, `MuteAmbient` and friends; all default to false. */
export interface AudioMutes {
  all: boolean;
  sounds: boolean;
  ui: boolean;
  ambient: boolean;
  music: boolean;
  media: boolean;
  voice: boolean;
}
export const DEFAULT_AUDIO_MUTES: Readonly<AudioMutes> = {
  all: false,
  sounds: false,
  ui: false,
  ambient: false,
  music: false,
  media: false,
  voice: false,
};

/** Gain for a sound of `type`: master x category level, or 0 when muted (the viewer's secondary gain). */
export function categoryGain(
  type: AudioType,
  levels: AudioLevels = DEFAULT_AUDIO_LEVELS,
  mutes: AudioMutes = DEFAULT_AUDIO_MUTES,
): number {
  if (mutes.all) return 0;
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  switch (type) {
    case AudioType.Sfx:
      return mutes.sounds ? 0 : clamp(levels.master) * clamp(levels.sfx);
    case AudioType.Ui:
      return mutes.ui ? 0 : clamp(levels.master) * clamp(levels.ui);
    case AudioType.Ambient:
      return mutes.ambient ? 0 : clamp(levels.master) * clamp(levels.ambient);
    default:
      return clamp(levels.master);
  }
}

/** `AUDIO_LEVEL_ROLLOFF` and `AUDIO_LEVEL_UNDERWATER_ROLLOFF` (`audio_update_volume`). */
export const ROLLOFF_FACTOR = 1;
export const UNDERWATER_ROLLOFF_FACTOR = 5;
/** The viewer sets Doppler to 1; Web Audio's PannerNode has no Doppler effect. */
export const DOPPLER_FACTOR = 1;
/** OpenAL default distance model parameters, which the viewer relies on. */
export const REFERENCE_DISTANCE = 1;

/** Sound that has no listener yet plays at this gain (`getAudioSource`: "arbitrary low gain"). */
export const PRELOAD_GAIN = 0.01;
/** Cut-off radii below this are treated as "off" (`LLAudioSourceVO`). */
export const MIN_CUTOFF_RADIUS = 0.1;
export const MAXIMUM_PLAY_DELAY_MS = 15_000;

// ---- settings-driven UI sounds -------------------------------------------------------------------

/** UI sound assets by their `UISnd*` setting name (default values from settings.xml). */
export const UI_SOUNDS = {
  UISndAlert: 'ed124764-705d-d497-167a-182cd9fa2e6c',
  UISndBadKeystroke: '2ca849ba-2885-4bc3-90ef-d4987a5b983a',
  UISndChatMention: '03e77cb5-592c-5b33-d271-2e46497c3fb3',
  UISndChatPing: '7dd36df6-2624-5438-f988-fdf8588a0ad9',
  UISndClick: '4c8c3c77-de8d-bde2-b9b8-32635e0fd4a6',
  UISndClickRelease: '4c8c3c77-de8d-bde2-b9b8-32635e0fd4a6',
  UISndHealthReductionF: '219c5d93-6c09-31c5-fb3f-c5fe7495c115',
  UISndHealthReductionM: 'e057c244-5768-1056-c37e-1537454eeb62',
  UISndInvalidOp: '4174f859-0d3d-c517-c424-72923dc21f65',
  UISndMoneyChangeDown: '104974e3-dfda-428b-99ee-b0d4e748d3a3',
  UISndMoneyChangeUp: '77a018af-098e-c037-51a6-178f05877c6f',
  UISndNewIncomingIMSession: '67cc2844-00f3-2b3c-b991-6418d01e1bb7',
  UISndObjectCreate: 'f4a0660f-5446-dea2-80b7-6482a082803c',
  UISndObjectDelete: '0cb7b00a-4c10-6948-84de-a93c09af2ba9',
  UISndObjectRezIn: '3c8fc726-1fd6-862d-fa01-16c5b2568db6',
  UISndRestart: 'b92a0f64-7709-8811-40c5-16afd624a45f',
  UISndSnapshot: '3d09f582-3851-c0e0-f5ba-277ac5c73fb4',
  UISndStartIM: 'c825dfbc-9827-7e02-6507-3713d18916c1',
  UISndTeleportOut: 'd7a9a565-a013-2a69-797d-5332baa1a947',
  UISndTyping: '5e191c7b-8996-9ced-a177-b2ac32bfea06',
  UISndWindowClose: '2c346eda-b60c-ab33-1119-b8941916a499',
  UISndWindowOpen: 'c80260ba-41fd-8a46-768a-6bf236360e3a',
} as const;
export type UiSoundName = keyof typeof UI_SOUNDS;

/** `UISndMoneyChangeThreshold` and `UISndHealthReductionThreshold`. */
export const UI_SOUND_THRESHOLDS = { moneyChange: 50, healthReduction: 10 } as const;

/** The money sound for a balance change, or null below the viewer's threshold. */
export function moneySoundFor(delta: number): UiSoundName | null {
  if (!Number.isFinite(delta) || Math.abs(delta) < UI_SOUND_THRESHOLDS.moneyChange) return null;
  return delta > 0 ? 'UISndMoneyChangeUp' : 'UISndMoneyChangeDown';
}

// ---- coordinates, parcels ------------------------------------------------------------------------

/** Global metres of a region's south-west corner from a SoundTrigger region handle (high word x, low word y). */
export function regionHandleToGlobal(handle: bigint | number | string): [number, number] {
  const h = BigInt.asUintN(64, BigInt(handle));
  return [Number(h >> 32n), Number(h & 0xffffffffn)];
}

export type Vec3 = readonly [number, number, number];

/**
 * `LLViewerParcelMgr::canHearSound`: hearing needs the same parcel, or neither the agent's nor the
 * source's parcel to be "local sound only".
 */
export function canHearSound(p: {
  inAgentParcel: boolean;
  agentParcelSoundLocal: boolean;
  sourceParcelSoundLocal: boolean;
}): boolean {
  if (p.inAgentParcel) return true;
  if (p.agentParcelSoundLocal) return false;
  if (p.sourceParcelSoundLocal) return false;
  return true;
}

/** `isInCutOffRadius` / the 0.1 m "off" rule: a radius below 0.1 m disables the cut-off. */
export function isBeyondCutOff(distance: number, radius: number): boolean {
  return radius >= MIN_CUTOFF_RADIUS && !(distance < radius);
}

// ---- SoundTrigger filter -------------------------------------------------------------------------

export interface TriggerEvent {
  soundId: string;
  objectId: string;
  ownerId: string;
  parentId?: string;
  /** Region-local position and the region handle, or an already-global position. */
  position: Vec3;
  handle?: bigint | number | string;
}

export interface SoundPolicy {
  agentId: string;
  /** Mute list lookups. `ownerSoundsMuted` is the "object sounds" flag for that owner. */
  isMuted(id: string): boolean;
  ownerSoundsMuted(ownerId: string): boolean;
  canHearAt(global: Vec3): boolean;
  /** Region maturity check; true when unknown. */
  canAccessMaturityAt(global: Vec3): boolean;
  enableGestureSounds: boolean;
  enableCollisionSounds: boolean;
  isCollisionSound(soundId: string): boolean;
}

/** Global position of a SoundTrigger. */
export function triggerGlobalPosition(event: TriggerEvent): Vec3 {
  if (event.handle === undefined) return event.position;
  const [x, y] = regionHandleToGlobal(event.handle);
  return [x + event.position[0], y + event.position[1], event.position[2]];
}

/** Whether a SoundTrigger should play, in the order the viewer checks (`process_sound_trigger`). */
export function shouldPlayTrigger(event: TriggerEvent, policy: SoundPolicy): boolean {
  const global = triggerGlobalPosition(event);
  if (!policy.canHearAt(global)) return false;
  if (policy.ownerSoundsMuted(event.ownerId)) return false;
  if (policy.isMuted(event.objectId)) return false;
  if (event.parentId && event.parentId !== NULL_UUID && policy.isMuted(event.parentId))
    return false;
  if (!policy.canAccessMaturityAt(global)) return false;
  // Gesture sounds come from the avatar itself; your own are always played.
  if (
    event.objectId === event.ownerId &&
    event.ownerId !== policy.agentId &&
    !policy.enableGestureSounds
  )
    return false;
  if (policy.isCollisionSound(event.soundId) && !policy.enableCollisionSounds) return false;
  return true;
}

export const NULL_UUID = '00000000-0000-0000-0000-000000000000';
const isNull = (id: string | undefined) => !id || id === NULL_UUID;

// ---- attached sounds -----------------------------------------------------------------------------

export interface AttachedSoundMessage {
  soundId: string;
  ownerId: string;
  gain: number;
  flags: number;
}

export type AttachedSoundAction =
  | {
      type: 'play';
      objectId: string;
      soundId: string;
      gain: number;
      loop: boolean;
      queue: boolean;
      syncMaster: boolean;
      syncSlave: boolean;
      stopFirst: boolean;
    }
  | { type: 'stop'; objectId: string }
  | { type: 'cleanup'; objectId: string };

interface AttachedState {
  soundId: string;
  loop: boolean;
  gain: number;
  muted: boolean;
  done: boolean;
  hasPendingPreloads: boolean;
}

/**
 * Per-object attached sound state, a port of `LLViewerObject::setAttachedSound` plus the postponement
 * of sounds for objects that have not arrived yet. The audio layer reports `markDone` / `setMuted`.
 */
export class AttachedSounds {
  private states = new Map<string, AttachedState>();
  private postponed = new Map<string, AttachedSoundMessage & { at: number }>();

  constructor(
    private now: () => number = () => Date.now(),
    private objectKnown: (objectId: string) => boolean = () => true,
  ) {}

  /** `process_attached_sound` for one message; returns what the audio layer should do. */
  apply(objectId: string, message: AttachedSoundMessage): AttachedSoundAction[] {
    if (!this.objectKnown(objectId)) {
      if (!isNull(message.soundId)) this.postponed.set(objectId, { ...message, at: this.now() });
      else this.postponed.delete(objectId);
      this.expirePostponed();
      return [];
    }
    return this.set(objectId, message);
  }

  /** An object that was unknown has now arrived: play its postponed sound if it is still fresh. */
  objectArrived(objectId: string): AttachedSoundAction[] {
    const held = this.postponed.get(objectId);
    if (!held) return [];
    this.postponed.delete(objectId);
    return this.now() - held.at > MAXIMUM_PLAY_DELAY_MS ? [] : this.set(objectId, held);
  }

  private expirePostponed() {
    for (const [id, held] of this.postponed)
      if (this.now() - held.at > MAXIMUM_PLAY_DELAY_MS) this.postponed.delete(id);
  }

  gainChange(objectId: string, gain: number): number | null {
    const state = this.states.get(objectId);
    if (!state) return null; // unknown object: the viewer just bails
    state.gain = Math.max(0, Math.min(1, gain));
    return state.gain;
  }

  private set(
    objectId: string,
    { soundId, gain, flags }: AttachedSoundMessage,
  ): AttachedSoundAction[] {
    const state = this.states.get(objectId);
    if (isNull(soundId)) {
      if (!state) return [];
      if (state.loop && !state.hasPendingPreloads) {
        this.states.delete(objectId);
        return [{ type: 'cleanup', objectId }];
      }
      if (flags & SOUND_FLAG.STOP) return [{ type: 'stop', objectId }];
      return [];
    }
    if (flags & SOUND_FLAG.LOOP && state?.loop && state.soundId === soundId) return []; // already looping this
    const actions: AttachedSoundAction[] = [];
    let current = state;
    if (current?.done) {
      actions.push({ type: 'cleanup', objectId });
      this.states.delete(objectId);
      current = undefined;
    }
    if (current?.muted && current.soundId === soundId) return actions; // already held as a muted sound
    const queue = Boolean(flags & SOUND_FLAG.QUEUE);
    const next: AttachedState = {
      soundId,
      loop: Boolean(flags & SOUND_FLAG.LOOP),
      gain: Math.max(0, Math.min(1, gain)),
      muted: false,
      done: false,
      hasPendingPreloads: false,
    };
    this.states.set(objectId, next);
    actions.push({
      type: 'play',
      objectId,
      soundId,
      gain: next.gain,
      loop: next.loop,
      queue,
      syncMaster: Boolean(flags & SOUND_FLAG.SYNC_MASTER),
      syncSlave: Boolean(flags & SOUND_FLAG.SYNC_SLAVE),
      stopFirst: !queue, // "farts of doom" (SL-1541): stop the current sound unless queueing
    });
    return actions;
  }

  markDone(objectId: string) {
    const s = this.states.get(objectId);
    if (s) s.done = true;
  }
  setMuted(objectId: string, muted: boolean) {
    const s = this.states.get(objectId);
    if (s) s.muted = muted;
  }
  remove(objectId: string) {
    this.states.delete(objectId);
    this.postponed.delete(objectId);
  }
  has(objectId: string) {
    return this.states.has(objectId);
  }
  clear() {
    this.states.clear();
    this.postponed.clear();
  }
}
