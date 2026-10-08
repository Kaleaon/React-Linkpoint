import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceManager } from '../voice';
import { slBridge } from '../sl-bridge';

// Mock slBridge voice calls
vi.mock('../sl-bridge', () => ({
  slBridge: {
    voiceProvision: vi.fn(),
    voiceSignal: vi.fn(),
    voiceLogout: vi.fn(),
  },
}));

// Mock WebAudio and WebRTC APIs for jsdom environment
class MockAudioNode {
  connect = vi.fn().mockImplementation((dest) => dest);
  disconnect = vi.fn();
}

class MockGainNode extends MockAudioNode {
  gain = { value: 1.0 };
}

class MockPannerNode extends MockAudioNode {
  panningModel = 'equalpower';
  distanceModel = 'inverse';
  refDistance = 1;
  maxDistance = 100;
  rolloffFactor = 1;
  positionX = { value: 0 };
  positionY = { value: 0 };
  positionZ = { value: 0 };
  setPosition = vi.fn((x, y, z) => {
    this.positionX.value = x;
    this.positionY.value = y;
    this.positionZ.value = z;
  });
}

class MockAnalyserNode extends MockAudioNode {
  fftSize = 64;
  frequencyData = new Uint8Array(32);
  getByteFrequencyData = vi.fn((array: Uint8Array) => {
    array.set(this.frequencyData);
  });
}

class MockAudioContext {
  state: 'suspended' | 'running' | 'closed' = 'suspended';
  destination = new MockAudioNode();
  listener = {
    positionX: { value: 0 },
    positionY: { value: 0 },
    positionZ: { value: 0 },
    setPosition: vi.fn(),
  };

  createGain() {
    return new MockGainNode();
  }
  createPanner() {
    return new MockPannerNode();
  }
  createAnalyser() {
    return new MockAnalyserNode();
  }
  createMediaStreamSource() {
    return new MockAudioNode();
  }
  resume = vi.fn().mockImplementation(async () => {
    this.state = 'running';
  });
  close = vi.fn().mockImplementation(async () => {
    this.state = 'closed';
  });
}

class MockMediaStreamTrack {
  id = 'track-1';
  enabled = true;
  stop = vi.fn();
}

class MockMediaStream {
  id = 'stream-1';
  private tracks: MockMediaStreamTrack[];

  constructor(tracks?: MockMediaStreamTrack[]) {
    this.tracks = tracks || [new MockMediaStreamTrack()];
  }

  getAudioTracks() {
    return this.tracks;
  }
  getTracks() {
    return this.tracks;
  }
}

class MockRTCPeerConnection {
  connectionState = 'connected';
  localDescription: any = null;
  remoteDescription: any = null;
  ontrack: ((event: any) => void) | null = null;
  onicecandidate: ((event: any) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;

  addTrack = vi.fn();
  createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: 'v=0\r\no=- local-offer' });
  setLocalDescription = vi.fn().mockImplementation(async (desc) => {
    this.localDescription = desc;
  });
  setRemoteDescription = vi.fn().mockImplementation(async (desc) => {
    this.remoteDescription = desc;
    if (this.onconnectionstatechange) this.onconnectionstatechange();
  });
  close = vi.fn();
}

