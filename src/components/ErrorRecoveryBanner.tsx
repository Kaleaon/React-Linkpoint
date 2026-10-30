import React from 'react';
import CrystalLoader from './CrystalLoader.jsx';
import { useErrorRecovery } from '../context/ErrorRecoveryContext';
import { useTheme } from '../context/ThemeContext.jsx';

export const ErrorRecoveryBanner: React.FC = () => {
  const { isOnline, isRetrying, retryQueueCount, processRetryQueue } = useErrorRecovery();
  const theme = useTheme();
  const V = theme?.V || {};

  if (isOnline && !isRetrying && retryQueueCount === 0) {
    return null;
  }

  const bannerBg = !isOnline ? V.err || V.surf : V.warn || V.surf;
  const bannerColor = V.onpri || V.ink;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: '100%',
        backgroundColor: bannerBg,
        color: bannerColor,
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        zIndex: 9999,
        borderBottom: `1px solid ${V.outv}`,
      }}
      data-testid="error-recovery-banner"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <CrystalLoader variant="inline" size={16} />
        <span>
          {!isOnline
            ? 'Network disconnected. Auto-reconnecting when signal restores…'
            : `Retrying failed requests (${retryQueueCount} pending)…`}
        </span>
      </div>

      {isOnline && retryQueueCount > 0 && (
        <button
          onClick={() => void processRetryQueue()}
          style={{
            background: V.pri,
            border: 'none',
            color: V.onpri,
            padding: '4px 8px',
            borderRadius: V.rs || '4px',
            cursor: 'pointer',
            fontSize: '12px',
          }}
        >
          Retry Now
        </button>
      )}
    </div>
  );
};
