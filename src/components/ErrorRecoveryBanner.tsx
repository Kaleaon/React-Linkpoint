import React from 'react';
import { useErrorRecovery } from '../context/ErrorRecoveryContext';

export const ErrorRecoveryBanner: React.FC = () => {
  const { isOnline, isRetrying, retryQueueCount, processRetryQueue } = useErrorRecovery();

  if (isOnline && !isRetrying && retryQueueCount === 0) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        width: '100%',
        backgroundColor: !isOnline ? '#991b1b' : '#9a3412',
        color: '#ffffff',
        padding: '8px 16px',
        fontSize: '13px',
        fontWeight: 500,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxSizing: 'border-box',
        zIndex: 9999,
        borderBottom: '1px solid rgba(255,255,255,0.2)',
      }}
      data-testid="error-recovery-banner"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: !isOnline ? '#ef4444' : '#f97316',
          }}
        />
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
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            color: '#fff',
            padding: '4px 8px',
            borderRadius: '4px',
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
