import React, { useEffect, useRef, useState } from 'react';
import { useErrorRecovery } from '../context/ErrorRecoveryContext';
import { useTheme } from '../context/ThemeContext.jsx';
import { getErrorTranslation } from '../linkpoint/errorCatalog';

interface ErrorRecoveryModalProps {
  onNavigateFallback?: (route: 'Chat' | 'Login') => void;
}

export const ErrorRecoveryModal: React.FC<ErrorRecoveryModalProps> = ({ onNavigateFallback }) => {
  const { activeError, telemetryLogs, clearError, processRetryQueue } = useErrorRecovery();
  const [showLogs, setShowLogs] = useState(false);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const theme = useTheme();
  const V = theme?.V || {};

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

  const translation = getErrorTranslation(activeError.code, activeError.message);

  const handleCopyTelemetry = () => {
    const payload = JSON.stringify(
      {
        error: activeError,
        telemetry: telemetryLogs.slice(0, 20),
      },
      null,
      2,
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
      aria-describedby="recovery-modal-description"
      data-testid="error-recovery-modal"
      onCancel={(e) => {
        e.preventDefault();
        clearError();
      }}
      style={{
        backgroundColor: V.surf,
        color: V.ink,
        borderRadius: V.rl || '8px',
        maxWidth: '520px',
        width: '100%',
        padding: V.pad || '24px',
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
        border: `1px solid ${V.outv}`,
        margin: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <div
          style={{
            backgroundColor: V.err,
            color: V.onpri || V.surf,
            borderRadius: '50%',
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
            flexShrink: 0,
          }}
        >
          !
        </div>
        <div>
          <h2
            id="recovery-modal-title"
            style={{ margin: 0, fontSize: '18px', fontWeight: 600, color: V.ink }}
          >
            {translation.title}
          </h2>
          <p
            id="recovery-modal-description"
            style={{ margin: '2px 0 0 0', fontSize: '13px', color: V.ink2 }}
          >
            {translation.description}
          </p>
        </div>
      </div>

      <div
        style={{
          backgroundColor: V.bg,
          padding: '12px',
          borderRadius: V.rs || '6px',
          marginBottom: '16px',
          border: `1px solid ${V.outv}`,
        }}
      >
        <p style={{ margin: 0, fontSize: '14px', color: V.ink }}>{activeError.message}</p>
        {translation.actionHint && (
          <p style={{ margin: '6px 0 0 0', fontSize: '12px', color: V.ink2 }}>
            Recommended Action: {translation.actionHint}
          </p>
        )}
      </div>

      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={() => setShowLogs(!showLogs)}
          style={{
            background: 'none',
            border: 'none',
            color: V.sec || V.pri,
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
              backgroundColor: V.bg,
              color: V.ok || V.ink,
              padding: '12px',
              borderRadius: V.rs || '4px',
              maxHeight: '180px',
              overflowY: 'auto',
              fontFamily: 'monospace',
              fontSize: '11px',
              whiteSpace: 'pre-wrap',
              border: `1px solid ${V.outv}`,
            }}
            data-testid="telemetry-log-viewer"
          >
            <div
              style={{
                marginBottom: '8px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${V.outv}`,
                color: V.ink,
              }}
            >
              <div>
                Technical Error Code: <code>{activeError.code}</code>
              </div>
              <div>Category: {activeError.category}</div>
              <div>Automated Retries Attempted: {activeError.attempts} / 3</div>
              {activeError.timestamp && <div>Timestamp: {activeError.timestamp}</div>}
            </div>
            {telemetryLogs.map((log) => (
              <div
                key={log.id}
                style={{ marginBottom: '4px', borderBottom: `1px solid ${V.outv}` }}
              >
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
              backgroundColor: V.pri,
              color: V.onpri,
              border: 'none',
              padding: '10px',
              borderRadius: V.rs || '6px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Retry Operation
          </button>
          <button
            onClick={handleCopyTelemetry}
            style={{
              backgroundColor: V.sec || V.bg,
              color: V.onsec || V.ink,
              border: `1px solid ${V.outv}`,
              padding: '10px 14px',
              borderRadius: V.rs || '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {copied ? 'Copied Log!' : 'Copy Telemetry'}
          </button>
        </div>

        <div
          style={{
            borderTop: `1px solid ${V.outv}`,
            paddingTop: '8px',
            marginTop: '4px',
            display: 'flex',
            gap: '8px',
          }}
        >
          <button
            onClick={() => handleFallback('Chat')}
            style={{
              flex: 1,
              backgroundColor: V.sec || V.bg,
              color: V.onsec || V.ink,
              border: `1px solid ${V.outv}`,
              padding: '8px',
              borderRadius: V.rs || '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            Return to Safe Home (Chat)
          </button>
          <button
            onClick={() => handleFallback('Login')}
            style={{
              backgroundColor: V.bg,
              color: V.ink2 || V.ink,
              border: `1px solid ${V.outv}`,
              padding: '8px 12px',
              borderRadius: V.rs || '6px',
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
