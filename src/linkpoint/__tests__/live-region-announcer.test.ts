import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LiveRegionAnnouncerService } from '../../services/LiveRegionAnnouncer';
import { Utils } from '../utils';
import { contrastRatio, meetsAA } from '../../theme/contrast';

class MockChatManager extends Utils.EventEmitter {
  public messages: any[] = [];
}

describe('LiveRegionAnnouncerService & Theme Contrast Tests', () => {
  let announcer: LiveRegionAnnouncerService;
  let mockChat: MockChatManager;
  let mockDomElement: HTMLElement;

  beforeEach(() => {
    announcer = new LiveRegionAnnouncerService();
    announcer.setThrottleMs(10); // Fast throttle for tests
    mockChat = new MockChatManager();

    mockDomElement = document.createElement('div');
    mockDomElement.id = 'live-region-announcer';
    mockDomElement.className = 'sr-only live-region-announcer';
    document.body.appendChild(mockDomElement);

    announcer.registerDOMElement(mockDomElement);
  });

  afterEach(() => {
    announcer.destroy();
    if (mockDomElement && mockDomElement.parentNode) {
      mockDomElement.parentNode.removeChild(mockDomElement);
    }
    vi.restoreAllMocks();
  });

  describe('ARIA Attributes & Registration', () => {
    it('sets role="log", aria-live="polite", and aria-atomic="true" on registered DOM element', () => {
      expect(mockDomElement.getAttribute('role')).toBe('log');
      expect(mockDomElement.getAttribute('aria-live')).toBe('polite');
      expect(mockDomElement.getAttribute('aria-atomic')).toBe('true');
      expect(mockDomElement.classList.contains('sr-only')).toBe(true);
    });

    it('defaults to per-channel throttle times (status: 300ms, alert: 0ms, log: 1000ms)', () => {
      const freshAnnouncer = new LiveRegionAnnouncerService();
      // @ts-expect-error - access private property for verification
      expect(freshAnnouncer.throttleMs).toEqual({
        status: 300,
        alert: 0,
        log: 1000,
      });
      freshAnnouncer.destroy();
    });

    it('auto-creates and maintains persistent off-screen DOM live region if unregistered', async () => {
      const freshAnnouncer = new LiveRegionAnnouncerService();
      freshAnnouncer.setThrottleMs(10);
      const element = freshAnnouncer.ensureDOMElement('status');
      expect(element).not.toBeNull();
      expect(element?.id).toBe('live-region-status');
      expect(element?.getAttribute('aria-atomic')).toBe('true');

      freshAnnouncer.announce('Persistent live region test', 'polite', 'status');
      await new Promise((r) => setTimeout(r, 50));
      expect(element?.textContent).toBe('Persistent live region test');

      freshAnnouncer.destroy();
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
  });

  describe('Multi-Channel Routing & DOM Containers', () => {
    it('registers and updates status, alert, and log channels independently', async () => {
      const statusEl = document.createElement('div');
      statusEl.id = 'live-region-status';
      statusEl.setAttribute('role', 'status');

      const alertEl = document.createElement('div');
      alertEl.id = 'live-region-alert';
      alertEl.setAttribute('role', 'alert');

      const logEl = document.createElement('div');
      logEl.id = 'live-region-log';
      logEl.setAttribute('role', 'log');

      document.body.appendChild(statusEl);
      document.body.appendChild(alertEl);
      document.body.appendChild(logEl);

      announcer.registerDOMElement(statusEl, 'status');
      announcer.registerDOMElement(alertEl, 'alert');
      announcer.registerDOMElement(logEl, 'log');

      announcer.announce('Status message', 'polite', 'status');
      announcer.announce('Teleport failed!', 'assertive', 'alert');
      announcer.announce('Chat update', 'polite', 'log');

      await new Promise((r) => setTimeout(r, 50));

      expect(statusEl.textContent).toBe('Status message');
      expect(statusEl.getAttribute('role')).toBe('status');

      expect(alertEl.textContent).toBe('Teleport failed!');
      expect(alertEl.getAttribute('role')).toBe('alert');

      expect(logEl.textContent).toBe('Chat update');
      expect(logEl.getAttribute('role')).toBe('log');

      document.body.removeChild(statusEl);
      document.body.removeChild(alertEl);
      document.body.removeChild(logEl);
    });

    it('routes Utils.showToast error messages to alert channel and non-error to status channel', async () => {
      const statusEl = document.createElement('div');
      statusEl.id = 'live-region-status';
      const alertEl = document.createElement('div');
      alertEl.id = 'live-region-alert';

      document.body.appendChild(statusEl);
      document.body.appendChild(alertEl);

      announcer.registerDOMElement(statusEl, 'status');
      announcer.registerDOMElement(alertEl, 'alert');

      Utils.showToast('Saved attachment', 'info');
      Utils.showToast('Failed to save attachment', 'error');

      await new Promise((r) => setTimeout(r, 50));

      expect(statusEl.textContent).toBe('Saved attachment');
      expect(alertEl.textContent).toBe('Failed to save attachment');

      document.body.removeChild(statusEl);
      document.body.removeChild(alertEl);
    });

    it('allows critical alerts to bypass log chat queue congestion without delay', async () => {
      const alertEl = document.createElement('div');
      alertEl.id = 'live-region-alert';
      const logEl = document.createElement('div');
      logEl.id = 'live-region-log';

      document.body.appendChild(alertEl);
      document.body.appendChild(logEl);

      announcer.registerDOMElement(alertEl, 'alert');
      announcer.registerDOMElement(logEl, 'log');

      // Set long throttle on log queue
      announcer.setThrottleMs(500, 'log');
      announcer.setThrottleMs(0, 'alert');

      // Heavy chat load in log channel
      announcer.announce('Chat message 1', 'polite', 'log');
      announcer.announce('Chat message 2', 'polite', 'log');
      announcer.announce('Chat message 3', 'polite', 'log');

      // Critical alert in alert channel
      announcer.announce('CRITICAL SYSTEM FAILURE', 'assertive', 'alert');

      await new Promise((r) => setTimeout(r, 20));

      // Alert channel should process immediately without waiting for log channel throttle
      expect(alertEl.textContent).toBe('CRITICAL SYSTEM FAILURE');
      expect(logEl.textContent).toBe('Chat message 1');

      document.body.removeChild(alertEl);
      document.body.removeChild(logEl);
    });
  });

  describe('Message Formatting', () => {
    it('formats spatial/local chat messages correctly', () => {
      const data = { type: 'local', sender: 'Avatar Alpha', text: 'Hello region!' };
      const formatted = announcer.formatChatMessage(data);
      expect(formatted).toBe('[Spatial Chat] Avatar Alpha: Hello region!');
    });

    it('formats group chat messages correctly', () => {
      const data = {
        type: 'group',
        groupName: 'Builders Club',
        sender: 'Bob',
        text: 'Meeting at 5',
      };
      const formatted = announcer.formatChatMessage(data);
      expect(formatted).toBe('[Group Chat - Builders Club] Bob: Meeting at 5');
    });

    it('formats instant messages correctly', () => {
      const data = { type: 'im', sender: 'Alice', recipientName: 'Bob', text: 'Secret message' };
      const formatted = announcer.formatChatMessage(data);
      expect(formatted).toBe('[IM - Alice to Bob] Secret message');
    });

    it('returns null for empty or invalid messages', () => {
      expect(announcer.formatChatMessage(null)).toBeNull();
      expect(announcer.formatChatMessage({ text: '  ' })).toBeNull();
    });
  });

  describe('Event Bus Subscription & Queueing', () => {
    it('subscribes to ChatManager events and updates log live region', async () => {
      announcer.attachChatBus(mockChat);

      mockChat.emit('message_received', {
        type: 'local',
        sender: 'TestUser',
        text: 'Live region check',
      });

      // Wait for async queue process
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDomElement.textContent).toBe('[Spatial Chat] TestUser: Live region check');
    });

    it('queues rapid chat messages and flushes them sequentially in log queue', async () => {
      announcer.setThrottleMs(50, 'log');
      announcer.attachChatBus(mockChat);

      mockChat.emit('message_received', { type: 'local', sender: 'User1', text: 'Message 1' });
      mockChat.emit('message_received', { type: 'local', sender: 'User2', text: 'Message 2' });
      mockChat.emit('message_received', { type: 'local', sender: 'User3', text: 'Message 3' });

      // First message is displayed immediately
      expect(mockDomElement.textContent).toBe('[Spatial Chat] User1: Message 1');
      expect(announcer.getQueueLength('log')).toBe(2);

      // Wait for throttle to flush queue
      await new Promise((r) => setTimeout(r, 200));

      expect(mockDomElement.textContent).toBe('[Spatial Chat] User3: Message 3');
      expect(announcer.getQueueLength('log')).toBe(0);
    });
  });

  describe('Focus Stability (ARIA22)', () => {
    it('preserves document.activeElement focus during live region updates', async () => {
      const input = document.createElement('input');
      input.id = '3d-control-input';
      document.body.appendChild(input);
      input.focus();

      expect(document.activeElement).toBe(input);

      announcer.announce('Focus test notification', 'polite', 'status');
      await new Promise((r) => setTimeout(r, 50));

      expect(mockDomElement.textContent).toBe('Focus test notification');
      expect(document.activeElement).toBe(input);

      document.body.removeChild(input);
    });
  });

  describe('Toast and Chat Live Region Integration', () => {
    it('routes toast messages to liveRegionAnnouncer', async () => {
      announcer.announce('Settings saved successfully', 'polite', 'status');
      await new Promise((r) => setTimeout(r, 50));
      expect(mockDomElement.textContent).toBe('Settings saved successfully');
    });

    it('routes chat status and error messages to liveRegionAnnouncer', async () => {
      announcer.announce('Away auto-reply enabled', 'polite', 'status');
      await new Promise((r) => setTimeout(r, 50));
      expect(mockDomElement.textContent).toBe('Away auto-reply enabled');

      announcer.announce('Chat is unavailable while disconnected.', 'assertive', 'alert');
      await new Promise((r) => setTimeout(r, 50));
      expect(mockDomElement.textContent).toBe('Chat is unavailable while disconnected.');
    });
  });

  describe('Theme Token Contrast Verification (WCAG 1.4.3 Level AA)', () => {
    it('enforces text contrast ratio of at least 4.5:1 for --chat-text (#FFFFFF) on --chat-bg-scrim (#121214)', () => {
      const foreground = '#FFFFFF';
      const background = '#121214';

      const ratio = contrastRatio(foreground, background);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
      expect(meetsAA(foreground, background)).toBe(true);
      expect(ratio).toBeGreaterThan(15); // Pure white on dark scrim is ~18:1
    });

    it('confirms contrast ratios for chat overlay background colors satisfy WCAG AA', () => {
      const text = '#FFFFFF';
      const darkScrim = '#121214';
      const translucentScrim = 'rgba(18, 18, 20, 0.92)';

      expect(meetsAA(text, darkScrim)).toBe(true);
      expect(meetsAA(text, translucentScrim)).toBe(true);
    });
  });
});
