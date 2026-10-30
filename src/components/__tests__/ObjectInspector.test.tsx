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
  vi.restoreAllMocks();
});

describe('ObjectInspector Component', () => {
  beforeEach(() => {
    app.economy.currencySymbol = 'L$';
    app.economy.isZeroCurrency = false;
    app.economy.balance = 500;
  });

  it('renders "No object selected" when no selection is active', async () => {
    app.world.selectedObject = null;
    const host = await mount(createElement(ObjectInspector));

    expect(host.textContent).toContain('No object selected');
  });

  it('renders object details and opens PayDialog when "PAY OBJECT" button is clicked', async () => {
    const mockObject = {
      id: 'obj-456-789',
      name: 'Designer Dress Vendor',
      owner: 'Fashionista Resident',
      price: 150,
      x: 128,
      y: 128,
      z: 25,
      distance: 5.2,
    };
    app.world.selectedObject = mockObject;

    const host = await mount(createElement(ObjectInspector));

    expect(host.textContent).toContain('Designer Dress Vendor');
    expect(host.textContent).toContain('Fashionista Resident');

    const payBtn = Array.from(host.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('PAY OBJECT'),
    );
    expect(payBtn).toBeDefined();

    await act(async () => {
      payBtn?.click();
    });

    expect(host.textContent).toContain('Pay Object');
    expect(host.textContent).toContain('Seller / Owner:Fashionista Resident');
    expect(host.textContent).toContain('Item Price:L$ 150');
  });
});
