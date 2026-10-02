import { parseISO, formatISO } from 'date-fns';
import { v4 as uuidv4, validate as validateUuid } from 'uuid';
import { DOMParser as XMLDOMParser } from '@xmldom/xmldom';

export type LLSDValue =
  | null
  | boolean
  | number
  | string
  | Date
  | Uint8Array
  | { [key: string]: LLSDValue }
  | LLSDValue[];

export enum LLSDFormat {
  XML = 'xml',
  NOTATION = 'notation',
  JSON = 'json',
}

/**
 * LLSD XML Parsing
 */
export function parseXML(xml: string): LLSDValue {
  let doc: any;
  try {
    const parser = typeof DOMParser !== 'undefined'
      ? new DOMParser()
      : new XMLDOMParser({
          onError: (level: string, msg: string) => {
            if (level === 'error' || level === 'fatalError') {
              throw new Error(`XML Parse Error: ${msg}`);
            }
          }
        });

    doc = parser.parseFromString(xml, 'text/xml');
  } catch (e: any) {
    if (e.message?.includes('XML Parse Error')) throw e;
    throw new Error(`XML Parse Error: ${e.message}`);
  }

  const parserError = doc.querySelector ? doc.querySelector('parsererror') : doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error(`XML Parse Error: ${parserError.textContent}`);
  }

  let root: Element | null = null;
  if (doc.querySelector) {
    root = doc.querySelector('llsd');
  } else {
    const llsdNodes = doc.getElementsByTagName('llsd');
    if (llsdNodes && llsdNodes.length > 0) root = llsdNodes[0] as Element;
  }

  if (!root) return null;

  // Find first element child
  let firstChild: Element | null = null;
  for (let i = 0; i < root.childNodes.length; i++) {
    const node = root.childNodes[i];
    if (node.nodeType === 1) { // Element node
      firstChild = node as Element;
      break;
    }
  }
  if (!firstChild) return null;

  return parseXMLElement(firstChild);
}

function parseXMLElement(el: Element): LLSDValue {
  const tag = el.tagName.toLowerCase();
  switch (tag) {
    case 'undef': return null;
    case 'boolean': return el.textContent?.trim() === 'true' || el.textContent?.trim() === '1';
    case 'integer': return parseInt(el.textContent || '0', 10);
    case 'real': return parseFloat(el.textContent || '0');
    case 'uuid': return el.textContent?.trim() || '';
    case 'string': return el.textContent || '';
    case 'date': return parseISO(el.textContent?.trim() || '');
    case 'uri': return el.textContent?.trim() || '';
    case 'binary': {
      const base64 = el.textContent?.trim() || '';
      return decodeBase64(base64);
    }
    case 'map': {
      const map: { [key: string]: LLSDValue } = {};
      let currentKey: string | null = null;
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child.nodeType !== 1) continue;
        const childEl = child as Element;
        if (childEl.tagName.toLowerCase() === 'key') {
          currentKey = childEl.textContent || '';
        } else if (currentKey !== null) {
          map[currentKey] = parseXMLElement(childEl);
          currentKey = null;
        }
      }
      return map;
    }
    case 'array': {
      const array: LLSDValue[] = [];
      for (let i = 0; i < el.childNodes.length; i++) {
        const child = el.childNodes[i];
        if (child.nodeType !== 1) continue;
        array.push(parseXMLElement(child as Element));
      }
      return array;
    }
    default: return null;
  }
}

function decodeBase64(base64: string): Uint8Array {
  if (typeof atob === 'function') {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  return new Uint8Array(0);
}

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let binary = '';
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  return '';
}

/**
 * LLSD XML Serialization
 */
