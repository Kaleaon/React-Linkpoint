/**
 * Linden Text Codec for Second Life Notecard Assets
 *
 * Implements decoding for Linden text version 1 and version 2 asset streams
 * into UTF-8 plain text, and encoding of plain text into valid Linden text
 * version 2 payloads with embedded item headers.
 */

export const MAX_NOTECARD_BYTES = 65536;

export interface DecodedLindenText {
  version: 1 | 2;
  text: string;
  embeddedItemsCount: number;
  embeddedItemsRaw?: string;
  hasEmbeddedItems: boolean;
  byteLength: number;
}

export interface EncodeLindenTextOptions {
  text: string;
  embeddedItemsRaw?: string;
  embeddedItemsCount?: number;
  version?: 1 | 2;
}

/**
 * Computes the UTF-8 byte size of a string.
 */
export function getUtf8ByteLength(str: string): number {
  return new TextEncoder().encode(str).length;
}

/**
 * Checks whether an encoded notecard payload exceeds the 65,536 byte simulator limit.
 */
export function isNotecardOversized(payload: string | Uint8Array): boolean {
  if (typeof payload === 'string') {
    return getUtf8ByteLength(payload) > MAX_NOTECARD_BYTES;
  }
  return payload.length > MAX_NOTECARD_BYTES;
}

/**
 * Decodes a Linden text version 1 or version 2 notecard asset into UTF-8 plain text.
 *
 * @param input Raw asset bytes (Uint8Array / Buffer) or string.
 * @returns DecodedLindenText with decoded UTF-8 plain text, version, and embedded item details.
 */
