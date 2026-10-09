// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import {
  AccessibleButton,
  useAccessibleButtonKeyHandler,
} from '../../components/AccessibleButton.jsx';
import { mountScreen, unmount, type Mounted } from './ui-helpers.js';
import fs from 'node:fs';
import path from 'node:path';

let mounted: Mounted | null = null;

beforeAll(() => {
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(async () => {
  await unmount(mounted);
  mounted = null;
});

describe('AccessibleButton Component (WCAG 2.2 SC 2.1.1 & 4.1.2)', () => {
  it('renders with role="button" and tabIndex={0} by default', async () => {
    const Component = () => (
      <AccessibleButton aria-label="Action Button">Click Me</AccessibleButton>
    );

    mounted = await mountScreen(Component);
    const btn = mounted.host.querySelector('[role="button"]') as HTMLElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute('tabindex')).toBe('0');
    expect(btn.getAttribute('aria-label')).toBe('Action Button');
    expect(btn.textContent).toBe('Click Me');
  });

  it('supports rendering as custom HTML tag ("span") and custom role', async () => {
    const Component = () => (
      <AccessibleButton as="span" role="switch" aria-checked={true} aria-label="Toggle Switch">
        Toggle
      </AccessibleButton>
    );

    mounted = await mountScreen(Component);
    const el = mounted.host.querySelector('span[role="switch"]') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.tagName).toBe('SPAN');
    expect(el.getAttribute('aria-checked')).toBe('true');
  });

  it('triggers onClick on mouse click', async () => {
    const handleClick = vi.fn();
    const Component = () => <AccessibleButton onClick={handleClick}>Action</AccessibleButton>;

    mounted = await mountScreen(Component);
    const btn = mounted.host.querySelector('[role="button"]') as HTMLElement;

    await act(async () => {
      btn.click();
    });

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('triggers onClick and prevents default on Enter and Space keypresses', async () => {
    const handleClick = vi.fn();
    const Component = () => (
      <AccessibleButton onClick={handleClick}>Keyboard Action</AccessibleButton>
    );

    mounted = await mountScreen(Component);
    const btn = mounted.host.querySelector('[role="button"]') as HTMLElement;

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      btn.dispatchEvent(enterEvent);
    });
    expect(enterEvent.defaultPrevented).toBe(true);
    expect(handleClick).toHaveBeenCalledTimes(1);

    const spaceEvent = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    await act(async () => {
      btn.dispatchEvent(spaceEvent);
    });
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(handleClick).toHaveBeenCalledTimes(2);

    const arrowEvent = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      btn.dispatchEvent(arrowEvent);
    });
    expect(arrowEvent.defaultPrevented).toBe(false);
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('handles disabled state correctly (tabIndex={-1}, aria-disabled="true", suppresses onClick)', async () => {
    const handleClick = vi.fn();
    const Component = () => (
      <AccessibleButton disabled={true} onClick={handleClick}>
        Disabled Button
      </AccessibleButton>
    );

    mounted = await mountScreen(Component);
    const btn = mounted.host.querySelector('[role="button"]') as HTMLElement;

    expect(btn.getAttribute('tabindex')).toBe('-1');
    expect(btn.getAttribute('aria-disabled')).toBe('true');

    await act(async () => {
      btn.click();
    });
    expect(handleClick).not.toHaveBeenCalled();

    const enterEvent = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      btn.dispatchEvent(enterEvent);
    });
    expect(handleClick).not.toHaveBeenCalled();
  });
});

describe('AccessibleButton W3C Specification Documentation', () => {
  it('contains official W3C specification URLs in AccessibleButton component files', () => {
    const dsPath = path.resolve(
      __dirname,
      '../../../packages/design-system/src/react/AccessibleButton.tsx',
    );
    const appPath = path.resolve(__dirname, '../../components/AccessibleButton.jsx');

    for (const filePath of [dsPath, appPath]) {
      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toContain('https://www.w3.org/TR/WCAG22/#keyboard');
      expect(content).toContain('https://www.w3.org/TR/WCAG22/#name-role-value');
      expect(content).toContain('https://www.w3.org/WAI/WCAG22/Techniques/aria/');
    }
  });
});
