// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import Settings from '../../screens/Settings.jsx';
import {
  CAPABILITY_STATES,
  getFeatureCapability,
  isFeatureVisible,
} from '../../config/featureCapabilities.js';
import * as rootFeatureCapabilities from '../../featureCapabilities.js';
import * as hooksFeatureCapabilities from '../../hooks/featureCapabilities.js';
import { mountScreen, unmount, click, typeInto, buttonByText, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
});

describe('Feature Capability Registry', () => {
  it('correctly reports capability states for preference controls', () => {
    expect(getFeatureCapability('shadows')).toBe(CAPABILITY_STATES.EXPERIMENTAL);
    expect(getFeatureCapability('voice-indicator')).toBe(CAPABILITY_STATES.UNSUPPORTED);
    expect(getFeatureCapability('quality')).toBe(CAPABILITY_STATES.UNSUPPORTED);
    expect(getFeatureCapability('draw')).toBe(CAPABILITY_STATES.SUPPORTED);
    expect(getFeatureCapability('devMode')).toBe(CAPABILITY_STATES.SUPPORTED);
  });

  it('determines feature visibility based on developer mode status', () => {
    expect(isFeatureVisible('shadows', false)).toBe(false);
    expect(isFeatureVisible('shadows', true)).toBe(true);
    expect(isFeatureVisible('draw', false)).toBe(true);
    expect(isFeatureVisible('draw', true)).toBe(true);
  });

  it('re-exports capability helpers at root and hooks paths', () => {
    expect(rootFeatureCapabilities.CAPABILITY_STATES).toBe(CAPABILITY_STATES);
    expect(rootFeatureCapabilities.getFeatureCapability).toBe(getFeatureCapability);
    expect(rootFeatureCapabilities.isFeatureVisible).toBe(isFeatureVisible);

    expect(hooksFeatureCapabilities.CAPABILITY_STATES).toBe(CAPABILITY_STATES);
    expect(hooksFeatureCapabilities.getFeatureCapability).toBe(getFeatureCapability);
    expect(hooksFeatureCapabilities.isFeatureVisible).toBe(isFeatureVisible);
  });
});

describe('Settings Capability-Based Visibility Filtering', () => {
  const UNSUPPORTED_TOGGLE_IDS = [
    'shadows',
    'voice-indicator',
    'media-auto',
    'chat-cmds',
    'typing',
    'push',
    'show-online',
    'rlv',
    'cache-exit',
  ];

  const UNSUPPORTED_SELECT_IDS = [
    'settings-graphics-quality-select',
    'settings-avatar-complexity-select',
    'settings-bandwidth-limit-select',
    'settings-translation-select',
    'settings-maturity-select',
    'settings-cache-limit-select',
    'settings-cache-location-select',
  ];

  it('omits all nine unsupported disabled toggle switches in standard mode', async () => {
    mounted = await mountScreen(Settings);

    for (const toggleId of UNSUPPORTED_TOGGLE_IDS) {
      const toggleLabel = mounted.host.querySelector(`#${toggleId}-label`);
      expect(toggleLabel, `Expected ${toggleId} to be omitted in standard mode`).toBeNull();
    }
  });

  it('omits all seven unsupported disabled select menus in standard mode', async () => {
    mounted = await mountScreen(Settings);

    for (const selectId of UNSUPPORTED_SELECT_IDS) {
      const selectElement = mounted.host.querySelector(`#${selectId}`);
      expect(selectElement, `Expected ${selectId} to be omitted in standard mode`).toBeNull();
    }
  });

  it('enabling Developer / Experimental Mode reveals preview controls with capability badges', async () => {
    mounted = await mountScreen(Settings);

    // Turn Developer Mode ON
    const devModeToggle = mounted.host
      .querySelector('#devMode-label')
      ?.closest('.settings-switch-row')
      ?.querySelector('[role="switch"]');
    expect(devModeToggle).not.toBeNull();
    await click(devModeToggle as HTMLElement);

    expect(mounted.ctx.current.state.toggles.devMode).toBe(true);

    // Verify previously hidden select menus are now visible in preview mode
    for (const selectId of UNSUPPORTED_SELECT_IDS) {
      const selectElement = mounted.host.querySelector(`#${selectId}`) as HTMLSelectElement;
      expect(selectElement, `Expected ${selectId} to be rendered in developer mode`).not.toBeNull();
      expect(selectElement.disabled).toBe(true);
    }

    // Verify capability badges are rendered
    const badges = mounted.host.querySelectorAll('.capability-badge');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('accurately updates search filtering and match indicators for visible functional controls', async () => {
    mounted = await mountScreen(Settings);

    // Search for a supported term
    const searchInput = mounted.host.querySelector('input[type="search"]') as HTMLInputElement;
    await typeInto(searchInput, 'draw distance');

    const graphicsSection = mounted.host.querySelector(
      '[aria-labelledby="graphics-heading"]',
    ) as HTMLElement;
    const chatSection = mounted.host.querySelector(
      '[aria-labelledby="chat-im-heading"]',
    ) as HTMLElement;

    expect(graphicsSection.hidden).toBe(false);
    expect(chatSection.hidden).toBe(true);

    // Search for a hidden term in standard mode (e.g. shadows) should yield no matches or hide sections
    await typeInto(searchInput, 'shadows');
    expect(graphicsSection.hidden).toBe(true);
  });
});
