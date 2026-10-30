import { describe, it, expect, beforeEach } from 'vitest';
import { OARParser } from '../OARParser';
import { GridConsole } from '../GridConsole';

describe('OARParser', () => {
  let consoleLog: GridConsole;
  let parser: OARParser;

  beforeEach(() => {
    consoleLog = new GridConsole();
    parser = new OARParser(consoleLog);
  });

  it('parses a single complete SceneObjectGroup XML element', () => {
    const xml = `
      <SceneObjectGroup>
        <Name>Custom Chair</Name>
        <Description>Comfortable wooden chair</Description>
        <GroupPosition><X>110.5</X><Y>120.25</Y><Z>25.0</Z></GroupPosition>
        <RotationOffset><X>0.1</X><Y>0.2</Y><Z>0.3</Z><W>0.9</W></RotationOffset>
        <Scale><X>1.5</X><Y>1.5</Y><Z>2.0</Z></Scale>
      </SceneObjectGroup>
    `;

    const prims = parser.parseSceneObjectXml(xml);
    expect(prims).toHaveLength(1);

    const prim = prims[0];
    expect(prim.name).toBe('Custom Chair');
    expect(prim.description).toBe('Comfortable wooden chair');
    expect(prim.position).toEqual({ x: 110.5, y: 120.25, z: 25.0 });
    expect(prim.rotation).toEqual({ x: 0.1, y: 0.2, z: 0.3, w: 0.9 });
    expect(prim.scale).toEqual({ x: 1.5, y: 1.5, z: 2.0 });
    expect(prim.shape).toBe('box');
    expect(prim.textureAssets).toEqual([]);
    expect(prim.id).toBeDefined();
  });

  it('parses multiple SceneObjectGroup elements in a single string', () => {
    const xml = `
      <SceneObjectGroup>
        <Name>Table</Name>
        <GroupPosition><X>10</X><Y>20</Y><Z>30</Z></GroupPosition>
      </SceneObjectGroup>
      <SceneObjectGroup>
        <Name>Lamp</Name>
        <GroupPosition><X>11</X><Y>21</Y><Z>31</Z></GroupPosition>
      </SceneObjectGroup>
      <SceneObjectGroup>
        <Name>Rug</Name>
        <GroupPosition><X>12</X><Y>22</Y><Z>32</Z></GroupPosition>
      </SceneObjectGroup>
    `;

    const prims = parser.parseSceneObjectXml(xml);
    expect(prims).toHaveLength(3);
    expect(prims.map((p) => p.name)).toEqual(['Table', 'Lamp', 'Rug']);
    expect(prims[0].position).toEqual({ x: 10, y: 20, z: 30 });
    expect(prims[1].position).toEqual({ x: 11, y: 21, z: 31 });
    expect(prims[2].position).toEqual({ x: 12, y: 22, z: 32 });
  });

  it('handles XML declarations (prolog) cleanly', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <SceneObjectGroup>
        <Name>Prolog Prim</Name>
      </SceneObjectGroup>`;

    const prims = parser.parseSceneObjectXml(xml);
    expect(prims).toHaveLength(1);
    expect(prims[0].name).toBe('Prolog Prim');
  });

  it('falls back to default values when optional tags or coordinates are missing', () => {
    const xml = `
      <SceneObjectGroup>
        <GroupPosition><X>50</X></GroupPosition>
      </SceneObjectGroup>
    `;

    const prims = parser.parseSceneObjectXml(xml);
    expect(prims).toHaveLength(1);

    const prim = prims[0];
    expect(prim.name).toBe('Object');
    expect(prim.description).toBe('');
    expect(prim.position).toEqual({ x: 50, y: 128, z: 22 });
    expect(prim.rotation).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(prim.scale).toEqual({ x: 0.5, y: 0.5, z: 0.5 });

    const debugLogs = consoleLog.getEntries({ level: 'debug' });
    expect(
      debugLogs.some((entry) => entry.message.includes('has no <Name>; imported as "Object"')),
    ).toBe(true);
  });

  it('handles empty and whitespace-only XML strings', () => {
    expect(parser.parseSceneObjectXml('')).toEqual([]);
    expect(parser.parseSceneObjectXml('   \n  \t ')).toEqual([]);
  });

  it('handles malformed XML structures without throwing exceptions', () => {
    const malformedXml = `<SceneObjectGroup><Name>Incomplete Prim</SceneObjectGroup`;
    expect(() => parser.parseSceneObjectXml(malformedXml)).not.toThrow();
  });

  it('parses large XML documents with 1,000 objects efficiently without main-thread stalls', () => {
    let largeXml = '<root>';
    for (let i = 0; i < 1000; i++) {
      largeXml += `
        <SceneObjectGroup>
          <Name>Prim ${i}</Name>
          <Description>Benchmarking object ${i}</Description>
          <GroupPosition><X>${i}</X><Y>128</Y><Z>22</Z></GroupPosition>
          <RotationOffset><X>0</X><Y>0</Y><Z>0</Z><W>1</W></RotationOffset>
          <Scale><X>1</X><Y>1</Y><Z>1</Z></Scale>
        </SceneObjectGroup>`;
    }
    largeXml += '</root>';

    const startTime = Date.now();
    const prims = parser.parseSceneObjectXml(largeXml);
    const durationMs = Date.now() - startTime;

    expect(prims).toHaveLength(1000);
    expect(prims[0].name).toBe('Prim 0');
    expect(prims[999].name).toBe('Prim 999');
    expect(prims[999].position.x).toBe(999);

    // Parsing 1,000 objects should complete well within 1,000 ms
    expect(durationMs).toBeLessThan(1000);
  });

  it('integrates properly with parseOAR when importing scene XML', async () => {
    const xml = `
      <SceneObjectGroup>
        <Name>House Prim</Name>
        <Description>Local House</Description>
        <GroupPosition><X>128</X><Y>128</Y><Z>25</Z></GroupPosition>
      </SceneObjectGroup>`;

    const result = await parser.parseOAR(xml);

    expect(result.metadata.regionName).toBe('Imported OAR Region');
    expect(result.region.prims).toHaveLength(1);
    expect(result.region.prims[0].name).toBe('House Prim');

    const infoLogs = consoleLog.getEntries({ level: 'info' });
    expect(infoLogs.some((entry) => entry.message.includes('Loaded 1 object(s)'))).toBe(true);
  });

  it('warns when parseOAR receives non-XML input without SceneObjectGroup elements', async () => {
    const result = await parser.parseOAR('plain text without scene objects');

    expect(result.region.prims).toHaveLength(0);

    const warnLogs = consoleLog.getEntries({ level: 'warn' });
    expect(
      warnLogs.some((entry) => entry.message.includes('No <SceneObjectGroup> elements found')),
    ).toBe(true);
  });
});
