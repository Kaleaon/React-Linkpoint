import { describe, expect, it } from 'vitest';
import {
  ChatAudible,
  ChatFromSimulatorMessage,
  ChatSourceType,
  ChatType,
  InstantMessageDialog,
  MessageIDs,
} from '../sl-message-types';

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

  it('matches the official viewer chat and instant-message enums', () => {
    expect(ChatSourceType).toMatchObject({ SYSTEM: 0, AGENT: 1, OBJECT: 2, REGION: 5 });
    expect(ChatType).toMatchObject({ WHISPER: 0, NORMAL: 1, SHOUT: 2, DIRECT: 9 });
    expect(ChatAudible).toEqual({ NOT: -1, BARELY: 0, FULLY: 1 });
    expect(InstantMessageDialog).toMatchObject({
      GROUP_INVITATION: 3,
      INVENTORY_OFFERED: 4,
      SESSION_SEND: 17,
      LURE_USER: 22,
      GROUP_NOTICE: 32,
      TYPING_START: 41,
      TYPING_STOP: 42,
    });
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
    view.setFloat32(offset, 128, true);
    offset += 4;
    view.setFloat32(offset, 64, true);
    offset += 4;
    view.setFloat32(offset, 25, true);
    offset += 4;
    view.setUint16(offset, message.length, true);
    offset += 2;
    payload.set(message, offset);

    const decoded = new ChatFromSimulatorMessage();
    decoded.unpackPayload(payload.buffer);

    expect(decoded.fromName).toBe('Ada Resident');
    expect(decoded.sourceId).toBe(sourceId);
    expect(decoded.ownerId).toBe(ownerId);
    expect(decoded.position.toArray()).toEqual([128, 64, 25]);
    expect(decoded.message).toBe('Hello, region!');
  });

  it('maps the wire value 255 to the official not-audible sentinel', () => {
    const fromName = [0];
    const message = [0];
    const fixed = [
      fromName.length,
      ...fromName,
      ...new Array(32).fill(0),
      ChatSourceType.SYSTEM,
      ChatType.NORMAL,
      0xff,
    ];
    const payload = new Uint8Array(fixed.length + 12 + 2 + message.length);
    payload.set(fixed);
    new DataView(payload.buffer).setUint16(fixed.length + 12, message.length, true);
    payload.set(message, fixed.length + 14);

    const decoded = new ChatFromSimulatorMessage();
    decoded.unpackPayload(payload.buffer);

    expect(decoded.audible).toBe(ChatAudible.NOT);
  });

  it('rejects truncated variable-length payloads', () => {
    const decoded = new ChatFromSimulatorMessage();
    expect(() => decoded.unpackPayload(new Uint8Array([20, 1, 2]).buffer)).toThrow(RangeError);
  });
});
