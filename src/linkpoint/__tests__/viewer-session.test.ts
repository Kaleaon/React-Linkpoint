import { FolderType } from '@caspertech/node-metaverse';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const {
  ViewerSession,
  serializeEnvironment,
  serializeObject,
  serializeTerrain,
  serializeFriend,
} = require('../../../core/viewer-session.cjs');

describe('desktop simulator object bridge', () => {
  it('requests textures referenced only by a GLTF material override', () => {
    const session = new ViewerSession(() => undefined);
    session.loadTexture = vi.fn();
    const inherited = { textureID: { toString: () => 'legacy-texture' } };
    session.loadObjectTexture({
      TextureEntry: {
        faces: [inherited],
        defaultTexture: inherited,
        getEffectiveEntryForFace: () => inherited,
        gltfMaterialOverrides: new Map([
          [0, { textures: ['override-base', { textureId: 'override-normal' }] }],
        ]),
      },
    });

    expect(session.loadTexture.mock.calls.map(([id]: [string]) => id)).toEqual(
      expect.arrayContaining(['legacy-texture', 'override-base', 'override-normal']),
    );
  });

  it('sends the flexible-prim block with node-metaverse field names mapped to ours', () => {
    const result = serializeObject({
      localID: 5,
      object: {
        FullID: { toString: () => '00000000-0000-0000-0000-000000000005' },
        Position: { x: 0, y: 0, z: 0 },
        Scale: { x: 1, y: 1, z: 3 },
        Rotation: { x: 0, y: 0, z: 0, w: 1 },
        extraParams: {
          flexibleData: {
            Softness: 3,
            Tension: 1.5,
            Drag: 0.7,
            Gravity: -2.5,
            Wind: 1.2,
            Force: { x: 0.5, y: -1, z: 2 },
          },
        },
      },
    });
    expect(result.flexible).toEqual({
      softness: 3,
      tension: 1.5,
      friction: 0.7,
      gravity: -2.5,
      wind: 1.2,
      force: [0.5, -1, 2],
    });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('serializes native friends for the renderer process', () => {
    expect(
      serializeFriend({
        getKey: () => ({ toString: () => 'friend-id' }),
        getName: () => 'Friend Resident',
        online: true,
        myRights: 1,
        theirRights: 0,
      }),
    ).toEqual({
      id: 'friend-id',
      name: 'Friend Resident',
      onlineStatus: 'online',
      rightsGiven: true,
      rightsHas: false,
    });
  });
  it('serializes region WindLight and terrain without leaking class instances', () => {
    const sky = {
      type: 'sky',
      blueHorizon: { toArray: () => [0.2, 0.4, 0.8] },
      sunlightColor: [1, 0.9, 0.7],
    };
    const environment = serializeEnvironment({
      regionID: { toString: () => 'region-id' },
      dayLength: 14400,
      dayCycle: { frames: new Map([['sky', sky]]) },
    });
    const terrain = Array.from({ length: 256 }, (_, y) =>
      Array.from({ length: 256 }, (_, x) => y * 1000 + x),
    );

    expect(environment).toMatchObject({
      regionId: 'region-id',
      dayLength: 14400,
      currentSky: { blueHorizon: [0.2, 0.4, 0.8] },
    });
    const serialized = serializeTerrain({ terrain });
    expect(serialized).toMatchObject({ size: 256 });
    expect(serialized.heights[10 * 256 + 20]).toBe(10 * 1000 + 20); // y=10, x=20
    expect(() => structuredClone(environment)).not.toThrow();
  });

  it('converts node-metaverse objects into structured-clone-safe scene data', () => {
    const result = serializeObject({
      localID: 42,
      object: {
        FullID: { toString: () => '00000000-0000-0000-0000-000000000042' },
        ParentID: 7,
        PCode: 9,
        Position: { x: 1, y: 2, z: 3 },
        Scale: { x: 4, y: 5, z: 6 },
        Rotation: { x: 0, y: 0, z: 0, w: 1 },
        name: 'Decoded prim',
      },
    });

    expect(result).toEqual({
      id: '00000000-0000-0000-0000-000000000042',
      localId: 42,
      parentId: 7,
      pcode: 9,
      avatar: false,
      attachmentPoint: 0,
      attachment: false,
      attachmentName: null,
      isHud: false,
      position: [1, 2, 3],
      scale: [4, 5, 6],
      rotation: [0, 0, 0, 1],
      name: 'Decoded prim',
      shape: 'cube',
      assetKind: null,
      animatedMesh: false,
      sculptType: null,
      assetId: null,
      textureId: null,
      faceTextures: Array.from({ length: 9 }, () => ({
        textureId: null,
        color: [1, 1, 1, 1],
        repeat: [1, 1],
        offset: [0, 0],
        rotation: 0,
        fullBright: false,
        materialId: null,
        materialOverride: null,
      })),
      reflectionProbe: null,
      particles: null,
      flexible: null,
      color: [1, 1, 1, 1],
      shapeParams: {
        pathCurve: undefined,
        profileCurve: undefined,
        pathBegin: undefined,
        pathEnd: undefined,
        pathScaleX: undefined,
        pathScaleY: undefined,
        pathShearX: undefined,
        pathShearY: undefined,
        pathTwist: undefined,
        pathTwistBegin: undefined,
        pathRadiusOffset: undefined,
        pathTaperX: undefined,
        pathTaperY: undefined,
        pathRevolutions: undefined,
        pathSkew: undefined,
        profileBegin: undefined,
        profileEnd: undefined,
        profileHollow: undefined,
      },
    });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('preserves UDP prim appearance and selects standard SL geometry', () => {
    const result = serializeObject({
      localID: 9,
      object: {
        FullID: { toString: () => 'sphere-id' },
        PCode: 9,
        PathCurve: 0x20,
        ProfileCurve: 0x05,
        TextureEntry: {
          defaultTexture: {
            rgba: {
              getRed: () => 0.1,
              getGreen: () => 0.2,
              getBlue: () => 0.3,
              getAlpha: () => 0.4,
            },
          },
        },
      },
    });

    expect(result.shape).toBe('sphere');
    expect(result.color).toEqual([0.1, 0.2, 0.3, 0.4]);
    expect(result.shapeParams).toMatchObject({ pathCurve: 0x20, profileCurve: 0x05 });
  });

  it('passes every shape parameter the renderer needs to build SL prim geometry', () => {
    const result = serializeObject({
      localID: 11,
      object: {
        FullID: { toString: () => 'twisted' },
        PCode: 9,
        PathCurve: 0x10,
        ProfileCurve: 0x01,
        PathShearX: 0.1,
        PathShearY: -0.2,
        PathTwist: 0.5,
        PathTwistBegin: -0.25,
        PathRadiusOffset: 0.3,
        PathTaperX: 0.4,
        PathTaperY: -0.4,
        PathRevolutions: 2.5,
        PathSkew: 0.2,
      },
    });
    expect(result.shapeParams).toMatchObject({
      pathShearX: 0.1,
      pathShearY: -0.2,
      pathTwist: 0.5,
      pathTwistBegin: -0.25,
      pathRadiusOffset: 0.3,
      pathTaperX: 0.4,
      pathTaperY: -0.4,
      pathRevolutions: 2.5,
      pathSkew: 0.2,
    });
  });

  it('keeps uploaded mesh identity and gives it a visible renderer proxy', () => {
    const result = serializeObject({
      localID: 10,
      object: {
        FullID: { toString: () => 'object-id' },
        PCode: 9,
        extraParams: { meshData: { meshData: { toString: () => 'mesh-asset-id' }, type: 5 } },
      },
    });

    expect(result).toMatchObject({
      shape: 'asset-proxy',
      assetKind: 'mesh',
      assetId: 'mesh-asset-id',
    });
    expect(() => structuredClone(result)).not.toThrow();
  });

  it('preserves per-material texture entries received with UDP object updates', () => {
    const texture = (id: string, red: number) => ({
      textureID: { toString: () => id },
      rgba: { getRed: () => red, getGreen: () => 0.2, getBlue: () => 0.3, getAlpha: () => 1 },
      repeatU: 2,
      repeatV: 3,
      offsetU: 0.1,
      offsetV: 0.2,
      rotation: 0.5,
      fullBright: true,
    });
    const faces = [texture('face-zero', 0.4), texture('face-one', 0.8)];
    const result = serializeObject({
      localID: 11,
      object: {
        FullID: { toString: () => 'multi-material-mesh' },
        PCode: 9,
        TextureEntry: {
          faces,
          defaultTexture: faces[0],
          getEffectiveEntryForFace: (index: number) => faces[index],
        },
      },
    });

    expect(result.faceTextures.slice(0, 2)).toEqual([
      expect.objectContaining({
        textureId: 'face-zero',
        color: [0.4, 0.2, 0.3, 1],
        repeat: [2, 3],
      }),
      expect.objectContaining({
        textureId: 'face-one',
        color: [0.8, 0.2, 0.3, 1],
        offset: [0.1, 0.2],
        rotation: 0.5,
        fullBright: true,
      }),
    ]);
  });

  it('serializes inherited texture entries for every mesh material slot', () => {
    const inherited = {
      textureID: { toString: () => 'default-texture' },
      rgba: { getRed: () => 1, getGreen: () => 1, getBlue: () => 1, getAlpha: () => 1 },
    };
    const result = serializeObject({
      localID: 14,
      object: {
        FullID: { toString: () => 'mesh' },
        PCode: 9,
        MeshData: { meshData: { toString: () => 'mesh-asset' } },
        TextureEntry: {
          faces: [],
          defaultTexture: inherited,
          getEffectiveEntryForFace: () => inherited,
        },
      },
    });

    expect(result.faceTextures).toHaveLength(8);
    expect(result.faceTextures.every((face: any) => face.textureId === 'default-texture')).toBe(
      true,
    );
  });

  it('identifies modern PBR materials and mirror reflection probes from UDP extra params', () => {
    const result = serializeObject({
      localID: 12,
      object: {
        FullID: { toString: () => 'mirror-id' },
        PCode: 9,
        extraParams: {
          renderMaterialData: {
            params: [{ textureIndex: 0, textureUUID: { toString: () => 'material-id' } }],
          },
          reflectionProbeData: { ambiance: 0.75, clipDistance: 0.1, flags: 0x07 },
        },
        TextureEntry: { faces: [{}], getEffectiveEntryForFace: () => ({}) },
      },
    });

    expect(result.faceTextures[0].materialId).toBe('material-id');
    expect(result.reflectionProbe).toMatchObject({
      ambiance: 0.75,
      clipDistance: 0.1,
      box: true,
      dynamic: true,
      mirror: true,
    });
  });

  it('serializes scripted particle sources for the renderer', () => {
    const result = serializeObject({
      localID: 13,
      object: {
        FullID: { toString: () => 'emitter' },
        PCode: 9,
        Particles: {
          pattern: 2,
          maxAge: 10,
          burstRate: 0.2,
          burstRadius: 1,
          burstSpeedMin: 2,
          burstSpeedMax: 4,
          burstPartCount: 3,
          acceleration: { x: 0, y: 0, z: -1 },
          target: { toString: () => 'target' },
          texture: { toString: () => 'particle-texture' },
          dataFlags: 259,
          partMaxAge: 2,
          startColor: { getRed: () => 1, getGreen: () => 0.5, getBlue: () => 0, getAlpha: () => 1 },
          endColor: { red: 0, green: 0, blue: 1, alpha: 0 },
          startScaleX: 0.5,
          startScaleY: 1,
          endScaleX: 2,
          endScaleY: 3,
        },
      },
    });
    expect(result.particles).toMatchObject({
      pattern: 2,
      burstPartCount: 3,
      acceleration: [0, 0, -1],
      targetId: 'target',
      textureId: 'particle-texture',
      startColor: [1, 0.5, 0, 1],
      endScale: [2, 3],
    });
  });
});

describe('desktop session script dialogs and lures', () => {
  const { Bot } = require('@caspertech/node-metaverse');
  const { ViewerSession } = require('../../../core/viewer-session.cjs');
  const uuid = (value: string) => ({ toString: () => value });

  async function sessionAfterSubscribing() {
    const sent: Array<[string, any]> = [];
    const session = new ViewerSession((type: string, data: any) => sent.push([type, data]));
    const login = vi
      .spyOn(Bot.prototype, 'login')
      .mockRejectedValue(new Error('stop after subscribing'));
    await expect(
      session.connect({
        loginUrl: 'https://login.example/cgi-bin/login.cgi',
        username: 'Test Resident',
        password: 'secret',
      }),
    ).rejects.toThrow();
    login.mockRestore();
    return { session, sent };
  }

  it('forwards simulator script dialogs and lures to the renderer with answerable ids', async () => {
    const { session, sent } = await sessionAfterSubscribing();
    const events = session.bot.clientEvents;
    events.onScriptDialog.next({
      ObjectID: uuid('obj'),
      FirstName: 'Pat',
      LastName: 'R',
      ObjectName: 'Door',
      Message: 'Open?',
      ChatChannel: 7,
      ImageID: uuid('img'),
      Buttons: ['Yes', 'No'],
      Owners: [],
    });
    events.onLure.next({
      from: uuid('f'),
      fromName: 'Sam',
      lureMessage: 'Come',
      regionID: uuid('r'),
      position: { x: 1, y: 2, z: 3 },
      gridX: 5,
      gridY: 6,
      lureID: uuid('lid'),
    });

    expect(sent.map(([type]) => type)).toEqual(['script-dialog', 'lure']);
    expect(sent[0][1]).toMatchObject({
      objectName: 'Door',
      ownerName: 'Pat R',
      buttons: ['Yes', 'No'],
      channel: 7,
      textBox: false,
    });
    expect(sent[1][1]).toMatchObject({ fromName: 'Sam', position: [1, 2, 3], gridX: 5 });
    expect(() => structuredClone(sent[0][1])).not.toThrow();
    expect(session.pending.size).toBe(2);
  });

  it('answers a dialog and accepts a lure through the library, then forgets them', async () => {
    const { session, sent } = await sessionAfterSubscribing();
    const respondToScriptDialog = vi.fn().mockResolvedValue(undefined);
    const acceptTeleport = vi.fn().mockResolvedValue({ message: 'ok' });
    vi.spyOn(session.bot, 'clientCommands', 'get').mockReturnValue({
      comms: { respondToScriptDialog },
      teleport: { acceptTeleport },
    });
    const events = session.bot.clientEvents;
    events.onScriptDialog.next({
      ObjectID: uuid('obj'),
      FirstName: '',
      LastName: '',
      ObjectName: 'Door',
      Message: '',
      ChatChannel: 7,
      ImageID: uuid('img'),
      Buttons: ['Yes', 'No'],
      Owners: [],
    });
    events.onLure.next({
      from: uuid('f'),
      fromName: 'Sam',
      lureMessage: '',
      regionID: uuid('r'),
      position: { x: 1, y: 2, z: 3 },
      gridX: 5,
      gridY: 6,
      lureID: uuid('lid'),
    });

    await expect(
      session.respondScriptDialog({ id: sent[0][1].id, buttonIndex: 1 }),
    ).resolves.toEqual({ answered: true });
    expect(respondToScriptDialog.mock.calls[0][1]).toBe(1);
    await expect(session.acceptLure({ id: sent[1][1].id })).resolves.toMatchObject({
      accepted: true,
    });
    expect(acceptTeleport).toHaveBeenCalledTimes(1);
    expect(session.pending.size).toBe(0);
    await expect(
      session.respondScriptDialog({ id: sent[0][1].id, buttonIndex: 0 }),
    ).rejects.toThrow(/no longer pending/);
  });

  it('drops pending requests when the session closes', async () => {
    const { session, sent } = await sessionAfterSubscribing();
    session.bot.clientEvents.onLure.next({
      from: uuid('f'),
      fromName: 'Sam',
      lureMessage: '',
      regionID: uuid('r'),
      position: { x: 1, y: 2, z: 3 },
      gridX: 5,
      gridY: 6,
      lureID: uuid('lid'),
    });
    expect(session.pending.size).toBe(1);
    await session.close();
    expect(session.pending.size).toBe(0);
    expect(sent).toHaveLength(1);
  });
});

describe('desktop session texture downloads', () => {
  const { AssetType } = require('@caspertech/node-metaverse');
  const { ViewerSession } = require('../../../core/viewer-session.cjs');

  it('uses ViewerAsset for textures like the official Second Life viewer', async () => {
    const session = new ViewerSession(() => undefined);
    const downloadAsset = vi.fn().mockResolvedValue(Buffer.from('texture'));
    session.bot = {
      currentRegion: { caps: {} },
      clientCommands: { asset: { downloadAsset } },
    };

    await expect(session.downloadTexture('texture id')).resolves.toEqual(Buffer.from('texture'));
    expect(downloadAsset).toHaveBeenCalledWith(AssetType.Texture, 'texture id');
  });

  it('retries stale ViewerAsset URLs after a 403 during a region crossing', async () => {
    vi.useFakeTimers();
    const session = new ViewerSession(() => undefined);
    const downloadAsset = vi
      .fn()
      .mockRejectedValueOnce(new Error('Response code 403 (Forbidden)'))
      .mockResolvedValue(Buffer.from('fresh-cap'));
    session.bot = {
      currentRegion: { caps: {} },
      clientCommands: { asset: { downloadAsset } },
    };

    const result = session.downloadTexture('texture-id');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual(Buffer.from('fresh-cap'));
    expect(downloadAsset).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('uses the correctly slashed legacy capability URL only for OpenSim fallback', async () => {
    const session = new ViewerSession(() => undefined);
    const requestGet = vi.fn().mockResolvedValue({ body: Buffer.from('texture') });
    session.bot = {
      currentRegion: {
        caps: { getCapability: vi.fn().mockResolvedValue('https://asset.example/get'), requestGet },
      },
      clientCommands: {
        asset: {
          downloadAsset: vi
            .fn()
            .mockRejectedValue(new Error('Capability ViewerAsset not available')),
        },
      },
    };

    await expect(session.downloadTexture('texture id')).resolves.toEqual(Buffer.from('texture'));
    expect(requestGet).toHaveBeenCalledWith('https://asset.example/get/?texture_id=texture%20id');
  });

  it('allows transiently failed assets to retry instead of leaving their proxy forever', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const sent: Array<[string, any]> = [];
    const session = new ViewerSession((type: string, data: any) => sent.push([type, data]));
    session.bot = { clientCommands: { asset: { downloadAsset: vi.fn() } } };
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error('capability still starting'))
      .mockResolvedValue(Buffer.from('ok'));
    const ready = vi.fn();
    session.streamAsset('mesh:test', AssetType.Mesh, 'test', download, ready);
    await session.assetRequests.get('mesh:test');
    expect(session.assetRequests.has('mesh:test')).toBe(false);
    expect(sent.at(-1)?.[0]).toBe('asset-error');
    vi.advanceTimersByTime(5001);
    session.streamAsset('mesh:test', AssetType.Mesh, 'test', download, ready);
    await session.assetRequests.get('mesh:test');
    expect(download).toHaveBeenCalledTimes(2);
    expect(ready).toHaveBeenCalledWith(Buffer.from('ok'));
    vi.useRealTimers();
  });

  it('retries a malformed mesh on its own, then waits for a manual retry', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const session = new ViewerSession(() => undefined);
    session.bot = { clientCommands: { asset: { downloadAsset: vi.fn() } } };
    const download = vi.fn().mockResolvedValue(Buffer.from('bad'));
    const ready = vi
      .fn()
      .mockRejectedValueOnce(new Error('malformed mesh header'))
      .mockResolvedValue(undefined);
    session.streamAsset('mesh:bad', AssetType.Mesh, 'bad', download, ready);
    await session.assetRequests.get('mesh:bad');
    expect(ready).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5001);
    await session.assetRequests.get('mesh:bad');
    expect(ready).toHaveBeenCalledTimes(2);

    const alwaysBad = vi.fn().mockRejectedValue(new Error('malformed mesh header'));
    session.streamAsset('mesh:worse', AssetType.Mesh, 'worse', download, alwaysBad);
    await vi.advanceTimersByTimeAsync(5000 * 20);
    const calls = alwaysBad.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThan(10);
    session.resetAssetFailures();
    session.streamAsset('mesh:worse', AssetType.Mesh, 'worse', download, alwaysBad);
    await session.assetRequests.get('mesh:worse');
    expect(alwaysBad.mock.calls.length).toBe(calls + 1);
    session.resetAssetFailures();
    vi.useRealTimers();
  });

  it('names friends the library left as "Unknown Friend", falling back to one lookup each when a batch fails', async () => {
    const session = new ViewerSession(() => undefined);
    const key = (id: string) => ({ toString: () => id });
    const result = (id: string, name: string) => ({ getKey: () => key(id), getName: () => name });
    const avatarKey2Name = vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) throw new Error('Avatar not found');
      const id = arg.toString();
      if (id === 'gone') throw new Error('Avatar not found');
      return result(id, `Name ${id}`);
    });
    session.bot = {
      agent: {
        buddyList: [
          { buddyID: key('aaa') },
          { buddyID: key('bbb') },
          { buddyID: key('gone') },
          { buddyID: key('ccc') },
        ],
      },
      clientCommands: {
        friends: {
          getFriend: (k: any) =>
            k.toString() === 'ccc'
              ? { getName: () => 'Real Name', getKey: () => k, online: true }
              : { getName: () => 'Unknown Friend', online: false },
        },
        grid: { avatarKey2Name },
      },
    };
    const friends = await session.getFriends();
    const byId = Object.fromEntries(friends.map((f: any) => [f.id, f.name]));
    expect(byId).toMatchObject({ aaa: 'Name aaa', bbb: 'Name bbb', ccc: 'Real Name' });
    expect(byId.gone).toMatch(/^Resident \(/);
    avatarKey2Name.mockClear();
    await session.getFriends();
    const asked = avatarKey2Name.mock.calls.flatMap(([arg]: any[]) =>
      (Array.isArray(arg) ? arg : [arg]).map((k: any) => k.toString()),
    );
    expect(new Set(asked)).toEqual(new Set(['gone']));
  });

  it('reads the current outfit from the grid and lists saved outfits', async () => {
    const session = new ViewerSession(() => undefined);
    const id = (v: string) => ({ toString: () => v });
    session.bot = {
      agent: {
        inventory: {
          main: {
            skeleton: new Map([
              [
                'mo',
                {
                  folderID: id('mo'),
                  parentID: id('root'),
                  name: 'My Outfits',
                  typeDefault: FolderType.MyOutfits,
                },
              ],
              [
                'beach',
                { folderID: id('beach'), parentID: id('mo'), name: 'Beach day', typeDefault: -1 },
              ],
              [
                'other',
                { folderID: id('other'), parentID: id('root'), name: 'Elsewhere', typeDefault: -1 },
              ],
            ]),
          },
        },
      },
      clientCommands: {
        agent: {
          getWearables: async () => ({
            folderID: id('cof'),
            items: [
              { itemID: id('i1'), name: 'Ada Shape', assetType: 24, inventoryType: 18, flags: 0 },
              { itemID: id('i2'), name: 'Rain Jacket', assetType: 24, inventoryType: 18, flags: 8 },
              { itemID: id('i3'), name: 'Watch', assetType: 24, inventoryType: 6, flags: 0 },
            ],
          }),
        },
      },
    };
    const outfit = await session.getOutfit();
    expect(outfit.items.map((i: any) => [i.name, i.typeName, i.category])).toEqual([
      ['Ada Shape', 'Shape', 'body'],
      ['Rain Jacket', 'Jacket', 'clothing'],
      ['Watch', 'Attachment', 'attachment'],
    ]);
    expect(outfit.outfits).toEqual([{ id: 'beach', name: 'Beach day' }]);
  });

  it('sends a null-landmark teleport request for teleport home, and only once the region has loaded', () => {
    const session = new ViewerSession(() => undefined);
    const sendMessage = vi.fn();
    session.bot = {
      agent: { agentID: 'agent-1' },
      currentRegion: { circuit: { sendMessage, sessionID: 'sess-1' } },
    };
    expect(session.teleportHome()).toEqual({ requested: 'home' });
    const message = sendMessage.mock.calls[0][0];
    expect(message.Info.AgentID).toBe('agent-1');
    expect(message.Info.LandmarkID.toString()).toBe('00000000-0000-0000-0000-000000000000');
    session.bot = { agent: { agentID: 'agent-1' }, currentRegion: null };
    expect(() => session.teleportHome()).toThrow(/region has loaded/);
  });

  it('joins a group through the library and reports a refusal instead of claiming success', async () => {
    const session = new ViewerSession(() => undefined);
    const joinGroup = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('it charges a membership fee of L$50'));
    session.bot = { clientCommands: { groups: { joinGroup } } };
    const groupId = '11111111-2222-3333-4444-555555555555';
    await expect(session.joinGroup({ groupId })).resolves.toEqual({ joined: true });
    await expect(session.joinGroup({ groupId })).resolves.toEqual({ joined: false });
    await expect(session.joinGroup({ groupId })).rejects.toThrow(/membership fee/);
    await expect(session.joinGroup({ groupId: 'nope' })).rejects.toThrow(/Valid group ID/);
  });

  it('limits concurrent simulator asset downloads so attachments are not rate-limited', async () => {
    const session = new ViewerSession(() => undefined);
    let active = 0;
    let peak = 0;
    const pending = Array.from({ length: 12 }, () =>
      session.queueAssetDownload(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return Buffer.from('asset');
      }),
    );

    await Promise.all(pending);
    expect(peak).toBe(4);
  });

  it('retries ViewerAsset downloads after a 429 response', async () => {
    vi.useFakeTimers();
    const session = new ViewerSession(() => undefined);
    const downloadAsset = vi
      .fn()
      .mockRejectedValueOnce(new Error('Response code 429 (Too Many Requests)'))
      .mockResolvedValue(Buffer.from('texture'));
    session.bot = { currentRegion: { caps: {} }, clientCommands: { asset: { downloadAsset } } };

    const result = session.downloadTexture('texture-id');
    await vi.advanceTimersByTimeAsync(1000);
    await expect(result).resolves.toEqual(Buffer.from('texture'));
    expect(downloadAsset).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});

