/**
 * LiveRegionAnnouncer Service
 *
 * Provides a global live region announcement service for screen readers (WCAG 2.2 SC 4.1.3).
 * Routes status messages, critical alerts, and chat logs through dedicated off-screen DOM nodes
 * (`role="status"`, `role="alert"`, `role="log"`) with independent queues and throttling
 * (techniques ARIA19, ARIA22, ARIA23).
 */

export type LiveChannel = 'status' | 'alert' | 'log';

export interface AnnouncementItem {
  text: string;
  priority: 'polite' | 'assertive';
  channel: LiveChannel;
  id: string;
  timestamp: number;
}

export class LiveRegionAnnouncerService {
  private static instance: LiveRegionAnnouncerService | null = null;
  private channelElements: Record<LiveChannel, HTMLElement | null> = {
    status: null,
    alert: null,
    log: null,
  };
  private queues: Record<LiveChannel, AnnouncementItem[]> = {
    status: [],
    alert: [],
    log: [],
  };
  private isProcessing: Record<LiveChannel, boolean> = {
    status: false,
    alert: false,
    log: false,
  };
  private throttleMs: Record<LiveChannel, number> = {
    status: 300,
    alert: 0,
    log: 1000,
  };
  private chatManager: any = null;
  private isListening = false;
  private boundMessageHandler: ((data: any) => void) | null = null;

  constructor() {
    this.boundMessageHandler = (data: any) => this.handleChatMessage(data);
  }

  public static getInstance(): LiveRegionAnnouncerService {
    if (!LiveRegionAnnouncerService.instance) {
      LiveRegionAnnouncerService.instance = new LiveRegionAnnouncerService();
    }
    return LiveRegionAnnouncerService.instance;
  }

  /**
   * Ensure an off-screen container for the given channel exists as a persistent DOM element.
   */
  public ensureDOMElement(channel: LiveChannel = 'status'): HTMLElement | null {
    const current = this.channelElements[channel];
    if (current && typeof document !== 'undefined' && document.body?.contains(current)) {
      return current;
    }
    if (typeof document === 'undefined') {
      return null;
    }

    const id = `live-region-${channel}`;
    let element = document.getElementById(id);

    const roleMap: Record<LiveChannel, string> = {
      status: 'status',
      alert: 'alert',
      log: 'log',
    };
    const liveMap: Record<LiveChannel, 'polite' | 'assertive'> = {
      status: 'polite',
      alert: 'assertive',
      log: 'polite',
    };

    if (!element) {
      element = document.createElement('div');
      element.id = id;
      element.className = 'sr-only live-region-announcer';
      element.setAttribute('role', roleMap[channel]);
      element.setAttribute('aria-live', liveMap[channel]);
      element.setAttribute('aria-atomic', 'true');
      if (channel === 'log') {
        element.setAttribute('aria-label', 'Live Chat Announcements');
      }
      if (document.body) {
        document.body.appendChild(element);
      } else if (document.documentElement) {
        document.documentElement.appendChild(element);
      }
    } else {
      if (!element.getAttribute('role')) element.setAttribute('role', roleMap[channel]);
      if (!element.getAttribute('aria-live')) element.setAttribute('aria-live', liveMap[channel]);
      element.setAttribute('aria-atomic', 'true');
      if (channel === 'log' && !element.getAttribute('aria-label')) {
        element.setAttribute('aria-label', 'Live Chat Announcements');
      }
    }

    this.channelElements[channel] = element;
    return element;
  }

  /**
   * Register an off-screen DOM element for a channel.
   */
  public registerDOMElement(element: HTMLElement | null, channel?: LiveChannel): void {
    if (!element) {
      if (channel) {
        this.channelElements[channel] = null;
      } else {
        const channels: LiveChannel[] = ['status', 'alert', 'log'];
        for (const ch of channels) {
          const el = this.channelElements[ch];
          if (el && typeof document !== 'undefined' && document.body?.contains(el)) {
            // Keep auto-created element if attached to document
          } else {
            this.channelElements[ch] = null;
          }
        }
      }
      return;
    }

    const targetChannel: LiveChannel = channel || this.determineChannelFromElement(element);

    if (!channel && element.id === 'live-region-announcer') {
      // Legacy fallback: single container shared across all channels.
      // Concurrent multi-channel announcements may experience rapid text collision.
      this.channelElements.status = element;
      this.channelElements.alert = element;
      this.channelElements.log = element;
      if (!element.getAttribute('role')) element.setAttribute('role', 'log');
      if (!element.getAttribute('aria-live')) element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      return;
    }

    this.channelElements[targetChannel] = element;

    const defaultRoles: Record<LiveChannel, string> = {
      status: 'status',
      alert: 'alert',
      log: 'log',
    };
    if (!element.getAttribute('role')) {
      element.setAttribute('role', defaultRoles[targetChannel]);
    }
    if (!element.getAttribute('aria-live')) {
      element.setAttribute('aria-live', targetChannel === 'alert' ? 'assertive' : 'polite');
    }
    element.setAttribute('aria-atomic', 'true');
  }

