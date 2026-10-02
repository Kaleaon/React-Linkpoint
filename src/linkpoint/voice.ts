import { Utils } from './utils';
import { slBridge } from './sl-bridge';

export type VoiceState = 'off' | 'connecting' | 'connected' | 'error';

/** Modern SL WebRTC voice transport (the legacy Vivox SDK is no longer used by SL). */
export class VoiceManager extends Utils.EventEmitter {
  state: VoiceState = 'off';
  muted = true;
  private peer: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private viewerSession = '';
  private remoteAudio: HTMLAudioElement | null = null;

  private setState(state: VoiceState, message = '') { this.state = state; this.emit('state', { state, message, muted: this.muted }); }

  async connect() {
    if (this.peer) return;
    this.setState('connecting');
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      const peer = new RTCPeerConnection({ iceServers: [{ urls: ['stun:stun1.agni.secondlife.io:3478', 'stun:stun2.agni.secondlife.io:3478', 'stun:stun3.agni.secondlife.io:3478'] }] });
      this.peer = peer;
      this.stream.getAudioTracks().forEach((track) => { track.enabled = !this.muted; peer.addTrack(track, this.stream!); });
      peer.ontrack = ({ streams }) => {
        if (!this.remoteAudio) { this.remoteAudio = new Audio(); this.remoteAudio.autoplay = true; }
        this.remoteAudio.srcObject = streams[0]; void this.remoteAudio.play().catch(() => {});
      };
      const candidates: RTCIceCandidateInit[] = [];
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      const flush = () => { clearTimeout(flushTimer); flushTimer = undefined; if (this.viewerSession && candidates.length) void slBridge.voiceSignal(this.viewerSession, candidates.splice(0)); };
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) { candidates.push(candidate.toJSON()); flushTimer ||= setTimeout(flush, 100); }
        else if (this.viewerSession) { flush(); void slBridge.voiceSignal(this.viewerSession, undefined, true); }
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') this.setState('connected');
        else if (peer.connectionState === 'failed' || peer.connectionState === 'disconnected') this.setState('error', `WebRTC ${peer.connectionState}`);
      };
      await peer.setLocalDescription(await peer.createOffer({ offerToReceiveAudio: true }));
      const response = await slBridge.voiceProvision(peer.localDescription!.sdp!);
      const answer = response?.jsep;
      if (!response?.viewer_session || answer?.type !== 'answer' || !answer?.sdp) throw new Error('The voice server returned an invalid answer');
      this.viewerSession = String(response.viewer_session);
      await peer.setRemoteDescription(answer);
      flush();
    } catch (error) {
      await this.disconnect();
      this.setState('error', error instanceof Error ? error.message : 'Voice connection failed');
      throw error;
    }
  }

  setMuted(muted: boolean) { this.muted = muted; this.stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; }); this.emit('state', { state: this.state, muted }); }

  async disconnect() {
    const session = this.viewerSession; this.viewerSession = '';
    this.peer?.close(); this.peer = null;
    this.stream?.getTracks().forEach((track) => track.stop()); this.stream = null;
    if (this.remoteAudio) { this.remoteAudio.srcObject = null; this.remoteAudio = null; }
    if (session) await slBridge.voiceLogout(session).catch(() => {});
    this.setState('off');
  }
}
