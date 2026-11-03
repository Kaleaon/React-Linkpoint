import React from 'react';
import { useApp } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import Icon from './Icon.jsx';

/**
 * Universal Mobile vs Desktop View Mode Switcher
 * Allows 1-click toggling between:
 * - Mobile Mode (Lumiya Touch interface: full-screen, bottom tabs, virtual pad)
 * - Desktop Mode (Firestorm Multi-Window interface: top menu bar, draggable floaters, live status)
 * - Auto-Responsive Mode (adapts to screen width)
 */
export default function ViewModeSwitcher({ compact = false, style = {} }) {
  const { state, actions } = useApp();
  const { V, t, isSweepDesk } = useTheme();

  const currentMode = state.viewMode || 'auto'; // "mobile" | "desktop" | "auto"
  const isDesktopActive = actions.navMode?.() === 'floaters' || state.device === 'desk';

  const isMobileActive =
    currentMode === 'mobile' || (!isDesktopActive && currentMode !== 'desktop');
  const isDesktopModeActive =
    currentMode === 'desktop' || (isDesktopActive && currentMode !== 'mobile');
  const isAutoActive = currentMode === 'auto';

  const handleSelectMode = (mode) => {
    actions.setViewMode(mode);
  };

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, ...style }}>
        <button
          type="button"
          aria-label={isDesktopActive ? 'Switch to mobile view' : 'Switch to desktop view'}
          onClick={() => handleSelectMode(isDesktopActive ? 'mobile' : 'desktop')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            height: '24px',
            minHeight: 24,
            minWidth: 24,
            padding: '0 8px',
            border: `1px solid ${V.outv}`,
            borderRadius: isSweepDesk ? '999px' : V.rs,
            background: V.surf,
            color: V.ink,
            fontSize: '10px',
            fontWeight: 700,
            letterSpacing: '.08em',
            cursor: 'pointer',
          }}
          title={
            isDesktopActive
              ? 'Switch to Mobile (Lumiya Touch)'
              : 'Switch to Desktop (Firestorm Floaters)'
          }
        >
          <Icon name={isDesktopActive ? 'smartphone' : 'monitor'} size={12} />
          <span>{isDesktopActive ? 'TO MOBILE' : 'TO DESKTOP'}</span>
        </button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Viewer Interface Mode"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px',
        background: V.surf2 || V.surf,
        border: `1px solid ${V.outv}`,
        borderRadius: isSweepDesk ? '999px' : V.rs,
        gap: '2px',
        ...style,
      }}
    >
      {/* Mobile Mode Button */}
      <button
        type="button"
        aria-pressed={isMobileActive}
        onClick={() => handleSelectMode('mobile')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: '24px',
          minHeight: 24,
          minWidth: 24,
          padding: '0 7px',
          border: 0,
          borderRadius: isSweepDesk ? '999px' : V.rs,
          background: isMobileActive ? V.pri : 'transparent',
          color: isMobileActive ? V.onpri : V.ink2,
          fontSize: '9.5px',
          fontWeight: 700,
          letterSpacing: '.08em',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        title="Mobile Touch Interface (Lumiya style with bottom navigation and touch controls)"
      >
        <Icon name="smartphone" size={11} />
        <span>MOBILE</span>
      </button>

      {/* Desktop Mode Button */}
      <button
        type="button"
        aria-pressed={isDesktopModeActive}
        onClick={() => handleSelectMode('desktop')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          height: '24px',
          minHeight: 24,
          minWidth: 24,
          padding: '0 7px',
          border: 0,
          borderRadius: isSweepDesk ? '999px' : V.rs,
          background: isDesktopModeActive ? V.pri : 'transparent',
          color: isDesktopModeActive ? V.onpri : V.ink2,
          fontSize: '9.5px',
          fontWeight: 700,
          letterSpacing: '.08em',
          cursor: 'pointer',
          transition: 'background 0.15s, color 0.15s',
        }}
        title="Desktop Multi-Window Interface (Firestorm style with draggable floaters and top menu bar)"
      >
        <Icon name="monitor" size={11} />
        <span>DESKTOP</span>
      </button>

      {/* Auto Button */}
      <button
        type="button"
        aria-pressed={isAutoActive}
        onClick={() => handleSelectMode('auto')}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 3,
          height: '24px',
          minHeight: 24,
          minWidth: 24,
          padding: '0 6px',
          border: 0,
          borderRadius: isSweepDesk ? '999px' : V.rs,
          background: isAutoActive
            ? isSweepDesk
              ? V.sec
              : 'rgba(255,255,255,0.12)'
            : 'transparent',
          color: isAutoActive ? V.ink : V.ink2,
          fontSize: '9px',
          fontWeight: 600,
          letterSpacing: '.06em',
          cursor: 'pointer',
          opacity: isAutoActive ? 1 : 0.6,
        }}
        title="Auto-responsive (Switches layout automatically based on viewport size)"
      >
        <Icon name="sparkles" size={10} />
        <span>AUTO</span>
      </button>
    </div>
  );
}
