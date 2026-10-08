// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import { app } from '../app';
import { buttonByText, click, mountScreen, typeInto, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

const worn = [
  { id: 'a', name: 'Ada Shape', assetType: 13, inventoryType: 18, category: 'body', typeName: 'Shape', worn: true },
  { id: 'b', name: 'Rain Jacket', assetType: 5, inventoryType: 18, category: 'clothing', typeName: 'Jacket', worn: true },
  { id: 'c', name: 'Left Wrist Watch', assetType: 6, inventoryType: 6, category: 'attachment', typeName: 'Attachment', worn: true },
];

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(app.auth, 'isLoggedIn').mockReturnValue(true);
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
  vi.restoreAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

describe('OutfitViewer screen', () => {
  it('renders the header and panel switcher', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    expect(mounted.host.textContent).toContain('FULL OUTFIT VIEWER');
    for (const label of [/3D View/, /Outfit Items/, /Shape/, /Mesh View/]) expect(buttonByText(mounted.host, label)).toBeTruthy();
  });

  it('shows only what the grid reports as worn, and no made-up items', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [{ id: 'o1', name: 'Beach day' }] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    const text = mounted.host.textContent || '';
    expect(text).toContain('WORN OUTFIT ITEMS (3)');
    expect(text).toContain('Rain Jacket');
    expect(text).toContain('Beach day');
    expect(text).not.toContain('Urban Casual');
    expect(text).not.toContain('Hazel Eyes');
  });

  it('says so when nothing is worn or the outfit cannot be loaded, instead of showing placeholders', async () => {
    vi.spyOn(app, 'loadOutfit').mockRejectedValue(new Error('inventory unavailable'));
    mounted = await mountScreen(OutfitViewer);
    expect(mounted.host.textContent).toContain('Your outfit could not be loaded: inventory unavailable');
    expect(mounted.host.textContent).toContain('WORN OUTFIT ITEMS (0)');
  });

  it('filters the real items and reloads on REFRESH', async () => {
    const load = vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    const filterInput = mounted.host.querySelector('input[placeholder="Filter outfit items..."]') as HTMLInputElement;
    await typeInto(filterInput, 'Jacket');
    expect(mounted.host.textContent).toContain('Rain Jacket');
    expect(mounted.host.textContent).not.toContain('Left Wrist Watch');
    const before = load.mock.calls.length;
    await click(buttonByText(mounted.host, 'REFRESH')!);
    expect(load.mock.calls.length).toBe(before + 1);
  });

  it('offers no controls that only pretend to wear items or edit the shape', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    const labels = [...mounted.host.querySelectorAll('button')].map((b) => b.textContent?.trim());
    expect(labels).not.toContain('WEAR');
    expect(labels).not.toContain('REPLACE OUTFIT');
    await click(buttonByText(mounted.host, /Shape/)!);
    expect(mounted.host.querySelector('input[type="range"]')).toBeNull();
    expect(mounted.host.textContent).not.toContain('Shape saved & applied');
    await click(buttonByText(mounted.host, /Mesh View/)!);
    expect(mounted.host.textContent).toContain('Attachments: 1');
    expect(mounted.host.textContent).not.toContain('14,280');
  });

  it('handles camera presets and auto-spin without a renderer', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    for (const label of ['Back', 'Face', 'Side', 'Full', 'Front']) await click(buttonByText(mounted.host, label)!);
    await click(buttonByText(mounted.host, /AUTO-SPIN/)!);
    expect(mounted.host.textContent).toContain('SPINNING');
  });
});
