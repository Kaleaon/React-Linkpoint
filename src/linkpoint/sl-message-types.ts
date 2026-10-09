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
const LITTLE_ENDIAN = true;

/**
 * Values mirrored from the official viewer's llchat.h wire contract:
 * https://github.com/secondlife/viewer/blob/develop/indra/llui/llchat.h
 */
export const ChatSourceType = {
  SYSTEM: 0,
  AGENT: 1,
  OBJECT: 2,
  TELEPORT: 3,
  UNKNOWN: 4,
  REGION: 5,
} as const;

export type ChatSourceType = (typeof ChatSourceType)[keyof typeof ChatSourceType];

export const ChatType = {
  WHISPER: 0,
  NORMAL: 1,
  SHOUT: 2,
  START: 4,
  STOP: 5,
  DEBUG: 6,
  REGION: 7,
  OWNER: 8,
  DIRECT: 9,
} as const;

export type ChatType = (typeof ChatType)[keyof typeof ChatType];

export const ChatAudible = {
  NOT: -1,
  BARELY: 0,
  FULLY: 1,
} as const;

export type ChatAudible = (typeof ChatAudible)[keyof typeof ChatAudible];

/**
 * ImprovedInstantMessage Dialog values from the official viewer's
 * llinstantmessage.h contract:
 * https://github.com/secondlife/viewer/blob/develop/indra/llmessage/llinstantmessage.h
 */
export const InstantMessageDialog = {
  NOTHING_SPECIAL: 0,
  MESSAGEBOX: 1,
  GROUP_INVITATION: 3,
  INVENTORY_OFFERED: 4,
  INVENTORY_ACCEPTED: 5,
  INVENTORY_DECLINED: 6,
  GROUP_VOTE: 7,
  GROUP_MESSAGE_DEPRECATED: 8,
  TASK_INVENTORY_OFFERED: 9,
  TASK_INVENTORY_ACCEPTED: 10,
  TASK_INVENTORY_DECLINED: 11,
  NEW_USER_DEFAULT: 12,
  SESSION_INVITE: 13,
  SESSION_P2P_INVITE: 14,
  SESSION_GROUP_START: 15,
  SESSION_CONFERENCE_START: 16,
  SESSION_SEND: 17,
  SESSION_LEAVE: 18,
  FROM_TASK: 19,
  DO_NOT_DISTURB_AUTO_RESPONSE: 20,
  CONSOLE_AND_CHAT_HISTORY: 21,
  LURE_USER: 22,
  LURE_ACCEPTED: 23,
  LURE_DECLINED: 24,
  GODLIKE_LURE_USER: 25,
  TELEPORT_REQUEST: 26,
  GROUP_ELECTION_DEPRECATED: 27,
  GOTO_URL: 28,
  FROM_TASK_AS_ALERT: 31,
  GROUP_NOTICE: 32,
  GROUP_NOTICE_INVENTORY_ACCEPTED: 33,
  GROUP_NOTICE_INVENTORY_DECLINED: 34,
  GROUP_INVITATION_ACCEPT: 35,
  GROUP_INVITATION_DECLINE: 36,
  GROUP_NOTICE_REQUESTED: 37,
  FRIENDSHIP_OFFERED: 38,
  FRIENDSHIP_ACCEPTED: 39,
  FRIENDSHIP_DECLINED_DEPRECATED: 40,
  TYPING_START: 41,
  TYPING_STOP: 42,
} as const;

export type InstantMessageDialog = (typeof InstantMessageDialog)[keyof typeof InstantMessageDialog];

export const MessageIDs = {
  AGENT_UPDATE: 0x04,
  AGENT_ANIMATION: 0x05,
  COMPLETE_AGENT_MOVEMENT: lowFrequencyId(249),
  USE_CIRCUIT_CODE: lowFrequencyId(3),
  CHAT_FROM_SIMULATOR: lowFrequencyId(139),
  CHAT_FROM_VIEWER: lowFrequencyId(80),
  IMPROVED_IM: lowFrequencyId(254),
  OBJECT_UPDATE: 0x0c,
  OBJECT_UPDATE_COMPRESSED: 0x0d,
  OBJECT_UPDATE_CACHED: 0x0e,
  KILL_OBJECT: 0x10,
  REGION_HANDSHAKE: lowFrequencyId(148),
  REGION_HANDSHAKE_REPLY: lowFrequencyId(149),
  PACKET_ACK: 0xfffffffb,
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
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class LLVector3 {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
  ) {}

  static unpack(buffer: ArrayBuffer): LLVector3 {
    const view = new DataView(buffer);
    return new LLVector3(
      view.getFloat32(0, LITTLE_ENDIAN),
      view.getFloat32(4, LITTLE_ENDIAN),
      view.getFloat32(8, LITTLE_ENDIAN),
    );
  }

  toArray(): number[] {
    return [this.x, this.y, this.z];
  }
}

export class LLQuaternion {
  constructor(
    public x: number = 0,
    public y: number = 0,
    public z: number = 0,
    public w: number = 1,
  ) {}

  static unpack(buffer: ArrayBuffer): LLQuaternion {
    const view = new DataView(buffer);
    return new LLQuaternion(
      view.getFloat32(0, LITTLE_ENDIAN),
      view.getFloat32(4, LITTLE_ENDIAN),
      view.getFloat32(8, LITTLE_ENDIAN),
      view.getFloat32(12, LITTLE_ENDIAN),
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

  getMessageID() {
    return MessageIDs.CHAT_FROM_SIMULATOR;
  }
  getMessageName() {
    return 'ChatFromSimulator';
  }

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
    const audible = view.getUint8(offset++);
    this.audible = audible === 0xff ? ChatAudible.NOT : audible;

    this.position = LLVector3.unpack(buffer.slice(offset));
    offset += 12;

    const messageLength = view.getUint16(offset, LITTLE_ENDIAN);
    offset += 2;
    requireBytes(messageLength);
    const messageBytes = new Uint8Array(buffer, offset, messageLength);
    this.message = new TextDecoder().decode(messageBytes).replace(/\0$/, '');
  }
}

export class ChatFromViewerMessage extends SLMessage {
  constructor(
    public agentId: string,
    public sessionId: string,
    public message: string,
    public type: ChatType = ChatType.NORMAL,
    public channel: number = 0,
  ) {
    super();
    this.isReliable = true;
  }

  getMessageID() {
    return MessageIDs.CHAT_FROM_VIEWER;
  }
  getMessageName() {
    return 'ChatFromViewer';
  }
}
