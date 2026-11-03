// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider, useApp } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import Toggle from '../Toggle.jsx';
import Card from '../Card.jsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

interface MountedHarness {
  host: HTMLElement;
  root: Root;
  appCtx: { current: any };
}

let mounted: MountedHarness | null = null;

async function mountWithTheme(
  ui: (themeContext: any) => ReactNode,
  initialLayout: string = 'terminal',
): Promise<MountedHarness> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const appCtx = { current: null as any };

  const Probe = () => {
    appCtx.current = useApp();
    return null;
  };

  const TestWrapper = () => {
    return createElement('div', null, createElement(Probe), ui(appCtx.current));
  };

  await act(async () => {
    root.render(
      createElement(
        AppProvider,
        null,
        createElement(ThemeProvider, null, createElement(TestWrapper)),
      ),
    );
  });

  if (appCtx.current?.actions?.setLayout) {
    await act(async () => {
      appCtx.current.actions.setLayout(initialLayout);
    });
  }

  mounted = { host, root, appCtx };
  return mounted;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
  document.body.innerHTML = '';
  localStorage.clear();
  vi.restoreAllMocks();
});

/**
 * Computes accessible name following W3C Accessible Name and Description Computation (AccName 1.2):
 * 1. aria-labelledby targets
 * 2. aria-label attribute
 * 3. Element text content fallback for elements allowing name from content
 */
function computeAccessibleName(element: HTMLElement): string {
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    const text = labelledBy
      .split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent?.trim() || '')
      .filter(Boolean)
      .join(' ');
    if (text) return text;
  }
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    return ariaLabel.trim();
  }
  return element.textContent?.trim() || '';
}

