import React from 'react';
import CrystalLoader from './CrystalLoader.jsx';
import TouchTarget, { type TouchTargetProps } from './TouchTarget';
import Icon from './Icon.jsx';

export interface SyncActionButtonProps extends Omit<TouchTargetProps, 'size'> {
  /** Loading state indicating active synchronization */
  loading?: boolean;
  /** Name of the icon to render during idle state */
  iconName?: string;
  /** Alias for iconName */
  icon?: string;
  /** Idle text displayed next to icon when not loading */
  idleText?: React.ReactNode;
  /** Loading text displayed next to crystal loader when loading */
  loadingText?: React.ReactNode;
  /** Size in pixels for idle icon and CrystalLoader (default: 14) */
  size?: number;
  /** Optional icon style */
  iconStyle?: React.CSSProperties;
}

/**
 * Standardized sync action button wrapping TouchTarget and CrystalLoader.
 * Enforces WCAG 2.5.8 and WCAG 2.5.5 touch target dimensions,
 * manages busy/disabled states, and provides inline loading animation.
 */
export const SyncActionButton = React.forwardRef<HTMLButtonElement, SyncActionButtonProps>(
  (
    {
      loading = false,
      iconName,
      icon,
      idleText,
      loadingText,
      size = 14,
      iconStyle,
      disabled = false,
      enhanced = true,
      className = '',
      style,
      onClick,
      children,
      ...restProps
    },
    ref,
  ) => {
    const activeIconName = iconName || icon;
    const isDisabled = Boolean(disabled || loading);

    const effectiveIdle = idleText ?? children;
    const effectiveLoading = loadingText ?? effectiveIdle;
    const displayText = loading ? effectiveLoading : effectiveIdle;
    const hasText = displayText !== undefined && displayText !== null && displayText !== '';
    const hasIconOrLoader = Boolean(loading || activeIconName);

    const mergedStyle: React.CSSProperties = {
      ...(hasText && hasIconOrLoader ? { gap: 6 } : {}),
      ...style,
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        return;
      }
      onClick?.(e);
    };

    return (
      <TouchTarget
        ref={ref}
        disabled={isDisabled}
        enhanced={enhanced}
        className={`sync-action-button ${className}`.trim()}
        style={mergedStyle}
        onClick={handleClick}
        aria-busy={loading ? 'true' : undefined}
        data-testid="sync-action-button"
        data-loading={loading ? 'true' : 'false'}
        {...restProps}
      >
        {loading ? (
          <CrystalLoader size={size} variant="inline" style={iconStyle} />
        ) : activeIconName ? (
          <Icon name={activeIconName} size={size} style={iconStyle} />
        ) : null}
        {hasText ? <span>{displayText}</span> : null}
      </TouchTarget>
    );
  },
);

SyncActionButton.displayName = 'SyncActionButton';

export default SyncActionButton;
