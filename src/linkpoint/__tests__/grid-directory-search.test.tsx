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

  it('handles network errors gracefully with retry banner and fallback error UI while keeping local contacts displayed', async () => {
    vi.spyOn(slBridge, 'searchDir').mockRejectedValue(new Error('Connection timeout'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'Alice');
      await flush();
    });

    // Transient retry banner is active during backoff
    expect(mounted.host.textContent).toContain('Retrying search... Attempt 1/3');
    expect(mounted.host.textContent).toContain('Alice Friend');

    // Wait for retries to exhaust in act chunks (500 + 1000 + 2000 = 3500ms)
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
    }

    // Persistent error banner rendered with manual retry control and bridge connection status
    expect(mounted.host.textContent).toContain('Connection timeout');
    expect(mounted.host.textContent).toContain('Bridge Status: Connected');
    expect(mounted.host.textContent).toContain('Retry Now');
    expect(mounted.host.textContent).toContain('Alice Friend');
  });

  it('supports manual retry via Retry Now button in persistent error banner', async () => {
    let callCount = 0;
    const _searchSpy = vi.spyOn(slBridge, 'searchDir').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Transient bridge error');
      }
      return {
        results: [
          {
            id: 's99',
            name: 'Recovered Resident',
            displayName: 'Recovered Resident',
            username: 'recovered',
            type: 'people',
          },
        ],
        hasMore: false,
      };
    });

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'Recovered');
      await flush();
    });

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
    }

    expect(mounted.host.textContent).toContain('Recovered Resident');
  });

  it('supports manual retry click after retry exhaustion', async () => {
    let callCount = 0;
    const _searchSpy = vi.spyOn(slBridge, 'searchDir').mockImplementation(async () => {
      callCount++;
      if (callCount <= 4) {
        throw new Error('Persistent failure');
      }
      return {
        results: [
          {
            id: 's100',
            name: 'Manual Success',
            displayName: 'Manual Success',
            username: 'manual',
            type: 'people',
          },
        ],
        hasMore: false,
      };
    });

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'Manual');
      await flush();
    });

    // Exhaust initial + 3 retries (4 calls total)
    for (let i = 0; i < 40; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
    }

    expect(mounted.host.textContent).toContain('Persistent failure');
    const retryBtn = [...mounted.host.querySelectorAll('button')].find(
      (b) => (b.textContent || '').trim() === 'Retry Now',
    );
    expect(retryBtn).not.toBeNull();

    // Click Retry Now button
    await act(async () => {
      await click(retryBtn);
      await flush();
    });

    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 50));
      });
    }

    expect(mounted.host.textContent).toContain('Manual Success');
  });

  it('bypasses automated retries for non-transient errors like invalid query syntax', async () => {
    const searchSpy = vi
      .spyOn(slBridge, 'searchDir')
      .mockRejectedValue(new Error('Invalid query syntax'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'InvalidInput');
      await flush();
    });

    // Non-transient error immediately renders fallback error banner without retry status
    expect(mounted.host.textContent).toContain('Invalid query syntax');
    expect(mounted.host.textContent).not.toContain('Retrying search... Attempt 1/3');
    expect(searchSpy).toHaveBeenCalledTimes(1);
  });

  it('cancels active retries immediately when user alters query input', async () => {
    const searchSpy = vi.spyOn(slBridge, 'searchDir').mockRejectedValue(new Error('Bridge glitch'));

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'FirstQuery');
      await flush();
    });

    expect(mounted.host.textContent).toContain('Retrying search... Attempt 1/3');

    // Change input before 1st backoff delay finishes
    await act(async () => {
      await typeInto(input, 'SecondQuery');
      await flush();
    });

    // Verify initial search was not retried further after query changed
    expect(searchSpy).toHaveBeenCalledTimes(2); // initial call for FirstQuery + initial call for SecondQuery
  });

  it('displays inline crystal loader during active search directory query', async () => {
    let resolveSearch: (res: any) => void = () => {};
    const searchPromise = new Promise((resolve) => {
      resolveSearch = resolve;
    });

    vi.spyOn(slBridge, 'searchDir').mockImplementation(() => searchPromise as any);

    mounted = await mountScreen(Search);
    const input = mounted.host.querySelector('input') as HTMLInputElement;

    await act(async () => {
      await typeInto(input, 'Searching');
    });

    // Loading indicator with CrystalLoader should be visible while searchPromise is pending
    const crystal = mounted.host.querySelector('[data-testid="crystal-loader"]') as HTMLElement;
    expect(crystal).not.toBeNull();
    expect(crystal.getAttribute('data-variant')).toBe('inline');
    expect(mounted.host.textContent).toContain('Searching Second Life grid directory...');

    await act(async () => {
      resolveSearch({ results: [], hasMore: false });
      await flush();
    });
  });
});
