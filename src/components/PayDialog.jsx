import { useState, useEffect } from 'react';
import { app } from '../linkpoint/app.ts';
import Icon from './Icon.jsx';
import FocusTrap from './FocusTrap.jsx';
import FormField from './FormField.jsx';
import CrystalLoader from './CrystalLoader.jsx';

const PRESETS = [5, 10, 50, 100];

/**
 * @param {Object} props
 * @param {boolean} props.isOpen
 * @param {Function} props.onClose
 * @param {Object} [props.target]
 * @param {Function} [props.onSuccess]
 */
export default function PayDialog({ isOpen, onClose, target, onSuccess = null }) {
  const [selectedPreset, setSelectedPreset] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successTx, setSuccessTx] = useState(null);

  const currencySymbol = app.economy?.currencySymbol || 'L$';
  const isZeroCurrency = Boolean(app.economy?.isZeroCurrency);

  const targetId = target?.id || target?.targetId || (typeof target === 'string' ? target : '');
  const targetName =
    target?.name || target?.targetName || (target?.type === 'object' ? 'Object' : 'Resident');
  const targetType = target?.type || 'avatar';

  useEffect(() => {
    if (isOpen) {
      setSelectedPreset(10);
      setCustomAmount('');
      setIsCustom(false);
      setDescription(
        targetType === 'object' ? `Payment for ${targetName}` : `Tip for ${targetName}`,
      );
      setError(null);
      setSuccessTx(null);
      setLoading(false);
    }
  }, [isOpen, targetId, targetName, targetType]);

  if (!isOpen) return null;

  const currentAmount = isCustom ? parseInt(customAmount, 10) || 0 : selectedPreset;

  const handlePresetSelect = (amount) => {
    if (loading || isZeroCurrency) return;
    setIsCustom(false);
    setSelectedPreset(amount);
    setError(null);
  };

  const handleCustomChange = (e) => {
    if (loading || isZeroCurrency) return;
    setIsCustom(true);
    setCustomAmount(e.target.value.replace(/[^0-9]/g, ''));
    setError(null);
  };

  const handlePay = async (e) => {
    e?.preventDefault();
    if (loading || isZeroCurrency) return;

    if (!targetId) {
      setError('No valid target specified for payment.');
      return;
    }

    if (currentAmount <= 0) {
      setError('Please select or enter a payment amount greater than 0.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = {
        targetId,
        targetName,
        amount: currentAmount,
        description: description.trim() || `${currencySymbol} ${currentAmount} to ${targetName}`,
      };

      let tx;
      if (targetType === 'object') {
        tx = await app.economy.payObject(params);
      } else {
        tx = await app.economy.payAvatar(params);
      }

      setSuccessTx(tx);
      if (typeof onSuccess === 'function') {
        onSuccess(tx);
      }
    } catch (err) {
      setError(err.message || 'Payment request was declined or failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <FocusTrap
      active={isOpen}
      onEscape={onClose}
      className="pay-modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        padding: '16px',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-dialog-title"
        className="pay-modal-container"
        style={{
          backgroundColor: '#1e222d',
          color: '#e2e8f0',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '420px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 10px 10px -5px rgba(0,0,0,0.3)',
          border: '1px solid #334155',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#181b24',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon
              name={targetType === 'object' ? 'box' : 'contact'}
              size={20}
              style={{ color: '#38bdf8' }}
            />
            <div>
              <h3 id="pay-dialog-title" style={{ margin: 0, fontSize: '16px', fontWeight: '600' }}>
                Pay {targetType === 'object' ? 'Object' : 'Resident'}
              </h3>
              <small style={{ color: '#94a3b8', fontSize: '12px' }}>{targetName}</small>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            aria-label="Close dialog"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: loading ? 'not-allowed' : 'pointer',
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
          {successTx ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: '#065f46',
                  color: '#34d399',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                <Icon name="check" size={28} />
              </div>
              <h4 style={{ margin: '0 0 6px 0', fontSize: '18px', color: '#34d399' }}>
                Payment Successful
              </h4>
              <p style={{ margin: '0 0 16px 0', color: '#cbd5e1', fontSize: '14px' }}>
                Sent{' '}
                <strong>
                  {currencySymbol} {successTx.amount}
                </strong>{' '}
                to <strong>{targetName}</strong>
              </p>
              <div
                style={{
                  fontSize: '12px',
                  color: '#94a3b8',
                  background: '#181b24',
                  padding: '8px 12px',
                  borderRadius: '6px',
                  marginBottom: '20px',
                  textAlign: 'left',
                }}
              >
                <div>
                  <strong>Transaction ID:</strong> {successTx.id}
                </div>
                <div>
                  <strong>Description:</strong> {successTx.description}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '10px',
                  background: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Done
              </button>
            </div>
          ) : (
            /* Payment Form State */
            <form
              onSubmit={handlePay}
              style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
            >
              {isZeroCurrency && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(234, 179, 8, 0.15)',
                    border: '1px solid #eab308',
                    borderRadius: '6px',
                    color: '#fef08a',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Icon name="alert-circle" size={16} style={{ flexShrink: 0, color: '#eab308' }} />
                  <span>
                    Notice: This grid operates in zero-currency mode. Payments and transactions are
                    disabled.
                  </span>
                </div>
              )}

              {error && (
                <div
                  style={{
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

              {/* Quick-tip Preset Amounts */}
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#94a3b8',
                    marginBottom: '8px',
                  }}
                >
                  Quick-tip Presets ({currencySymbol})
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px' }}>
                  {PRESETS.map((preset) => {
                    const active = !isCustom && selectedPreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        disabled={loading || isZeroCurrency}
                        onClick={() => handlePresetSelect(preset)}
                        style={{
                          padding: '10px 0',
                          borderRadius: '6px',
                          border: active ? '2px solid #38bdf8' : '1px solid #475569',
                          backgroundColor: active ? '#0284c7' : '#1e293b',
                          color: active ? '#ffffff' : '#cbd5e1',
                          fontWeight: '600',
                          fontSize: '14px',
                          cursor: loading || isZeroCurrency ? 'not-allowed' : 'pointer',
                          opacity: isZeroCurrency ? 0.5 : 1,
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {currencySymbol} {preset}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Amount */}
              <FormField label="Or enter custom amount" error={isCustom && error ? error : null}>
                <div style={{ position: 'relative' }}>
                  <span
                    style={{
                      position: 'absolute',
                      left: '12px',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      color: '#94a3b8',
                      fontWeight: '600',
                    }}
                  >
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Custom amount"
                    value={customAmount}
                    onChange={handleCustomChange}
                    disabled={loading || isZeroCurrency}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: '6px',
                      border: isCustom ? '2px solid #38bdf8' : '1px solid #475569',
                      backgroundColor: '#0f172a',
                      color: '#f8fafc',
                      fontSize: '14px',
                      boxSizing: 'border-box',
                      outline: 'none',
                      opacity: isZeroCurrency ? 0.5 : 1,
                    }}
                  />
                </div>
              </FormField>

              {/* Payment Description */}
              <FormField label="Description / Note">
                <input
                  type="text"
                  placeholder="Note to recipient"
                  value={description}
                  onChange={(e) => !loading && !isZeroCurrency && setDescription(e.target.value)}
                  disabled={loading || isZeroCurrency}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#0f172a',
                    color: '#f8fafc',
                    fontSize: '14px',
                    boxSizing: 'border-box',
                    outline: 'none',
                    opacity: isZeroCurrency ? 0.5 : 1,
                  }}
                />
              </FormField>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #475569',
                    backgroundColor: '#1e293b',
                    color: '#cbd5e1',
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || isZeroCurrency || currentAmount <= 0}
                  style={{
                    flex: 2,
                    padding: '10px',
                    borderRadius: '6px',
                    border: 'none',
                    backgroundColor:
                      loading || isZeroCurrency || currentAmount <= 0 ? '#475569' : '#0284c7',
                    color: '#ffffff',
                    fontWeight: '600',
                    cursor:
                      loading || isZeroCurrency || currentAmount <= 0 ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: isZeroCurrency ? 0.5 : 1,
                  }}
                >
                  {loading ? (
                    <>
                      <CrystalLoader size={16} variant="inline" />
                      <span>Sending {currencySymbol}...</span>
                    </>
                  ) : (
                    <>
                      <Icon name="banknote" size={16} />
                      <span>
                        Pay {currencySymbol} {currentAmount}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </FocusTrap>
  );
}
