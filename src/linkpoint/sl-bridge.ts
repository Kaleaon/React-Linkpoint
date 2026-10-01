import { Utils } from './utils';

export interface SLBridgeConnectParams {
  loginUrl: string;
  username: string;
  password: string;
  start?: string;
}

export class SLBridge extends Utils.EventEmitter {
  public sessionId: string | null = null;
  public connected: boolean = false;
  private eventSource: EventSource | null = null;

  async connect(params: SLBridgeConnectParams) {
    this.disconnect();

    const response = await fetch('/api/sl/connect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Second Life connection failed' }));
      throw new Error(err.error || err.message || `Second Life error (HTTP ${response.status})`);
    }

    const data = await response.json();
    this.sessionId = data.sessionId;
    this.connected = true;

    // Start Real-Time Event Stream from Second Life
    this.startEventStream(data.sessionId);

    return data;
  }

  async checkAutoLoginStatus(): Promise<{ available: boolean; username: string; grid: string }> {
    try {
      const response = await fetch('/api/sl/auto-login-status');
      if (!response.ok) return { available: false, username: '', grid: 'agni' };
      return await response.json();
    } catch {
      return { available: false, username: '', grid: 'agni' };
    }
  }

  async autoLogin(start?: string) {
    this.disconnect();

    const response = await fetch('/api/sl/auto-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ start }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Auto-login failed' }));
      throw new Error(err.error || err.message || `Auto-login failed (HTTP ${response.status})`);
    }

    const data = await response.json();
    this.sessionId = data.sessionId;
    this.connected = true;

    // Start Real-Time Event Stream from Second Life
    this.startEventStream(data.sessionId);

    return data;
  }

  private startEventStream(sessionId: string) {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const es = new EventSource(`/api/sl/events?sessionId=${encodeURIComponent(sessionId)}`);
    this.eventSource = es;

    es.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type) {
          this.emit(payload.type, payload.data);
        }
      } catch (err) {
        console.warn('[SL Bridge] Error parsing event:', err);
      }
    };

    es.onerror = () => {
      console.warn('[SL Bridge] EventSource disconnected');
    };
  }

  async sendChat(message: string, channel = 0, type = 1) {
    if (!this.sessionId) throw new Error('Not connected to Second Life');

    const response = await fetch('/api/sl/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        message,
        channel,
        type,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to send chat' }));
      throw new Error(err.error || err.message || 'Chat send failed');
    }
  }

  async sendInstantMessage(to: string, message: string) {
    if (!this.sessionId) throw new Error('Not connected to Second Life');

    const response = await fetch('/api/sl/im', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        to,
        message,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to send Instant Message' }));
      throw new Error(err.error || err.message || 'IM send failed');
    }
  }

  async sendGroupMessage(groupId: string, message: string) {
    if (!this.sessionId) throw new Error('Not connected to Second Life');

    const response = await fetch('/api/sl/group-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        groupId,
        message,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to send group message' }));
      throw new Error(err.error || err.message || 'Group message send failed');
    }
  }

  async fetchFriends() {
    if (!this.sessionId) return [];

    const response = await fetch(`/api/sl/friends?sessionId=${encodeURIComponent(this.sessionId)}`);
    if (!response.ok) {
      throw new Error(`Failed to load friends (HTTP ${response.status})`);
    }

    return await response.json();
  }

  async fetchDiagnostics() {
    if (!this.sessionId) return null;
    try {
      const response = await fetch(`/api/sl/diagnostics?sessionId=${encodeURIComponent(this.sessionId)}`);
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  async fetchGroups() {
    if (!this.sessionId) return [];

    const response = await fetch(`/api/sl/groups?sessionId=${encodeURIComponent(this.sessionId)}`);
    if (!response.ok) {
      throw new Error(`Failed to load groups (HTTP ${response.status})`);
    }

    return await response.json();
  }

  async sendFriendRequest(to: string, message?: string) {
    if (!this.sessionId) throw new Error('Not connected to Second Life');

    const response = await fetch('/api/sl/friend-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: this.sessionId,
        to,
        message,
      }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Failed to send friend request' }));
      throw new Error(err.error || err.message || 'Friend request failed');
    }
  }

  async fetchInventory(folderId?: string) {
    if (!this.sessionId) return { folders: [], items: [] };

    const url = folderId
      ? `/api/sl/inventory?sessionId=${encodeURIComponent(this.sessionId)}&folderId=${encodeURIComponent(folderId)}`
      : `/api/sl/inventory?sessionId=${encodeURIComponent(this.sessionId)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load inventory (HTTP ${response.status})`);
    }

    return await response.json();
  }

  async fetchScene() {
    if (!this.sessionId) return [];

    const response = await fetch(`/api/sl/scene?sessionId=${encodeURIComponent(this.sessionId)}`);
    if (!response.ok) return [];

    return await response.json();
  }

  disconnect() {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    if (this.sessionId) {
      const sid = this.sessionId;
      this.sessionId = null;
      this.connected = false;
      fetch('/api/sl/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid }),
      }).catch(() => {});
    }

    this.connected = false;
    this.emit('disconnected', { message: 'Disconnected' });
  }
}

export const slBridge = new SLBridge();
