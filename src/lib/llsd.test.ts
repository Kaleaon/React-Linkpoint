import { describe, it, expect } from 'vitest';
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