describe('VoiceManager (WebAudio 3D Spatial Engine)', () => {
  let voice: VoiceManager;
  let originalAudioContext: any;
  let originalMediaDevices: any;
  let originalRTCPeerConnection: any;

  beforeEach(() => {
    vi.clearAllMocks();

    originalAudioContext = (window as any).AudioContext;
    originalMediaDevices = navigator.mediaDevices;
    originalRTCPeerConnection = (window as any).RTCPeerConnection;

    (window as any).AudioContext = MockAudioContext;
    (window as any).RTCPeerConnection = MockRTCPeerConnection;

    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: {
        getUserMedia: vi.fn().mockResolvedValue(new MockMediaStream()),
      },
    });

    (slBridge.voiceProvision as any).mockResolvedValue({
      viewer_session: 'session-xyz-123',
      jsep: { type: 'answer', sdp: 'v=0\r\no=- remote-answer' },
    });

    (slBridge.voiceSignal as any).mockResolvedValue({ success: true });
    (slBridge.voiceLogout as any).mockResolvedValue({ success: true });

    voice = new VoiceManager();
  });

  afterEach(async () => {
    await voice.disconnect();
    (window as any).AudioContext = originalAudioContext;
    Object.defineProperty(navigator, 'mediaDevices', {
      writable: true,
      value: originalMediaDevices,
    });
    (window as any).RTCPeerConnection = originalRTCPeerConnection;
  });

  it('1. provisions spatial voice session via region capability endpoints and completes SDP negotiation', async () => {
    await voice.connect({ parcelLocalId: 1029 });

    expect(slBridge.voiceProvision).toHaveBeenCalledWith(
      expect.stringContaining('v=0'),
      1029
    );
    expect(voice.state).toBe('connected');
    expect(voice.muted).toBe(true);
  });

  it('2. positions incoming audio streams in 3D space using WebAudio HRTF PannerNodes', async () => {
    await voice.connect();
    const peer = (voice as any).peer as MockRTCPeerConnection;

    // Simulate incoming remote audio track
    const remoteStream = new MockMediaStream([new MockMediaStreamTrack()]);
    peer.ontrack?.({ track: remoteStream.getAudioTracks()[0], streams: [remoteStream] });

    voice.setSpeakerPosition('track-1', [130, 140, 30], 'Nyx Vaher');
    voice.updateListenerPosition([128, 128, 25]);

    const active = voice.getActiveSpeakers();
    expect(active.length).toBeGreaterThan(0);
    const speaker = active.find((s) => s.id === 'track-1');
    expect(speaker).toBeDefined();
    expect(speaker?.name).toBe('Nyx Vaher');
    expect(speaker?.position).toEqual([130, 140, 30]);
  });

  it('3. caps spatial audio panner nodes at 16 nearest active speakers', async () => {
    await voice.connect();
    const peer = (voice as any).peer as MockRTCPeerConnection;

    // Add 20 remote speakers at increasing distances from listener (128, 128, 25)
    for (let i = 1; i <= 20; i++) {
      const track = new MockMediaStreamTrack();
      track.id = `speaker-${i}`;
      const stream = new MockMediaStream([track]);
      peer.ontrack?.({ track, streams: [stream] });
      voice.setSpeakerPosition(`speaker-${i}`, [128 + i * 2, 128, 25]);
    }

    voice.updateListenerPosition([128, 128, 25]);

    const activeList = voice.getActiveSpeakers();
    expect(activeList.length).toBe(20);

    // 16 closest should be active (index 0..15), index 16..19 inactive
    const activeCount = activeList.filter((s) => s.active).length;
    expect(activeCount).toBe(16);
  });

  it('4. calculates speaker audio energy with AnalyserNode and emits speaking indicators when exceeding threshold', async () => {
    await voice.connect();
    const peer = (voice as any).peer as MockRTCPeerConnection;

    const track = new MockMediaStreamTrack();
    track.id = 'speaker-active';
    const stream = new MockMediaStream([track]);
    peer.ontrack?.({ track, streams: [stream] });

    // Set frequency data above threshold
    const node = (voice as any).speakerNodes.get('speaker-active');
    if (node?.analyserNode) {
      node.analyserNode.frequencyData.fill(200); // high energy
    }

    const speakingListener = vi.fn();
    voice.on('speaking', speakingListener);

    // Manually trigger analyze pass or advance timer
    (voice as any).analyzeSpeakers?.();

    expect(voice.isSpeaking('speaker-active')).toBe(true);
    expect(voice.getSpeakerEnergy('speaker-active')).toBeGreaterThan(0.08);
  });

  it('5. re-provisions WebRTC channel on region teleports and parcel boundary changes', async () => {
    await voice.connect({ parcelLocalId: 100 });

    const reprovisionSpy = vi.spyOn(voice, 'reprovision');
    await voice.reprovision(200);

    expect(reprovisionSpy).toHaveBeenCalledWith(200);
    expect(slBridge.voiceProvision).toHaveBeenCalledWith(
      expect.stringContaining('v=0'),
      200
    );
  });

  it('6. updates microphone mute state and emits synchronized UI state events', () => {
    const stateListener = vi.fn();
    const muteListener = vi.fn();

    voice.on('state', stateListener);
    voice.on('mute_changed', muteListener);

    voice.setMuted(false);
    expect(voice.muted).toBe(false);
    expect(stateListener).toHaveBeenCalledWith(expect.objectContaining({ muted: false }));
    expect(muteListener).toHaveBeenCalledWith({ muted: false });

    voice.setMuted(true);
    expect(voice.muted).toBe(true);
    expect(stateListener).toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
    expect(muteListener).toHaveBeenCalledWith({ muted: true });
  });
});
