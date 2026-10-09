import React from "react";

/**
 * Shared key listener hook for keyboard accessibility on custom interactive elements.
 * Complies with WCAG 2.2 SC 2.1.1 Keyboard & SC 4.1.2 Name, Role, Value.
 *
 * @see https://www.w3.org/TR/WCAG22/#keyboard
 * @see https://www.w3.org/TR/WCAG22/#name-role-value
 * @see https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA3
 * @see https://www.w3.org/WAI/WCAG22/Techniques/general/G202
 */
export function useAccessibleButtonKeyHandler(
  onClick?: (e: React.SyntheticEvent) => void,
  disabled?: boolean
) {
  return (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!disabled && onClick) {
        onClick(e);
      }
    }
  };
}

export interface AccessibleButtonProps extends React.HTMLAttributes<HTMLElement> {
  /** The HTML tag or React component to render as (defaults to "div") */
  as?: "div" | "span" | "button" | React.ElementType;
  /** Whether the interactive element is disabled */
  disabled?: boolean;
  /** Click handler triggered by pointer click or Space/Enter keyboard presses */
  onClick?: (e: any) => void;
  /** ARIA role attribute (defaults to "button") */
  role?: string;
  /** Tab order index (defaults to 0 when enabled, -1 when disabled) */
  tabIndex?: number;
  /** Children node content */
  children?: React.ReactNode;
}

/**
 * AccessibleButton provides a standardized interactive container wrapper with
 * tabIndex, ARIA role attributes, pointer click handling, and Space/Enter keyboard listeners.
 *
 * WCAG 2.2 Compliance:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - Technique G202: Ensuring keyboard control for all functionality (https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
 * - Technique ARIA3: Identifying interactive elements with role="button" (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA3)
 */
export const AccessibleButton: React.FC<AccessibleButtonProps> = ({
  as: Component = "div",
  disabled = false,
  onClick,
  role = "button",
  tabIndex,
  onKeyDown,
  children,
  ...props
}) => {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (onKeyDown) {
      onKeyDown(e);
    }
    if (!e.defaultPrevented && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      if (!disabled && onClick) {
        onClick(e);
      }
    }
  };

  const computedTabIndex =
    role === "none" || role === "presentation"
      ? tabIndex
      : (tabIndex ?? (disabled ? -1 : 0));

  return (
    <Component
      role={role}
      tabIndex={computedTabIndex}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {children}
    </Component>
  );
};

export default AccessibleButton;