describe('desktop session avatar movement', () => {
  const { ControlFlags } = require('@caspertech/node-metaverse');
  const { ViewerSession } = require('../../../core/viewer-session.cjs');

  it('sends SL agent controls and clears them when movement stops', () => {
    const session = new ViewerSession(() => undefined);
    const agent = { setControlFlag: vi.fn(), clearControlFlag: vi.fn(), sendAgentUpdate: vi.fn() };
    session.bot = { agent };
    expect(session.setMovement({ forward: 1, right: -1, run: true })).toEqual({ moving: true });
    expect(agent.setControlFlag).toHaveBeenCalledWith(ControlFlags.AGENT_CONTROL_AT_POS);
    expect(agent.setControlFlag).toHaveBeenCalledWith(ControlFlags.AGENT_CONTROL_LEFT_POS);
    expect(agent.setControlFlag).toHaveBeenCalledWith(ControlFlags.AGENT_CONTROL_FAST_AT);
    expect(agent.sendAgentUpdate).toHaveBeenCalledTimes(1);
    agent.setControlFlag.mockClear();
    expect(session.setMovement({})).toEqual({ moving: false });
    expect(agent.setControlFlag).not.toHaveBeenCalled();
    expect(agent.clearControlFlag).toHaveBeenCalledWith(ControlFlags.AGENT_CONTROL_AT_POS);
    expect(agent.sendAgentUpdate).toHaveBeenCalledTimes(2);
  });

  it('tolerates node-metaverse throwing while no current region exists', () => {
    const session = new ViewerSession(() => undefined);
    session.bot = Object.defineProperty({}, 'currentRegion', {
      get: () => {
        throw new Error('currentRegion is undefined');
      },
    });
    expect(session.currentRegion()).toBeNull();
    expect(session.getSceneObjects()).toEqual([]);
    expect(session.getDiagnostics()).toMatchObject({ connected: true, regionName: '' });
  });
});

