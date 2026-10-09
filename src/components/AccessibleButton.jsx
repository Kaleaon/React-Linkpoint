import { AccessibleButton, useAccessibleButtonKeyHandler } from "@linkpoint/design-system/react";

/**
 * AccessibleButton component in src/components re-exporting the shared
 * AccessibleButton from @linkpoint/design-system/react.
 *
 * Complies with WCAG 2.2 Level A standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 4.1.2 Name, Role, Value (https://www.w3.org/TR/WCAG22/#name-role-value)
 * - Technique G202: Ensuring keyboard control for all functionality (https://www.w3.org/WAI/WCAG22/Techniques/general/G202)
 * - Technique ARIA3: Identifying interactive elements with role="button" (https://www.w3.org/WAI/WCAG22/Techniques/aria/ARIA3)
 */
export { AccessibleButton, useAccessibleButtonKeyHandler };
export default AccessibleButton;
