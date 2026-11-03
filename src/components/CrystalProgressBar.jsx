import { CrystalProgressBar } from '@linkpoint/design-system/react';

/**
 * CrystalProgressBar component for standardized Linkpoint brand styling across loading and downloading workflows.
 * Supports numerical percentage values from 0 to 100 with smooth transitions, theme custom properties,
 * and standard crystal brand visual assets.
 *
 * @param {Object} props
 * @param {number | null | undefined} [props.progress=0] - Percentage value between 0 and 100
 * @param {string | number} [props.height="6px"] - Height of the progress track bar
 * @param {boolean} [props.showLabel=false] - Whether to render progress text & percentage header
 * @param {string} [props.label="Downloading asset data..."] - Label text rendered in progress header
 * @param {string} [props.className=""] - Additional CSS class name
 * @param {import('react').CSSProperties} [props.style={}] - Inline style overrides for outer wrapper
 * @param {string} [props.ariaLabel] - Custom ARIA label for accessibility
 */
export { CrystalProgressBar };
export default CrystalProgressBar;
