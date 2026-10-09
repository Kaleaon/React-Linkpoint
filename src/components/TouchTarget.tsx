import React from "react";

export interface TouchTargetProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children?: React.ReactNode;
  /** Minimum touch size in CSS pixels (default: 24 per WCAG 2.5.8 AA, or 44 if enhanced is true) */
  minSize?: number;
  /** If true, applies WCAG 2.5.5 AAA enhanced minimum size of 44px where space allows */
  enhanced?: boolean;
  /** Custom CSS padding to expand touch hitbox while keeping visual graphics compact (Technique C42) */
  padding?: string | number;
  /** Optional custom class name */
  className?: string;
  /** Inline style object */
  style?: React.CSSProperties;
}

/**
 * Reusable TouchTarget component encapsulating WCAG 2.5.8 (Level AA, min 24x24px)
 * and WCAG 2.5.5 (Level AAA, min 44x44px when enhanced) target sizing logic.
 *
 * Uses CSS padding and min-width / min-height to expand the interactive touch area
 * around compact icon graphics per WCAG Technique C42.
 */
export const TouchTarget = React.forwardRef<HTMLButtonElement, TouchTargetProps>(
  (
    {
      children,
      minSize,
      enhanced = false,
      padding = "4px",
      className = "",
      style,
      type = "button",
      disabled = false,
      ...restProps
    },
    ref
  ) => {
    const defaultMin = enhanced ? 44 : 24;
    const effectiveMinSize = Math.max(minSize ?? defaultMin, enhanced ? 44 : 24);

    const userMinWidth = style?.minWidth;
    const userMinHeight = style?.minHeight;

    let computedMinWidth = `${effectiveMinSize}px`;
    if (userMinWidth !== undefined) {
      if (typeof userMinWidth === "number") {
        computedMinWidth = `${Math.max(effectiveMinSize, userMinWidth)}px`;
      } else {
        const parsed = parseInt(String(userMinWidth), 10);
        computedMinWidth = !isNaN(parsed) && parsed < effectiveMinSize ? `${effectiveMinSize}px` : String(userMinWidth);
      }
    }

    let computedMinHeight = `${effectiveMinSize}px`;
    if (userMinHeight !== undefined) {
      if (typeof userMinHeight === "number") {
        computedMinHeight = `${Math.max(effectiveMinSize, userMinHeight)}px`;
      } else {
        const parsed = parseInt(String(userMinHeight), 10);
        computedMinHeight = !isNaN(parsed) && parsed < effectiveMinSize ? `${effectiveMinSize}px` : String(userMinHeight);
      }
    }

    const baseStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: typeof padding === "number" ? `${padding}px` : padding,
      boxSizing: "border-box",
      touchAction: "manipulation",
      cursor: disabled ? "not-allowed" : "pointer",
      position: "relative",
      flexShrink: 0,
      ...style,
      minWidth: computedMinWidth,
      minHeight: computedMinHeight,
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        className={`touch-target ${className}`.trim()}
        style={baseStyle}
        {...restProps}
      >
        {children}
      </button>
    );
  }
);

TouchTarget.displayName = "TouchTarget";

export default TouchTarget;
