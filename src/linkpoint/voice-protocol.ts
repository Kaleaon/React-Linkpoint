/**
 * Second Life WebRTC voice protocol: capability bodies, the "SLData" data-channel messages, spatial
 * updates and SDP handling. Pure functions, so the wire format is testable without a browser.
 *
 * Sources, all from the official viewer at github.com/secondlife/viewer @ 7dd6de6120ce (2026-10-07):
 * `indra/newview/llvoicewebrtc.cpp` / `.h` (constants, capability bodies, data-channel messages,
 * ear locations, STUN hosts) and `indra/llwebrtc/llwebrtc.cpp` (data channel label and ordering,
 * Opus SDP parameters). Every constant below was compared with that source.
 *
 * Known inconsistency in the official viewer itself: a per-user volume change is sent as
 * `volume * 220` (`PEER_GAIN_CONVERSION_FACTOR`, `setUserVolume`), but the value re-sent when a
 * participant joins is `volume * 200`. This module uses 220 for both and exposes the constant.
 * Not exercised against a live voice server.
 */

export const VOICE_SERVER_TYPE = 'webrtc';
/** Listener may be at most this far from the avatar (metres); the server enforces it too. */
export const MAX_AUDIO_DIST = 50;
/** `ug` (per-participant gain) = volume (0..1) * this, as an unsigned integer. */
export const PEER_GAIN_CONVERSION_FACTOR = 220;
/** The viewer's own level meter maps a raw level to 0..1 with these constants. */
export const LEVEL_SCALE = 0.005;
export const LEVEL_START_POINT = 0.18;
export const SPEAKING_AUDIO_LEVEL = 0.30;
/** Spatial updates are sent at most this often. */
export const POSITION_UPDATE_THROTTLE_MS = 100;
export const MUTE_FADE_MS = 500;
export const DATA_CHANNEL_LABEL = 'SLData';

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** Where the listener's ear sits (VoiceEarLocation: 0 camera, 1 avatar, 2 avatar position with camera heading). */
export enum EarLocation { Camera = 0, Avatar = 1, Mixed = 2 }

export type VoiceChannel =
  | { kind: 'local'; parcelLocalId?: number }
  /** P2P and group voice: the channel id and credentials come from the grid's chat session. */
  | { kind: 'multiagent'; channelId: string; credentials: string };

/** Body for the ProvisionVoiceAccountRequest capability. */
export function provisionBody(sdp: string, channel: VoiceChannel): Record<string, unknown> {
  const jsep = { type: 'offer', sdp };
  if (channel.kind === 'multiagent') {
    return { jsep, credentials: channel.credentials, channel: channel.channelId, channel_type: 'multiagent', voice_server_type: VOICE_SERVER_TYPE };
  }
  const body: Record<string, unknown> = { jsep };
  if (Number.isInteger(channel.parcelLocalId) && (channel.parcelLocalId as number) >= 0) body.parcel_local_id = channel.parcelLocalId;
  body.channel_type = 'local';
  body.voice_server_type = VOICE_SERVER_TYPE;
  return body;
}

export const logoutBody = (viewerSession: string) => ({ logout: true, viewer_session: viewerSession, voice_server_type: VOICE_SERVER_TYPE });

/**
 * Body for VoiceSignalingRequest. Like the viewer, a call carries either candidates or the
 * "gathering finished" marker, never both.
 */
export function signalingBody(viewerSession: string, candidates: readonly RTCIceCandidateInit[], completed: boolean): Record<string, unknown> | null {
  const body: Record<string, unknown> = { viewer_session: viewerSession, voice_server_type: VOICE_SERVER_TYPE };
  if (candidates.length) {
    body.candidates = candidates.map((c) => ({ sdpMid: c.sdpMid ?? '', sdpMLineIndex: c.sdpMLineIndex ?? 0, candidate: c.candidate ?? '' }));
  } else if (completed) {
    body.candidate = { completed: true };
  } else return null;
  return body;
}

/** STUN servers per grid: stun1..stunN.<grid>.secondlife.io:3478 (three on agni, two elsewhere). */
export function iceServersForGrid(gridLoginId = 'agni'): RTCIceServer[] {
  const grid = gridLoginId.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const count = grid === 'agni' ? 3 : 2;
  return [{ urls: Array.from({ length: count }, (_, i) => `stun:stun${i + 1}.${grid}.secondlife.io:3478`) }];
}

const OPUS_FMTP = 'minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1;maxplaybackrate=48000;sprop-maxplaybackrate=48000;sprop-maxcapturerate=48000';

/**
 * The viewer rewrites its offer so Opus runs at 48 kHz stereo. This replaces the Opus rtpmap and
 * fmtp lines (the viewer's own code appends its fmtp after the original on one line, which looks
 * unintended; replacing is the evident intent and is what a standards-following peer expects).
 */
