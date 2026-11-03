import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import ObjectInspector from '../ObjectInspector';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';
import { slBridge } from '../../linkpoint/sl-bridge';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

function changeInput(input: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  nativeInputValueSetter?.call(input, value);
  input.dispatchEvent(new Event('change', { bubbles: true }));
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

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  app.objectEditPipeline.clearSessionState();
  app.world.selectedObject = null;
  vi.restoreAllMocks();
});

describe('ObjectInspector - Transactional Object Editing', () => {
  const mockObject = {
    id: 'test-object-1',
    name: 'Interactive Chair',
    owner: 'Builder Resident',
    price: 0,
    position: [100.0, 150.0, 25.0],
    rotation: [0, 0, 0, 1],
    scale: [1.0, 1.0, 1.0],
    distance: 3.5,
  };

  beforeEach(() => {
    app.world.selectedObject = { ...mockObject };
    app.objectEditPipeline.beginSession(app.world.selectedObject);
  });

  it('renders numerical form inputs for Position, Rotation, and Scale', async () => {
    const host = await mount(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    const posY = host.querySelector('input[aria-label="Position Y"]') as HTMLInputElement;
    const posZ = host.querySelector('input[aria-label="Position Z"]') as HTMLInputElement;

    expect(posX).toBeDefined();
    expect(Number(posX.value)).toBe(100);
    expect(Number(posY.value)).toBe(150);
    expect(Number(posZ.value)).toBe(25);

    const scaleX = host.querySelector('input[aria-label="Scale X"]') as HTMLInputElement;
    expect(scaleX).toBeDefined();
    expect(Number(scaleX.value)).toBe(1);

    // Should not show "Unsaved Modifications" pill initially
    expect(host.querySelector('[data-testid="unsaved-status-pill"]')).toBeNull();
  });

  it('modifying numerical input marks pipeline dirty and displays Unsaved Modifications pill', async () => {
    const host = await mount(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;

    await act(async () => {
      changeInput(posX, '105.5');
    });

    expect(app.objectEditPipeline.isDirty).toBe(true);

    const pill = host.querySelector('[data-testid="unsaved-status-pill"]');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toContain('Unsaved Modifications');
  });

  it('APPLY button triggers pipeline commit and clears dirty status', async () => {
    const bridgeSpy = vi.spyOn(slBridge, 'commitObjectTransaction').mockResolvedValueOnce({
      committed: true,
      chunks: 1,
      objectsUpdated: 1,
      linksUpdated: 0,
    });

    const host = await mount(createElement(ObjectInspector));

    // Make an edit
    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '120.0');
    });
    expect(app.objectEditPipeline.isDirty).toBe(true);

    const applyBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('APPLY'),
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    expect(bridgeSpy).toHaveBeenCalled();
    expect(app.objectEditPipeline.isDirty).toBe(false);
    expect(host.querySelector('[data-testid="unsaved-status-pill"]')).toBeNull();
  });

  it('DISCARD button rolls back changes and clears dirty status', async () => {
    const host = await mount(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '200.0');
    });
    expect(app.objectEditPipeline.isDirty).toBe(true);

    const discardBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DISCARD'),
    );
    expect(discardBtn).toBeDefined();

    await act(async () => {
      discardBtn?.click();
    });

    expect(app.objectEditPipeline.isDirty).toBe(false);
    expect(host.querySelector('[data-testid="unsaved-status-pill"]')).toBeNull();
    // Position input reverted to original snapshot
    const revertedPosX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    expect(Number(revertedPosX.value)).toBe(100);
  });

  it('UNDO and REDO action buttons navigate history stack', async () => {
    const host = await mount(createElement(ObjectInspector));

    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;

    // Apply change 1
    await act(async () => {
      changeInput(posX, '110.0');
    });
    expect(app.objectEditPipeline.canUndo()).toBe(true);

    const undoBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('UNDO'),
    );
    const redoBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('REDO'),
    );

    // Click UNDO
    await act(async () => {
      undoBtn?.click();
    });
    expect(app.objectEditPipeline.canUndo()).toBe(false);
    expect(app.objectEditPipeline.canRedo()).toBe(true);

    // Click REDO
    await act(async () => {
      redoBtn?.click();
    });
    expect(app.objectEditPipeline.canUndo()).toBe(true);
    expect(app.objectEditPipeline.canRedo()).toBe(false);
  });

  it('responds to Ctrl+Z and Ctrl+Y keyboard shortcuts', async () => {
    await mount(createElement(ObjectInspector));

    // Make a change
    act(() => {
      app.objectEditPipeline.modifyObject('test-object-1', {
        position: [115, 150, 25],
      });
    });
    expect(app.objectEditPipeline.canUndo()).toBe(true);

    // Dispatch Ctrl+Z
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(app.objectEditPipeline.canUndo()).toBe(false);
    expect(app.objectEditPipeline.canRedo()).toBe(true);

    // Dispatch Ctrl+Y
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'y',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    });
    expect(app.objectEditPipeline.canUndo()).toBe(true);
  });

  it('prompts "Save or Discard changes?" modal dialog when attempting to deselect with unsaved modifications', async () => {
    const host = await mount(createElement(ObjectInspector));

    // Make a change so pipeline is dirty
    const posX = host.querySelector('input[aria-label="Position X"]') as HTMLInputElement;
    await act(async () => {
      changeInput(posX, '150.0');
    });
    expect(app.objectEditPipeline.isDirty).toBe(true);

    // Attempt to deselect via close button
    const deselectBtn = host.querySelector(
      'button[aria-label="Deselect object"]',
    ) as HTMLButtonElement;
    expect(deselectBtn).toBeDefined();

    await act(async () => {
      deselectBtn.click();
    });

    // Object should NOT be deselected yet; dialog should open
    expect(app.world.selectedObject).not.toBeNull();
    expect(host.textContent).toContain('Save or Discard changes?');

    // Click "Discard" in modal dialog
    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const modalDiscardBtn = Array.from(dialog!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Discard',
    );
    expect(modalDiscardBtn).toBeDefined();

    await act(async () => {
      modalDiscardBtn?.click();
    });

    // Modifications discarded and object deselected
    expect(app.world.selectedObject).toBeNull();
    expect(app.objectEditPipeline.isDirty).toBe(false);
  });
});
