import { ensureMinContrast } from './contrast.js';

export const THEME_STORAGE_KEY = 'linkpoint.custom-theme.v1';

export const EDITABLE_THEME_TOKENS = [
  ['pri', 'Primary'],
  ['sec', 'Secondary'],
  ['sec2', 'Accent'],
  ['bg', 'Background'],
  ['surf', 'Surface'],
  ['surf2', 'Raised surface'],
  ['ink', 'Text'],
  ['ink2', 'Muted text'],
  ['ok', 'Success'],
  ['warn', 'Warning'],
  ['err', 'Danger'],
];

const HEX = /^#[0-9a-f]{6}$/i;

export function sanitizeTheme(input) {
  if (!input || typeof input !== 'object') return null;
  const colors = {};
  for (const [key] of EDITABLE_THEME_TOKENS) {
    if (typeof input.colors?.[key] === 'string' && HEX.test(input.colors[key]))
      colors[key] = input.colors[key];
  }
  if (Object.keys(colors).length !== EDITABLE_THEME_TOKENS.length) return null;

  const bgSurface = colors.bg || '#000000';
  const surfSurface = colors.surf || bgSurface;
  const targetTokens = ['ink2', 'sec', 'sec2', 'bdg', 'outv', 'ok', 'err', 'warn', 'info'];
  for (const tok of targetTokens) {
    if (colors[tok]) {
      let adj = ensureMinContrast(colors[tok], bgSurface, 4.5);
      adj = ensureMinContrast(adj, surfSurface, 4.5);
      colors[tok] = adj;
    }
  }

  const layoutMode = ['grid', 'list', 'rail', 'split'].includes(input.layoutMode)
    ? input.layoutMode
    : 'grid';
  const density = ['compact', 'standard', 'comfortable'].includes(input.density)
    ? input.density
    : 'standard';
  const breakpoint = ['mobile', 'tablet', 'desktop'].includes(input.breakpoint)
    ? input.breakpoint
    : 'desktop';

  return {
    version: 1,
    active: true,
    name:
      String(input.name || 'My Linkpoint theme')
        .trim()
        .slice(0, 48) || 'My Linkpoint theme',
    colors,
    layoutMode,
    density,
    breakpoint,
  };
}

export function themeFromPalette(palette, name = 'My Linkpoint theme') {
  const colors = Object.fromEntries(EDITABLE_THEME_TOKENS.map(([key]) => [key, palette.c[key]]));
  const bgSurface = colors.bg || '#000000';
  const surfSurface = colors.surf || bgSurface;
  const targetTokens = ['ink2', 'sec', 'sec2', 'bdg', 'outv', 'ok', 'err', 'warn', 'info'];
  for (const tok of targetTokens) {
    if (colors[tok]) {
      let adj = ensureMinContrast(colors[tok], bgSurface, 4.5);
      adj = ensureMinContrast(adj, surfSurface, 4.5);
      colors[tok] = adj;
    }
  }

  return {
    version: 1,
    active: false,
    name,
    colors,
    layoutMode: 'grid',
    density: 'standard',
    breakpoint: 'desktop',
  };
}

export function readSavedTheme() {
  try {
    return sanitizeTheme(JSON.parse(localStorage.getItem(THEME_STORAGE_KEY)));
  } catch {
    return null;
  }
}

export function encodeSharedTheme(theme) {
  const bytes = new TextEncoder().encode(JSON.stringify(theme));
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

export function decodeSharedTheme(value) {
  try {
    const binary = atob(value.replaceAll('-', '+').replaceAll('_', '/'));
    return sanitizeTheme(
      JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)))),
    );
  } catch {
    return null;
  }
}
