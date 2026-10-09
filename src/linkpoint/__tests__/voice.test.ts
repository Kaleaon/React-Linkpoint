import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceManager } from '../voice';
import { slBridge } from '../sl-bridge';

vi.mock('../sl-bridge', () => ({
  slBridge: { voiceProvision: vi.fn(), voiceSignal: vi.fn(), voiceLogout: vi.fn() },
}));

const SELF = '11111111-2222-3333-4444-555555555555';
const OTHER = '99999999-2222-3333-4444-555555555555';

class FakeTrack {
  id = 't';
  enabled = true;
  stop = vi.fn();
  toJSON() {
    return {};
  }
}
class FakeStream {
  tracks = [new FakeTrack()];
  getAudioTracks() {
    return this.tracks;
  }
  getTracks() {
    return this.tracks;
  }
}
class FakeDataChannel {
  readyState = 'open';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  constructor(
    public label: string,
    public init: RTCDataChannelInit,
  ) {}
  send(data: string) {
    this.sent.push(data);
  }
  close = vi.fn();
}
let lastPeer: FakePeer;
class FakePeer {
  connectionState = 'connected';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  ontrack: ((e: unknown) => void) | null = null;
  onicecandidate: ((e: { candidate: { toJSON(): RTCIceCandidateInit } | null }) => void) | null =
    null;
  onconnectionstatechange: (() => void) | null = null;
  channel!: FakeDataChannel;
  addTrack = vi.fn();
  constructor(public config: RTCConfiguration) {
    lastPeer = this;
  }
  createDataChannel(label: string, init: RTCDataChannelInit) {
    this.channel = new FakeDataChannel(label, init);
    return this.channel;
  }
  createOffer = vi.fn(async () => ({
    type: 'offer',
    sdp: 'm=audio 9 UDP/TLS/RTP/SAVPF 111\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10\r\n',
  }));
  setLocalDescription = vi.fn(async (d: RTCSessionDescriptionInit) => {
    this.localDescription = d;
  });
  setRemoteDescription = vi.fn(async (d: RTCSessionDescriptionInit) => {
    this.remoteDescription = d;
    this.onconnectionstatechange?.();
  });
  close = vi.fn();
}

const parsed = (channel: FakeDataChannel) => channel.sent.map((s) => JSON.parse(s));

