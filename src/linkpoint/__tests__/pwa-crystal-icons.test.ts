// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { CRYSTAL } from '../../components/linkpointCrystal.js';

describe('PWA Brand Crystal Icon Assets', () => {
  const iconSvgPath = path.resolve(process.cwd(), 'public/icons/icon.svg');
  const iconMaskableSvgPath = path.resolve(process.cwd(), 'public/icons/icon-maskable.svg');
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const swPath = path.resolve(process.cwd(), 'public/service-worker.js');

  const brandTokens = {
    pri: '#6CFF9A',
    priC: '#123B27',
    sec2: '#8AD0B0',
    sec: '#365047',
  };

  const parseSvgDom = (content: string): Document => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(content, 'image/svg+xml');
    const parserError = doc.querySelector('parsererror');
    if (parserError) {
      throw new Error(`SVG XML Parsing Error: ${parserError.textContent}`);
    }
    return doc;
  };

  it('public/icons/icon.svg has valid XML, 512x512 viewBox, brand tokens, and canonical crystal geometry', () => {
    expect(fs.existsSync(iconSvgPath)).toBe(true);
    const content = fs.readFileSync(iconSvgPath, 'utf-8');
    const doc = parseSvgDom(content);

    const svg = doc.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(svg?.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');

    // Background rect
    const bgRect = svg?.querySelector('rect');
    expect(bgRect).not.toBeNull();
    expect(bgRect?.getAttribute('width')).toBe('512');
    expect(bgRect?.getAttribute('height')).toBe('512');
    expect(bgRect?.getAttribute('rx')).toBe('112');
    expect(bgRect?.getAttribute('fill')).toBe('#0f172a');

    // Brand color tokens present in gradient definitions and styles
    Object.values(brandTokens).forEach((token) => {
      expect(content).toContain(token);
    });

    // Verify absence of legacy generic avatar blues
    expect(content).not.toContain('#38bdf8');
    expect(content).not.toContain('#22d3ee');
    expect(content).not.toContain('#e2e8f0');

    // Canonical top faces geometry
    CRYSTAL.top.faces.forEach((face) => {
      const polygon = svg?.querySelector(`polygon[points="${face.points}"]`);
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute('points')).toBe(face.points);
    });

    // Canonical bot faces geometry
    CRYSTAL.bot.faces.forEach((face) => {
      const polygon = svg?.querySelector(`polygon[points="${face.points}"]`);
      expect(polygon).not.toBeNull();
      expect(polygon?.getAttribute('points')).toBe(face.points);
    });

    // Bases and ridge
    expect(svg?.querySelector(`polygon[points="${CRYSTAL.top.base}"]`)).not.toBeNull();
    expect(svg?.querySelector(`polygon[points="${CRYSTAL.bot.base}"]`)).not.toBeNull();
    expect(svg?.querySelector(`polyline[points="${CRYSTAL.top.ridge}"]`)).not.toBeNull();
  });

  it('public/icons/icon-maskable.svg has full-bleed background and scaled crystal within 80% safe zone (<= 409px)', () => {
    expect(fs.existsSync(iconMaskableSvgPath)).toBe(true);
    const content = fs.readFileSync(iconMaskableSvgPath, 'utf-8');
    const doc = parseSvgDom(content);

    const svg = doc.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 512 512');

    // Full-bleed background rect (no corner rounding rx/ry)
    const bgRect = svg?.querySelector('rect');
    expect(bgRect).not.toBeNull();
    expect(bgRect?.getAttribute('width')).toBe('512');
    expect(bgRect?.getAttribute('height')).toBe('512');
    expect(bgRect?.getAttribute('rx')).toBeNull();
    expect(bgRect?.getAttribute('ry')).toBeNull();
    expect(bgRect?.getAttribute('fill')).toBe('#0f172a');

    // Brand color tokens present
    Object.values(brandTokens).forEach((token) => {
      expect(content).toContain(token);
    });

    // Parse matrix transform or scale
    const crystalGroup = svg?.querySelector('.crystal-mark');
    expect(crystalGroup).not.toBeNull();
    const transform = crystalGroup?.getAttribute('transform') || '';
    const matrixMatch = transform.match(
      /matrix\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/,
    );
    expect(matrixMatch).not.toBeNull();

    const a = parseFloat(matrixMatch![1]);
    const d = parseFloat(matrixMatch![4]);
    const e = parseFloat(matrixMatch![5]);
    const f = parseFloat(matrixMatch![6]);

    expect(a).toBe(0.8);
    expect(d).toBe(0.8);
    expect(e).toBe(51.2);
    expect(f).toBe(51.2);

    // Collect all vertex points across all polygons and polylines inside crystal group
    const pointsElements = Array.from(crystalGroup?.querySelectorAll('polygon, polyline') || []);
    expect(pointsElements.length).toBeGreaterThan(0);

    const transformedVertices: Array<{ x: number; y: number }> = [];

    pointsElements.forEach((el) => {
      const pointsAttr = el.getAttribute('points') || '';
      const pairs = pointsAttr.trim().split(/\s+/);
      pairs.forEach((pair) => {
        const [rawX, rawY] = pair.split(',').map((n) => parseFloat(n));
        if (!isNaN(rawX) && !isNaN(rawY)) {
          const transformedX = a * rawX + e;
          const transformedY = d * rawY + f;
          transformedVertices.push({ x: transformedX, y: transformedY });
        }
      });
    });

    expect(transformedVertices.length).toBeGreaterThan(0);

    const safeZoneRadius = 204.8; // 80% circle radius: 512 * 0.4
    const safeZoneDiameter = 409.6; // 80% safe zone diameter
    const minPadding = 51.2; // 10% padding from edge
    const maxBound = 512 - minPadding; // 460.8

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    transformedVertices.forEach(({ x, y }) => {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);

      // Verify safe-zone boundary padding (at least 10% margin on all sides)
      expect(x).toBeGreaterThanOrEqual(minPadding);
      expect(x).toBeLessThanOrEqual(maxBound);
      expect(y).toBeGreaterThanOrEqual(minPadding);
      expect(y).toBeLessThanOrEqual(maxBound);

      // Verify each vertex is strictly within the inner 80% circular safe zone
      const distanceToCenter = Math.hypot(x - 256, y - 256);
      expect(distanceToCenter).toBeLessThanOrEqual(safeZoneRadius);
    });

    const totalWidth = maxX - minX;
    const totalHeight = maxY - minY;
    expect(totalWidth).toBeLessThanOrEqual(safeZoneDiameter);
    expect(totalHeight).toBeLessThanOrEqual(safeZoneDiameter);
  });

  it('verifies manifest, html favicon, and service worker icon caching references', () => {
    interface ManifestIcon {
      src: string;
      sizes?: string;
      type?: string;
      purpose?: string;
    }

    // 1. Web manifest
    const manifestJson = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifestJson.icons).toBeInstanceOf(Array);
    const anyIcon = manifestJson.icons.find((i: ManifestIcon) => i.purpose === 'any');
    const maskableIcon = manifestJson.icons.find((i: ManifestIcon) => i.purpose === 'maskable');

    expect(anyIcon).toBeDefined();
    expect(anyIcon.src).toBe('./icons/icon.svg');
    expect(anyIcon.type).toBe('image/svg+xml');

    expect(maskableIcon).toBeDefined();
    expect(maskableIcon.src).toBe('./icons/icon-maskable.svg');
    expect(maskableIcon.type).toBe('image/svg+xml');

    // 2. Document head favicon link
    const indexHtml = fs.readFileSync(indexPath, 'utf-8');
    expect(indexHtml).toContain('<link rel="icon" type="image/svg+xml" href="./icons/icon.svg" />');
    expect(indexHtml).toContain('<link rel="manifest" href="./manifest.webmanifest" />');

    // 3. Service worker static cache
    const swContent = fs.readFileSync(swPath, 'utf-8');
    expect(swContent).toContain("'./icons/icon.svg'");
    expect(swContent).toContain("'./icons/icon-maskable.svg'");
  });
});
