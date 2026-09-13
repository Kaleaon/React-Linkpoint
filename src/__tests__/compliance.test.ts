import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { XMLRPCClient } from '../linkpoint/xmlrpc-client';
import { VIEWER_CHANNEL, VIEWER_VERSION } from '../linkpoint/viewer-identity';
import { mayExport } from '../screens/InventoryScreen';
import { AGENT } from '../data/slData';
import { legacyName, type InventoryNode } from '../data/slTypes';

/**
 * Guardrails for the rules in TPV_COMPLIANCE.md.
 *
 * These are the requirements that get a viewer blocked from the grid when they
 * regress, so they are asserted rather than left to review.
 */

describe('TPV §1 — viewer identification', () => {
  it('sends our own registered channel name', () => {
    expect(VIEWER_CHANNEL).toBe('Linkpoint Viewer');
  });

  it('never identifies as the official Second Life viewer', () => {
    // Spoofing the official viewer name is the specific thing the policy bans.
    expect(VIEWER_CHANNEL.toLowerCase()).not.toBe('second life');
    expect(VIEWER_CHANNEL.toLowerCase()).not.toBe('secondlife');
    expect(VIEWER_CHANNEL.toLowerCase()).not.toMatch(/^second life release/);
  });

  it('puts the channel and version into the login request', () => {
    const xml = XMLRPCClient.buildLoginRequest({
      firstName: 'Ruth',
      lastName: 'Resident',
      passwordHash: 'x'.repeat(32),
      startLocation: 'last',
      macAddress: 'a'.repeat(32),
      id0: 'b'.repeat(32),
      viewerDigest: 'c'.repeat(32),
    });

    expect(xml).toContain('<name>channel</name>');
    expect(xml).toContain(VIEWER_CHANNEL);
    expect(xml).toContain('<name>version</name>');
    expect(xml).toContain(VIEWER_VERSION);
    // The old non-compliant channel must not come back via a default.
    expect(xml).not.toContain('Linkpoint PWA');
  });
});

describe('TPV §3 — asset export is gated on creator and full permissions', () => {
  const base: InventoryNode = {
    id: 'i1',
    name: 'Test Object',
    type: 'object',
    creator: legacyName(AGENT),
    permissions: { copy: true, modify: true, transfer: true },
  };

  it('allows export of the resident\'s own full-permission creation', () => {
    expect(mayExport(base)).toBe(true);
  });

  it('refuses export when the resident is not the creator', () => {
    expect(mayExport({ ...base, creator: 'Someone Else' })).toBe(false);
  });

  it('refuses export when any permission bit is missing', () => {
    expect(mayExport({ ...base, permissions: { copy: false, modify: true, transfer: true } })).toBe(false);
    expect(mayExport({ ...base, permissions: { copy: true, modify: false, transfer: true } })).toBe(false);
    expect(mayExport({ ...base, permissions: { copy: true, modify: true, transfer: false } })).toBe(false);
  });

  it('refuses export when permissions are unknown', () => {
    const { permissions: _omitted, ...noPerms } = base;
    expect(mayExport(noPerms as InventoryNode)).toBe(false);
  });

  it('never offers to export a folder', () => {
    expect(mayExport({ ...base, type: 'category' })).toBe(false);
  });
});

describe('TPV §2 — no MAC regeneration is exposed to the resident', () => {
  it('keeps every MAC-related affordance out of the settings UI', async () => {
    // A user-facing "regenerate my MAC" control is explicitly forbidden, so the
    // settings screen must never grow one.
    const settings = await import('../screens/SettingsScreen');
    expect(settings.default).toBeTypeOf('function');

    const source = readFileSync(resolve(process.cwd(), 'src/screens/SettingsScreen.tsx'), 'utf8').toLowerCase();
    expect(source).not.toContain('regenerate');
    expect(source).not.toContain('spoof');
    expect(source).not.toContain('randomize mac');
  });
});

