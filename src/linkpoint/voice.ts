import { Utils } from './utils';
import { slBridge } from './sl-bridge';

export type VoiceState = 'off' | 'connecting' | 'connected' | 'error';

export interface SpeakerInfo {
  id: string;
  name?: string;
  speaking: boolean;
  energy: number; // 0.0 to 1.0
  position?: [number, number, number];
  distance?: number;
  active: boolean; // whether currently in top 16 active spatial panners
}

interface RemoteSpeakerNode {
  id: string;
  stream: MediaStream;
  sourceNode: MediaStreamAudioSourceNode;
  gainNode: GainNode;
  pannerNode: PannerNode;
  analyserNode: AnalyserNode;
  position: [number, number, number];
  speaking: boolean;
  energy: number;
  connected: boolean;
}

/**
 * WebAudio 3D spatial voice engine with automatic region/parcel signaling,
 * HRTF panning, 16-speaker active panner capping, audio energy calculation,
 * and active speaker indicator events.
 */
export class VoiceManager extends Utils.EventEmitter {
  state: VoiceState = 'off';
  muted = true;

  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private viewerSession = '';
  private remoteAudio: HTMLAudioElement | null = null;

  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private localSource: MediaStreamAudioSourceNode | null = null;

  private speakerNodes = new Map<string, RemoteSpeakerNode>();
  private speakerPositions = new Map<string, [number, number, number]>();
  private speakerNames = new Map<string, string>();
  private listenerPosition: [number, number, number] = [128, 128, 25];

  private voiceActivityThreshold = 0.08;
  private maxActiveSpeakers = 16;
  private analysisInterval: ReturnType<typeof setInterval> | null = null;
  private currentParcelLocalId: number | undefined = undefined;

  private gestureListenersAttached = false;

  constructor() {
    super();
  }

  private setState(state: VoiceState, message = '') {
    this.state = state;
    this.emit('state', { state, message, muted: this.muted });
  }

  /**
   * Initialize and resume the WebAudio context within user gesture handlers to comply with autoplay policies.
   */
  public ensureAudioContext(): AudioContext {
    if (!this.gestureListenersAttached && typeof window !== 'undefined') {
      const unlock = () => {
        if (this.audioContext && this.audioContext.state === 'suspended') {
          void this.audioContext.resume().catch(() => {});
        }
      };
      window.addEventListener('pointerdown', unlock, { passive: true });
      window.addEventListener('keydown', unlock, { passive: true });
      window.addEventListener('touchstart', unlock, { passive: true });
      this.gestureListenersAttached = true;
    }

    if (!this.audioContext || this.audioContext.state === 'closed') {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioContext = new AudioContextClass({ latencyHint: 'interactive' });
      } else {
        throw new Error('WebAudio AudioContext is not supported by this browser');
      }
    }

