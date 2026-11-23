import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  IndexedDBStore,
  indexedDBStore,
  MAX_TELEPORT_HISTORY_ENTRIES,
  buildSecondLifeSlurl,
} from '../indexeddb-store';
import { TeleportHistoryManager, parseTeleportDestination } from '../teleport-history';
import { SLConnectionFull } from '../sl-connection-full';
import { WorldViewer } from '../world';
import { InventoryManager, LLAssetType, LLFolderType } from '../inventory';
import { AuthManager } from '../auth';
import { LinkpointApp } from '../app';
import { slBridge } from '../sl-bridge';

describe('Teleport History Store & Capture Pipeline', () => {
  const avatarA = '11111111-2222-3333-4444-555555555555';
  const avatarB = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

  beforeEach(async () => {
    await indexedDBStore.clearTeleportHistory(avatarA);
    await indexedDBStore.clearTeleportHistory(avatarB);
    vi.restoreAllMocks();
  });

  describe('SLURL formatting & destination parsing', () => {
    it('builds valid secondlife:// URIs and parses SLURLs without inventing coordinates', () => {
      expect(buildSecondLifeSlurl('Da Boom', [44.8, 192.2, 25.1])).toBe(
        'secondlife://Da%20Boom/45/192/25',
      );
      expect(buildSecondLifeSlurl('Ahern', null)).toBe('secondlife://Ahern');

      expect(parseTeleportDestination('secondlife://Da%20Boom/45/192/25')).toEqual({
        regionName: 'Da Boom',
        position: [45, 192, 25],
      });
      expect(parseTeleportDestination('Ahern/64/180/32')).toEqual({
        regionName: 'Ahern',
        position: [64, 180, 32],
      });
      expect(parseTeleportDestination('Morris')).toEqual({
        regionName: 'Morris',
        position: null,
      });
      expect(parseTeleportDestination('home')).toBeNull();
    });
  });

  describe('IndexedDBStore persistence, descending sort, and cross-avatar isolation', () => {
    it('persists records across store instances and returns descending visit order', async () => {
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Ahern',
        parcelName: 'North Plaza',
        position: [64, 90, 28],
        gridX: 995,
        gridY: 1002,
        timestamp: 1_700_000_100,
      });
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Da Boom',
        parcelName: 'Historic Landing',
        position: [110, 42, 24],
        gridX: 1000,
        gridY: 1000,
        timestamp: 1_700_000_500,
      });
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Morris',
        parcelName: null,
        position: null,
        timestamp: 1_700_000_300,
      });

      // Re-open with a brand-new IndexedDBStore instance to verify durable persistence
      const freshStore = new IndexedDBStore();
      const history = await freshStore.getTeleportHistory(avatarA);

      expect(history.map((r) => r.regionName)).toEqual(['Da Boom', 'Morris', 'Ahern']);
      expect(history[0].slurl).toBe('secondlife://Da%20Boom/110/42/24');
      expect(history[1].parcelName).toBeNull();
      expect(history[1].position).toBeNull();
      expect(history[1].slurl).toBe('secondlife://Morris');
    });

    it('strictly isolates records, deletions, and purges per avatar', async () => {
      const recA1 = await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Bay City - Harwich',
        parcelName: 'Municipal Pier',
        position: [88, 144, 25],
        timestamp: 1_700_010_000,
      });
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Nautilus - Timor',
        parcelName: 'Citadel',
        position: [150, 200, 31],
        timestamp: 1_700_010_100,
      });

      await indexedDBStore.recordTeleportHistory(avatarB, {
        regionName: 'Horizons Vega',
        parcelName: 'Command Hub',
        position: [42, 76, 35],
        timestamp: 1_700_010_050,
      });

      expect((await indexedDBStore.getTeleportHistory(avatarA)).map((r) => r.regionName)).toEqual([
        'Nautilus - Timor',
        'Bay City - Harwich',
      ]);
      expect((await indexedDBStore.getTeleportHistory(avatarB)).map((r) => r.regionName)).toEqual([
        'Horizons Vega',
      ]);

      // Avatar B attempting to delete Avatar A's timestamp must fail and leave Avatar A untouched
      const wrongAvatarDelete = await indexedDBStore.deleteTeleportHistoryEntry(
        avatarB,
        recA1!.timestamp,
      );
      expect(wrongAvatarDelete).toBe(false);
      expect(await indexedDBStore.getTeleportHistory(avatarA)).toHaveLength(2);

      // Clearing Avatar A must leave Avatar B's history intact
      const clearedCount = await indexedDBStore.clearTeleportHistory(avatarA);
      expect(clearedCount).toBe(2);
      expect(await indexedDBStore.getTeleportHistory(avatarA)).toHaveLength(0);

      const remainingB = await indexedDBStore.getTeleportHistory(avatarB);
      expect(remainingB).toHaveLength(1);
      expect(remainingB[0].regionName).toBe('Horizons Vega');
    });

    it('filters entries by region name or parcel name case-insensitively', async () => {
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Bellisseria Fairgrounds',
        parcelName: 'Community Pavilion',
        position: [120, 80, 24],
        timestamp: 1_700_020_000,
      });
      await indexedDBStore.recordTeleportHistory(avatarA, {
        regionName: 'Zindra Expo',
        parcelName: 'Skyline Terrace',
        position: [200, 60, 52],
        timestamp: 1_700_020_100,
      });

      const byRegion = await indexedDBStore.getTeleportHistory(avatarA, { search: 'bellis' });
      expect(byRegion.map((r) => r.regionName)).toEqual(['Bellisseria Fairgrounds']);

      const byParcel = await indexedDBStore.getTeleportHistory(avatarA, { search: 'TERRACE' });
      expect(byParcel.map((r) => r.regionName)).toEqual(['Zindra Expo']);
    });

    it('caps stored history at 500 entries per avatar and queries 500 records in < 16ms', async () => {
      // Seed Avatar B with 1 record to verify Avatar A's cap eviction never touches Avatar B
      await indexedDBStore.recordTeleportHistory(avatarB, {
        regionName: 'Protected Region',
        position: [10, 20, 30],
        timestamp: 1_700_000_001,
      });

      const totalToInsert = MAX_TELEPORT_HISTORY_ENTRIES + 12;
      const baseTs = 1_700_100_000;
      for (let i = 0; i < totalToInsert; i++) {
        await indexedDBStore.recordTeleportHistory(avatarA, {
          regionName: `Region ${i}`,
          parcelName: `Parcel ${i}`,
          position: [(i % 250) + 1, ((i * 3) % 250) + 1, 25],
          timestamp: baseTs + i * 10,
        });
      }

      // Warm IndexedDB connection, then measure query latency against the 16ms frame budget
      await indexedDBStore.getTeleportHistory(avatarA, { limit: 1 });
      const start = performance.now();
      const historyA = await indexedDBStore.getTeleportHistory(avatarA);
      const elapsedMs = performance.now() - start;

      expect(historyA).toHaveLength(MAX_TELEPORT_HISTORY_ENTRIES);
      expect(elapsedMs).toBeLessThan(16);

      // Newest is Region 511, oldest retained is Region 12 (Regions 0..11 evicted)
      expect(historyA[0].regionName).toBe(`Region ${totalToInsert - 1}`);
      expect(historyA[historyA.length - 1].regionName).toBe('Region 12');

      // Avatar B remains untouched
      expect(await indexedDBStore.getTeleportHistory(avatarB)).toHaveLength(1);
    }, 15_000);
  });

  describe('Event capture from SLConnectionFull, WorldViewer, InteractionsManager & RLV guard', () => {
    it('captures successful teleports, simulator crossings, and lures while ignoring RLV-blocked and failed teleports', async () => {
      const testApp = new LinkpointApp();
      testApp.protocol.connected = true;
      testApp.protocol.agentId = avatarA;
      testApp.auth.user = { id: avatarA, fullName: 'Resident Alpha', grid: 'agni' };

      // 1. Successful teleport via SLConnectionFull.teleportTo
      vi.spyOn(slBridge, 'teleport').mockResolvedValueOnce({
        requested: { region: 'Da Boom', x: 58, y: 174, z: 27 },
        message: 'Teleport completed',
      } as any);

      await testApp.protocol.teleportTo('secondlife://Da%20Boom/58/174/27');
      await testApp.teleportHistory.flush();

      let list = await testApp.teleportHistory.getHistory();
      expect(list).toHaveLength(1);
      expect(list[0]).toMatchObject({
        regionName: 'Da Boom',
        position: [58, 174, 27],
        source: 'teleport',
        slurl: 'secondlife://Da%20Boom/58/174/27',
      });

      // 2. Simulator crossing via WorldViewer region_changed + subsequent ParcelProperties enrichment
      testApp.world.avatarPosition = [12, 240, 22];
      testApp.world.emit('region_changed', {
        id: 'reg-ahern',
        name: 'Ahern',
        x: 995,
        y: 1002,
      });
      // Same-region parcel metadata arrival should enrich Ahern rather than duplicate it
      testApp.world.region = {
        id: 'reg-ahern',
        name: 'Ahern',
        x: 995,
        y: 1002,
        parcel: { Name: 'Ahern Welcome Parcel' },
      } as any;
      testApp.world.emit('region_changed', testApp.world.region);
      await testApp.teleportHistory.flush();

      list = await testApp.teleportHistory.getHistory();
      expect(list).toHaveLength(2);
      expect(list[0]).toMatchObject({
        regionName: 'Ahern',
        parcelName: 'Ahern Welcome Parcel',
        gridX: 995,
        gridY: 1002,
        position: [12, 240, 22],
        source: 'region_crossing',
      });

      // 3. RLV restriction (@tploc=n) blocks teleport and MUST NOT record history
      testApp.rlv.setEnabled(true);
      testApp.rlv.handler.processCommand('obj-lock-1', '@tploc=n');

      await expect(
        testApp.protocol.teleportTo('secondlife://Forbidden%20Sim/90/90/30'),
      ).rejects.toThrow();
      await testApp.teleportHistory.flush();

      list = await testApp.teleportHistory.getHistory();
      expect(list).toHaveLength(2);
      expect(list.some((r) => r.regionName === 'Forbidden Sim')).toBe(false);

      // Clear RLV restriction and verify network error also produces zero history records
      testApp.rlv.handler.processCommand('obj-lock-1', '@clear');
      vi.spyOn(slBridge, 'teleport').mockRejectedValueOnce(
        new Error('Simulator unreachable: network timeout'),
      );

      await expect(
        testApp.protocol.teleportTo('secondlife://Unreachable%20Sim/40/50/25'),
      ).rejects.toThrow('network timeout');
      await testApp.teleportHistory.flush();

      list = await testApp.teleportHistory.getHistory();
      expect(list).toHaveLength(2);

      // 4. Accepting a teleport lure records destination details upon crossing
      testApp.interactions.init();
      vi.spyOn(testApp.protocol, 'acceptLure').mockResolvedValueOnce({
        message: 'Teleporting...',
      } as any);

      testApp.protocol.emit('lure', {
        id: 'lure-1',
        fromId: 'friend-uuid',
        fromName: 'Friend Resident',
        message: 'Join me!',
        regionId: 'reg-lure-dest',
        position: [204, 88, 60],
        gridX: 1012,
        gridY: 998,
        receivedAt: Date.now(),
      });

      await testApp.interactions.acceptLure('lure-1');
      testApp.world.emit('region_changed', {
        id: 'reg-lure-dest',
        name: 'Lure Haven',
        x: 1012,
        y: 998,
        parcel: { Name: 'Sky Garden' },
      });
      await testApp.teleportHistory.flush();

      list = await testApp.teleportHistory.getHistory();
      expect(list).toHaveLength(3);
      expect(list[0]).toMatchObject({
        regionName: 'Lure Haven',
        parcelName: 'Sky Garden',
        position: [204, 88, 60],
        gridX: 1012,
        gridY: 998,
        source: 'lure',
        slurl: 'secondlife://Lure%20Haven/204/88/60',
      });

      // 5. Landmark creation from history entry adds Landmark item to Landmarks folder
      const landmark = await testApp.teleportHistory.createLandmark(list[0]);
      expect(landmark).toBeTruthy();
      expect(landmark.assetType).toBe(LLAssetType.Landmark);
      expect(landmark.description).toBe('secondlife://Lure%20Haven/204/88/60');
      const folder = testApp.inventory.folders.get(landmark.folderId);
      expect(folder?.folderType).toBe(LLFolderType.Landmark);
    });

    it('supports Back and Forward navigation stack traversal', async () => {
      const protocol = new SLConnectionFull();
      protocol.connected = true;
      protocol.agentId = avatarA;
      const teleportSpy = vi.spyOn(protocol, 'teleportTo').mockResolvedValue({} as any);
      const world = new WorldViewer(protocol);
      const auth = new AuthManager(protocol);
      auth.user = { id: avatarA, fullName: 'Nav Tester', grid: 'agni' };
      const inventory = new InventoryManager(protocol, auth);

      const manager = new TeleportHistoryManager({ protocol, world, auth, inventory });
      manager.init();

      await manager.recordEntry({
        regionName: 'First Stop',
        position: [20, 30, 25],
        timestamp: 1_700_500_000,
      });
      await manager.recordEntry({
        regionName: 'Second Stop',
        position: [140, 160, 40],
        timestamp: 1_700_500_100,
      });

      expect(manager.canGoBack()).toBe(true);
      expect(manager.canGoForward()).toBe(false);

      const backTarget = await manager.goBack();
      expect(backTarget?.regionName).toBe('First Stop');
      expect(teleportSpy).toHaveBeenLastCalledWith('secondlife://First%20Stop/20/30/25');
      expect(manager.canGoForward()).toBe(true);

      const forwardTarget = await manager.goForward();
      expect(forwardTarget?.regionName).toBe('Second Stop');
      expect(teleportSpy).toHaveBeenLastCalledWith('secondlife://Second%20Stop/140/160/40');
    });
  });
});
