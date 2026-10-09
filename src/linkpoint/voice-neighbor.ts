import { slBridge } from './sl-bridge';
import { DATA_CHANNEL_LABEL, iceServersForGrid, joinMessage, mungeOpusSdp, provisionBody, signalingBody } from './voice-protocol';

export interface NeighborConnectionOptions {
  grid?: string;
  /** A message from this neighbour's voice server. */
  onData(raw: string, handle: string): void;
  /** The neighbour's server mixes the people in its own region for us; play what it sends. */
  onRemoteStream(stream: MediaStream, handle: string): void;
  /** The peer failed or the data channel closed after it was up. */
  onLost(handle: string): void;
}

/**
 * A connection to a neighbouring region's voice server (cross-region voice, `LLVoiceWebRTCSpatialConnection` for a region the
 * avatar is not in). It only listens: the viewer opens it muted, because the avatar's own voice goes out through the connection
 * for the region it is in and sending it to neighbours too would echo. It declares itself non-primary when it joins.
 */
export class VoiceNeighborConnection {
  private peer: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private viewerSession = '';
  private closed = false;
  joined = false;

  constructor(readonly handle: string, private readonly options: NeighborConnectionOptions) {}

  get isOpen() { return this.dataChannel?.readyState === 'open' && this.joined; }

  async connect() {
    const peer = new RTCPeerConnection({ iceServers: iceServersForGrid(this.options.grid) });
    this.peer = peer;
    try {
      const channel = peer.createDataChannel(DATA_CHANNEL_LABEL, { ordered: true });
      this.dataChannel = channel;
      channel.onopen = () => {
        if (this.closed) return;
        channel.send(joinMessage(false)); // non-primary: a join without `p`
        this.joined = true;
      };
      channel.onmessage = (event) => { if (typeof event.data === 'string') this.options.onData(event.data, this.handle); };
      channel.onclose = () => { if (!this.closed && this.joined) this.options.onLost(this.handle); };
      // An audio line that sends nothing: the connection has no microphone.
      peer.addTransceiver('audio', { direction: 'sendrecv' });
      peer.ontrack = ({ track, streams }) => this.options.onRemoteStream(streams[0] || new MediaStream([track]), this.handle);

      const pending: RTCIceCandidateInit[] = [];
      let gatheringDone = false;
      const flush = async () => {
        if (!this.viewerSession) return;
        if (pending.length) {
          const body = signalingBody(this.viewerSession, pending.splice(0), false);
          if (body) await slBridge.voiceSignal(body).catch(() => {});
        }
        if (gatheringDone) {
          gatheringDone = false;
          const body = signalingBody(this.viewerSession, [], true);
          if (body) await slBridge.voiceSignal(body).catch(() => {});
        }
      };
      let flushTimer: ReturnType<typeof setTimeout> | undefined;
      peer.onicecandidate = ({ candidate }) => {
        if (candidate) { pending.push(candidate.toJSON()); flushTimer ||= setTimeout(() => { flushTimer = undefined; void flush(); }, 100); }
        else { gatheringDone = true; void flush(); }
      };
      peer.onconnectionstatechange = () => { if (peer.connectionState === 'failed' && !this.closed) this.options.onLost(this.handle); };

      const offer = await peer.createOffer({ offerToReceiveAudio: true });
      const sdp = mungeOpusSdp(offer.sdp || '');
      await peer.setLocalDescription({ type: 'offer', sdp });
      // Estate channel: provisioned on the neighbour without a parcel id.
      const response = await slBridge.voiceProvision(provisionBody(sdp, { kind: 'local' }), this.handle);
      const answer = response?.jsep;
      if (!response?.viewer_session || answer?.type !== 'answer' || !answer?.sdp) throw new Error('The neighbouring voice server returned an invalid answer');
      this.viewerSession = String(response.viewer_session);
      if (this.closed) { await this.close(); return; }
      await peer.setRemoteDescription(answer);
      await flush();
    } catch (error) {
      await this.close();
      throw error;
    }
  }

  send(json: string) {
    if (this.dataChannel?.readyState === 'open') this.dataChannel.send(json);
  }

  async close() {
    this.closed = true;
    this.joined = false;
    if (this.peer) this.peer.onconnectionstatechange = null;
    if (this.dataChannel) { this.dataChannel.onopen = null; this.dataChannel.onmessage = null; this.dataChannel.onclose = null; try { this.dataChannel.close(); } catch { /* closed */ } }
    this.dataChannel = null;
    this.peer?.close(); this.peer = null;
    const session = this.viewerSession; this.viewerSession = '';
    if (session) await slBridge.voiceLogout(session).catch(() => {});
  }
}
