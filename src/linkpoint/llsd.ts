/**
 * Linkpoint PWA - LLSD (Linden Lab Structured Data) Parser/Builder
 *
 * Implements LLSD XML, Notation, and Binary codecs grounded in:
 * - https://github.com/secondlife/python-llsd (MIT)
 * - Linden Research LLSD Type System & Serialization Specification
 */

import { DOMParser as XmlDomParser } from '@xmldom/xmldom';

export type LLSDData =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | LLSDUUID
  | LLSDUndef
  | LLSDURI
  | LLSDBinary
  | LLSDData[]
  | { [key: string]: LLSDData | undefined };

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NIL_UUID = '00000000-0000-0000-0000-000000000000';
const MIN_INT32 = -2147483648;
const MAX_INT32 = 2147483647;

function encodeBase64Bytes(bytes: Uint8Array): string {
  let out = '';
  const len = bytes.length;
  let i = 0;
  while (i + 2 < len) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      BASE64_ALPHABET[(n >> 18) & 63] +
      BASE64_ALPHABET[(n >> 12) & 63] +
      BASE64_ALPHABET[(n >> 6) & 63] +
      BASE64_ALPHABET[n & 63];
    i += 3;
  }
  const rem = len - i;
  if (rem === 1) {
    const n = bytes[i] << 16;
    out += BASE64_ALPHABET[(n >> 18) & 63] + BASE64_ALPHABET[(n >> 12) & 63] + '==';
  } else if (rem === 2) {
    const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
    out +=
      BASE64_ALPHABET[(n >> 18) & 63] +
      BASE64_ALPHABET[(n >> 12) & 63] +
      BASE64_ALPHABET[(n >> 6) & 63] +
      '=';
  }
  return out;
}

function decodeBase64Bytes(input: string): Uint8Array {
  const cleaned = input.replace(/[\r\n\t ]+/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (cleaned.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error('Invalid base64 binary payload');
  }
  const pad = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;
  const outLen = (cleaned.length * 3) / 4 - pad;
  const out = new Uint8Array(outLen);
  let outIdx = 0;
  for (let i = 0; i < cleaned.length; i += 4) {
    const c0 = BASE64_ALPHABET.indexOf(cleaned[i]);
    const c1 = BASE64_ALPHABET.indexOf(cleaned[i + 1]);
    const c2 = cleaned[i + 2] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[i + 2]);
    const c3 = cleaned[i + 3] === '=' ? 0 : BASE64_ALPHABET.indexOf(cleaned[i + 3]);
    const triple = (c0 << 18) | (c1 << 12) | (c2 << 6) | c3;
    if (outIdx < outLen) out[outIdx++] = (triple >> 16) & 0xff;
    if (outIdx < outLen) out[outIdx++] = (triple >> 8) & 0xff;
    if (outIdx < outLen) out[outIdx++] = triple & 0xff;
  }
  return out;
}

function decodeBase16Bytes(input: string): Uint8Array {
  const cleaned = input.replace(/[\r\n\t ]+/g, '');
  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }
  if (cleaned.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(cleaned)) {
    throw new Error('Invalid base16 binary payload');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) {
    out[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  }
  return out;
}

function isNegativeZero(n: number): boolean {
  return n === 0 && 1 / n === -Infinity;
}

function parseLLSDRealToken(raw: string): number {
  const token = raw.trim();
  if (token === '' || token === '0' || token === '0.0' || token === '+Zero') {
    return 0.0;
  }
  if (token === '-0' || token === '-0.0' || token === '-Zero') {
    return -0.0;
  }
  const lower = token.toLowerCase();
  if (lower === 'inf' || lower === '+inf' || lower === 'infinity' || lower === '+infinity') {
    return Infinity;
  }
  if (lower === '-inf' || lower === '-infinity') {
    return -Infinity;
  }
  if (
    lower === 'nan' ||
    lower === '+nan' ||
    lower === '-nan' ||
    lower === 'nans' ||
    lower === 'nanq'
  ) {
    return NaN;
  }
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/.test(token)) {
    throw new Error(`Invalid LLSD real value: ${raw}`);
  }
  return Number(token);
}

function formatLLSDRealToken(value: number): string {
  if (Number.isNaN(value)) return 'nan';
  if (value === Infinity) return 'inf';
  if (value === -Infinity) return '-inf';
  if (isNegativeZero(value)) return '-0.0';
  return String(value);
}

