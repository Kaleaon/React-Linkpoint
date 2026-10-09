import { describe, expect, it } from 'vitest';
import {
  AttachedSounds,
  AudioType,
  DEFAULT_AUDIO_LEVELS,
  DEFAULT_AUDIO_MUTES,
  MAXIMUM_PLAY_DELAY_MS,
  NULL_UUID,
  SOUND_FLAG,
  UI_SOUNDS,
  canHearSound,
  categoryGain,
  isBeyondCutOff,
  moneySoundFor,
  regionHandleToGlobal,
  shouldPlayTrigger,
  triggerGlobalPosition,
  type SoundPolicy,
} from '../sound-standards';

describe('flags and levels', () => {
  it('uses the protocol values for sound flags', () => {
    expect(SOUND_FLAG).toEqual({
      NONE: 0,
      LOOP: 1,
      SYNC_MASTER: 2,
      SYNC_SLAVE: 4,
      SYNC_PENDING: 8,
      QUEUE: 16,
      STOP: 32,
    });
  });

  it('applies master x category level, and zero when muted', () => {
    expect(categoryGain(AudioType.Sfx)).toBe(0.5);
    expect(categoryGain(AudioType.Ui, { ...DEFAULT_AUDIO_LEVELS, master: 0.5 })).toBe(0.25);
    expect(
      categoryGain(AudioType.Ambient, DEFAULT_AUDIO_LEVELS, {
        ...DEFAULT_AUDIO_MUTES,
        ambient: true,
      }),
    ).toBe(0);
    expect(
      categoryGain(AudioType.Sfx, DEFAULT_AUDIO_LEVELS, { ...DEFAULT_AUDIO_MUTES, all: true }),
    ).toBe(0);
    expect(
      categoryGain(AudioType.Sfx, DEFAULT_AUDIO_LEVELS, { ...DEFAULT_AUDIO_MUTES, ui: true }),
    ).toBe(0.5);
    expect(categoryGain(AudioType.None)).toBe(1);
  });

  it('has well-formed UI sound ids and picks money sounds past the threshold', () => {
    for (const id of Object.values(UI_SOUNDS))
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(moneySoundFor(49)).toBeNull();
    expect(moneySoundFor(50)).toBe('UISndMoneyChangeUp');
    expect(moneySoundFor(-120)).toBe('UISndMoneyChangeDown');
    expect(moneySoundFor(NaN)).toBeNull();
  });
});

describe('coordinates and parcels', () => {
  it('decodes a region handle into global metres (x high word, y low word)', () => {
    expect(regionHandleToGlobal((256000n << 32n) | 255744n)).toEqual([256000, 255744]);
    expect(regionHandleToGlobal(String(((1000n * 256n) << 32n) | (1001n * 256n)))).toEqual([
      256000, 256256,
    ]);
  });

  it('adds the handle origin to a trigger position and leaves global positions alone', () => {
    const handle = (256000n << 32n) | 256256n;
    expect(
      triggerGlobalPosition({
        soundId: 's',
        objectId: 'o',
        ownerId: 'w',
        position: [10, 20, 30],
        handle,
      }),
    ).toEqual([256010, 256276, 30]);
    expect(
      triggerGlobalPosition({ soundId: 's', objectId: 'o', ownerId: 'w', position: [10, 20, 30] }),
    ).toEqual([10, 20, 30]);
  });

  it('follows the three-branch canHearSound rule', () => {
    expect(
      canHearSound({
        inAgentParcel: true,
        agentParcelSoundLocal: true,
        sourceParcelSoundLocal: true,
      }),
    ).toBe(true);
    expect(
      canHearSound({
        inAgentParcel: false,
        agentParcelSoundLocal: true,
        sourceParcelSoundLocal: false,
      }),
    ).toBe(false);
    expect(
      canHearSound({
        inAgentParcel: false,
        agentParcelSoundLocal: false,
        sourceParcelSoundLocal: true,
      }),
    ).toBe(false);
    expect(
      canHearSound({
        inAgentParcel: false,
        agentParcelSoundLocal: false,
        sourceParcelSoundLocal: false,
      }),
    ).toBe(true);
  });

  it('treats a cut-off radius under 0.1 m as off', () => {
    expect(isBeyondCutOff(50, 0)).toBe(false);
    expect(isBeyondCutOff(50, 0.09)).toBe(false);
    expect(isBeyondCutOff(10, 10)).toBe(true); // `dist < cutoff` is required to hear it
    expect(isBeyondCutOff(9.99, 10)).toBe(false);
  });
});

