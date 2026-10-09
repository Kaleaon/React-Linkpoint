import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceManager } from '../voice';
import { slBridge } from '../sl-bridge';
import {
  PF_ALLOW_VOICE_CHAT, PF_USE_ESTATE_VOICE_CHAN, chooseSpatialChannel, neighborsToJoin, regionHandleFor, sameSpatialChoice,
} from '../voice-protocol';

vi.mock('../sl-bridge', () => ({ slBridge: { voiceProvision: vi.fn(), voiceSignal: vi.fn(), voiceLogout: vi.fn() } }));

const SELF = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-2222-3333-4444-555555555555';
const HOME = [256000, 256256] as [number, number];
const NORTH = [256000, 256512];
const HOME_HANDLE = regionHandleFor(HOME);
const NORTH_HANDLE = regionHandleFor(NORTH as [number, number]);

describe('chooseSpatialChannel (the state machine in llvoicewebrtc.cpp)', () => {
  it('no parcel known, or an invalid id, means the estate channel', () => {
    expect(chooseSpatialChannel(null)).toEqual({ enabled: true, estate: true });
    expect(chooseSpatialChannel({ localId: -1, flags: 0 })).toEqual({ enabled: true, estate: true });
  });

  it('a parcel that does not allow voice turns it off', () => {
    expect(chooseSpatialChannel({ localId: 5, flags: 0 })).toMatchObject({ enabled: false });
    expect(chooseSpatialChannel({ localId: 5, flags: PF_USE_ESTATE_VOICE_CHAN })).toMatchObject({ enabled: false });
  });

  it('a parcel that allows voice uses its own channel unless it is set to use the estate one', () => {
    expect(chooseSpatialChannel({ localId: 5, flags: PF_ALLOW_VOICE_CHAT })).toEqual({ enabled: true, estate: false, parcelLocalId: 5 });
    expect(chooseSpatialChannel({ localId: 5, flags: (PF_ALLOW_VOICE_CHAT | PF_USE_ESTATE_VOICE_CHAN) >>> 0 })).toEqual({ enabled: true, estate: true });
    expect(sameSpatialChoice({ enabled: true, estate: false, parcelLocalId: 5 }, { enabled: true, estate: false, parcelLocalId: 5 })).toBe(true);
    expect(sameSpatialChoice({ enabled: true, estate: false, parcelLocalId: 5 }, { enabled: true, estate: true })).toBe(false);
  });
});

describe('neighborsToJoin (updateNeighboringRegions)', () => {
  const known = [
    { handle: NORTH_HANDLE, originX: 256000, originY: 256512 },
    { handle: regionHandleFor([255744, 256256]), originX: 255744, originY: 256256 }, // west
  ];

  it('includes a region that a point 100 m away in some direction falls in, and never the current one', () => {
    // 30 m south of the border with the north region, 150 m from the west edge
    expect(neighborsToJoin([256150, 256482, 25], known, HOME_HANDLE)).toEqual([NORTH_HANDLE]);
    // near the north-west corner: both
    expect(neighborsToJoin([256010, 256490, 25], known, HOME_HANDLE).sort()).toEqual([NORTH_HANDLE, regionHandleFor([255744, 256256])].sort());
  });

  it('is empty in the middle of the region, and ignores regions that are not listed', () => {
    expect(neighborsToJoin([256128, 256384, 25], known, HOME_HANDLE)).toEqual([]);
    expect(neighborsToJoin([256150, 256482, 25], [], HOME_HANDLE)).toEqual([]);
  });

  it('the diagonal probes are 100 m along each axis scaled by 0.707', () => {
    const corner = [{ handle: 'ne', originX: 256256, originY: 256512 }];
    // 100 * 0.707 = 70.7 m east and north of (256190, 256450) is (256260.7, 256520.7): inside the north-east region
    expect(neighborsToJoin([256190, 256450, 0], corner, HOME_HANDLE)).toEqual(['ne']);
    expect(neighborsToJoin([256180, 256440, 0], corner, HOME_HANDLE)).toEqual([]);
  });
});

