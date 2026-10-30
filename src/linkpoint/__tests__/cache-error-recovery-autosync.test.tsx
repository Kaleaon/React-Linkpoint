// @vitest-environment jsdom
import React, { act } from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import CacheScreen from '../../screens/CacheScreen.jsx';
import { localCache, validateMountPath, COMMON_FLASHDRIVE_PRESETS } from '../local-cache';
import { ErrorRecoveryProvider } from '../../context/ErrorRecoveryContext';
import { errorRecovery, sanitizeTelemetryData } from '../errorRecovery';
import { Utils } from '../utils';
import { app } from '../app';
import { mountScreen, unmount, click, buttonByText, typeInto, Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

function CacheApp() {
  return (
    <ErrorRecoveryProvider customService={errorRecovery}>
      <CacheScreen />
    </ErrorRecoveryProvider>
  );
}

describe('Integrated Cache Error Recovery & Auto-Sync Framework', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    localCache.setLocation('internal');
    errorRecovery.setOnlineStatus(true);
    errorRecovery.clearTelemetry();
    errorRecovery.clearActiveError();
  });

  afterEach(async () => {
    if (mounted) {
      await unmount(mounted);
      mounted = null;
    }
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('Mount Path Validation & Presets', () => {
    it('validates Windows and Unix mount paths correctly', () => {
      expect(validateMountPath('E:\\SL_Cache').valid).toBe(true);
      expect(validateMountPath('/media/usb/sl-cache').valid).toBe(true);
      expect(validateMountPath('/Volumes/USB/sl-cache').valid).toBe(true);
      expect(validateMountPath('').valid).toBe(false);
      expect(validateMountPath('relative/path').valid).toBe(false);
      expect(validateMountPath('/media/usb/<invalid>').valid).toBe(false);
    });

    it('exports standard system mount path presets', () => {
      expect(COMMON_FLASHDRIVE_PRESETS.length).toBeGreaterThan(3);
      expect(COMMON_FLASHDRIVE_PRESETS.some((p) => p.path === '/media/usb/sl-cache')).toBe(true);
      expect(COMMON_FLASHDRIVE_PRESETS.some((p) => p.path === 'E:\\SL_Cache')).toBe(true);
    });
  });

  describe('Automated Event-Driven Sync & Throttling', () => {
    it('subscribes to inventory change events and auto-saves with write throttling', async () => {
      const mockInventory: any = new Utils.EventEmitter();
      mockInventory.auth = { user: { id: 'test_agent_123' } };
      mockInventory.folders = new Map([['folder_1', { id: 'folder_1', name: 'Folder 1' }]]);
      mockInventory.items = new Map([['item_1', { id: 'item_1', name: 'Item 1' }]]);
      mockInventory.rootFolder = { id: 'root', name: 'My Inventory' };

      const saveSpy = vi.spyOn(localCache, 'saveInventory').mockResolvedValue(undefined as any);

      localCache.bindInventory(mockInventory);

      // Trigger rapid inventory updates
      mockInventory.emit('inventory_updated');
      mockInventory.emit('inventory_updated');
      mockInventory.emit('inventory_updated');

      // Should not call save immediately due to throttling
      expect(saveSpy).not.toHaveBeenCalled();

      // Fast forward past throttle interval (800ms)
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(saveSpy).toHaveBeenCalledWith(
        'test_agent_123',
        expect.objectContaining({
          folders: expect.arrayContaining([{ id: 'folder_1', name: 'Folder 1' }]),
        }),
      );
    });

    it('pauses auto-sync gracefully when network connectivity drops', async () => {
      const mockInventory: any = new Utils.EventEmitter();
      mockInventory.auth = { user: { id: 'test_agent_456' } };
      mockInventory.folders = new Map([['f1', { id: 'f1', name: 'Folder 1' }]]);
      mockInventory.items = new Map();

      const saveSpy = vi.spyOn(localCache, 'saveInventory').mockResolvedValue(undefined as any);
      localCache.bindInventory(mockInventory);

      // Simulate offline network status
      errorRecovery.setOnlineStatus(false);

      mockInventory.emit('inventory_updated');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // Auto-sync should pause/skip when offline
      expect(saveSpy).not.toHaveBeenCalled();

      // Restore online status
      errorRecovery.setOnlineStatus(true);
      mockInventory.emit('inventory_updated');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('CacheScreen Error Recovery UI & Manual Overrides', () => {
    it('renders CacheScreen with preset options and live path validation badge', async () => {
      mounted = await mountScreen(CacheApp);

      expect(mounted.host.textContent).toContain('CACHE & FLASHDRIVE STORAGE');
      const select = mounted.host.querySelector('select[aria-label="Preset mount paths"]');
      expect(select).not.toBeNull();

      const pathInput = mounted.host.querySelector(
        'input[aria-label="Custom cache mount path"]',
      ) as HTMLInputElement;
      expect(pathInput).not.toBeNull();

      // Check live path validation indicator
      await typeInto(pathInput, 'E:\\SL_Cache');

      const validationBadge = mounted.host.querySelector(
        '[data-testid="mount-path-validation-status"]',
      );
      expect(validationBadge).not.toBeNull();
      expect(validationBadge?.textContent).toContain('Valid mount path format');
    });

    it('displays interactive Error Recovery Card on cache failure with working Retry, Change Location, and Dismiss buttons', async () => {
      app.inventory.folders = new Map([['f1', { id: 'f1', name: 'Test Folder' }]]);
      vi.spyOn(localCache, 'saveInventory').mockRejectedValue(
        new Error('Flashdrive write permission denied'),
      );

      mounted = await mountScreen(CacheApp);

      // Click "SAVE INVENTORY TO CACHE" manual override
      const saveBtn = buttonByText(mounted.host, /SAVE INVENTORY TO CACHE/i);
      expect(saveBtn).toBeTruthy();

      await act(async () => {
        saveBtn!.click();
        await vi.runAllTimersAsync();
      });

      const recoveryCard = mounted.host.querySelector('[data-testid="cache-error-recovery-card"]');
      expect(recoveryCard).not.toBeNull();
      expect(recoveryCard?.textContent).toContain('Cache Operation Recovery');
      expect(recoveryCard?.textContent).toContain('Flashdrive write permission denied');

      // Action 1: Retry button
      const retryBtn = buttonByText(mounted.host, /Retry Operation/i);
      expect(retryBtn).toBeTruthy();

      // Action 2: Change Location button
      const changeLocBtn = buttonByText(mounted.host, /Change Location/i);
      expect(changeLocBtn).toBeTruthy();

      // Action 3: Dismiss button
      const dismissBtn = buttonByText(mounted.host, /Dismiss/i);
      expect(dismissBtn).toBeTruthy();

      // Clicking Dismiss clears the recovery card
      await click(dismissBtn!);

      expect(mounted.host.querySelector('[data-testid="cache-error-recovery-card"]')).toBeNull();
    });

    it('allows location change from recovery card', async () => {
      app.inventory.folders = new Map([['f1', { id: 'f1', name: 'Test Folder' }]]);
      vi.spyOn(localCache, 'saveInventory').mockRejectedValue(new Error('Drive disconnected'));

      mounted = await mountScreen(CacheApp);

      const saveBtn = buttonByText(mounted.host, /SAVE INVENTORY TO CACHE/i);

      await act(async () => {
        saveBtn!.click();
        await vi.runAllTimersAsync();
      });

      expect(
        mounted.host.querySelector('[data-testid="cache-error-recovery-card"]'),
      ).not.toBeNull();

      const changeLocBtn = buttonByText(mounted.host, /Change Location/i);
      await click(changeLocBtn!);

      expect(mounted.host.querySelector('[data-testid="cache-error-recovery-card"]')).toBeNull();
      expect(localCache.locationType).toBe('internal');
    });

    it('preserves manual Save Now and Rebuild from Grid overrides', async () => {
      mounted = await mountScreen(CacheApp);

      expect(buttonByText(mounted.host, /SAVE INVENTORY TO CACHE/i)).toBeTruthy();
      expect(buttonByText(mounted.host, /REBUILD FROM GRID \(FORCE\)/i)).toBeTruthy();
    });
  });

  describe('Sensitive Telemetry Redaction', () => {
    it('redacts sensitive credentials and tokens in telemetry logs', () => {
      const rawDetails = {
        agentId: 'user_123',
        password: 'supersecretpassword',
        token: 'mfa_token_xyz',
        credentials: { secretKey: 'key_123' },
        customPath: '/media/usb/sl-cache',
      };

      const sanitized = sanitizeTelemetryData(rawDetails);

      expect(sanitized.agentId).toBe('user_123');
      expect(sanitized.customPath).toBe('/media/usb/sl-cache');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.credentials).toBe('[REDACTED]');
    });
  });
});
