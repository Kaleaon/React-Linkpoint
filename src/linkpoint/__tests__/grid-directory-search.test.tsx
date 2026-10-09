import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import Search from '../../screens/Search.jsx';
import { slBridge } from '../sl-bridge';
import { app } from '../app';
import { mountScreen, unmount, click, typeInto, flush, Mounted } from './ui-helpers';
import { createRequire } from 'node:module';
import { act } from 'react';

const { METHODS, callViewer } = createRequire(import.meta.url)('../../../core/viewer-api.cjs');
const { ViewerSession } = createRequire(import.meta.url)('../../../core/viewer-session.cjs');

describe('SLBridge directory search', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (slBridge as any).connected = false;
  });

  it('throws error when not connected to grid', async () => {
    await expect(slBridge.searchDir({ category: 'people', query: 'test' })).rejects.toThrow(
      'Not connected to Second Life',
    );
  });

  it('dispatches call to searchDir method when connected', async () => {
    (slBridge as any).connected = true;
    const callSpy = vi.spyOn(slBridge, 'call').mockResolvedValue({
      results: [
        {
          id: '123',
          name: 'Jane Resident',
          displayName: 'Jane Resident',
          username: 'Jane',
          type: 'people',
        },
      ],
      hasMore: false,
    });

    const res = await slBridge.searchDir({ category: 'people', query: 'Jane' });
    expect(callSpy).toHaveBeenCalledWith('searchDir', { category: 'people', query: 'Jane' });
    expect(res.results).toHaveLength(1);
    expect(res.results[0].name).toBe('Jane Resident');
  });
});

describe('ViewerSession and viewer-api searchDir', () => {
  it('registers searchDir in allowed METHODS set', () => {
    expect(METHODS.has('searchDir')).toBe(true);
  });

  it('defines searchDir on ViewerSession instance', () => {
    const session = new ViewerSession(() => undefined);
    expect(typeof session.searchDir).toBe('function');
  });

  it('throws not connected when calling searchDir without bot', async () => {
    const session = new ViewerSession(() => undefined);
    await expect(
      callViewer(session, 'searchDir', { category: 'people', query: 'test' }),
    ).rejects.toThrow('Not connected to Second Life');
  });
});

describe('Search component UI', () => {
  let mounted: Mounted | null = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    (slBridge as any).connected = true;
    vi.spyOn(app.friends, 'getFriends').mockReturnValue([
      { id: 'f1', name: 'Alice Friend', onlineStatus: 'online' },
    ]);
    if (!app.world) (app as any).world = {};
    app.world.getNearbyUsers = vi
      .fn()
      .mockReturnValue([{ id: 'n1', name: 'Bob Nearby', distance: 12 }]);
  });

  afterEach(async () => {
    await unmount(mounted);
    mounted = null;
  });

  it("renders category tabs ('PEOPLE', 'GROUPS', 'PLACES')", async () => {
    mounted = await mountScreen(Search);
    expect(mounted.host.textContent).toContain('PEOPLE');
    expect(mounted.host.textContent).toContain('GROUPS');
    expect(mounted.host.textContent).toContain('PLACES');
  });

  it('displays local friends and nearby residents at top of People tab', async () => {
    vi.spyOn(slBridge, 'searchDir').mockResolvedValue({
      results: [],
      hasMore: false,
    });

    mounted = await mountScreen(Search);
    expect(mounted.host.textContent).toContain('Alice Friend');
    expect(mounted.host.textContent).toContain('Bob Nearby');
  });

  it('executes grid directory query via slBridge and displays server matches below local matches', async () => {
    vi.spyOn(slBridge, 'searchDir').mockResolvedValue({
      results: [
        {
          id: 's1',
          name: 'Charlie Grid',
          displayName: 'Charlie Grid',
          username: 'charlie.grid',
          online: true,
          type: 'people',
        },
      ],
      hasMore: true,
    });

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;
    await typeInto(input, 'Charlie');

    await act(async () => {
      await flush();
    });

    expect(mounted.host.textContent).toContain('Charlie Grid');
    expect(mounted.host.textContent).toContain('@charlie.grid');
  });

  it('switches search tabs and queries correct category', async () => {
    const searchSpy = vi.spyOn(slBridge, 'searchDir').mockImplementation(async (params) => {
      if (params.category === 'groups') {
        return {
          results: [{ id: 'g1', name: 'Builders Club', members: 42, type: 'groups' }],
          hasMore: false,
        };
      }
      return { results: [], hasMore: false };
    });

    mounted = await mountScreen(Search);
    const groupsTabBtn = mounted.host.querySelector('button[data-tab="GROUPS"]');
    await click(groupsTabBtn);

    const input = mounted.host.querySelector('input') as HTMLInputElement;
    await typeInto(input, 'Builders');

    await act(async () => {
      await flush();
    });

    expect(searchSpy).toHaveBeenCalledWith({
      category: 'groups',
      query: 'Builders',
      start: 0,
    });
    expect(mounted.host.textContent).toContain('Builders Club');
    expect(mounted.host.textContent).toContain('42 members');
    expect(mounted.host.textContent).toContain('Join Group');
  });

  it('queries places and supports Teleport action under Places tab', async () => {
    const searchSpy = vi.spyOn(slBridge, 'searchDir').mockImplementation(async (params) => {
      if (params.category === 'places') {
        return {
          results: [
            { id: 'p1', name: 'Ahern Welcome Area', description: 'Public sandbox', type: 'places' },
          ],
          hasMore: false,
        };
      }
      return { results: [], hasMore: false };
    });
    const teleportSpy = vi.spyOn(slBridge, 'teleport').mockResolvedValue({
      requested: { region: 'Ahern Welcome Area', x: 128, y: 128, z: 2 },
      message: 'Teleporting',
    });

    mounted = await mountScreen(Search);
    const placesTabBtn = mounted.host.querySelector('button[data-tab="PLACES"]');
    await click(placesTabBtn);

    const input = mounted.host.querySelector('input') as HTMLInputElement;
    await typeInto(input, 'Ahern');

    await act(async () => {
      await flush();
    });

    expect(searchSpy).toHaveBeenCalledWith({
      category: 'places',
      query: 'Ahern',
      start: 0,
    });
    expect(mounted.host.textContent).toContain('Ahern Welcome Area');

    const tpBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Teleport',
    );
    await click(tpBtn);
    expect(teleportSpy).toHaveBeenCalledWith({ destination: 'Ahern Welcome Area' });
  });

  it('handles network errors gracefully with notification while keeping local contacts displayed', async () => {
    vi.spyOn(slBridge, 'searchDir').mockRejectedValue(new Error('Connection timeout'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'Alice');
      await flush();
    });

    expect(mounted.host.textContent).toContain('Connection timeout');
    expect(mounted.host.textContent).toContain('Alice Friend');
  });
});
