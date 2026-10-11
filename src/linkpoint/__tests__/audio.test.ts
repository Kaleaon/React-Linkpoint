import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { AudioManager } from '../audio';
import { SOUND_FLAG, UI_SOUNDS } from '../sound-standards';

class Param {
  value = 0;
  setTargetAtTime = vi.fn((v: number) => {
    this.value = v;
  });
}
class FakeNode {
  connect = vi.fn((dest: unknown) => dest);
  disconnect = vi.fn();
}
class FakeGain extends FakeNode {
  gain = new Param();
  constructor() {
    super();
    this.gain.value = 1;
  }
} // a real GainNode defaults to 1
class FakePanner extends FakeNode {
  panningModel = '';
  distanceModel = '';
  refDistance = 0;
  rolloffFactor = 0;
  positionX = new Param();
  positionY = new Param();
  positionZ = new Param();
}
let sources: FakeSource[] = [];
class FakeSource extends FakeNode {
  buffer: unknown = null;
  loop = false;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn(() => {
    this.onended?.();
  });
  constructor() {
    super();
    sources.push(this);
  }
}
let lastContext: FakeContext;
class FakeContext {
  currentTime = 0;
  destination = new FakeNode();
  gains: FakeGain[] = [];
  panners: FakePanner[] = [];
  listener = Object.fromEntries(
    [
      'positionX',
      'positionY',
      'positionZ',
      'forwardX',
      'forwardY',
      'forwardZ',
      'upX',
      'upY',
      'upZ',
    ].map((k) => [k, new Param()]),
  );
  constructor() {
    lastContext = this;
  }
  createGain() {
    const g = new FakeGain();
    this.gains.push(g);
    return g;
  }
  createPanner() {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBufferSource() {
    return new FakeSource();
  }
  decodeAudioData = vi.fn(async () => ({ duration: 1 }));
  resume = vi.fn();
}

const SOUND = 'aaaaaaaa-0000-0000-0000-000000000001';
const SOUND2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const flush = () => vi.advanceTimersByTimeAsync(0);

describe('AudioManager', () => {
  let bus: EventEmitter;
  let fetchSound: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;
  let audio: AudioManager;
  const emit = (name: string, data: unknown) => bus.emit(name, data);
  const sound = (event: Record<string, unknown>) => emit('scene:sound-event', event);
  const asset = async (assetId: string) => {
    emit('scene:sound-asset', { assetId, data: btoa('x') });
    await flush();
  };
  const object = (id: string, position = [10, 10, 0]) => emit('scene:object-add', { id, position });

  beforeEach(() => {
    vi.useFakeTimers();
    sources = [];
    lastContext = undefined as unknown as FakeContext;
    vi.stubGlobal('AudioContext', FakeContext);
    bus = new EventEmitter();
    fetchSound = vi.fn<(id: string) => Promise<void>>(async () => {});
    audio = new AudioManager({
      on: (e: string, l: Function) => bus.on(e, l as (...a: unknown[]) => void),
      fetchSound,
    });
    audio.init();
  });
  afterEach(() => {
    audio.stopAll();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('requests a sound it has not got, then plays a trigger at its global position', async () => {
    audio.setRegionOrigin([256000, 256000]);
    audio.setListener({ position: [0, 0, 0] });
    sound({
      action: 'trigger',
      soundId: SOUND,
      objectId: 'o',
      ownerId: 'w',
      position: [10, 20, 30],
      handle: String((256000n << 32n) | 256000n),
      gain: 0.6,
    });
    expect(fetchSound).toHaveBeenCalledWith(SOUND);
    expect(sources).toHaveLength(0);
    await asset(SOUND);
    expect(sources).toHaveLength(1);
    const panner = lastContext.panners[0];
    expect([panner.positionX.value, panner.positionY.value, panner.positionZ.value]).toEqual([
      10, 30, -20,
    ]); // region-local, y-up
    expect(panner).toMatchObject({ distanceModel: 'inverse', refDistance: 1, rolloffFactor: 1 });
    expect(lastContext.gains.some((g) => g.gain.value === 0.6)).toBe(true);
  });

  it('applies the viewer filters to triggers', async () => {
    audio.setPolicy({ ownerSoundsMuted: (id) => id === 'rude' });
    await asset(SOUND);
    sound({
      action: 'trigger',
      soundId: SOUND,
      objectId: 'o',
      ownerId: 'rude',
      position: [1, 1, 1],
    });
    expect(sources).toHaveLength(0);
    audio.setPolicy({ canHearAt: () => false });
    sound({
      action: 'trigger',
      soundId: SOUND,
      objectId: 'o',
      ownerId: 'fine',
      position: [1, 1, 1],
    });
    expect(sources).toHaveLength(0);
  });

  it('starts a looping attached sound once, ignores a repeat and clears it on a null sound', async () => {
    audio.setListener({ position: [0, 0, 0] });
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', ownerId: 'w', gain: 1, flags: 1 });
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', ownerId: 'w', gain: 1, flags: 1 });
    expect(sources).toHaveLength(1);
    sound({
      action: 'attached',
      soundId: '00000000-0000-0000-0000-000000000000',
      objectId: 'obj',
      ownerId: 'w',
      gain: 0,
      flags: 0,
    });
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it('replaces the current sound unless the queue flag is set, which plays them in turn', async () => {
    object('obj');
    await asset(SOUND);
    await asset(SOUND2);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 0 });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'obj', gain: 1, flags: 16 });
    expect(sources).toHaveLength(1); // queued behind the first
    sources[0].onended!();
    expect(sources).toHaveLength(2);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 0 }); // no queue: replaces
    expect(sources[1].stop).toHaveBeenCalled();
    expect(sources).toHaveLength(3);
  });

