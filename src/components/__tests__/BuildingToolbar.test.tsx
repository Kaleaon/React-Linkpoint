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

  it('manages roving tabIndex and horizontal arrow navigation with wrap-around across mode buttons', async () => {
    const host = await mount(<BuildingToolbar />);

    const getModeBtn = (label: string) =>
      Array.from(host.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === label,
      ) as HTMLButtonElement;

    const createBtn = getModeBtn('REZ PRIM');
    const editBtn = getModeBtn('SHAPE PARAMS');
    const linksetBtn = getModeBtn('LINKSET & DEREZ');

    expect(createBtn.tabIndex).toBe(0);
    expect(editBtn.tabIndex).toBe(-1);
    expect(linksetBtn.tabIndex).toBe(-1);

    await act(async () => {
      createBtn.focus();
    });
    expect(document.activeElement).toBe(createBtn);

    // ArrowRight moves focus and active mode to SHAPE PARAMS
    await act(async () => {
      createBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(editBtn);
    expect(editBtn.tabIndex).toBe(0);
    expect(createBtn.tabIndex).toBe(-1);
    expect(editBtn.getAttribute('aria-pressed')).toBe('true');

    // ArrowRight moves to LINKSET & DEREZ
    await act(async () => {
      editBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(linksetBtn);
    expect(linksetBtn.tabIndex).toBe(0);
    expect(editBtn.tabIndex).toBe(-1);

    // ArrowRight at last mode button wraps around to REZ PRIM
    await act(async () => {
      linksetBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(document.activeElement).toBe(createBtn);
    expect(createBtn.tabIndex).toBe(0);
    expect(linksetBtn.tabIndex).toBe(-1);

    // ArrowLeft at first mode button wraps around to LINKSET & DEREZ
    await act(async () => {
      createBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(document.activeElement).toBe(linksetBtn);
    expect(linksetBtn.tabIndex).toBe(0);
    expect(createBtn.tabIndex).toBe(-1);

    // Home returns to REZ PRIM and End jumps to LINKSET & DEREZ
    await act(async () => {
      linksetBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    });
    expect(document.activeElement).toBe(createBtn);
    expect(createBtn.tabIndex).toBe(0);

    await act(async () => {
      createBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    });
    expect(document.activeElement).toBe(linksetBtn);
    expect(linksetBtn.tabIndex).toBe(0);
  });

  it('manages roving tabIndex across primitive shape buttons with 2D arrow navigation and restores selectedShape focus target on remount', async () => {
    const host = await mount(<BuildingToolbar />);

    const getShapeButtons = () =>
      Array.from(host.querySelectorAll('button')).filter((b) =>
        b.getAttribute('aria-label')?.startsWith('Select '),
      ) as HTMLButtonElement[];

    let shapeButtons = getShapeButtons();
    expect(shapeButtons).toHaveLength(7);
    expect(shapeButtons[0].getAttribute('aria-label')).toBe('Select Box shape');
    expect(shapeButtons[0].tabIndex).toBe(0);
    for (const btn of shapeButtons.slice(1)) {
      expect(btn.tabIndex).toBe(-1);
    }

    await act(async () => {
      shapeButtons[0].focus();
    });

    // ArrowLeft on first shape (Box) wraps to last shape (Ring)
    await act(async () => {
      shapeButtons[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
      );
    });
    shapeButtons = getShapeButtons();
    const ringBtn = shapeButtons[6];
    expect(ringBtn.getAttribute('aria-label')).toBe('Select Ring shape');
    expect(document.activeElement).toBe(ringBtn);
    expect(ringBtn.tabIndex).toBe(0);
    expect(shapeButtons[0].tabIndex).toBe(-1);

    // ArrowDown on last shape (Ring) wraps to first shape (Box) via orientation="both"
    await act(async () => {
      ringBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    shapeButtons = getShapeButtons();
    expect(document.activeElement).toBe(shapeButtons[0]);
    expect(shapeButtons[0].tabIndex).toBe(0);

    // ArrowDown advances to Cylinder, ArrowUp returns to Box, ArrowRight advances to Cylinder -> Prism -> Sphere
    await act(async () => {
      shapeButtons[0].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(shapeButtons[1]);
    expect(shapeButtons[1].getAttribute('aria-label')).toBe('Select Cylinder shape');

    await act(async () => {
      shapeButtons[1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(shapeButtons[0]);

    for (let i = 0; i < 3; i++) {
      const current = document.activeElement as HTMLButtonElement;
      await act(async () => {
        current.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      });
    }
    expect(document.activeElement).toBe(shapeButtons[3]);
    expect(shapeButtons[3].getAttribute('aria-label')).toBe('Select Sphere shape');
    expect(shapeButtons[3].tabIndex).toBe(0);

    // Switch mode to SHAPE PARAMS (unmounts primitive shape buttons) and back to REZ PRIM
    const editBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'SHAPE PARAMS',
    ) as HTMLButtonElement;
    const createBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'REZ PRIM',
    ) as HTMLButtonElement;

    await act(async () => {
      editBtn.click();
    });
    expect(getShapeButtons()).toHaveLength(0);

    await act(async () => {
      createBtn.click();
    });

    // Remounted primitive buttons restore roving tabIndex={0} only on Sphere (selectedShape)
    const remountedShapes = getShapeButtons();
    expect(remountedShapes).toHaveLength(7);
    const remountedSphere = remountedShapes[3];
    expect(remountedSphere.getAttribute('aria-label')).toBe('Select Sphere shape');
    expect(remountedSphere.tabIndex).toBe(0);
    for (const btn of remountedShapes) {
      if (btn !== remountedSphere) {
        expect(btn.tabIndex).toBe(-1);
      }
    }

    // Arrow navigation continues cleanly from remounted Sphere -> Torus
    await act(async () => {
      remountedSphere.focus();
      remountedSphere.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(remountedShapes[4]);
    expect(remountedShapes[4].getAttribute('aria-label')).toBe('Select Torus shape');
    expect(remountedShapes[4].tabIndex).toBe(0);
  });

  it('displays visible FocusRing outlines on focused mode and primitive shape buttons', async () => {
    const host = await mount(<BuildingToolbar />);

    const createBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'REZ PRIM',
    ) as HTMLButtonElement;
    const boxBtn = Array.from(host.querySelectorAll('button')).find(
      (b) => b.getAttribute('aria-label') === 'Select Box shape',
    ) as HTMLButtonElement;

    expect(createBtn.style.outline).toBe('');
    expect(boxBtn.style.outline).toBe('');

    await act(async () => {
      createBtn.focus();
    });
    expect(createBtn.style.outline).toContain('2px solid');
    expect(createBtn.style.outlineOffset).toBe('2px');
    expect(createBtn.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      boxBtn.focus();
    });
    expect(createBtn.style.outline).toBe('');
    expect(createBtn.getAttribute('data-focused')).toBeNull();
    expect(boxBtn.style.outline).toContain('2px solid');
    expect(boxBtn.style.outlineOffset).toBe('2px');
    expect(boxBtn.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      boxBtn.blur();
    });
    expect(boxBtn.style.outline).toBe('');
    expect(boxBtn.getAttribute('data-focused')).toBeNull();
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

  it('calls onDelink and onDerez when action buttons are clicked', async () => {
    const onDelink = vi.fn();
    const onDerez = vi.fn();
    const dummyObj = { id: 'obj-1', localId: 101, name: 'Selected Prim' };
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
    expect(onDerez).toHaveBeenCalledWith([101]);
  });
});
