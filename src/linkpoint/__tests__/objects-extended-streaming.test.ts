import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { ObjectManagerExtended } from '../phase2/objects-extended';
import { slBridge } from '../sl-bridge';

describe('ObjectManagerExtended Streaming & Permissions', () => {
  let objects: ObjectManagerExtended;
  let streamSpy: any;
  let commitSpy: any;

  beforeEach(() => {
    vi.useFakeTimers();
    objects = new ObjectManagerExtended();
    streamSpy = vi.spyOn(slBridge, 'streamObjectDelta').mockResolvedValue({ success: true } as any);
    commitSpy = vi
      .spyOn(slBridge, 'commitObjectTransform')
      .mockResolvedValue({ success: true } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('throttles high-frequency intermediate delta streams to 10Hz (100ms intervals)', () => {
    const objectId = 'test-object-1';

    // First intermediate call fires immediately
    objects.streamTransform(objectId, { position: [10, 20, 30] }, false);
    expect(streamSpy).toHaveBeenCalledTimes(1);
    expect(streamSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objectId,
        position: [10, 20, 30],
        isFinal: false,
      }),
    );
    expect(commitSpy).not.toHaveBeenCalled();

    // Rapid intermediate calls within 100ms window are throttled
    objects.streamTransform(objectId, { position: [10.1, 20.1, 30.1] }, false);
    objects.streamTransform(objectId, { position: [10.2, 20.2, 30.2] }, false);
    objects.streamTransform(objectId, { position: [10.5, 20.5, 30.5] }, false);
    expect(streamSpy).toHaveBeenCalledTimes(1);

    // Advancing time by 100ms flushes the latest throttled delta
    vi.advanceTimersByTime(100);
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(streamSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objectId,
        position: [10.5, 20.5, 30.5],
        isFinal: false,
      }),
    );
  });

  it('immediately flushes final commit without throttle delay upon pointer release', () => {
    const objectId = 'test-object-2';

    // Start drag
    objects.streamTransform(objectId, { position: [1, 2, 3] }, false);
    expect(streamSpy).toHaveBeenCalledTimes(1);

    // Rapid drag updates
    objects.streamTransform(objectId, { position: [2, 3, 4] }, false);
    expect(streamSpy).toHaveBeenCalledTimes(1);

    // Pointer released (isFinal = true): immediate unthrottled flush & commit
    objects.streamTransform(objectId, { position: [5, 6, 7] }, true);

    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(streamSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        objectId,
        position: [5, 6, 7],
        isFinal: true,
      }),
    );

    expect(commitSpy).toHaveBeenCalledTimes(1);
    expect(commitSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        objectId,
        position: [5, 6, 7],
      }),
    );

    // Make sure no trailing delayed timer fires afterwards
    vi.advanceTimersByTime(200);
    expect(streamSpy).toHaveBeenCalledTimes(2);
    expect(commitSpy).toHaveBeenCalledTimes(1);
  });

  it('streams position, rotation, and scale helper methods with final release', () => {
    const objectId = 'test-object-3';

    // Stream position
    objects.streamPosition(objectId, [100, 100, 50], false);
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ objectId, position: [100, 100, 50], isFinal: false }),
    );

    // Stream rotation
    vi.advanceTimersByTime(100);
    objects.streamRotation(objectId, [0, 45, 90], false);
    expect(streamSpy).toHaveBeenCalledWith(
      expect.objectContaining({ objectId, rotation: [0, 45, 90], isFinal: false }),
    );

    // Stream scale release
    objects.streamScale(objectId, [2, 2, 2], true);
    expect(commitSpy).toHaveBeenCalledWith(expect.objectContaining({ objectId, scale: [2, 2, 2] }));
  });

  it('enforces Second Life permissions for object modification', () => {
    // Modify permission bit is 0x4000 (16384)
    objects.setPermissions('prim-modifiable', {
      ownerMask: 0x4000,
      baseMask: 0x7fffffff,
      canModify: true,
    });
    expect(objects.hasPermission('prim-modifiable', 'modify')).toBe(true);

    // Without modify bit (e.g. only copy 0x8000 and transfer 0x2000)
    objects.setPermissions('prim-no-modify', {
      ownerMask: 0x8000 | 0x2000,
      canModify: true,
    });
    expect(objects.hasPermission('prim-no-modify', 'modify')).toBe(false);

    // Explicit canModify: false
    objects.setPermissions('prim-explicit-false', {
      ownerMask: 0x4000,
      canModify: false,
    });
    expect(objects.hasPermission('prim-explicit-false', 'modify')).toBe(false);

    // Avatars cannot have primitive transform gizmos
    objects.setPermissions('avatar-agent', {
      ownerMask: 0x7fffffff,
      isAvatar: true,
    });
    expect(objects.hasPermission('avatar-agent', 'modify')).toBe(false);
  });
});
