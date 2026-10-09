import React, { useEffect, useRef, useState } from 'react';
import { useErrorRecovery } from '../context/ErrorRecoveryContext';

interface ErrorRecoveryModalProps {
  onNavigateFallback?: (route: 'Chat' | 'Login') => void;
}

export const ErrorRecoveryModal: React.FC<ErrorRecoveryModalProps> = ({ onNavigateFallback }) => {
  const { activeError, telemetryLogs, clearError, processRetryQueue } = useErrorRecovery();
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialogNode = dialogRef.current;
    if (activeError && dialogNode) {
      if (!dialogNode.open) {
        if (typeof dialogNode.showModal === 'function') {
          dialogNode.showModal();
        } else {
          dialogNode.setAttribute('open', '');
        }
      }
    } else if (!activeError && dialogNode?.open) {
      if (typeof dialogNode.close === 'function') {
        dialogNode.close();
      } else {
        dialogNode.removeAttribute('open');
      }
    }
  }, [activeError]);

  if (!activeError) return null;

  const handleCopyTelemetry = () => {
    const payload = JSON.stringify(
      {
        error: activeError,
        telemetry: telemetryLogs.slice(0, 20),
      },
      null,
      2
    );
    void navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFallback = (route: 'Chat' | 'Login') => {
    clearError();
    if (onNavigateFallback) {
      onNavigateFallback(route);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recovery-modal-title"
      data-testid="error-recovery-modal"
      onCancel={(e) => {
        e.preventDefault();
        clearError();
      }}
      style={{
        backgroundColor: '#1f2937',
        color: '#f9fafb',
        borderRadius: '8px',
        maxWidth: '520px',
        width: '100%',
        padding: '24px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
        border: '1px solid #374151',
        margin: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              backgroundColor: '#ef4444',
              color: '#fff',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
            }}
          >
            !
          </div>
          <div>
            <h2 id="recovery-modal-title" style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>
              Service Recovery Gateway
            </h2>
            <p style={{ margin: 0, fontSize: '12px', color: '#9ca3af' }}>
              Code: <code style={{ color: '#fca5a5' }}>{activeError.code}</code> ({activeError.category})
            </p>
          </div>
        </div>

        <div style={{ backgroundColor: '#111827', padding: '12px', borderRadius: '6px', marginBottom: '16px' }}>
          <p style={{ margin: 0, fontSize: '14px', color: '#f3f4f6' }}>{activeError.message}</p>
          <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#6b7280' }}>
            Automated retries attempted: {activeError.attempts} / 3
          </p>
        </div>

        <div style={{ marginBottom: '16px' }}>
          <button
            onClick={() => setShowLogs(!showLogs)}
            style={{
              background: 'none',
              border: 'none',
              color: '#60a5fa',
              cursor: 'pointer',
              fontSize: '13px',
              padding: 0,
              textDecoration: 'underline',
            }}
          >
            {showLogs ? 'Hide Diagnostic Telemetry' : 'View Diagnostic Telemetry'}
          </button>

          {showLogs && (
            <div
              style={{
                marginTop: '8px',
                backgroundColor: '#000',
                color: '#10b981',
                padding: '12px',
                borderRadius: '4px',
                maxHeight: '160px',
                overflowY: 'auto',
                fontFamily: 'monospace',
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
              }}
              data-testid="telemetry-log-viewer"
            >
              {telemetryLogs.map((log) => (
                <div key={log.id} style={{ marginBottom: '4px', borderBottom: '1px solid #1f2937' }}>
                  [{log.timestamp.slice(11, 19)}] [{log.code}] {log.message}
                  {log.details && <div>Details: {JSON.stringify(log.details)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => {
                clearError();
                void processRetryQueue();
              }}
              style={{
                flex: 1,
                backgroundColor: '#2563eb',
                color: '#fff',
                border: 'none',
                padding: '10px',
                borderRadius: '6px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Retry Operation
            </button>
            <button
              onClick={handleCopyTelemetry}
              style={{
                backgroundColor: '#374151',
                color: '#fff',
                border: 'none',
                padding: '10px 14px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              {copied ? 'Copied Log!' : 'Copy Telemetry'}
            </button>
          </div>

          <div style={{ borderTop: '1px solid #374151', paddingTop: '8px', marginTop: '4px', display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleFallback('Chat')}
              style={{
                flex: 1,
                backgroundColor: '#10b981',
                color: '#fff',
                border: 'none',
                padding: '8px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Return to Safe Home (Chat)
            </button>
            <button
              onClick={() => handleFallback('Login')}
              style={{
                backgroundColor: '#4b5563',
                color: '#fff',
                border: 'none',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                cursor: 'pointer',
              }}
            >
              Return to Login
            </button>
          </div>
        </div>
    </dialog>
  );
};
