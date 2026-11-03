// @vitest-environment jsdom
import React, { createRef, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { FocusRing, useFocusRing } from '../components/FocusRing.js';
import { contrastRatio, meetsAA } from '../tokens/index.js';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let mounted: { host: HTMLElement; root: Root } | null = null;

async function mount(ui: React.ReactNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(ui);
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

describe('FocusRing and useFocusRing Accessibility Primitive', () => {
  it('Requirement 1 & WCAG 2.2 SC 2.4.7: renders visual focus outline when focused and removes on blur', async () => {
    const host = await mount(
      <FocusRing>
        <button type="button">Test Button</button>
      </FocusRing>
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.style.outline).toBe('');

    await act(async () => {
      button.focus();
    });
    expect(button.style.outline).toBe('2px solid var(--pri, #6cff9a)');
    expect(button.style.outlineOffset).toBe('2px');
    expect(button.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      button.blur();
    });
    expect(button.style.outline).toBe('');
    expect(button.getAttribute('data-focused')).toBeNull();
  });

  it('Requirement 4: supports custom ringColor, ringWidth, ringOffset, and borderRadius props', async () => {
    const host = await mount(
      <FocusRing
        ringColor="#ff00ff"
        ringWidth={4}
        ringOffset={3}
        borderRadius="8px"
      >
        <button type="button" style={{ borderRadius: '4px' }}>Custom Ring</button>
      </FocusRing>
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    await act(async () => {
      button.focus();
    });

    expect(button.style.outline).toBe('4px solid #ff00ff');
    expect(button.style.outlineOffset).toBe('3px');
    expect(button.style.borderRadius).toBe('8px');
  });

  it('supports explicit transition passed via style prop', async () => {
    const host = await mount(
      <FocusRing style={{ transition: 'opacity 0.3s ease' }}>
        <button type="button">Transition Test</button>
      </FocusRing>
    );

    const button = host.querySelector('button') as HTMLButtonElement;
    expect(button.style.transition).toContain('opacity 0.3s ease');
    expect(button.style.transition).toContain('outline 0.15s ease');
  });

  it('Constraint: preserves child ref and forwards component ref to the underlying DOM node', async () => {
    const focusRingRef = createRef<HTMLInputElement>();
    const childRef = createRef<HTMLInputElement>();

    const host = await mount(
      <FocusRing ref={focusRingRef}>
        <input ref={childRef} placeholder="Input field" />
      </FocusRing>
    );

    expect(focusRingRef.current).toBeInstanceOf(HTMLInputElement);
    expect(childRef.current).toBeInstanceOf(HTMLInputElement);
    expect(focusRingRef.current).toBe(childRef.current);
  });

  it('Constraint: invokes child onFocus and onBlur handlers without breaking event bubbling', async () => {
    const handleFocus = vi.fn();
    const handleBlur = vi.fn();

    const host = await mount(
      <FocusRing>
        <button type="button" onFocus={handleFocus} onBlur={handleBlur}>
          Event Test
        </button>
      </FocusRing>
    );

    const button = host.querySelector('button') as HTMLButtonElement;

    await act(async () => {
      button.focus();
    });
    expect(handleFocus).toHaveBeenCalledTimes(1);

    await act(async () => {
      button.blur();
    });
    expect(handleBlur).toHaveBeenCalledTimes(1);
  });

  it('supports useFocusRing hook directly on custom components', async () => {
    function CustomInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
      const { isFocused, focusProps, focusRingStyle } = useFocusRing({
        ringColor: '#00ffff',
        ringWidth: 3,
        ringOffset: 1,
        borderRadius: '6px',
        onFocus: props.onFocus,
        onBlur: props.onBlur,
      });

      return (
        <input
          {...props}
          {...focusProps}
          data-testid="custom-hook-input"
          data-focused={isFocused ? 'true' : undefined}
          style={{ ...props.style, ...focusRingStyle }}
        />
      );
    }

    const host = await mount(<CustomInput placeholder="Hook test" />);
    const input = host.querySelector('input') as HTMLInputElement;

    expect(input.style.outline).toBe('');

    await act(async () => {
      input.focus();
    });
    expect(input.style.outline).toBe('3px solid #00ffff');
    expect(input.style.outlineOffset).toBe('1px');
    expect(input.style.borderRadius).toBe('6px');

    await act(async () => {
      input.blur();
    });
    expect(input.style.outline).toBe('');
  });

  it('WCAG 2.2 SC 2.4.7 & SC 1.4.11: default focus ring token contrast meets AA on dark surfaces', () => {
    const darkBackground = '#0f172a';
    const primaryTokenFallback = '#6cff9a';

    const ratio = contrastRatio(primaryTokenFallback, darkBackground);
    expect(ratio).toBeGreaterThanOrEqual(3.0); // WCAG 2.2 Level AA for UI components
    expect(meetsAA(primaryTokenFallback, darkBackground)).toBe(true);
  });
});
