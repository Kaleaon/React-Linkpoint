#!/usr/bin/env node
/**
 * Dynamic desktop icon generator.
 *
 * Reads canonical crystal brand SVG from public/icons/icon.svg and rasterizes
 * platform icon assets for Windows, macOS, and Linux:
 *   - PNG icon set: 16, 32, 48, 64, 128, 256, 512, 1024 px
 *   - Multi-image Windows ICO file (16, 24, 32, 48, 64, 128, 256 px)
 *   - Apple ICNS bundle (icp4, icp5, icp6, ic07, ic08, ic09, ic10, ic11, ic12, ic13, ic14)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const here = fileURLToPath(import.meta.url);
const defaultRootDir = resolve(here, '../..');

export const REQUIRED_PNG_SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/**
 * Encodes an array of PNG buffers into a valid multi-image Windows ICO binary.
 *
 * @param {Array<{ size: number, buffer: Buffer }>} images
 * @returns {Buffer}
 */
export function encodeIco(images) {
  if (!images || images.length === 0) {
    throw new Error('encodeIco requires at least one image');
  }

  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let dataOffset = headerSize + count * dirEntrySize;

  const totalSize = dataOffset + images.reduce((acc, img) => acc + img.buffer.length, 0);
  const out = Buffer.alloc(totalSize);

  // ICONDIR Header
  out.writeUInt16LE(0, 0); // Reserved. Must always be 0.
  out.writeUInt16LE(1, 2); // Resource type: 1 for icon (.ICO)
  out.writeUInt16LE(count, 4); // Number of images

  // ICONDIRENTRY entries & image payload
  for (let i = 0; i < count; i++) {
    const { size, buffer } = images[i];
    const entryOffset = headerSize + i * dirEntrySize;

    // Width/Height: 0 means 256 pixels
    out.writeUInt8(size >= 256 ? 0 : size, entryOffset);
    out.writeUInt8(size >= 256 ? 0 : size, entryOffset + 1);
    out.writeUInt8(0, entryOffset + 2); // Color count (0 for >= 8bpp)
    out.writeUInt8(0, entryOffset + 3); // Reserved (0)
    out.writeUInt16LE(1, entryOffset + 4); // Color planes (1)
    out.writeUInt16LE(32, entryOffset + 6); // Bits per pixel (32 for RGBA)
    out.writeUInt32LE(buffer.length, entryOffset + 8); // Size of image data in bytes
    out.writeUInt32LE(dataOffset, entryOffset + 12); // Offset of image data from beginning of file

    buffer.copy(out, dataOffset);
    dataOffset += buffer.length;
  }

  return out;
}

/**
 * Encodes an array of typed PNG buffers into a macOS ICNS binary.
 *
 * @param {Array<{ type: string, buffer: Buffer }>} entries
 * @returns {Buffer}
 */
export function encodeIcns(entries) {
  if (!entries || entries.length === 0) {
    throw new Error('encodeIcns requires at least one entry');
  }

  let totalSize = 8; // 4 bytes magic + 4 bytes total length
  for (const entry of entries) {
    totalSize += 8 + entry.buffer.length;
  }

  const out = Buffer.alloc(totalSize);
  out.write('icns', 0, 4, 'ascii');
  out.writeUInt32BE(totalSize, 4);

  let offset = 8;
  for (const entry of entries) {
    const chunkLength = 8 + entry.buffer.length;
    out.write(entry.type, offset, 4, 'ascii');
    out.writeUInt32BE(chunkLength, offset + 4);
    entry.buffer.copy(out, offset + 8);
    offset += chunkLength;
  }

  return out;
}

/**
 * Main icon generation routine.
 *
 * @param {object} options
 * @param {string} [options.rootDir]
 * @param {string} [options.svgPath]
 * @param {string} [options.outDir]
 * @param {boolean} [options.silent]
 * @returns {Promise<{ outDir: string, generatedFiles: string[] }>}
 */
