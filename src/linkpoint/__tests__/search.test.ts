import { describe, it, expect } from 'vitest';
import { UUID, Utils } from '@caspertech/node-metaverse';
import {
  DirEventsQueryMessage,
  serializeDirEventsQuery,
  sanitizeQueryString,
  parseDirEventsReply,
  parseDirEventsReplyBuffer,
  parseDirClassifiedReply,
  MESSAGE_DIR_EVENTS_QUERY,
} from '../search';

describe('DirEventsQuery and Search Subsystem', () => {
  describe('sanitizeQueryString', () => {
    it('returns empty string for falsy input', () => {
      expect(sanitizeQueryString('')).toBe('');
      expect(sanitizeQueryString(null as any)).toBe('');
      expect(sanitizeQueryString(undefined as any)).toBe('');
    });

    it('strips control characters and null bytes', () => {
      const raw = '\x00\x01\x02Live Jazz\x07\x1F\x7F Night';
      expect(sanitizeQueryString(raw)).toBe('Live Jazz Night');
    });

    it('trims leading and trailing whitespace', () => {
      expect(sanitizeQueryString('   Dance Party   ')).toBe('Dance Party');
    });

    it('truncates queries longer than 255 characters', () => {
      const longQuery = 'A'.repeat(300);
      const sanitized = sanitizeQueryString(longQuery);
      expect(sanitized.length).toBe(255);
      expect(sanitized).toBe('A'.repeat(255));
    });
  });

  describe('DirEventsQueryMessage Packet Serialization', () => {
    it('instantiates message with correct defaults and packet ID', () => {
      const msg = new DirEventsQueryMessage({
        agentId: '11111111-1111-1111-1111-111111111111',
        sessionId: '22222222-2222-2222-2222-222222222222',
        queryText: 'Music Festival',
      });

      expect(msg.name).toBe('DirEventsQuery');
      expect(msg.id).toBe(MESSAGE_DIR_EVENTS_QUERY);
      expect(msg.AgentData.AgentID.toString()).toBe('11111111-1111-1111-1111-111111111111');
      expect(msg.AgentData.SessionID.toString()).toBe('22222222-2222-2222-2222-222222222222');
      expect(Utils.BufferToStringSimple(msg.QueryData.SearchText)).toBe('Music Festival');
    });

    it('calculates correct byte size with getSize()', () => {
      const msg = new DirEventsQueryMessage({
        queryText: 'Live Concert',
        dateText: 'u',
      });

      // 62 base bytes + 13 ("Live Concert\0") + 2 ("u\0") = 77
      expect(msg.getSize()).toBe(77);
    });

    it('serializes packet payload correctly into buffer with writeToBuffer', () => {
      const agentId = '00000000-0000-0000-0000-000000000001';
      const sessionId = '00000000-0000-0000-0000-000000000002';
      const queryId = '00000000-0000-0000-0000-000000000003';
      const msg = new DirEventsQueryMessage({
        agentId,
        sessionId,
        queryId,
        queryText: 'Beach Party',
        category: 20, // Music
        dateText: 'u',
        queryStart: 0,
      });

      const buf = Buffer.alloc(msg.getSize());
      const written = msg.writeToBuffer(buf, 0);

      expect(written).toBe(msg.getSize());
      // AgentID at offset 0
      expect(new UUID(buf, 0).toString()).toBe(agentId);
      // SessionID at offset 16
      expect(new UUID(buf, 16).toString()).toBe(sessionId);
      // QueryID at offset 32
      expect(new UUID(buf, 32).toString()).toBe(queryId);

      // SearchText length at offset 48 ("Beach Party\0" = 12)
      const searchTextLen = buf.readUInt8(48);
      expect(searchTextLen).toBe(12);
      const searchText = Utils.BufferToStringSimple(buf.subarray(49, 49 + searchTextLen));
      expect(searchText).toBe('Beach Party');

      let pos = 49 + searchTextLen;
      const queryFlags = buf.readUInt32LE(pos);
      pos += 4;
      const category = buf.readUInt32LE(pos);
      pos += 4;
      expect(category).toBe(20);

      const dateTextLen = buf.readUInt8(pos++);
      const dateText = Utils.BufferToStringSimple(buf.subarray(pos, pos + dateTextLen));
      pos += dateTextLen;
      expect(dateText).toBe('u');

      const queryStart = buf.readInt32LE(pos);
      expect(queryStart).toBe(0);
    });

    it('serializeDirEventsQuery produces expected Buffer', () => {
      const buf = serializeDirEventsQuery({
        queryText: 'Art Expo',
        category: 26,
      });
      expect(Buffer.isBuffer(buf)).toBe(true);
      expect(buf.length).toBeGreaterThan(60);
    });
  });

  describe('DirEventsReply and DirClassifiedReply Parsers', () => {
    it('parses DirEventsReply object into EventUIModel list', () => {
      const mockReply = {
        QueryReplies: [
          {
            EventID: 5012,
            OwnerID: new UUID('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
            Name: Utils.StringToBuffer('Retro Arcade Night'),
            Date: Utils.StringToBuffer('10/21 19:00'),
            UnixTime: 1729537200,
            EventFlags: 1,
          },
        ],
      };

      const results = parseDirEventsReply(mockReply);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({
        id: '5012',
        eventId: 5012,
        ownerId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        name: 'Retro Arcade Night',
        date: '10/21 19:00',
        unixTime: 1729537200,
        eventFlags: 1,
        type: 'events',
      });
    });

    it('parses raw DirEventsReply UDP packet payload bytes directly', () => {
      // Construct raw binary payload
      const ownerUuid = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
      const nameStr = 'Synthwave DJ Set';
      const dateStr = '10/21 22:00';

      const buf = Buffer.alloc(200);
      let pos = 0;
      // AgentID (16) + QueryID (16)
      new UUID('00000000-0000-0000-0000-000000000001').writeToBuffer(buf, 0);
      new UUID('00000000-0000-0000-0000-000000000002').writeToBuffer(buf, 16);
      pos = 32;

      // Count = 1
      buf.writeUInt8(1, pos++);

      // OwnerID
      new UUID(ownerUuid).writeToBuffer(buf, pos);
      pos += 16;

      // Name (var length)
      buf.writeUInt8(nameStr.length, pos++);
      buf.write(nameStr, pos);
      pos += nameStr.length;

      // EventID (u32 LE)
      buf.writeUInt32LE(8819, pos);
      pos += 4;

      // Date (var length)
      buf.writeUInt8(dateStr.length, pos++);
      buf.write(dateStr, pos);
      pos += dateStr.length;

      // UnixTime (u32 LE)
      buf.writeUInt32LE(1729548000, pos);
      pos += 4;

      // EventFlags (u32 LE)
      buf.writeUInt32LE(0, pos);
      pos += 4;

      const results = parseDirEventsReplyBuffer(buf);
      expect(results.length).toBe(1);
      expect(results[0].id).toBe('8819');
      expect(results[0].name).toBe(nameStr);
      expect(results[0].date).toBe(dateStr);
      expect(results[0].ownerId).toBe(ownerUuid);
      expect(results[0].type).toBe('events');
    });

    it('parses DirClassifiedReply object into ClassifiedUIModel list', () => {
      const mockReply = {
        QueryReplies: [
          {
            ClassifiedID: new UUID('cccccccc-cccc-cccc-cccc-cccccccccccc'),
            Name: Utils.StringToBuffer('Luxury Sky Condo Sale'),
            PriceForListing: 5000,
            CreationDate: 1729000000,
            ExpirationDate: 1730000000,
            ClassifiedFlags: 0,
          },
        ],
      };

      const results = parseDirClassifiedReply(mockReply);
      expect(results.length).toBe(1);
      expect(results[0]).toEqual({
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        classifiedId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        name: 'Luxury Sky Condo Sale',
        price: 5000,
        creationDate: 1729000000,
        expirationDate: 1730000000,
        classifiedFlags: 0,
        type: 'classifieds',
      });
    });
  });
});