export function serializeXML(value: LLSDValue): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<llsd>\n${serializeXMLElement(value, 1)}\n</llsd>`;
}

function serializeXMLElement(value: LLSDValue, indent: number): string {
  const pad = '  '.repeat(indent);
  if (value === null) return `${pad}<undef />`;
  if (typeof value === 'boolean') return `${pad}<boolean>${value}</boolean>`;
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return `${pad}<integer>${value}</integer>`;
    return `${pad}<real>${value}</real>`;
  }
  if (value instanceof Date) return `${pad}<date>${formatISO(value)}</date>`;
  if (value instanceof Uint8Array) {
    const base64 = encodeBase64(value);
    return `${pad}<binary encoding="base64">${base64}</binary>`;
  }
  if (Array.isArray(value)) {
    const children = value.map(v => serializeXMLElement(v, indent + 1)).join('\n');
    return `${pad}<array>\n${children}\n${pad}</array>`;
  }
  if (typeof value === 'object') {
    const children = Object.entries(value).map(([k, v]) => {
      return `${pad}  <key>${k}</key>\n${serializeXMLElement(v, indent + 1)}`;
    }).join('\n');
    return `${pad}<map>\n${children}\n${pad}</map>`;
  }
  if (typeof value === 'string') {
    if (validateUuid(value)) return `${pad}<uuid>${value}</uuid>`;
    if (value.startsWith('http://') || value.startsWith('https://')) return `${pad}<uri>${value}</uri>`;
    return `${pad}<string>${value}</string>`;
  }
  return `${pad}<undef />`;
}

/**
 * LLSD Notation Parser and Tokenizer
 */
export function parseNotation(notation: string): LLSDValue {
  const trimmed = notation.trim();
  if (!trimmed) return null;

  try {
    return new NotationParser(trimmed).parse();
  } catch (e) {
    console.error('Notation parse error:', e);
    return null;
  }
}

export class NotationParser {
  private pos = 0;
  private len: number;

  constructor(private input: string) {
    this.len = input.length;
  }

  public parse(): LLSDValue {
    this.skipWhitespaceAndCommas();
    if (this.pos >= this.len) return null;

    const char = this.input[this.pos];

    // Map & Array
    if (char === '{') return this.parseMap();
    if (char === '[') return this.parseArray();

    // Undefined / Null
    if (char === '!') {
      this.pos++;
      return null;
    }
    if (this.matchKeyword('undef')) return null;

    // Booleans
    if (this.matchKeyword('true')) return true;
    if (this.matchKeyword('false')) return false;

    // Prefixed types: i (integer), r (real), u (uuid), d (date), l (uri), b (binary), s (string)
    if (char === 'i') {
      this.pos++;
      return this.parseInteger();
    }

    if (char === 'r') {
      this.pos++;
      return this.parseReal();
    }

    if (char === 'u') {
      this.pos++;
      const strVal = this.parseQuotedOrRawString();
      return strVal;
    }

    if (char === 'd') {
      this.pos++;
      const strVal = this.parseQuotedOrRawString();
      if (!strVal) return new Date(0);
      return parseISO(strVal);
    }

    if (char === 'l') {
      this.pos++;
      return this.parseQuotedOrRawString();
    }

    if (char === 'b') {
      this.pos++;
      return this.parseBinary();
    }

    if (char === 's') {
      this.pos++;
      return this.parseQuotedOrRawString();
    }

    // Direct Quoted Strings
    if (char === "'" || char === '"') {
      return this.parseQuotedString();
    }

    // Unprefixed Numbers or Fallback Raw Tokens
    if (/[0-9\-]/.test(char)) {
      return this.parseUnprefixedNumber();
    }

    // Unquoted identifier / token
    return this.parseUnquotedToken();
  }

  private parseMap(): { [key: string]: LLSDValue } {
    this.pos++; // skip '{'
    const map: { [key: string]: LLSDValue } = {};

    while (this.pos < this.len) {
      this.skipWhitespaceAndCommas();
      if (this.pos >= this.len) break;
      if (this.input[this.pos] === '}') {
        this.pos++;
        break;
      }

      // Parse Key
      const keyChar = this.input[this.pos];
      let key = '';
      if (keyChar === "'" || keyChar === '"') {
        key = this.parseQuotedString();
      } else if (keyChar === 's' && (this.peek(1) === "'" || this.peek(1) === '"')) {
        this.pos++;
        key = this.parseQuotedString();
      } else {
        key = this.parseUnquotedKey();
      }

      this.skipWhitespaceAndCommas();

      // Skip colon separator if present
      if (this.pos < this.len && this.input[this.pos] === ':') {
        this.pos++;
      }

      this.skipWhitespaceAndCommas();

      // Parse Value
      const val = this.parse();
      map[key] = val;

      this.skipWhitespaceAndCommas();
    }

    return map;
  }

  private parseArray(): LLSDValue[] {
    this.pos++; // skip '['
    const arr: LLSDValue[] = [];

    while (this.pos < this.len) {
      this.skipWhitespaceAndCommas();
      if (this.pos >= this.len) break;
      if (this.input[this.pos] === ']') {
        this.pos++;
        break;
      }

      const val = this.parse();
      arr.push(val);

      this.skipWhitespaceAndCommas();
    }

    return arr;
  }

  private parseInteger(): number {
    this.skipWhitespace();
    if (this.pos < this.len && (this.input[this.pos] === "'" || this.input[this.pos] === '"')) {
      const raw = this.parseQuotedString();
      return parseInt(raw, 10) || 0;
    }
    const start = this.pos;
    if (this.pos < this.len && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
      this.pos++;
    }
    while (this.pos < this.len && /[0-9]/.test(this.input[this.pos])) {
      this.pos++;
    }
    const str = this.input.slice(start, this.pos);
    return parseInt(str, 10) || 0;
  }

  private parseReal(): number {
    this.skipWhitespace();
    if (this.pos < this.len && (this.input[this.pos] === "'" || this.input[this.pos] === '"')) {
      const raw = this.parseQuotedString();
      return parseFloat(raw) || 0;
    }
    const start = this.pos;
    if (this.pos < this.len && (this.input[this.pos] === '+' || this.input[this.pos] === '-')) {
      this.pos++;
    }
    while (this.pos < this.len && /[0-9\.\-eE+]/.test(this.input[this.pos])) {
      this.pos++;
    }
    const str = this.input.slice(start, this.pos);
    return parseFloat(str) || 0;
  }

  private parseBinary(): Uint8Array {
    this.skipWhitespace();
    // b64"..." format check
    if (this.input.startsWith('64', this.pos)) {
      this.pos += 2;
    }

    // Binary byte length prefix format: b(len)"..."
    if (this.pos < this.len && this.input[this.pos] === '(') {
      this.pos++;
      const lenStart = this.pos;
      while (this.pos < this.len && this.input[this.pos] !== ')') {
        this.pos++;
      }
      const numBytes = parseInt(this.input.slice(lenStart, this.pos), 10) || 0;
      if (this.pos < this.len && this.input[this.pos] === ')') this.pos++;

      this.skipWhitespace();
      const rawStr = this.parseQuotedString();
      const bytes = new Uint8Array(numBytes);
      for (let i = 0; i < Math.min(numBytes, rawStr.length); i++) {
        bytes[i] = rawStr.charCodeAt(i);
      }
      return bytes;
    }

    // Quoted base64 string
    if (this.pos < this.len && (this.input[this.pos] === "'" || this.input[this.pos] === '"')) {
      const base64 = this.parseQuotedString();
      return decodeBase64(base64);
    }

    // Raw unquoted base64
    const start = this.pos;
    while (this.pos < this.len && /[a-zA-Z0-9+/=]/.test(this.input[this.pos])) {
      this.pos++;
    }
    const base64 = this.input.slice(start, this.pos);
    return decodeBase64(base64);
  }

  private parseQuotedOrRawString(): string {
    this.skipWhitespace();
    if (this.pos < this.len && (this.input[this.pos] === "'" || this.input[this.pos] === '"')) {
      return this.parseQuotedString();
    }
    return this.parseUnquotedToken();
  }

  private parseQuotedString(): string {
    const quote = this.input[this.pos];
    this.pos++; // skip quote
    let str = '';

    while (this.pos < this.len) {
      const ch = this.input[this.pos];
      if (ch === quote) {
        this.pos++; // closing quote
        return str;
      }
      if (ch === '\\') {
        this.pos++;
        if (this.pos >= this.len) break;
        const esc = this.input[this.pos];
        switch (esc) {
          case 'a': str += '\x07'; break;
          case 'b': str += '\b'; break;
          case 'f': str += '\f'; break;
          case 'n': str += '\n'; break;
          case 'r': str += '\r'; break;
          case 't': str += '\t'; break;
          case 'v': str += '\v'; break;
          case '\\': str += '\\'; break;
          case "'": str += "'"; break;
          case '"': str += '"'; break;
          default: str += esc; break;
        }
      } else {
        str += ch;
      }
      this.pos++;
    }

    return str;
  }

  private parseUnquotedKey(): string {
    const start = this.pos;
    while (this.pos < this.len && !/[\s,:={}\[\]]/.test(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  private parseUnquotedToken(): string {
    const start = this.pos;
    while (this.pos < this.len && !/[\s,={}\[\]]/.test(this.input[this.pos])) {
      this.pos++;
    }
    return this.input.slice(start, this.pos);
  }

  private parseUnprefixedNumber(): number {
    const start = this.pos;
    let isFloat = false;

    if (this.input[this.pos] === '+' || this.input[this.pos] === '-') {
      this.pos++;
    }

    while (this.pos < this.len && /[0-9\.\-eE+]/.test(this.input[this.pos])) {
      if (this.input[this.pos] === '.' || this.input[this.pos] === 'e' || this.input[this.pos] === 'E') {
        isFloat = true;
      }
      this.pos++;
    }

    const raw = this.input.slice(start, this.pos);
    return isFloat ? parseFloat(raw) : parseInt(raw, 10);
  }

  private skipWhitespaceAndCommas(): void {
    while (this.pos < this.len && /[\s,]/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private skipWhitespace(): void {
    while (this.pos < this.len && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }
  }

  private matchKeyword(kw: string): boolean {
    if (this.input.startsWith(kw, this.pos)) {
      const endPos = this.pos + kw.length;
      if (endPos >= this.len || /[\s,:{}\[\]]/.test(this.input[endPos])) {
        this.pos = endPos;
        return true;
      }
    }
    return false;
  }

  private peek(offset = 0): string {
    return this.input[this.pos + offset] || '';
  }
}

/**
 * LLSD Notation Serialization
 */
export function serializeNotation(value: LLSDValue): string {
  if (value === null) return '!';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return `i${value}`;
    return `r${value}`;
  }
  if (value instanceof Date) return `d'${formatISO(value)}'`;
  if (value instanceof Uint8Array) {
    const base64 = encodeBase64(value);
    return `b'${base64}'`;
  }
  if (Array.isArray(value)) {
    return `[ ${value.map(v => serializeNotation(v)).join(', ')} ]`;
  }
  if (typeof value === 'object') {
    return `{ ${Object.entries(value).map(([k, v]) => `'${escapeString(k)}': ${serializeNotation(v)}`).join(', ')} }`;
  }
  if (typeof value === 'string') {
    if (validateUuid(value)) return `u'${value}'`;
    if (value.startsWith('http://') || value.startsWith('https://')) return `l'${value}'`;
    return `'${escapeString(value)}'`;
  }
  return '!';
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/**
 * JSON Conversion
 */
export function toJSON(value: LLSDValue): string {
  return JSON.stringify(value, (key, val) => {
    if (val instanceof Date) return val.toISOString();
    if (val instanceof Uint8Array) return encodeBase64(val);
    return val;
  }, 2);
}

export function fromJSON(json: string): LLSDValue {
  return JSON.parse(json);
}

/**
 * Format Detection
 */
export function detectFormat(input: string): LLSDFormat {
  const trimmed = input.trim();
  if (trimmed.startsWith('<?xml') || trimmed.startsWith('<llsd')) return LLSDFormat.XML;
  if (trimmed.startsWith('{') || trimmed.startsWith('[') || trimmed.startsWith('!') || /^[irudlbs]['"]/.test(trimmed)) {
    try {
      JSON.parse(trimmed);
      return LLSDFormat.JSON;
    } catch (e) {
      return LLSDFormat.NOTATION;
    }
  }
  return LLSDFormat.NOTATION;
}
