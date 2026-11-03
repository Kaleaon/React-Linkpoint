import React, { useState, useCallback } from 'react';

export interface UseFocusRingOptions {
  /** Focus ring color token or CSS color (default: 'var(--pri, #6cff9a)') */
  ringColor?: string;
  /** Outline width in pixels (default: 2) */
  ringWidth?: number;
  /** Outline offset in pixels (default: 2) */
  ringOffset?: number;
  /** Border radius for outline alignment */
  borderRadius?: number | string;
  /** Initial focus state */
  autoFocus?: boolean;
  /** Additional focus event listener */
  onFocus?: (e: React.FocusEvent<any>) => void;
  /** Additional blur event listener */
  onBlur?: (e: React.FocusEvent<any>) => void;
}

export interface UseFocusRingResult {
  /** Whether the wrapped element currently has focus */
  isFocused: boolean;
  /** Synthetic focus and blur event handlers */
  focusProps: {
    onFocus: (e: React.FocusEvent<any>) => void;
    onBlur: (e: React.FocusEvent<any>) => void;
  };
  /** Precomputed style object applying compliant focus ring */
  focusRingStyle: React.CSSProperties;
}

/**
 * useFocusRing hook for managing focus visibility state and compliant focus outline styles.
 *
 * Complies with WCAG 2.2 Level AA & AAA standards:
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 * - WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) (https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)
 * - WCAG 2.2 SC 2.4.13 Focus Appearance (https://www.w3.org/TR/WCAG22/#focus-appearance)
 * - Technique C15: Using CSS to change the presentation of a user interface component when it receives focus
 * - Technique F78: Avoid styling element outlines in a way that removes the visual focus indicator
 */
export function useFocusRing(options: UseFocusRingOptions = {}): UseFocusRingResult {
  const {
    ringColor = 'var(--pri, #6cff9a)',
    ringWidth = 2,
    ringOffset = 2,
    borderRadius,
    autoFocus = false,
    onFocus,
    onBlur,
  } = options;

  const [isFocused, setIsFocused] = useState(autoFocus);

  const handleFocus = useCallback(
    (e: React.FocusEvent<any>) => {
      setIsFocused(true);
      onFocus?.(e);
    },
    [onFocus]
  );

  const handleBlur = useCallback(
    (e: React.FocusEvent<any>) => {
      setIsFocused(false);
      onBlur?.(e);
    },
    [onBlur]
  );

  const focusRingStyle: React.CSSProperties = isFocused
    ? {
        outline: `${ringWidth}px solid ${ringColor}`,
        outlineOffset: `${ringOffset}px`,
        ...(borderRadius !== undefined ? { borderRadius } : {}),
      }
    : {
        outline: undefined,
        outlineOffset: undefined,
      };

  return {
    isFocused,
    focusProps: {
      onFocus: handleFocus,
      onBlur: handleBlur,
    },
    focusRingStyle,
  };
}

export interface FocusRingProps {
  /** Single interactive React element child */
  children: React.ReactElement<any>;
  /** Focus ring color token or CSS color (default: 'var(--pri, #6cff9a)') */
  ringColor?: string;
  /** Outline width in pixels (default: 2) */
  ringWidth?: number;
  /** Outline offset in pixels (default: 2) */
  ringOffset?: number;
  /** Border radius for outline alignment */
  borderRadius?: number | string;
  /** Optional class name to append to the child element */
  className?: string;
  /** Optional inline styles to merge with child */
  style?: React.CSSProperties;
  /** Initial focus state */
  autoFocus?: boolean;
}

/**
 * FocusRing container wrapper component.
 *
 * Transparently clones an interactive child element to monitor focus and blur events,
 * applying WCAG 2.2 SC 2.4.7 compliant visual focus indicators while preserving DOM refs
 * and existing synthetic event bubbling.
 *
 * @see https://www.w3.org/TR/WCAG22/#focus-visible
 * @see https://www.w3.org/WAI/WCAG22/Techniques/css/C15
 * @see https://www.w3.org/WAI/WCAG22/Techniques/failures/F78
 */
export const FocusRing = React.forwardRef<HTMLElement, FocusRingProps>(function FocusRing(
  {
    children,
    ringColor = 'var(--pri, #6cff9a)',
    ringWidth = 2,
    ringOffset = 2,
    borderRadius,
    className,
    style,
    autoFocus = false,
  },
  forwardedRef
) {
  const resolvedChild = React.isValidElement(children)
    ? children
    : Array.isArray(children) && children.length === 1 && React.isValidElement(children[0])
      ? children[0]
      : null;

  if (!resolvedChild) {
    return (children as any) ?? null;
  }

  const childProps = resolvedChild.props as Record<string, any>;

  const { isFocused, focusProps } = useFocusRing({
    ringColor,
    ringWidth,
    ringOffset,
    borderRadius,
    autoFocus,
    onFocus: childProps.onFocus,
    onBlur: childProps.onBlur,
  });

  // Extract ref from childProps (React 19) or child.ref (React 18)
  const childRef = childProps.ref ?? (resolvedChild as any).ref;

  const mergedRef = useCallback(
    (node: any) => {
      if (typeof forwardedRef === 'function') {
        forwardedRef(node);
      } else if (forwardedRef && typeof forwardedRef === 'object' && 'current' in forwardedRef) {
        (forwardedRef as React.MutableRefObject<any>).current = node;
      }

      if (typeof childRef === 'function') {
        childRef(node);
      } else if (childRef && typeof childRef === 'object' && 'current' in childRef) {
        childRef.current = node;
      }
    },
    [forwardedRef, childRef]
  );

  const resolvedBorderRadius = borderRadius ?? childProps.style?.borderRadius;
  const baseTransition = style?.transition || childProps.style?.transition;

  const mergedStyle: React.CSSProperties = {
    ...childProps.style,
    ...style,
    ...(isFocused
      ? {
          outline: `${ringWidth}px solid ${ringColor}`,
          outlineOffset: `${ringOffset}px`,
          ...(resolvedBorderRadius !== undefined ? { borderRadius: resolvedBorderRadius } : {}),
        }
      : {}),
    transition: baseTransition
      ? `${baseTransition}, outline 0.15s ease, outline-offset 0.15s ease`
      : 'outline 0.15s ease, outline-offset 0.15s ease',
  };

  const mergedClassName = [childProps.className, className, isFocused ? 'linkpoint-focused' : '']
    .filter(Boolean)
    .join(' ');

  return React.cloneElement(resolvedChild, {
    ref: mergedRef,
    onFocus: focusProps.onFocus,
    onBlur: focusProps.onBlur,
    style: mergedStyle,
    className: mergedClassName || undefined,
    'data-focused': isFocused ? 'true' : undefined,
  } as any);
});

export default FocusRing;