describe('VoiceManager (official SL WebRTC voice)', () => {
  let stream: FakeStream;
  beforeEach(() => {
    vi.useFakeTimers();
    stream = new FakeStream();
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    vi.stubGlobal('MediaStream', FakeStream);
    vi.stubGlobal(
      'Audio',
      class {
        autoplay = false;
        volume = 1;
        srcObject: unknown = null;
        play = vi.fn(async () => {});
      },
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => stream) },
    });
    (slBridge.voiceProvision as any)
      .mockReset()
      .mockResolvedValue({ viewer_session: 'vs-1', jsep: { type: 'answer', sdp: 'answer-sdp' } });
    (slBridge.voiceSignal as any).mockReset().mockResolvedValue({});
    (slBridge.voiceLogout as any).mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  async function connected(options = {}) {
    const voice = new VoiceManager();
    voice.setSelfId(SELF);
    await voice.connect({ parcelLocalId: 12, ...options });
    return voice;
  }

  it('starts someone muted for us when the mute list silences their voice', async () => {
    const voice = new VoiceManager();
    voice.setSelfId(SELF);
    voice.setVoiceMuteChecker((id) => id === OTHER);
    await voice.connect({ parcelLocalId: 12 });
    lastPeer.channel.onopen?.();
    lastPeer.channel.sent.length = 0;
    lastPeer.channel.onmessage?.({ data: JSON.stringify({ [OTHER]: { j: { p: true } } }) });
    expect(parsed(lastPeer.channel)).toContainEqual({ m: { [OTHER]: true } });
    await voice.disconnect();
  });

  it('offers Opus 48 kHz stereo with an ordered "SLData" channel and the grid STUN servers', async () => {
    const voice = await connected();
    expect(lastPeer.channel.label).toBe('SLData');
    expect(lastPeer.channel.init).toEqual({ ordered: true });
    expect((lastPeer.config.iceServers![0].urls as string[])[2]).toBe(
      'stun:stun3.agni.secondlife.io:3478',
    );
    const body = (slBridge.voiceProvision as any).mock.calls[0][0];
    expect(body).toMatchObject({
      channel_type: 'local',
      parcel_local_id: 12,
      voice_server_type: 'webrtc',
      jsep: { type: 'offer' },
    });
    expect(body.jsep.sdp).toContain(
      'a=fmtp:111 minptime=10;useinbandfec=1;stereo=1;sprop-stereo=1',
    );
    expect(lastPeer.remoteDescription).toEqual({ type: 'answer', sdp: 'answer-sdp' });
    await voice.disconnect();
  });

  it('provisions an ad-hoc channel for P2P and group voice', async () => {
    const voice = await connected({
      channel: { kind: 'multiagent', channelId: 'chan', credentials: 'cred' },
    });
    expect((slBridge.voiceProvision as any).mock.calls[0][0]).toMatchObject({
      channel_type: 'multiagent',
      channel: 'chan',
      credentials: 'cred',
    });
    await voice.disconnect();
  });

  it('keeps the microphone off until the join, then follows the mute state', async () => {
    const voice = await connected();
    const track = stream.tracks[0];
    expect(track.enabled).toBe(false);
    lastPeer.channel.onopen!();
    expect(parsed(lastPeer.channel).slice(0, 2)).toEqual([{ j: {} }, { j: { p: true } }]);
    expect(track.enabled).toBe(false); // still muted by default
    voice.setMuted(false);
    expect(track.enabled).toBe(true);
    voice.setMuted(true);
    expect(track.enabled).toBe(false);
    await voice.disconnect();
  });

  it('sends spatial updates only once position and rotation are known, throttled, in hundredths', async () => {
    const voice = await connected();
    lastPeer.channel.onopen!();
    expect(parsed(lastPeer.channel).some((m) => m.sp)).toBe(false); // no pose yet, nothing invented
    voice.setRegionOrigin([256000, 256000]);
    voice.updateSpatial({ avatarPosition: [10, 20, 30], avatarRotation: [0, 0, 0, 1] });
    vi.advanceTimersByTime(150);
    const spatial = parsed(lastPeer.channel).filter((m) => m.sp);
    expect(spatial).toHaveLength(1);
    expect(spatial[0].sp).toEqual({ x: 25601000, y: 25602000, z: 3100 }); // global metres, head = +1 m
    expect(spatial[0].lp).toEqual(spatial[0].sp);
    vi.advanceTimersByTime(1000);
    expect(parsed(lastPeer.channel).filter((m) => m.sp)).toHaveLength(1); // unchanged, not resent
    await voice.disconnect();
  });

  it('tracks participants by avatar UUID from the data channel and reports who is speaking', async () => {
    const voice = await connected();
    lastPeer.channel.onopen!();
    const speaking = vi.fn();
    voice.on('speaking', speaking);
    lastPeer.channel.onmessage!({
      data: JSON.stringify({ [OTHER]: { j: { p: true } }, [SELF]: { j: { p: true } } }),
    });
    lastPeer.channel.onmessage!({ data: JSON.stringify({ [OTHER]: { p: 64, v: true } }) });
    expect(voice.isSpeaking(OTHER)).toBe(true);
    expect(voice.getSpeakerEnergy(OTHER)).toBe(0.5);
    expect(voice.isSpeaking('local_mic')).toBe(false);
    const last = speaking.mock.calls.at(-1)![0].speakers;
    expect(last.map((s: any) => s.id).sort()).toEqual([OTHER, SELF].sort());
    lastPeer.channel.onmessage!({ data: JSON.stringify({ [OTHER]: { l: true } }) });
    expect(voice.getActiveSpeakers().map((s) => s.id)).toEqual([SELF]);
    await voice.disconnect();
  });

  it('ignores joins from non-primary spatial servers', async () => {
    const voice = await connected();
    lastPeer.channel.onmessage!({ data: JSON.stringify({ [OTHER]: { j: {} } }) });
    expect(voice.getActiveSpeakers()).toEqual([]);
    await voice.disconnect();
  });

  it('sends per-person mute and gain, and re-applies them when that person joins', async () => {
    const voice = await connected();
    lastPeer.channel.onopen!();
    voice.setUserMuted(OTHER, true);
    voice.setUserVolume(OTHER, 0.5);
    const sent = parsed(lastPeer.channel);
    expect(sent).toContainEqual({ m: { [OTHER]: true } });
    expect(sent).toContainEqual({ ug: { [OTHER]: 110 } });
    lastPeer.channel.sent.length = 0;
    lastPeer.channel.onmessage!({ data: JSON.stringify({ [OTHER]: { j: { p: true } } }) });
    expect(parsed(lastPeer.channel)).toEqual([{ m: { [OTHER]: true } }, { ug: { [OTHER]: 110 } }]);
    await voice.disconnect();
  });

  it('trickles candidates, then the completed marker, as separate signaling requests', async () => {
    const voice = await connected();
    lastPeer.onicecandidate!({
      candidate: { toJSON: () => ({ candidate: 'cand-1', sdpMid: '0', sdpMLineIndex: 0 }) },
    });
    await vi.advanceTimersByTimeAsync(150);
    lastPeer.onicecandidate!({ candidate: null });
    await vi.advanceTimersByTimeAsync(10);
    const calls = (slBridge.voiceSignal as any).mock.calls.map((c: any[]) => c[0]);
    expect(calls[0]).toEqual({
      viewer_session: 'vs-1',
      voice_server_type: 'webrtc',
      candidates: [{ sdpMid: '0', sdpMLineIndex: 0, candidate: 'cand-1' }],
    });
    expect(calls[1]).toEqual({
      viewer_session: 'vs-1',
      voice_server_type: 'webrtc',
      candidate: { completed: true },
    });
    await voice.disconnect();
  });

  it('starts a new session when the parcel changes and keeps the mute state', async () => {
    const voice = await connected();
    voice.setMuted(false);
    await voice.reprovision(12); // same parcel: nothing happens
    expect(slBridge.voiceProvision).toHaveBeenCalledTimes(1);
    await voice.reprovision(34);
    expect(slBridge.voiceLogout).toHaveBeenCalledWith('vs-1');
    expect((slBridge.voiceProvision as any).mock.calls[1][0]).toMatchObject({
      parcel_local_id: 34,
      channel_type: 'local',
    });
    expect(voice.muted).toBe(false);
    await voice.disconnect();
  });

  it('rejects an invalid answer, cleans up and reports the error', async () => {
    (slBridge.voiceProvision as any).mockResolvedValue({ viewer_session: 'x' });
    const voice = new VoiceManager();
    await expect(voice.connect()).rejects.toThrow(/invalid answer/);
    expect(voice.state).toBe('error');
    expect(lastPeer.close).toHaveBeenCalled();
    expect(stream.tracks[0].stop).toHaveBeenCalled();
  });

  it('disconnect logs out and clears participants', async () => {
    const voice = await connected();
    lastPeer.channel.onmessage!({ data: JSON.stringify({ [OTHER]: { j: { p: true } } }) });
    await voice.disconnect();
    expect(slBridge.voiceLogout).toHaveBeenCalledWith('vs-1');
    expect(voice.state).toBe('off');
    expect(voice.getActiveSpeakers()).toEqual([]);
  });
});

