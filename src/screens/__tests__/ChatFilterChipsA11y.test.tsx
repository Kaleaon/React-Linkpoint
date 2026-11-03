import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createElement, act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Chat from '../Chat.jsx';
import { app } from '../../linkpoint/app';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function ChatHarness({ initialChip = '' }: { initialChip?: string }) {
  const { actions } = useApp();
  useEffect(() => {
    actions.setTab('Chat', 'IM');
    if (initialChip) {
      actions.setChip(initialChip);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Chat />;
}

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

const click = async (el: Element | null) => {
  await act(async () => {
    if (el) (el as HTMLElement).click();
  });
};

describe('Chat recipient filter chips accessibility (WCAG 2.2 SC 4.1.2, 2.5.8, 2.4.7)', () => {
  const origGetFriends = app.friends.getFriends;
  const origGetIMThreads = app.chat.getIMThreads;

  beforeEach(() => {
    app.friends.getFriends = () =>
      [
        { id: 'f-1', name: 'Alice Resident', onlineStatus: 'online' },
        { id: 'f-2', name: 'Bob Resident', onlineStatus: 'offline' },
      ] as unknown as ReturnType<typeof origGetFriends>;

    app.chat.getIMThreads = () =>
      [
        { contactId: 'f-1', contactName: 'Alice Resident', unreadCount: 0 },
        { contactId: 'unlisted-1', contactName: 'Charlie Unlisted', unreadCount: 0 },
      ] as unknown as ReturnType<typeof origGetIMThreads>;
  });

  afterEach(async () => {
    app.friends.getFriends = origGetFriends;
    app.chat.getIMThreads = origGetIMThreads;

    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
  });

  it('sets initial aria-pressed="true" on ALL CONVERSATIONS and "false" on contacts', async () => {
    const host = await mount(<ChatHarness />);

    const buttons = Array.from(host.querySelectorAll('button')).filter((b) =>
      ['ALL CONVERSATIONS', 'Alice Resident', 'Bob Resident', 'Charlie Unlisted'].some((label) =>
        b.textContent?.includes(label),
      ),
    );

    expect(buttons.length).toBe(4);

    const allBtn = buttons.find((b) => b.textContent?.includes('ALL CONVERSATIONS'));
    const aliceBtn = buttons.find((b) => b.textContent?.includes('Alice Resident'));
    const bobBtn = buttons.find((b) => b.textContent?.includes('Bob Resident'));
    const charlieBtn = buttons.find((b) => b.textContent?.includes('Charlie Unlisted'));

    expect(allBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(aliceBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(bobBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(charlieBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('updates aria-pressed correctly when clicking friend filter buttons', async () => {
    const host = await mount(<ChatHarness />);

    const buttons = Array.from(host.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.includes('ALL CONVERSATIONS'));
    const aliceBtn = buttons.find((b) => b.textContent?.includes('Alice Resident'));
    const bobBtn = buttons.find((b) => b.textContent?.includes('Bob Resident'));

    // Select Alice
    await click(aliceBtn!);
    expect(allBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(aliceBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(bobBtn?.getAttribute('aria-pressed')).toBe('false');

    // Select Bob
    await click(bobBtn!);
    expect(allBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(aliceBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(bobBtn?.getAttribute('aria-pressed')).toBe('true');

    // Return to ALL CONVERSATIONS
    await click(allBtn!);
    expect(allBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(aliceBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(bobBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('updates aria-pressed correctly when selecting unlisted IM threads', async () => {
    const host = await mount(<ChatHarness />);

    const buttons = Array.from(host.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.includes('ALL CONVERSATIONS'));
    const charlieBtn = buttons.find((b) => b.textContent?.includes('Charlie Unlisted'));

    // Select Charlie (unlisted thread)
    await click(charlieBtn!);
    expect(allBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(charlieBtn?.getAttribute('aria-pressed')).toBe('true');

    // Reset back to all
    await click(allBtn!);
    expect(allBtn?.getAttribute('aria-pressed')).toBe('true');
    expect(charlieBtn?.getAttribute('aria-pressed')).toBe('false');
  });

  it('correctly sets initial aria-pressed when mounted with an unlisted contact active', async () => {
    const host = await mount(<ChatHarness initialChip="Charlie Unlisted" />);

    const buttons = Array.from(host.querySelectorAll('button'));
    const allBtn = buttons.find((b) => b.textContent?.includes('ALL CONVERSATIONS'));
    const aliceBtn = buttons.find((b) => b.textContent?.includes('Alice Resident'));
    const charlieBtn = buttons.find((b) => b.textContent?.includes('Charlie Unlisted'));

    expect(allBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(aliceBtn?.getAttribute('aria-pressed')).toBe('false');
    expect(charlieBtn?.getAttribute('aria-pressed')).toBe('true');
  });

  it('satisfies WCAG 2.5.8 minimum target dimensions (24x24 px) and Technique C42 styles on all filter chips', async () => {
    const host = await mount(<ChatHarness />);

    const buttons = Array.from(host.querySelectorAll('button')).filter((b) =>
      ['ALL CONVERSATIONS', 'Alice Resident', 'Bob Resident', 'Charlie Unlisted'].some((label) =>
        b.textContent?.includes(label),
      ),
    );

    expect(buttons.length).toBe(4);

    buttons.forEach((btn) => {
      expect(btn.style.minHeight).toBe('24px');
      expect(btn.style.minWidth).toBe('24px');
      expect(btn.style.padding).toBe('4px 8px');
      expect(btn.style.alignItems).toBe('center');
      expect(btn.style.boxSizing).toBe('border-box');
      // Preserves keyboard focus indicators: outline is not suppressed
      expect(btn.style.outline).not.toBe('none');
    });
  });

  it('preserves visible keyboard focus outlines by setting vertical padding on the chip container (WCAG 2.4.7)', async () => {
    const host = await mount(<ChatHarness />);

    const recipientLabel = Array.from(host.querySelectorAll('span')).find(
      (s) => s.textContent?.trim() === 'RECIPIENT:',
    );
    expect(recipientLabel).toBeDefined();

    const container = recipientLabel?.parentElement;
    expect(container).not.toBeNull();
    expect(container?.style.paddingTop).toBe('2px');
    expect(container?.style.paddingBottom).toBe('2px');
    expect(container?.style.overflowX).toBe('auto');
  });
});
