// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import React, { act } from 'react';
import Search from '../Search.jsx';
import { NoticeHistoryUnavailableBanner, NoticesScreen } from '../LiveScreens.jsx';
import { slBridge } from '../../linkpoint/sl-bridge';
import { app } from '../../linkpoint/app';
import {
  mountScreen,
  unmount,
  click,
  typeInto,
  flush,
  Mounted,
} from '../../linkpoint/__tests__/ui-helpers';

describe('Search and Notice Banner Accessibility Attributes', () => {
  let mounted: Mounted | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    (slBridge as unknown as { connected: boolean }).connected = true;
  });

  afterEach(async () => {
    if (mounted) {
      await unmount(mounted);
      mounted = null;
    }
  });

  it('renders retry status banner with role="status" and aria-live="polite" (ARIA22 / WCAG 4.1.3)', async () => {
    vi.spyOn(slBridge, 'searchDir').mockRejectedValue(new Error('Temporary bridge timeout'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'TestRetry');
      await flush();
    });

    const retryBanner = mounted.host.querySelector('[data-testid="retry-status-banner"]');
    expect(retryBanner).not.toBeNull();
    expect(retryBanner?.getAttribute('role')).toBe('status');
    expect(retryBanner?.getAttribute('aria-live')).toBe('polite');
    expect(retryBanner?.textContent).toContain('Retrying search... Attempt 1/3');
  });

  it('renders error alert banner with role="alert" and aria-live="assertive" (ARIA19 / WCAG 4.1.3)', async () => {
    vi.spyOn(slBridge, 'searchDir').mockRejectedValue(new Error('Invalid query syntax'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'TestFail');
      await flush();
    });

    const errorBanner = mounted.host.querySelector('[data-testid="search-error-banner"]');
    expect(errorBanner).not.toBeNull();
    expect(errorBanner?.getAttribute('role')).toBe('alert');
    expect(errorBanner?.getAttribute('aria-live')).toBe('assertive');
    expect(errorBanner?.textContent).toContain('Invalid query syntax');
  });

  it('renders NoticeHistoryUnavailableBanner with aria-label="Dismiss notice" on dismiss button (ARIA14 / WCAG 4.1.2)', async () => {
    const onClose = vi.fn();
    const V = {
      surf: '#ffffff',
      err: '#ff4d4d',
      rs: '4px',
    };

    mounted = await mountScreen(() => <NoticeHistoryUnavailableBanner V={V} onClose={onClose} />);

    const alertBanner = mounted.host.querySelector('[role="alert"]');
    expect(alertBanner).not.toBeNull();
    expect(alertBanner?.textContent).toContain(
      'Notice history is currently unavailable from the grid server.',
    );

    const dismissBtn = mounted.host.querySelector('button[aria-label="Dismiss notice"]');
    expect(dismissBtn).not.toBeNull();
    expect(dismissBtn?.getAttribute('type')).toBe('button');
    expect(dismissBtn?.textContent?.trim()).toBe('✕');

    await act(async () => {
      await click(dismissBtn);
      await flush();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('renders dismiss button with aria-label in NoticesScreen when notice history is unavailable', async () => {
    vi.spyOn(app.notices, 'isHistoryUnavailable').mockReturnValue(true);
    vi.spyOn(app.notices, 'list').mockReturnValue([]);

    mounted = await mountScreen(NoticesScreen);

    const dismissBtn = mounted.host.querySelector('button[aria-label="Dismiss notice"]');
    expect(dismissBtn).not.toBeNull();

    await act(async () => {
      await click(dismissBtn);
      await flush();
    });

    const dismissedBtn = mounted.host.querySelector('button[aria-label="Dismiss notice"]');
    expect(dismissedBtn).toBeNull();
  });
});
