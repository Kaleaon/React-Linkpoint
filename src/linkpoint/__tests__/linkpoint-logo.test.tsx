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
    const svg = mounted.host.querySelector('#linkpoint-logo-react');
    expect(svg).not.toBeNull();

    // SMIL tag checks
    const animates = mounted.host.querySelectorAll('animate');
    const animateMotions = mounted.host.querySelectorAll('animateMotion');
    const mpaths = mounted.host.querySelectorAll('mpath');

    expect(animates.length).toBe(0);
    expect(animateMotions.length).toBe(0);
    expect(mpaths.length).toBe(0);
  });

  it('includes GPU compositor properties and will-change performance hints in SVG CSS', async () => {
    mounted = await mountScreen(LinkpointLogo);
    const styleEl = mounted.host.querySelector('style');
    expect(styleEl).not.toBeNull();
    const cssText = styleEl?.textContent || '';

    expect(cssText).toContain('will-change: transform');
    expect(cssText).toContain('will-change: opacity');
    expect(cssText).toContain('@keyframes topCloseSeq');
    expect(cssText).toContain('@keyframes botCloseSeq');
    expect(cssText).toContain('@keyframes corePulseR');
    expect(cssText).toContain('rotate(180deg) scale(0.6)');
    expect(cssText).toContain('@keyframes moteRotate');
    expect(cssText).toContain('@keyframes moteNearFade');
    expect(cssText).toContain('@keyframes moteFarFade');
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
    const logoSvg = header?.querySelector('svg');
    expect(logoSvg).not.toBeNull();
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
});
