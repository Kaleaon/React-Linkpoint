/**
 * Linkpoint PWA - Complete SL Connection Implementation
 */

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

  constructor() {
    super();
  }

  private resetConnectionState() {
    this.removeNativeListener?.();
    this.removeNativeListener = null;
    this.connected = false;
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

  async connect(gridId: string, username: string, password: string, startLocation: string = 'last') {
    this.resetConnectionState();
    this.setState('AUTHENTICATING');

    try {
      if (gridId === 'gemini' || gridId === 'offline' || gridId === 'local') {
        const nameParts = (username || 'Ruth Resident').replace(/[._]/g, ' ').trim().split(/\s+/);
        const firstName = nameParts[0] || 'Ruth';
        const lastName = nameParts.length > 1 ? nameParts[1] : 'Resident';
        const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
        const sessionId = Utils.generateUUID();
        const loginResult: any = {
          login: 'true',
          session_id: sessionId,
          secure_session_id: Utils.generateUUID(),
          agent_id: Utils.generateUUID(),
          first_name: firstName,
          last_name: lastName,
          circuit_code: '1001',
          sim_ip: '127.0.0.1',
          sim_port: '9000',
          seed_capability: `${origin}/api/caps/${sessionId}/`,
          'inventory-root': [{ folder_id: Utils.generateUUID() }],
          message: gridId === 'gemini'
            ? 'Connected via Gemini AI Grid Proxy (gemini-3.8-flash)'
            : 'Connected to Offline Grid',
        };
        this.authReply = loginResult;
        this.agentId = loginResult.agent_id;
        this.sessionId = loginResult.session_id;
        this.circuitCode = parseInt(loginResult.circuit_code);
        this.simAddress = loginResult.sim_ip;
        this.simPort = parseInt(loginResult.sim_port);
        this.seedCapability = loginResult.seed_capability;
        this.inventoryRoot = loginResult['inventory-root'][0].folder_id;

        if (this.seedCapability) {
          try {
            await this.fetchCapabilities();
          } catch (capsErr) {
            console.warn('[Connection] Capability initialization completed with defaults:', capsErr);
          }
        }

        if (this.capabilities?.EventQueueGet) {
          this.startEventQueue();
        }

        this.setState('CONNECTED');
        this.connected = true;
        this.emit('connected', loginResult);
        return loginResult;
      }

      if (window.linkpointDesktop?.connectViewer) {
        const loginUrl = SLProtocol.getLoginUrl(gridId);
        if (!loginUrl) throw new Error('Invalid or insecure grid selected');
        await window.linkpointDesktop.allowLoginEndpoint(loginUrl);
        this.removeNativeListener = window.linkpointDesktop.onViewerEvent(({ type, data }) => {
          if (type === 'chat') this.emit('ChatFromSimulator', data);
          else if (type === 'im') this.emit('ChatFromSimulator', { ...data, chatType: 'im' });
          else if (type === 'friend-status') this.emit('friend_status', data);
          else if (type === 'friend-request') this.emit('friend_request', data);
          else if (type === 'friend-remove') this.emit('friend_remove', data);
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
      slBridge.on('friend-status', (data: any) => this.emit('friend_status', data));
      slBridge.on('friend-request', (data: any) => this.emit('friend_request', data));
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
      });

      this.authReply = loginResult;
      this.agentId = String(loginResult.agent_id);
      this.sessionId = String(loginResult.sessionId);
      this.circuitCode = Number(loginResult.circuit_code || 1001);
      this.inventoryRoot = loginResult.inventory_root || null;
      this.simAddress = '127.0.0.1';
      this.simPort = 9000;
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

  async autoLogin(startLocation: string = 'last') {
    try {
      this.setState('AUTHENTICATING');

      slBridge.removeAllListeners();
      slBridge.on('chat', (data: any) => this.emit('ChatFromSimulator', data));
      slBridge.on('im', (data: any) => this.emit('ChatFromSimulator', { ...data, chatType: 'im' }));
      slBridge.on('friend-status', (data: any) => this.emit('friend_status', data));
      slBridge.on('friend-request', (data: any) => this.emit('friend_request', data));
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
      slBridge.on('disconnected', (data: any) => {
        this.connected = false;
        this.setState('IDLE');
        this.emit('disconnected', data);
      });

      const loginResult = await slBridge.autoLogin(startLocation);

      this.authReply = loginResult;
      this.agentId = String(loginResult.agent_id);
      this.sessionId = String(loginResult.sessionId);
      this.circuitCode = Number(loginResult.circuit_code || 1001);
      this.inventoryRoot = loginResult.inventory_root || null;
      this.simAddress = '127.0.0.1';
      this.simPort = 9000;
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
    this.emit(event.message, event.body);
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
