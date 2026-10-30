/**
 * Linkpoint Directory Search Subsystem
 *
 * Implements packet serialization for DirEventsQuery and DirClassifiedQuery,
 * input string sanitization, and parsing of DirEventsReply and DirClassifiedReply
 * packet payloads into structured UI models.
 */

import { UUID, Utils, MessageFlags } from '@caspertech/node-metaverse';
import { DirFindFlags } from '@caspertech/node-metaverse/dist/lib/enums/DirFindFlags';

// Low-frequency message opcode for DirEventsQuery in Second Life UDP protocol
export const MESSAGE_DIR_EVENTS_QUERY = 4294901822; // 0xFFFF003E

export interface DirEventsQueryOptions {
  agentId?: UUID | string;
  sessionId?: UUID | string;
  queryId?: UUID | string;
  queryText: string;
  queryFlags?: number;
  category?: number;
  dateText?: string;
  queryStart?: number;
}

export interface EventUIModel {
  id: string;
  eventId: number;
  ownerId: string;
  name: string;
  date: string;
  unixTime: number;
  eventFlags: number;
  type: 'events';
}

export interface ClassifiedUIModel {
  id: string;
  classifiedId: string;
  name: string;
  price: number;
  creationDate: number;
  expirationDate: number;
  classifiedFlags: number;
  type: 'classifieds';
}

/**
 * Sanitizes input query string before encoding to prevent invalid byte or control character sequences.
 */
export function sanitizeQueryString(input: string): string {
  if (!input) return '';
  // Remove control chars (0x00-0x1F except tab/LF, 0x7F), replace null bytes, trim whitespace
  const sanitized = String(input)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim();
  // Max 255 chars for Variable 1 encoding
  return sanitized.slice(0, 255);
}

/**
 * DirEventsQueryMessage class implementing node-metaverse MessageBase interface.
 */
export class DirEventsQueryMessage {
  name = 'DirEventsQuery';
  messageFlags = MessageFlags.FrequencyLow; // 20
  id = MESSAGE_DIR_EVENTS_QUERY;

  AgentData: {
    AgentID: UUID;
    SessionID: UUID;
  };
  QueryData: {
    QueryID: UUID;
    SearchText: Buffer;
    QueryFlags: number;
    Category: number;
    DateText: Buffer;
    QueryStart: number;
  };

  constructor(options?: DirEventsQueryOptions) {
    const agentUuid = options?.agentId
      ? typeof options.agentId === 'string'
        ? new UUID(options.agentId)
        : options.agentId
      : UUID.zero();
    const sessionUuid = options?.sessionId
      ? typeof options.sessionId === 'string'
        ? new UUID(options.sessionId)
        : options.sessionId
      : UUID.zero();
    const queryUuid = options?.queryId
      ? typeof options.queryId === 'string'
        ? new UUID(options.queryId)
        : options.queryId
      : UUID.random();

    const sanitizedText = sanitizeQueryString(options?.queryText || '');
    const dateTextStr = options?.dateText ?? 'u';

    const searchTextBuf = Utils.StringToBuffer(sanitizedText).subarray(0, 255);
    const dateTextBuf = Utils.StringToBuffer(dateTextStr).subarray(0, 255);

    this.AgentData = {
      AgentID: agentUuid,
      SessionID: sessionUuid,
    };

    this.QueryData = {
      QueryID: queryUuid,
      SearchText: searchTextBuf,
      QueryFlags:
        options?.queryFlags ??
        DirFindFlags.IncludePG | DirFindFlags.IncludeMature | DirFindFlags.IncludeAdult,
      Category: options?.category ?? 0,
      DateText: dateTextBuf,
      QueryStart: options?.queryStart ?? 0,
    };
  }

  getSize(): number {
    // AgentData: AgentID (16) + SessionID (16) = 32 bytes
    // QueryData: QueryID (16) + SearchText length (1) + SearchText bytes + QueryFlags (4) + Category (4) + DateText length (1) + DateText bytes + QueryStart (4)
    return 62 + this.QueryData.SearchText.length + this.QueryData.DateText.length;
  }

  writeToBuffer(buf: Buffer, pos: number): number {
    const startPos = pos;
    this.AgentData.AgentID.writeToBuffer(buf, pos);
    pos += 16;
    this.AgentData.SessionID.writeToBuffer(buf, pos);
    pos += 16;
    this.QueryData.QueryID.writeToBuffer(buf, pos);
    pos += 16;

    buf.writeUInt8(this.QueryData.SearchText.length, pos++);
    this.QueryData.SearchText.copy(buf, pos);
    pos += this.QueryData.SearchText.length;

    buf.writeUInt32LE(this.QueryData.QueryFlags, pos);
    pos += 4;
    buf.writeUInt32LE(this.QueryData.Category, pos);
    pos += 4;

    buf.writeUInt8(this.QueryData.DateText.length, pos++);
    this.QueryData.DateText.copy(buf, pos);
    pos += this.QueryData.DateText.length;

    buf.writeInt32LE(this.QueryData.QueryStart, pos);
    pos += 4;

    return pos - startPos;
  }
}

