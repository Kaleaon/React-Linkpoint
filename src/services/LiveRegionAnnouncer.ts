/**
 * LiveRegionAnnouncer Service
 *
 * Provides a global live region announcement service for screen readers (WCAG 2.2 SC 4.1.3).
 * Decouples chat event publishing from view rendering and updates an off-screen role="log" element
 * with aria-live="polite" (techniques ARIA19, ARIA22).
 * Includes message queueing/throttling to prevent screen reader audio buffer overflow.
 */

export interface AnnouncementItem {
  text: string;
  priority: 'polite' | 'assertive';
  id: string;
  timestamp: number;
}

export class LiveRegionAnnouncerService {
  private static instance: LiveRegionAnnouncerService | null = null;
  private queue: AnnouncementItem[] = [];
  private isProcessing = false;
  private throttleMs = 1000;
  private domElement: HTMLElement | null = null;
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
   * Ensure an off-screen container mounted at root level exists as a persistent singleton DOM element.
   */
  public ensureDOMElement(): HTMLElement | null {
    if (this.domElement && typeof document !== 'undefined' && document.body?.contains(this.domElement)) {
      return this.domElement;
    }
    if (typeof document === 'undefined') {
      return null;
    }

    let element = document.getElementById('live-region-announcer');
    if (!element) {
      element = document.createElement('div');
      element.id = 'live-region-announcer';
      element.className = 'sr-only live-region-announcer';
      element.setAttribute('role', 'log');
      element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
      if (document.body) {
        document.body.appendChild(element);
      } else if (document.documentElement) {
        document.documentElement.appendChild(element);
      }
    } else {
      if (!element.getAttribute('role')) element.setAttribute('role', 'log');
      if (!element.getAttribute('aria-live')) element.setAttribute('aria-live', 'polite');
      element.setAttribute('aria-atomic', 'true');
    }

    this.domElement = element;
    return element;
  }

  /**
   * Register the off-screen DOM element that acts as the role="log" live region.
   */
  public registerDOMElement(element: HTMLElement | null): void {
    if (element) {
      this.domElement = element;
      if (!this.domElement.getAttribute('role')) {
        this.domElement.setAttribute('role', 'log');
      }
      if (!this.domElement.getAttribute('aria-live')) {
        this.domElement.setAttribute('aria-live', 'polite');
      }
      this.domElement.setAttribute('aria-atomic', 'true');
    } else {
      if (this.domElement && this.domElement.id === 'live-region-announcer' && typeof document !== 'undefined' && document.body?.contains(this.domElement)) {
        // Retain the persistent container if registered via fallback
      } else {
        this.domElement = null;
      }
    }
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
    const type = data.type || (data.chatType === 4 ? 'im' : data.chatType === 9 ? 'group' : 'local');

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
      this.announce(formatted, 'polite');
    }
  }

  /**
   * Enqueue a message to be announced to screen readers.
   */
  public announce(text: string, priority: 'polite' | 'assertive' = 'polite'): void {
    if (!text.trim()) return;

    this.queue.push({
      text: text.trim(),
      priority,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    });

    void this.processQueue();
  }

  /**
   * Process message queue sequentially with throttling to avoid audio buffer overflow.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.queue.length > 0) {
      const targetElement = this.ensureDOMElement();
      const item = this.queue.shift();
      if (item && targetElement) {
        // Preserve active focused element (ARIA22: no focus displacement)
        const activeElement = typeof document !== 'undefined' ? (document.activeElement as HTMLElement) : null;

        targetElement.setAttribute('aria-live', item.priority);
        targetElement.setAttribute('aria-atomic', 'true');
        targetElement.textContent = item.text;

        // Restore focus if displaced
        if (activeElement && typeof document !== 'undefined' && document.activeElement !== activeElement) {
          try {
            activeElement.focus({ preventScroll: true });
          } catch {
            // Ignore focus error
          }
        }
      }

      // Always throttle delay after an announcement to hold processing lock and allow buffer time for speech
      if (this.throttleMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.throttleMs));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get current queue size (useful for testing/diagnostics).
   */
  public getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Set throttle delay in milliseconds.
   */
  public setThrottleMs(ms: number): void {
    this.throttleMs = Math.max(0, ms);
  }

  /**
   * Clean up listeners and queue.
   */
  public destroy(): void {
    if (this.chatManager && this.isListening && this.boundMessageHandler) {
      this.chatManager.off('message_received', this.boundMessageHandler);
      this.chatManager.off('message_sent', this.boundMessageHandler);
    }
    this.queue = [];
    this.isListening = false;
    this.domElement = null;
    this.chatManager = null;
  }
}

export const liveRegionAnnouncer = LiveRegionAnnouncerService.getInstance();
