import { describe, expect, it } from 'vitest';
import { ChatFromSimulatorMessage, MessageIDs } from '../sl-message-types';

const uuidBytes = (uuid: string): number[] =>
  Array.from(Buffer.from(uuid.replaceAll('-', ''), 'hex'));

describe('Second Life UDP message template compatibility', () => {
  it('uses canonical frequency-prefixed wire identifiers', () => {
    expect(MessageIDs.AGENT_UPDATE).toBe(0x04);
    expect(MessageIDs.AGENT_ANIMATION).toBe(0x05);
    expect(MessageIDs.KILL_OBJECT).toBe(0x10);
    expect(MessageIDs.USE_CIRCUIT_CODE).toBe(0xffff0003);
    expect(MessageIDs.CHAT_FROM_SIMULATOR).toBe(0xffff008b);
    expect(MessageIDs.CHAT_FROM_VIEWER).toBe(0xffff0050);
    expect(MessageIDs.IMPROVED_IM).toBe(0xffff00fe);
    expect(MessageIDs.PACKET_ACK).toBe(0xfffffffb);
    expect(MessageIDs.TELEPORT_REQUEST).toBe(0xffff003e);
    expect(MessageIDs.TELEPORT_PROGRESS).toBe(0xffff0042);
    expect(MessageIDs.TELEPORT_FINISH).toBe(0xffff0045);
    expect(MessageIDs.TELEPORT_FAILED).toBe(0xffff004a);
  });

  it('decodes the complete ChatData block including UUIDs and variable fields', () => {
    const fromName = Array.from(Buffer.from('Ada Resident\0'));
    const message = Array.from(Buffer.from('Hello, region!\0'));
    const sourceId = '11111111-2222-3333-4444-555555555555';
    const ownerId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const fixed = [
      fromName.length,
      ...fromName,
      ...uuidBytes(sourceId),
      ...uuidBytes(ownerId),
      1, // SOURCE_AGENT
      1, // CHAT_TYPE_NORMAL
      1, // CHAT_AUDIBLE_FULLY
    ];
    const payload = new Uint8Array(fixed.length + 12 + 2 + message.length);
    payload.set(fixed);
    const view = new DataView(payload.buffer);
    let offset = fixed.length;
    view.setFloat32(offset, 128, false); offset += 4;
    view.setFloat32(offset, 64, false); offset += 4;
    view.setFloat32(offset, 25, false); offset += 4;
    view.setUint16(offset, message.length, false); offset += 2;
    payload.set(message, offset);

    const decoded = new ChatFromSimulatorMessage();
    decoded.unpackPayload(payload.buffer);

    expect(decoded.fromName).toBe('Ada Resident');
    expect(decoded.sourceId).toBe(sourceId);
    expect(decoded.ownerId).toBe(ownerId);
    expect(decoded.position.toArray()).toEqual([128, 64, 25]);
    expect(decoded.message).toBe('Hello, region!');
  });

  it('rejects truncated variable-length payloads', () => {
    const decoded = new ChatFromSimulatorMessage();
    expect(() => decoded.unpackPayload(new Uint8Array([20, 1, 2]).buffer)).toThrow(RangeError);
  });
});
