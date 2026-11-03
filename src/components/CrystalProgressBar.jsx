import React, { forwardRef } from 'react';
import { CrystalProgressBar as DesignCrystalProgressBar } from '@linkpoint/design-system/react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * @typedef {Object} CrystalProgressBarProps
 * @property {number | null | undefined} [progress=0] - Percentage value between 0 and 100
 * @property {string | number} [height] - Height of the progress track bar (defaults to 4px for 'state-block', 6px for 'default')
 * @property {boolean} [showLabel=false] - Whether to render progress text & percentage header
 * @property {string} [label="Downloading asset data..."] - Label text rendered in progress header
 * @property {string} [className=""] - Additional CSS class name
 * @property {import('react').CSSProperties} [style={}] - Inline style overrides for outer wrapper
 * @property {string} [ariaLabel] - Custom ARIA label for accessibility
 * @property {'default' | 'state-block'} [variant='default'] - Variant preset layout ('default' or 'state-block')
 * @property {boolean} [isFailed=false] - Whether teleport or loading failed
 * @property {boolean} [error=false] - Alias for isFailed to render error styling
 * @property {any} [tokens] - Optional theme tokens override
 */

/**
 * @typedef {Object} CrystalProgressBarHandle
 * @property {(pct: number) => void} updateProgress - Updates progress imperatively without React re-renders.
 * @property {HTMLElement | null} track - Direct reference to the track DOM element.
 * @property {HTMLElement | null} fill - Direct reference to the fill DOM element.
 * @property {HTMLElement | null} label - Direct reference to the label DOM element.
 * @property {HTMLElement | null} [container] - Direct reference to the outer container DOM element.
 */

/**
 * CrystalProgressBar component for standardized Linkpoint brand styling across loading and downloading workflows.
 * Supports numerical percentage values from 0 to 100 with smooth transitions, theme custom properties,
 * and standard crystal brand visual assets.
 *
 * @param {CrystalProgressBarProps} props
 * @param {React.ForwardedRef<CrystalProgressBarHandle>} ref
 */
function CrystalProgressBarWrapper(props, ref) {
  const theme = useTheme?.();
  const V = props.tokens !== undefined ? props.tokens : theme?.V;
  return <DesignCrystalProgressBar ref={ref} tokens={V} {...props} />;
}

export const CrystalProgressBar = forwardRef(CrystalProgressBarWrapper);

export default CrystalProgressBar;