describe('VoiceManager reconnecting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('RTCPeerConnection', FakePeer);
    vi.stubGlobal('MediaStream', FakeStream);
    vi.stubGlobal(
      'Audio',
      class {
        autoplay = false;
        volume = 1;
        srcObject: unknown = null;
        play = vi.fn(async () => {});
      },
    );
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: vi.fn(async () => new FakeStream()) },
    });
    (slBridge.voiceProvision as any)
      .mockReset()
      .mockResolvedValue({ viewer_session: 'vs-1', jsep: { type: 'answer', sdp: 'answer-sdp' } });
    (slBridge.voiceSignal as any).mockReset().mockResolvedValue({});
    (slBridge.voiceLogout as any).mockReset().mockResolvedValue({});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries a failed provisioning on the viewer schedule and joins when it works', async () => {
    const voice = new VoiceManager();
    voice.setRandom(() => 0.25); // 0.75 s, then 1.5 s
    const retrying: Array<{ attempt: number; delaySeconds: number }> = [];
    voice.on('retrying', (e: any) => retrying.push(e));
    (slBridge.voiceProvision as any)
      .mockRejectedValueOnce(new Error('503'))
      .mockRejectedValueOnce(new Error('503'));
    await expect(voice.connect({ parcelLocalId: 5 })).rejects.toThrow('503');
    expect(voice.state).toBe('error');
    expect(retrying).toEqual([{ attempt: 1, delaySeconds: 0.75 }]);

    await vi.advanceTimersByTimeAsync(700);
    expect(slBridge.voiceProvision).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    expect(slBridge.voiceProvision).toHaveBeenCalledTimes(2);
    expect(retrying.at(-1)).toEqual({ attempt: 2, delaySeconds: 1.5 });

    await vi.advanceTimersByTimeAsync(1500);
    expect(slBridge.voiceProvision).toHaveBeenCalledTimes(3);
    expect(voice.state).toBe('connected');
    lastPeer.channel.onopen?.(); // session up: the schedule starts over
    await voice.disconnect();
  });

  it('reconnects after the peer fails, and leaves the old session', async () => {
    const voice = new VoiceManager();
    voice.setRandom(() => 0);
    await voice.connect({ parcelLocalId: 5 });
    lastPeer.channel.onopen?.();
    const first = lastPeer;
    first.connectionState = 'failed';
    first.onconnectionstatechange?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(first.close).toHaveBeenCalled();
    expect(slBridge.voiceLogout).toHaveBeenCalledWith('vs-1');
    expect(voice.state).toBe('error');
    await vi.advanceTimersByTimeAsync(600);
    expect(lastPeer).not.toBe(first);
    expect(voice.state).toBe('connected');
    await voice.disconnect();
  });

  it('does not retry after disconnect() or when the microphone is refused', async () => {
    const voice = new VoiceManager();
    voice.setRandom(() => 0);
    (slBridge.voiceProvision as any).mockRejectedValueOnce(new Error('503'));
    await expect(voice.connect({})).rejects.toThrow();
    await voice.disconnect();
    await vi.advanceTimersByTimeAsync(30000);
    expect(slBridge.voiceProvision).toHaveBeenCalledTimes(1);

    (navigator.mediaDevices.getUserMedia as any).mockRejectedValueOnce(
      Object.assign(new Error('denied'), { name: 'NotAllowedError' }),
    );
    await expect(voice.connect({})).rejects.toThrow('denied');
    await vi.advanceTimersByTimeAsync(30000);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(2);
  });

  it('uses the parcel it is told about while waiting to retry', async () => {
    const voice = new VoiceManager();
    voice.setRandom(() => 0);
    (slBridge.voiceProvision as any).mockRejectedValueOnce(new Error('503'));
    await expect(voice.connect({ parcelLocalId: 1 })).rejects.toThrow();
    await voice.reprovision(9);
    await vi.advanceTimersByTimeAsync(600);
    expect((slBridge.voiceProvision as any).mock.calls.at(-1)[0]).toMatchObject({
      parcel_local_id: 9,
    });
    await voice.disconnect();
  });
});

