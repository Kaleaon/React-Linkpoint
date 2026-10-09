import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { AppProvider } from '../../context/AppContext.jsx';
import AccessibleChatLog from '../../components/AccessibleChatLog.jsx';
import Chat from '../../screens/Chat.jsx';
import { app } from '../app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mountComponent(element: any) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const r = createRoot(host);
  await act(async () => {
    r.render(
      createElement(AppProvider as any, null, createElement(ThemeProvider as any, null, element)),
    );
  });
  mounted = { host, root: r };
  return host;
}

afterEach(async () => {
  if (mounted) {
    await act(async () => mounted!.root.unmount());
    mounted.host.remove();
    mounted = null;
  }
  vi.restoreAllMocks();
});

describe('AccessibleChatLog', () => {
  it('configures role="log" and aria-live="polite" for non-intrusive live announcements', async () => {
    const sampleMessages = [
      {
        id: '1',
        sender: 'Arapaima Resident',
        text: 'Hello spatial world',
        timestamp: Date.now(),
        type: 'local',
      },
    ];
    const host = await mountComponent(
      createElement(AccessibleChatLog, {
        messages: sampleMessages,
        variant: 'overlay',
        ariaLabel: 'Spatial chat overlay log',
      }),
    );

    const logContainer = host.querySelector('[role="log"]');
    expect(logContainer).not.toBeNull();
    expect(logContainer?.getAttribute('aria-live')).toBe('polite');
    expect(logContainer?.getAttribute('aria-label')).toBe('Spatial chat overlay log');
    expect(logContainer?.getAttribute('tabindex')).toBe('0');
    expect(host.textContent).toContain('Arapaima Resident');
    expect(host.textContent).toContain('Hello spatial world');
  });

  it('applies high-contrast text (#FFFFFF) over dark background scrim (rgba(18, 18, 20, 0.85)) in overlay mode', async () => {
    const sampleMessages = [
      {
        id: '1',
        sender: 'Arapaima Resident',
        text: 'High contrast text over 3D viewport',
        timestamp: Date.now(),
        type: 'local',
      },
    ];
    const host = await mountComponent(
      createElement(AccessibleChatLog, {
        messages: sampleMessages,
        variant: 'overlay',
      }),
    );

    const logSection = host.querySelector('[role="log"]') as HTMLElement;
    expect(logSection).not.toBeNull();
    expect(logSection.style.background).toContain('rgba(18, 18, 20, 0.85)');

    const articleText = host.querySelector('article div') as HTMLElement;
    expect(articleText).not.toBeNull();
    // Color should be white (#FFFFFF or rgb(255, 255, 255))
    const color = articleText.style.color.toLowerCase();
    expect(['#ffffff', 'rgb(255, 255, 255)', '#fff']).toContain(color);
  });

  it('prevents focus stealing when new chat messages stream into active views', async () => {
    const externalButton = document.createElement('button');
    externalButton.id = 'active-3d-control';
    document.body.appendChild(externalButton);
    externalButton.focus();
    expect(document.activeElement).toBe(externalButton);

    const initialMessages = [
      { id: '1', sender: 'Resident One', text: 'First message', timestamp: Date.now() },
    ];

    const host = await mountComponent(
      createElement(AccessibleChatLog, { messages: initialMessages, variant: 'overlay' }),
    );

    // Focus remains on active control
    externalButton.focus();
    expect(document.activeElement).toBe(externalButton);

    // Re-render with new messages streaming in
    const updatedMessages = [
      ...initialMessages,
      { id: '2', sender: 'Resident Two', text: 'Streaming second message', timestamp: Date.now() },
    ];

    await act(async () => {
      mounted!.root.render(
        createElement(
          AppProvider as any,
          null,
          createElement(
            ThemeProvider as any,
            null,
            createElement(AccessibleChatLog, { messages: updatedMessages, variant: 'overlay' }),
          ),
        ),
      );
    });

    // Focus MUST NOT be stolen by incoming message
    expect(document.activeElement).toBe(externalButton);
    expect(host.textContent).toContain('Streaming second message');

    externalButton.remove();
  });

  it('supports auto-scroll freeze toggle to allow reviewing history without scrolling disruption', async () => {
    const messages = [
      { id: '1', sender: 'Sender', text: 'Msg 1', timestamp: Date.now() },
      { id: '2', sender: 'Sender', text: 'Msg 2', timestamp: Date.now() },
    ];

    const host = await mountComponent(
      createElement(AccessibleChatLog, { messages, variant: 'embedded' }),
    );

    const toggleBtn = host.querySelector('button[aria-pressed]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.getAttribute('aria-pressed')).toBe('false');
    expect(toggleBtn.textContent).toContain('AUTO-SCROLL ON');

    // Click freeze toggle
    await act(async () => {
      toggleBtn.click();
    });

    expect(toggleBtn.getAttribute('aria-pressed')).toBe('true');
    expect(toggleBtn.textContent).toContain('SCROLL FROZEN');
  });

  it('integrates with Chat screen to render group and local chat using role="log"', async () => {
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
    app.chat.messages = [
      {
        id: 'g1',
        type: 'group',
        groupId: 'grp1',
        groupName: 'Group Alpha',
        sender: 'Member A',
        text: 'Group chat content',
        timestamp: Date.now(),
      },
    ];

    const host = await mountComponent(createElement(Chat));

    const logContainer = host.querySelector('[role="log"]');
    expect(logContainer).not.toBeNull();
    expect(logContainer?.getAttribute('aria-live')).toBe('polite');
    expect(host.textContent).toContain('Listening to live Second Life region chat');
  });
});
