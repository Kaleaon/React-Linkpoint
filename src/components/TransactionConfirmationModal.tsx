import React, { useState, useEffect } from 'react';
import { economyService, PendingTransactionRequest } from '../services/EconomyService';
import { useTheme } from '../context/ThemeContext.jsx';
import AccessibleButton from './AccessibleButton';
import FocusRing from './FocusRing';
import FocusTrap from './FocusTrap.jsx';
import Icon from './Icon.jsx';
import CrystalLoader from './CrystalLoader.jsx';

export default function TransactionConfirmationModal() {
  const { V, t } = useTheme();
  const [pendingRequests, setPendingRequests] = useState<PendingTransactionRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleQueueUpdate = (queue: PendingTransactionRequest[]) => {
      setPendingRequests(queue);
      if (queue.length === 0) {
        setIsProcessing(false);
        setError(null);
      }
    };

    setPendingRequests(economyService.getPendingRequests());

    economyService.on('queue_updated', handleQueueUpdate);

    return () => {
      economyService.off('queue_updated', handleQueueUpdate);
    };
  }, []);

  if (pendingRequests.length === 0) {
    return null;
  }

  const currentReq = pendingRequests[0];
  const { id, params, targetType, currencySymbol, currentBalance, expectedRemainingBalance } =
    currentReq;
  const targetName = params.targetName || (targetType === 'object' ? 'Object' : 'Resident');
  const amount = params.amount;
  const description = params.description || '';

  const handleApprove = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setError(null);
    try {
      await economyService.approveTransaction(id);
    } catch (err: any) {
      setError(err?.message || 'Transaction failed');
      setIsProcessing(false);
    }
  };

  const handleCancel = () => {
    if (isProcessing) return;
    economyService.cancelTransaction(id, 'Transaction cancelled by user');
  };

  return (
    <FocusTrap
      active={true}
      onEscape={handleCancel}
      className="tx-confirmation-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 2000,
        padding: '16px',
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tx-confirmation-title"
        aria-describedby="tx-confirmation-desc"
        className="tx-confirmation-container"
        style={{
          backgroundColor: V.surf,
          color: V.ink,
          fontFamily: t.font,
          borderRadius: V.rl,
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          border: `1px solid ${V.outv}`,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="tx-confirmation-header"
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${V.outv}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: V.surf2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: V.surf,
                border: `1px solid ${V.outv}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: V.pri,
              }}
            >
              <Icon name="banknote" size={18} />
            </div>
            <div>
              <h3
                id="tx-confirmation-title"
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: V.ink,
                  fontFamily: t.font,
                }}
              >
                Confirm Transaction
              </h3>
              <small style={{ color: V.ink2, fontSize: '12px', fontFamily: t.font }}>
                WCAG 2.2 Financial Safety Verification
              </small>
            </div>
          </div>
          <FocusRing ringColor={V.pri} borderRadius={V.rs}>
            <AccessibleButton
              as="button"
              onClick={handleCancel}
              disabled={isProcessing}
              aria-label="Cancel transaction"
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: V.ink2,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.5 : 1,
                padding: '4px',
                borderRadius: V.rs,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <Icon name="x" size={18} />
            </AccessibleButton>
          </FocusRing>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          <p
            id="tx-confirmation-desc"
            style={{
              marginTop: 0,
              marginBottom: '16px',
              fontSize: '14px',
              color: V.ink2,
              fontFamily: t.font,
            }}
          >
            Please review the details below before authorizing this payment.
          </p>

          {error && (
            <div
              role="alert"
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                backgroundColor: V.surf2,
                border: `1px solid ${V.err}`,
                borderRadius: V.rs,
                color: V.err,
                fontFamily: t.font,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Icon name="alert-circle" size={16} style={{ flexShrink: 0, color: V.err }} />
              <span>{error}</span>
            </div>
          )}

          {/* Details Card */}
          <div
            className="tx-confirmation-details"
            style={{
              backgroundColor: V.surf2,
              borderRadius: V.rp,
              border: `1px solid ${V.outv}`,
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '14px',
              fontFamily: t.font,
            }}
          >
            {/* Recipient */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: V.ink2, fontSize: '13px' }}>Recipient Name:</span>
              <span style={{ fontWeight: '600', color: V.ink }}>{targetName}</span>
            </div>

            {/* Target Type */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: V.ink2, fontSize: '13px' }}>Type:</span>
              <span
                style={{
                  fontWeight: '500',
                  color: V.ink,
                  textTransform: 'capitalize',
                  backgroundColor: V.surf,
                  border: `1px solid ${V.outv}`,
                  padding: '2px 8px',
                  borderRadius: V.rs,
                  fontSize: '12px',
                }}
              >
                {targetType}
              </span>
            </div>

            {/* Amount */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${V.outv}`,
                paddingTop: '10px',
              }}
            >
              <span style={{ color: V.ink2, fontSize: '13px' }}>Transaction Amount:</span>
              <span style={{ fontWeight: '700', fontSize: '16px', color: V.pri }}>
                {currencySymbol} {amount}
              </span>
            </div>

            {/* Description / Note */}
            {description && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                }}
              >
                <span style={{ color: V.ink2, fontSize: '13px' }}>Description:</span>
                <span
                  style={{
                    color: V.ink,
                    fontSize: '13px',
                    maxWidth: '200px',
                    textAlign: 'right',
                    wordBreak: 'break-word',
                  }}
                >
                  {description}
                </span>
              </div>
            )}

            {/* Current Balance */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: `1px solid ${V.outv}`,
                paddingTop: '10px',
              }}
            >
              <span style={{ color: V.ink2, fontSize: '13px' }}>Current Balance:</span>
              <span style={{ color: V.ink }}>
                {currentBalance !== null ? `${currencySymbol} ${currentBalance}` : 'N/A'}
              </span>
            </div>

            {/* Expected Remaining Balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: V.ink2, fontSize: '13px' }}>Expected Remaining Balance:</span>
              <span
                data-testid="expected-remaining-balance"
                style={{
                  fontWeight: '600',
                  color:
                    expectedRemainingBalance !== null && expectedRemainingBalance < 0
                      ? V.err
                      : V.ok,
                }}
              >
                {expectedRemainingBalance !== null
                  ? `${currencySymbol} ${expectedRemainingBalance}`
                  : 'N/A'}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', marginTop: '20px' }}>
            <FocusRing ringColor={V.pri} borderRadius={V.rs}>
              <AccessibleButton
                as="button"
                onClick={handleCancel}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: V.rs,
                  border: `1px solid ${V.outv}`,
                  backgroundColor: isProcessing ? V.surf : V.surf2,
                  color: isProcessing ? V.ink2 : V.ink,
                  fontFamily: t.font,
                  fontWeight: '600',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.6 : 1,
                  fontSize: '14px',
                }}
              >
                Cancel Payment
              </AccessibleButton>
            </FocusRing>
            <FocusRing ringColor={V.pri} borderRadius={V.rs}>
              <AccessibleButton
                as="button"
                onClick={handleApprove}
                disabled={isProcessing}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  borderRadius: V.rs,
                  border: isProcessing ? `1px solid ${V.outv}` : 'none',
                  backgroundColor: isProcessing ? V.surf2 : V.pri,
                  color: isProcessing ? V.ink2 : V.onpri,
                  fontFamily: t.font,
                  fontWeight: '600',
                  cursor: isProcessing ? 'not-allowed' : 'pointer',
                  opacity: isProcessing ? 0.65 : 1,
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {isProcessing ? (
                  <>
                    <CrystalLoader size={16} variant="inline" />
                    <span>Processing...</span>
                  </>
                ) : (
                  <span>Approve Payment</span>
                )}
              </AccessibleButton>
            </FocusRing>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