  it('applies gain changes to a playing sound and ignores unknown objects', async () => {
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 1 });
    sound({ action: 'gain', objectId: 'obj', gain: 0.25 });
    expect(
      lastContext.gains.some((g) => g.gain.setTargetAtTime.mock.calls.some((c) => c[0] === 0.25)),
    ).toBe(true);
    expect(() => sound({ action: 'gain', objectId: 'nobody', gain: 0.5 })).not.toThrow();
  });

  it('holds a sync slave until a master loops, then schedules on the audio clock', async () => {
    object('slave');
    object('master');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'slave',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_SLAVE,
    });
    expect(sources).toHaveLength(0);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'master',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    expect(sources).toHaveLength(2);
    expect(sources[0].start).toHaveBeenCalledWith(0);
    expect(sources[1].start).toHaveBeenCalledWith(1);
  });

  it('aligns a late slave with the next loop instead of starting at an arbitrary offset', async () => {
    object('slave');
    object('master');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'master',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    lastContext.currentTime = 2.4;
    sound({ action: 'attached', soundId: SOUND, objectId: 'slave', flags: SOUND_FLAG.SYNC_SLAVE });
    expect(sources[1].start).toHaveBeenCalledWith(3);
  });

  it('cancels a scheduled slave if its master stops and waits for another master', async () => {
    object('slave');
    object('master');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'master',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    sound({ action: 'attached', soundId: SOUND, objectId: 'slave', flags: SOUND_FLAG.SYNC_SLAVE });
    sound({ action: 'stop', objectId: 'master' });
    expect(sources[1].stop).toHaveBeenCalledOnce();
    expect(sources).toHaveLength(2);
    lastContext.currentTime = 0.2;
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'master',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    expect(sources[3].start).toHaveBeenCalledWith(1.2);
  });

  it('restarts the same loop after stopping it while its asset is still downloading', async () => {
    object('obj');
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.LOOP });
    sound({ action: 'stop', objectId: 'obj' });
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.LOOP });
    await asset(SOUND);
    expect(sources).toHaveLength(1);
    expect(sources[0].loop).toBe(true);
  });

  it('does not discard a new session request when an older decode fails late', async () => {
    await asset(SOUND2);
    let reject!: (error: Error) => void;
    lastContext.decodeAudioData.mockReturnValueOnce(
      new Promise((_, fail) => {
        reject = fail;
      }),
    );
    emit('scene:sound-asset', { assetId: SOUND, data: btoa('x') });
    audio.stopAll();
    sound({ action: 'trigger', soundId: SOUND, objectId: 'o', position: [1, 2, 3] });
    reject(new Error('Old asset decode failed'));
    await flush();
    await asset(SOUND);
    expect(sources).toHaveLength(1);
  });

  it('chooses the highest gain/distance² master and ignores a muted master', async () => {
    audio.setListener({ position: [0, 0, 0] });
    object('near', [1, 0, 0]);
    object('far', [10, 0, 0]);
    object('slave');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'near',
      gain: 0.5,
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    lastContext.currentTime = 0.3;
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'far',
      gain: 1,
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    sound({ action: 'attached', soundId: SOUND, objectId: 'slave', flags: SOUND_FLAG.SYNC_SLAVE });
    expect(sources[2].start).toHaveBeenCalledWith(1);
    audio.setPolicy({ isMuted: (id) => id === 'near' });
    audio.setListener({ position: [0, 0, 0] });
    expect(sources[2].stop).toHaveBeenCalledOnce();
    expect(sources[3].start).toHaveBeenCalledWith(1.3);
  });

  it('does not restart a slave that is already playing when the master disappears', async () => {
    object('master');
    object('slave');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'master',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_MASTER,
    });
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'slave',
      flags: SOUND_FLAG.LOOP | SOUND_FLAG.SYNC_SLAVE,
    });
    lastContext.currentTime = 1.1;
    sound({ action: 'stop', objectId: 'master' });
    expect(sources[1].stop).not.toHaveBeenCalled();
  });

  it('keeps one queued sound and ignores a repeat of the current loop', async () => {
    object('obj');
    await asset(SOUND);
    await asset(SOUND2);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.LOOP });
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    sources[0].onended!();
    expect(sources[1].buffer).toBe((audio as any).buffers.get(SOUND2));
    sources[1].onended!();
    expect(sources).toHaveLength(2);
  });

  it('reserves the pending FIFO slot before its download finishes', async () => {
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: 0 });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    sources[0].onended!();
    expect(sources).toHaveLength(1);
    await asset(SOUND2);
    expect(sources).toHaveLength(2);
    expect(sources[1].buffer).toBe((audio as any).buffers.get(SOUND2));
    sources[1].onended!();
    expect(sources).toHaveLength(2);
  });

  it('preserves current/queued message order when the queued asset arrives first', async () => {
    object('obj');
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: 0 });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'obj', flags: SOUND_FLAG.QUEUE });
    await asset(SOUND2);
    expect(sources).toHaveLength(0);
    await asset(SOUND);
    expect(sources).toHaveLength(1);
    expect(sources[0].buffer).toBe((audio as any).buffers.get(SOUND));
    sources[0].onended!();
    expect(sources[1].buffer).toBe((audio as any).buffers.get(SOUND2));
  });

  it('resolves moving linkset sounds, uses avatar parcel/cutoff tests, and mutes by ancestor avatar', async () => {
    let position: [number, number, number] = [50, 20, 10];
    audio.setObjectPoseResolver(() => ({
      position,
      policyPosition: [1, 0, 0],
      avatarId: 'avatar',
    }));
    const canHearAt = vi.fn(() => true);
    audio.setPolicy({ canHearAt });
    audio.setListener({ position: [0, 0, 0] });
    object('obj');
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'obj',
      flags: SOUND_FLAG.LOOP,
      radius: 2,
    });
    const panner = lastContext.panners[0];
    expect([panner.positionX.value, panner.positionY.value, panner.positionZ.value]).toEqual([
      50, 10, -20,
    ]);
    expect(canHearAt).toHaveBeenLastCalledWith([1, 0, 0]);
    expect((audio as any).playing.get('obj').muted).toBe(false);
    position = [80, 30, 10];
    await vi.advanceTimersByTimeAsync(250);
    expect(panner.positionX.value).toBe(80);
    audio.setPolicy({ isMuted: (id) => id === 'avatar' });
    audio.setListener({ position: [0, 0, 0] });
    expect((audio as any).playing.get('obj').muted).toBe(true);
  });

  it('places HUD sounds at the camera while retaining avatar parcel policy', async () => {
    audio.setObjectPoseResolver(() => ({
      position: [0, 0, 0],
      policyPosition: [1, 2, 3],
      avatarId: 'avatar',
      hud: true,
    }));
    audio.setListener({ position: [12, 34, 56] });
    object('hud');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'hud', flags: SOUND_FLAG.LOOP });
    expect([
      lastContext.panners[0].positionX.value,
      lastContext.panners[0].positionY.value,
      lastContext.panners[0].positionZ.value,
    ]).toEqual([12, 56, -34]);
  });

  it('holds a sound for an object that has not arrived and plays it when it does', async () => {
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'late', gain: 1, flags: 1 });
    expect(sources).toHaveLength(0);
    object('late');
    expect(sources).toHaveLength(1);
  });

  it('silences a source beyond its cut-off radius and brings it back when you come closer', async () => {
    audio.setListener({ position: [10, 10, 0] });
    object('obj', [40, 10, 0]);
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'obj',
      ownerId: 'w',
      gain: 1,
      flags: 1,
      radius: 20,
    });
    const gain = sources[0].connect.mock.calls[0][0] as FakeGain; // source -> gain
    const mute = gain.connect.mock.calls[0][0] as FakeGain; // gain -> mute -> panner
    expect(mute.gain.value).toBe(0); // 30 m away, radius 20 m
    audio.setListener({ position: [30, 10, 0] });
    expect(mute.gain.value).toBe(1); // 10 m away
    audio.setListener({ position: [100, 10, 0] });
    expect(mute.gain.value).toBe(0);
  });

  it('ignores a radius under 0.1 m and honours the parcel and mute rules', async () => {
    audio.setListener({ position: [0, 0, 0] });
    object('obj', [500, 0, 0]);
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'obj',
      ownerId: 'w',
      gain: 1,
      flags: 1,
      radius: 0.05,
    });
    const mute = (sources[0].connect.mock.calls[0][0] as FakeGain).connect.mock
      .calls[0][0] as FakeGain;
    expect(mute.gain.value).toBe(1);
    audio.setPolicy({ canHearAt: () => false }); // e.g. a "local sound only" parcel
    audio.setListener({ position: [1, 0, 0] });
    expect(mute.gain.value).toBe(0);
    audio.setPolicy({ canHearAt: () => true, isMuted: (id) => id === 'obj' });
    audio.setListener({ position: [2, 0, 0] });
    expect(mute.gain.value).toBe(0);
    audio.setPolicy({ isMuted: () => false });
    audio.setListener({ position: [3, 0, 0] });
    expect(mute.gain.value).toBe(1);
  });

  it('moves the listener in SL axes and raises rolloff under water', async () => {
    audio.setListener({ position: [1, 2, 3], forward: [0, 1, 0], up: [0, 0, 1] }); // before any context exists: remembered
    expect(lastContext).toBeUndefined();
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 1 });
    expect([
      lastContext.listener.positionX.value,
      lastContext.listener.positionY.value,
      lastContext.listener.positionZ.value,
    ]).toEqual([1, 3, -2]);
    expect([
      lastContext.listener.forwardX.value,
      lastContext.listener.forwardY.value,
      lastContext.listener.forwardZ.value,
    ]).toEqual([0, 0, -1]);
    audio.setUnderwater(true);
    expect(lastContext.panners[0].rolloffFactor).toBe(5);
    audio.setUnderwater(false);
    expect(lastContext.panners[0].rolloffFactor).toBe(1);
  });

  it('keeps master and category levels apart, as the viewer does', async () => {
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 1 });
    const [master, sfx, ui, ambient] = lastContext.gains;
    expect(master.gain.value).toBe(1);
    expect([sfx.gain.value, ui.gain.value, ambient.gain.value]).toEqual([0.5, 0.5, 0.5]);
    audio.setVolume(0.4);
    audio.setLevels({ sfx: 0.8 });
    audio.setMutes({ ui: true });
    expect([master.gain.value, sfx.gain.value, ui.gain.value]).toEqual([0.4, 0.8, 0]);
    audio.setMutes({ all: true });
    expect(master.gain.value).toBe(0);
  });

  it('requests and plays a UI sound without a position, unless UI sounds are muted', async () => {
    audio.playUi('UISndClick');
    expect(fetchSound).toHaveBeenCalledWith(UI_SOUNDS.UISndClick);
    await asset(UI_SOUNDS.UISndClick);
    expect(sources).toHaveLength(1);
    expect(lastContext.panners).toHaveLength(0);
    audio.setMutes({ ui: true });
    audio.playUi('UISndClick');
    expect(sources).toHaveLength(1);
  });

  it('stops an object sound when the object is removed', async () => {
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 1 });
    emit('scene:object-remove', { id: 'obj' });
    expect(sources[0].stop).toHaveBeenCalled();
  });

  it('does not start a sound that was stopped, cleared or removed while it was still downloading', async () => {
    object('stopped');
    object('cleared');
    object('removed');
    object('replaced');
    for (const id of ['stopped', 'cleared', 'removed', 'replaced'])
      sound({
        action: 'attached',
        soundId: SOUND,
        objectId: id,
        gain: 1,
        flags: id === 'cleared' ? 1 : 0,
      });
    sound({
      action: 'attached',
      soundId: '00000000-0000-0000-0000-000000000000',
      objectId: 'stopped',
      gain: 0,
      flags: 32,
    }); // STOP
    sound({
      action: 'attached',
      soundId: '00000000-0000-0000-0000-000000000000',
      objectId: 'cleared',
      gain: 0,
      flags: 0,
    }); // clears a loop
    emit('scene:object-remove', { id: 'removed' });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'replaced', gain: 1, flags: 0 }); // replaces it
    await asset(SOUND);
    expect(sources).toHaveLength(0); // none of the four plays SOUND late
    await asset(SOUND2);
    expect(sources).toHaveLength(1); // only the replacement
  });

  it('keeps queued sounds that are still downloading', async () => {
    object('obj');
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', gain: 1, flags: 16 });
    sound({ action: 'attached', soundId: SOUND2, objectId: 'obj', gain: 1, flags: 16 });
    await asset(SOUND);
    await asset(SOUND2);
    expect(sources).toHaveLength(1); // the first plays; the second waits its turn
    sources[0].onended!();
    expect(sources).toHaveLength(2);
  });

  it('frees waiting callbacks when a sound download fails, and asks again next time', async () => {
    fetchSound.mockRejectedValueOnce(new Error('403'));
    sound({ action: 'trigger', soundId: SOUND, objectId: 'o', ownerId: 'w', position: [1, 1, 1] });
    await flush();
    await asset(SOUND); // arrives later; nobody is waiting any more
    expect(sources).toHaveLength(0);
    sound({ action: 'trigger', soundId: SOUND, objectId: 'o', ownerId: 'w', position: [1, 1, 1] });
    expect(sources).toHaveLength(1); // decoded now, so it plays
  });

  it('fades a mute in over a short ramp instead of cutting it', async () => {
    audio.setListener({ position: [0, 0, 0] });
    object('obj', [50, 0, 0]);
    await asset(SOUND);
    sound({
      action: 'attached',
      soundId: SOUND,
      objectId: 'obj',
      ownerId: 'w',
      gain: 1,
      flags: 1,
      radius: 10,
    });
    const mute = (sources[0].connect.mock.calls[0][0] as FakeGain).connect.mock
      .calls[0][0] as FakeGain;
    expect(mute.gain.setTargetAtTime).toHaveBeenCalledWith(0, expect.any(Number), 0.02);
  });

  it('cancels downloaded-later triggers, UI sounds and attached sounds on disconnect', async () => {
    object('obj');
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: 1 });
    sound({ action: 'trigger', soundId: SOUND2, position: [1, 2, 3] });
    audio.playUi('UISndMoneyChangeUp');
    bus.emit('disconnected');
    await asset(SOUND);
    await asset(SOUND2);
    await asset(UI_SOUNDS.UISndMoneyChangeUp);
    expect(sources).toHaveLength(0);
  });

  it('stops active one-shots and disconnects their audio nodes', async () => {
    await asset(SOUND);
    sound({ action: 'trigger', soundId: SOUND, position: [1, 2, 3] });
    const source = sources[0];
    const gain = source.connect.mock.calls[0][0] as FakeGain;
    audio.stopAll();
    expect(source.stop).toHaveBeenCalledOnce();
    expect(source.disconnect).toHaveBeenCalledOnce();
    expect(gain.disconnect).toHaveBeenCalledOnce();
    expect(lastContext.panners[0].disconnect).toHaveBeenCalledOnce();
  });

  it('releases attached audio graphs when objects disappear', async () => {
    object('obj');
    await asset(SOUND);
    sound({ action: 'attached', soundId: SOUND, objectId: 'obj', flags: 1 });
    emit('scene:object-remove', { id: 'obj' });
    expect(sources[0].stop).toHaveBeenCalledOnce();
    expect(lastContext.panners[0].disconnect).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('allows a sound to be requested again after its bytes cannot be decoded', async () => {
    const error = vi.fn();
    audio.on('error', error);
    await asset(SOUND2); // create the audio context
    lastContext.decodeAudioData.mockRejectedValueOnce(new Error('bad audio'));
    sound({ action: 'trigger', soundId: SOUND, position: [1, 2, 3] });
    await asset(SOUND);
    expect(error).toHaveBeenCalledOnce();
    sound({ action: 'trigger', soundId: SOUND, position: [1, 2, 3] });
    expect(fetchSound).toHaveBeenCalledTimes(2);
    await asset(SOUND);
    expect(sources).toHaveLength(1);
  });
});
