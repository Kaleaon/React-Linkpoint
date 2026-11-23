import { afterEach, describe, expect, it, vi } from 'vitest';
import React, { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BuildingToolbar } from '../BuildingToolbar';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { app } from '../../linkpoint/app';

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
  vi.restoreAllMocks();
});

describe('BuildingToolbar Component', () => {
  it('renders creation controls and responds to shape selection and rez click', async () => {
    const onRez = vi.fn();
    const host = await mount(<BuildingToolbar onRez={onRez} />);

    expect(host.textContent).toContain('Building Controls');
    expect(host.textContent).toContain('REZ PRIM');
    expect(host.textContent).toContain('SHAPE PARAMS');
    expect(host.textContent).toContain('LINKSET & DEREZ');

    // Click Sphere shape button
    const sphereBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sphere'),
    );
    expect(sphereBtn).toBeDefined();

    await act(async () => {
      sphereBtn?.click();
    });

    // Click REZ SPHERE IN WORLD button
    const rezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('REZ SPHERE IN WORLD'),
    );
    expect(rezBtn).toBeDefined();

    await act(async () => {
      rezBtn?.click();
    });

    expect(onRez).toHaveBeenCalledWith('sphere', expect.any(Array));
  });

  it('switches to SHAPE PARAMS tab and updates shape params', async () => {
    const onUpdateShape = vi.fn();
    const dummyObj = { id: 'obj-1', localId: 101, name: 'Sample Prim' };
    const host = await mount(
      <BuildingToolbar selectedObject={dummyObj} onUpdateShape={onUpdateShape} />,
    );

    // Switch tab to SHAPE PARAMS
    const editTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'SHAPE PARAMS',
    );
    expect(editTabBtn).toBeDefined();

    await act(async () => {
      editTabBtn?.click();
    });

    expect(host.textContent).toContain('Shape Type:');
    expect(host.textContent).toContain('Scale (X, Y, Z):');

    // Click APPLY SHAPE PARAMETERS
    const applyBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('APPLY SHAPE PARAMETERS'),
    );
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn?.click();
    });

    expect(onUpdateShape).toHaveBeenCalledWith(
      expect.objectContaining({
        localId: 101,
      }),
    );
  });

  it('switches to LINKSET & DEREZ tab and verifies selection safety error on insufficient targets', async () => {
    const dummyObj = { id: 'obj-1', localId: 101, name: 'Single Prim' };
    const host = await mount(
      <BuildingToolbar selectedObject={dummyObj} selectedObjects={[dummyObj]} />,
    );

    // Switch to LINKSET & DEREZ tab
    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    expect(linksetTabBtn).toBeDefined();

    await act(async () => {
      linksetTabBtn?.click();
    });

    expect(host.textContent).toContain('Select primitives to link into a linkset.');

    const linkBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('LINK PRIMITIVES'),
    );
    expect(linkBtn).toBeDefined();

    await act(async () => {
      linkBtn?.click();
    });

    // Verification of Selection Safety notice:
    expect(host.textContent).toContain(
      'Selection Safety: Linking requires two or more selected primitives',
    );
  });

  it('triggers onLink when 2 or more objects are selected', async () => {
    const onLink = vi.fn();
    const obj1 = { id: 'obj-1', localId: 101, name: 'Child Prim' };
    const obj2 = { id: 'obj-2', localId: 102, name: 'Root Prim' };
    const host = await mount(
      <BuildingToolbar selectedObject={obj2} selectedObjects={[obj1, obj2]} onLink={onLink} />,
    );

    // Switch to LINKSET & DEREZ tab
    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    await act(async () => {
      linksetTabBtn?.click();
    });

    const linkBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('LINK PRIMITIVES'),
    );
    expect(linkBtn).toBeDefined();

    await act(async () => {
      linkBtn?.click();
    });

    expect(onLink).toHaveBeenCalledWith([101, 102]);
  });

  it('opens confirmation modal before derezzing and dispatches onDerez only after confirmation', async () => {
    const onDelink = vi.fn();
    const onDerez = vi.fn();
    const dummyObj = { id: 'obj-1', localId: 101, name: 'Selected Prim' };
    app.world.region = { name: 'Ahern' };

    const host = await mount(
      <BuildingToolbar
        selectedObject={dummyObj}
        selectedObjects={[dummyObj]}
        onDelink={onDelink}
        onDerez={onDerez}
      />,
    );

    // Switch to LINKSET & DEREZ tab
    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    await act(async () => {
      linksetTabBtn?.click();
    });

    const delinkBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DELINK'),
    );
    expect(delinkBtn).toBeDefined();
    await act(async () => {
      delinkBtn?.click();
    });
    expect(onDelink).toHaveBeenCalledWith([101]);

    const derezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DEREZ SELECTED OBJECT'),
    );
    expect(derezBtn).toBeDefined();
    await act(async () => {
      derezBtn?.click();
    });

    // Initial click opens modal without invoking deletion
    expect(onDerez).not.toHaveBeenCalled();

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.textContent).toContain('Confirm Object Derez');
    expect(dialog?.textContent).toContain('Selected Prim');
    expect(dialog?.textContent).toContain('101');
    expect(dialog?.textContent).toContain('Ahern');

    // Confirm Derez invokes deletion and closes modal
    const confirmBtn = Array.from(dialog!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Derez'),
    );
    expect(confirmBtn).toBeDefined();
    await act(async () => {
      confirmBtn?.click();
    });

    expect(onDerez).toHaveBeenCalledTimes(1);
    expect(onDerez).toHaveBeenCalledWith([101]);
    expect(host.querySelector('[role="dialog"]')).toBeNull();

    app.world.region = null;
  });

  it('cancels derez modal via Cancel button and Escape key while trapping keyboard focus', async () => {
    const onDerez = vi.fn();
    const dummyObj = { id: 'obj-2', localId: 202, name: 'Sculpted Fountain' };

    const host = await mount(
      <BuildingToolbar selectedObject={dummyObj} simulatorName="Morris" onDerez={onDerez} />,
    );

    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    await act(async () => {
      linksetTabBtn?.click();
    });

    const derezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DEREZ SELECTED OBJECT'),
    ) as HTMLButtonElement;
    derezBtn.focus();

    await act(async () => {
      derezBtn.click();
    });

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Morris');

    const cancelBtn = Array.from(dialog!.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLButtonElement;
    const confirmBtn = Array.from(dialog!.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirm Derez'),
    ) as HTMLButtonElement;

    // FocusTrap focuses first interactive control (Cancel) on mount
    expect(document.activeElement).toBe(cancelBtn);

    // Tab wraps focus inside modal
    confirmBtn.focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    });
    expect(document.activeElement).toBe(cancelBtn);

    // Cancel button closes modal without deleting
    await act(async () => {
      cancelBtn.click();
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(onDerez).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(derezBtn);

    // Re-open and dismiss via Escape key
    await act(async () => {
      derezBtn.click();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(onDerez).not.toHaveBeenCalled();
  });

  it('falls back to primitive shape and local ID when custom name and simulator metadata are missing', async () => {
    app.world.region = null;
    const onDerez = vi.fn();
    const unnamedObj = { id: 'obj-3', localId: 303, shape: 'cylinder' };

    const host = await mount(<BuildingToolbar selectedObject={unnamedObj} onDerez={onDerez} />);

    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    await act(async () => {
      linksetTabBtn?.click();
    });

    const derezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DEREZ SELECTED OBJECT'),
    );
    await act(async () => {
      derezBtn?.click();
    });

    const dialog = host.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.querySelector('[data-testid="derez-target-name"]')?.textContent).toBe(
      'Cylinder #303',
    );
    expect(dialog?.querySelector('[data-testid="derez-target-local-id"]')?.textContent).toBe('303');
    expect(dialog?.querySelector('[data-testid="derez-target-simulator"]')?.textContent).toBe('—');
  });

  it('dismisses the confirmation modal without deleting when object selection changes', async () => {
    const onDerez = vi.fn();
    const firstObj = { id: 'obj-10', localId: 410, name: 'First Crate' };
    const secondObj = { id: 'obj-20', localId: 420, name: 'Second Crate' };

    const host = await mount(<BuildingToolbar selectedObject={firstObj} onDerez={onDerez} />);

    const linksetTabBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'LINKSET & DEREZ',
    );
    await act(async () => {
      linksetTabBtn?.click();
    });

    const derezBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('DEREZ SELECTED OBJECT'),
    );
    await act(async () => {
      derezBtn?.click();
    });

    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="derez-target-name"]')?.textContent).toBe(
      'First Crate',
    );

    // Re-render with a different selectedObject prop while modal is open
    await act(async () => {
      mounted!.root.render(
        createElement(
          AppProvider,
          null,
          createElement(
            ThemeProvider,
            null,
            <BuildingToolbar selectedObject={secondObj} onDerez={onDerez} />,
          ),
        ),
      );
    });

    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(onDerez).not.toHaveBeenCalled();

    // Also verify dismissal when world selection_changed fires
    await act(async () => {
      derezBtn?.click();
    });
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();

    await act(async () => {
      app.world.emit('selection_changed', null);
    });
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(onDerez).not.toHaveBeenCalled();
  });
});
