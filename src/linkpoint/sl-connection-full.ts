/**
 * Linkpoint PWA - Complete SL Connection Implementation
 */

import { toLoginFailure } from './login-failure';
import { Utils } from './utils';
import { SLProtocol } from './sl-protocol-real';
import { LLSD } from './llsd';
import { corsHandler } from './cors-handler';
import { slBridge } from './sl-bridge';

export class SLConnectionFull extends Utils.EventEmitter {
  public state: string = 'IDLE'; // IDLE, AUTHENTICATING, CONNECTING, CONNECTED
  public connected: boolean = false;
  public authReply: any = null;
  public agentId: string | null = null;
  public sessionId: string | null = null;
  public circuitCode: number | null = null;
  public simAddress: string | null = null;
  public simPort: number | null = null;
  public seedCapability: string | null = null;
  public capabilities: Record<string, string> = {};

  public inventoryRoot: string | null = null;
  public eventQueueRunning: boolean = false;
  private lastEventId: number | null = null;
  private eventQueueTimer: ReturnType<typeof setTimeout> | null = null;
  private eventQueueFailures = 0;
  private removeNativeListener: (() => void) | null = null;

  // Real-Time Second Life Telemetry & Diagnostics. Every figure is unknown
  // (null / empty) until the simulator or login reply supplies it; nothing here
  // is a placeholder that could be mistaken for a measurement.
  private diagnostics = {
    connected: false,
    latencyMs: null as number | null,
    packetLossPct: null as number | null,
    packetsIn: null as number | null,
    packetsOut: null as number | null,
    lastPacketTimestamp: null as number | null,
    simName: '',
    simAddress: '',
    simPort: null as number | null,
    circuitCode: null as number | null,
    agentId: '',
  };

  public getDiagnostics() {
    const isConn = this.connected || slBridge.connected;
    return {
      ...this.diagnostics,
      connected: isConn,
      agentId: this.agentId || this.diagnostics.agentId || (typeof window !== 'undefined' && (window as any).app?.auth?.user?.id) || '',
      simName: this.authReply?.sim_name || (typeof window !== 'undefined' && (window as any).app?.world?.regionName) || this.diagnostics.simName,
      // Prefer what the login reply actually told us over the last polled snapshot.
      simAddress: this.simAddress || this.diagnostics.simAddress,
      simPort: this.simPort || this.diagnostics.simPort,
      circuitCode: this.circuitCode || this.diagnostics.circuitCode,
    };
  }

  public async fetchDiagnostics() {
    if (slBridge.connected) {
      try {
        const live = await slBridge.fetchDiagnostics();
        if (live) {
          this.diagnostics = { ...this.diagnostics, ...live };
          this.emit('diagnostics_updated', this.getDiagnostics());
          return this.getDiagnostics();
        }
      } catch (err) {
        console.warn('[SL Connection] fetchDiagnostics warning:', err);
      }
    }
    return this.getDiagnostics();
  }

  constructor() {
    super();
  }

  private resetConnectionState() {
    this.removeNativeListener?.();
    this.removeNativeListener = null;
    this.connected = false;
    this.balance = null;
    this.authReply = null;
    this.agentId = null;
    this.sessionId = null;
    this.circuitCode = null;
    this.simAddress = null;
    this.simPort = null;
    this.seedCapability = null;
    this.capabilities = {};
    this.inventoryRoot = null;
    this.eventQueueRunning = false;
    this.lastEventId = null;
    if (this.eventQueueTimer) clearTimeout(this.eventQueueTimer);
    this.eventQueueTimer = null;
    this.eventQueueFailures = 0;
  }

