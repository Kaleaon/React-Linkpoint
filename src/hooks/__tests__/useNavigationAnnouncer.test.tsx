import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useNavigationAnnouncer } from '../useNavigationAnnouncer.js';
import { liveRegionAnnouncer } from '../../services/LiveRegionAnnouncer';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import ScreenBody from '../../components/ScreenBody.jsx';

(globalThis as unknown as Record<string, boolean>).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
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
  document.title = '';
  vi.restoreAllMocks();
});

describe('useNavigationAnnouncer Hook', () => {
  let announceSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    announceSpy = vi.spyOn(liveRegionAnnouncer, 'announce').mockImplementation(() => {});
  });

  function TestHarness({ initialScreen }: { initialScreen: string }) {
    const [screen, setScreen] = useState(initialScreen);
    useNavigationAnnouncer(screen);

    return createElement(
      'div',
      null,
      createElement('main', { id: 'main-content', tabIndex: -1 }),
      createElement(
        'button',
        {
          id: 'change-btn',
          onClick: () => setScreen('Chat'),
        },
        'Go to Chat',
      ),
      createElement(
        'button',
        {
          id: 'login-btn',
          onClick: () => setScreen('Login'),
        },
        'Go to Login',
      ),
    );
  }

  it('sets document.title to "Linkpoint" on initial Login load without announcing or shifting focus', async () => {
    await mount(createElement(TestHarness, { initialScreen: 'Login' }));

    expect(document.title).toBe('Linkpoint');
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('sets document.title to "${screen} - Linkpoint" on initial non-Login load without announcing', async () => {
    await mount(createElement(TestHarness, { initialScreen: 'Radar' }));

    expect(document.title).toBe('Radar - Linkpoint');
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('updates title, focuses main-content, and announces on screen transition', async () => {
    const host = await mount(createElement(TestHarness, { initialScreen: 'Login' }));
    const mainEl = document.getElementById('main-content');
    const focusSpy = vi.spyOn(mainEl!, 'focus');

    const changeBtn = host.querySelector('#change-btn') as HTMLButtonElement;
    await act(async () => {
      changeBtn.click();
    });

    expect(document.title).toBe('Chat - Linkpoint');
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(announceSpy).toHaveBeenCalledWith('Navigated to Chat screen', 'polite');
  });

  it('announces when navigating back to Login screen after initial mount', async () => {
    const host = await mount(createElement(TestHarness, { initialScreen: 'Chat' }));
    const loginBtn = host.querySelector('#login-btn') as HTMLButtonElement;

    await act(async () => {
      loginBtn.click();
    });

    expect(document.title).toBe('Linkpoint');
    expect(announceSpy).toHaveBeenCalledWith('Navigated to Login screen', 'polite');
  });

  it('integrates seamlessly with ScreenBody and App Context', async () => {
    const host = await mount(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(ScreenBody, null)),
      ),
    );

    expect(document.title).toBe('Linkpoint');
    const mainEl = host.querySelector('#main-content');
    expect(mainEl).not.toBeNull();
  });
});
