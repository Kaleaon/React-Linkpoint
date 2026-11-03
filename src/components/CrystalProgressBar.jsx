import React from 'react';
import { CrystalProgressBar as DesignCrystalProgressBar } from '@linkpoint/design-system/react';
import { useTheme } from '../context/ThemeContext.jsx';

/**
 * CrystalProgressBar component for standardized Linkpoint brand styling across loading and downloading workflows.
 * Supports numerical percentage values from 0 to 100 with smooth transitions, theme custom properties,
 * and standard crystal brand visual assets.
 *
 * @param {Object} props
 * @param {number | null | undefined} [props.progress=0] - Percentage value between 0 and 100
 * @param {string | number} [props.height] - Height of the progress track bar (defaults to 4px for 'state-block', 6px for 'default')
 * @param {boolean} [props.showLabel=false] - Whether to render progress text & percentage header
 * @param {string} [props.label="Downloading asset data..."] - Label text rendered in progress header
 * @param {string} [props.className=""] - Additional CSS class name
 * @param {import('react').CSSProperties} [props.style={}] - Inline style overrides for outer wrapper
 * @param {string} [props.ariaLabel] - Custom ARIA label for accessibility
 * @param {'default' | 'state-block'} [props.variant='default'] - Variant preset layout ('default' or 'state-block')
 * @param {any} [props.tokens] - Optional theme tokens override
 */
export function CrystalProgressBar(props) {
  const theme = useTheme?.();
  const V = props.tokens !== undefined ? props.tokens : theme?.V;
  return <DesignCrystalProgressBar tokens={V} {...props} />;
}

export default CrystalProgressBar;
