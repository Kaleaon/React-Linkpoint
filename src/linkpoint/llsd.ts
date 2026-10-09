/**
 * Linkpoint PWA - LLSD (Linden Lab Structured Data) Parser/Builder
 * Handles parsing and building of LLSD XML for Second Life capabilities
 */

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
    let binary = '';
    const bytes = this.value;
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return typeof btoa === 'function' ? btoa(binary) : binary;
  }

  valueOf(): Uint8Array | string {
    return this.value;
  }
}

export class LLSD {
  /**
   * Parse LLSD XML string to JavaScript object
   * @param xml - The XML string to parse
   * @returns - The parsed data (Map, Array, or primitive)
   */
  static parseXML(xml: string): any {
    if (typeof DOMParser === 'undefined') {
      throw new Error('DOMParser is not available (browser environment required)');
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'text/xml');

    // Check for parse errors
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`XML Parse Error: ${parserError.textContent}`);
    }

    const llsdElement = doc.querySelector('llsd');
    if (!llsdElement) {
      throw new Error('Invalid LLSD XML: missing <llsd> tag');
    }

    // Get the first child element (should be the root value)
    const firstChild = Array.from(llsdElement.children).find((el) => el.nodeType === 1) as Element;
    if (!firstChild) {
      return null;
    }

    return this._parseElement(firstChild);
  }

  /**
   * Parse an individual LLSD element (recursive)
   * @private
   */
  private static _parseElement(element: Element): any {
    const tagName = element.tagName.toLowerCase();
    const text = element.textContent?.trim() || '';

    switch (tagName) {
      case 'undef':
        return null;
      case 'boolean':
        return text === 'true' || text === '1';
      case 'integer':
        return parseInt(text, 10);
      case 'real':
        return parseFloat(text);
      case 'string':
        return text;
      case 'uuid':
        return text; // UUIDs are strings in JS
      case 'date':
        return new Date(text);
      case 'uri':
        return text;
      case 'binary':
        // Handle base64
        return this._decodeBase64(text);
      case 'map':
        return this._parseMap(element);
      case 'array':
        return this._parseArray(element);
      default:
        console.warn(`Unknown LLSD type: ${tagName}, returning text content`);
        return text;
    }
  }

  /**
   * Parse a Map element
   * @private
   */
  private static _parseMap(mapElement: Element): any {
    const result: Record<string, any> = {};
    let currentKey: string | null = null;

    for (let i = 0; i < mapElement.children.length; i++) {
      const child = mapElement.children[i];
      if (child.nodeType !== 1) continue; // Skip non-elements

      if (child.tagName.toLowerCase() === 'key') {
        currentKey = child.textContent?.trim() || '';
      } else if (currentKey !== null) {
        result[currentKey] = this._parseElement(child);
        currentKey = null;
      }
    }

    return result;
  }

  /**
   * Parse an Array element
   * @private
   */
  private static _parseArray(arrayElement: Element): any {
    const result: any[] = [];

    for (let i = 0; i < arrayElement.children.length; i++) {
      const child = arrayElement.children[i];
      if (child.nodeType !== 1) continue;
      result.push(this._parseElement(child));
    }

    return result;
  }

  /**
   * Decode Base64 string to Uint8Array
   * @private
   */
  private static _decodeBase64(base64: string): Uint8Array | string {
    if (typeof atob === 'function') {
      const binaryString = atob(base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    return base64; // Fallback
  }

  /**
   * Build LLSD XML string from JavaScript object
   * @param data - The data to serialize
   * @returns - The XML string
   */
  static buildXML(data: any): string {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<llsd>';
    xml += this._buildElement(data);
    xml += '</llsd>';
    return xml;
  }

  /**
   * Build an individual XML element (recursive)
   * @private
   */
  private static _buildElement(data: any): string {
    if (
      data === null ||
      data === undefined ||
      data instanceof LLSDUndef ||
      (typeof data === 'object' && data !== null && data.type === 'undef')
    ) {
      return '<undef />';
    }

    if (
      data instanceof LLSDUUID ||
      (typeof data === 'object' && data !== null && data.type === 'uuid')
    ) {
      const val = data.value !== undefined ? data.value : String(data);
      return `<uuid>${this._escapeXML(val)}</uuid>`;
    }

    if (
      data instanceof LLSDURI ||
      (typeof data === 'object' && data !== null && data.type === 'uri')
    ) {
      const val = data.value !== undefined ? data.value : String(data);
      return `<uri>${this._escapeXML(val)}</uri>`;
    }

    if (
      data instanceof LLSDBinary ||
      (typeof data === 'object' && data !== null && data.type === 'binary')
    ) {
      const val =
        typeof data.value === 'string'
          ? data.value
          : data.value instanceof Uint8Array
            ? String(data)
            : String(data.value || '');
      return `<binary>${val}</binary>`;
    }

    if (typeof data === 'boolean') {
      return `<boolean>${data ? 'true' : 'false'}</boolean>`;
    }

    if (typeof data === 'number') {
      if (Number.isInteger(data)) {
        return `<integer>${data}</integer>`;
      }
      return `<real>${data}</real>`;
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
      // Generic Map
      let xml = '<map>';
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          xml += `<key>${this._escapeXML(key)}</key>`;
          xml += this._buildElement(data[key]);
        }
      }
      xml += '</map>';
      return xml;
    }

    return `<undef />`;
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