export async function generateDesktopIcons(options = {}) {
  const rootDir = options.rootDir ? resolve(options.rootDir) : defaultRootDir;
  const svgPath = options.svgPath
    ? resolve(options.svgPath)
    : resolve(rootDir, 'public/icons/icon.svg');
  const outDir = options.outDir ? resolve(options.outDir) : resolve(rootDir, 'build/icons');
  const buildDir = dirname(outDir);
  const log = options.silent ? () => {} : console.log;

  if (!existsSync(svgPath)) {
    throw new Error(`Canonical source SVG not found at ${svgPath}`);
  }

  mkdirSync(outDir, { recursive: true });
  mkdirSync(buildDir, { recursive: true });

  const svgBuffer = readFileSync(svgPath);
  const generatedFiles = [];

  log(`[generate-desktop-icons] Reading source SVG from ${svgPath}`);

  // 1. Generate required PNG sizes
  const pngBuffersBySize = new Map();
  for (const size of REQUIRED_PNG_SIZES) {
    const pngBuffer = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    pngBuffersBySize.set(size, pngBuffer);

    const filename = `${size}x${size}.png`;
    const targetFile = resolve(outDir, filename);
    writeFileSync(targetFile, pngBuffer);
    generatedFiles.push(targetFile);
  }

  // Write default icon.png (512x512) for BrowserWindow and desktop shortcuts
  const defaultPng =
    pngBuffersBySize.get(512) || (await sharp(svgBuffer).resize(512, 512).png().toBuffer());
  const iconPngPath = resolve(outDir, 'icon.png');
  writeFileSync(iconPngPath, defaultPng);
  generatedFiles.push(iconPngPath);

  const buildIconPngPath = resolve(buildDir, 'icon.png');
  writeFileSync(buildIconPngPath, defaultPng);
  generatedFiles.push(buildIconPngPath);

  // 2. Generate Windows multi-resolution ICO
  const icoImages = [];
  for (const size of ICO_SIZES) {
    let buf = pngBuffersBySize.get(size);
    if (!buf) {
      buf = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    }
    icoImages.push({ size, buffer: buf });
  }

  const icoBuffer = encodeIco(icoImages);
  const icoPath = resolve(outDir, 'icon.ico');
  writeFileSync(icoPath, icoBuffer);
  generatedFiles.push(icoPath);

  const buildIcoPath = resolve(buildDir, 'icon.ico');
  writeFileSync(buildIcoPath, icoBuffer);
  generatedFiles.push(buildIcoPath);

  // 3. Generate macOS ICNS bundle
  // Standard macOS icon types mapping to square PNG dimensions:
  const icnsTypeMap = [
    { type: 'icp4', size: 16 },
    { type: 'icp5', size: 32 },
    { type: 'ic11', size: 32 }, // 16x16@2x
    { type: 'icp6', size: 64 },
    { type: 'ic12', size: 64 }, // 32x32@2x
    { type: 'ic07', size: 128 },
    { type: 'ic08', size: 256 },
    { type: 'ic13', size: 256 }, // 128x128@2x
    { type: 'ic09', size: 512 },
    { type: 'ic14', size: 512 }, // 256x256@2x
    { type: 'ic10', size: 1024 }, // 512x512@2x / 1024x1024
  ];

  const icnsEntries = [];
  for (const { type, size } of icnsTypeMap) {
    let buf = pngBuffersBySize.get(size);
    if (!buf) {
      buf = await sharp(svgBuffer).resize(size, size).png().toBuffer();
    }
    icnsEntries.push({ type, buffer: buf });
  }

  const icnsBuffer = encodeIcns(icnsEntries);
  const icnsPath = resolve(outDir, 'icon.icns');
  writeFileSync(icnsPath, icnsBuffer);
  generatedFiles.push(icnsPath);

  const buildIcnsPath = resolve(buildDir, 'icon.icns');
  writeFileSync(buildIcnsPath, icnsBuffer);
  generatedFiles.push(buildIcnsPath);

  log(
    `[generate-desktop-icons] Successfully generated ${generatedFiles.length} icon assets in ${outDir} and ${buildDir}`,
  );

  return { outDir, buildDir, generatedFiles };
}

if (process.argv[1] && resolve(process.argv[1]) === here) {
  try {
    const customOutDir = process.argv[2] ? resolve(process.argv[2]) : undefined;
    await generateDesktopIcons({ outDir: customOutDir });
  } catch (err) {
    console.error(
      '[generate-desktop-icons] Failed to generate desktop icons:',
      err?.message || err,
    );
    process.exit(1);
  }
}
