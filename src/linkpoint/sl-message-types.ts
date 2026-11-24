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
export const highFrequencyId = (id: number): number => (id & 0xff) >>> 0;
export const mediumFrequencyId = (id: number): number => (0xff00 | (id & 0xff)) >>> 0;
export const lowFrequencyId = (id: number): number => (0xffff0000 | (id & 0xffff)) >>> 0;
export const fixedFrequencyId = (id: number): number => (0xffffff00 | (id & 0xff)) >>> 0;
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
  PACKET_ACK: fixedFrequencyId(0xfb),
  OPEN_CIRCUIT: fixedFrequencyId(0xfc),
  START_PING_CHECK: highFrequencyId(1),
  COMPLETE_PING_CHECK: highFrequencyId(2),
  AGENT_UPDATE: highFrequencyId(4),
  AGENT_ANIMATION: highFrequencyId(5),
  AGENT_REQUEST_SIT: highFrequencyId(6),
  AGENT_SIT: highFrequencyId(7),
  LAYER_DATA: highFrequencyId(11),
  OBJECT_UPDATE: highFrequencyId(12),
  OBJECT_UPDATE_COMPRESSED: highFrequencyId(13),
  OBJECT_UPDATE_CACHED: highFrequencyId(14),
  IMPROVED_TERSE_OBJECT_UPDATE: highFrequencyId(15),
  KILL_OBJECT: highFrequencyId(16),
  PARCEL_PROPERTIES: highFrequencyId(23),
  SOUND_TRIGGER: highFrequencyId(29),
  OBJECT_ADD: mediumFrequencyId(1),
  MULTIPLE_OBJECT_UPDATE: mediumFrequencyId(2),
  REQUEST_MULTIPLE_OBJECTS: mediumFrequencyId(3),
  COARSE_LOCATION_UPDATE: mediumFrequencyId(6),
  CROSSED_REGION: mediumFrequencyId(7),
  ATTACHED_SOUND: mediumFrequencyId(13),
  ATTACHED_SOUND_GAIN_CHANGE: mediumFrequencyId(14),
  PRELOAD_SOUND: mediumFrequencyId(15),
  USE_CIRCUIT_CODE: lowFrequencyId(3),
  TELEPORT_REQUEST: lowFrequencyId(62),
  TELEPORT_LOCATION_REQUEST: lowFrequencyId(63),
  TELEPORT_LOCAL: lowFrequencyId(64),
  TELEPORT_LANDMARK_REQUEST: lowFrequencyId(65),
  TELEPORT_PROGRESS: lowFrequencyId(66),
  TELEPORT_FINISH: lowFrequencyId(69),
  START_LURE: lowFrequencyId(70),
  TELEPORT_LURE_REQUEST: lowFrequencyId(71),
  TELEPORT_CANCEL: lowFrequencyId(72),
  /** Legacy Linkpoint alias for TeleportCancel (Low 72 = 0xFFFF0048). */
  DECLINE_TELEPORT: lowFrequencyId(72),
  TELEPORT_START: lowFrequencyId(73),
  TELEPORT_FAILED: lowFrequencyId(74),
  CHAT_FROM_VIEWER: lowFrequencyId(80),
  AGENT_THROTTLE: lowFrequencyId(81),
  OBJECT_SHAPE: lowFrequencyId(98),
  OBJECT_SELECT: lowFrequencyId(110),
  OBJECT_DESELECT: lowFrequencyId(111),
  OBJECT_LINK: lowFrequencyId(115),
  OBJECT_DELINK: lowFrequencyId(116),
  OBJECT_GRAB: lowFrequencyId(117),
  OBJECT_GRAB_UPDATE: lowFrequencyId(118),
  OBJECT_DE_GRAB: lowFrequencyId(119),
  CHAT_FROM_SIMULATOR: lowFrequencyId(139),
  REGION_HANDSHAKE: lowFrequencyId(148),
  REGION_HANDSHAKE_REPLY: lowFrequencyId(149),
  REQUEST_PAY_PRICE: lowFrequencyId(161),
  PAY_PRICE_REPLY: lowFrequencyId(162),
  KICK_USER: lowFrequencyId(163),
  AVATAR_PROPERTIES_REQUEST: lowFrequencyId(169),
  AVATAR_PROPERTIES_REPLY: lowFrequencyId(171),
  PARCEL_PROPERTIES_UPDATE: lowFrequencyId(198),
  PARCEL_BUY_PASS: lowFrequencyId(206),
  PARCEL_RECLAIM: lowFrequencyId(208),
  PARCEL_DIVIDE: lowFrequencyId(211),
  /** Legacy Linkpoint alias for ParcelDivide (Low 211 = 0xFFFF00D3). */
  PARCEL_SUBDIVIDE: lowFrequencyId(211),
  PARCEL_BUY: lowFrequencyId(213),
  UUID_NAME_REQUEST: lowFrequencyId(235),
  UUID_NAME_REPLY: lowFrequencyId(236),
  COMPLETE_AGENT_MOVEMENT: lowFrequencyId(249),
  AGENT_MOVEMENT_COMPLETE: lowFrequencyId(250),
  LOGOUT_REQUEST: lowFrequencyId(252),
  LOGOUT_REPLY: lowFrequencyId(253),
  IMPROVED_INSTANT_MESSAGE: lowFrequencyId(254),
  /** Legacy Linkpoint alias for ImprovedInstantMessage (Low 254 = 0xFFFF00FE). */
  IMPROVED_IM: lowFrequencyId(254),
  DE_REZ_OBJECT: lowFrequencyId(291),
  ACCEPT_FRIENDSHIP: lowFrequencyId(297),
  DECLINE_FRIENDSHIP: lowFrequencyId(298),
  TERMINATE_FRIENDSHIP: lowFrequencyId(300),
  REGION_HANDLE_REQUEST: lowFrequencyId(309),
  MONEY_TRANSFER_REQUEST: lowFrequencyId(311),
  MONEY_BALANCE_REQUEST: lowFrequencyId(313),
  MONEY_BALANCE_REPLY: lowFrequencyId(314),
  GRANT_USER_RIGHTS: lowFrequencyId(320),
  ONLINE_NOTIFICATION: lowFrequencyId(322),
  OFFLINE_NOTIFICATION: lowFrequencyId(323),
  MAP_NAME_REQUEST: lowFrequencyId(408),
  MAP_BLOCK_REPLY: lowFrequencyId(409),
  PARCEL_MEDIA_COMMAND_MESSAGE: lowFrequencyId(419),
  PARCEL_MEDIA_UPDATE: lowFrequencyId(420),
} as const;

