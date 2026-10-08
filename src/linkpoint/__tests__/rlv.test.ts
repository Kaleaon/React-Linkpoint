import { describe, expect, it } from 'vitest';
import { RlvController } from '../rlv';

describe('RlvController', () => {
  it('should parse version command and return version string on channel', () => {
    const rlv = new RlvController(true);
    const replies = rlv.processMessage('object-uuid-1', '@version=22200');
    expect(replies).toHaveLength(1);
    // RLVa's own reply (RLV 3.4.3 / RLVa 2.4.2), not a made-up string
    expect(replies[0]).toEqual({ channel: 22200, message: 'RestrainedLife viewer v3.4.3 (RLVa 2.4.2)' });
  });

  it('should set and query detach restriction', () => {
    const rlv = new RlvController(true);
    expect(rlv.canDetach()).toBe(true);

    rlv.processMessage('object-uuid-1', '@detach=n');
    expect(rlv.canDetach()).toBe(false);

    rlv.processMessage('object-uuid-1', '@detach=y');
    expect(rlv.canDetach()).toBe(true);
  });

  it('should set and query chat restriction', () => {
    const rlv = new RlvController(true);
    expect(rlv.canSendChat()).toBe(true);

    rlv.processMessage('object-uuid-1', '@sendchat=n');
    expect(rlv.canSendChat()).toBe(false);

    rlv.processMessage('object-uuid-1', '@clear');
    expect(rlv.canSendChat()).toBe(true);
  });

  it('should process multiple commands separated by comma', () => {
    const rlv = new RlvController(true);
    rlv.processMessage('object-uuid-1', '@detach=n,sendchat=n,tplm=n');
    expect(rlv.canDetach()).toBe(false);
    expect(rlv.canSendChat()).toBe(false);
    expect(rlv.canTeleportLandmark()).toBe(false);
  });

  it('should ignore restrictions if disabled', () => {
    const rlv = new RlvController(false);
    rlv.processMessage('object-uuid-1', '@detach=n');
    expect(rlv.canDetach()).toBe(true);
  });
});
