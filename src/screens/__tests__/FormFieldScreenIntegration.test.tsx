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
import PayDialog from '../../components/PayDialog.jsx';
import FloatersDesktop from '../../components/FloatersDesktop.jsx';
import Card from '../../components/Card.jsx';
import OutfitViewer from '../OutfitViewer.jsx';

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

function fireInput(element: HTMLInputElement, value: string) {
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
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
    expect(layoutSelect?.getAttribute('aria-label')).toBe('Layout');

    const searchInput = host.querySelector('input[type="search"]');
    expect(searchInput?.getAttribute('aria-label')).toBe('Search settings');
  });

  it('PayDialog inputs integrate FormField wrapper and associate labels with controls', async () => {
    const host = await mount(
      <PayDialog isOpen={true} onClose={() => {}} target={{ name: 'Test Avatar' }} />,
    );

    const customAmountInput = host.querySelector(
      'input[placeholder="Custom amount"]',
    ) as HTMLInputElement;
    expect(customAmountInput).not.toBeNull();
    const customLabel = host.querySelector(`label[for="${customAmountInput?.id}"]`);
    expect(customLabel?.textContent).toBe('Or enter custom amount');
    expect(customAmountInput?.getAttribute('aria-label')).toBe('Custom payment amount');

    const descInput = host.querySelector(
      'input[placeholder="Note to recipient"]',
    ) as HTMLInputElement;
    expect(descInput).not.toBeNull();
    const descLabel = host.querySelector(`label[for="${descInput?.id}"]`);
    expect(descLabel?.textContent).toBe('Description / Note');
    expect(descInput?.getAttribute('aria-label')).toBe('Description / Note');
  });

  it('FloatersDesktop quick chat input integrates FormField wrapper', async () => {
    const host = await mount(<FloatersDesktop />);

    const chatInput = host.querySelector('input[placeholder="Nearby Chat..."]') as HTMLInputElement;
    expect(chatInput).not.toBeNull();
    const label = host.querySelector(`label[for="${chatInput?.id}"]`);
    expect(label?.textContent).toBe('Nearby Chat');
    expect(chatInput?.getAttribute('aria-label')).toBe('Nearby Chat');
  });

  it('OutfitViewer filter inputs expose explicit ARIA labels', async () => {
    const host = await mount(<OutfitViewer />);

    const filterInput = host.querySelector('input[placeholder="Filter outfit items..."]');
    expect(filterInput?.getAttribute('aria-label')).toBe('Filter outfit items');

    const categorySelect = host.querySelector('select');
    expect(categorySelect?.getAttribute('aria-label')).toBe('Filter by category');
  });

  it('Card component select exposes explicit aria-label from title or custom prop', async () => {
    const host1 = await mount(
      <Card
        c={{
          title: 'Card Setting',
          select: true,
          value: 'opt1',
          options: [{ value: 'opt1', label: 'Option 1' }],
          onChange: () => {},
        }}
      />,
    );
    const select1 = host1.querySelector('select');
    expect(select1?.getAttribute('aria-label')).toBe('Card Setting');

    const host2 = await mount(
      <Card
        c={{
          title: 'Card Setting',
          'aria-label': 'Custom Card Label',
          select: true,
          value: 'opt1',
          options: [{ value: 'opt1', label: 'Option 1' }],
          onChange: () => {},
        }}
      />,
    );
    const select2 = host2.querySelector('select');
    expect(select2?.getAttribute('aria-label')).toBe('Custom Card Label');
  });
});
