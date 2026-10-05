/**
 * Linkpoint PWA - Second Life Message Types
 */

/**
 * Canonical wire identifiers from Linden Lab's message_template.msg.
 *
 * High-frequency messages occupy one byte, medium-frequency messages are
 * prefixed with 0xff, and low-frequency messages are prefixed with 0xffff.
 * Keeping the prefix in the numeric identifier prevents low-frequency IDs
 * from colliding with high-frequency IDs (for example UseCircuitCode and
 * AgentUpdate).
 */
const lowFrequencyId = (id: number): number => (0xffff0000 | id) >>> 0;

export const MessageIDs = {
  AGENT_UPDATE: 0x04,
  AGENT_ANIMATION: 0x05,
  COMPLETE_AGENT_MOVEMENT: lowFrequencyId(249),
  USE_CIRCUIT_CODE: lowFrequencyId(3),
  CHAT_FROM_SIMULATOR: lowFrequencyId(139),
  CHAT_FROM_VIEWER: lowFrequencyId(80),
  IMPROVED_IM: lowFrequencyId(254),
  OBJECT_UPDATE: 0x0C,
  OBJECT_UPDATE_COMPRESSED: 0x0D,
  OBJECT_UPDATE_CACHED: 0x0E,
  KILL_OBJECT: 0x10,
  REGION_HANDSHAKE: lowFrequencyId(148),
  REGION_HANDSHAKE_REPLY: lowFrequencyId(149),
  PACKET_ACK: 0xFFFFFFFB,
  START_PING_CHECK: 0x01,
  COMPLETE_PING_CHECK: 0x02,
  TELEPORT_REQUEST: lowFrequencyId(62),
  TELEPORT_PROGRESS: lowFrequencyId(66),
  TELEPORT_FINISH: lowFrequencyId(69),
  TELEPORT_FAILED: lowFrequencyId(74),
} as const;

const UUID_BYTES = 16;

function readUuid(bytes: Uint8Array): string {
  if (bytes.byteLength !== UUID_BYTES) throw new RangeError('An LLUUID must contain 16 bytes');
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class LLVector3 {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0) {}

  static unpack(buffer: ArrayBuffer): LLVector3 {
    const view = new DataView(buffer);
    return new LLVector3(
      view.getFloat32(0, false),
      view.getFloat32(4, false),
      view.getFloat32(8, false)
    );
  }

  toArray(): number[] {
    return [this.x, this.y, this.z];
  }
}

export class LLQuaternion {
  constructor(public x: number = 0, public y: number = 0, public z: number = 0, public w: number = 1) {}

  static unpack(buffer: ArrayBuffer): LLQuaternion {
    const view = new DataView(buffer);
    return new LLQuaternion(
      view.getFloat32(0, false),
      view.getFloat32(4, false),
      view.getFloat32(8, false),
      view.getFloat32(12, false)
    );
  }
}

export abstract class SLMessage {
  public isReliable: boolean = false;
  public seqNum: number = 0;
  abstract getMessageID(): number;
  abstract getMessageName(): string;
}

export class ChatFromSimulatorMessage extends SLMessage {
  public fromName: string = '';
  public sourceId: string = '';
  public ownerId: string = '';
  public sourceType: number = 0;
  public chatType: number = 0;
  public audible: number = 0;
  public position: LLVector3 = new LLVector3();
  public message: string = '';

  getMessageID() { return MessageIDs.CHAT_FROM_SIMULATOR; }
  getMessageName() { return 'ChatFromSimulator'; }

  unpackPayload(buffer: ArrayBuffer) {
    const view = new DataView(buffer);
    let offset = 0;

    const requireBytes = (count: number): void => {
      if (count < 0 || offset + count > view.byteLength) {
        throw new RangeError(`Truncated ChatFromSimulator payload at byte ${offset}`);
      }
    };

    requireBytes(1);
    const nameLength = view.getUint8(offset++);
    requireBytes(nameLength + UUID_BYTES * 2 + 3 + 12 + 2);
    const nameBytes = new Uint8Array(buffer, offset, nameLength);
    this.fromName = new TextDecoder().decode(nameBytes).replace(/\0$/, '');
    offset += nameLength;

    this.sourceId = readUuid(new Uint8Array(buffer, offset, UUID_BYTES));
    offset += UUID_BYTES;
    this.ownerId = readUuid(new Uint8Array(buffer, offset, UUID_BYTES));
    offset += UUID_BYTES;

    this.sourceType = view.getUint8(offset++);
    this.chatType = view.getUint8(offset++);
    this.audible = view.getUint8(offset++);

    this.position = LLVector3.unpack(buffer.slice(offset));
    offset += 12;

    const messageLength = view.getUint16(offset, false); offset += 2;
    requireBytes(messageLength);
    const messageBytes = new Uint8Array(buffer, offset, messageLength);
    this.message = new TextDecoder().decode(messageBytes).replace(/\0$/, '');
  }
}

export class ChatFromViewerMessage extends SLMessage {
  constructor(public agentId: string, public sessionId: string, public message: string, public type: number = 1, public channel: number = 0) {
    super();
    this.isReliable = true;
  }

  getMessageID() { return MessageIDs.CHAT_FROM_VIEWER; }
  getMessageName() { return 'ChatFromViewer'; }
}
