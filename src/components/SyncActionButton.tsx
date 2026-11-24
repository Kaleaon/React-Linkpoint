import React, { useCallback, useRef, useState } from 'react';
import CrystalLoader from './CrystalLoader.jsx';
import TouchTarget, { type TouchTargetProps } from './TouchTarget';
import Icon from './Icon.jsx';
import { useTheme } from '../context/ThemeContext.jsx';

export type SyncActionButtonVariant = 'default' | 'primary' | 'danger';

export interface BusyCoordinator<T extends string = string> {
  /** True when any tracked asynchronous action is active */
  isBusy: boolean;
  /** Identifier of the active action, or null when idle */
  activeAction: T | null;
  /** Returns true when the given action key is currently running */
  isLoading: (actionKey: T) => boolean;
  /** Executes an async callback while locking concurrent actions */
  run: <R>(actionKey: T, task: () => Promise<R>) => Promise<R | undefined>;
}

/**
 * Shared busy state coordinator for views and modals with one or more async actions.
 * Enforces synchronous duplicate-execution locking while isolating per-button loading state.
 */
export function useBusyCoordinator<T extends string = string>(): BusyCoordinator<T> {
  const [activeAction, setActiveAction] = useState<T | null>(null);
  const busyRef = useRef<T | null>(null);

  const isLoading = useCallback((actionKey: T) => activeAction === actionKey, [activeAction]);

  const run = useCallback(async <R,>(actionKey: T, task: () => Promise<R>) => {
    if (busyRef.current !== null) {
      return undefined;
    }
    busyRef.current = actionKey;
    setActiveAction(actionKey);
    try {
      return await task();
    } finally {
      busyRef.current = null;
      setActiveAction(null);
    }
  }, []);

  return {
    isBusy: activeAction !== null,
    activeAction,
    isLoading,
    run,
  };
}

export interface SyncActionButtonProps extends Omit<TouchTargetProps, 'size'> {
  /** Loading state indicating active synchronization or form submission */
  loading?: boolean;
  /** Visual variant for form, dialog, or toolbar actions (default: 'default') */
  variant?: SyncActionButtonVariant;
  /** HTML button type attribute (default: 'button') */
  type?: 'button' | 'submit' | 'reset';
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
      variant = 'default',
      type = 'button',
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
      role = 'button',
      tabIndex,
      onClick,
      onKeyDown,
      children,
      ...restProps
    },
    ref,
  ) => {
    const themeContext = useTheme();
    const V = themeContext?.V || {};

    const activeIconName = iconName || icon;
    const isDisabled = Boolean(disabled || loading);
    const computedTabIndex =
      role === 'none' || role === 'presentation' ? tabIndex : (tabIndex ?? (isDisabled ? -1 : 0));

    const effectiveIdle = idleText ?? children;
    const effectiveLoading = loadingText ?? effectiveIdle;
    const displayText = loading ? effectiveLoading : effectiveIdle;
    const hasText = displayText !== undefined && displayText !== null && displayText !== '';
    const hasIconOrLoader = Boolean(loading || activeIconName);

    const variantStyle: React.CSSProperties =
      variant === 'primary'
        ? {
            background: V.pri || '#2563eb',
            color: V.onpri || '#ffffff',
            border: `1px solid ${V.pri || '#2563eb'}`,
            borderRadius: V.rs || 4,
            fontSize: 12,
            fontWeight: 700,
            ...(hasText ? { padding: '7px 14px' } : {}),
            opacity: isDisabled ? 0.6 : 1,
          }
        : variant === 'danger'
          ? {
              background: 'transparent',
              color: V.err || '#e53e3e',
              border: `1px solid ${V.err || '#e53e3e'}`,
              borderRadius: V.rs || 4,
              fontSize: 12,
              fontWeight: 700,
              ...(hasText ? { padding: '7px 14px' } : {}),
              opacity: isDisabled ? 0.6 : 1,
            }
          : {
              ...(V.surf ? { background: V.surf } : {}),
              ...(V.pri ? { color: V.pri } : {}),
              ...(V.outv ? { border: `1px solid ${V.outv}` } : {}),
              ...(V.rs ? { borderRadius: V.rs } : {}),
              ...(isDisabled ? { opacity: 0.6 } : {}),
            };

    const mergedStyle: React.CSSProperties = {
      ...variantStyle,
      ...(hasText && hasIconOrLoader ? { gap: 6 } : {}),
      ...style,
    };

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      if (isDisabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      onClick?.(e);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
      onKeyDown?.(e);
      if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ')) {
        if (isDisabled) {
          e.preventDefault();
          return;
        }
        if (onClick) {
          e.preventDefault();
          onClick(e as unknown as React.MouseEvent<HTMLButtonElement>);
        }
      }
    };

    return (
      <TouchTarget
        ref={ref}
        type={type}
        role={role}
        tabIndex={computedTabIndex}
        disabled={isDisabled}
        aria-disabled={isDisabled ? 'true' : undefined}
        enhanced={enhanced}
        className={`sync-action-button sync-action-button--${variant} ${className}`.trim()}
        style={mergedStyle}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        aria-busy={loading ? 'true' : undefined}
        data-testid="sync-action-button"
        data-variant={variant}
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