describe('Toggle & Card Accessibility (WCAG 2.2 SC 4.1.2 & SC 1.3.1)', () => {
  it('Card propagates c.title to Toggle aria-label in non-SWEEP theme', async () => {
    const cardConfig = {
      title: 'Autoplay parcel media',
      toggle: true,
      on: false,
      togglePick: vi.fn(),
    };

    const { host } = await mountWithTheme(() => <Card c={cardConfig} />, 'terminal');

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.tagName).toBe('SPAN');
    expect(switchEl.getAttribute('aria-label')).toBe('Autoplay parcel media');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');
    expect(computeAccessibleName(switchEl)).toBe('Autoplay parcel media');
  });

  it('Card prioritizes c["aria-label"] over c.title if provided', async () => {
    const cardConfig = {
      title: 'Parcel Audio',
      'aria-label': 'Enable parcel audio streaming',
      toggle: true,
      on: true,
      togglePick: vi.fn(),
    };

    const { host } = await mountWithTheme(() => <Card c={cardConfig} />, 'terminal');

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.getAttribute('aria-label')).toBe('Enable parcel audio streaming');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(computeAccessibleName(switchEl)).toBe('Enable parcel audio streaming');
  });

  it('In SWEEP theme, Toggle renders as a button switch computing accessible name from label instead of button text', async () => {
    const cardConfig = {
      title: 'Autoplay parcel media',
      toggle: true,
      on: false,
      togglePick: vi.fn(),
    };

    const { host } = await mountWithTheme(() => <Card c={cardConfig} />, 'sweep');

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.tagName).toBe('BUTTON');
    expect(switchEl.textContent).toBe('OFF');
    expect(switchEl.getAttribute('aria-label')).toBe('Autoplay parcel media');
    expect(switchEl.getAttribute('aria-checked')).toBe('false');

    // Priority check: Accessible name computes to card title, overriding button text ("OFF")
    expect(computeAccessibleName(switchEl)).toBe('Autoplay parcel media');
  });

  it('In SWEEP theme, Toggle with aria-labelledby computes accessible name from referenced element', async () => {
    const labelId = 'media-toggle-heading';
    const { host } = await mountWithTheme(
      () => (
        <div>
          <span id={labelId}>Background Music</span>
          <Toggle aria-labelledby={labelId} on={true} onClick={() => {}} />
        </div>
      ),
      'sweep',
    );

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.tagName).toBe('BUTTON');
    expect(switchEl.textContent).toBe('ON');
    expect(switchEl.getAttribute('aria-labelledby')).toBe(labelId);
    expect(computeAccessibleName(switchEl)).toBe('Background Music');
  });

  it('Emits a development console warning if both aria-label and aria-labelledby are omitted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mountWithTheme(() => <Toggle on={false} onClick={() => {}} />, 'terminal');

    expect(warnSpy).toHaveBeenCalled();
    const warnCall = warnSpy.mock.calls.find((call) =>
      call[0]?.includes('Toggle requires either an `aria-label` or `aria-labelledby` prop'),
    );
    expect(warnCall).toBeDefined();
  });

  it('Does NOT emit a console warning when aria-label is provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mountWithTheme(
      () => <Toggle aria-label="Toggle Flight" on={true} onClick={() => {}} />,
      'terminal',
    );

    const warnCall = warnSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0]?.includes('Toggle requires either an `aria-label` or `aria-labelledby` prop'),
    );
    expect(warnCall).toBeUndefined();
  });

  it('Does NOT emit a console warning when aria-labelledby is provided', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await mountWithTheme(
      () => <Toggle aria-labelledby="setting-id" on={false} onClick={() => {}} />,
      'terminal',
    );

    const warnCall = warnSpy.mock.calls.find(
      (call) =>
        typeof call[0] === 'string' &&
        call[0]?.includes('Toggle requires either an `aria-label` or `aria-labelledby` prop'),
    );
    expect(warnCall).toBeUndefined();
  });

  it('Preserves visual knob element and styling in non-SWEEP themes', async () => {
    const { host } = await mountWithTheme(
      () => <Toggle aria-label="Visual check" on={false} onClick={() => {}} />,
      'terminal',
    );

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    const knob = switchEl.querySelector('span');
    expect(knob).not.toBeNull();
    expect(knob?.style.width).toBe('18px');
    expect(knob?.style.height).toBe('18px');
    expect(knob?.style.borderRadius).toBe('9px');
  });

  it('Does not mutate the original card object passed into Card', async () => {
    const originalConfig = Object.freeze({
      title: 'Immutable Card',
      toggle: true,
      on: true,
      togglePick: vi.fn(),
    });

    const { host } = await mountWithTheme(() => <Card c={originalConfig} />, 'terminal');

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.getAttribute('aria-label')).toBe('Immutable Card');
    expect(originalConfig.title).toBe('Immutable Card');
  });

  it('Supports click interactions and invokes onClick handler', async () => {
    const handleClick = vi.fn();
    const { host } = await mountWithTheme(
      () => <Toggle aria-label="Interactive Toggle" on={false} onClick={handleClick} />,
      'terminal',
    );

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    await act(async () => {
      switchEl.click();
    });

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('In LCARS theme (nav: SWEEP), Toggle also renders as a button switch prioritizing label', async () => {
    const cardConfig = {
      title: 'Voice indicator',
      toggle: true,
      on: true,
      togglePick: vi.fn(),
    };

    const { host } = await mountWithTheme(() => <Card c={cardConfig} />, 'lcars');

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.tagName).toBe('BUTTON');
    expect(switchEl.textContent).toBe('ON');
    expect(switchEl.getAttribute('aria-label')).toBe('Voice indicator');
    expect(computeAccessibleName(switchEl)).toBe('Voice indicator');
  });

  it('Supports standalone Settings.jsx pattern with aria-labelledby and role="none" wrapper', async () => {
    const settingId = 'pref-sound-effects';
    const handleToggle = vi.fn();

    const { host } = await mountWithTheme(
      () => (
        <div className="settings-switch-row">
          <span id={`${settingId}-label`}>Sound Effects</span>
          <span role="none" aria-labelledby={`${settingId}-label`}>
            <Toggle
              aria-labelledby={`${settingId}-label`}
              on={true}
              onClick={handleToggle}
              disabled={false}
            />
          </span>
        </div>
      ),
      'terminal',
    );

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.getAttribute('aria-labelledby')).toBe(`${settingId}-label`);
    expect(computeAccessibleName(switchEl)).toBe('Sound Effects');
  });

  it('Supports standalone LumiyaTools.jsx pattern with explicit aria-label and flag toggle', async () => {
    let parcelFlags = 8192;
    const toggleFlag = vi.fn((mask: number) => {
      parcelFlags ^= mask;
    });

    const { host } = await mountWithTheme(
      () => (
        <div>
          <span>Group Access Only</span>
          <Toggle
            on={Boolean(parcelFlags & 8192)}
            onClick={() => toggleFlag(8192)}
            aria-label="Toggle Group Access Only"
          />
        </div>
      ),
      'terminal',
    );

    const switchEl = host.querySelector('[role="switch"]') as HTMLElement;
    expect(switchEl).not.toBeNull();
    expect(switchEl.getAttribute('aria-label')).toBe('Toggle Group Access Only');
    expect(switchEl.getAttribute('aria-checked')).toBe('true');
    expect(computeAccessibleName(switchEl)).toBe('Toggle Group Access Only');
  });

  it('Respects disabled prop in both normal and SWEEP themes', async () => {
    // Normal theme
    const { host: hostNormal } = await mountWithTheme(
      () => <Toggle aria-label="Disabled Switch" on={false} disabled={true} />,
      'terminal',
    );
    const switchNormal = hostNormal.querySelector('[role="switch"]') as HTMLElement;
    expect(switchNormal.getAttribute('aria-disabled')).toBe('true');
    expect(switchNormal.getAttribute('tabindex')).toBe('-1');

    // SWEEP theme
    const { host: hostSweep } = await mountWithTheme(
      () => <Toggle aria-label="Disabled Sweep Switch" on={true} disabled={true} />,
      'sweep',
    );
    const switchSweep = hostSweep.querySelector('[role="switch"]') as HTMLElement;
    expect(switchSweep.getAttribute('aria-disabled')).toBe('true');
  });
});