export type MessageID = (typeof MessageIDs)[keyof typeof MessageIDs];
export type MessageFrequency = 'High' | 'Medium' | 'Low' | 'Fixed';
export type MessageTrust = 'Trusted' | 'NotTrusted';
export type MessageEncoding = 'Unencoded' | 'Zerocoded';
export type MessageTemplateFlag = 'Deprecated' | 'UDPDeprecated' | 'UDPBlackListed';

export interface MessageTemplateMetadata {
  readonly name: string;
  readonly wireId: number;
  readonly frequency: MessageFrequency;
  readonly messageNumber: number;
  readonly trust: MessageTrust;
  readonly encoding: MessageEncoding;
  readonly flags: readonly MessageTemplateFlag[];
  readonly viewerOutboundEligible: boolean;
}

export interface OutboundPacketValidationResult {
  readonly valid: boolean;
  readonly messageId: number;
  readonly metadata?: MessageTemplateMetadata;
  readonly reason?:
    | 'invalid_message_id'
    | 'unknown_message_id'
    | 'trusted_simulator_only'
    | 'udp_blacklisted'
    | 'message_name_mismatch';
  readonly error?: string;
}

interface RawMessageTemplateEntry {
  readonly name: string;
  readonly wireId: number;
  readonly frequency: MessageFrequency;
  readonly messageNumber: number;
  readonly trust: MessageTrust;
  readonly encoding: MessageEncoding;
  readonly flags: readonly MessageTemplateFlag[];
}

