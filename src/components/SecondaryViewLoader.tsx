import React from 'react';
import CrystalLoader from './CrystalLoader.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export interface SecondaryViewLoaderProps {
  /** Custom size in pixels for the CrystalLoader indicator */
  size?: number;
  /** Layout orientation: "block" (centered vertical stack) or "inline" (compact horizontal bar) */
  layout?: 'block' | 'inline';
  /** Status message or label text */
  label?: React.ReactNode;
  /** Optional action element (e.g. Retry or Cancel button) */
  action?: React.ReactNode;
  /** Custom CSS classes */
  className?: string;
  /** Custom inline styles */
  style?: React.CSSProperties;
  /** ARIA live priority: 'polite', 'assertive', or 'off' */
  ariaLive?: 'polite' | 'assertive' | 'off';
  /** ARIA busy attribute */
  ariaBusy?: boolean;
}

export const SecondaryViewLoader: React.FC<SecondaryViewLoaderProps> = ({
  size,
  layout = 'block',
  label,
  action,
  className = '',
  style,
  ariaLive = 'polite',
  ariaBusy = true,
}) => {
  const themeContext = useTheme();
  const V = themeContext?.V || {};

  const isInline = layout === 'inline';

  const containerStyle: React.CSSProperties = isInline
    ? {
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        padding: '4px 8px',
        color: V.ink2 || '#94a3b8',
        fontSize: '11px',
        ...style,
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
        padding: '16px',
        textAlign: 'center',
        color: V.ink2 || '#94a3b8',
        fontSize: '12px',
        ...style,
      };

  return (
    <div
      role="status"
      aria-live={ariaLive}
      aria-busy={ariaBusy}
      data-testid="secondary-view-loader"
      data-layout={layout}
      className={`secondary-view-loader ${className}`.trim()}
      style={containerStyle}
    >
      <CrystalLoader size={size} variant={layout} />
      {label ? (
        <span
          className="secondary-view-loader-label"
          style={{
            color: V.ink2 || 'inherit',
            fontSize: isInline ? '11px' : '12px',
            lineHeight: 1.4,
          }}
        >
          {label}
        </span>
      ) : null}
      {action ? <div className="secondary-view-loader-action">{action}</div> : null}
    </div>
  );
};

export default SecondaryViewLoader;