  async connect(gridId: string, username: string, password: string, startLocation: string = 'last', mfa: { token?: string; hash?: string } = {}) {
    this.resetConnectionState();
    this.setState('AUTHENTICATING');

    try {
      if (gridId === 'gemini' || gridId === 'offline' || gridId === 'local') {
        throw new Error('Synthetic grid sessions have been removed; select a live Second Life or OpenSim endpoint');
      }

      if (window.linkpointDesktop?.connectViewer) {
        const loginUrl = SLProtocol.getLoginUrl(gridId);
        if (!loginUrl) throw new Error('Invalid or insecure grid selected');
        await window.linkpointDesktop.allowLoginEndpoint(loginUrl);
        this.removeNativeListener = window.linkpointDesktop.onViewerEvent(({ type, data }) => {
          if (type === 'chat') this.emit('ChatFromSimulator', data);
          else if (type === 'im') this.emit('ChatFromSimulator', { ...data, chatType: 'im' });
          else if (type === 'script-dialog') this.emit('script_dialog', data);
          else if (type === 'lure') this.emit('lure', data);
          else if (type === 'friend-status') this.emit('friend_status', data);
          else if (type === 'friend-request') this.emit('friend_request', data);
          else if (type === 'friend-remove') this.emit('friend_remove', data);
          else if (type === 'avatar_presence' || type === 'avatar-presence' || type === 'AvatarPresence') {
            this.emit('avatar_presence', data);
            this.emit('avatar-presence', data);
          }
          else if (type === 'disconnected') {
            this.connected = false;
            this.emit('disconnected', data);
          } else {
            this.emit(`scene:${type}`, data);
          }
        });
        const loginResult = await window.linkpointDesktop.connectViewer({
          loginUrl,
          username,
          password,
          start: startLocation,
          mfaToken: mfa.token,
          mfaHash: mfa.hash,
        });
        this.authReply = loginResult;
        this.agentId = String(loginResult.agent_id);
        this.sessionId = String(loginResult.session_id);
        this.circuitCode = Number(loginResult.circuit_code);
        this.setState('CONNECTED');
        this.connected = true;
        this.emit('connected', loginResult);
        return loginResult;
      }

      // Authentic Second Life connection via node-metaverse session bridge
      const loginUrl = SLProtocol.getLoginUrl(gridId) || gridId;
      this.setState('AUTHENTICATING');

      slBridge.removeAllListeners();
      slBridge.on('chat', (data: any) => this.emit('ChatFromSimulator', data));
      slBridge.on('im', (data: any) => this.emit('ChatFromSimulator', { ...data, chatType: 'im' }));
      slBridge.on('group-chat', (data: any) => this.emit('ChatFromSimulator', { ...data, chatType: 'group', type: 'group' }));
      slBridge.on('group-notice', (data: any) => this.emit('group_notice', data));
      slBridge.on('friend-status', (data: any) => this.emit('friend_status', data));
      slBridge.on('friend-request', (data: any) => this.emit('friend_request', data));
      slBridge.on('script-dialog', (data: any) => this.emit('script_dialog', data));
      slBridge.on('lure', (data: any) => this.emit('lure', data));
      slBridge.on('friend-response', (data: any) => this.emit('friend_response', data));
      slBridge.on('friend-remove', (data: any) => this.emit('friend_remove', data));
      slBridge.on('object-add', (data: any) => this.emit('scene:object-add', data));
      slBridge.on('object-update', (data: any) => this.emit('scene:object-update', data));
      slBridge.on('object-remove', (data: any) => this.emit('scene:object-remove', data));
      slBridge.on('asset-ready', (data: any) => this.emit('scene:asset-ready', data));
      slBridge.on('texture-ready', (data: any) => this.emit('scene:texture-ready', data));
      slBridge.on('material-ready', (data: any) => this.emit('scene:material-ready', data));
      slBridge.on('world-data', (data: any) => this.emit('scene:world-data', data));
      slBridge.on('environment', (data: any) => this.emit('scene:environment', data));
      slBridge.on('terrain', (data: any) => this.emit('scene:terrain', data));
      slBridge.on('parcel-properties', (data: any) => this.emit('ParcelProperties', { parcelData: data }));
      slBridge.on('coarse-avatar', (data: any) => this.emit('CoarseAvatarUpdate', data));
      slBridge.on('avatar_presence', (data: any) => {
        this.emit('avatar_presence', data);
        this.emit('avatar-presence', data);
      });
      slBridge.on('avatar-presence', (data: any) => {
        this.emit('avatar_presence', data);
        this.emit('avatar-presence', data);
      });
      slBridge.on('disconnected', (data: any) => {
        this.connected = false;
        this.setState('IDLE');
        this.emit('disconnected', data);
      });

      const loginResult = await slBridge.connect({
        loginUrl,
        username,
        password,
        start: startLocation,
        mfaToken: mfa.token,
        mfaHash: mfa.hash,
      });

      this.authReply = loginResult;
      this.agentId = String(loginResult.agent_id);
      this.sessionId = String(loginResult.sessionId);
      // The bridge talks to the real simulator on our behalf, so the client does
      // not know its address or circuit; diagnostics fill these in from the server.
      this.circuitCode = Number(loginResult.circuit_code) || null;
      this.inventoryRoot = loginResult.inventory_root || null;
      this.simAddress = null;
      this.simPort = null;
      this.setState('CONNECTED');
      this.connected = true;

      // Load initial real friends from Second Life
      try {
        const friendsList = await slBridge.fetchFriends();
        if (Array.isArray(friendsList) && friendsList.length > 0) {
          this.emit('friends_loaded', friendsList);
        }
      } catch (fErr) {
        console.warn('[SL Connection] fetchFriends warning:', fErr);
      }

      this.emit('connected', loginResult);
      return loginResult;

    } catch (error) {
      this.resetConnectionState();
      this.setState('IDLE');
      const failure = toLoginFailure(error);
      this.emit('connection_failed', failure);
      throw failure;
    }
  }