  private determineChannelFromElement(element: HTMLElement): LiveChannel {
    if (element.id === 'live-region-alert' || element.getAttribute('role') === 'alert') {
      return 'alert';
    }
    if (element.id === 'live-region-log' || element.getAttribute('role') === 'log') {
      return 'log';
    }
    return 'status';
  }

  /**
   * Connect to the global chat event bus.
   */
  public attachChatBus(chatManager: any): void {
    if (this.chatManager && this.isListening && this.boundMessageHandler) {
      this.chatManager.off('message_received', this.boundMessageHandler);
      this.chatManager.off('message_sent', this.boundMessageHandler);
    }

    this.chatManager = chatManager;
    if (this.chatManager && this.boundMessageHandler) {
      this.chatManager.on('message_received', this.boundMessageHandler);
      this.chatManager.on('message_sent', this.boundMessageHandler);
      this.isListening = true;
    }
  }

  /**
   * Format an incoming chat payload into screen reader friendly string.
   */
  public formatChatMessage(data: any): string | null {
    if (!data) return null;
    const text = (data.text || data.message || '').trim();
    if (!text) return null;

    const sender = data.sender || data.fromName || 'Resident';
    const type =
      data.type || (data.chatType === 4 ? 'im' : data.chatType === 9 ? 'group' : 'local');

    if (type === 'im') {
      const recipient = data.recipientName ? ` to ${data.recipientName}` : '';
      return `[IM - ${sender}${recipient}] ${text}`;
    }

    if (type === 'group') {
      const groupName = data.groupName || 'Group';
      return `[Group Chat - ${groupName}] ${sender}: ${text}`;
    }

    // Default: Spatial / Local chat
    return `[Spatial Chat] ${sender}: ${text}`;
  }

  /**
   * Handle incoming message event from event bus.
   */
  public handleChatMessage(data: any): void {
    const formatted = this.formatChatMessage(data);
    if (formatted) {
      this.announce(formatted, 'polite', 'log');
    }
  }

  /**
   * Enqueue a message to be announced to screen readers.
   */
  public announce(
    text: string,
    priority: 'polite' | 'assertive' = 'polite',
    channel?: LiveChannel,
  ): void {
    if (!text.trim()) return;

    const targetChannel: LiveChannel = channel || (priority === 'assertive' ? 'alert' : 'status');

    this.queues[targetChannel].push({
      text: text.trim(),
      priority,
      channel: targetChannel,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    });

    void this.processChannelQueue(targetChannel);
  }

  /**
   * Process message queue for a channel sequentially with per-channel throttling.
   */
  private async processChannelQueue(channel: LiveChannel): Promise<void> {
    if (this.isProcessing[channel]) return;
    this.isProcessing[channel] = true;

    while (this.queues[channel].length > 0) {
      const targetElement = this.ensureDOMElement(channel);
      const item = this.queues[channel].shift();
      if (item && targetElement) {
        // Preserve active focused element (ARIA22: no focus displacement)
        const activeElement =
          typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;

        targetElement.setAttribute('aria-live', item.priority);
        targetElement.setAttribute('aria-atomic', 'true');
        targetElement.textContent = item.text;

        // Restore focus if displaced
        if (
          activeElement &&
          typeof document !== 'undefined' &&
          document.activeElement !== activeElement
        ) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch {
            // Ignore focus error
          }
        }
      }

      const delay = this.throttleMs[channel];
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    this.isProcessing[channel] = false;
  }

  /**
   * Get current queue size for a channel or all channels.
   */
  public getQueueLength(channel?: LiveChannel): number {
    if (channel) {
      return this.queues[channel].length;
    }
    return this.queues.status.length + this.queues.alert.length + this.queues.log.length;
  }

  /**
   * Set throttle delay in milliseconds for a channel or all channels.
   */
  public setThrottleMs(ms: number, channel?: LiveChannel): void {
    const validMs = Math.max(0, ms);
    if (channel) {
      this.throttleMs[channel] = validMs;
    } else {
      this.throttleMs.status = validMs;
      this.throttleMs.alert = validMs;
      this.throttleMs.log = validMs;
    }
  }

  /**
   * Clean up listeners and queues.
   */
  public destroy(): void {
    if (this.chatManager && this.isListening && this.boundMessageHandler) {
      this.chatManager.off('message_received', this.boundMessageHandler);
      this.chatManager.off('message_sent', this.boundMessageHandler);
    }
    this.queues = { status: [], alert: [], log: [] };
    this.isProcessing = { status: false, alert: false, log: false };
    this.channelElements = { status: null, alert: null, log: null };
    this.throttleMs = { status: 300, alert: 0, log: 1000 };
    this.isListening = false;
    this.chatManager = null;
  }
}

export const liveRegionAnnouncer = LiveRegionAnnouncerService.getInstance();
