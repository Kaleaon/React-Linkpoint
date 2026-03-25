import { describe, it, expect } from 'vitest';
import { parseXML } from './llsd';
import { parseISO } from 'date-fns';

describe('LLSD parseXML', () => {
  it('should parse undef', () => {
    const xml = '<llsd><undef /></llsd>';
    expect(parseXML(xml)).toBeNull();
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
  ])('should parse boolean from "%s" to %s', (value, expected) => {
    const xml = `<llsd><boolean>${value}</boolean></llsd>`;
    expect(parseXML(xml)).toBe(expected);
  });

  it('should parse integer', () => {
    const xml = '<llsd><integer>123</integer></llsd>';
    expect(parseXML(xml)).toBe(123);
  });

  it('should parse real', () => {
    const xml = '<llsd><real>456.78</real></llsd>';
    expect(parseXML(xml)).toBe(456.78);
  });

  it('should parse uuid', () => {
    const xml = '<llsd><uuid>550e8400-e29b-41d4-a716-446655440000</uuid></llsd>';
    expect(parseXML(xml)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('should parse string', () => {
    const xml = '<llsd><string>hello world</string></llsd>';
    expect(parseXML(xml)).toBe('hello world');
  });

  it('should parse date', () => {
    const xml = '<llsd><date>2023-10-27T10:00:00Z</date></llsd>';
    expect(parseXML(xml)).toEqual(parseISO('2023-10-27T10:00:00Z'));
  });

  it('should parse uri', () => {
    const xml = '<llsd><uri>http://example.com</uri></llsd>';
    expect(parseXML(xml)).toBe('http://example.com');
  });

  it('should parse binary (base64)', () => {
    // "hello" in base64 is aGVsbG8=
    const xml = '<llsd><binary encoding="base64">aGVsbG8=</binary></llsd>';
    const result = parseXML(xml) as Uint8Array;
    expect(result).toBeInstanceOf(Uint8Array);
    expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]); // ASCII for h e l l o
  });

  it('should parse array of primitives', () => {
    const xml = `
      <llsd>
        <array>
          <integer>1</integer>
          <string>two</string>
          <boolean>true</boolean>
        </array>
      </llsd>
    `;
    expect(parseXML(xml)).toEqual([1, 'two', true]);
  });

  it('should parse map of primitives', () => {
    const xml = `
      <llsd>
        <map>
          <key>foo</key>
          <integer>42</integer>
          <key>bar</key>
          <string>test</string>
        </map>
      </llsd>
    `;
    expect(parseXML(xml)).toEqual({
      foo: 42,
      bar: 'test',
    });
  });

  it('should parse nested array and map', () => {
    const xml = `
      <llsd>
        <map>
          <key>items</key>
          <array>
            <map>
              <key>id</key><integer>1</integer>
            </map>
            <map>
              <key>id</key><integer>2</integer>
            </map>
          </array>
        </map>
      </llsd>
    `;
    expect(parseXML(xml)).toEqual({
      items: [
        { id: 1 },
        { id: 2 },
      ]
    });
  });

  it('should throw an error for malformed XML', () => {
    const xml = '<llsd><unclosed_tag></llsd>';
    expect(() => parseXML(xml)).toThrow(/XML Parse Error/);
  });

  it('should return null if <llsd> is missing', () => {
    const xml = '<otherroot><string>hello</string></otherroot>';
    expect(parseXML(xml)).toBeNull();
  });

  it('should return null if <llsd> is empty', () => {
    const xml = '<llsd></llsd>';
    expect(parseXML(xml)).toBeNull();
  });

  it('should return null for unknown tag', () => {
    const xml = '<llsd><unknown>value</unknown></llsd>';
    expect(parseXML(xml)).toBeNull();
import { detectFormat, LLSDFormat } from './llsd';

describe('detectFormat', () => {
  describe('XML Format', () => {
    it('should detect standard XML declaration', () => {
      expect(detectFormat('<?xml version="1.0" encoding="UTF-8"?>\n<llsd>...</llsd>')).toBe(LLSDFormat.XML);
    });
    it('should detect LLSD root element directly', () => {
      expect(detectFormat('<llsd><map><key>foo</key><string>bar</string></map></llsd>')).toBe(LLSDFormat.XML);
    });
    it('should ignore leading whitespace for XML', () => {
      expect(detectFormat('   \n  <?xml version="1.0"?>')).toBe(LLSDFormat.XML);
    });
  });

  describe('JSON Format', () => {
    it('should detect valid JSON object', () => {
      expect(detectFormat('{"key": "value"}')).toBe(LLSDFormat.JSON);
    });
    it('should detect valid JSON array', () => {
      expect(detectFormat('["value1", "value2"]')).toBe(LLSDFormat.JSON);
    });
    it('should ignore leading whitespace for JSON', () => {
      expect(detectFormat('   \n  {"key": "value"}')).toBe(LLSDFormat.JSON);
    });
  });

  describe('LLSD Notation Format', () => {
    describe('Prefix match', () => {
      it('should detect undefined/null (!)', () => {
        expect(detectFormat('!')).toBe(LLSDFormat.NOTATION);
      });
      it('should detect integers (i)', () => {
        expect(detectFormat("i'42'")).toBe(LLSDFormat.NOTATION);
        expect(detectFormat('i"42"')).toBe(LLSDFormat.NOTATION);
      });
      it('should detect reals (r)', () => {
        expect(detectFormat("r'3.14'")).toBe(LLSDFormat.NOTATION);
        expect(detectFormat('r"3.14"')).toBe(LLSDFormat.NOTATION);
      });
      it('should detect UUIDs (u)', () => {
        expect(detectFormat("u'd7f4aeca-88f1-4680-bcac-6a7f05c48873'")).toBe(LLSDFormat.NOTATION);
      });
      it('should detect dates (d)', () => {
        expect(detectFormat("d'2023-01-01T12:00:00Z'")).toBe(LLSDFormat.NOTATION);
      });
      it('should detect URIs/links (l)', () => {
        expect(detectFormat("l'http://example.com'")).toBe(LLSDFormat.NOTATION);
      });
      it('should detect binary data (b)', () => {
        expect(detectFormat("b'base64data'")).toBe(LLSDFormat.NOTATION);
      });
    });

    describe('Fallback from JSON-like structures', () => {
      it('should fallback to NOTATION for invalid JSON object', () => {
        expect(detectFormat('{key: "value"}')).toBe(LLSDFormat.NOTATION); // Invalid JSON, unquoted key
      });
      it('should fallback to NOTATION for invalid JSON array', () => {
        expect(detectFormat('["value1", value2]')).toBe(LLSDFormat.NOTATION); // Invalid JSON, unquoted string
      });
    });

    describe('Other notation structures', () => {
      it('should detect unquoted string (fallback)', () => {
        expect(detectFormat('someRandomString')).toBe(LLSDFormat.NOTATION);
      });
      it('should detect booleans (true/false) as NOTATION since they do not match XML/JSON starts', () => {
        expect(detectFormat('true')).toBe(LLSDFormat.NOTATION);
        expect(detectFormat('false')).toBe(LLSDFormat.NOTATION);
      });
      it('should detect plain numbers as NOTATION since they do not match XML/JSON starts', () => {
        expect(detectFormat('42')).toBe(LLSDFormat.NOTATION);
        expect(detectFormat('3.14')).toBe(LLSDFormat.NOTATION);
      });
    });
  });
});
