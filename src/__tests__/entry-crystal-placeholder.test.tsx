// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { StrictMode, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import App from '../App';
import { CRYSTAL } from '../components/linkpointCrystal.js';

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

describe('Entry Document Pre-Hydration Crystal Placeholder (index.html)', () => {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const iconSvgPath = path.resolve(process.cwd(), 'public/icons/icon.svg');

  let activeRoot: Root | null = null;

  afterEach(async () => {
    if (activeRoot) {
      await act(async () => {
        activeRoot!.unmount();
      });
      activeRoot = null;
    }
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  const parseEntryHtml = (): Document => {
    const html = fs.readFileSync(indexPath, 'utf-8');
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  };

  it('defines critical dark background, centered flexbox layout, keyframes, and reduced-motion override in <head>', () => {
    const doc = parseEntryHtml();
    const styleEl = doc.head.querySelector('style');
    expect(styleEl).not.toBeNull();

    const cssText = styleEl?.textContent || '';

    // Keyframes and reduced-motion override matching src/index.css
    expect(cssText).toContain('@keyframes lpldTop');
    expect(cssText).toContain('@keyframes lpldBot');
    expect(cssText).toContain('@keyframes lpldCore');
    expect(cssText).toContain('@keyframes lpldRing');
    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssText).toContain('animation: none');
    expect(cssText).toContain('translateY(-64px)');
    expect(cssText).toContain('translateY(64px)');

    // Mount <style> and #root into active jsdom document to inspect computed styles before scripts execute
    document.head.appendChild(styleEl!.cloneNode(true));
    const parsedRoot = doc.getElementById('root');
    expect(parsedRoot).not.toBeNull();
    document.body.appendChild(parsedRoot!.cloneNode(true));

    const htmlComputed = window.getComputedStyle(document.documentElement);
    const bodyComputed = window.getComputedStyle(document.body);
    const rootEl = document.getElementById('root')!;
    const rootComputed = window.getComputedStyle(rootEl);

    expect(htmlComputed.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(bodyComputed.backgroundColor).toBe('rgb(0, 0, 0)');
    expect(rootComputed.backgroundColor).toBe('rgb(0, 0, 0)');

    expect(htmlComputed.height).toBe('100%');
    expect(bodyComputed.height).toBe('100%');
    expect(rootComputed.height).toBe('100%');

    expect(bodyComputed.marginTop).toBe('0px');
    expect(bodyComputed.overflow).toBe('hidden');

    expect(rootComputed.display).toBe('flex');
    expect(rootComputed.alignItems).toBe('center');
    expect(rootComputed.justifyContent).toBe('center');
  });

  it('embeds accessible inline SVG crystal mark inside #root with canonical geometry and icon gradients', () => {
    const doc = parseEntryHtml();
    const rootEl = doc.getElementById('root');
    expect(rootEl).not.toBeNull();

    const svg = rootEl?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(svg?.getAttribute('role')).toBe('status');
    expect(svg?.getAttribute('aria-label')).toBe('Loading Linkpoint');

    // Validate well-formed XML serialization of the embedded SVG
    const xmlParser = new DOMParser();
    const svgXmlDoc = xmlParser.parseFromString(svg!.outerHTML, 'image/svg+xml');
    expect(svgXmlDoc.querySelector('parsererror')).toBeNull();

    // Verify gradients match public/icons/icon.svg
    const iconDoc = xmlParser.parseFromString(
      fs.readFileSync(iconSvgPath, 'utf-8'),
      'image/svg+xml',
    );
    for (const gradId of ['face1Grad', 'face2Grad', 'face3Grad', 'face4Grad']) {
      const entryGrad = svg?.querySelector(`linearGradient#${gradId}`);
      const iconGrad = iconDoc.querySelector(`linearGradient#${gradId}`);
      expect(entryGrad).not.toBeNull();
      expect(iconGrad).not.toBeNull();
      expect(entryGrad?.getAttribute('x1')).toBe(iconGrad?.getAttribute('x1'));
      expect(entryGrad?.getAttribute('y1')).toBe(iconGrad?.getAttribute('y1'));
      expect(entryGrad?.getAttribute('x2')).toBe(iconGrad?.getAttribute('x2'));
      expect(entryGrad?.getAttribute('y2')).toBe(iconGrad?.getAttribute('y2'));

      const entryStops = Array.from(entryGrad!.querySelectorAll('stop')).map((s) => ({
        offset: s.getAttribute('offset'),
        color: s.getAttribute('stop-color'),
      }));
      const iconStops = Array.from(iconGrad!.querySelectorAll('stop')).map((s) => ({
        offset: s.getAttribute('offset'),
        color: s.getAttribute('stop-color'),
      }));
      expect(entryStops).toEqual(iconStops);
    }

    // Verify canonical geometry from src/components/linkpointCrystal.js
    const topGroup = svg?.querySelector('g.lpld-top');
    const botGroup = svg?.querySelector('g.lpld-bot');
    expect(topGroup).not.toBeNull();
    expect(botGroup).not.toBeNull();

    expect(topGroup?.querySelector(`polygon[points="${CRYSTAL.top.base}"]`)).not.toBeNull();
    for (const face of CRYSTAL.top.faces) {
      const poly = topGroup?.querySelector(`polygon[points="${face.points}"]`);
      expect(poly).not.toBeNull();
      expect(poly?.getAttribute('fill')).toBe(`url(#${face.grad})`);
    }
    expect(topGroup?.querySelector(`polyline[points="${CRYSTAL.top.ridge}"]`)).not.toBeNull();

    expect(botGroup?.querySelector(`polygon[points="${CRYSTAL.bot.base}"]`)).not.toBeNull();
    for (const face of CRYSTAL.bot.faces) {
      const poly = botGroup?.querySelector(`polygon[points="${face.points}"]`);
      expect(poly).not.toBeNull();
      expect(poly?.getAttribute('fill')).toBe(`url(#${face.grad})`);
    }

    expect(svg?.querySelector('circle.lpld-ring')).not.toBeNull();
    expect(svg?.querySelector('circle.lpld-core')).not.toBeNull();
  });

  it('replaces the pre-hydration SVG placeholder cleanly when React mounts via createRoot', async () => {
    const doc = parseEntryHtml();
    const styleEl = doc.head.querySelector('style')!;
    const parsedRoot = doc.getElementById('root')!;

    document.head.appendChild(styleEl.cloneNode(true));
    document.body.appendChild(parsedRoot.cloneNode(true));

    const rootEl = document.getElementById('root')!;
    expect(rootEl.querySelector('svg.lp-boot-crystal')).not.toBeNull();

    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    activeRoot = createRoot(rootEl);
    await act(async () => {
      activeRoot!.render(React.createElement(StrictMode, null, React.createElement(App)));
    });

    expect(rootEl.querySelector('svg.lp-boot-crystal')).toBeNull();
    expect(rootEl.querySelector('.device-frame')).not.toBeNull();
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