describe('live group detail bridge', () => {
  const groupId = '00000000-0000-0000-0000-000000000042';
  it('normalizes profiles, members and roles across the shared viewer API', async () => {
    const groups = {
      getGroupProfile: vi.fn(async () => ({
        GroupID: groupId,
        Name: 'Builders',
        Charter: 'Build together',
        MemberTitle: 'Owner',
        MembershipFee: 10,
        OpenEnrollment: true,
        GroupMembershipCount: 12,
      })),
      getMemberList: vi.fn(async () => [
        {
          AgentID: 'resident',
          Title: 'Owner',
          OnlineStatus: 'Online',
          IsOwner: true,
          AgentPowers: 123n,
        },
      ]),
      getGroupRoles: vi.fn(async () => [
        {
          RoleID: 'role',
          Name: 'Owners',
          Title: 'Owner',
          Description: 'Manage group',
          Members: 2,
          Powers: 456n,
        },
      ]),
    };
    const session = new ViewerSession(() => undefined);
    session.bot = { clientCommands: { groups } };
    expect(await session.getGroupDetails({ groupId })).toMatchObject({
      name: 'Builders',
      charter: 'Build together',
      members: 12,
    });
    expect(await session.getGroupDetails({ groupId, section: 'members' })).toEqual([
      expect.objectContaining({ id: 'resident', onlineStatus: 'Online', powers: '123' }),
    ]);
    const roles = await session.getGroupDetails({ groupId, section: 'roles' });
    expect(roles).toEqual([
      expect.objectContaining({ name: 'Owners', memberCount: 2, powers: '456' }),
    ]);
    expect(() => JSON.stringify(roles)).not.toThrow();
    await expect(session.getGroupDetails({ groupId: 'invalid' })).rejects.toThrow('Valid group ID');
    await expect(session.getGroupDetails({ groupId, section: 'unknown' })).rejects.toThrow(
      'Unknown group',
    );
  });
  it('reports a failed membership request rather than claiming no memberships', async () => {
    const session = new ViewerSession(() => undefined);
    session.bot = {
      clientCommands: {
        agent: { getAvatarGroups: vi.fn().mockRejectedValue(new Error('timeout')) },
      },
    };
    await expect(session.getGroups()).rejects.toThrow('Group list could not be loaded');
  });
});
