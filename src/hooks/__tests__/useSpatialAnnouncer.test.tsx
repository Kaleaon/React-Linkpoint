import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { useSpatialAnnouncer } from '../useSpatialAnnouncer';
import { liveRegionAnnouncer } from '../../services/LiveRegionAnnouncer';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function TestComponent({
  cameraState,
  regionName,
  enabled = true,
}: {
  cameraState: any;
  regionName: string;
  enabled?: boolean;
}) {
  useSpatialAnnouncer(cameraState, regionName, enabled);
  return createElement('div', null, 'Spatial Announcer Test');
}

async function mount(props: { cameraState: any; regionName: string; enabled?: boolean }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(TestComponent, props));
  });
  mounted = { host, root };
  return host;
}

async function updateProps(props: { cameraState: any; regionName: string; enabled?: boolean }) {
  if (mounted) {
    await act(async () => {
      mounted!.root.render(createElement(TestComponent, props));
    });
  }
}

describe('useSpatialAnnouncer Hook', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(liveRegionAnnouncer, 'announce').mockImplementation(() => {});
  });

  afterEach(async () => {
    if (mounted) {
      await act(async () => {
        mounted!.root.unmount();
      });
      mounted.host.remove();
      mounted = null;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('debounces camera movement announcements by 400ms', async () => {
    const initialState = {
      position: [128.1, 130.4, 25.2],
      heading: 214,
      pitch: 0,
    };

    await mount({ cameraState: initialState, regionName: 'Arah' });

    // Immediately before timer fires, no announcement should have been dispatched
    expect(liveRegionAnnouncer.announce).not.toHaveBeenCalled();

    // Fast-forward by 350ms (less than 400ms debounce)
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(liveRegionAnnouncer.announce).not.toHaveBeenCalled();

    // Fast-forward remaining 50ms (total 400ms)
    await act(async () => {
      vi.advanceTimersByTime(50);
    });

    expect(liveRegionAnnouncer.announce).toHaveBeenCalledTimes(1);
    expect(liveRegionAnnouncer.announce).toHaveBeenCalledWith(
      'Camera at 128, 130, 25 in Arah. HDG 214° LVL',
      'polite',
    );
  });

  it('resets debounce timer on rapid camera updates and only announces when movement stops', async () => {
    const state1 = { position: [100, 100, 20], heading: 90, pitch: 0 };
    await mount({ cameraState: state1, regionName: 'Mainland' });

    // Advance 200ms
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(liveRegionAnnouncer.announce).not.toHaveBeenCalled();

    // Movement updates camera position
    const state2 = { position: [105, 100, 20], heading: 90, pitch: 0 };
    await updateProps({ cameraState: state2, regionName: 'Mainland' });

    // Advance another 300ms (total 500ms since start, but only 300ms since last movement)
    await act(async () => {
      vi.advanceTimersByTime(300);
    });
    expect(liveRegionAnnouncer.announce).not.toHaveBeenCalled();

    // Advance remaining 100ms for state2
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(liveRegionAnnouncer.announce).toHaveBeenCalledTimes(1);
    expect(liveRegionAnnouncer.announce).toHaveBeenCalledWith(
      'Camera at 105, 100, 20 in Mainland. HDG 090° LVL',
      'polite',
    );
  });

  it('does not re-announce identical position and heading', async () => {
    const state1 = { position: [128, 128, 25], heading: 180 };
    await mount({ cameraState: state1, regionName: 'Arah' });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(liveRegionAnnouncer.announce).toHaveBeenCalledTimes(1);

    // Update with exact same rounded coordinates & heading
    const state2 = { position: [128.01, 128.02, 25.01], heading: 180 };
    await updateProps({ cameraState: state2, regionName: 'Arah' });

    await act(async () => {
      vi.advanceTimersByTime(400);
    });

    // Still only called once because announcement text hasn't changed
    expect(liveRegionAnnouncer.announce).toHaveBeenCalledTimes(1);
  });

  it('does not announce when enabled is false', async () => {
    const state = { position: [100, 100, 10], heading: 0 };
    await mount({ cameraState: state, regionName: 'Arah', enabled: false });

    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(liveRegionAnnouncer.announce).not.toHaveBeenCalled();
  });
});
