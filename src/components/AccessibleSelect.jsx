import { AccessibleSelect } from '@linkpoint/design-system/react';

/**
 * AccessibleSelect component in src/components re-exporting the shared
 * AccessibleSelect from @linkpoint/design-system/react.
 *
 * Complies with WCAG 2.2 standards:
 * - WCAG 2.2 SC 2.1.1 Keyboard (https://www.w3.org/TR/WCAG22/#keyboard)
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 * - WCAG 2.2 SC 2.5.5 Target Size (Enhanced) (https://www.w3.org/TR/WCAG22/#target-size-enhanced)
 * - Anti-pattern F78 Prevention (https://www.w3.org/WAI/WCAG22/Techniques/failures/F78)
 */
export { AccessibleSelect };
export default AccessibleSelect;
