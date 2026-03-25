import { describe, it, expect } from 'vitest';
import { serializeXML } from './llsd';

describe('serializeXML', () => {
  it('serializes null to undef', () => {
    const xml = serializeXML(null);
    expect(xml).toContain('<undef />');
  });

  it('serializes boolean to boolean', () => {
    expect(serializeXML(true)).toContain('<boolean>true</boolean>');
    expect(serializeXML(false)).toContain('<boolean>false</boolean>');
  });

  it('serializes integers to integer', () => {
    expect(serializeXML(42)).toContain('<integer>42</integer>');
    expect(serializeXML(0)).toContain('<integer>0</integer>');
    expect(serializeXML(-1)).toContain('<integer>-1</integer>');
  });

  it('serializes floats to real', () => {
    expect(serializeXML(3.14)).toContain('<real>3.14</real>');
    expect(serializeXML(-0.5)).toContain('<real>-0.5</real>');
  });

  it('serializes Date to date', () => {
    const date = new Date('2023-10-01T12:00:00Z');
    const xml = serializeXML(date);
    expect(xml).toMatch(/<date>.*2023.*<\/date>/);
  });

  it('serializes Uint8Array to binary', () => {
    const bytes = new Uint8Array([104, 101, 108, 108, 111]); // 'hello'
    const xml = serializeXML(bytes);
    expect(xml).toContain('<binary encoding="base64">aGVsbG8=</binary>');
  });

  it('serializes Arrays', () => {
    const xml = serializeXML([1, "test"]);
    expect(xml).toContain('<array>');
    expect(xml).toContain('<integer>1</integer>');
    expect(xml).toContain('<string>test</string>');
    expect(xml).toContain('</array>');
  });

  it('serializes Maps', () => {
    const xml = serializeXML({ foo: "bar", baz: 42 });
    expect(xml).toContain('<map>');
    expect(xml).toContain('<key>foo</key>');
    expect(xml).toContain('<string>bar</string>');
    expect(xml).toContain('<key>baz</key>');
    expect(xml).toContain('<integer>42</integer>');
    expect(xml).toContain('</map>');
  });

  it('serializes strings to string', () => {
    expect(serializeXML("hello world")).toContain('<string>hello world</string>');
    expect(serializeXML("")).toContain('<string></string>');
  });

  it('serializes valid UUIDs to uuid', () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(serializeXML(uuid)).toContain(`<uuid>${uuid}</uuid>`);
  });

  it('serializes URIs to uri', () => {
    expect(serializeXML("http://example.com")).toContain('<uri>http://example.com</uri>');
    expect(serializeXML("https://secure.example.com")).toContain('<uri>https://secure.example.com</uri>');
  });

  it('includes xml declaration and root llsd element', () => {
    const xml = serializeXML("test");
    expect(xml).toMatch(/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<llsd>/);
    expect(xml).toMatch(/<\/llsd>$/);
  });
});
