import { describe, it, expect } from 'vitest';
import { LocalGridManager } from '../LocalGridManager';
import { OARParser } from '../OARParser';
import { LocalAssetManager } from '../LocalAssetManager';
import { CacheManager } from '../CacheManager';

describe('Offline OpenSim Grid Module', () => {
  it('handles first time account setup and grid toggle', () => {
    const gridManager = new LocalGridManager();
    expect(gridManager.isFirstTimeSetupNeeded()).toBe(true);

    gridManager.setupOfflineAccount('John', 'Doe', 'secretPass');
    expect(gridManager.isFirstTimeSetupNeeded()).toBe(false);
    expect(gridManager.getCurrentUserAccount()?.firstName).toBe('John');

    const started = gridManager.toggleGridState(true);
    expect(started).toBe(true);
    expect(gridManager.isGridRunning()).toBe(true);

    const server = gridManager.getServer();
    const loginRes = server.processLogin('John', 'Doe', 'secretPass');
    expect(loginRes.login).toBe('true');
    expect(loginRes.first_name).toBe('John');

    gridManager.toggleGridState(false);
    expect(gridManager.isGridRunning()).toBe(false);
  });

  it('resolves hypergrid identifiers', () => {
    const gridManager = new LocalGridManager();
    const server = gridManager.getServer();
    const hg = server.resolveHypergridId('Jane Resident@hg.grid.sim:8002');
    expect(hg.displayName).toBe('Jane Resident');
    expect(hg.gridURI).toBe('http://hg.grid.sim:8002');
  });

  it('uploads and manages local assets', () => {
    const assetMgr = new LocalAssetManager();
    const asset = assetMgr.uploadAsset('Test Mesh', 'mesh', 'binaryDataOrBase64');
    expect(asset.id).toBeDefined();
    expect(asset.name).toBe('Test Mesh');
    expect(assetMgr.getAsset(asset.id)).toEqual(asset);
    expect(assetMgr.getTotalAssetsSizeBytes()).toBeGreaterThan(0);
  });

  it('handles cache settings from 256MB to 1TB', () => {
    const cacheMgr = new CacheManager();
    cacheMgr.setMaxSizeMB(512);
    expect(cacheMgr.getSettings().maxSizeBytes).toBe(512 * 1024 * 1024);

    cacheMgr.setMaxSizeGB(200);
    expect(cacheMgr.getSettings().maxSizeBytes).toBe(200 * 1024 * 1024 * 1024);
  });

  it('parses OAR SceneObjectGroup XML', async () => {
    const parser = new OARParser();
    const xml = `<SceneObjectGroup><Name>House Prim</Name><Description>Local House</Description><GroupPosition><X>128</X><Y>128</Y><Z>25</Z></GroupPosition></SceneObjectGroup>`;
    const parsed = await parser.parseOAR(xml);
    expect(parsed.region.prims.length).toBe(1);
    expect(parsed.region.prims[0].name).toBe('House Prim');
  });
});