describe('ViewerSession voice capabilities', () => {
  const { ViewerSession } = require('../../../core/viewer-session.cjs');
  const session = (post: ReturnType<typeof vi.fn>) => {
    const s = new ViewerSession(() => undefined);
    s.currentRegion = () => ({
      caps: {
        getCapability: async (name: string) => `https://sim/${name}`,
        capsPerformXMLPost: post,
      },
    });
    return s;
  };

  it('posts only whitelisted fields to the right capability', async () => {
    const post = vi.fn(async () => ({ ok: true }));
    const s = session(post);
    await s.voiceProvision({
      body: {
        jsep: { type: 'offer', sdp: 'S' },
        channel_type: 'local',
        voice_server_type: 'webrtc',
        evil: 1,
      },
    });
    expect(post).toHaveBeenCalledWith('https://sim/ProvisionVoiceAccountRequest', {
      jsep: { type: 'offer', sdp: 'S' },
      channel_type: 'local',
      voice_server_type: 'webrtc',
    });
    await s.voiceSignal({
      body: {
        viewer_session: 'v',
        voice_server_type: 'webrtc',
        candidate: { completed: true },
        x: 1,
      },
    });
    expect(post).toHaveBeenLastCalledWith('https://sim/VoiceSignalingRequest', {
      viewer_session: 'v',
      voice_server_type: 'webrtc',
      candidate: { completed: true },
    });
  });

  it('rejects other voice servers, missing offers and empty signaling', async () => {
    const s = session(vi.fn());
    await expect(
      s.voiceProvision({ body: { jsep: { type: 'offer', sdp: 'S' }, voice_server_type: 'vivox' } }),
    ).rejects.toThrow(/WebRTC/);
    await expect(s.voiceProvision({ body: { voice_server_type: 'webrtc' } })).rejects.toThrow(
      /offer/,
    );
    await expect(s.voiceProvision({})).rejects.toThrow(/body/);
    await expect(
      s.voiceSignal({ body: { viewer_session: 'v', voice_server_type: 'webrtc' } }),
    ).rejects.toThrow(/candidates/);
  });
});
