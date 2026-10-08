import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Login from '../Login.jsx';
import Search from '../Search.jsx';
import CacheScreen from '../CacheScreen.jsx';
import Radar from '../Radar.jsx';
import Settings from '../Settings.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      createElement(AppProvider, null, createElement(ThemeProvider, null, ui))
    );
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

function fireInput(element: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  nativeInputValueSetter?.call(element, value);
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('FormField Screen Integration', () => {
  it('Login screen exposes aria-invalid and aria-errormessage on submit failure', async () => {
    const host = await mount(<Login />);
    const form = host.querySelector('form');
    const usernameInput = host.querySelector('input[autocomplete="username"]');
    const passwordInput = host.querySelector('input[type="password"]');

    expect(usernameInput?.getAttribute('aria-invalid')).toBeNull();
    expect(passwordInput?.getAttribute('aria-invalid')).toBeNull();

    await act(async () => {
      form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(usernameInput?.getAttribute('aria-invalid')).toBe('true');
    expect(passwordInput?.getAttribute('aria-invalid')).toBe('true');

    const userErrorId = usernameInput?.getAttribute('aria-errormessage');
    const passErrorId = passwordInput?.getAttribute('aria-errormessage');

    expect(userErrorId).toBeTruthy();
    expect(passErrorId).toBeTruthy();

    const userAlert = host.querySelector(`[id="${userErrorId}"]`);
    const passAlert = host.querySelector(`[id="${passErrorId}"]`);

    expect(userAlert).not.toBeNull();
    expect(passAlert).not.toBeNull();
    expect(userAlert?.getAttribute('role')).toBe('alert');
    expect(passAlert?.getAttribute('role')).toBe('alert');
  });

  it('Search screen exposes aria-invalid="true" for 1-character query', async () => {
    const host = await mount(<Search />);
    const input = host.querySelector('input.search-input') as HTMLInputElement;

    expect(input?.getAttribute('aria-invalid')).toBeNull();

    await act(async () => {
      fireInput(input, 'a');
    });

    expect(input?.getAttribute('aria-invalid')).toBe('true');
    const errorId = input?.getAttribute('aria-errormessage');
    expect(errorId).toBeTruthy();

    const alert = host.querySelector(`[id="${errorId}"]`);
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Enter at least 2 characters');
  });

  it('Radar screen exposes aria-invalid="true" for 1-character search filter', async () => {
    const host = await mount(<Radar />);
    const input = host.querySelector('input.search-input') as HTMLInputElement;

    expect(input?.getAttribute('aria-invalid')).toBeNull();

    await act(async () => {
      fireInput(input, 'x');
    });

    expect(input?.getAttribute('aria-invalid')).toBe('true');
    const errorId = input?.getAttribute('aria-errormessage');
    expect(errorId).toBeTruthy();

    const alert = host.querySelector(`[id="${errorId}"]`);
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Filter query must be at least 2 characters.');
  });

  it('CacheScreen custom path input integrates FormField wrapper', async () => {
    const host = await mount(<CacheScreen />);
    const pathInput = host.querySelector('input[aria-label="Custom cache mount path"]');

    expect(pathInput).not.toBeNull();
    const label = host.querySelector('label[for="' + pathInput?.id + '"]');
    expect(label?.textContent).toBe('Flashdrive Mount Path');
  });

  it('Settings screen renders form fields with ARIA associations', async () => {
    const host = await mount(<Settings />);
    const layoutSelect = host.querySelector('#settings-layout-select');

    expect(layoutSelect).not.toBeNull();
    const label = host.querySelector('label[for="settings-layout-select"]');
    expect(label?.textContent).toBe('Layout');
  });
});
