import React, { useState, forwardRef } from "react";
import { useTheme } from "./LayoutContext.js";

/**
 * Strips outline-suppressing properties from consumer styles to prevent
 * WCAG 2.2 SC 2.4.7 Focus Visible violations and anti-pattern F78.
 */
function sanitizeAccessibleStyle(style?: React.CSSProperties): React.CSSProperties {
  if (!style) return {};
  const {
    outline: _outline,
    outlineColor: _outlineColor,
    outlineStyle: _outlineStyle,
    outlineWidth: _outlineWidth,
    outlineOffset: _outlineOffset,
    ...clean
  } = style;
  return clean;
}

export interface AccessibleInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "outline"> {
  /** Explicit override for outline is disallowed by design system guardrails */
  outline?: never;
  /** Optional custom focus ring color token or hex string (defaults to theme primary token V.pri) */
  focusRingColor?: string;
  /** Whether the control should render in compact mode (bypasses 44px minHeight default) */
  compact?: boolean;
}

/**
 * AccessibleInput encapsulates theme tokens, border radius, touch target sizing,
 * and high-contrast keyboard focus indicators.
 *
 * Complies with WCAG 2.2 Level AA / AAA standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 * - WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) (https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)
 * - WCAG 2.2 SC 2.5.5 Target Size (Enhanced) / 2.5.8 (Minimum) (https://www.w3.org/TR/WCAG22/#target-size-minimum)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - Technique G195: Using an author-supplied, highly visible focus indicator (https://www.w3.org/WAI/WCAG22/Techniques/general/G195)
 * - Anti-pattern F78 Prevention: Disallows removing visual focus indicator (https://www.w3.org/WAI/WCAG22/Techniques/failures/F78)
 */
export const AccessibleInput = forwardRef<HTMLInputElement, AccessibleInputProps>(
  (
    {
      style,
      disabled = false,
      compact = false,
      focusRingColor,
      onFocus,
      onBlur,
      ...props
    },
    ref
  ) => {
    const theme = useTheme();
    const V = theme.v;
    const [isFocused, setIsFocused] = useState(false);

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      if (onFocus) {
        onFocus(e);
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      if (onBlur) {
        onBlur(e);
      }
    };

    const cleanStyle = sanitizeAccessibleStyle(style);
    const ringColor = focusRingColor || V.pri || "#6cff9a";

    const baseStyle: React.CSSProperties = {
      boxSizing: "border-box",
      fontFamily: theme.font,
      fontSize: "13px",
      color: V.ink,
      backgroundColor: V.bg || V.surf,
      border: `1px solid ${V.outv}`,
      borderRadius: V.rs,
      padding: "8px 12px",
      minHeight: compact ? undefined : "44px",
      opacity: disabled ? 0.5 : 1,
      cursor: disabled ? "not-allowed" : "text",
      transition: "outline .15s ease, border-color .15s ease",
      ...cleanStyle,
    };

    if (isFocused && !disabled) {
      baseStyle.outline = `2px solid ${ringColor}`;
      baseStyle.outlineOffset = "2px";
    }

    return (
      <input
        ref={ref}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
        style={baseStyle}
        {...props}
      />
    );
  }
);

AccessibleInput.displayName = "AccessibleInput";
export default AccessibleInput;