  async autoLogin(startLocation: string = 'last') {
    try {
      this.setState('AUTHENTICATING');

      slBridge.removeAllListeners();
      slBridge.on('chat', (data: any) => this.emit('ChatFromSimulator', data));
      slBridge.on('im', (data: any) => this.emit('ChatFromSimulator', { ...data, chatType: 'im' }));
      slBridge.on('group-chat', (data: any) => this.emit('ChatFromSimulator', { ...data, chatType: 'group', type: 'group' }));
      slBridge.on('group-notice', (data: any) => this.emit('group_notice', data));
      slBridge.on('friend-status', (data: any) => this.emit('friend_status', data));
      slBridge.on('friend-request', (data: any) => this.emit('friend_request', data));
      slBridge.on('script-dialog', (data: any) => this.emit('script_dialog', data));
      slBridge.on('lure', (data: any) => this.emit('lure', data));
      slBridge.on('friend-response', (data: any) => this.emit('friend_response', data));
      slBridge.on('friend-remove', (data: any) => this.emit('friend_remove', data));
      slBridge.on('object-add', (data: any) => this.emit('scene:object-add', data));
      slBridge.on('object-update', (data: any) => this.emit('scene:object-update', data));
      slBridge.on('object-remove', (data: any) => this.emit('scene:object-remove', data));
      slBridge.on('asset-ready', (data: any) => this.emit('scene:asset-ready', data));
      slBridge.on('texture-ready', (data: any) => this.emit('scene:texture-ready', data));
      slBridge.on('material-ready', (data: any) => this.emit('scene:material-ready', data));
      slBridge.on('world-data', (data: any) => this.emit('scene:world-data', data));
      slBridge.on('environment', (data: any) => this.emit('scene:environment', data));
      slBridge.on('terrain', (data: any) => this.emit('scene:terrain', data));
      slBridge.on('parcel-properties', (data: any) => this.emit('ParcelProperties', { parcelData: data }));
      slBridge.on('coarse-avatar', (data: any) => this.emit('CoarseAvatarUpdate', data));
      slBridge.on('avatar_presence', (data: any) => {
        this.emit('avatar_presence', data);
        this.emit('avatar-presence', data);
      });
      slBridge.on('avatar-presence', (data: any) => {
        this.emit('avatar_presence', data);
        this.emit('avatar-presence', data);
      });
      slBridge.on('disconnected', (data: any) => {
        this.connected = false;
        this.setState('IDLE');
        this.emit('disconnected', data);
      });

      const loginResult = await slBridge.autoLogin(startLocation);

      this.authReply = loginResult;
      this.agentId = String(loginResult.agent_id);
      this.sessionId = String(loginResult.sessionId);
      // The bridge talks to the real simulator on our behalf, so the client does
      // not know its address or circuit; diagnostics fill these in from the server.
      this.circuitCode = Number(loginResult.circuit_code) || null;
      this.inventoryRoot = loginResult.inventory_root || null;
      this.simAddress = null;
      this.simPort = null;
      this.setState('CONNECTED');
      this.connected = true;

      // Load initial real friends from Second Life
      try {
        const friendsList = await slBridge.fetchFriends();
        if (Array.isArray(friendsList) && friendsList.length > 0) {
          this.emit('friends_loaded', friendsList);
        }
      } catch (fErr) {
        console.warn('[SL Connection] fetchFriends warning:', fErr);
      }

      this.emit('connected', loginResult);
      return loginResult;
    } catch (error) {
      this.resetConnectionState();
      this.setState('IDLE');
      this.emit('connection_failed', error);
      throw error;
    }
  }

