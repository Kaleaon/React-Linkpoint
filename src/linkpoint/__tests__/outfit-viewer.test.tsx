// @vitest-environment jsdom
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import OutfitViewer from '../../screens/OutfitViewer.jsx';
import { app } from '../app';
import { slBridge } from '../sl-bridge';
import { buttonByText, click, mountScreen, typeInto, unmount, type Mounted } from './ui-helpers';

let mounted: Mounted | null = null;

const worn = [
  {
    id: 'a',
    name: 'Ada Shape',
    assetType: 13,
    inventoryType: 18,
    category: 'body',
    typeName: 'Shape',
    worn: true,
  },
  {
    id: 'b',
    name: 'Rain Jacket',
    assetType: 5,
    inventoryType: 18,
    category: 'clothing',
    typeName: 'Jacket',
    worn: true,
  },
  {
    id: 'c',
    name: 'Left Wrist Watch',
    assetType: 6,
    inventoryType: 6,
    category: 'attachment',
    typeName: 'Attachment',
    worn: true,
  },
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
    for (const label of [/3D View/, /Outfit Items/, /Shape/, /Mesh View/])
      expect(buttonByText(mounted.host, label)).toBeTruthy();
  });

  it('renders camera preset buttons with minimum 24px touch targets and aria-pressed states', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    const presets = [
      { name: 'front', label: 'Front' },
      { name: 'back', label: 'Back' },
      { name: 'face', label: 'Face' },
      { name: 'side', label: 'Side' },
      { name: 'full', label: 'Full' },
    ];
    for (const preset of presets) {
      const btn = mounted.host.querySelector(
        `button[aria-label="View ${preset.label} camera angle"]`,
      ) as HTMLButtonElement;
      expect(btn).toBeTruthy();
      expect(btn.style.minWidth).toBe('24px');
      expect(btn.style.minHeight).toBe('24px');
      if (preset.name === 'front') {
        expect(btn.getAttribute('aria-pressed')).toBe('true');
      } else {
        expect(btn.getAttribute('aria-pressed')).toBe('false');
      }
    }

    const backBtn = mounted.host.querySelector(
      'button[aria-label="View Back camera angle"]',
    ) as HTMLButtonElement;
    await click(backBtn);
    expect(backBtn.getAttribute('aria-pressed')).toBe('true');
    const frontBtn = mounted.host.querySelector(
      'button[aria-label="View Front camera angle"]',
    ) as HTMLButtonElement;
    expect(frontBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('shows only what the grid reports as worn, and no made-up items', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: worn,
      outfits: [{ id: 'o1', name: 'Beach day' }],
    });
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
    expect(mounted.host.textContent).toContain(
      'Your outfit could not be loaded: inventory unavailable',
    );
    expect(mounted.host.textContent).toContain('WORN OUTFIT ITEMS (0)');
  });

  it('filters the real items and reloads on REFRESH', async () => {
    const load = vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    const filterInput = mounted.host.querySelector(
      'input[placeholder="Filter outfit items..."]',
    ) as HTMLInputElement;
    await typeInto(filterInput, 'Jacket');
    expect(mounted.host.textContent).toContain('Rain Jacket');
    expect(mounted.host.textContent).not.toContain('Left Wrist Watch');
    const before = load.mock.calls.length;
    await click(buttonByText(mounted.host, 'REFRESH')!);
    expect(load.mock.calls.length).toBe(before + 1);
  });

  it('takes off clothing but offers nothing for body parts, and changes go to the grid', async () => {
    const items = [
      { ...worn[0], linkedId: 'x' },
      { ...worn[1], id: 'cccccccc-0000-0000-0000-000000000001', linkedId: 'y' },
    ];
    const load = vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items, outfits: [] });
    const remove = vi
      .spyOn(slBridge, 'removeWorn')
      .mockResolvedValue({ removed: 'Rain Jacket', baked: true });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    const takeOff = [...mounted.host.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === 'TAKE OFF',
    );
    expect(takeOff).toHaveLength(1); // the shape has none
    const before = load.mock.calls.length;
    await click(takeOff[0]);
    expect(remove).toHaveBeenCalledWith({ linkId: 'cccccccc-0000-0000-0000-000000000001' });
    expect(load.mock.calls.length).toBeGreaterThan(before);
    expect(mounted.host.textContent).toContain('Took off Rain Jacket.');
  });

  it('wears a saved outfit and reports when the appearance rebuild is not confirmed', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({
      items: [],
      outfits: [{ id: 'o1', name: 'Beach day' }],
    });
    const wear = vi
      .spyOn(slBridge, 'wearOutfit')
      .mockResolvedValue({ worn: 3, baked: false, reason: 'Wrong COF version' });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Outfit Items/)!);
    await click(buttonByText(mounted.host, 'WEAR OUTFIT')!);
    expect(wear).toHaveBeenCalledWith({ folderId: 'o1' });
    expect(mounted.host.textContent).toContain(
      'appearance rebuild was not confirmed: Wrong COF version',
    );
  });

  it('shows the real shape values and saves edits as a new shape', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    vi.spyOn(slBridge, 'fetchShape').mockResolvedValue({
      itemId: 'i',
      name: 'Ada Shape',
      values: { 33: 0.5 },
    });
    const save = vi
      .spyOn(slBridge, 'saveShape')
      .mockResolvedValue({ saved: 'Ada Shape (edited)', baked: true });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Shape/)!);
    const height = mounted.host.querySelector('input[aria-label="Height"]') as HTMLInputElement;
    expect(height).toBeTruthy();
    expect(Number(height.value)).toBeCloseTo(0.5);
    expect(mounted.host.textContent).toContain('Ada Shape');
    await click(buttonByText(mounted.host, /SAVE AS NEW SHAPE/)!);
    expect(save).toHaveBeenCalledWith({ values: expect.objectContaining({ 33: 0.5 }) });
  });

  it('says so when the shape cannot be read, with no made-up sliders', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    vi.spyOn(slBridge, 'fetchShape').mockRejectedValue(new Error('No shape is worn'));
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Shape/)!);
    expect(mounted.host.textContent).toContain('Your shape could not be read: No shape is worn');
    expect(mounted.host.querySelector('input[type="range"]')).toBeNull();
  });

  it('shows real counts in the mesh view and no invented statistics', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: worn, outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    await click(buttonByText(mounted.host, /Mesh View/)!);
    expect(mounted.host.textContent).toContain('Attachments: 1');
    expect(mounted.host.textContent).not.toContain('14,280');
  });

  it('handles camera presets and auto-spin without a renderer', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);
    for (const label of ['Back', 'Face', 'Side', 'Full', 'Front'])
      await click(buttonByText(mounted.host, label)!);
    await click(buttonByText(mounted.host, /AUTO-SPIN/)!);
    expect(mounted.host.textContent).toContain('SPINNING');
  });

  it('consumes ThemeContext tokens for viewport overlays and responds to theme switches', async () => {
    vi.spyOn(app, 'loadOutfit').mockResolvedValue({ items: [], outfits: [] });
    mounted = await mountScreen(OutfitViewer);

    const statusBanner = mounted.host.querySelector('div[role="status"]') as HTMLElement;
    expect(statusBanner).toBeTruthy();

    const cameraLabel = [...mounted.host.querySelectorAll('span')].find(
      (s) => s.textContent?.trim() === 'CAMERA:',
    ) as HTMLElement;
    expect(cameraLabel).toBeTruthy();

    const controlBar = cameraLabel.closest('div')?.parentElement as HTMLElement;
    expect(controlBar).toBeTruthy();
    expect(controlBar.style.backdropFilter).toBe('blur(6px)');

    const frontBtn = buttonByText(mounted.host, 'Front') as HTMLButtonElement;
    const backBtn = buttonByText(mounted.host, 'Back') as HTMLButtonElement;
    const autoSpinBtn = buttonByText(mounted.host, /AUTO-SPIN/) as HTMLButtonElement;
    const resetBtn = buttonByText(mounted.host, 'RESET') as HTMLButtonElement;

    // Initially under default palette (ink):
    // Status banner uses V.surf and V.ink
    expect(statusBanner.style.background).not.toBe('rgba(15, 23, 42, 0.85)');
    expect(statusBanner.style.color).not.toBe('#cbd5e1');

    // Control bar container uses V.surf
    expect(controlBar.style.background).not.toBe('rgba(15, 23, 42, 0.85)');

    // CAMERA label uses V.ink2
    expect(cameraLabel.style.color).not.toBe('#94a3b8');

    // Selected preset (Front) uses V.pri
    expect(frontBtn.style.background).not.toBe('transparent');
    expect(frontBtn.style.border).toContain('solid');

    // Unselected preset (Back) uses transparent background and V.ink
    expect(backBtn.style.background).toBe('transparent');
    expect(backBtn.style.color).not.toBe('#cbd5e1');

    // Auto-spin button inactive uses V.ink and transparent background
    expect(autoSpinBtn.style.color).not.toBe('#cbd5e1');
    expect(autoSpinBtn.style.background).toBe('transparent');

    // Reset button uses V.ink and not hardcoded slate
    expect(resetBtn.style.color).not.toBe('#cbd5e1');

    // Activate Auto-spin
    await click(autoSpinBtn);
    expect(autoSpinBtn.textContent).toContain('SPINNING');
    expect(autoSpinBtn.style.background).not.toBe('rgba(168, 85, 247, 0.3)');
    expect(autoSpinBtn.style.background).not.toBe('transparent');

    // Click back preset to change selection
    await click(backBtn);
    expect(backBtn.style.background).not.toBe('transparent');
    expect(frontBtn.style.background).toBe('transparent');

    // Now switch palette to a daylight theme (paper)
    const initialBg = controlBar.style.background;
    await act(async () => {
      mounted!.ctx.current.actions.setPalette('paper');
    });

    // Theme switching should update the overlay colors dynamically
    expect(controlBar.style.background).not.toBe(initialBg);
  });
});
