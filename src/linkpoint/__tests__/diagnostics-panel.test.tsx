// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import DiagnosticsPanel from '../../screens/DiagnosticsPanel.jsx';
import { app } from '../app';
import { click, mountScreen, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;
beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

describe('DiagnosticsPanel: dual mode telemetry & progressive disclosure', () => {
  it('displays conversational plain-language titles in primary view by default', async () => {
    mounted = await mountScreen(DiagnosticsPanel);
    const text = mounted.host.textContent || '';

    // Primary KPI cards
    expect(text).toContain('CONNECTION STATUS');
    expect(text).toContain('WORLD RESPONSE TIME');
    expect(text).toContain('CONNECTION STABILITY');
    expect(text).toContain('LAST WORLD UPDATE');

    // Graph & summary table
    expect(text).toContain('WORLD RESPONSE TIME HISTORY');
    expect(text).toContain('WORLD REGION & NETWORK SUMMARY');

    // Button visible
    const toggleBtn = mounted.host.querySelector(
      'button[aria-controls="advanced-technical-details"]',
    ) as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    expect(toggleBtn.textContent).toContain('Show Advanced Technical Details');
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('false');

    // Low level technical drawer is not expanded by default
    expect(mounted.host.querySelector('#advanced-technical-details')).toBeNull();
  });

  it('expands advanced technical details drawer upon clicking toggle', async () => {
    mounted = await mountScreen(DiagnosticsPanel);
    const toggleBtn = mounted.host.querySelector(
      'button[aria-controls="advanced-technical-details"]',
    ) as HTMLButtonElement;

    await click(toggleBtn);

    expect(toggleBtn.textContent).toContain('Hide Advanced Technical Details');
    expect(toggleBtn.getAttribute('aria-expanded')).toBe('true');

    const drawer = mounted.host.querySelector('#advanced-technical-details');
    expect(drawer).not.toBeNull();
    const drawerText = drawer?.textContent || '';

    // Grouped low level parameters required by Requirement 3
    expect(drawerText).toContain('SLConnectionFull');
    expect(drawerText).toContain('Simulator UDP Port');
    expect(drawerText).toContain('Circuit Code');
    expect(drawerText).toContain('Agent UUID');
    expect(drawerText).toContain('Seed Capability URL');
    expect(drawerText).toContain('HTTP Event Queue State');
  });

  it('persists user disclosure preference in localStorage during session', async () => {
    mounted = await mountScreen(DiagnosticsPanel);
    const toggleBtn = mounted.host.querySelector(
      'button[aria-controls="advanced-technical-details"]',
    ) as HTMLButtonElement;

    // Toggle on
    await click(toggleBtn);
    expect(localStorage.getItem('linkpoint_diag_advanced')).toBe('true');

    // Unmount and remount (simulating navigating back or component reload)
    await unmount(mounted);
    mounted = await mountScreen(DiagnosticsPanel);

    // Should open expanded based on persisted preference
    const remountedBtn = mounted.host.querySelector(
      'button[aria-controls="advanced-technical-details"]',
    ) as HTMLButtonElement;
    expect(remountedBtn.getAttribute('aria-expanded')).toBe('true');
    expect(mounted.host.querySelector('#advanced-technical-details')).not.toBeNull();

    // Toggle off
    await click(remountedBtn);
    expect(localStorage.getItem('linkpoint_diag_advanced')).toBe('false');
  });

  it('renders inline CrystalLoader during active ping probe execution', async () => {
    const diagMock = {
      ...app.protocol.getDiagnostics(),
      connected: true,
      simName: 'Test Region',
      simAddress: '127.0.0.1:13000',
      latencyMs: 45,
      packetLossPct: 0.1,
      packetsIn: 1000,
      packetsOut: 800,
      lastPacketTimestamp: Date.now(),
    };
    let resolvePing: (val: typeof diagMock) => void = () => {};
    let isProbeClick = false;

    vi.spyOn(app.protocol, 'fetchDiagnostics').mockImplementation(() => {
      if (isProbeClick) {
        return new Promise((resolve) => {
          resolvePing = resolve;
        });
      }
      return Promise.resolve(diagMock);
    });

    mounted = await mountScreen(DiagnosticsPanel);

    const buttons = Array.from(mounted.host.querySelectorAll('button')) as HTMLButtonElement[];
    const pingBtn = buttons.find((btn) => btn.textContent?.includes('PING PROBE'));
    expect(pingBtn).not.toBeUndefined();
    expect(pingBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();

    isProbeClick = true;
    if (pingBtn) {
      await click(pingBtn);
    }

    const crystal = pingBtn?.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('inline');
    expect(crystal.style.width).toBe('14px');
    expect(pingBtn?.textContent).toContain('PINGING…');
    expect(pingBtn?.disabled).toBe(true);

    // Resolve ping probe
    await act(async () => {
      resolvePing(diagMock);
    });
    await vi.waitFor(() => {
      expect(pingBtn?.textContent).toContain('PING PROBE');
    });

    expect(pingBtn?.querySelector('[data-testid="crystal-loader"]')).toBeNull();
  });
});