  async fetchCapabilities() {
    try {
      const capsToRequest = ['EventQueueGet', 'FetchInventoryDescendents2', 'ChatSessionRequest', 'GetDisplayNames'];
      const response = await corsHandler.makeRequest(this.seedCapability!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML(capsToRequest)
      });

      if (response && response.ok) {
        const text = await response.text();
        this.capabilities = LLSD.parseXML(text);
        this.emit('capabilities_ready', this.capabilities);
      }
    } catch (error) {
      console.error('Failed to fetch capabilities:', error);
    }
  }

  startEventQueue() {
    if (this.eventQueueRunning) return;
    this.eventQueueRunning = true;
    this.pollEventQueue();
  }

  async pollEventQueue() {
    if (!this.eventQueueRunning) return;

    try {
      const url = this.capabilities.EventQueueGet;
      const body = this.lastEventId 
        ? LLSD.buildXML({ ack: this.lastEventId, done: false })
        : LLSD.buildXML({ done: false });

      const response = await corsHandler.makeRequest(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body
      });

      if (response && response.ok) {
        const text = await response.text();
        const data = LLSD.parseXML(text);
        
        if (data && data.events) {
          data.events.forEach((event: any) => this.handleEvent(event));
          if (data.id) this.lastEventId = data.id;
        }
        this.eventQueueFailures = 0;
      } else {
        this.eventQueueFailures++;
      }
    } catch (error) {
      console.error('Event queue error:', error);
      this.eventQueueFailures++;
    }

    if (this.eventQueueRunning) {
      if (this.eventQueueFailures >= 5) {
        this.eventQueueRunning = false;
        this.emit('event_queue_failed');
        return;
      }
      const delay = Math.min(30_000, 1_000 * 2 ** this.eventQueueFailures);
      this.eventQueueTimer = setTimeout(() => this.pollEventQueue(), delay);
    }
  }

  handleEvent(event: any) {
    console.log('Event:', event.message, event.body);
    const body = event.body ?? event.data ?? event;
    this.emit(event.message, body);
    if (event.message?.includes('_')) {
      this.emit(event.message.replace(/_/g, '-'), body);
    } else if (event.message?.includes('-')) {
      this.emit(event.message.replace(/-/g, '_'), body);
    }
    const lower = String(event.message || '').toLowerCase();
    if (lower === 'avatar_presence' || lower === 'avatarpresence' || lower === 'avatar-presence') {
      this.emit('avatar_presence', body);
      this.emit('avatar-presence', body);
    }
  }

  // ---- viewer actions -----------------------------------------------------
  // Both the desktop app and the web server run the same validated actions.
  private requireConnected() {
    if (!this.connected && !slBridge.connected) throw new Error('Not connected to a grid');
  }

  /** Teleport to "secondlife://Region/x/y/z", a map URL, or "Region/x/y/z". */
  async teleportTo(destination: string) {
    this.requireConnected();
    const result = window.linkpointDesktop?.teleport
      ? await window.linkpointDesktop.teleport({ destination })
      : await slBridge.teleport({ destination });
    this.emit('teleport_requested', result);
    return result;
  }

  /** A resident's public profile picture (base64), or null when they have none. */
  async fetchProfilePhoto(name: string, full = false) {
    this.requireConnected();
    return window.linkpointDesktop?.fetchProfilePhoto ? window.linkpointDesktop.fetchProfilePhoto({ name, full }) : slBridge.fetchProfilePhoto(name, full);
  }

  /** Answer a script dialog: pass a button index, or `text` for a text box. */
  async respondScriptDialog(request: { id: string; buttonIndex?: number; text?: string }) {
    this.requireConnected();
    return window.linkpointDesktop?.respondScriptDialog ? window.linkpointDesktop.respondScriptDialog(request) : slBridge.respondScriptDialog(request);
  }

  /** Accept a teleport lure. Resolves when the grid reports the teleport result. */
  async acceptLure(id: string) {
    this.requireConnected();
    return window.linkpointDesktop?.acceptLure ? window.linkpointDesktop.acceptLure({ id }) : slBridge.acceptLure({ id });
  }

  /** Forget an interaction on the server. Nothing is sent to the grid. */
  async dismissInteraction(id: string) {
    this.requireConnected();
    return window.linkpointDesktop?.dismissInteraction ? window.linkpointDesktop.dismissInteraction({ id }) : slBridge.dismissInteraction({ id });
  }

  /** Touch an object by id. Face and texture coordinates are sent only when known. */
  async touchObject(target: { id?: string; localId?: number; face?: number; uv?: number[]; st?: number[]; position?: number[] }) {
    this.requireConnected();
    return window.linkpointDesktop?.touchObject ? window.linkpointDesktop.touchObject(target) : slBridge.touchObject(target);
  }

  async sit(id?: string) {
    this.requireConnected();
    return window.linkpointDesktop?.sit ? window.linkpointDesktop.sit({ id }) : slBridge.sit({ id });
  }

  async stand() {
    this.requireConnected();
    return window.linkpointDesktop?.stand ? window.linkpointDesktop.stand() : slBridge.stand();
  }

  /** L$ balance, or null when the grid has not answered. Never a guess. */
  public balance: number | null = null;

  async refreshBalance(): Promise<number | null> {
    if (!this.connected && !slBridge.connected) { this.balance = null; return null; }
    try {
      const { balance } = window.linkpointDesktop?.getBalance ? await window.linkpointDesktop.getBalance() : await slBridge.getBalance();
      this.balance = Number.isFinite(balance) ? balance : null;
    } catch (error) {
      console.warn('[SL Connection] balance unavailable:', error);
      this.balance = null;
    }
    this.emit('balance_updated', this.balance);
    return this.balance;
  }

  async sendChat(message: string, channel: number = 0, type: number = 1) {
    if (!this.connected) throw new Error('Not connected to a grid');
    if (window.linkpointDesktop?.sendChat) {
      await window.linkpointDesktop.sendChat({ message, channel, type });
      return;
    }
    if (slBridge.connected) {
      await slBridge.sendChat(message, channel, type);
      return;
    }
    if (!this.capabilities.ChatSessionRequest) throw new Error('This grid did not provide a chat capability');

    try {
      await corsHandler.makeRequest(this.capabilities.ChatSessionRequest, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML({ message, channel, type })
      });
    } catch (error) {
      console.error('Failed to send chat:', error);
      throw error;
    }
  }

  async sendInstantMessage(recipientId: string, message: string) {
    if (!this.connected) throw new Error('Not connected to a grid');
    if (window.linkpointDesktop?.sendInstantMessage) {
      await window.linkpointDesktop.sendInstantMessage({ recipientId, message });
      return;
    }
    if (slBridge.connected) {
      await slBridge.sendInstantMessage(recipientId, message);
      return;
    }
    if (this.capabilities.ChatSessionRequest) {
      await corsHandler.makeRequest(this.capabilities.ChatSessionRequest, {
        method: 'POST',
        headers: { 'Content-Type': 'application/llsd+xml' },
        body: LLSD.buildXML({ message, to: recipientId, type: 4 })
      });
      return;
    }
    await this.sendChat(message, 0, 4);
  }

  async sendGroupMessage(groupId: string, message: string) {
    if (!this.connected) throw new Error('Not connected to a grid');
    if (window.linkpointDesktop?.sendGroupMessage) {
      await window.linkpointDesktop.sendGroupMessage({ groupId, message });
      return;
    }
    if (slBridge.connected) {
      await slBridge.sendGroupMessage(groupId, message);
      return;
    }
    // Never fall back to local chat: a group message must not be spoken in the region.
    throw new Error('Group chat is unavailable on this connection');
  }

  async sendFriendRequest(recipientId: string, message?: string) {
    if (!this.connected) throw new Error('Not connected to a grid');
    if (window.linkpointDesktop?.sendFriendRequest) {
      await window.linkpointDesktop.sendFriendRequest({ recipientId, message });
      return;
    }
    if (slBridge.connected) {
      await slBridge.sendFriendRequest(recipientId, message);
      return;
    }
    throw new Error('Friend requests are unavailable on this connection');
  }

  async fetchFriends() {
    if (!this.connected) return [];
    if (window.linkpointDesktop?.fetchFriends) return window.linkpointDesktop.fetchFriends();
    if (slBridge.connected) return slBridge.fetchFriends();
    return [];
  }


  getCapability(name: string) {
    return this.capabilities[name];
  }
  private setState(newState: string) {
    this.state = newState;
    this.emit('state_changed', newState);
  }

  async logout() {
    this.eventQueueRunning = false;
    if (this.eventQueueTimer) clearTimeout(this.eventQueueTimer);
    this.eventQueueTimer = null;
    this.removeNativeListener?.();
    this.removeNativeListener = null;
    if (slBridge.connected) slBridge.disconnect();
    if (window.linkpointDesktop?.disconnectViewer) await window.linkpointDesktop.disconnectViewer();
    this.connected = false;
    this.setState('IDLE');
    this.emit('disconnected');
  }
}
