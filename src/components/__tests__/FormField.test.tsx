import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import FormField from '../FormField.jsx';

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

describe('<FormField /> Component', () => {
  it('renders child element and generates stable id and label association', async () => {
    const host = await mount(
      <FormField label="Username">
        <input type="text" placeholder="Enter username" />
      </FormField>,
    );

    const label = host.querySelector('label');
    const input = host.querySelector('input');

    expect(label).not.toBeNull();
    expect(input).not.toBeNull();
    expect(label?.textContent).toBe('Username');

    const inputId = input?.getAttribute('id');
    expect(inputId).toBeTruthy();
    expect(label?.getAttribute('for')).toBe(inputId);

    // No error, aria-invalid and aria-errormessage should not be present
    expect(input?.getAttribute('aria-invalid')).toBeNull();
    expect(input?.getAttribute('aria-errormessage')).toBeNull();
  });

  it('preserves existing child id and associates label with it', async () => {
    const host = await mount(
      <FormField label="Password">
        <input id="custom-pass-id" type="password" />
      </FormField>,
    );

    const label = host.querySelector('label');
    const input = host.querySelector('input');

    expect(input?.getAttribute('id')).toBe('custom-pass-id');
    expect(label?.getAttribute('for')).toBe('custom-pass-id');
  });

  it('attaches aria-invalid, aria-errormessage, and renders error alert when error prop is provided', async () => {
    const host = await mount(
      <FormField label="Avatar Name" error="Avatar name is required.">
        <input type="text" />
      </FormField>,
    );

    const input = host.querySelector('input');
    const alert = host.querySelector('[role="alert"]');

    expect(alert).not.toBeNull();
    expect(alert?.textContent).toBe('Avatar name is required.');

    const errorId = alert?.getAttribute('id');
    expect(errorId).toBeTruthy();

    expect(input?.getAttribute('aria-invalid')).toBe('true');
    expect(input?.getAttribute('aria-errormessage')).toBe(errorId);
  });

  it('attaches helpText and aria-describedby correctly', async () => {
    const host = await mount(
      <FormField label="Mount Path" helpText="Enter flashdrive directory" error="Invalid path">
        <input type="text" />
      </FormField>,
    );

    const input = host.querySelector('input');
    const help = host.querySelector('small');
    const alert = host.querySelector('[role="alert"]');

    expect(help?.textContent).toBe('Enter flashdrive directory');
    const helpId = help?.getAttribute('id');
    const errorId = alert?.getAttribute('id');

    expect(input?.getAttribute('aria-describedby')).toBe(`${helpId} ${errorId}`);
  });
});
