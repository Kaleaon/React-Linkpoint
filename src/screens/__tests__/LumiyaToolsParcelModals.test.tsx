import { afterEach, describe, expect, it } from 'vitest';
import { createElement, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { AppProvider } from '../../context/AppContext.jsx';
import { ThemeProvider } from '../../context/ThemeContext.jsx';
import { ParcelScreen } from '../LumiyaTools.jsx';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(createElement(AppProvider, null, createElement(ThemeProvider, null, ui)));
  });
  mounted = { host, root };
  return host;
}

afterEach(async () => {
  if (mounted) {
    await act(async () => {
      mounted!.root.unmount();
    });
    mounted.host.remove();
    mounted = null;
  }
});

describe('LumiyaTools Parcel Modals Focus Trap & Accessibility', () => {
  describe('Buy Parcel Confirmation Modal', () => {
    it('renders with role="dialog", aria-modal="true", and aria-labelledby', async () => {
      const host = await mount(<ParcelScreen />);
      const buyButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Buy Land...'),
      );
      expect(buyButton).toBeDefined();

      buyButton?.focus();
      await act(async () => {
        buyButton?.click();
      });

      const dialog = host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('buy-land-dialog-title');

      const title = host.querySelector('#buy-land-dialog-title');
      expect(title?.textContent).toContain('Confirm Parcel Purchase');
    });

    it('traps focus inside the modal and wraps Tab and Shift+Tab navigation', async () => {
      const host = await mount(<ParcelScreen />);
      const buyButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Buy Land...'),
      );
      buyButton?.focus();

      await act(async () => {
        buyButton?.click();
      });

      const priceInput = host.querySelector('#confirm-price-input') as HTMLInputElement;
      const areaInput = host.querySelector('#confirm-area-input') as HTMLInputElement;
      const cancelBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;
      const confirmBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Confirm Purchase'),
      ) as HTMLButtonElement;

      expect(priceInput).not.toBeNull();
      expect(areaInput).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(confirmBtn).not.toBeNull();

      // Autofocuses the first focusable element
      expect(document.activeElement).toBe(priceInput);

      // Focus last element (Confirm Purchase button) and press Tab -> wraps to first element
      confirmBtn.focus();
      expect(document.activeElement).toBe(confirmBtn);

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      expect(document.activeElement).toBe(priceInput);

      // Focus first element (priceInput) and press Shift+Tab -> wraps to last element
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(confirmBtn);
    });

    it('dismisses modal on Escape key press and restores focus to trigger button', async () => {
      const host = await mount(<ParcelScreen />);
      const buyButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Buy Land...'),
      );
      buyButton?.focus();
      expect(document.activeElement).toBe(buyButton);

      await act(async () => {
        buyButton?.click();
      });

      expect(host.querySelector('[role="dialog"]')).not.toBeNull();

      // Press Escape
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // Dialog is dismissed
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      // Focus restored to the trigger button
      expect(document.activeElement).toBe(buyButton);
    });

    it('dismisses modal when Cancel button is clicked and restores focus to trigger button', async () => {
      const host = await mount(<ParcelScreen />);
      const buyButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Buy Land...'),
      );
      buyButton?.focus();

      await act(async () => {
        buyButton?.click();
      });

      const cancelBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;

      await act(async () => {
        cancelBtn.click();
      });

      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(buyButton);
    });
  });

  describe('Subdivide Land Confirmation Modal', () => {
    it('renders with role="dialog", aria-modal="true", and aria-labelledby', async () => {
      const host = await mount(<ParcelScreen />);
      const subdivideButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Subdivide Land...'),
      );
      expect(subdivideButton).toBeDefined();

      subdivideButton?.focus();
      await act(async () => {
        subdivideButton?.click();
      });

      const dialog = host.querySelector('[role="dialog"]');
      expect(dialog).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal')).toBe('true');
      expect(dialog?.getAttribute('aria-labelledby')).toBe('subdivide-dialog-title');

      const title = host.querySelector('#subdivide-dialog-title');
      expect(title?.textContent).toContain('Confirm Land Subdivision');
    });

    it('traps focus inside the modal and wraps Tab and Shift+Tab navigation', async () => {
      const host = await mount(<ParcelScreen />);
      const subdivideButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Subdivide Land...'),
      );
      subdivideButton?.focus();

      await act(async () => {
        subdivideButton?.click();
      });

      const verticesTextarea = host.querySelector('#confirm-vertices-input') as HTMLTextAreaElement;
      const cancelBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;
      const confirmBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Confirm Subdivision'),
      ) as HTMLButtonElement;

      expect(verticesTextarea).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(confirmBtn).not.toBeNull();

      // Autofocuses the first focusable element
      expect(document.activeElement).toBe(verticesTextarea);

      // Focus last element (Confirm Subdivision button) and press Tab -> wraps to first element
      confirmBtn.focus();
      expect(document.activeElement).toBe(confirmBtn);

      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
      });
      expect(document.activeElement).toBe(verticesTextarea);

      // Focus first element (verticesTextarea) and press Shift+Tab -> wraps to last element
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
        );
      });
      expect(document.activeElement).toBe(confirmBtn);
    });

    it('dismisses modal on Escape key press and restores focus to trigger button', async () => {
      const host = await mount(<ParcelScreen />);
      const subdivideButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Subdivide Land...'),
      );
      subdivideButton?.focus();
      expect(document.activeElement).toBe(subdivideButton);

      await act(async () => {
        subdivideButton?.click();
      });

      expect(host.querySelector('[role="dialog"]')).not.toBeNull();

      // Press Escape
      await act(async () => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });

      // Dialog is dismissed
      expect(host.querySelector('[role="dialog"]')).toBeNull();
      // Focus restored to the trigger button
      expect(document.activeElement).toBe(subdivideButton);
    });

    it('dismisses modal when Cancel button is clicked and restores focus to trigger button', async () => {
      const host = await mount(<ParcelScreen />);
      const subdivideButton = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Subdivide Land...'),
      );
      subdivideButton?.focus();

      await act(async () => {
        subdivideButton?.click();
      });

      const cancelBtn = Array.from(host.querySelectorAll('button')).find((btn) =>
        btn.textContent?.includes('Cancel'),
      ) as HTMLButtonElement;

      await act(async () => {
        cancelBtn.click();
      });

      expect(host.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(subdivideButton);
    });
  });
});
