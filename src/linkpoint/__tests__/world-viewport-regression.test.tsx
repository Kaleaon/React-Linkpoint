import { act, createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import World3D from '../../screens/World3D.jsx';
import { app } from '../app';
import { click, mountScreen, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;
afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
});

describe('world viewport visibility and navigation regression', () => {
  it('keeps the initialized canvas through overlay changes and responsive resizing', async () => {
    const init = vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    const destroy = vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    mounted = await mountScreen(World3D);
    const canvas = mounted.host.querySelector('canvas');
    expect(init).toHaveBeenCalledWith(canvas);
    expect(canvas).not.toBeNull();
    await act(async () => {
      app.world.emit('toggle_overlays');
    });
    await act(async () => {
      Object.defineProperty(window, 'innerWidth', { value: 412, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });
    expect(mounted.host.querySelector('canvas')).toBe(canvas);
    expect(mounted.host.querySelectorAll('canvas')).toHaveLength(1);
    expect(init).toHaveBeenCalledTimes(1);
    const section = mounted.host.querySelector<HTMLElement>('[aria-label="3D world view"]')!;
    expect(section.style.flex).toBe('1 1 0%');
    expect(section.style.minHeight).toBe('0px');
    await unmount(mounted);
    mounted = null;
    expect(destroy).toHaveBeenCalledWith(canvas);
  });

  it('exposes working interaction, orbit and pan controls', async () => {
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    const interaction = vi.spyOn(app.world, 'setInteractionMode').mockImplementation(() => {});
    const pan = vi.spyOn(app.world, 'setPanMode').mockImplementation(() => {});
    mounted = await mountScreen(World3D);
    for (const [label, mode] of [
      ['Interact Mode', 'interact'],
      ['Navigate Mode', 'navigate'],
    ]) {
      await click(mounted.host.querySelector(`[aria-label="${label}"]`));
      expect(interaction).toHaveBeenLastCalledWith(mode);
    }
    await click(mounted.host.querySelector('[aria-label="Pan View Mode"]'));
    expect(pan).toHaveBeenLastCalledWith(true);
    await click(mounted.host.querySelector('[aria-label="Orbit View Mode"]'));
    expect(pan).toHaveBeenLastCalledWith(false);
  });

  it('positions the desktop world as a full-size backdrop', async () => {
    vi.spyOn(app.world, 'init').mockResolvedValue(undefined);
    vi.spyOn(app.world, 'destroyRenderer').mockImplementation(() => {});
    mounted = await mountScreen(() => createElement(World3D, { desktopBackdrop: true }));
    const section = mounted.host.querySelector<HTMLElement>('[aria-label="3D world view"]')!;
    expect(section.style.position).toBe('absolute');
    expect(section.style.inset).toBe('0px');
    expect(mounted.host.querySelectorAll('canvas')).toHaveLength(1);
  });
});