/**
 * Serializes a DirEventsQuery message into a raw Buffer UDP packet payload.
 */
export function serializeDirEventsQuery(options: DirEventsQueryOptions): Buffer {
  const msg = new DirEventsQueryMessage(options);
  const size = msg.getSize();
  const buf = Buffer.allocUnsafe(size);
  msg.writeToBuffer(buf, 0);
  return buf;
}

/**
 * Parses DirEventsReply message or raw object into structured EventUIModel list.
 */
export function parseDirEventsReply(reply: any): EventUIModel[] {
  if (!reply) return [];
  const results: EventUIModel[] = [];
  const queryReplies = reply.QueryReplies || reply.queryReplies || [];
  for (const ev of queryReplies) {
    const eventId = ev.EventID ?? ev.eventId ?? 0;
    const nameBuf = ev.Name ?? ev.name;
    const nameStr = Buffer.isBuffer(nameBuf)
      ? Utils.BufferToStringSimple(nameBuf)
      : typeof nameBuf === 'string'
        ? nameBuf
        : '';
    const dateBuf = ev.Date ?? ev.date;
    const dateStr = Buffer.isBuffer(dateBuf)
      ? Utils.BufferToStringSimple(dateBuf)
      : typeof dateBuf === 'string'
        ? dateBuf
        : '';
    const ownerId = ev.OwnerID?.toString?.() || ev.ownerId || '';
    const unixTime = Number(ev.UnixTime ?? ev.unixTime) || 0;
    const eventFlags = Number(ev.EventFlags ?? ev.eventFlags) || 0;

    results.push({
      id: String(
        eventId || globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2),
      ),
      eventId,
      ownerId,
      name: nameStr,
      date: dateStr,
      unixTime,
      eventFlags,
      type: 'events',
    });
  }
  return results;
}

/**
 * Parses raw DirEventsReply UDP packet payload bytes directly into EventUIModel list.
 */
export function parseDirEventsReplyBuffer(buf: Buffer | Uint8Array, startPos = 0): EventUIModel[] {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  let pos = startPos;
  if (b.length < pos + 33) return [];

  // Skip AgentData.AgentID (16) + QueryData.QueryID (16) = 32 bytes
  pos += 32;

  const count = b.readUInt8(pos++);
  const results: EventUIModel[] = [];

  for (let i = 0; i < count; i++) {
    if (pos + 16 > b.length) break;
    const ownerId = new UUID(b, pos).toString();
    pos += 16;

    if (pos >= b.length) break;
    const nameLen = b.readUInt8(pos++);
    if (pos + nameLen > b.length) break;
    const name = Utils.BufferToStringSimple(b.subarray(pos, pos + nameLen));
    pos += nameLen;

    if (pos + 4 > b.length) break;
    const eventId = b.readUInt32LE(pos);
    pos += 4;

    if (pos >= b.length) break;
    const dateLen = b.readUInt8(pos++);
    if (pos + dateLen > b.length) break;
    const date = Utils.BufferToStringSimple(b.subarray(pos, pos + dateLen));
    pos += dateLen;

    if (pos + 8 > b.length) break;
    const unixTime = b.readUInt32LE(pos);
    pos += 4;

    const eventFlags = b.readUInt32LE(pos);
    pos += 4;

    results.push({
      id: String(eventId),
      eventId,
      ownerId,
      name,
      date,
      unixTime,
      eventFlags,
      type: 'events',
    });
  }

  return results;
}

/**
 * Parses DirClassifiedReply message or raw object into structured ClassifiedUIModel list.
 */
export function parseDirClassifiedReply(reply: any): ClassifiedUIModel[] {
  if (!reply) return [];
  const results: ClassifiedUIModel[] = [];
  const queryReplies = reply.QueryReplies || reply.queryReplies || [];
  for (const cls of queryReplies) {
    const classifiedId =
      cls.ClassifiedID?.toString?.() ||
      cls.classifiedId ||
      globalThis.crypto?.randomUUID?.() ||
      Math.random().toString(36).slice(2);
    const nameBuf = cls.Name ?? cls.name;
    const nameStr = Buffer.isBuffer(nameBuf)
      ? Utils.BufferToStringSimple(nameBuf)
      : typeof nameBuf === 'string'
        ? nameBuf
        : '';

    results.push({
      id: classifiedId,
      classifiedId,
      name: nameStr,
      price: Number(cls.PriceForListing ?? cls.price) || 0,
      creationDate: Number(cls.CreationDate ?? cls.creationDate) || 0,
      expirationDate: Number(cls.ExpirationDate ?? cls.expirationDate) || 0,
      classifiedFlags: Number(cls.ClassifiedFlags ?? cls.classifiedFlags) || 0,
      type: 'classifieds',
    });
  }
  return results;
}