function parseISODateStrict(raw: string): Date {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return new Date(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(trimmed)) {
    throw new Error(`Invalid LLSD ISO-8601 UTC date: ${raw}`);
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid LLSD date value: ${raw}`);
  }
  return parsed;
}

export class LLSDUUID {
  public type = 'uuid' as const;
  public value: string;

  constructor(uuid: string | LLSDUUID) {
    this.value = uuid instanceof LLSDUUID ? uuid.value : String(uuid || '');
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }
}

export class LLSDUndef {
  public type = 'undef' as const;
  public value = null;

  toString(): string {
    return '';
  }

  valueOf(): null {
    return null;
  }
}

export class LLSDURI {
  public type = 'uri' as const;
  public value: string;

  constructor(uri: string | LLSDURI) {
    this.value = uri instanceof LLSDURI ? uri.value : String(uri || '');
  }

  toString(): string {
    return this.value;
  }

  valueOf(): string {
    return this.value;
  }
}

export class LLSDBinary {
  public type = 'binary' as const;
  public value: Uint8Array | string;

  constructor(data: Uint8Array | string) {
    this.value = data;
  }

  toString(): string {
    if (typeof this.value === 'string') return this.value;
    return encodeBase64Bytes(this.value);
  }

  valueOf(): Uint8Array | string {
    return this.value;
  }
}

interface DomLikeNode {
  readonly nodeType: number;
  readonly nodeName?: string;
  readonly tagName?: string;
  readonly nodeValue?: string | null;
  readonly textContent?: string | null;
  readonly childNodes?: ArrayLike<DomLikeNode>;
  getAttribute?(name: string): string | null;
}

export class LLSD {
  /**
   * Parse LLSD XML string into JavaScript values per `secondlife/python-llsd`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static parseXML(xml: string): any {
    if (typeof xml !== 'string' || xml.trim() === '') {
      throw new Error('Invalid LLSD XML: empty input');
    }

    let rootDoc: {
      documentElement?: DomLikeNode | null;
      getElementsByTagName(name: string): ArrayLike<DomLikeNode>;
    };

    if (typeof DOMParser !== 'undefined') {
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        throw new Error(`XML Parse Error: ${parserErrors[0].textContent ?? 'malformed XML'}`);
      }
      rootDoc = doc as unknown as typeof rootDoc;
    } else {
      const parser = new XmlDomParser({
        onError: (level, msg) => {
          if (level !== 'warning') {
            throw new Error(`XML Parse Error (${level}): ${msg}`);
          }
        },
      });
      const doc = parser.parseFromString(xml, 'text/xml');
      const parserErrors = doc.getElementsByTagName('parsererror');
      if (parserErrors.length > 0) {
        throw new Error(`XML Parse Error: ${parserErrors[0].textContent ?? 'malformed XML'}`);
      }
      rootDoc = doc as unknown as typeof rootDoc;
    }

    const docElem = rootDoc.documentElement;
    if (!docElem || (docElem.tagName ?? docElem.nodeName ?? '').toLowerCase() !== 'llsd') {
      throw new Error('Invalid LLSD XML: missing <llsd> root element');
    }

    const elementChildren = this._elementChildren(docElem);
    if (elementChildren.length === 0) {
      return null;
    }
    if (elementChildren.length > 1) {
      throw new Error('Invalid LLSD XML: <llsd> root must contain at most one value element');
    }

    return this._parseElement(elementChildren[0]);
  }

  private static _elementChildren(node: DomLikeNode): DomLikeNode[] {
    const out: DomLikeNode[] = [];
    const childNodes = node.childNodes;
    if (!childNodes) return out;
    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i];
      if (child && child.nodeType === 1) {
        out.push(child);
      }
    }
    return out;
  }

  private static _rawText(node: DomLikeNode): string {
    const childNodes = node.childNodes;
    if (!childNodes || childNodes.length === 0) {
      return '';
    }
    let out = '';
    for (let i = 0; i < childNodes.length; i++) {
      const child = childNodes[i];
      if (!child) continue;
      if (child.nodeType === 3 || child.nodeType === 4) {
        out += child.nodeValue ?? '';
      } else if (child.nodeType === 1) {
        throw new Error(
          `Unexpected nested element <${child.tagName ?? child.nodeName}> inside scalar <${node.tagName ?? node.nodeName}>`,
        );
      }
    }
    return out;
  }

  private static _parseElement(element: DomLikeNode): LLSDData {
    const tagName = (element.tagName ?? element.nodeName ?? '').toLowerCase();

    switch (tagName) {
      case 'undef':
        return null;
      case 'boolean': {
        const token = this._rawText(element).trim().toLowerCase();
        if (token === '' || token === 'false' || token === '0') return false;
        if (token === 'true' || token === '1') return true;
        throw new Error(`Invalid LLSD boolean value: ${token}`);
      }
      case 'integer': {
        const token = this._rawText(element).trim();
        if (token === '') return 0;
        if (!/^[-+]?\d+$/.test(token)) {
          throw new Error(`Invalid LLSD integer value: ${token}`);
        }
        const parsed = Number(token);
        if (parsed > MAX_INT32) return MAX_INT32;
        if (parsed < MIN_INT32) return MIN_INT32;
        return parsed | 0;
      }
      case 'real':
        return parseLLSDRealToken(this._rawText(element));
      case 'string':
        // Preserve exact decoded text including leading/trailing whitespace & entities
        return this._rawText(element);
      case 'uuid': {
        const token = this._rawText(element).trim();
        if (token === '') return NIL_UUID;
        if (!UUID_REGEX.test(token)) {
          throw new Error(`Invalid LLSD UUID value: ${token}`);
        }
        return token.toLowerCase();
      }
      case 'date':
        return parseISODateStrict(this._rawText(element));
      case 'uri':
        return this._rawText(element).trim();
      case 'binary': {
        const raw = this._rawText(element);
        const encodingAttr = (element.getAttribute?.('encoding') ?? 'base64').trim().toLowerCase();
        if (encodingAttr === '' || encodingAttr === 'base64') {
          return decodeBase64Bytes(raw);
        }
        if (encodingAttr === 'base16') {
          return decodeBase16Bytes(raw);
        }
        throw new Error(`Unsupported LLSD binary encoding: ${encodingAttr}`);
      }
      case 'map':
        return this._parseMap(element);
      case 'array':
        return this._parseArray(element);
      default:
        throw new Error(`Unknown LLSD XML element: <${tagName}>`);
    }
  }

  private static _parseMap(mapElement: DomLikeNode): Record<string, LLSDData> {
    const result: Record<string, LLSDData> = {};
    const children = this._elementChildren(mapElement);
    let i = 0;
    while (i < children.length) {
      const keyElem = children[i];
      const keyTag = (keyElem.tagName ?? keyElem.nodeName ?? '').toLowerCase();
      if (keyTag !== 'key') {
        throw new Error(`Invalid LLSD <map>: expected <key>, got <${keyTag}>`);
      }
      if (i + 1 >= children.length) {
        throw new Error('Invalid LLSD <map>: trailing <key> without value element');
      }
      const key = this._rawText(keyElem);
      result[key] = this._parseElement(children[i + 1]);
      i += 2;
    }
    return result;
  }

  private static _parseArray(arrayElement: DomLikeNode): LLSDData[] {
    const children = this._elementChildren(arrayElement);
    return children.map((child) => this._parseElement(child));
  }

  /**
   * Build LLSD XML string from JavaScript value.
   */
  static buildXML(data: unknown): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<llsd>';
    xml += this._buildElement(data);
    xml += '</llsd>';
    return xml;
  }

  private static _buildElement(data: unknown): string {
    if (
      data === null ||
      data === undefined ||
      data instanceof LLSDUndef ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'undef')
    ) {
      return '<undef />';
    }

    if (
      data instanceof LLSDUUID ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uuid')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const val = rawVal !== undefined ? String(rawVal) : String(data);
      return `<uuid>${this._escapeXML(val)}</uuid>`;
    }

    if (
      data instanceof LLSDURI ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uri')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const val = rawVal !== undefined ? String(rawVal) : String(data);
      return `<uri>${this._escapeXML(val)}</uri>`;
    }

    if (data instanceof Uint8Array) {
      return `<binary>${encodeBase64Bytes(data)}</binary>`;
    }

    if (
      data instanceof LLSDBinary ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'binary')
    ) {
      const binVal = (data as { value?: unknown }).value;
      const encoded =
        typeof binVal === 'string'
          ? binVal
          : binVal instanceof Uint8Array
            ? encodeBase64Bytes(binVal)
            : '';
      return `<binary>${encoded}</binary>`;
    }

    if (typeof data === 'boolean') {
      return `<boolean>${data ? 'true' : 'false'}</boolean>`;
    }

    if (typeof data === 'number') {
      if (
        Number.isInteger(data) &&
        !isNegativeZero(data) &&
        data >= MIN_INT32 &&
        data <= MAX_INT32
      ) {
        return `<integer>${data}</integer>`;
      }
      return `<real>${formatLLSDRealToken(data)}</real>`;
    }

    if (typeof data === 'string') {
      return `<string>${this._escapeXML(data)}</string>`;
    }

    if (data instanceof Date) {
      return `<date>${data.toISOString()}</date>`;
    }

    if (Array.isArray(data)) {
      let xml = '<array>';
      for (const item of data) {
        xml += this._buildElement(item);
      }
      xml += '</array>';
      return xml;
    }

    if (typeof data === 'object') {
      const record = data as Record<string, unknown>;
      let xml = '<map>';
      for (const key of Object.keys(record)) {
        xml += `<key>${this._escapeXML(key)}</key>`;
        xml += this._buildElement(record[key]);
      }
      xml += '</map>';
      return xml;
    }

    return '<undef />';
  }

  /**
   * Parse LLSD Notation string (`secondlife/python-llsd` notation grammar).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static parseNotation(notation: string): any {
    if (typeof notation !== 'string') {
      throw new Error('LLSD notation input must be a string');
    }
    const bytes = new TextEncoder().encode(notation);
    let pos = 0;

    const skipWs = (): void => {
      while (pos < bytes.length) {
        const b = bytes[pos];
        if (b === 0x20 || b === 0x09 || b === 0x0a || b === 0x0d) {
          pos++;
        } else {
          break;
        }
      }
    };

    skipWs();
    // Optional <?llsd/notation?> or <? llsd/notation ?> header (case-insensitive)
    if (pos + 2 < bytes.length && bytes[pos] === 0x3c && bytes[pos + 1] === 0x3f) {
      let endHdr = pos + 2;
      while (endHdr + 1 < bytes.length) {
        if (bytes[endHdr] === 0x3f && bytes[endHdr + 1] === 0x3e) {
          break;
        }
        endHdr++;
      }
      if (endHdr + 1 >= bytes.length) {
        throw new Error('Unterminated LLSD notation header');
      }
      const hdrContent = new TextDecoder()
        .decode(bytes.subarray(pos + 2, endHdr))
        .trim()
        .toLowerCase();
      if (hdrContent !== 'llsd/notation') {
        throw new Error(`Unsupported LLSD header: <?${hdrContent}?>`);
      }
      pos = endHdr + 2;
      skipWs();
    }

    if (pos >= bytes.length) {
      throw new Error('Empty LLSD notation payload');
    }

    const readDelimitedEscapedString = (quoteByte: number): string => {
      pos++; // consume opening quote
      const outBytes: number[] = [];
      while (pos < bytes.length) {
        const b = bytes[pos++];
        if (b === quoteByte) {
          return new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(outBytes));
        }
        if (b === 0x5c) {
          if (pos >= bytes.length) {
            throw new Error('Unterminated escape sequence in LLSD notation string');
          }
          const esc = bytes[pos++];
          switch (esc) {
            case 0x61: // \a
              outBytes.push(0x07);
              break;
            case 0x62: // \b
              outBytes.push(0x08);
              break;
            case 0x66: // \f
              outBytes.push(0x0c);
              break;
            case 0x6e: // \n
              outBytes.push(0x0a);
              break;
            case 0x72: // \r
              outBytes.push(0x0d);
              break;
            case 0x74: // \t
              outBytes.push(0x09);
              break;
            case 0x76: // \v
              outBytes.push(0x0b);
              break;
            case 0x5c: // \\
              outBytes.push(0x5c);
              break;
            case 0x27: // \'
              outBytes.push(0x27);
              break;
            case 0x22: // \"
              outBytes.push(0x22);
              break;
            case 0x78: {
              // \xHH
              if (pos + 2 > bytes.length) {
                throw new Error('Truncated \\xHH escape in LLSD notation string');
              }
              const hex = String.fromCharCode(bytes[pos], bytes[pos + 1]);
              if (!/^[0-9a-fA-F]{2}$/.test(hex)) {
                throw new Error(`Invalid hex escape \\x${hex} in LLSD notation string`);
              }
              outBytes.push(parseInt(hex, 16));
              pos += 2;
              break;
            }
            default:
              outBytes.push(esc);
              break;
          }
        } else {
          outBytes.push(b);
        }
      }
      throw new Error('Unterminated string literal in LLSD notation');
    };

    const readParenthesizedLength = (): number => {
      if (pos >= bytes.length || bytes[pos] !== 0x28) {
        throw new Error('Expected "(" for sized LLSD notation literal');
      }
      pos++;
      let numStr = '';
      while (pos < bytes.length && bytes[pos] >= 0x30 && bytes[pos] <= 0x39) {
        numStr += String.fromCharCode(bytes[pos++]);
      }
      if (numStr === '' || pos >= bytes.length || bytes[pos] !== 0x29) {
        throw new Error('Invalid byte length in sized LLSD notation literal');
      }
      pos++; // ')'
      return parseInt(numStr, 10);
    };

    const parseStringToken = (): string => {
      const ch = bytes[pos];
      if (ch === 0x27 || ch === 0x22) {
        return readDelimitedEscapedString(ch);
      }
      if (ch === 0x73) {
        // s(len)"..." or s(len)'...'
        pos++;
        const byteLen = readParenthesizedLength();
        if (pos >= bytes.length || (bytes[pos] !== 0x22 && bytes[pos] !== 0x27)) {
          throw new Error('Expected quote delimiter after s(len) in LLSD notation');
        }
        const quote = bytes[pos++];
        if (pos + byteLen >= bytes.length) {
          throw new Error('Truncated sized string in LLSD notation');
        }
        const slice = bytes.subarray(pos, pos + byteLen);
        pos += byteLen;
        if (bytes[pos] !== quote) {
          throw new Error('Mismatched closing quote for sized string in LLSD notation');
        }
        pos++;
        return new TextDecoder('utf-8', { fatal: true }).decode(slice);
      }
      throw new Error(`Expected LLSD notation string at byte offset ${pos}`);
    };

    const matchWordCI = (word: string): boolean => {
      if (pos + word.length > bytes.length) return false;
      for (let i = 0; i < word.length; i++) {
        if (String.fromCharCode(bytes[pos + i]).toLowerCase() !== word[i]) {
          return false;
        }
      }
      const next = pos + word.length < bytes.length ? bytes[pos + word.length] : 0;
      if (
        (next >= 0x41 && next <= 0x5a) ||
        (next >= 0x61 && next <= 0x7a) ||
        (next >= 0x30 && next <= 0x39) ||
        next === 0x5f
      ) {
        return false;
      }
      pos += word.length;
      return true;
    };

    const parseValue = (): LLSDData => {
      skipWs();
      if (pos >= bytes.length) {
        throw new Error('Unexpected end of LLSD notation input');
      }
      const b = bytes[pos];

      // Undef '!'
      if (b === 0x21) {
        pos++;
        return null;
      }

      // Booleans: 1, 0, true, false, t, f
      if (b === 0x31) {
        pos++;
        return true;
      }
      if (b === 0x30) {
        pos++;
        return false;
      }
      if (matchWordCI('true') || matchWordCI('t')) {
        return true;
      }
      if (matchWordCI('false') || matchWordCI('f')) {
        return false;
      }

      // Integer: i...
      if (b === 0x69 || b === 0x49) {
        pos++;
        let tok = '';
        if (pos < bytes.length && (bytes[pos] === 0x2d || bytes[pos] === 0x2b)) {
          tok += String.fromCharCode(bytes[pos++]);
        }
        while (pos < bytes.length && bytes[pos] >= 0x30 && bytes[pos] <= 0x39) {
          tok += String.fromCharCode(bytes[pos++]);
        }
        if (tok === '' || tok === '-' || tok === '+') {
          throw new Error(`Invalid LLSD notation integer at offset ${pos}`);
        }
        const n = Number(tok);
        if (n > MAX_INT32 || n < MIN_INT32) {
          throw new Error(`LLSD notation integer out of 32-bit range: ${tok}`);
        }
        return n | 0;
      }

      // Real: r...
      if (b === 0x72 || b === 0x52) {
        pos++;
        let tok = '';
        while (pos < bytes.length) {
          const c = bytes[pos];
          if (
            c === 0x20 ||
            c === 0x09 ||
            c === 0x0a ||
            c === 0x0d ||
            c === 0x2c ||
            c === 0x5d ||
            c === 0x7d
          ) {
            break;
          }
          tok += String.fromCharCode(bytes[pos++]);
        }
        return parseLLSDRealToken(tok);
      }

      // UUID: u...
      if (b === 0x75 || b === 0x55) {
        pos++;
        if (pos + 36 > bytes.length) {
          throw new Error('Truncated UUID in LLSD notation');
        }
        const uuidStr = new TextDecoder().decode(bytes.subarray(pos, pos + 36));
        if (!UUID_REGEX.test(uuidStr)) {
          throw new Error(`Invalid UUID in LLSD notation: ${uuidStr}`);
        }
        pos += 36;
        return uuidStr.toLowerCase();
      }

      // Strings: '...', "...", s(len)"..."
      if (b === 0x27 || b === 0x22 || b === 0x73) {
        return parseStringToken();
      }

      // URI: l"..." or l'...'
      if (b === 0x6c || b === 0x4c) {
        pos++;
        if (pos >= bytes.length || (bytes[pos] !== 0x22 && bytes[pos] !== 0x27)) {
          throw new Error('Expected quoted string for LLSD notation URI');
        }
        return readDelimitedEscapedString(bytes[pos]);
      }

      // Date: d"..." or d'...'
      if (b === 0x64 || b === 0x44) {
        pos++;
        if (pos >= bytes.length || (bytes[pos] !== 0x22 && bytes[pos] !== 0x27)) {
          throw new Error('Expected quoted ISO-8601 date in LLSD notation');
        }
        const dateStr = readDelimitedEscapedString(bytes[pos]);
        return parseISODateStrict(dateStr);
      }

      // Binary: b64"...", b16"...", b(len)"..."
      if (b === 0x62 || b === 0x42) {
        pos++;
        if (pos < bytes.length && bytes[pos] === 0x28) {
          const byteLen = readParenthesizedLength();
          if (pos >= bytes.length || (bytes[pos] !== 0x22 && bytes[pos] !== 0x27)) {
            throw new Error('Expected quote after b(len) in LLSD notation');
          }
          const quote = bytes[pos++];
          if (pos + byteLen >= bytes.length) {
            throw new Error('Truncated raw binary literal in LLSD notation');
          }
          const out = bytes.slice(pos, pos + byteLen);
          pos += byteLen;
          if (bytes[pos] !== quote) {
            throw new Error('Mismatched closing quote for raw binary literal');
          }
          pos++;
          return out;
        }
        let baseStr = '';
        while (pos < bytes.length && bytes[pos] >= 0x30 && bytes[pos] <= 0x39) {
          baseStr += String.fromCharCode(bytes[pos++]);
        }
        if (pos >= bytes.length || (bytes[pos] !== 0x22 && bytes[pos] !== 0x27)) {
          throw new Error('Expected quote delimiter for LLSD notation binary');
        }
        const quote = bytes[pos++];
        const start = pos;
        while (pos < bytes.length && bytes[pos] !== quote) {
          pos++;
        }
        if (pos >= bytes.length) {
          throw new Error('Unterminated binary literal in LLSD notation');
        }
        const payload = new TextDecoder().decode(bytes.subarray(start, pos));
        pos++; // closing quote
        if (baseStr === '' || baseStr === '64') {
          return decodeBase64Bytes(payload);
        }
        if (baseStr === '16') {
          return decodeBase16Bytes(payload);
        }
        throw new Error(`Unsupported binary base b${baseStr} in LLSD notation`);
      }

      // Array: [v1, v2, ...]
      if (b === 0x5b) {
        pos++;
        const arr: LLSDData[] = [];
        skipWs();
        if (pos < bytes.length && bytes[pos] === 0x5d) {
          pos++;
          return arr;
        }
        while (pos < bytes.length) {
          arr.push(parseValue());
          skipWs();
          if (pos < bytes.length && bytes[pos] === 0x2c) {
            pos++;
            skipWs();
            // Allow optional trailing comma per python-llsd tolerance? Check for ']'
            if (pos < bytes.length && bytes[pos] === 0x5d) {
              pos++;
              return arr;
            }
            continue;
          }
          if (pos < bytes.length && bytes[pos] === 0x5d) {
            pos++;
            return arr;
          }
          throw new Error(`Expected "," or "]" in LLSD notation array at offset ${pos}`);
        }
        throw new Error('Unterminated array in LLSD notation');
      }

      // Map: {'k': v, ...}
      if (b === 0x7b) {
        pos++;
        const map: Record<string, LLSDData> = {};
        skipWs();
        if (pos < bytes.length && bytes[pos] === 0x7d) {
          pos++;
          return map;
        }
        while (pos < bytes.length) {
          skipWs();
          const key = parseStringToken();
          skipWs();
          if (pos >= bytes.length || bytes[pos] !== 0x3a) {
            throw new Error(`Expected ":" after map key in LLSD notation at offset ${pos}`);
          }
          pos++;
          map[key] = parseValue();
          skipWs();
          if (pos < bytes.length && bytes[pos] === 0x2c) {
            pos++;
            skipWs();
            if (pos < bytes.length && bytes[pos] === 0x7d) {
              pos++;
              return map;
            }
            continue;
          }
          if (pos < bytes.length && bytes[pos] === 0x7d) {
            pos++;
            return map;
          }
          throw new Error(`Expected "," or "}" in LLSD notation map at offset ${pos}`);
        }
        throw new Error('Unterminated map in LLSD notation');
      }

      throw new Error(
        `Unexpected token "${String.fromCharCode(b)}" in LLSD notation at offset ${pos}`,
      );
    };

    const result = parseValue();
    skipWs();
    if (pos !== bytes.length) {
      throw new Error(`Unexpected trailing characters in LLSD notation at offset ${pos}`);
    }
    return result;
  }

  /**
   * Serialize JavaScript value to LLSD Notation (`secondlife/python-llsd` format).
   */
  static buildNotation(data: unknown, includeHeader = false): string {
    const prefix = includeHeader ? '<?llsd/notation?>\n' : '';
    return prefix + this._buildNotationValue(data);
  }

  private static _escapeNotationString(str: string): string {
    let out = "'";
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      const code = str.charCodeAt(i);
      if (ch === '\\') out += '\\\\';
      else if (ch === "'") out += "\\'";
      else if (ch === '\n') out += '\\n';
      else if (ch === '\r') out += '\\r';
      else if (ch === '\t') out += '\\t';
      else if (code < 0x20) out += `\\x${code.toString(16).padStart(2, '0')}`;
      else out += ch;
    }
    out += "'";
    return out;
  }

  private static _buildNotationValue(data: unknown): string {
    if (
      data === null ||
      data === undefined ||
      data instanceof LLSDUndef ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'undef')
    ) {
      return '!';
    }
    if (
      data instanceof LLSDUUID ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uuid')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const uuid = (rawVal !== undefined ? String(rawVal) : String(data)).trim() || NIL_UUID;
      return `u${uuid.toLowerCase()}`;
    }
    if (
      data instanceof LLSDURI ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uri')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const uri = rawVal !== undefined ? String(rawVal) : String(data);
      return `l"${uri.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    }
    if (data instanceof Uint8Array) {
      return `b64"${encodeBase64Bytes(data)}"`;
    }
    if (
      data instanceof LLSDBinary ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'binary')
    ) {
      const binVal = (data as { value?: unknown }).value;
      const b64 =
        typeof binVal === 'string'
          ? binVal
          : binVal instanceof Uint8Array
            ? encodeBase64Bytes(binVal)
            : '';
      return `b64"${b64}"`;
    }
    if (typeof data === 'boolean') {
      return data ? 'true' : 'false';
    }
    if (typeof data === 'number') {
      if (
        Number.isInteger(data) &&
        !isNegativeZero(data) &&
        data >= MIN_INT32 &&
        data <= MAX_INT32
      ) {
        return `i${data}`;
      }
      return `r${formatLLSDRealToken(data)}`;
    }
    if (typeof data === 'string') {
      return this._escapeNotationString(data);
    }
    if (data instanceof Date) {
      return `d"${data.toISOString()}"`;
    }
    if (Array.isArray(data)) {
      return `[${data.map((item) => this._buildNotationValue(item)).join(',')}]`;
    }
    if (typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const entries = Object.keys(record).map(
        (k) => `${this._escapeNotationString(k)}:${this._buildNotationValue(record[k])}`,
      );
      return `{${entries.join(',')}}`;
    }
    return '!';
  }

  /**
   * Parse LLSD Binary (`<?llsd/binary?>` or raw framing) per `secondlife/python-llsd`.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  static parseBinary(data: Uint8Array): any {
    if (!(data instanceof Uint8Array) || data.length === 0) {
      throw new Error('Empty LLSD binary payload');
    }

    let offset = 0;
    // Strip optional <?llsd/binary?> / <? LLSD/Binary ?> header + optional \r?\n
    if (data.length >= 15 && data[0] === 0x3c && data[1] === 0x3f) {
      let endHdr = 2;
      while (endHdr + 1 < data.length) {
        if (data[endHdr] === 0x3f && data[endHdr + 1] === 0x3e) {
          break;
        }
        endHdr++;
      }
      if (endHdr + 1 >= data.length) {
        throw new Error('Unterminated LLSD binary header');
      }
      const hdrText = new TextDecoder().decode(data.subarray(2, endHdr)).trim().toLowerCase();
      if (hdrText !== 'llsd/binary') {
        throw new Error(`Unsupported LLSD binary header: <?${hdrText}?>`);
      }
      offset = endHdr + 2;
      if (offset < data.length && data[offset] === 0x0d) offset++;
      if (offset < data.length && data[offset] === 0x0a) offset++;
    }

    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

    const ensure = (n: number): void => {
      if (n < 0 || offset + n > data.length) {
        throw new Error(`Unexpected end of LLSD binary data at offset ${offset} (need ${n} bytes)`);
      }
    };

    const readU32 = (): number => {
      ensure(4);
      const val = view.getUint32(offset, false);
      offset += 4;
      return val;
    };

    const readS32 = (): number => {
      ensure(4);
      const val = view.getInt32(offset, false);
      offset += 4;
      return val;
    };

    const readF64 = (): number => {
      ensure(8);
      const val = view.getFloat64(offset, false);
      offset += 8;
      return val;
    };

    const readString = (): string => {
      const len = readU32();
      ensure(len);
      const text = new TextDecoder('utf-8', { fatal: false }).decode(
        data.subarray(offset, offset + len),
      );
      offset += len;
      return text;
    };

    const readNode = (): LLSDData => {
      ensure(1);
      const tag = data[offset++];
      switch (tag) {
        case 0x21: // '!'
          return null;
        case 0x31: // '1'
          return true;
        case 0x30: // '0'
          return false;
        case 0x69: // 'i'
          return readS32();
        case 0x72: // 'r'
          return readF64();
        case 0x75: {
          // 'u'
          ensure(16);
          const hex: string[] = [];
          for (let i = 0; i < 16; i++) {
            hex.push(data[offset + i].toString(16).padStart(2, '0'));
          }
          offset += 16;
          return (
            hex.slice(0, 4).join('') +
            '-' +
            hex.slice(4, 6).join('') +
            '-' +
            hex.slice(6, 8).join('') +
            '-' +
            hex.slice(8, 10).join('') +
            '-' +
            hex.slice(10, 16).join('')
          );
        }
        case 0x73: // 's'
          return readString();
        case 0x6c: // 'l'
          return readString();
        case 0x64: // 'd' (big-endian float64 seconds since Unix epoch)
          return new Date(readF64() * 1000);
        case 0x62: {
          // 'b'
          const len = readU32();
          ensure(len);
          const out = data.slice(offset, offset + len);
          offset += len;
          return out;
        }
        case 0x5b: {
          // '['
          const count = readU32();
          const arr: LLSDData[] = [];
          for (let i = 0; i < count; i++) {
            arr.push(readNode());
          }
          ensure(1);
          if (data[offset++] !== 0x5d) {
            throw new Error('Expected closing "]" in LLSD binary array');
          }
          return arr;
        }
        case 0x7b: {
          // '{'
          const count = readU32();
          const map: Record<string, LLSDData> = {};
          for (let i = 0; i < count; i++) {
            ensure(1);
            if (data[offset++] !== 0x6b) {
              throw new Error('Expected key marker "k" in LLSD binary map');
            }
            const key = readString();
            map[key] = readNode();
          }
          ensure(1);
          if (data[offset++] !== 0x7d) {
            throw new Error('Expected closing "}" in LLSD binary map');
          }
          return map;
        }
        default:
          throw new Error(`Unknown LLSD binary tag 0x${tag.toString(16)} at offset ${offset - 1}`);
      }
    };

    return readNode();
  }

  /**
   * Serialize JavaScript value to LLSD Binary (`<?llsd/binary?>\n` header optional).
   */
  static buildBinary(data: unknown, includeHeader = true): Uint8Array {
    const chunks: Uint8Array[] = [];
    if (includeHeader) {
      chunks.push(new TextEncoder().encode('<?llsd/binary?>\n'));
    }
    this._writeBinaryValue(data, chunks);
    let total = 0;
    for (const c of chunks) total += c.length;
    const out = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }

  private static _writeBinaryValue(data: unknown, chunks: Uint8Array[]): void {
    if (
      data === null ||
      data === undefined ||
      data instanceof LLSDUndef ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'undef')
    ) {
      chunks.push(new Uint8Array([0x21]));
      return;
    }

    if (
      data instanceof LLSDUUID ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uuid')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const uuidStr = (rawVal !== undefined ? String(rawVal) : String(data)).trim() || NIL_UUID;
      if (!UUID_REGEX.test(uuidStr)) {
        throw new Error(`Invalid UUID for LLSD binary serialization: ${uuidStr}`);
      }
      const hex = uuidStr.replace(/-/g, '');
      const buf = new Uint8Array(17);
      buf[0] = 0x75;
      for (let i = 0; i < 16; i++) {
        buf[1 + i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
      }
      chunks.push(buf);
      return;
    }

    if (
      data instanceof LLSDURI ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'uri')
    ) {
      const rawVal = (data as { value?: unknown }).value;
      const uriBytes = new TextEncoder().encode(
        rawVal !== undefined ? String(rawVal) : String(data),
      );
      const hdr = new Uint8Array(5);
      hdr[0] = 0x6c;
      new DataView(hdr.buffer).setUint32(1, uriBytes.length, false);
      chunks.push(hdr, uriBytes);
      return;
    }

    if (data instanceof Uint8Array) {
      const hdr = new Uint8Array(5);
      hdr[0] = 0x62;
      new DataView(hdr.buffer).setUint32(1, data.length, false);
      chunks.push(hdr, data);
      return;
    }

    if (
      data instanceof LLSDBinary ||
      (typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'binary')
    ) {
      const binVal = (data as { value?: unknown }).value;
      const bytes =
        binVal instanceof Uint8Array
          ? binVal
          : typeof binVal === 'string'
            ? decodeBase64Bytes(binVal)
            : new Uint8Array(0);
      const hdr = new Uint8Array(5);
      hdr[0] = 0x62;
      new DataView(hdr.buffer).setUint32(1, bytes.length, false);
      chunks.push(hdr, bytes);
      return;
    }

    if (typeof data === 'boolean') {
      chunks.push(new Uint8Array([data ? 0x31 : 0x30]));
      return;
    }

    if (typeof data === 'number') {
      if (
        Number.isInteger(data) &&
        !isNegativeZero(data) &&
        data >= MIN_INT32 &&
        data <= MAX_INT32
      ) {
        const buf = new Uint8Array(5);
        buf[0] = 0x69;
        new DataView(buf.buffer).setInt32(1, data, false);
        chunks.push(buf);
      } else {
        const buf = new Uint8Array(9);
        buf[0] = 0x72;
        new DataView(buf.buffer).setFloat64(1, data, false);
        chunks.push(buf);
      }
      return;
    }

    if (typeof data === 'string') {
      const strBytes = new TextEncoder().encode(data);
      const hdr = new Uint8Array(5);
      hdr[0] = 0x73;
      new DataView(hdr.buffer).setUint32(1, strBytes.length, false);
      chunks.push(hdr, strBytes);
      return;
    }

    if (data instanceof Date) {
      const buf = new Uint8Array(9);
      buf[0] = 0x64;
      new DataView(buf.buffer).setFloat64(1, data.getTime() / 1000, false);
      chunks.push(buf);
      return;
    }

    if (Array.isArray(data)) {
      const hdr = new Uint8Array(5);
      hdr[0] = 0x5b;
      new DataView(hdr.buffer).setUint32(1, data.length, false);
      chunks.push(hdr);
      for (const item of data) {
        this._writeBinaryValue(item, chunks);
      }
      chunks.push(new Uint8Array([0x5d]));
      return;
    }

    if (typeof data === 'object') {
      const record = data as Record<string, unknown>;
      const keys = Object.keys(record);
      const hdr = new Uint8Array(5);
      hdr[0] = 0x7b;
      new DataView(hdr.buffer).setUint32(1, keys.length, false);
      chunks.push(hdr);
      for (const key of keys) {
        const keyBytes = new TextEncoder().encode(key);
        const keyHdr = new Uint8Array(5);
        keyHdr[0] = 0x6b;
        new DataView(keyHdr.buffer).setUint32(1, keyBytes.length, false);
        chunks.push(keyHdr, keyBytes);
        this._writeBinaryValue(record[key], chunks);
      }
      chunks.push(new Uint8Array([0x7d]));
      return;
    }

    chunks.push(new Uint8Array([0x21]));
  }

  /**
   * Escape special XML characters
   * @private
   */
  private static _escapeXML(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }
}