const RAW_MESSAGE_TEMPLATE_ENTRIES: readonly RawMessageTemplateEntry[] = [
  {
    name: 'PacketAck',
    wireId: MessageIDs.PACKET_ACK,
    frequency: 'Fixed',
    messageNumber: 251,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'OpenCircuit',
    wireId: MessageIDs.OPEN_CIRCUIT,
    frequency: 'Fixed',
    messageNumber: 252,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: ['UDPBlackListed'],
  },
  {
    name: 'StartPingCheck',
    wireId: MessageIDs.START_PING_CHECK,
    frequency: 'High',
    messageNumber: 1,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'CompletePingCheck',
    wireId: MessageIDs.COMPLETE_PING_CHECK,
    frequency: 'High',
    messageNumber: 2,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AgentUpdate',
    wireId: MessageIDs.AGENT_UPDATE,
    frequency: 'High',
    messageNumber: 4,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'AgentAnimation',
    wireId: MessageIDs.AGENT_ANIMATION,
    frequency: 'High',
    messageNumber: 5,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AgentRequestSit',
    wireId: MessageIDs.AGENT_REQUEST_SIT,
    frequency: 'High',
    messageNumber: 6,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'AgentSit',
    wireId: MessageIDs.AGENT_SIT,
    frequency: 'High',
    messageNumber: 7,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'LayerData',
    wireId: MessageIDs.LAYER_DATA,
    frequency: 'High',
    messageNumber: 11,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ObjectUpdate',
    wireId: MessageIDs.OBJECT_UPDATE,
    frequency: 'High',
    messageNumber: 12,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectUpdateCompressed',
    wireId: MessageIDs.OBJECT_UPDATE_COMPRESSED,
    frequency: 'High',
    messageNumber: 13,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ObjectUpdateCached',
    wireId: MessageIDs.OBJECT_UPDATE_CACHED,
    frequency: 'High',
    messageNumber: 14,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ImprovedTerseObjectUpdate',
    wireId: MessageIDs.IMPROVED_TERSE_OBJECT_UPDATE,
    frequency: 'High',
    messageNumber: 15,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'KillObject',
    wireId: MessageIDs.KILL_OBJECT,
    frequency: 'High',
    messageNumber: 16,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelProperties',
    wireId: MessageIDs.PARCEL_PROPERTIES,
    frequency: 'High',
    messageNumber: 23,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: ['UDPDeprecated'],
  },
  {
    name: 'SoundTrigger',
    wireId: MessageIDs.SOUND_TRIGGER,
    frequency: 'High',
    messageNumber: 29,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ObjectAdd',
    wireId: MessageIDs.OBJECT_ADD,
    frequency: 'Medium',
    messageNumber: 1,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'MultipleObjectUpdate',
    wireId: MessageIDs.MULTIPLE_OBJECT_UPDATE,
    frequency: 'Medium',
    messageNumber: 2,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'RequestMultipleObjects',
    wireId: MessageIDs.REQUEST_MULTIPLE_OBJECTS,
    frequency: 'Medium',
    messageNumber: 3,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'CoarseLocationUpdate',
    wireId: MessageIDs.COARSE_LOCATION_UPDATE,
    frequency: 'Medium',
    messageNumber: 6,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'CrossedRegion',
    wireId: MessageIDs.CROSSED_REGION,
    frequency: 'Medium',
    messageNumber: 7,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: ['UDPBlackListed'],
  },
  {
    name: 'AttachedSound',
    wireId: MessageIDs.ATTACHED_SOUND,
    frequency: 'Medium',
    messageNumber: 13,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AttachedSoundGainChange',
    wireId: MessageIDs.ATTACHED_SOUND_GAIN_CHANGE,
    frequency: 'Medium',
    messageNumber: 14,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'PreloadSound',
    wireId: MessageIDs.PRELOAD_SOUND,
    frequency: 'Medium',
    messageNumber: 15,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'UseCircuitCode',
    wireId: MessageIDs.USE_CIRCUIT_CODE,
    frequency: 'Low',
    messageNumber: 3,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportRequest',
    wireId: MessageIDs.TELEPORT_REQUEST,
    frequency: 'Low',
    messageNumber: 62,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportLocationRequest',
    wireId: MessageIDs.TELEPORT_LOCATION_REQUEST,
    frequency: 'Low',
    messageNumber: 63,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportLocal',
    wireId: MessageIDs.TELEPORT_LOCAL,
    frequency: 'Low',
    messageNumber: 64,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportLandmarkRequest',
    wireId: MessageIDs.TELEPORT_LANDMARK_REQUEST,
    frequency: 'Low',
    messageNumber: 65,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'TeleportProgress',
    wireId: MessageIDs.TELEPORT_PROGRESS,
    frequency: 'Low',
    messageNumber: 66,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportFinish',
    wireId: MessageIDs.TELEPORT_FINISH,
    frequency: 'Low',
    messageNumber: 69,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: ['UDPBlackListed'],
  },
  {
    name: 'StartLure',
    wireId: MessageIDs.START_LURE,
    frequency: 'Low',
    messageNumber: 70,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportLureRequest',
    wireId: MessageIDs.TELEPORT_LURE_REQUEST,
    frequency: 'Low',
    messageNumber: 71,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportCancel',
    wireId: MessageIDs.TELEPORT_CANCEL,
    frequency: 'Low',
    messageNumber: 72,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportStart',
    wireId: MessageIDs.TELEPORT_START,
    frequency: 'Low',
    messageNumber: 73,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TeleportFailed',
    wireId: MessageIDs.TELEPORT_FAILED,
    frequency: 'Low',
    messageNumber: 74,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ChatFromViewer',
    wireId: MessageIDs.CHAT_FROM_VIEWER,
    frequency: 'Low',
    messageNumber: 80,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'AgentThrottle',
    wireId: MessageIDs.AGENT_THROTTLE,
    frequency: 'Low',
    messageNumber: 81,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectShape',
    wireId: MessageIDs.OBJECT_SHAPE,
    frequency: 'Low',
    messageNumber: 98,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectSelect',
    wireId: MessageIDs.OBJECT_SELECT,
    frequency: 'Low',
    messageNumber: 110,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectDeselect',
    wireId: MessageIDs.OBJECT_DESELECT,
    frequency: 'Low',
    messageNumber: 111,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectLink',
    wireId: MessageIDs.OBJECT_LINK,
    frequency: 'Low',
    messageNumber: 115,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ObjectDelink',
    wireId: MessageIDs.OBJECT_DELINK,
    frequency: 'Low',
    messageNumber: 116,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ObjectGrab',
    wireId: MessageIDs.OBJECT_GRAB,
    frequency: 'Low',
    messageNumber: 117,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectGrabUpdate',
    wireId: MessageIDs.OBJECT_GRAB_UPDATE,
    frequency: 'Low',
    messageNumber: 118,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ObjectDeGrab',
    wireId: MessageIDs.OBJECT_DE_GRAB,
    frequency: 'Low',
    messageNumber: 119,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ChatFromSimulator',
    wireId: MessageIDs.CHAT_FROM_SIMULATOR,
    frequency: 'Low',
    messageNumber: 139,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'RegionHandshake',
    wireId: MessageIDs.REGION_HANDSHAKE,
    frequency: 'Low',
    messageNumber: 148,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'RegionHandshakeReply',
    wireId: MessageIDs.REGION_HANDSHAKE_REPLY,
    frequency: 'Low',
    messageNumber: 149,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'RequestPayPrice',
    wireId: MessageIDs.REQUEST_PAY_PRICE,
    frequency: 'Low',
    messageNumber: 161,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'PayPriceReply',
    wireId: MessageIDs.PAY_PRICE_REPLY,
    frequency: 'Low',
    messageNumber: 162,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'KickUser',
    wireId: MessageIDs.KICK_USER,
    frequency: 'Low',
    messageNumber: 163,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AvatarPropertiesRequest',
    wireId: MessageIDs.AVATAR_PROPERTIES_REQUEST,
    frequency: 'Low',
    messageNumber: 169,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AvatarPropertiesReply',
    wireId: MessageIDs.AVATAR_PROPERTIES_REPLY,
    frequency: 'Low',
    messageNumber: 171,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ParcelPropertiesUpdate',
    wireId: MessageIDs.PARCEL_PROPERTIES_UPDATE,
    frequency: 'Low',
    messageNumber: 198,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ParcelBuyPass',
    wireId: MessageIDs.PARCEL_BUY_PASS,
    frequency: 'Low',
    messageNumber: 206,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelReclaim',
    wireId: MessageIDs.PARCEL_RECLAIM,
    frequency: 'Low',
    messageNumber: 208,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelDivide',
    wireId: MessageIDs.PARCEL_DIVIDE,
    frequency: 'Low',
    messageNumber: 211,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelBuy',
    wireId: MessageIDs.PARCEL_BUY,
    frequency: 'Low',
    messageNumber: 213,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'UUIDNameRequest',
    wireId: MessageIDs.UUID_NAME_REQUEST,
    frequency: 'Low',
    messageNumber: 235,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'UUIDNameReply',
    wireId: MessageIDs.UUID_NAME_REPLY,
    frequency: 'Low',
    messageNumber: 236,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'CompleteAgentMovement',
    wireId: MessageIDs.COMPLETE_AGENT_MOVEMENT,
    frequency: 'Low',
    messageNumber: 249,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'AgentMovementComplete',
    wireId: MessageIDs.AGENT_MOVEMENT_COMPLETE,
    frequency: 'Low',
    messageNumber: 250,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'LogoutRequest',
    wireId: MessageIDs.LOGOUT_REQUEST,
    frequency: 'Low',
    messageNumber: 252,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'LogoutReply',
    wireId: MessageIDs.LOGOUT_REPLY,
    frequency: 'Low',
    messageNumber: 253,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'ImprovedInstantMessage',
    wireId: MessageIDs.IMPROVED_INSTANT_MESSAGE,
    frequency: 'Low',
    messageNumber: 254,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'DeRezObject',
    wireId: MessageIDs.DE_REZ_OBJECT,
    frequency: 'Low',
    messageNumber: 291,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'AcceptFriendship',
    wireId: MessageIDs.ACCEPT_FRIENDSHIP,
    frequency: 'Low',
    messageNumber: 297,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'DeclineFriendship',
    wireId: MessageIDs.DECLINE_FRIENDSHIP,
    frequency: 'Low',
    messageNumber: 298,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'TerminateFriendship',
    wireId: MessageIDs.TERMINATE_FRIENDSHIP,
    frequency: 'Low',
    messageNumber: 300,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'RegionHandleRequest',
    wireId: MessageIDs.REGION_HANDLE_REQUEST,
    frequency: 'Low',
    messageNumber: 309,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'MoneyTransferRequest',
    wireId: MessageIDs.MONEY_TRANSFER_REQUEST,
    frequency: 'Low',
    messageNumber: 311,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'MoneyBalanceRequest',
    wireId: MessageIDs.MONEY_BALANCE_REQUEST,
    frequency: 'Low',
    messageNumber: 313,
    trust: 'NotTrusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'MoneyBalanceReply',
    wireId: MessageIDs.MONEY_BALANCE_REPLY,
    frequency: 'Low',
    messageNumber: 314,
    trust: 'Trusted',
    encoding: 'Zerocoded',
    flags: [],
  },
  {
    name: 'GrantUserRights',
    wireId: MessageIDs.GRANT_USER_RIGHTS,
    frequency: 'Low',
    messageNumber: 320,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'OnlineNotification',
    wireId: MessageIDs.ONLINE_NOTIFICATION,
    frequency: 'Low',
    messageNumber: 322,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'OfflineNotification',
    wireId: MessageIDs.OFFLINE_NOTIFICATION,
    frequency: 'Low',
    messageNumber: 323,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'MapNameRequest',
    wireId: MessageIDs.MAP_NAME_REQUEST,
    frequency: 'Low',
    messageNumber: 408,
    trust: 'NotTrusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'MapBlockReply',
    wireId: MessageIDs.MAP_BLOCK_REPLY,
    frequency: 'Low',
    messageNumber: 409,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelMediaCommandMessage',
    wireId: MessageIDs.PARCEL_MEDIA_COMMAND_MESSAGE,
    frequency: 'Low',
    messageNumber: 419,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
  {
    name: 'ParcelMediaUpdate',
    wireId: MessageIDs.PARCEL_MEDIA_UPDATE,
    frequency: 'Low',
    messageNumber: 420,
    trust: 'Trusted',
    encoding: 'Unencoded',
    flags: [],
  },
];

export const MESSAGE_TEMPLATE_METADATA: ReadonlyMap<number, MessageTemplateMetadata> = new Map(
  RAW_MESSAGE_TEMPLATE_ENTRIES.map((entry) => [
    entry.wireId >>> 0,
    {
      ...entry,
      wireId: entry.wireId >>> 0,
      viewerOutboundEligible:
        entry.trust === 'NotTrusted' && !entry.flags.includes('UDPBlackListed'),
    },
  ]),
);

const MESSAGE_METADATA_BY_NAME: ReadonlyMap<string, MessageTemplateMetadata> = new Map([
  ...Array.from(MESSAGE_TEMPLATE_METADATA.values()).map(
    (entry) => [entry.name.toLowerCase(), entry] as const,
  ),
  ['declineteleport', MESSAGE_TEMPLATE_METADATA.get(MessageIDs.TELEPORT_CANCEL)!],
  ['parcelsubdivide', MESSAGE_TEMPLATE_METADATA.get(MessageIDs.PARCEL_DIVIDE)!],
  ['improvedim', MESSAGE_TEMPLATE_METADATA.get(MessageIDs.IMPROVED_INSTANT_MESSAGE)!],
]);

/** Look up canonical master-message-template metadata by wire message ID. */
export function getMessageMetadata(messageId: number): MessageTemplateMetadata | undefined {
  if (!Number.isInteger(messageId)) return undefined;
  return MESSAGE_TEMPLATE_METADATA.get(messageId >>> 0);
}

/** Look up canonical master-message-template metadata by message name (case-insensitive). */
export function getMessageMetadataByName(name: string): MessageTemplateMetadata | undefined {
  if (typeof name !== 'string' || !name.trim()) return undefined;
  return MESSAGE_METADATA_BY_NAME.get(name.trim().toLowerCase());
}

/** Check whether a numeric wire message ID is syntactically well-formed and registered. */
export function isValidMessageId(messageId: number): boolean {
  if (!Number.isInteger(messageId) || messageId <= 0 || messageId > 0xffffffff) {
    return false;
  }
  return MESSAGE_TEMPLATE_METADATA.has(messageId >>> 0);
}

/**
 * Check whether a viewer is permitted to transmit a UDP message ID under
 * `secondlife/master-message-template` and `TPV_COMPLIANCE.md` §5:
 * outbound viewer packets must be registered, `NotTrusted`, and not `UDPBlackListed`.
 */
export function isViewerOutboundEligible(messageId: number): boolean {
  const meta = getMessageMetadata(messageId);
  return Boolean(meta && meta.viewerOutboundEligible);
}

/** Encode a canonical wire message ID into its big-endian 1-, 2-, or 4-byte UDP header representation. */
export function encodeWireMessageIdBytes(messageId: number): Uint8Array {
  if (!Number.isInteger(messageId) || messageId <= 0 || messageId > 0xffffffff) {
    throw new RangeError(`Invalid UDP wire message ID: ${messageId}`);
  }
  const id = messageId >>> 0;
  if (id >>> 8 === 0xffffff) {
    return new Uint8Array([0xff, 0xff, 0xff, id & 0xff]);
  }
  if (id >>> 16 === 0xffff) {
    return new Uint8Array([0xff, 0xff, (id >>> 8) & 0xff, id & 0xff]);
  }
  if (id >>> 8 === 0xff) {
    return new Uint8Array([0xff, id & 0xff]);
  }
  if (id <= 0xfe) {
    return new Uint8Array([id & 0xff]);
  }
  throw new RangeError(`Malformed frequency prefix in UDP wire message ID: 0x${id.toString(16)}`);
}

/** Decode a 1-, 2-, or 4-byte frequency-prefixed UDP message ID from a payload buffer. */
export function decodeWireMessageIdBytes(
  bytes: Uint8Array,
  offset: number = 0,
): { messageId: number; bytesRead: number } {
  if (offset < 0 || offset >= bytes.length) {
    throw new RangeError('Truncated UDP message number');
  }
  const b0 = bytes[offset];
  if (b0 !== 0xff) {
    return { messageId: b0 >>> 0, bytesRead: 1 };
  }
  if (offset + 1 >= bytes.length) {
    throw new RangeError('Truncated Medium/Low/Fixed UDP message number');
  }
  const b1 = bytes[offset + 1];
  if (b1 !== 0xff) {
    return { messageId: mediumFrequencyId(b1), bytesRead: 2 };
  }
  if (offset + 3 >= bytes.length) {
    throw new RangeError('Truncated Low/Fixed UDP message number');
  }
  const b2 = bytes[offset + 2];
  const b3 = bytes[offset + 3];
  if (b2 === 0xff) {
    return { messageId: fixedFrequencyId(b3), bytesRead: 4 };
  }
  return { messageId: lowFrequencyId((b2 << 8) | b3), bytesRead: 4 };
}

/**
 * Validate an outbound viewer UDP packet against `secondlife/master-message-template`
 * and `TPV_COMPLIANCE.md` §5 (`NotTrusted` viewer eligibility, valid message ID, and non-blacklisted UDP transport).
 */
export function validateOutboundViewerPacket(
  packetOrMessageId:
    | number
    | {
        messageId: number;
        messageName?: string;
        payload?: Uint8Array;
      },
): OutboundPacketValidationResult {
  const rawId =
    typeof packetOrMessageId === 'number' ? packetOrMessageId : packetOrMessageId?.messageId;
  const expectedName =
    typeof packetOrMessageId === 'object' && packetOrMessageId !== null
      ? packetOrMessageId.messageName
      : undefined;

  if (typeof rawId !== 'number' || !Number.isInteger(rawId) || rawId <= 0 || rawId > 0xffffffff) {
    return {
      valid: false,
      messageId: Number.isFinite(Number(rawId)) ? Number(rawId) : 0,
      reason: 'invalid_message_id',
      error: `Invalid UDP wire message ID: ${String(rawId)}`,
    };
  }

  const normalizedId = rawId >>> 0;
  const metadata = MESSAGE_TEMPLATE_METADATA.get(normalizedId);
  if (!metadata) {
    return {
      valid: false,
      messageId: normalizedId,
      reason: 'unknown_message_id',
      error: `Unknown Second Life UDP message ID: 0x${normalizedId.toString(16)}`,
    };
  }

  if (expectedName && expectedName.trim()) {
    const resolvedByName = getMessageMetadataByName(expectedName);
    if (!resolvedByName || resolvedByName.wireId !== normalizedId) {
      return {
        valid: false,
        messageId: normalizedId,
        metadata,
        reason: 'message_name_mismatch',
        error: `Message name "${expectedName}" does not match wire ID 0x${normalizedId.toString(16)} (${metadata.name})`,
      };
    }
  }

  if (metadata.trust === 'Trusted') {
    return {
      valid: false,
      messageId: normalizedId,
      metadata,
      reason: 'trusted_simulator_only',
      error: `Message ${metadata.name} (0x${normalizedId.toString(16)}) is simulator-Trusted and ineligible for viewer transmission (TPV_COMPLIANCE.md §5)`,
    };
  }

  if (metadata.flags.includes('UDPBlackListed')) {
    return {
      valid: false,
      messageId: normalizedId,
      metadata,
      reason: 'udp_blacklisted',
      error: `Message ${metadata.name} (0x${normalizedId.toString(16)}) is UDPBlackListed in master-message-template`,
    };
  }

  return {
    valid: true,
    messageId: normalizedId,
    metadata,
  };
}

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