export function mungeOpusSdp(sdp: string): string {
  const eol = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(/\r?\n/);
  let payload = '';
  let wroteFmtp = false;
  const out: string[] = [];
  for (const line of lines) {
    const rtpmap = /^a=rtpmap:(\d+) opus\/\d+\/2/i.exec(line);
    if (rtpmap) { payload = rtpmap[1]; out.push(`a=rtpmap:${payload} opus/48000/2`); continue; }
    if (payload && line.startsWith(`a=fmtp:${payload} `)) { out.push(`a=fmtp:${payload} ${OPUS_FMTP}`); wroteFmtp = true; continue; }
    out.push(line);
  }
  if (payload && !wroteFmtp) {
    const at = out.findIndex((l) => l.startsWith(`a=rtpmap:${payload} `));
    out.splice(at + 1, 0, `a=fmtp:${payload} ${OPUS_FMTP}`);
  }
  return out.join(eol);
}

// ---- data channel: outgoing ---------------------------------------------------------------------

const centi = (value: number) => Math.trunc(value * 100);
const xyz = (v: Vec3) => ({ x: centi(v[0]), y: centi(v[1]), z: centi(v[2]) });
const xyzw = (q: Quat) => ({ x: centi(q[0]), y: centi(q[1]), z: centi(q[2]), w: centi(q[3]) });

export interface SpatialState {
  /** Global position of the avatar's head (avatar position + 1 m), in metres. */
  avatarPosition: Vec3;
  avatarRotation: Quat;
  /** Where the camera/ear wants to listen from; tethered to the avatar before sending. */
  listenerPosition: Vec3;
  listenerRotation: Quat;
}

/** Pull a requested listener position back to within MAX_AUDIO_DIST of the avatar. */
export function tetherListener(avatar: Vec3, requested: Vec3, max = MAX_AUDIO_DIST): Vec3 {
  const dx = requested[0] - avatar[0], dy = requested[1] - avatar[1], dz = requested[2] - avatar[2];
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= max) return requested;
  const k = max / distance;
  return [avatar[0] + dx * k, avatar[1] + dy * k, avatar[2] + dz * k];
}

/** Choose the ear pose for a VoiceEarLocation setting. */
export function earPose(location: EarLocation, avatar: { position: Vec3; rotation: Quat }, camera: { position: Vec3; rotation: Quat }): { position: Vec3; rotation: Quat } {
  switch (location) {
    case EarLocation.Avatar: return avatar;
    case EarLocation.Mixed: return { position: avatar.position, rotation: camera.rotation };
    default: return camera;
  }
}

/** The position message: all values are integer hundredths, truncated like the viewer's `(int)` casts. */
export function spatialMessage(state: SpatialState): string {
  const listener = tetherListener(state.avatarPosition, state.listenerPosition);
  return JSON.stringify({ sp: xyz(state.avatarPosition), sh: xyzw(state.avatarRotation), lp: xyz(listener), lh: xyzw(state.listenerRotation) });
}

export const joinMessage = (primary: boolean) => JSON.stringify({ j: primary ? { p: true } : {} });
export const muteMessage = (muted: Readonly<Record<string, boolean>>) => JSON.stringify({ m: muted });
/** Per-participant playback gain as a 0..1 fraction. */
export const userGainMessage = (gains: Readonly<Record<string, number>>) =>
  JSON.stringify({ ug: Object.fromEntries(Object.entries(gains).map(([id, v]) => [id, Math.max(0, Math.trunc(Math.max(0, v) * PEER_GAIN_CONVERSION_FACTOR))])) });

// ---- data channel: incoming ---------------------------------------------------------------------

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NULL_UUID = '00000000-0000-0000-0000-000000000000';

export interface ParticipantUpdate {
  id: string;
  /** Server version string, sent to the agent that joined. */
  version?: string;
  joined?: boolean;
  /** True when this server is the participant's primary voice server (only meaningful with `joined`). */
  primary?: boolean;
  left?: boolean;
  /** Voice power 0..1 (the wire value is level * 128). */
  level?: number;
  speaking?: boolean;
  moderatorMuted?: boolean;
}

