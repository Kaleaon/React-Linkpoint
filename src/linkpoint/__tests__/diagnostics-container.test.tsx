// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { CSUB, subView } from '../../theme/constants.js';
import DiagnosticsContainer from '../../screens/DiagnosticsContainer.jsx';
import CapabilityExplorer from '../../screens/CapabilityExplorer.jsx';
import ScreenBody from '../../components/ScreenBody.jsx';
import SegmentedTabs from '../../components/SegmentedTabs.jsx';
import { app } from '../app';
import { click, mountScreen, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  app.protocol.connected = true;
  app.protocol.capabilities = {
    EventQueueGet: 'https://sim.agni.lindenlab.com/cap/eventqueue',
    MeshUpload: 'https://sim.agni.lindenlab.com/cap/mesh',
    ObjectMedia: '',
  };
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

const typeIntoInput = async (el: HTMLInputElement, value: string) => {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Tabbed Diagnostics Suite: Container, Telemetry & Capability Explorer', () => {
  it('Requirement 1: CSUB defines TELEMETRY and CAPABILITIES subnavigation tabs for Diagnostics', () => {
    expect(CSUB.Diagnostics).toEqual([
      ['TELEMETRY', '· 01'],
      ['CAPABILITIES', '· 02'],
    ]);
  });

  it('Criterion 1 & Requirement 3: Navigating to Diagnostics defaults to Telemetry tab with DiagnosticsPanel', async () => {
    const state = { tabs: { Diagnostics: 'TELEMETRY' } };
    expect(subView(state, 'Diagnostics')).toBe('TELEMETRY');

    mounted = await mountScreen(DiagnosticsContainer);
    const host = mounted.host;

    // Checks panel container role and id
    const panel = host.querySelector('[role="tabpanel"]');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('id')).toBe('panel-diagnostics-telemetry');
    expect(panel?.getAttribute('aria-label')).toBe('Telemetry Overview');

    // Telemetry dashboard KPI cards and ping probe button
    expect(host.textContent).toContain('NETWORK HEALTH DIAGNOSTICS');
    expect(host.textContent).toContain('CONNECTION STATUS');
    expect(host.textContent).toContain('WORLD RESPONSE TIME');
    expect(host.textContent).toContain('PING PROBE');
  });

  it('Criterion 2 & 6: Switching between Telemetry and Capabilities sub-views', async () => {
    const Component = () => {
      return createElement(
        'div',
        null,
        createElement(SegmentedTabs),
        createElement(DiagnosticsContainer),
      );
    };

    mounted = await mountScreen(Component);
    // Switch to Diagnostics screen in state
    await act(async () => {
      mounted!.ctx.current.actions.setScreen('Diagnostics');
    });

    const host = mounted.host;
    expect(host.textContent).toContain('TELEMETRY');
    expect(host.textContent).toContain('CAPABILITIES');

    // Default is Telemetry
    expect(host.querySelector('#panel-diagnostics-telemetry')).not.toBeNull();
    expect(host.querySelector('#panel-diagnostics-capabilities')).toBeNull();

    // Click Capabilities tab button
    const capTabBtn = host.querySelector('button[data-tab="CAPABILITIES"]') as HTMLButtonElement;
    expect(capTabBtn).not.toBeNull();
    await click(capTabBtn);

    // Capabilities tabpanel should now be rendered
    expect(host.querySelector('#panel-diagnostics-capabilities')).not.toBeNull();
    expect(host.querySelector('#panel-diagnostics-telemetry')).toBeNull();
    expect(host.textContent).toContain('PROTOCOL CAPABILITY EXPLORER');

    // Switch back to Telemetry
    const telemetryTabBtn = host.querySelector('button[data-tab="TELEMETRY"]') as HTMLButtonElement;
    expect(telemetryTabBtn).not.toBeNull();
    await click(telemetryTabBtn);

    expect(host.querySelector('#panel-diagnostics-telemetry')).not.toBeNull();
    expect(host.querySelector('#panel-diagnostics-capabilities')).toBeNull();
    expect(host.textContent).toContain('NETWORK HEALTH DIAGNOSTICS');
  });

  it('Criterion 4 & Requirement 4: CapabilityExplorer displays total active capabilities count and alphabetical list', async () => {
    mounted = await mountScreen(CapabilityExplorer);
    const host = mounted.host;

    // Displays total count received from session
    const totalCount = host.querySelector('[data-testid="total-capability-count"]');
    expect(totalCount?.textContent).toContain('3 ACTIVE CAPABILITIES');

    // Alphabetically sorted: EventQueueGet, MeshUpload, ObjectMedia
    const items = host.querySelectorAll('[data-testid^="capability-item-"]');
    expect(items.length).toBe(3);
    expect(items[0].textContent).toContain('EventQueueGet');
    expect(items[1].textContent).toContain('MeshUpload');
    expect(items[2].textContent).toContain('ObjectMedia');
  });

  it('Constraint 3: Renders em-dash for missing capability endpoint paths', async () => {
    mounted = await mountScreen(CapabilityExplorer);
    const host = mounted.host;

    const objectMediaItem = host.querySelector('[data-testid="capability-item-ObjectMedia"]');
    expect(objectMediaItem).not.toBeNull();
    const endpointEl = objectMediaItem?.querySelector('[data-testid="capability-endpoint"]');
    // ObjectMedia endpoint was empty string in test fixture
    expect(endpointEl?.textContent?.trim()).toBe('—');
    expect(objectMediaItem?.textContent).toContain('NO ENDPOINT');

    const meshItem = host.querySelector('[data-testid="capability-item-MeshUpload"]');
    expect(meshItem?.querySelector('[data-testid="capability-endpoint"]')?.textContent).toContain(
      'https://sim.agni.lindenlab.com/cap/mesh',
    );
  });

  it('Criterion 3: Live search filtering updates list and count indicator in real time', async () => {
    mounted = await mountScreen(CapabilityExplorer);
    const host = mounted.host;

    const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement;
    expect(searchInput).not.toBeNull();

    // Type query "mesh"
    await typeIntoInput(searchInput, 'mesh');

    const items = host.querySelectorAll('[data-testid^="capability-item-"]');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('MeshUpload');
    expect(host.querySelector('[data-testid="total-capability-count"]')?.textContent).toContain(
      'SHOWING 1 OF 3 CAPABILITIES',
    );

    // Clear search
    const clearBtn = host.querySelector('button[aria-label="Clear search"]') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    await click(clearBtn);

    expect(host.querySelectorAll('[data-testid^="capability-item-"]').length).toBe(3);
  });

  it('Requirement 5: Empty state displayed when search yields zero matches', async () => {
    mounted = await mountScreen(CapabilityExplorer);
    const host = mounted.host;

    const searchInput = host.querySelector('input[type="search"]') as HTMLInputElement;
    await typeIntoInput(searchInput, 'NonExistentCapability');

    const emptyState = host.querySelector('[data-testid="capabilities-no-matches-state"]');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain('No matching capabilities');
    expect(emptyState?.textContent).toContain('NonExistentCapability');

    // Click "Clear Search" in empty state
    const clearBtn = emptyState?.querySelector('button') as HTMLButtonElement;
    expect(clearBtn).not.toBeNull();
    await click(clearBtn);

    expect(host.querySelectorAll('[data-testid^="capability-item-"]').length).toBe(3);
  });

  it('Requirement 5: Empty state displayed when disconnected from the grid', async () => {
    app.protocol.connected = false;
    vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(false);

    mounted = await mountScreen(CapabilityExplorer);
    const host = mounted.host;

    const disconnectedState = host.querySelector('[data-testid="capabilities-disconnected-state"]');
    expect(disconnectedState).not.toBeNull();
    expect(disconnectedState?.textContent).toContain('Disconnected from Grid');
  });

  it('Constraint 1: WAI-ARIA tab switching with arrow keys via SegmentedTabs', async () => {
    const Component = () => {
      return createElement(
        'div',
        null,
        createElement(SegmentedTabs),
        createElement(DiagnosticsContainer),
      );
    };

    mounted = await mountScreen(Component);
    await act(async () => {
      mounted!.ctx.current.actions.setScreen('Diagnostics');
    });

    const host = mounted.host;
    const telemetryTab = host.querySelector('button[data-tab="TELEMETRY"]') as HTMLButtonElement;
    const capabilitiesTab = host.querySelector(
      'button[data-tab="CAPABILITIES"]',
    ) as HTMLButtonElement;

    expect(telemetryTab.getAttribute('aria-selected')).toBe('true');
    expect(telemetryTab.getAttribute('tabindex')).toBe('0');
    expect(capabilitiesTab.getAttribute('aria-selected')).toBe('false');
    expect(capabilitiesTab.getAttribute('tabindex')).toBe('-1');

    // Press ArrowRight on Telemetry tab
    await act(async () => {
      telemetryTab.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true }),
      );
    });

    expect(capabilitiesTab.getAttribute('aria-selected')).toBe('true');
    expect(capabilitiesTab.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('#panel-diagnostics-capabilities')).not.toBeNull();

    // Press ArrowLeft on Capabilities tab
    await act(async () => {
      capabilitiesTab.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true }),
      );
    });

    expect(telemetryTab.getAttribute('aria-selected')).toBe('true');
    expect(host.querySelector('#panel-diagnostics-telemetry')).not.toBeNull();
  });

  it('Requirement 2: ScreenBody mounts DiagnosticsContainer when scr is Diagnostics', async () => {
    mounted = await mountScreen(ScreenBody);
    await act(async () => {
      mounted!.ctx.current.actions.setScreen('Diagnostics');
    });

    const host = mounted.host;
    expect(host.querySelector('#panel-diagnostics-telemetry')).not.toBeNull();
  });
});
