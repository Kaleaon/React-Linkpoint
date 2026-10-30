// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import LinkpointLogo from '../../components/LinkpointLogo.jsx';
import { CRYSTAL } from '../../components/linkpointCrystal.js';
import Login from '../../screens/Login.jsx';
import DesktopChrome from '../../components/DesktopChrome.jsx';
import {
  StackHead,
  SweepHead,
  PivotHead,
  RuleHead,
  EditorialHead,
} from '../../components/Header.jsx';
import { mountScreen, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

describe('Modernized CSS LinkpointLogo Component', () => {
  it('renders SVG logo without any SMIL tags', async () => {
    mounted = await mountScreen(LinkpointLogo);
    const svg = mounted.host.querySelector('svg');
    expect(svg).not.toBeNull();

    // SMIL tag checks
    const animates = mounted.host.querySelectorAll('animate');
    const animateMotions = mounted.host.querySelectorAll('animateMotion');
    const mpaths = mounted.host.querySelectorAll('mpath');

    expect(animates.length).toBe(0);
    expect(animateMotions.length).toBe(0);
    expect(mpaths.length).toBe(0);
  });

  it('renders SVG gradients and filters with valid colon-free dynamic IDs', async () => {
    mounted = await mountScreen(LinkpointLogo);
    const svg = mounted.host.querySelector('svg');
    expect(svg).not.toBeNull();

    const linearGradients = Array.from(mounted.host.querySelectorAll('linearGradient'));
    const radialGradients = Array.from(mounted.host.querySelectorAll('radialGradient'));
    const filters = Array.from(mounted.host.querySelectorAll('filter'));

    expect(linearGradients).toHaveLength(4);
    expect(radialGradients).toHaveLength(1);
    expect(filters).toHaveLength(1);

    const ids = [
      ...linearGradients.map((el) => el.getAttribute('id')),
      ...radialGradients.map((el) => el.getAttribute('id')),
      ...filters.map((el) => el.getAttribute('id')),
    ];

    ids.forEach((id) => {
      expect(id).toBeTruthy();
      expect(id).not.toContain(':');
    });

    const polygons = Array.from(mounted.host.querySelectorAll('polygon'));
    polygons.forEach((poly) => {
      const fill = poly.getAttribute('fill');
      if (fill && fill.startsWith('url(#')) {
        expect(fill).toMatch(/^url\(#lplg-[^:]+-face[1-4]\)$/);
      }
    });

    const coreCircle = mounted.host.querySelector('.core-anim-r circle');
    expect(coreCircle?.getAttribute('fill')).toMatch(/^url\(#lplg-[^:]+-core-glow\)$/);
  });

  it('generates unique SVG element IDs when rendered concurrently', async () => {
    mounted = await mountScreen(() => (
      <div>
        <LinkpointLogo />
        <LinkpointLogo />
      </div>
    ));

    const svgs = Array.from(mounted.host.querySelectorAll('svg'));
    expect(svgs).toHaveLength(2);

    const allGradientsAndFilters = Array.from(
      mounted.host.querySelectorAll('linearGradient, radialGradient, filter'),
    );
    const allIds = allGradientsAndFilters.map((el) => el.getAttribute('id'));

    expect(allIds).toHaveLength(12);
    expect(new Set(allIds).size).toBe(12);
  });

  it('supports explicit idPrefix prop for deterministic testing and overrides', async () => {
    mounted = await mountScreen(() => <LinkpointLogo idPrefix="test-logo:1" />);

    const svg = mounted.host.querySelector('svg#test-logo1');
    expect(svg).not.toBeNull();

    const grad1 = mounted.host.querySelector('linearGradient#test-logo1-face1');
    const coreGlow = mounted.host.querySelector('radialGradient#test-logo1-core-glow');
    const filter = mounted.host.querySelector('filter#test-logo1-glow');

    expect(grad1).not.toBeNull();
    expect(coreGlow).not.toBeNull();
    expect(filter).not.toBeNull();

    const coreCircle = mounted.host.querySelector('.core-anim-r circle');
    expect(coreCircle?.getAttribute('fill')).toBe('url(#test-logo1-core-glow)');
  });

  it('includes GPU compositor properties and will-change performance hints in SVG CSS when animated', async () => {
    mounted = await mountScreen(LinkpointLogo);
    const styleEl = mounted.host.querySelector('style');
    expect(styleEl).not.toBeNull();
    const cssText = styleEl?.textContent || '';

    expect(cssText).toContain('will-change: transform;');
    expect(cssText).not.toContain('will-change: opacity');
    expect(cssText).toContain('@keyframes topCloseSeq');
    expect(cssText).toContain('@keyframes botCloseSeq');
    expect(cssText).toContain('@keyframes corePulseR');
    expect(cssText).toContain('rotate(180deg) scale(0.6)');
    expect(cssText).toContain('@keyframes moteRotate');
    expect(cssText).toContain('@keyframes moteNearFade');
    expect(cssText).toContain('@keyframes moteFarFade');
  });

  it('sets will-change: auto for static logos when animated prop is false', async () => {
    mounted = await mountScreen(() => <LinkpointLogo animated={false} />);
    const styleEl = mounted.host.querySelector('style');
    expect(styleEl).not.toBeNull();
    const cssText = styleEl?.textContent || '';

    // Verify static logo class rules emit will-change: auto
    expect(cssText).toContain('.top-crystal-r {\n          will-change: auto;');
    expect(cssText).toContain('.bot-crystal-r {\n          will-change: auto;');
    expect(cssText).toContain('.mote-rotator-group {\n          will-change: auto;');

    // Verify active property hints are omitted in static logo rules
    expect(cssText).not.toContain('will-change: transform;');
    expect(cssText).not.toContain('will-change: opacity');
  });

  it('contains prefers-reduced-motion media query for accessibility', async () => {
    mounted = await mountScreen(LinkpointLogo);
    const styleEl = mounted.host.querySelector('style');
    const cssText = styleEl?.textContent || '';

    expect(cssText).toContain('@media (prefers-reduced-motion: reduce)');
    expect(cssText).toContain('animation: none !important');
  });

  it('toggles title display based on showTitle prop', async () => {
    mounted = await mountScreen(() => <LinkpointLogo showTitle={false} />);
    const titleText = mounted.host.querySelector('.logo-title-r');
    expect(titleText).toBeNull();
    await unmount(mounted);

    mounted = await mountScreen(() => <LinkpointLogo showTitle={true} />);
    const titleText2 = mounted.host.querySelector('.logo-title-r');
    expect(titleText2).not.toBeNull();
    expect(titleText2?.textContent).toBe('LINKPOINT');
  });

  it('linkpointCrystal.js dataset contains static geometry and footprint is under 3 KB', () => {
    expect(CRYSTAL.top.base).toBeDefined();
    expect(CRYSTAL.bot.base).toBeDefined();
    expect(CRYSTAL.top.faces.length).toBe(4);
    expect(CRYSTAL.bot.faces.length).toBe(4);

    const serialized = JSON.stringify(CRYSTAL);
    expect(serialized.length).toBeLessThan(3000);
  });

  it('renders LinkpointLogo in Login screen above title text', async () => {
    mounted = await mountScreen(Login);
    const header = mounted.host.querySelector('header');
    expect(header).not.toBeNull();
    const logoSvg = header?.querySelector('svg') as SVGElement | null;
    expect(logoSvg).not.toBeNull();
    expect(logoSvg?.style.width).toBe('64px');
    expect(logoSvg?.style.height).toBe('64px');
    const title = header?.querySelector('h1');
    expect(title?.textContent).toBe('LINKPOINT');
  });

  it('renders LinkpointLogo crystal mark in all header modes with max height <= 28px', async () => {
    const modes = [
      {
        name: 'StackHead',
        Component: () => <StackHead title="CHAT" subtitle="Global channel" scr="Chat" />,
        maxHeight: 28,
      },
      {
        name: 'SweepHead',
        Component: () => <SweepHead title="FRIENDS" subtitle="Contacts list" />,
        maxHeight: 24,
      },
      {
        name: 'PivotHead',
        Component: () => <PivotHead title="RADAR" subtitle="Nearby avatars" scr="Radar" />,
        maxHeight: 28,
      },
      {
        name: 'RuleHead',
        Component: () => <RuleHead title="SETTINGS" subtitle="Preferences" />,
        maxHeight: 20,
      },
      {
        name: 'EditorialHead',
        Component: () => <EditorialHead title="INVENTORY" subtitle="Assets" />,
        maxHeight: 28,
      },
    ];

    for (const mode of modes) {
      mounted = await mountScreen(mode.Component);
      const svg = mounted.host.querySelector('svg') as SVGElement | null;
      expect(svg, `${mode.name} should render LinkpointLogo`).not.toBeNull();
      const styleHeight = svg?.style.height;
      const numericHeight = styleHeight ? parseInt(styleHeight, 10) : 0;
      expect(numericHeight).toBeGreaterThan(0);
      expect(numericHeight).toBeLessThanOrEqual(28);
      await unmount(mounted);
      mounted = null;
    }
  });

  it('renders 20px LinkpointLogo brand mark emblem in DesktopChrome location bar', async () => {
    mounted = await mountScreen(DesktopChrome);
    const locationBar = mounted.host.querySelector('.desktop-location-bar');
    expect(locationBar).not.toBeNull();
    const emblem = locationBar?.querySelector('.desktop-brand-emblem');
    expect(emblem).not.toBeNull();
    const logoSvg = emblem?.querySelector('svg') as SVGElement | null;
    expect(logoSvg).not.toBeNull();
    expect(logoSvg?.style.height).toBe('20px');
  });

  it('supports explicit id prop to override the SVG element id', async () => {
    mounted = await mountScreen(() => <LinkpointLogo id="custom-logo-id" />);
    const svg = mounted.host.querySelector('svg#custom-logo-id');
    expect(svg).not.toBeNull();
  });

  it('generates HTML preview artifact for animated vs static logo instances', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const mountedAnimated = await mountScreen(() => (
      <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', width: '300px' }}>
        <h2
          style={{
            color: '#fff',
            fontFamily: 'sans-serif',
            fontSize: '16px',
            marginBottom: '12px',
          }}
        >
          Animated Logo (animated=true)
        </h2>
        <LinkpointLogo animated={true} showTitle={false} width="200" height="200" />
      </div>
    ));
    const animatedHtml = mountedAnimated.host.innerHTML;
    await unmount(mountedAnimated);

    const mountedStatic = await mountScreen(() => (
      <div style={{ background: '#0f172a', padding: '20px', borderRadius: '8px', width: '300px' }}>
        <h2
          style={{
            color: '#fff',
            fontFamily: 'sans-serif',
            fontSize: '16px',
            marginBottom: '12px',
          }}
        >
          Static Logo (animated=false)
        </h2>
        <LinkpointLogo animated={false} showTitle={false} width="200" height="200" />
      </div>
    ));
    const staticHtml = mountedStatic.host.innerHTML;
    await unmount(mountedStatic);

    const doc = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>LinkpointLogo Will-Change Verification</title>
<style>
body { background: #020617; font-family: sans-serif; color: #fff; padding: 40px; }
.container { display: flex; gap: 40px; }
</style>
</head>
<body>
<h1>LinkpointLogo Will-Change Verification</h1>
<div class="container">
  ${animatedHtml}
  ${staticHtml}
</div>
</body>
</html>`;

    const previewPath = path.resolve(process.cwd(), 'logo_preview.html');
    try {
      fs.writeFileSync(previewPath, doc);
      expect(fs.existsSync(previewPath)).toBe(true);
      expect(fs.readFileSync(previewPath, 'utf-8')).toContain(
        'LinkpointLogo Will-Change Verification',
      );
    } finally {
      if (fs.existsSync(previewPath)) {
        fs.unlinkSync(previewPath);
      }
    }
  });
});
