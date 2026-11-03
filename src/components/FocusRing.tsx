import { FocusRing, useFocusRing } from '@linkpoint/design-system';
export type {
  FocusRingProps,
  UseFocusRingOptions,
  UseFocusRingResult,
} from '@linkpoint/design-system';

/**
 * FocusRing component in src/components re-exporting the shared FocusRing from @linkpoint/design-system.
 *
 * Complies with WCAG 2.2 Level AA standards:
 * - WCAG 2.2 SC 2.4.7 Focus Visible (https://www.w3.org/TR/WCAG22/#focus-visible)
 * - WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum) (https://www.w3.org/TR/WCAG22/#focus-not-obscured-minimum)
 * - WCAG 2.2 SC 2.4.13 Focus Appearance (Level AAA) (https://www.w3.org/TR/WCAG22/#focus-appearance)
 * - Technique C15: Using CSS to change the presentation of a user interface component when it receives focus
 * - Technique F78: Avoid styling element outlines in a way that removes the visual focus indicator
 */
export { FocusRing, useFocusRing };
export default FocusRing;
