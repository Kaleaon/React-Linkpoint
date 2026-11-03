// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ObjectInspector from '../ObjectInspector';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app.ts';

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
  app.world.selectedObject = null;
  app.world.setGizmoMode('translate');
  vi.restoreAllMocks();
});

describe('ObjectInspector Gizmo Toolbar & Live Sync', () => {
  beforeEach(() => {
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
    app.economy.balance = 500;
  });

  it('renders transform mode toggles (Move, Rotate, Scale) and switches gizmo mode', async () => {
    const mockObject = {
      id: 'prim-test-1',
      name: 'Interactive Wooden Crate',
      position: [128, 128, 30],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      canModify: true,
      ownerMask: 0x4000,
    };
    app.world.selectedObject = mockObject;
    app.world.setGizmoMode('translate');

    const host = await mount(createElement(ObjectInspector));

    // Check displayed coordinates
    expect(host.textContent).toContain('128.0, 128.0, 30.0');
    expect(host.textContent).toContain('0.0, 0.0, 0.0');
    expect(host.textContent).toContain('1.00, 1.00, 1.00');

    // Find toolbar buttons
    const moveBtn = host.querySelector('button[aria-label="Move mode"]') as HTMLButtonElement;
    const rotateBtn = host.querySelector('button[aria-label="Rotate mode"]') as HTMLButtonElement;
    const scaleBtn = host.querySelector('button[aria-label="Scale mode"]') as HTMLButtonElement;

    expect(moveBtn).toBeDefined();
    expect(rotateBtn).toBeDefined();
    expect(scaleBtn).toBeDefined();

    expect(moveBtn.disabled).toBe(false);
    expect(rotateBtn.disabled).toBe(false);
    expect(scaleBtn.disabled).toBe(false);

    // Initial mode is translate
    expect(moveBtn.getAttribute('aria-pressed')).toBe('true');
    expect(rotateBtn.getAttribute('aria-pressed')).toBe('false');

    // Click Rotate
    await act(async () => {
      rotateBtn.click();
    });

    expect(app.world.getGizmoMode()).toBe('rotate');
    expect(rotateBtn.getAttribute('aria-pressed')).toBe('true');
    expect(moveBtn.getAttribute('aria-pressed')).toBe('false');

    // Click Scale
    await act(async () => {
      scaleBtn.click();
    });

    expect(app.world.getGizmoMode()).toBe('scale');
    expect(scaleBtn.getAttribute('aria-pressed')).toBe('true');
  });

  it('locks and disables transform controls when entity lacks modify permissions', async () => {
    const lockedObject = {
      id: 'prim-locked-2',
      name: 'No-Modify Mesh Statue',
      position: [100, 100, 20],
      rotation: [0, 90, 0],
      scale: [2, 2, 2],
      canModify: false,
      ownerMask: 0x0,
    };
    app.world.selectedObject = lockedObject;

    const host = await mount(createElement(ObjectInspector));

    expect(host.textContent).toContain('Locked (No Modify)');
    expect(host.textContent).toContain('Controls Locked');

    const moveBtn = host.querySelector('button[aria-label="Move mode"]') as HTMLButtonElement;
    const rotateBtn = host.querySelector('button[aria-label="Rotate mode"]') as HTMLButtonElement;
    const scaleBtn = host.querySelector('button[aria-label="Scale mode"]') as HTMLButtonElement;

    expect(moveBtn.disabled).toBe(true);
    expect(rotateBtn.disabled).toBe(true);
    expect(scaleBtn.disabled).toBe(true);
  });

  it('locks transform controls for avatars', async () => {
    const avatarObject = {
      id: 'avatar-user-1',
      name: 'Tester Resident',
      position: [50, 50, 10],
      isAvatar: true,
      canModify: true,
      ownerMask: 0x7fffffff,
    };
    app.world.selectedObject = avatarObject;

    const host = await mount(createElement(ObjectInspector));

    const moveBtn = host.querySelector('button[aria-label="Move mode"]') as HTMLButtonElement;
    expect(moveBtn.disabled).toBe(true);
  });

  it('updates coordinates in real time when selection_updated event fires during drag', async () => {
    const mockObject = {
      id: 'prim-moving-3',
      name: 'Kinetic Sculpture',
      position: [10, 20, 30],
      rotation: [0, 0, 0],
      scale: [1, 1, 1],
      canModify: true,
      ownerMask: 0x4000,
    };
    app.world.selectedObject = mockObject;

    const host = await mount(createElement(ObjectInspector));
    expect(host.textContent).toContain('10.0, 20.0, 30.0');

    // Simulate real-time drag update at 60fps
    await act(async () => {
      app.world.emit('selection_updated', {
        id: 'prim-moving-3',
        name: 'Kinetic Sculpture',
        position: [15.5, 25.5, 35.5],
        rotation: [10.0, 20.0, 30.0],
        scale: [1.5, 1.5, 1.5],
        canModify: true,
        ownerMask: 0x4000,
      });
    });

    expect(host.textContent).toContain('15.5, 25.5, 35.5');
    expect(host.textContent).toContain('10.0, 20.0, 30.0');
    expect(host.textContent).toContain('1.50, 1.50, 1.50');
  });
});
