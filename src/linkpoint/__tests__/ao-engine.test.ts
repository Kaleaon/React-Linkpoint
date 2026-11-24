import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AOEngine,
  AO_STATE_DEFINITIONS,
  AO_STORAGE_KEY,
  DEFAULT_STAND_ANIMATION_UUID,
  parseAONotecardEntries,
} from '../ao-engine';
import { LLAssetType } from '../inventory';
import { Utils } from '../utils';
import { WorldViewer } from '../world';

const LOCAL_AGENT_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';
const REMOTE_AGENT_ID = 'cccccccc-1111-2222-3333-dddddddddddd';

const CUSTOM_STAND_1 = '11111111-2222-3333-4444-555555555501';
const CUSTOM_STAND_2 = '11111111-2222-3333-4444-555555555502';
const CUSTOM_STAND_3 = '11111111-2222-3333-4444-555555555503';
const CUSTOM_WALK = '11111111-2222-3333-4444-555555555510';
const CUSTOM_RUN = '11111111-2222-3333-4444-555555555511';
const CUSTOM_SIT = '11111111-2222-3333-4444-555555555512';
const CUSTOM_HOVER = '11111111-2222-3333-4444-555555555513';
const CUSTOM_FLY = '11111111-2222-3333-4444-555555555514';
const CUSTOM_SWIM = '11111111-2222-3333-4444-555555555515';
const CUSTOM_TYPING = '11111111-2222-3333-4444-555555555516';
const FURNITURE_POSE = '99999999-8888-7777-6666-555555555555';

const SL_WALK_UUID = '6ed24bd8-91aa-4b12-ccc7-c97c857ab4e0';
const SL_RUN_UUID = '05ddbff8-aaa9-92a1-2b74-8fe77a29b445';
const SL_SIT_UUID = '1a5fe8ac-a804-8a5d-7cbd-56bd83184568';
const SL_HOVER_UUID = '4ae8016b-31b9-03bb-c401-b1ea941db41d';
const SL_FLY_UUID = 'aec4610c-757f-bc4e-c092-c6e9caf18daf';
const SL_TYPE_UUID = 'c541c47f-e0c0-058b-ad1a-d6ae3a4584d9';

function createMemoryStorage() {
  const store = new Map<string, any>();
  return {
    store,
    get: (key: string, fallback: any = null) =>
      store.has(key) ? JSON.parse(JSON.stringify(store.get(key))) : fallback,
    set: (key: string, value: any) => {
      store.set(key, JSON.parse(JSON.stringify(value)));
      return true;
    },
  };
}

function createHarness(rngValues: number[] = [0.5]) {
  const storage = createMemoryStorage();
  const appliedLocalAnimations: Array<Array<{ id: string; seq: number }>> = [];
  let underwater = false;
  const worldEmitter = new Utils.EventEmitter();
  const validateAnimationAsset = vi.fn<
    (id: string) => Promise<{ ok: boolean; kind?: 'download' | 'parse'; error?: string }>
  >(async () => ({ ok: true }));
  const invalidateAnimation = vi.fn();

  const world = {
    getLocalAgentId: () => LOCAL_AGENT_ID,
    isUnderwater: () => underwater,
    applyLocalAnimations: vi.fn((anims: Array<{ id: string; seq: number }>) => {
      appliedLocalAnimations.push(anims);
    }),
    validateAnimationAsset,
    invalidateAnimation,
    on: (ev: string, cb: (...args: any[]) => void) => worldEmitter.on(ev, cb),
    off: (ev: string, cb: (...args: any[]) => void) => worldEmitter.off(ev, cb),
    emit: (ev: string, ...args: any[]) => worldEmitter.emit(ev, ...args),
    setUnderwater: (val: boolean) => {
      underwater = val;
    },
  };

  const protocolEmitter = new Utils.EventEmitter();
  const sendAgentAnimations = vi.fn(async (animations: Array<{ id: string; start: boolean }>) => ({
    sent: true,
    count: animations.length,
  }));

  const protocol = {
    connected: true,
    agentId: LOCAL_AGENT_ID,
    sendAgentAnimations,
    on: (ev: string, cb: (...args: any[]) => void) => protocolEmitter.on(ev, cb),
    off: (ev: string, cb: (...args: any[]) => void) => protocolEmitter.off(ev, cb),
    emit: (ev: string, ...args: any[]) => protocolEmitter.emit(ev, ...args),
  };

  const inventory = {
    items: new Map<string, any>([
      [
        'inv-stand-1',
        {
          id: 'inv-stand-1',
          name: 'Relaxed Stand 01',
          assetType: LLAssetType.Animation,
          assetId: CUSTOM_STAND_1,
        },
      ],
      [
        'inv-walk-1',
        {
          id: 'inv-walk-1',
          name: 'Confident Stride',
          assetType: LLAssetType.Animation,
          assetId: CUSTOM_WALK,
        },
      ],
    ]),
  };

  let rngCursor = 0;
  const rng = () => {
    const val = rngValues[rngCursor % rngValues.length];
    rngCursor += 1;
    return val;
  };

  const engine = new AOEngine({
    world,
    protocol,
    inventory,
    storage,
    rng,
  });

  return {
    engine,
    storage,
    world,
    protocol,
    inventory,
    sendAgentAnimations,
    validateAnimationAsset,
    invalidateAnimation,
    appliedLocalAnimations,
  };
}

