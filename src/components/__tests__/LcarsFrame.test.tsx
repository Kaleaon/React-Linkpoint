import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { ConsoleFrame, LayoutProvider } from '@linkpoint/design-system/react';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Shared LCARS console', () => {
  it('keeps readouts off the bars and provides keyboard navigation with an active state', async () => {
    const host = document.createElement('div');
    const root = createRoot(host);
    const pick = vi.fn();
    try {
      await act(async () =>
        root.render(
          createElement(LayoutProvider, {
            initialLayout: 'sweep',
            initialPalette: 'lcars',
            children: createElement(ConsoleFrame, {
              title: 'Viewer',
              subTitle: 'Disconnected',
              activeId: 'Settings',
              items: [{ id: 'Settings', label: 'Preferences', pick }],
              children: 'Content',
            }),
          }),
        ),
      );
      expect(host.querySelector('[data-lcars="title"]')?.textContent).toBe('Viewer');
      expect(host.querySelector('[data-lcars="readouts"]')?.textContent).toBe('Disconnected');
      expect(host.querySelector('[data-lcars="header-outer"]')?.textContent).toBe('');
      const button = host.querySelector('button')!;
      expect(button.getAttribute('aria-current')).toBe('page');
      expect(button.style.minHeight).toBe('48px');
      await act(async () => button.click());
      expect(pick).toHaveBeenCalledOnce();
    } finally {
      await act(async () => root.unmount());
    }
  });
});