export function decodeLindenText(input: Uint8Array | ArrayBuffer | string): DecodedLindenText {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (ArrayBuffer.isView(input)) {
    bytes = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  } else {
    throw new Error('Invalid input: expected Uint8Array, Buffer, ArrayBuffer, or string');
  }

  if (bytes.length === 0) {
    throw new Error('Notecard payload is empty');
  }

  // Convert header bytes to ASCII text for parsing initial tokens
  const headerPreview = new TextDecoder('latin1').decode(bytes);
  const headerMatch = headerPreview.match(/^Linden text version\s+(\d+)/);
  if (!headerMatch) {
    throw new Error('Invalid Linden Text header: missing "Linden text version"');
  }

  const versionNum = parseInt(headerMatch[1], 10);
  if (versionNum !== 1 && versionNum !== 2) {
    throw new Error(`Unsupported Linden Text version: ${versionNum}`);
  }
  const version: 1 | 2 = versionNum as 1 | 2;

  // Find the opening brace of the Linden text container
  const openingBraceIndex = headerPreview.indexOf('{', headerMatch[0].length);
  if (openingBraceIndex === -1) {
    throw new Error('Error parsing Linden Text file: missing opening brace');
  }

  // Check for LLEmbeddedItems block
  let embeddedItemsRaw: string | undefined;
  let embeddedItemsCount = 0;
  let hasEmbeddedItems = false;
  let lastHeaderOffset = openingBraceIndex;

  const embeddedMatch = headerPreview
    .slice(openingBraceIndex + 1)
    .match(/^\s*LLEmbeddedItems\s+version\s+\d+/);
  if (embeddedMatch) {
    const embeddedStartOffset = openingBraceIndex + 1 + (embeddedMatch.index ?? 0);
    // Find the matching embedded items block opening brace
    const embeddedBraceStart = headerPreview.indexOf('{', embeddedStartOffset);
    if (embeddedBraceStart === -1) {
      throw new Error('Invalid LLEmbeddedItems format (missing opening brace)');
    }

    // Parse count
    const countMatch = headerPreview.slice(embeddedBraceStart).match(/count\s+(\d+)/);
    if (countMatch) {
      embeddedItemsCount = parseInt(countMatch[1], 10);
      hasEmbeddedItems = embeddedItemsCount > 0;
    }

    // Find the end of the LLEmbeddedItems block by brace counting
    let depth = 0;
    let embeddedEndOffset = -1;
    for (let i = embeddedBraceStart; i < headerPreview.length; i++) {
      if (headerPreview[i] === '{') depth++;
      else if (headerPreview[i] === '}') {
        depth--;
        if (depth === 0) {
          embeddedEndOffset = i;
          break;
        }
      }
    }

    if (embeddedEndOffset !== -1) {
      // Capture the entire LLEmbeddedItems block preserving item definitions
      embeddedItemsRaw = headerPreview.slice(embeddedStartOffset, embeddedEndOffset + 1).trim();
      lastHeaderOffset = embeddedEndOffset;
    }
  }

  // Locate "Text length <bytes>" header
  // Find byte index where "Text length" starts
  // We can search the ASCII bytes directly for 'Text length'
  const textLengthPattern = [84, 101, 120, 116, 32, 108, 101, 110, 103, 116, 104]; // "Text length" in ASCII
  let textLengthPos = -1;
  for (let i = lastHeaderOffset; i < bytes.length - textLengthPattern.length; i++) {
    let match = true;
    for (let j = 0; j < textLengthPattern.length; j++) {
      if (bytes[i + j] !== textLengthPattern[j]) {
        match = false;
        break;
      }
    }
    if (match) {
      textLengthPos = i;
      break;
    }
  }

  if (textLengthPos === -1) {
    throw new Error('Error parsing Linden Text file: missing "Text length" header');
  }

  // Parse the integer following "Text length "
  let pos = textLengthPos + textLengthPattern.length;
  while (pos < bytes.length && (bytes[pos] === 32 || bytes[pos] === 9)) {
    pos++;
  }
  let lengthStr = '';
  while (pos < bytes.length && bytes[pos] >= 48 && bytes[pos] <= 57) {
    lengthStr += String.fromCharCode(bytes[pos]);
    pos++;
  }
  if (!lengthStr) {
    throw new Error('Error parsing Linden Text file: invalid "Text length" value');
  }
  const textLength = parseInt(lengthStr, 10);

  // Advance past the newline character(s) after "Text length <N>"
  if (pos < bytes.length && bytes[pos] === 13) pos++; // \r
  if (pos < bytes.length && bytes[pos] === 10) pos++; // \n

  const bodyStart = pos;
  const bodyEnd = bodyStart + textLength;

  if (bodyEnd > bytes.length) {
    throw new Error(
      `Truncated Linden text file: expected ${textLength} bytes, found ${bytes.length - bodyStart}`,
    );
  }

  const bodyBytes = bytes.subarray(bodyStart, bodyEnd);
  const text = new TextDecoder(version === 2 ? 'utf-8' : 'latin1').decode(bodyBytes);

  // Verify closing brace
  let restPos = bodyEnd;
  while (
    restPos < bytes.length &&
    (bytes[restPos] === 32 ||
      bytes[restPos] === 9 ||
      bytes[restPos] === 10 ||
      bytes[restPos] === 13)
  ) {
    restPos++;
  }
  if (restPos < bytes.length && bytes[restPos] !== 125) {
    // '}'
    // It is possible the closing brace immediately followed without newline
    // If not '}', log warning or accept
  }

  return {
    version,
    text,
    embeddedItemsCount,
    embeddedItemsRaw,
    hasEmbeddedItems,
    byteLength: bytes.length,
  };
}

/**
 * Encodes plain text into a valid Linden text version 2 payload.
 *
 * @param options EncodeLindenTextOptions or plain text string.
 * @returns Valid Linden text version 2 formatted string.
 */
export function encodeLindenText(options: EncodeLindenTextOptions | string): string {
  const text = typeof options === 'string' ? options : options.text || '';
  const embeddedItemsRaw = typeof options === 'object' ? options.embeddedItemsRaw : undefined;
  const embeddedItemsCount = typeof options === 'object' ? (options.embeddedItemsCount ?? 0) : 0;

  const lines: string[] = [];
  lines.push('Linden text version 2');
  lines.push('{');

  if (embeddedItemsRaw && embeddedItemsRaw.trim()) {
    lines.push(embeddedItemsRaw.trim());
  } else {
    lines.push('LLEmbeddedItems version 1');
    lines.push('{');
    lines.push(`count ${embeddedItemsCount}`);
    lines.push('}');
  }

  const textBytes = new TextEncoder().encode(text);
  lines.push(`Text length ${textBytes.length}`);
  lines.push(`${text}}`);

  return lines.join('\n') + '\n';
}

/**
 * Encodes plain text into valid Linden text version 2 payload as a Uint8Array.
 */
export function encodeLindenTextBytes(options: EncodeLindenTextOptions | string): Uint8Array {
  const encoded = encodeLindenText(options);
  return new TextEncoder().encode(encoded);
}