class FakeTrack { id = 't'; enabled = true; stop = vi.fn(); toJSON() { return {}; } }
class FakeStream { tracks = [new FakeTrack()]; getAudioTracks() { return this.tracks; } getTracks() { return this.tracks; } }
class FakeDataChannel {
  readyState = 'open'; sent: string[] = [];
  onopen: (() => void) | null = null; onmessage: ((e: { data: string }) => void) | null = null; onclose: (() => void) | null = null;
  constructor(public label: string) {}
  send(data: string) { this.sent.push(data); }
  close = vi.fn();
}
const peers: FakePeer[] = [];
class FakePeer {
  connectionState = 'connected';
  ontrack: ((e: unknown) => void) | null = null;
  onicecandidate: unknown = null;
  onconnectionstatechange: (() => void) | null = null;
  channel!: FakeDataChannel;
  addTrack = vi.fn();
  addTransceiver = vi.fn();
  constructor(public config: RTCConfiguration) { peers.push(this); }
  createDataChannel(label: string) { this.channel = new FakeDataChannel(label); return this.channel; }
  createOffer = vi.fn(async () => ({ type: 'offer', sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n' }));
  setLocalDescription = vi.fn(async () => {});
  setRemoteDescription = vi.fn(async () => { this.onconnectionstatechange?.(); });
  close = vi.fn();
}
const sentOn = (peer: FakePeer) => peer.channel.sent.map((s) => JSON.parse(s));
const flush = async () => { await vi.advanceTimersByTimeAsync(0); await vi.advanceTimersByTimeAsync(0); };

describe('VoiceManager across region borders', () => {
  let provisioned: Array<{ body: any; handle?: string }>;
  beforeEach(() => {
    vi.useFakeTimers();
    peers.length = 0; provisioned = [];
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    vi.stubGlobal('MediaStream', FakeStream);
    vi.stubGlobal('Audio', class { autoplay = false; volume = 1; srcObject: unknown = null; play = vi.fn(async () => {}); });
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(async () => new FakeStream()) } });
    (slBridge.voiceProvision as any).mockReset().mockImplementation(async (body: any, handle?: string) => {
      provisioned.push({ body, handle });
      return { viewer_session: `vs-${provisioned.length}`, jsep: { type: 'answer', sdp: 'answer' } };
    });
    (slBridge.voiceSignal as any).mockReset().mockResolvedValue({});
    (slBridge.voiceLogout as any).mockReset().mockResolvedValue({});
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  async function estateVoice() {
    const voice = new VoiceManager();
    voice.setSelfId(SELF);
    voice.setRegionOrigin(HOME);
    voice.setNeighborRegions([{ handle: NORTH_HANDLE, originX: 256000, originY: 256512 }]);
    await voice.connect();
    peers[0].channel.onopen?.();
    voice.updateSpatial({ avatarPosition: [100, 235, 25], avatarRotation: [0, 0, 0, 1] });
    return voice;
  }

  it('connects to the estate channel without a parcel id, then to a neighbour within 100 m, listen-only and non-primary', async () => {
    const voice = await estateVoice();
    expect(provisioned[0].body.parcel_local_id).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1100);
    await flush();
    expect(provisioned).toHaveLength(2);
    expect(provisioned[1].handle).toBe(NORTH_HANDLE);
    expect(provisioned[1].body.parcel_local_id).toBeUndefined();
    const neighbor = peers[1];
    expect(neighbor.addTransceiver).toHaveBeenCalledWith('audio', { direction: 'sendrecv' });
    expect(neighbor.addTrack).not.toHaveBeenCalled(); // no microphone
    neighbor.channel.onopen?.();
    expect(sentOn(neighbor)).toContainEqual({ j: {} }); // a join without the primary marker
    expect(sentOn(neighbor)).not.toContainEqual({ j: { p: true } });
    expect(sentOn(peers[0])).toContainEqual({ j: { p: true } });
    await voice.disconnect();
  });

  it('sends position updates and per-person mutes to the neighbour too', async () => {
    const voice = await estateVoice();
    await vi.advanceTimersByTimeAsync(1100); await flush();
    peers[1].channel.onopen?.();
    await vi.advanceTimersByTimeAsync(300);
    const spatial = (peer: FakePeer) => sentOn(peer).filter((m) => m.sp);
    expect(spatial(peers[0]).length).toBeGreaterThan(0);
    expect(spatial(peers[1]).length).toBeGreaterThan(0);
    voice.setUserMuted(OTHER, true);
    expect(sentOn(peers[1])).toContainEqual({ m: { [OTHER]: true } });
    await voice.disconnect();
  });

  it('takes people from a neighbour only if it says they are its own, and believes only their own server\'s goodbye and moderation', async () => {
    const voice = await estateVoice();
    await vi.advanceTimersByTimeAsync(1100); await flush();
    const neighbor = peers[1];
    neighbor.channel.onopen?.();
    neighbor.channel.onmessage?.({ data: JSON.stringify({ [OTHER]: { j: {} } }) });
    expect(voice.getActiveSpeakers()).toEqual([]);   // joined there but lives elsewhere
    neighbor.channel.onmessage?.({ data: JSON.stringify({ [OTHER]: { j: { p: true } } }) });
    expect(voice.getActiveSpeakers().map((s) => s.id)).toEqual([OTHER]);
    // someone who lives in the home region, announced by the primary connection
    const FRIEND = 'aaaaaaaa-2222-3333-4444-555555555555';
    peers[0].channel.onmessage?.({ data: JSON.stringify({ [FRIEND]: { j: { p: true } } }) });
    // the neighbour reports levels for them, and tries to say goodbye and to moderator-mute them
    neighbor.channel.onmessage?.({ data: JSON.stringify({ [FRIEND]: { p: 64, v: true, m: true } }) });
    neighbor.channel.onmessage?.({ data: JSON.stringify({ [FRIEND]: { l: true } }) });
    const friend = voice.getActiveSpeakers().find((s) => s.id === FRIEND)!;
    expect(friend).toMatchObject({ speaking: true, energy: 0.5, moderatorMuted: false });
    peers[0].channel.onmessage?.({ data: JSON.stringify({ [FRIEND]: { l: true } }) });
    expect(voice.getActiveSpeakers().map((s) => s.id)).toEqual([OTHER]);
    await voice.disconnect();
  });

  it('closes a neighbour connection (and forgets its people) when the avatar walks away from the border', async () => {
    const voice = await estateVoice();
    await vi.advanceTimersByTimeAsync(1100); await flush();
    peers[1].channel.onopen?.();
    peers[1].channel.onmessage?.({ data: JSON.stringify({ [OTHER]: { j: { p: true } } }) });
    voice.updateSpatial({ avatarPosition: [100, 100, 25] });
    await vi.advanceTimersByTimeAsync(1200);
    expect(peers[1].close).toHaveBeenCalled();
    expect(slBridge.voiceLogout).toHaveBeenCalledWith('vs-2');
    expect(voice.getActiveSpeakers()).toEqual([]);
    await voice.disconnect();
  });

  it('holds no neighbour connections on a parcel\'s own channel', async () => {
    const voice = new VoiceManager();
    voice.setRegionOrigin(HOME);
    voice.setNeighborRegions([{ handle: NORTH_HANDLE, originX: 256000, originY: 256512 }]);
    await voice.setSpatialChoice({ enabled: true, estate: false, parcelLocalId: 9 }, HOME_HANDLE);
    await voice.connect();
    peers[0].channel.onopen?.();
    voice.updateSpatial({ avatarPosition: [100, 235, 25], avatarRotation: [0, 0, 0, 1] });
    await vi.advanceTimersByTimeAsync(1500); await flush();
    expect(provisioned).toHaveLength(1);
    expect(provisioned[0].body.parcel_local_id).toBe(9);
    await voice.disconnect();
  });

  it('a failed neighbour does not take the main connection down, and is tried again later', async () => {
    const voice = await estateVoice();
    (slBridge.voiceProvision as any).mockRejectedValueOnce(new Error('503'));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await vi.advanceTimersByTimeAsync(1100); await flush();
    expect(voice.state).toBe('connected');
    expect(provisioned).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(16000); await flush();
    expect(provisioned).toHaveLength(2);
    warn.mockRestore();
    await voice.disconnect();
  });

  it('follows the parcel: its own channel, none (stopped, resumed by itself), and a new region', async () => {
    const voice = await estateVoice();
    await voice.setSpatialChoice({ enabled: true, estate: false, parcelLocalId: 4 }, HOME_HANDLE);
    expect(provisioned.at(-1)!.body.parcel_local_id).toBe(4);
    const peersBefore = peers.length;
    await voice.setSpatialChoice({ enabled: true, estate: false, parcelLocalId: 4 }, HOME_HANDLE);
    expect(peers.length).toBe(peersBefore); // same channel, same region: untouched

    const states: string[] = [];
    voice.on('state', (e: any) => states.push(`${e.state}:${e.message}`));
    await voice.setSpatialChoice({ enabled: false, reason: 'Voice is not allowed on this parcel' }, HOME_HANDLE);
    expect(voice.state).toBe('off');
    expect(states).toContain('off:Voice is not allowed on this parcel');
    await voice.setSpatialChoice({ enabled: true, estate: true }, HOME_HANDLE);
    expect(voice.state).toBe('connected');
    expect(provisioned.at(-1)!.body.parcel_local_id).toBeUndefined();

    const before = provisioned.length;
    voice.setRegionOrigin(NORTH as [number, number]);
    await voice.setSpatialChoice({ enabled: true, estate: true }, NORTH_HANDLE);
    expect(provisioned.length).toBe(before + 1); // a new region: the connection is rebuilt there
    await voice.disconnect();
  });

  it('connect() on a parcel that forbids voice says so instead of trying', async () => {
    const voice = new VoiceManager();
    await voice.setSpatialChoice({ enabled: false, reason: 'Voice is not allowed on this parcel' }, HOME_HANDLE);
    await expect(voice.connect()).rejects.toThrow('not allowed');
    expect(voice.state).toBe('error');
    expect(provisioned).toHaveLength(0);
  });
});
