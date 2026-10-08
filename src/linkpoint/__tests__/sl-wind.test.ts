import { describe, expect, it, vi } from 'vitest';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { serializeWindPacket, watchWind } = require('../../../core/sl-wind.cjs');
const { Message } = require('@caspertech/node-metaverse/dist/lib/enums/Message');

const packet = (type: number, bytes: number[]) => ({ message: { id: Message.LayerData, LayerID: { Type: type }, LayerData: { Data: Buffer.from(bytes) } } });

describe('wind layer packets', () => {
  it("forwards only layer '7' and keeps the bytes", () => {
    expect(serializeWindPacket(packet(0x37, [1, 2, 255]))).toEqual({ action: 'layer', data: Buffer.from([1, 2, 255]).toString('base64') });
    expect(serializeWindPacket(packet(0x4c, [1]))).toBeNull(); // 'L' land
    expect(serializeWindPacket(packet(0x38, [1]))).toBeNull(); // '8' clouds
    expect(serializeWindPacket(packet(0x37, []))).toBeNull();
    expect(serializeWindPacket({ message: { id: Message.SoundTrigger } })).toBeNull();
  });

  it('tells the client to drop the old grid when the region changes', () => {
    vi.useFakeTimers();
    const handlers: Array<(p: unknown) => void> = [];
    const makeRegion = () => ({ circuit: { subscribeToMessages: (_ids: unknown, cb: (p: unknown) => void) => { handlers.push(cb); return { unsubscribe: vi.fn() }; } } });
    let region = makeRegion();
    const send = vi.fn();
    const watcher = watchWind(() => region, send, 100);
    handlers[0](packet(0x37, [9]));
    expect(send).toHaveBeenLastCalledWith('wind-layer', { action: 'layer', data: Buffer.from([9]).toString('base64') });
    region = makeRegion();
    vi.advanceTimersByTime(150);
    expect(send).toHaveBeenCalledWith('wind-layer', { action: 'reset' });
    watcher.unsubscribe();
    vi.useRealTimers();
  });
});