/** Parse one data-channel message into per-participant updates. Unknown or malformed parts are skipped. */
export function parseVoiceData(raw: string): ParticipantUpdate[] {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return []; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const updates: ParticipantUpdate[] = [];
  for (const [id, value] of Object.entries(data as Record<string, unknown>)) {
    if (!UUID.test(id) || id === NULL_UUID || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const v = value as Record<string, unknown>;
    const update: ParticipantUpdate = { id: id.toLowerCase() };
    if (typeof v.V === 'string') update.version = v.V;
    if (v.j && typeof v.j === 'object' && !Array.isArray(v.j)) {
      update.joined = true;
      update.primary = (v.j as Record<string, unknown>).p === true;
    }
    if (v.l === true) update.left = true;
    if (typeof v.p === 'number' && Number.isFinite(v.p)) update.level = v.p / 128;
    if (typeof v.v === 'boolean') update.speaking = v.v;
    if (typeof v.m === 'boolean') update.moderatorMuted = v.m;
    updates.push(update);
  }
  return updates;
}

/** Map a raw 0..1 microphone level to the viewer's "speaking" decision. */
export const isSpeakingLevel = (level: number) => level > SPEAKING_AUDIO_LEVEL;

/** `MAX_RETRY_WAIT_SECONDS` in `llvoicewebrtc.cpp`: the wait stops growing once it reaches this. */
export const MAX_RETRY_WAIT_SECONDS = 10;

/**
 * The viewer's reconnect schedule (`LLVoiceWebRTCConnection`, `VOICE_STATE_SESSION_RETRY`). The first
 * wait is `random + 0.5` seconds; after each retry the wait grows by another `random + 0.5` until it
 * has reached 10 seconds, so clients that dropped together do not all come back at once. A session that
 * comes up resets it.
 */
export class RetryBackoff {
  private waitSeconds: number;
  constructor(private readonly random: () => number = Math.random) { this.waitSeconds = random() + 0.5; }

  /** Seconds to wait before this retry; the next one will wait longer (unless the cap has been reached). */
  next(): number {
    const wait = this.waitSeconds;
    if (this.waitSeconds < MAX_RETRY_WAIT_SECONDS) this.waitSeconds += this.random() + 0.5;
    return wait;
  }

  reset() { this.waitSeconds = this.random() + 0.5; }
}

// ---- which voice channel applies, and which neighbouring regions join it ------------------------------

/** Parcel flags (`llparcelflags.h`). */
export const PF_ALLOW_VOICE_CHAT = 1 << 29;
export const PF_USE_ESTATE_VOICE_CHAN = 1 << 30;

export type SpatialChoice =
  | { enabled: false; reason: string }
  /** `estate`: the region's estate-wide channel (provisioned without a parcel id), the only one that spans region borders. */
  | { enabled: true; estate: true }
  | { enabled: true; estate: false; parcelLocalId: number };

/**
 * `LLWebRTCVoiceClient::voiceConnectionStateMachine`: no parcel known means the estate channel; a parcel that does not
 * allow voice turns voice off; one that does not use the estate channel has its own, named by its local id.
 */
export function chooseSpatialChannel(parcel: { localId: number; flags: number } | null | undefined): SpatialChoice {
  if (!parcel || !Number.isInteger(parcel.localId) || parcel.localId < 0) return { enabled: true, estate: true };
  const flags = parcel.flags >>> 0;
  if (!(flags & PF_ALLOW_VOICE_CHAT)) return { enabled: false, reason: 'Voice is not allowed on this parcel' };
  if (!(flags & PF_USE_ESTATE_VOICE_CHAN)) return { enabled: true, estate: false, parcelLocalId: parcel.localId };
  return { enabled: true, estate: true };
}

export const sameSpatialChoice = (a: SpatialChoice, b: SpatialChoice) =>
  a.enabled === b.enabled && (!a.enabled || !b.enabled || (a.estate === b.estate && (a.estate || b.estate || a.parcelLocalId === b.parcelLocalId)));

/** The unit-ish steps `updateNeighboringRegions` probes in, each taken 100 m (2 * MAX_AUDIO_DIST) from the speaker. */
export const NEIGHBOR_DIRECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [0.707, 0.707], [1, 0], [0.707, -0.707], [0, -1], [-0.707, -0.707], [-1, 0], [-0.707, 0.707],
];

/** A region handle: south-west corner in metres, x in the high 32 bits and y in the low, as a decimal string. */
export const regionHandleFor = (origin: readonly [number, number]) => ((BigInt(Math.round(origin[0])) << 32n) | BigInt(Math.round(origin[1]))).toString();

export interface NeighborRegion { handle: string; originX: number; originY: number }

/**
 * `LLWebRTCVoiceClient::updateNeighboringRegions`: the neighbours (never the current region) that contain a point 100 m
 * from the speaker in any of eight directions. `regionWidth` is assumed 256 m for regions we know nothing else about.
 */
export function neighborsToJoin(speakerGlobal: readonly [number, number, number], known: readonly NeighborRegion[], currentHandle: string, regionWidth = 256): string[] {
  const wanted = new Set<string>();
  for (const [dx, dy] of NEIGHBOR_DIRECTIONS) {
    const x = speakerGlobal[0] + 2 * MAX_AUDIO_DIST * dx;
    const y = speakerGlobal[1] + 2 * MAX_AUDIO_DIST * dy;
    const region = known.find((r) => x >= r.originX && x < r.originX + regionWidth && y >= r.originY && y < r.originY + regionWidth);
    if (region && region.handle !== currentHandle) wanted.add(region.handle);
  }
  return [...wanted];
}
