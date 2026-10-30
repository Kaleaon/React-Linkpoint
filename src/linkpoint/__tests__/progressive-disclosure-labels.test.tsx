// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import ObjectInspector from '../../components/ObjectInspector';
import ConsoleFrame from '../../components/ConsoleFrame.jsx';
import { FriendContactInspector } from '../../screens/LiveScreens.jsx';
import { app } from '../app';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

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

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
});

describe('Progressive Disclosure & Conversational Labels Integration', () => {
  it('ObjectInspector hides raw UUID inside expandable panel by default', async () => {
    const dummyObject = {
      id: '12345678-abcd-ef01-2345-6789abcdef01',
      name: 'Test Chair Object',
      owner: 'John Linkpoint',
      position: [128.5, 128.5, 22.0],
      scale: [1.0, 1.0, 1.0],
      material: 'Wood',
      physics: 'Convex Hull',
    };

    app.world.selectedObject = dummyObject;

    const host = await mount(<ObjectInspector />);

    const cardText = host.textContent || '';
    expect(cardText).toContain('Test Chair Object');
    expect(cardText).toContain('John Linkpoint');
    expect(cardText).toContain('FOCUS CAMERA');

    // Button for Developer Details is rendered
    const devBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Developer Details'),
    );
    expect(devBtn).toBeTruthy();
    expect(devBtn?.getAttribute('aria-expanded')).toBe('false');

    // UUID is collapsed inside panel and not rendered in default view
    const panelId = devBtn?.getAttribute('aria-controls');
    expect(host.querySelector(`#${panelId}`)).toBeNull();

    // Click Developer Details button to expand
    await act(async () => {
      devBtn?.click();
    });

    expect(devBtn?.getAttribute('aria-expanded')).toBe('true');
    const expandedPanel = host.querySelector(`#${panelId}`);
    expect(expandedPanel).not.toBeNull();
    expect(expandedPanel?.textContent).toContain('12345678-abcd-ef01-2345-6789abcdef01');
    expect(expandedPanel?.textContent).toContain('Wood');
  });

  it('ConsoleFrame displays SERVICES instead of raw CAPS acronym', async () => {
    const host = await mount(<ConsoleFrame />);
    const text = host.textContent || '';

    expect(text).toContain('SERVICES');
    expect(text).not.toContain('CAPS');
  });

  it('FriendContactInspector hides Resident UUID inside expandable panel by default', async () => {
    const dummyFriend = {
      id: '87654321-4321-9876-5432-109876543210',
      name: 'Alice Resident',
      onlineStatus: 'online',
    };

    const host = await mount(
      <FriendContactInspector
        friend={dummyFriend}
        onClose={() => {}}
        onStartIm={() => {}}
        V={{
          surf: '#111',
          outv: '#333',
          rs: '4px',
          ink: '#fff',
          ink2: '#ccc',
          pri: '#00f',
          onpri: '#fff',
        }}
        t={{ font: 'sans-serif' }}
      />,
    );

    const text = host.textContent || '';
    expect(text).toContain('Alice Resident');
    expect(text).toContain('online');

    const devBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
      btn.textContent?.includes('Developer Details'),
    );
    expect(devBtn).toBeTruthy();
    expect(devBtn?.getAttribute('aria-expanded')).toBe('false');

    const panelId = devBtn?.getAttribute('aria-controls');
    expect(host.querySelector(`#${panelId}`)).toBeNull();

    // Click to expand
    await act(async () => {
      devBtn?.click();
    });

    expect(devBtn?.getAttribute('aria-expanded')).toBe('true');
    const expandedPanel = host.querySelector(`#${panelId}`);
    expect(expandedPanel).not.toBeNull();
    expect(expandedPanel?.textContent).toContain('87654321-4321-9876-5432-109876543210');
  });
});
