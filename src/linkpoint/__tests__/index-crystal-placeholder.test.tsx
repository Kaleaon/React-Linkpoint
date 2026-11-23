// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import React, { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { CRYSTAL } from '../../components/linkpointCrystal.js';
import App from '../../App.tsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Web Entry Document Inline SVG Crystal Brand Placeholder', () => {
  const indexPath = path.resolve(process.cwd(), 'index.html');
  const manifestPath = path.resolve(process.cwd(), 'public/manifest.webmanifest');
  const iconSvgPath = path.resolve(process.cwd(), 'public/icons/icon.svg');

  const parseHtmlDom = (html: string): Document => {
    const parser = new DOMParser();
    return parser.parseFromString(html, 'text/html');
  };

  it('defines critical dark viewport styles, crystal keyframes, and prefers-reduced-motion rules in <head>', () => {
    const html = fs.readFileSync(indexPath, 'utf-8');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      background_color: string;
    };
    const doc = parseHtmlDom(html);

    const styleEl = doc.head.querySelector('style');
    expect(styleEl).not.toBeNull();
    const css = styleEl?.textContent || '';

    // Dark background matches manifest background_color (#0b1020)
    expect(manifest.background_color.toLowerCase()).toBe('#0b1020');
    expect(css.toLowerCase()).toContain('#0b1020');

    // Viewport centering rules scoped to placeholder wrapper
    expect(css).toContain('.lp-boot-placeholder');
    expect(css).toContain('display: flex');
    expect(css).toContain('align-items: center');
    expect(css).toContain('justify-content: center');
    expect(css).toContain('min-height: 100vh');

    // Keyframe animations matching src/index.css
    expect(css).toContain('@keyframes lpldTop');
    expect(css).toContain('@keyframes lpldBot');
    expect(css).toContain('@keyframes lpldCore');
    expect(css).toContain('@keyframes lpldRing');
    expect(css).toContain('.lpld-top');
    expect(css).toContain('.lpld-bot');
    expect(css).toContain('.lpld-core');
    expect(css).toContain('.lpld-ring');

    // Reduced motion query disables animation
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
  });

  it('embeds valid inline SVG inside #root with canonical crystal geometry, brand gradients, and ARIA compliance', () => {
    const html = fs.readFileSync(indexPath, 'utf-8');
    const iconSvgContent = fs.readFileSync(iconSvgPath, 'utf-8');
    const iconDoc = new DOMParser().parseFromString(iconSvgContent, 'image/svg+xml');
    const doc = parseHtmlDom(html);

    const root = doc.getElementById('root');
    expect(root).not.toBeNull();

    const svg = root?.querySelector('svg');
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute('viewBox')).toBe('0 0 512 512');
    expect(svg?.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg');
    expect(svg?.getAttribute('role')).toBe('img');
    expect(svg?.getAttribute('aria-label')).toBe('Loading Linkpoint');

    // Verify SVG itself parses cleanly as strict XML
    const xmlDoc = new DOMParser().parseFromString(svg!.outerHTML, 'image/svg+xml');
    expect(xmlDoc.querySelector('parsererror')).toBeNull();

    // Verify canonical brand gradients match public/icons/icon.svg
    ['face1Grad', 'face2Grad', 'face3Grad', 'face4Grad'].forEach((gradId) => {
      const placeholderGrad = svg?.querySelector(`linearGradient#${gradId}`);
      const canonicalGrad = iconDoc.querySelector(`linearGradient#${gradId}`);
      expect(placeholderGrad).not.toBeNull();
      expect(canonicalGrad).not.toBeNull();
      expect(placeholderGrad?.getAttribute('x1')).toBe(canonicalGrad?.getAttribute('x1'));
      expect(placeholderGrad?.getAttribute('y1')).toBe(canonicalGrad?.getAttribute('y1'));
      expect(placeholderGrad?.getAttribute('x2')).toBe(canonicalGrad?.getAttribute('x2'));
      expect(placeholderGrad?.getAttribute('y2')).toBe(canonicalGrad?.getAttribute('y2'));

      const placeholderStops = Array.from(placeholderGrad?.querySelectorAll('stop') || []).map(
        (s) => `${s.getAttribute('offset')}:${s.getAttribute('stop-color')}`,
      );
      const canonicalStops = Array.from(canonicalGrad?.querySelectorAll('stop') || []).map(
        (s) => `${s.getAttribute('offset')}:${s.getAttribute('stop-color')}`,
      );
      expect(placeholderStops).toEqual(canonicalStops);
    });

    // Brand color tokens present
    ['#6CFF9A', '#123B27', '#8AD0B0', '#365047'].forEach((token) => {
      expect(svg!.outerHTML).toContain(token);
    });

    // Canonical top & bottom crystal faces from linkpointCrystal.js
    CRYSTAL.top.faces.forEach((face) => {
      const poly = svg?.querySelector(`.lpld-top polygon[points="${face.points}"]`);
      expect(poly).not.toBeNull();
      expect(poly?.getAttribute('fill')).toBe(`url(#${face.grad})`);
    });

    CRYSTAL.bot.faces.forEach((face) => {
      const poly = svg?.querySelector(`.lpld-bot polygon[points="${face.points}"]`);
      expect(poly).not.toBeNull();
      expect(poly?.getAttribute('fill')).toBe(`url(#${face.grad})`);
    });

    // Canonical bases, top ridge, ring, and core
    expect(svg?.querySelector(`.lpld-top polygon[points="${CRYSTAL.top.base}"]`)).not.toBeNull();
    expect(svg?.querySelector(`.lpld-bot polygon[points="${CRYSTAL.bot.base}"]`)).not.toBeNull();
    expect(svg?.querySelector(`.lpld-top polyline[points="${CRYSTAL.top.ridge}"]`)).not.toBeNull();
    expect(svg?.querySelector('circle.lpld-ring')).not.toBeNull();
    expect(svg?.querySelector('circle.lpld-core')).not.toBeNull();
  });

  it('cleanly replaces placeholder markup when createRoot mounts <App />', async () => {
    const html = fs.readFileSync(indexPath, 'utf-8');
    const parsed = parseHtmlDom(html);
    const sourceRoot = parsed.getElementById('root')!;

    const host = document.createElement('div');
    host.id = 'root';
    host.innerHTML = sourceRoot.innerHTML;
    document.body.appendChild(host);

    // Pre-mount: placeholder exists inside #root
    expect(host.querySelector('.lp-boot-placeholder')).not.toBeNull();
    expect(host.querySelector('svg[aria-label="Loading Linkpoint"]')).not.toBeNull();

    const root = createRoot(host);
    try {
      await act(async () => {
        root.render(
          <StrictMode>
            <App />
          </StrictMode>,
        );
      });

      // Post-mount: placeholder is cleanly removed and replaced by App UI
      expect(host.querySelector('.lp-boot-placeholder')).toBeNull();
      expect(host.querySelector('svg[aria-label="Loading Linkpoint"]')).toBeNull();
      expect(host.querySelector('.device-frame')).not.toBeNull();
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
