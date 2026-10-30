// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import CollapsibleSystemDetails from '../CollapsibleSystemDetails';

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

describe('<CollapsibleSystemDetails /> Component', () => {
  it('is collapsed by default and renders button with aria-expanded="false"', async () => {
    const host = await mount(
      <CollapsibleSystemDetails summary="Developer Details">
        <div id="tech-content">UUID: 1234-5678</div>
      </CollapsibleSystemDetails>,
    );

    const button = host.querySelector('button');
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-expanded')).toBe('false');

    const controlsId = button?.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    const content = host.querySelector(`#${controlsId}`);
    expect(content).toBeNull();
    expect(host.querySelector('#tech-content')).toBeNull();
  });

  it('expands when button is clicked and sets aria-expanded="true"', async () => {
    const host = await mount(
      <CollapsibleSystemDetails summary="Developer Details">
        <div id="tech-content">UUID: 1234-5678</div>
      </CollapsibleSystemDetails>,
    );

    const button = host.querySelector('button') as HTMLButtonElement;

    await act(async () => {
      button.click();
    });

    expect(button.getAttribute('aria-expanded')).toBe('true');

    const controlsId = button.getAttribute('aria-controls');
    const panel = host.querySelector(`#${controlsId}`);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('region');
    expect(panel?.textContent).toContain('UUID: 1234-5678');
  });

  it('supports initial open state via defaultOpen prop', async () => {
    const host = await mount(
      <CollapsibleSystemDetails summary="System Details" defaultOpen={true}>
        <div id="tech-content">Port: 13000</div>
      </CollapsibleSystemDetails>,
    );

    const button = host.querySelector('button');
    expect(button?.getAttribute('aria-expanded')).toBe('true');

    const content = host.querySelector('#tech-content');
    expect(content).not.toBeNull();
    expect(content?.textContent).toContain('Port: 13000');
  });

  it('supports controlled open state and onToggle callback', async () => {
    let toggledState: boolean | null = null;
    const handleToggle = (open: boolean) => {
      toggledState = open;
    };

    const host = await mount(
      <CollapsibleSystemDetails
        summary="Advanced Details"
        isOpen={false}
        onToggle={handleToggle}
        id="custom-details-panel"
      >
        <div>Content</div>
      </CollapsibleSystemDetails>,
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.getAttribute('aria-controls')).toBe('custom-details-panel');

    await act(async () => {
      button.click();
    });

    expect(toggledState).toBe(true);
  });
});
