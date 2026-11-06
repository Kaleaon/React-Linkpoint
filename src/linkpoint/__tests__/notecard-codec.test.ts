import { describe, it, expect } from 'vitest';
import {
  decodeLindenText,
  encodeLindenText,
  encodeLindenTextBytes,
  isNotecardOversized,
  getUtf8ByteLength,
  MAX_NOTECARD_BYTES,
} from '../notecard';

describe('Linden Text Codec', () => {
  it('decodes Linden text version 1 payload with plain ASCII text', () => {
    const rawV1 = [
      'Linden text version 1',
      '{',
      'LLEmbeddedItems version 1',
      '{',
      'count 0',
      '}',
      'Text length 20',
      'Welcome to Agni Grid}',
    ].join('\n');

    const decoded = decodeLindenText(rawV1);
    expect(decoded.version).toBe(1);
    expect(decoded.text).toBe('Welcome to Agni Grid');
    expect(decoded.embeddedItemsCount).toBe(0);
    expect(decoded.hasEmbeddedItems).toBe(false);
  });

  it('decodes Linden text version 2 payload with UTF-8 characters and emojis', () => {
    const message = 'Hello Metaverse! 🌟 Special chars: é, ñ, ü, こんにちは';
    const textBytes = new TextEncoder().encode(message);
    const rawV2 = [
      'Linden text version 2',
      '{',
      'LLEmbeddedItems version 1',
      '{',
      'count 0',
      '}',
      `Text length ${textBytes.length}`,
      `${message}}`,
    ].join('\n');

    const decoded = decodeLindenText(rawV2);
    expect(decoded.version).toBe(2);
    expect(decoded.text).toBe(message);
    expect(decoded.embeddedItemsCount).toBe(0);
  });

  it('preserves embedded items headers and structure without corruption', () => {
    const embeddedBlock = [
      'LLEmbeddedItems version 1',
      '{',
      'count 1',
      '{',
      'ext char index 12',
      '\tinv_item\t0',
      '\t\titem_id\taaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      '\t\tparent_id\t11111111-2222-3333-4444-555555555555',
      '\t\tname\tTeleport Landmark|',
      '}',
      '}',
    ].join('\n');

    const rawNotecard = [
      'Linden text version 2',
      '{',
      embeddedBlock,
      'Text length 28',
      'Click landmark for teleport.}',
    ].join('\n');

    const decoded = decodeLindenText(rawNotecard);
    expect(decoded.version).toBe(2);
    expect(decoded.text).toBe('Click landmark for teleport.');
    expect(decoded.hasEmbeddedItems).toBe(true);
    expect(decoded.embeddedItemsCount).toBe(1);
    expect(decoded.embeddedItemsRaw).toBeDefined();

    // Re-encode and verify the embedded items are preserved
    const reEncoded = encodeLindenText({
      text: 'Click landmark for teleport. (Edited)',
      embeddedItemsRaw: decoded.embeddedItemsRaw,
      embeddedItemsCount: decoded.embeddedItemsCount,
    });

    expect(reEncoded).toContain('count 1');
    expect(reEncoded).toContain('ext char index 12');
    expect(reEncoded).toContain('item_id\taaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');

    // Decode re-encoded notecard
    const reDecoded = decodeLindenText(reEncoded);
    expect(reDecoded.text).toBe('Click landmark for teleport. (Edited)');
    expect(reDecoded.embeddedItemsCount).toBe(1);
  });

  it('encodes plain text into valid Linden text version 2 payload', () => {
    const text = 'Simple notecard body content.';
    const encoded = encodeLindenText(text);

    expect(encoded).toContain('Linden text version 2');
    expect(encoded).toContain('LLEmbeddedItems version 1');
    expect(encoded).toContain('count 0');
    expect(encoded).toContain(`Text length ${new TextEncoder().encode(text).length}`);
    expect(encoded).toContain(`${text}}`);

    const decoded = decodeLindenText(encoded);
    expect(decoded.version).toBe(2);
    expect(decoded.text).toBe(text);
  });

  it('handles CRLF line endings in input stream', () => {
    const text = 'Line 1\nLine 2';
    const textBytes = new TextEncoder().encode(text);
    const crlfPayload = `Linden text version 2\r\n{\r\nLLEmbeddedItems version 1\r\n{\r\ncount 0\r\n}\r\nText length ${textBytes.length}\r\n${text}}\r\n`;

    const decoded = decodeLindenText(crlfPayload);
    expect(decoded.version).toBe(2);
    expect(decoded.text).toBe(text);
  });

  it('throws descriptive error on malformed or empty inputs', () => {
    expect(() => decodeLindenText('')).toThrow(/empty/i);
    expect(() => decodeLindenText('Random non-notecard string')).toThrow(
      /Invalid Linden Text header/i,
    );
    expect(() => decodeLindenText('Linden text version 99\n{\n}')).toThrow(
      /Unsupported Linden Text version/i,
    );
    expect(() => decodeLindenText('Linden text version 2\nMissingBrace')).toThrow(
      /missing opening brace/i,
    );
  });

  it('correctly calculates size and identifies oversized payloads exceeding 65,536 bytes', () => {
    const smallText = 'Under limit';
    expect(isNotecardOversized(smallText)).toBe(false);

    const oversizedString = 'A'.repeat(MAX_NOTECARD_BYTES + 10);
    expect(isNotecardOversized(oversizedString)).toBe(true);
    expect(getUtf8ByteLength(oversizedString)).toBe(MAX_NOTECARD_BYTES + 10);

    const encodedBytes = encodeLindenTextBytes(oversizedString);
    expect(isNotecardOversized(encodedBytes)).toBe(true);
  });
});