    if (!this.masterGain && this.audioContext) {
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 1.0;
      this.masterGain.connect(this.audioContext.destination);
    }

    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume().catch(() => {});
    }

    return this.audioContext;
  }

  /**
   * Connect to WebRTC spatial voice session.
   * Microphone permission is requested only upon explicit user invocation.
   */
  async connect(options?: { parcelLocalId?: number }) {
    if (this.peer) return;
    this.currentParcelLocalId = options?.parcelLocalId;
    this.setState('connecting');

    try {
      const ctx = this.ensureAudioContext();

      // Request microphone permissions only upon explicit user action
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });

      // Local mic energy analyser for local speaking indicator
      if (ctx) {
        try {
          this.localSource = ctx.createMediaStreamSource(this.stream);
          this.localAnalyser = ctx.createAnalyser();
          this.localAnalyser.fftSize = 64;
          this.localSource.connect(this.localAnalyser);
        } catch (err) {
          console.warn('[VoiceManager] Local mic audio graph setup warning:', err);
        }
      }

      const peer = new RTCPeerConnection({
        iceServers: [
          { urls: ['stun:stun1.agni.secondlife.io:3478', 'stun:stun2.agni.secondlife.io:3478', 'stun:stun3.agni.secondlife.io:3478'] },
        ],
      });
      this.peer = peer;

      this.stream.getAudioTracks().forEach((track) => {
        track.enabled = !this.muted;
        peer.addTrack(track, this.stream!);
      });

      peer.ontrack = ({ track, streams }) => {
        const stream = streams[0] || new MediaStream([track]);
        this.addRemoteSpeaker(track.id || stream.id, stream);
      };

      const candidates: RTCIceCandidateInit[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => {
        clearTimeout(flushTimer);
        flushTimer = undefined;
        if (this.viewerSession && candidates.length) {
          void slBridge.voiceSignal(this.viewerSession, candidates.splice(0));
        }
      };

      peer.onicecandidate = ({ candidate }) => {
        if (candidate) {
          candidates.push(candidate.toJSON());
          flushTimer ||= setTimeout(flush, 100);
        } else if (this.viewerSession) {
          flush();
          void slBridge.voiceSignal(this.viewerSession, undefined, true);
        }
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') {
          this.setState('connected');
        } else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') {
          this.setState('error', `WebRTC ${peer.connectionState}`);
        }
      };

      await peer.setLocalDescription(await peer.createOffer({ offerToReceiveAudio: true }));

      const response = await slBridge.voiceProvision(peer.localDescription!.sdp!, this.currentParcelLocalId);
      const answer = response?.jsep;
      if (!response?.viewer_session || answer?.type !== 'answer' || !answer?.sdp) {
        throw new Error('The voice server returned an invalid answer');
      }

      this.viewerSession = String(response.viewer_session);
      await peer.setRemoteDescription(answer);
      flush();

      this.startAnalysis();
    } catch (error) {
      await this.disconnect();
      this.setState('error', error instanceof Error ? error.message : 'Voice connection failed');
      throw error;
    }
  }

  /**
   * Re-provision WebRTC channel credentials when crossing region or parcel boundaries.
   */
  async reprovision(parcelLocalId?: number) {
    this.currentParcelLocalId = parcelLocalId;
    if (this.state !== 'connected' && this.state !== 'connecting') return;
    if (!this.peer || !this.peer.localDescription?.sdp) return;

    try {
      const response = await slBridge.voiceProvision(this.peer.localDescription.sdp, parcelLocalId);
      if (response?.jsep && response.jsep.type === 'answer' && response.jsep.sdp) {
        if (response.viewer_session) {
          this.viewerSession = String(response.viewer_session);
        }
        await this.peer.setRemoteDescription(response.jsep);
        this.emit('reprovisioned', { parcelLocalId, viewerSession: this.viewerSession });
      }
    } catch (error) {
      console.warn('[VoiceManager] Automated re-provisioning notice:', error);
      this.emit('reprovision_error', error);
    }
  }

  /**
   * Add a remote WebRTC audio stream to the WebAudio spatial panner graph.
   */
  private addRemoteSpeaker(speakerId: string, stream: MediaStream) {
    const ctx = this.ensureAudioContext();
    if (!ctx || !this.masterGain) return;

    // Remove existing node for this speakerId if re-added
    if (this.speakerNodes.has(speakerId)) {
      this.removeRemoteSpeaker(speakerId);
    }

    try {
      const sourceNode = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      const pannerNode = ctx.createPanner();
      const analyserNode = ctx.createAnalyser();

      analyserNode.fftSize = 64;

      pannerNode.panningModel = 'HRTF';
      pannerNode.distanceModel = 'inverse';
      pannerNode.refDistance = 1;
      pannerNode.maxDistance = 100;
      pannerNode.rolloffFactor = 1;

      const pos = this.speakerPositions.get(speakerId) || [128, 128, 25];
      this.setNodePosition(pannerNode, pos);

      // WebAudio Graph: Source -> Gain -> Panner -> Analyser -> Master Gain
      sourceNode.connect(gainNode);
      gainNode.connect(pannerNode);
      pannerNode.connect(analyserNode);
      analyserNode.connect(this.masterGain);

      const speakerNode: RemoteSpeakerNode = {
        id: speakerId,
        stream,
        sourceNode,
        gainNode,
        pannerNode,
        analyserNode,
        position: pos,
        speaking: false,
        energy: 0,
        connected: true,
      };

      this.speakerNodes.set(speakerId, speakerNode);
      this.updateActivePannerNodes();
    } catch (err) {
      console.warn('[VoiceManager] Failed to create WebAudio graph for speaker:', speakerId, err);
      // Fallback HTMLAudioElement if WebAudio fails
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
      }
      this.remoteAudio.srcObject = stream;
      void this.remoteAudio.play().catch(() => {});
    }
  }

  private removeRemoteSpeaker(speakerId: string) {
    const node = this.speakerNodes.get(speakerId);
    if (node) {
      try {
        node.sourceNode.disconnect();
        node.gainNode.disconnect();
        node.pannerNode.disconnect();
        node.analyserNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.speakerNodes.delete(speakerId);
    }
  }

  private setNodePosition(panner: PannerNode, pos: [number, number, number]) {
    const x = pos[0] || 0;
    const y = pos[2] || 0;
    const z = -(pos[1] || 0);

    if (panner.positionX) {
      panner.positionX.value = x;
      panner.positionY.value = y;
      panner.positionZ.value = z;
    } else if ((panner as any).setPosition) {
      (panner as any).setPosition(x, y, z);
    }
  }

  /**
   * Update 3D position of an avatar speaker.
   */
  setSpeakerPosition(speakerId: string, position: [number, number, number], name?: string) {
    this.speakerPositions.set(speakerId, position);
    if (name) this.speakerNames.set(speakerId, name);

    const node = this.speakerNodes.get(speakerId);
    if (node) {
      node.position = position;
      this.setNodePosition(node.pannerNode, position);
    }

    this.updateActivePannerNodes();
  }

  /**
   * Update listener (camera / avatar) position in 3D audio space.
   */
  updateListenerPosition(position: [number, number, number], orientation?: [number, number, number]) {
    this.listenerPosition = position;
    if (this.audioContext && this.audioContext.listener) {
      const listener = this.audioContext.listener;
      const x = position[0] || 0;
      const y = position[2] || 0;
      const z = -(position[1] || 0);

      if (listener.positionX) {
        listener.positionX.value = x;
        listener.positionY.value = y;
        listener.positionZ.value = z;
      } else if ((listener as any).setPosition) {
        (listener as any).setPosition(x, y, z);
      }
    }

    this.updateActivePannerNodes();
  }

  /**
   * System CPU Guardrail: Cap spatial audio panner nodes at 16 nearest active speakers.
   */
  private updateActivePannerNodes() {
    const speakers = Array.from(this.speakerNodes.values());
    if (speakers.length === 0) return;

    // Calculate distance from listener for each speaker
    const sorted = speakers.map((node) => {
      const pos = node.position || [128, 128, 25];
      const dx = pos[0] - this.listenerPosition[0];
      const dy = pos[1] - this.listenerPosition[1];
      const dz = pos[2] - this.listenerPosition[2];
      const distance = Math.hypot(dx, dy, dz);
      return { node, distance };
    }).sort((a, b) => a.distance - b.distance);

    sorted.forEach((item, index) => {
      const active = index < this.maxActiveSpeakers;
      if (item.node.connected !== active) {
        item.node.connected = active;
        if (active) {
          item.node.gainNode.gain.value = 1.0;
        } else {
          item.node.gainNode.gain.value = 0.0; // mute panners beyond top 16 to save CPU
        }
      }
    });
  }

  /**
   * Perform audio energy analysis on all active speaker AnalyserNodes.
   */
  public analyzeSpeakers() {
    const dataArray = new Uint8Array(32);
    let changed = false;
    const speakerList: SpeakerInfo[] = [];

    // Analyze remote speakers
    this.speakerNodes.forEach((node, id) => {
      node.analyserNode.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const energy = sum / (dataArray.length * 255);
      const wasSpeaking = node.speaking;
      node.energy = energy;
      node.speaking = energy > this.voiceActivityThreshold;

      if (wasSpeaking !== node.speaking) {
        changed = true;
      }

      const pos = node.position || [128, 128, 25];
      const dist = Math.hypot(
        pos[0] - this.listenerPosition[0],
        pos[1] - this.listenerPosition[1],
        pos[2] - this.listenerPosition[2]
      );

      speakerList.push({
        id,
        name: this.speakerNames.get(id),
        speaking: node.speaking,
        energy,
        position: pos,
        distance: dist,
        active: node.connected,
      });
    });

    // Analyze local microphone if unmuted
    if (this.localAnalyser && !this.muted) {
      this.localAnalyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i];
      }
      const localEnergy = sum / (dataArray.length * 255);
      const localSpeaking = localEnergy > this.voiceActivityThreshold;

      speakerList.push({
        id: 'local_mic',
        name: 'Me',
        speaking: localSpeaking,
        energy: localEnergy,
        active: true,
      });
    }

    if (changed || speakerList.some((s) => s.speaking)) {
      this.emit('speaking', { speakers: speakerList });
    }
  }

  /**
   * Start audio energy analysis timer for real-time speaking indicators.
   */
  private startAnalysis() {
    if (this.analysisInterval) return;
    this.analysisInterval = setInterval(() => this.analyzeSpeakers(), 50);
  }

  private stopAnalysis() {
    if (this.analysisInterval) {
      clearInterval(this.analysisInterval);
      this.analysisInterval = null;
    }
  }

  /**
   * Check if a specific speaker or avatar is currently speaking.
   */
  isSpeaking(speakerId: string): boolean {
    const node = this.speakerNodes.get(speakerId);
    if (node) return node.speaking;
    if (speakerId === 'local_mic') {
      if (this.localAnalyser && !this.muted) {
        const data = new Uint8Array(32);
        this.localAnalyser.getByteFrequencyData(data);
        const sum = data.reduce((a, b) => a + b, 0);
        return sum / (data.length * 255) > this.voiceActivityThreshold;
      }
    }
    return false;
  }

  /**
   * Get audio energy level for a speaker.
   */
  getSpeakerEnergy(speakerId: string): number {
    const node = this.speakerNodes.get(speakerId);
    return node ? node.energy : 0;
  }

  /**
   * Get list of all currently tracked active speakers.
   */
  getActiveSpeakers(): SpeakerInfo[] {
    const list: SpeakerInfo[] = [];
    this.speakerNodes.forEach((node, id) => {
      const pos = node.position || [128, 128, 25];
      const dist = Math.hypot(
        pos[0] - this.listenerPosition[0],
        pos[1] - this.listenerPosition[1],
        pos[2] - this.listenerPosition[2]
      );
      list.push({
        id,
        name: this.speakerNames.get(id),
        speaking: node.speaking,
        energy: node.energy,
        position: pos,
        distance: dist,
        active: node.connected,
      });
    });
    return list;
  }

  /**
   * Set microphone muting state and synchronize local track state.
   */
  setMuted(muted: boolean) {
    this.muted = muted;
    this.stream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    this.emit('state', { state: this.state, message: '', muted });
    this.emit('mute_changed', { muted });
  }

  /**
   * Disconnect WebRTC voice session and cleanup WebAudio nodes.
   */
  async disconnect() {
    this.stopAnalysis();

    // Clean up WebAudio speaker nodes
    this.speakerNodes.forEach((_, id) => this.removeRemoteSpeaker(id));
    this.speakerNodes.clear();

    if (this.localSource) {
      try { this.localSource.disconnect(); } catch { /* ignore */ }
      this.localSource = null;
    }
    this.localAnalyser = null;

    const session = this.viewerSession;
    this.viewerSession = '';

    this.peer?.close();
    this.peer = null;

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;

    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    if (session) {
      await slBridge.voiceLogout(session).catch(() => {});
    }

    this.setState('off');
  }
}
