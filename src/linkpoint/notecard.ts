/**
 * Linkpoint - Linden Text Notecard Parser & Serializer
 *
 * Implements decoding, encoding, and validation of Second Life Linden text format assets (versions 1 & 2)
 * for embedded inventory notecard editing in parity with Firestorm floater_preview_notecard.
 */

export const MAX_NOTECARD_BYTES = 65536; // 64 KB Second Life notecard asset size limit

export interface DecodedNotecard {
  version: number;
  body: string;
  hasEmbeddedItems: boolean;
  embeddedItemsCount: number;
}

export interface ValidationResult {
  valid: boolean;
  byteLength: number;
  error?: string;
}

/**
 * Validates whether text fits within Second Life notecard limits (64KB max).
 */
export function validateNotecardLength(
  text: string,
  maxBytes: number = MAX_NOTECARD_BYTES,
): ValidationResult {
  const normalized = typeof text === 'string' ? text : String(text || '');
  const byteLength = new TextEncoder().encode(normalized).length;

  if (byteLength > maxBytes) {
    return {
      valid: false,
      byteLength,
      error: `Notecard exceeds maximum size of ${Math.round(maxBytes / 1024)}KB (${maxBytes.toLocaleString()} bytes). Current size: ${byteLength.toLocaleString()} bytes.`,
    };
  }

  return {
    valid: true,
    byteLength,
  };
}

/**
 * Parses full Linden Text asset data into a structured representation.
 * If input is raw plain text without Linden Text headers, gracefully wraps it.
 */
export function parseLindenText(
  data: string | Uint8Array | ArrayBuffer | null | undefined,
): DecodedNotecard {
  if (data === null || data === undefined) {
    return {
      version: 2,
      body: '',
      hasEmbeddedItems: false,
      embeddedItemsCount: 0,
    };
  }

  let raw: string;
  if (typeof data === 'string') {
    raw = data;
  } else if (data instanceof Uint8Array) {
    raw = new TextDecoder('utf-8').decode(data);
  } else if (data instanceof ArrayBuffer) {
    raw = new TextDecoder('utf-8').decode(new Uint8Array(data));
  } else {
    raw = String(data);
  }

  // Check for Linden text header
  if (!raw.startsWith('Linden text version')) {
    return {
      version: 2,
      body: raw,
      hasEmbeddedItems: false,
      embeddedItemsCount: 0,
    };
  }

  // Parse version
  const versionMatch = raw.match(/^Linden text version\s+(\d+)/m);
  const version = versionMatch ? parseInt(versionMatch[1], 10) : 2;

  // Embedded items check
  const hasEmbeddedItems = raw.includes('LLEmbeddedItems');
  let embeddedItemsCount = 0;
  if (hasEmbeddedItems) {
    const countMatch = raw.match(/LLEmbeddedItems[^{]*\{[^}]*count\s+(\d+)/s);
    if (countMatch) {
      embeddedItemsCount = parseInt(countMatch[1], 10);
    }
  }

  // Text length check
  const textLengthMatch = raw.match(/Text length\s+(\d+)/);
  if (!textLengthMatch) {
    // If no Text length header, extract content between outer braces
    const firstBrace = raw.indexOf('{');
    const lastBrace = raw.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return {
        version,
        body: raw.slice(firstBrace + 1, lastBrace).trim(),
        hasEmbeddedItems,
        embeddedItemsCount,
      };
    }
    return {
      version,
      body: raw,
      hasEmbeddedItems,
      embeddedItemsCount,
    };
  }

  const textLength = parseInt(textLengthMatch[1], 10);
  const textLengthIndex = raw.indexOf(textLengthMatch[0]);
  const afterLengthHeader = raw.slice(textLengthIndex + textLengthMatch[0].length);

  // Skip newline after "Text length <n>"
  const newlineMatch = afterLengthHeader.match(/^\r?\n/);
  const bodyStartOffset = newlineMatch ? newlineMatch[0].length : 0;
  const bodySlice = afterLengthHeader.slice(bodyStartOffset);

  // Extract body by UTF-8 byte length
  const encodedBodySlice = new TextEncoder().encode(bodySlice);
  if (encodedBodySlice.length >= textLength) {
    const bodyBytes = encodedBodySlice.subarray(0, textLength);
    const body = new TextDecoder('utf-8').decode(bodyBytes);
    return {
      version,
      body,
      hasEmbeddedItems,
      embeddedItemsCount,
    };
  }

  // Fallback: strip closing brace if byte slice fell short
  let body = bodySlice;
  if (body.endsWith('}\n') || body.endsWith('}\r\n') || body.endsWith('}\0')) {
    body = body.slice(0, body.lastIndexOf('}'));
  } else if (body.endsWith('}')) {
    body = body.slice(0, -1);
  }

  return {
    version,
    body,
    hasEmbeddedItems,
    embeddedItemsCount,
  };
}

/**
 * Decodes Linden text format or plain text, returning the decoded body text string.
 */
export function decodeLindenText(
  data: string | Uint8Array | ArrayBuffer | null | undefined,
): string {
  return parseLindenText(data).body;
}

/**
 * Encodes plain text string into standard Second Life Linden text version 2 asset format.
 */
export function encodeLindenText(text: string, options?: { version?: number }): string {
  const version = options?.version ?? 2;
  const body = typeof text === 'string' ? text : String(text || '');
  const byteLength = new TextEncoder().encode(body).length;

  return [
    `Linden text version ${version}`,
    '{',
    'LLEmbeddedItems version 1',
    '{',
    'count 0',
    '}',
    `Text length ${byteLength}`,
    `${body}}`,
    '',
  ].join('\n');
}
