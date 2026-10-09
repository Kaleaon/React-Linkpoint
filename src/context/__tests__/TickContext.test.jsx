import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProvider, useApp } from '../AppContext.jsx';
import { TickProvider, useTickContext } from '../TickContext.jsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let mounted = null;

async function mount(ui) {
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
      mounted.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  vi.useRealTimers();
});

describe('TickContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('provides initial tick value 0 and increments every 1 second', async () => {
    let currentTick = null;
    function Consumer() {
      currentTick = useTickContext();
      return createElement('div', null, `Tick: ${currentTick}`);
    }

    await mount(createElement(TickProvider, null, createElement(Consumer)));

    expect(currentTick).toBe(0);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(currentTick).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(currentTick).toBe(3);
  });

  it('cleans up timer on unmount', async () => {
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');
    function Consumer() {
      const tick = useTickContext();
      return createElement('div', null, `Tick: ${tick}`);
    }

    await mount(createElement(TickProvider, null, createElement(Consumer)));

    await act(async () => {
      mounted.root.unmount();
    });
    mounted.host.remove();
    mounted = null;

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it('re-renders TickContext consumers on tick without re-rendering AppContext consumers', async () => {
    let appRenderCount = 0;
    let tickRenderCount = 0;
    let lastSeenTick = null;

    function AppSubscriber() {
      const { state } = useApp();
      appRenderCount++;
      return createElement('div', { id: 'app-sub' }, `Screen: ${state.screen}`);
    }

    function TickSubscriber() {
      const tick = useTickContext();
      lastSeenTick = tick;
      tickRenderCount++;
      return createElement('div', { id: 'tick-sub' }, `Tick: ${tick}`);
    }

    await mount(
      createElement(
        AppProvider,
        null,
        createElement(
          TickProvider,
          null,
          createElement('div', null, createElement(AppSubscriber), createElement(TickSubscriber)),
        ),
      ),
    );

    expect(appRenderCount).toBe(1);
    expect(tickRenderCount).toBe(1);
    expect(lastSeenTick).toBe(0);

    // Advance timer by 1 second (triggers tick interval)
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    // TickSubscriber should have re-rendered, but AppSubscriber should NOT have re-rendered
    expect(tickRenderCount).toBe(2);
    expect(lastSeenTick).toBe(1);
    expect(appRenderCount).toBe(1);

    // Advance timer by 1 second twice
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(tickRenderCount).toBe(3);
    expect(lastSeenTick).toBe(2);
    expect(appRenderCount).toBe(1);

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(tickRenderCount).toBe(4);
    expect(lastSeenTick).toBe(3);
    expect(appRenderCount).toBe(1);
  });
});
