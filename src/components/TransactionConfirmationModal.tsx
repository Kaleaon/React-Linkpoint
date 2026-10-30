import React, { useState, useEffect } from 'react';
import { economyService, PendingTransactionRequest } from '../services/EconomyService';
import FocusTrap from './FocusTrap.jsx';
import Icon from './Icon.jsx';
import CrystalLoader from './CrystalLoader.jsx';

export default function TransactionConfirmationModal() {
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
          backgroundColor: '#111827',
          color: '#f3f4f6',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
          border: '1px solid #374151',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #1f2937',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#1f2937',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(234, 179, 8, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#facc15',
              }}
            >
              <Icon name="banknote" size={18} />
            </div>
            <div>
              <h3
                id="tx-confirmation-title"
                style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#f9fafb' }}
              >
                Confirm Transaction
              </h3>
              <small style={{ color: '#9ca3af', fontSize: '12px' }}>
                WCAG 2.2 Financial Safety Verification
              </small>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            disabled={isProcessing}
            aria-label="Cancel transaction"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#9ca3af',
              cursor: isProcessing ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: '4px',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          <p
            id="tx-confirmation-desc"
            style={{ marginTop: 0, marginBottom: '16px', fontSize: '14px', color: '#d1d5db' }}
          >
            Please review the details below before authorizing this payment.
          </p>

          {error && (
            <div
              style={{
                marginBottom: '16px',
                padding: '10px 12px',
                backgroundColor: 'rgba(225, 29, 72, 0.15)',
                border: '1px solid #f43f5e',
                borderRadius: '6px',
                color: '#fecdd3',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Icon name="alert-circle" size={16} style={{ flexShrink: 0, color: '#f43f5e' }} />
              <span>{error}</span>
            </div>
          )}

          {/* Details Card */}
          <div
            style={{
              backgroundColor: '#1f2937',
              borderRadius: '8px',
              border: '1px solid #374151',
              padding: '14px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              fontSize: '14px',
            }}
          >
            {/* Recipient */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>Recipient Name:</span>
              <span style={{ fontWeight: '600', color: '#f9fafb' }}>{targetName}</span>
            </div>

            {/* Target Type */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>Type:</span>
              <span
                style={{
                  fontWeight: '500',
                  color: '#e5e7eb',
                  textTransform: 'capitalize',
                  backgroundColor: '#374151',
                  padding: '2px 8px',
                  borderRadius: '4px',
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
                borderTop: '1px solid #374151',
                paddingTop: '10px',
              }}
            >
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>Transaction Amount:</span>
              <span style={{ fontWeight: '700', fontSize: '16px', color: '#38bdf8' }}>
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
                <span style={{ color: '#9ca3af', fontSize: '13px' }}>Description:</span>
                <span
                  style={{
                    color: '#d1d5db',
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
                borderTop: '1px solid #374151',
                paddingTop: '10px',
              }}
            >
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>Current Balance:</span>
              <span style={{ color: '#e5e7eb' }}>
                {currentBalance !== null ? `${currencySymbol} ${currentBalance}` : 'N/A'}
              </span>
            </div>

            {/* Expected Remaining Balance */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#9ca3af', fontSize: '13px' }}>
                Expected Remaining Balance:
              </span>
              <span
                style={{
                  fontWeight: '600',
                  color:
                    expectedRemainingBalance !== null && expectedRemainingBalance < 0
                      ? '#f87171'
                      : '#34d399',
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
            <button
              type="button"
              onClick={handleCancel}
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '6px',
                border: '1px solid #4b5563',
                backgroundColor: '#1f2937',
                color: '#e5e7eb',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                fontSize: '14px',
              }}
            >
              Cancel Payment
            </button>
            <button
              type="button"
              onClick={handleApprove}
              disabled={isProcessing}
              style={{
                flex: 1,
                padding: '10px 16px',
                borderRadius: '6px',
                border: 'none',
                backgroundColor: isProcessing ? '#4b5563' : '#0284c7',
                color: '#ffffff',
                fontWeight: '600',
                cursor: isProcessing ? 'not-allowed' : 'pointer',
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
            </button>
          </div>
        </div>
      </div>
    </FocusTrap>
  );
}