describe('AOEngine — Client-Side Locomotion Interception & Simulator Sync', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('exposes 100% of standard Second Life / Firestorm locomotion states', () => {
    const keys = AO_STATE_DEFINITIONS.map((d) => d.key);
    for (const required of [
      'stand',
      'walk',
      'run',
      'sit',
      'sit_ground',
      'crouch',
      'crouchwalk',
      'hover',
      'fly',
      'flyup',
      'flydown',
      'flyslow',
      'jump',
      'prejump',
      'fall',
      'land',
      'softland',
      'standup',
      'turnleft',
      'turnright',
      'stride',
      'float',
      'swim_forward',
      'swim_up',
      'swim_down',
      'typing',
    ] as const) {
      expect(keys).toContain(required);
    }
  });

  it('intercepts stand, walk, run, sit, hover, and fly for local agent while leaving remote avatars untouched', () => {
    const { engine, sendAgentAnimations } = createHarness();
    const profile = engine.createProfile('Casual');
    engine.addAnimationToState(profile.id, 'stand', { assetId: CUSTOM_STAND_1, name: 'Stand 1' });
    engine.addAnimationToState(profile.id, 'walk', { assetId: CUSTOM_WALK, name: 'Walk 1' });
    engine.addAnimationToState(profile.id, 'run', { assetId: CUSTOM_RUN, name: 'Run 1' });
    engine.addAnimationToState(profile.id, 'sit', { assetId: CUSTOM_SIT, name: 'Sit 1' });
    engine.addAnimationToState(profile.id, 'hover', { assetId: CUSTOM_HOVER, name: 'Hover 1' });
    engine.addAnimationToState(profile.id, 'fly', { assetId: CUSTOM_FLY, name: 'Fly 1' });
    engine.addAnimationToState(profile.id, 'typing', { assetId: CUSTOM_TYPING, name: 'Type 1' });

    const t0 = performance.now();
    engine.setEnabled(true);
    const elapsedMs = performance.now() - t0;

    // Must synchronize to simulator well within the 100ms budget
    expect(elapsedMs).toBeLessThan(100);
    expect(sendAgentAnimations).toHaveBeenLastCalledWith([{ id: CUSTOM_STAND_1, start: true }]);

    // Remote avatar packets pass through untouched
    const remoteAnims = [{ id: SL_WALK_UUID, seq: 3 }];
    expect(engine.interceptAnimations(REMOTE_AGENT_ID, remoteAnims)).toBe(remoteAnims);

    // Local walk transition replaces default walk and sends stop(stand) + start(walk)
    sendAgentAnimations.mockClear();
    const walkStart = performance.now();
    const interceptedWalk = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_WALK_UUID, seq: 1 },
    ]);
    expect(performance.now() - walkStart).toBeLessThan(100);
    expect(interceptedWalk).toEqual([{ id: CUSTOM_WALK, seq: expect.any(Number) }]);
    expect(sendAgentAnimations).toHaveBeenCalledWith([
      { id: CUSTOM_STAND_1, start: false },
      { id: CUSTOM_WALK, start: true },
    ]);

    // Simulator echoing back our own CUSTOM_WALK alongside SL_WALK_UUID must NOT re-send packets or loop
    sendAgentAnimations.mockClear();
    const echoedWalk = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_WALK_UUID, seq: 1 },
      { id: CUSTOM_WALK, seq: 1 },
    ]);
    expect(echoedWalk).toEqual([{ id: CUSTOM_WALK, seq: expect.any(Number) }]);
    expect(sendAgentAnimations).not.toHaveBeenCalled();

    // Run, Hover, Fly, and Typing overlay
    const interceptedRun = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_RUN_UUID, seq: 2 },
      { id: SL_TYPE_UUID, seq: 1 },
    ]);
    expect(interceptedRun).toEqual([
      { id: CUSTOM_RUN, seq: expect.any(Number) },
      { id: CUSTOM_TYPING, seq: expect.any(Number) },
    ]);

    const interceptedHover = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_HOVER_UUID, seq: 3 },
    ]);
    expect(interceptedHover).toEqual([{ id: CUSTOM_HOVER, seq: expect.any(Number) }]);

    const interceptedFly = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_FLY_UUID, seq: 4 },
    ]);
    expect(interceptedFly).toEqual([{ id: CUSTOM_FLY, seq: expect.any(Number) }]);
  });

  it('respects Smart Sit when furniture plays an external sit animation alongside default sit', () => {
    const { engine } = createHarness();
    const profile = engine.createProfile('Everyday');
    engine.addAnimationToState(profile.id, 'sit', { assetId: CUSTOM_SIT, name: 'My Sit' });
    engine.setEnabled(true);

    // Plain ground/object sit with only system SIT UUID -> overridden
    expect(engine.interceptAnimations(LOCAL_AGENT_ID, [{ id: SL_SIT_UUID, seq: 1 }])).toEqual([
      { id: CUSTOM_SIT, seq: expect.any(Number) },
    ]);

    // Furniture sit with external pose UUID -> Smart Sit yields to furniture pose
    const withFurniture = engine.interceptAnimations(LOCAL_AGENT_ID, [
      { id: SL_SIT_UUID, seq: 1 },
      { id: FURNITURE_POSE, seq: 1 },
    ]);
    expect(withFurniture).toEqual([
      { id: SL_SIT_UUID, seq: 1 },
      { id: FURNITURE_POSE, seq: 1 },
    ]);
  });

  it('promotes flying/hovering to swimming states when underwater', () => {
    const { engine, world } = createHarness();
    const profile = engine.createProfile('Mermaid');
    engine.addAnimationToState(profile.id, 'fly', { assetId: CUSTOM_FLY, name: 'Air Fly' });
    engine.addAnimationToState(profile.id, 'swim_forward', {
      assetId: CUSTOM_SWIM,
      name: 'Breaststroke',
    });
    engine.setEnabled(true);

    world.setUnderwater(true);
    const out = engine.interceptAnimations(LOCAL_AGENT_ID, [{ id: SL_FLY_UUID, seq: 1 }]);
    expect(engine.currentState).toBe('swim_forward');
    expect(out).toEqual([{ id: CUSTOM_SWIM, seq: expect.any(Number) }]);
  });

  it('switches profiles immediately without avatar reloads and updates simulator packets', () => {
    const { engine, world, sendAgentAnimations } = createHarness();
    const casual = engine.createProfile('Casual');
    engine.addAnimationToState(casual.id, 'stand', {
      assetId: CUSTOM_STAND_1,
      name: 'Casual Stand',
    });

    const formal = engine.createProfile('Formal');
    engine.addAnimationToState(formal.id, 'stand', {
      assetId: CUSTOM_STAND_2,
      name: 'Formal Stand',
    });

    engine.setActiveProfile(casual.id);
    engine.setEnabled(true);
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_1);

    sendAgentAnimations.mockClear();
    world.applyLocalAnimations.mockClear();

    engine.setActiveProfile(formal.id);
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_2);
    expect(world.applyLocalAnimations).toHaveBeenCalledWith([
      { id: CUSTOM_STAND_2, seq: expect.any(Number) },
    ]);
    expect(sendAgentAnimations).toHaveBeenCalledWith([
      { id: CUSTOM_STAND_1, start: false },
      { id: CUSTOM_STAND_2, start: true },
    ]);
  });

  it('toggling master AO switch off stops active overrides and immediately restores default Linden locomotion', () => {
    const { engine, world, sendAgentAnimations } = createHarness();
    const profile = engine.createProfile('Dance');
    engine.addAnimationToState(profile.id, 'walk', { assetId: CUSTOM_WALK, name: 'Dance Walk' });
    engine.setEnabled(true);

    engine.interceptAnimations(LOCAL_AGENT_ID, [{ id: SL_WALK_UUID, seq: 7 }]);
    expect(engine.activeAnimationId).toBe(CUSTOM_WALK);

    sendAgentAnimations.mockClear();
    world.applyLocalAnimations.mockClear();

    // Criterion 4: disable master switch -> stop override & restore SL_WALK_UUID immediately
    engine.setEnabled(false);
    expect(engine.activeAnimationId).toBeNull();
    expect(sendAgentAnimations).toHaveBeenCalledWith([{ id: CUSTOM_WALK, start: false }]);
    expect(world.applyLocalAnimations).toHaveBeenCalledWith([{ id: SL_WALK_UUID, seq: 7 }]);
  });

  it('cycles multiple standing animations sequentially and randomly on the configured timer', () => {
    vi.useFakeTimers();
    const { engine, sendAgentAnimations } = createHarness([0.99, 0.0]);
    const profile = engine.createProfile('Stands');
    engine.addAnimationToState(profile.id, 'stand', { assetId: CUSTOM_STAND_1, name: 'Stand A' });
    engine.addAnimationToState(profile.id, 'stand', { assetId: CUSTOM_STAND_2, name: 'Stand B' });
    engine.addAnimationToState(profile.id, 'stand', { assetId: CUSTOM_STAND_3, name: 'Stand C' });

    engine.setPreferences({ cycleStands: true, randomStands: false, standIntervalSec: 12 });
    engine.setEnabled(true);
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_1);

    // Sequential cycle after 12s -> Stand B
    vi.advanceTimersByTime(12_000);
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_2);
    expect(sendAgentAnimations).toHaveBeenLastCalledWith([
      { id: CUSTOM_STAND_1, start: false },
      { id: CUSTOM_STAND_2, start: true },
    ]);

    // Next 12s -> Stand C
    vi.advanceTimersByTime(12_000);
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_3);

    // Randomize enabled -> picks from candidates != current using injected RNG
    engine.setPreferences({ randomStands: true });
    vi.advanceTimersByTime(12_000);
    expect(engine.activeAnimationId).not.toBe(CUSTOM_STAND_3);
    expect([CUSTOM_STAND_1, CUSTOM_STAND_2]).toContain(engine.activeAnimationId);
  });

  it('persists animation sets and preference toggles across sessions in storage', () => {
    const { engine, storage, world, protocol, inventory } = createHarness();
    const profile = engine.createProfile('Persistent Set');
    engine.addAnimationToState(profile.id, 'stand', {
      assetId: CUSTOM_STAND_1,
      name: 'Saved Stand',
    });
    engine.addAnimationToState(profile.id, 'walk', {
      assetId: CUSTOM_WALK,
      name: 'Saved Walk',
    });
    engine.setPreferences({
      overrideSits: false,
      smartSit: true,
      cycleStands: true,
      randomStands: true,
      standIntervalSec: 45,
    });
    engine.setEnabled(true);
    engine.dispose();

    expect(storage.store.has(AO_STORAGE_KEY)).toBe(true);

    const reloaded = new AOEngine({ world, protocol, inventory, storage });
    const snap = reloaded.getSnapshot();
    expect(snap.enabled).toBe(true);
    expect(snap.overrideSits).toBe(false);
    expect(snap.randomStands).toBe(true);
    expect(snap.standIntervalSec).toBe(45);
    expect(snap.profiles).toHaveLength(1);
    expect(snap.profiles[0].name).toBe('Persistent Set');
    expect(snap.profiles[0].states.stand?.[0].assetId).toBe(CUSTOM_STAND_1);
    expect(snap.profiles[0].states.walk?.[0].assetId).toBe(CUSTOM_WALK);
    reloaded.dispose();
  });

  it('parses standard Linden / Firestorm ZHAO-II AO notecards and resolves inventory animations', () => {
    const { engine } = createHarness();
    const lindenWrapped = [
      'Linden text version 2',
      '{',
      'LLEmbeddedItems version 1',
      '{',
      'count 0',
      '}',
      'Text length 120',
      '# Firestorm AO config',
      `[ Standing ]Relaxed Stand 01|${CUSTOM_STAND_2}`,
      '[ Walking ]Confident Stride|Missing Walk Anim}',
    ].join('\n');

    const entries = parseAONotecardEntries(lindenWrapped);
    expect(entries).toEqual([
      { state: 'stand', entries: ['Relaxed Stand 01', CUSTOM_STAND_2] },
      { state: 'walk', entries: ['Confident Stride', 'Missing Walk Anim'] },
    ]);

    const imported = engine.importNotecard('Imported Notecard Set', lindenWrapped);
    expect(imported.assignedCount).toBe(3);
    expect(imported.unresolvedNames).toEqual(['Missing Walk Anim']);
    expect(imported.profile.states.stand?.map((a) => a.assetId)).toEqual([
      CUSTOM_STAND_1,
      CUSTOM_STAND_2,
    ]);
    expect(imported.profile.states.walk?.map((a) => a.assetId)).toEqual([CUSTOM_WALK]);
  });

  it('records download/parse errors and falls back gracefully when an assigned animation asset fails', async () => {
    const { engine, validateAnimationAsset, world } = createHarness();
    validateAnimationAsset.mockImplementation(async (id: string) => {
      if (id === CUSTOM_STAND_1) {
        return {
          ok: false,
          kind: 'parse',
          error: 'Invalid or corrupt Second Life .anim asset format',
        };
      }
      return { ok: true };
    });

    const profile = engine.createProfile('Broken Asset Test');
    engine.addAnimationToState(profile.id, 'stand', {
      assetId: CUSTOM_STAND_1,
      name: 'Corrupt Stand',
    });
    engine.addAnimationToState(profile.id, 'stand', {
      assetId: CUSTOM_STAND_2,
      name: 'Fallback Stand',
    });
    engine.setEnabled(true);

    // Wait for async validation promise
    await new Promise((r) => setTimeout(r, 10));

    const errors = engine.getErrors();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      assetId: CUSTOM_STAND_1,
      name: 'Corrupt Stand',
      kind: 'parse',
    });
    // Automatically fell back to the second valid stand animation!
    expect(engine.activeAnimationId).toBe(CUSTOM_STAND_2);

    // Retry succeeds after asset service recovers
    validateAnimationAsset.mockResolvedValue({ ok: true });
    await expect(engine.retryAnimation(CUSTOM_STAND_1)).resolves.toBe(true);
    expect(world.invalidateAnimation).toHaveBeenCalledWith(CUSTOM_STAND_1);
    expect(engine.getErrors()).toHaveLength(0);
  });

  it('replaces WorldViewer default STAND_ANIMATION and scene:animations for the local avatar', () => {
    const protocol: any = new Utils.EventEmitter();
    protocol.connected = true;
    protocol.agentId = LOCAL_AGENT_ID;
    protocol.sendAgentAnimations = vi.fn().mockResolvedValue({ sent: true, count: 1 });
    protocol.fetchAnimation = vi.fn().mockResolvedValue(new Uint8Array([0]));

    const world = new WorldViewer(protocol);
    const storage = createMemoryStorage();
    const ao = new AOEngine({ world, protocol, storage });
    world.setAnimationInterceptor(ao.interceptAnimations);

    const profile = ao.createProfile('Viewport Override');
    ao.addAnimationToState(profile.id, 'stand', {
      assetId: DEFAULT_STAND_ANIMATION_UUID,
      name: 'Base Stand',
    });
    // Replace with another bundled stand UUID so bundled loader resolves cleanly
    const BUNDLED_STAND_2 = '370f3a20-6ca6-9971-848c-9a01bc42ae3c';
    ao.removeAnimationFromState(profile.id, 'stand', profile.states.stand![0].id);
    ao.addAnimationToState(profile.id, 'stand', {
      assetId: BUNDLED_STAND_2,
      name: 'Stand Pose 2',
    });
    ao.setEnabled(true);

    const setAnimationsSpy = vi.spyOn((world as any).animator, 'setAnimations');
    protocol.emit('scene:animations', {
      id: LOCAL_AGENT_ID,
      animations: [{ id: DEFAULT_STAND_ANIMATION_UUID, seq: 1 }],
    });

    expect(setAnimationsSpy).toHaveBeenCalledWith(LOCAL_AGENT_ID, [
      { id: BUNDLED_STAND_2, seq: expect.any(Number) },
    ]);
    ao.dispose();
  });

  it('catches corrupt binary .anim assets in WorldViewer as parse errors and deduplicates downloads via animator cache', async () => {
    const protocol: any = new Utils.EventEmitter();
    protocol.connected = true;
    protocol.agentId = LOCAL_AGENT_ID;
    protocol.sendAgentAnimations = vi.fn().mockResolvedValue({ sent: true, count: 1 });
    // Truncated 2-byte buffer causes parseAnimation() to throw Error('Truncated animation')
    protocol.fetchAnimation = vi.fn().mockResolvedValue(new Uint8Array([1, 0]));

    const world = new WorldViewer(protocol);
    const storage = createMemoryStorage();
    const ao = new AOEngine({ world, protocol, storage });
    world.setAnimationInterceptor(ao.interceptAnimations);

    const badResult = await world.validateAnimationAsset(CUSTOM_WALK);
    expect(badResult.ok).toBe(false);
    expect(badResult.kind).toBe('parse');
    expect(badResult.error).toMatch(/Truncated animation/i);

    // Clear cached failure and supply a valid 1-second minimal .anim header
    world.invalidateAnimation(CUSTOM_WALK);
    const validBytes: number[] = [1, 0, 0, 0];
    const dv = new DataView(new ArrayBuffer(4));
    const i32 = (v: number) => {
      dv.setInt32(0, v, true);
      validBytes.push(...new Uint8Array(dv.buffer));
    };
    const f32 = (v: number) => {
      dv.setFloat32(0, v, true);
      validBytes.push(...new Uint8Array(dv.buffer));
    };
    i32(1);
    f32(1);
    validBytes.push(0);
    f32(0);
    f32(1);
    i32(0);
    f32(0);
    f32(0);
    i32(0);
    i32(0);

    protocol.fetchAnimation.mockClear();
    protocol.fetchAnimation.mockResolvedValue(new Uint8Array(validBytes));

    const okResult = await world.validateAnimationAsset(CUSTOM_WALK);
    expect(okResult).toEqual({ ok: true });
    // Now playing CUSTOM_WALK on the local avatar reuses the preloaded Animator cache without a duplicate download
    world.applyLocalAnimations([{ id: CUSTOM_WALK, seq: 1 }]);
    await new Promise((r) => setTimeout(r, 10));
    expect(protocol.fetchAnimation).toHaveBeenCalledTimes(1);
    ao.dispose();
  });
});
