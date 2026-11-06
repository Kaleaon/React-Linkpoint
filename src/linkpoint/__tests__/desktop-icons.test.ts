import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  encodeIcns,
  encodeIco,
  generateDesktopIcons,
  ICO_SIZES,
  REQUIRED_PNG_SIZES,
} from '../../../scripts/generate-desktop-icons.mjs';
import { validateElectronConfig } from '../../../scripts/validate-electron-config.mjs';

const rootDir = path.resolve(__dirname, '../../..');

describe('dynamic desktop icons generator', () => {
  it('generates all required PNG dimensions from canonical icon.svg', async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), 'desktop-icons-test-'));
    try {
      const outDir = path.join(tempDir, 'icons');
      const result = await generateDesktopIcons({
        rootDir,
        outDir,
        silent: true,
      });

      expect(result.outDir).toBe(outDir);
      for (const size of REQUIRED_PNG_SIZES) {
        const filePath = path.join(outDir, `${size}x${size}.png`);
        expect(existsSync(filePath)).toBe(true);

        const buf = readFileSync(filePath);
        // PNG magic signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
        expect(buf.subarray(0, 8)).toEqual(
          Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        );
        // Width and height in IHDR chunk
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        expect(width).toBe(size);
        expect(height).toBe(size);
      }

      // Default icon.png exists
      const iconPng = path.join(outDir, 'icon.png');
      expect(existsSync(iconPng)).toBe(true);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('assembles a valid multi-image ICO binary with correct header and max size', () => {
    const mockImages = ICO_SIZES.map((size) => {
      // Create minimal fake PNG payload
      const payload = Buffer.alloc(32, size);
      return { size, buffer: payload };
    });

    const ico = encodeIco(mockImages);
    expect(ico.readUInt16LE(0)).toBe(0); // reserved
    expect(ico.readUInt16LE(2)).toBe(1); // ICO type
    expect(ico.readUInt16LE(4)).toBe(mockImages.length);

    // Verify first entry (16x16)
    expect(ico.readUInt8(6)).toBe(16);
    expect(ico.readUInt8(7)).toBe(16);
    expect(ico.readUInt16LE(10)).toBe(1); // planes
    expect(ico.readUInt16LE(12)).toBe(32); // bpp
    expect(ico.readUInt32LE(14)).toBe(32); // buffer length

    // Verify 256x256 entry encoded as 0 per ICO specification
    const lastEntryOffset = 6 + (mockImages.length - 1) * 16;
    expect(ico.readUInt8(lastEntryOffset)).toBe(0); // 256 encoded as 0
    expect(ico.readUInt8(lastEntryOffset + 1)).toBe(0);
  });

  it('assembles a valid macOS ICNS bundle with correct chunk headers', () => {
    const testChunks = [
      { type: 'icp4', buffer: Buffer.from('test-png-16') },
      { type: 'ic07', buffer: Buffer.from('test-png-128') },
      { type: 'ic10', buffer: Buffer.from('test-png-1024') },
    ];

    const icns = encodeIcns(testChunks);
    expect(icns.toString('ascii', 0, 4)).toBe('icns');
    const totalLength = icns.readUInt32BE(4);
    expect(totalLength).toBe(icns.length);

    let offset = 8;
    for (const chunk of testChunks) {
      expect(icns.toString('ascii', offset, offset + 4)).toBe(chunk.type);
      const chunkLen = icns.readUInt32BE(offset + 4);
      expect(chunkLen).toBe(8 + chunk.buffer.length);
      expect(icns.subarray(offset + 8, offset + chunkLen).toString()).toBe(chunk.buffer.toString());
      offset += chunkLen;
    }
  });

  it('binds the generated icon path to BrowserWindow constructor in electron/main.cjs', () => {
    const mainCjsPath = path.resolve(rootDir, 'electron/main.cjs');
    const content = readFileSync(mainCjsPath, 'utf8');

    expect(content).toContain('icon: path.join(__dirname,');
    expect(content).toContain('build/icons/icon.png');
    // Ensure sharp is NOT imported into electron/main.cjs
    expect(content).not.toMatch(/require\(\s*['"]sharp['"]\s*\)/);
    expect(content).not.toMatch(/from\s+['"]sharp['"]/);
  });

  it('configures electron-builder.config.js with icon paths and files inclusions', () => {
    const configPath = path.resolve(rootDir, 'electron-builder.config.js');
    const content = readFileSync(configPath, 'utf8');

    expect(content).toContain("buildResources: 'build'");
    expect(content).toContain("icon: 'build/icons/icon.ico'");
    expect(content).toContain("icon: 'build/icons/icon.icns'");
    expect(content).toContain("icon: 'build/icons'");
    expect(content).toContain("'build/icons/**/*'");
  });

  it('integrates icon generation in scripts/build-desktop.mjs prior to electron-builder', () => {
    const buildDesktopPath = path.resolve(rootDir, 'scripts/build-desktop.mjs');
    const content = readFileSync(buildDesktopPath, 'utf8');

    const iconGenIndex = content.indexOf('scripts/generate-desktop-icons.mjs');
    const builderIndex = content.indexOf("'electron-builder'");

    expect(iconGenIndex).toBeGreaterThan(0);
    expect(builderIndex).toBeGreaterThan(iconGenIndex);
  });

  it('validates packaging through scripts/validate-electron-config.mjs successfully', () => {
    const config = validateElectronConfig({ cwd: rootDir });
    expect(config).toBeDefined();
    expect(config.files).toContain('build/icons/**/*');
    expect(existsSync(path.resolve(rootDir, 'build/icons/icon.ico'))).toBe(true);
    expect(existsSync(path.resolve(rootDir, 'build/icons/icon.icns'))).toBe(true);
    expect(existsSync(path.resolve(rootDir, 'build/icons/512x512.png'))).toBe(true);
  });
});