describe('SoundTrigger filter', () => {
  const policy = (over: Partial<SoundPolicy> = {}): SoundPolicy => ({
    agentId: 'me',
    isMuted: () => false,
    ownerSoundsMuted: () => false,
    canHearAt: () => true,
    canAccessMaturityAt: () => true,
    enableGestureSounds: true,
    enableCollisionSounds: true,
    isCollisionSound: () => false,
    ...over,
  });
  const ev = {
    soundId: 's',
    objectId: 'obj',
    ownerId: 'owner',
    parentId: 'parent',
    position: [1, 2, 3] as const,
  };

  it('plays by default', () => expect(shouldPlayTrigger(ev, policy())).toBe(true));

  it('drops sounds the viewer drops, one rule at a time', () => {
    expect(shouldPlayTrigger(ev, policy({ canHearAt: () => false }))).toBe(false);
    expect(shouldPlayTrigger(ev, policy({ ownerSoundsMuted: (id) => id === 'owner' }))).toBe(false);
    expect(shouldPlayTrigger(ev, policy({ isMuted: (id) => id === 'obj' }))).toBe(false);
    expect(shouldPlayTrigger(ev, policy({ isMuted: (id) => id === 'parent' }))).toBe(false);
    expect(
      shouldPlayTrigger(
        { ...ev, parentId: NULL_UUID },
        policy({ isMuted: (id) => id === NULL_UUID }),
      ),
    ).toBe(true);
    expect(shouldPlayTrigger(ev, policy({ canAccessMaturityAt: () => false }))).toBe(false);
    expect(
      shouldPlayTrigger(ev, policy({ isCollisionSound: () => true, enableCollisionSounds: false })),
    ).toBe(false);
    expect(shouldPlayTrigger(ev, policy({ isCollisionSound: () => true }))).toBe(true);
  });

  it("drops other residents' gesture sounds when disabled, but never your own", () => {
    const gesture = { ...ev, objectId: 'owner' };
    expect(shouldPlayTrigger(gesture, policy({ enableGestureSounds: false }))).toBe(false);
    expect(shouldPlayTrigger(gesture, policy({ enableGestureSounds: true }))).toBe(true);
    expect(
      shouldPlayTrigger(
        { ...gesture, objectId: 'me', ownerId: 'me' },
        policy({ enableGestureSounds: false }),
      ),
    ).toBe(true);
  });

  it('computes the parcel check on the global position', () => {
    let seen: readonly number[] = [];
    shouldPlayTrigger(
      { ...ev, handle: (256000n << 32n) | 256000n },
      policy({
        canHearAt: (g) => {
          seen = g;
          return true;
        },
      }),
    );
    expect(seen).toEqual([256001, 256002, 3]);
  });
});

describe('AttachedSounds (setAttachedSound)', () => {
  const play = (soundId: string, flags = 0, gain = 1) => ({ soundId, ownerId: 'o', gain, flags });

  it('plays, stopping the current sound first unless queueing', () => {
    const s = new AttachedSounds();
    expect(s.apply('a', play('snd', 0, 0.5))).toEqual([
      {
        type: 'play',
        objectId: 'a',
        soundId: 'snd',
        gain: 0.5,
        loop: false,
        queue: false,
        syncMaster: false,
        syncSlave: false,
        stopFirst: true,
      },
    ]);
    const queued = s.apply('a', play('snd2', SOUND_FLAG.QUEUE | SOUND_FLAG.SYNC_MASTER));
    expect(queued[0]).toMatchObject({
      type: 'play',
      queue: true,
      stopFirst: false,
      syncMaster: true,
    });
  });

  it('ignores a repeat of the same looping sound', () => {
    const s = new AttachedSounds();
    expect(s.apply('a', play('snd', SOUND_FLAG.LOOP))).toHaveLength(1);
    expect(s.apply('a', play('snd', SOUND_FLAG.LOOP))).toEqual([]);
    expect(s.apply('a', play('other', SOUND_FLAG.LOOP))).toHaveLength(1);
  });

  it('clears a loop on a null sound, stops a non-loop only with the STOP flag', () => {
    const s = new AttachedSounds();
    s.apply('a', play('loop', SOUND_FLAG.LOOP));
    expect(s.apply('a', play(NULL_UUID))).toEqual([{ type: 'cleanup', objectId: 'a' }]);
    expect(s.has('a')).toBe(false);
    s.apply('b', play('once'));
    expect(s.apply('b', play(NULL_UUID))).toEqual([]);
    expect(s.apply('b', play(NULL_UUID, SOUND_FLAG.STOP))).toEqual([
      { type: 'stop', objectId: 'b' },
    ]);
    expect(s.apply('nobody', play(NULL_UUID, SOUND_FLAG.STOP))).toEqual([]);
  });

  it('cleans up a finished sound before starting the next, and keeps a muted copy of the same sound', () => {
    const s = new AttachedSounds();
    s.apply('a', play('snd'));
    s.markDone('a');
    const out = s.apply('a', play('snd2'));
    expect(out.map((a) => a.type)).toEqual(['cleanup', 'play']);
    s.setMuted('a', true);
    expect(s.apply('a', play('snd2'))).toEqual([]);
  });

  it('clamps gain and applies gain changes only to known objects', () => {
    const s = new AttachedSounds();
    expect((s.apply('a', play('snd', 0, 3))[0] as { gain: number }).gain).toBe(1);
    expect(s.gainChange('a', 0.25)).toBe(0.25);
    expect(s.gainChange('a', -1)).toBe(0);
    expect(s.gainChange('unknown', 0.5)).toBeNull();
  });

  it('postpones sounds for objects not yet seen and plays them if they arrive within 15 s', () => {
    let t = 0;
    const known = new Set<string>();
    const s = new AttachedSounds(
      () => t,
      (id) => known.has(id),
    );
    expect(s.apply('late', play('snd', SOUND_FLAG.LOOP))).toEqual([]);
    t = 5000;
    known.add('late');
    expect(s.objectArrived('late')).toHaveLength(1);
    expect(s.objectArrived('late')).toEqual([]);

    expect(s.apply('slow', play('snd'))).toEqual([]);
    t += MAXIMUM_PLAY_DELAY_MS + 1;
    known.add('slow');
    expect(s.objectArrived('slow')).toEqual([]);

    s.apply('gone', play('snd'));
    s.apply('gone', play(NULL_UUID)); // a null sound cancels the postponed one
    known.add('gone');
    expect(s.objectArrived('gone')).toEqual([]);
  });
});
