import { useState, useEffect, useRef } from 'react';
import { app } from '../linkpoint/app.ts';
import { useTheme } from '../context/ThemeContext.jsx';
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
  const { V, t } = useTheme();
  const [selectedPreset, setSelectedPreset] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [isCustom, setIsCustom] = useState(false);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successTx, setSuccessTx] = useState(null);
  const submittingRef = useRef(false);

  const currencySymbol = app.economy?.currencySymbol || 'L$';
  const isZeroCurrency = Boolean(app.economy?.isZeroCurrency);
  const availableBalance = app.economy?.balance;

  const targetId = target?.id || target?.targetId || (typeof target === 'string' ? target : '');
  const targetName =
    target?.name || target?.targetName || (target?.type === 'object' ? 'Object' : 'Resident');
  const targetType = target?.type || 'avatar';
  const sellerName =
    target?.sellerName || target?.ownerName || target?.owner || target?.sellerIdentity || null;
  const itemPrice =
    typeof target?.price === 'number'
      ? target.price
      : typeof target?.itemPrice === 'number'
        ? target.itemPrice
        : null;

  useEffect(() => {
    if (isOpen) {
      if (itemPrice !== null && itemPrice > 0) {
        if (PRESETS.includes(itemPrice)) {
          setSelectedPreset(itemPrice);
          setIsCustom(false);
          setCustomAmount('');
        } else {
          setIsCustom(true);
          setCustomAmount(String(itemPrice));
        }
      } else {
        setSelectedPreset(10);
        setCustomAmount('');
        setIsCustom(false);
      }
      setDescription(
        targetType === 'object' ? `Payment for ${targetName}` : `Tip for ${targetName}`,
      );
      setError(null);
      setSuccessTx(null);
      setLoading(false);
      submittingRef.current = false;
    }
  }, [isOpen, targetId, targetName, targetType, itemPrice]);

  if (!isOpen) return null;

  const currentAmount = isCustom ? parseInt(customAmount, 10) || 0 : selectedPreset;
  const isExceedingBalance =
    availableBalance !== null && availableBalance !== undefined && currentAmount > availableBalance;

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
    if (loading || submittingRef.current || isZeroCurrency) return;

    if (!targetId) {
      setError('No valid target specified for payment.');
      return;
    }

    if (currentAmount <= 0) {
      setError('Please select or enter a payment amount greater than 0.');
      return;
    }

    if (isExceedingBalance) {
      setError(
        `Insufficient L$ balance: You have ${currencySymbol} ${availableBalance}, but this transaction costs ${currencySymbol} ${currentAmount}.`,
      );
      return;
    }

    submittingRef.current = true;
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
      submittingRef.current = false;
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
        backgroundColor: 'transparent',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pay-dialog-title"
        className="pay-modal-container"
        style={{
          pointerEvents: 'auto',
          backgroundColor: V.surf,
          color: V.ink,
          fontFamily: t.font,
          borderRadius: `${V.rl} ${V.rl} 0 0`,
          borderTop: `2px solid ${V.pri}`,
          borderLeft: `1px solid ${V.outv}`,
          borderRight: `1px solid ${V.outv}`,
          borderBottom: 'none',
          width: '100%',
          maxWidth: '420px',
          maxHeight: '86%',
          boxShadow: '0 -10px 25px -5px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${V.outv}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: V.surf2 || V.surf,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Icon
              name={targetType === 'object' ? 'box' : 'contact'}
              size={20}
              style={{ color: V.pri }}
            />
            <div>
              <h3
                id="pay-dialog-title"
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '600',
                  color: V.ink,
                  fontFamily: t.font,
                }}
              >
                Pay {targetType === 'object' ? 'Object' : 'Resident'}
              </h3>
              <small style={{ color: V.ink2, fontSize: '12px', fontFamily: t.font }}>
                {targetName}
              </small>
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
              color: V.ink2,
              cursor: loading ? 'not-allowed' : 'pointer',
              padding: '4px',
              borderRadius: V.rs,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Icon name="x" size={18} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto' }}>
          {successTx ? (
            /* Success State */
            <div style={{ textAlign: 'center', padding: '12px 0' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: V.ok || '#065f46',
                  color: V.onpri || '#ffffff',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '12px',
                }}
              >
                <Icon name="check" size={28} />
              </div>
              <h4
                style={{
                  margin: '0 0 6px 0',
                  fontSize: '18px',
                  color: V.ok || '#34d399',
                  fontFamily: t.font,
                }}
              >
                Payment Successful
              </h4>
              <p
                style={{ margin: '0 0 16px 0', color: V.ink, fontSize: '14px', fontFamily: t.font }}
              >
                Sent{' '}
                <strong>
                  {currencySymbol} {successTx.amount}
                </strong>{' '}
                to <strong>{targetName}</strong>
              </p>
              <div
                style={{
                  fontSize: '12px',
                  color: V.ink2,
                  background: V.bg,
                  padding: '8px 12px',
                  borderRadius: V.rs,
                  marginBottom: '20px',
                  textAlign: 'left',
                  border: `1px solid ${V.outv}`,
                  fontFamily: t.font,
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
                  background: V.pri,
                  color: V.onpri,
                  border: 'none',
                  borderRadius: V.rs,
                  fontWeight: '600',
                  fontFamily: t.font,
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
                    border: `1px solid ${V.warn || '#eab308'}`,
                    borderRadius: V.rs,
                    color: V.warn || '#fef08a',
                    fontSize: '13px',
                    fontFamily: t.font,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Icon
                    name="alert-circle"
                    size={16}
                    style={{ flexShrink: 0, color: V.warn || '#eab308' }}
                  />
                  <span>
                    Notice: This grid operates in zero-currency mode. Payments and transactions are
                    disabled.
                  </span>
                </div>
              )}

              {isExceedingBalance && (
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
                  <span>
                    Insufficient L$ balance. Available: {currencySymbol} {availableBalance}
                  </span>
                </div>
              )}

              {(sellerName || itemPrice !== null) && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '6px',
                    fontSize: '12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px',
                  }}
                >
                  {sellerName && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Seller / Owner:</span>
                      <span style={{ color: '#f8fafc', fontWeight: '600' }}>{sellerName}</span>
                    </div>
                  )}
                  {itemPrice !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#94a3b8' }}>Item Price:</span>
                      <span style={{ color: '#38bdf8', fontWeight: '700' }}>
                        {currencySymbol} {itemPrice}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {error && (
                <div
                  style={{
                    padding: '10px 12px',
                    backgroundColor: 'rgba(225, 29, 72, 0.15)',
                    border: `1px solid ${V.err || '#f43f5e'}`,
                    borderRadius: V.rs,
                    color: V.err || '#fecdd3',
                    fontSize: '13px',
                    fontFamily: t.font,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                >
                  <Icon
                    name="alert-circle"
                    size={16}
                    style={{ flexShrink: 0, color: V.err || '#f43f5e' }}
                  />
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
                    color: V.ink2,
                    fontFamily: t.font,
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
                          borderRadius: V.rs,
                          border: active ? `2px solid ${V.pri}` : `1px solid ${V.outv}`,
                          backgroundColor: active ? V.pri : V.bg,
                          color: active ? V.onpri : V.ink,
                          fontFamily: t.font,
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
                      color: V.ink2,
                      fontWeight: '600',
                      fontFamily: t.font,
                    }}
                  >
                    {currencySymbol}
                  </span>
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="Custom amount"
                    aria-label="Custom payment amount"
                    value={customAmount}
                    onChange={handleCustomChange}
                    disabled={loading || isZeroCurrency}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: V.rs,
                      border: isCustom ? `2px solid ${V.pri}` : `1px solid ${V.outv}`,
                      backgroundColor: V.bg,
                      color: V.ink,
                      fontFamily: t.font,
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
                  aria-label="Description / Note"
                  value={description}
                  onChange={(e) => !loading && !isZeroCurrency && setDescription(e.target.value)}
                  disabled={loading || isZeroCurrency}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    borderRadius: V.rs,
                    border: `1px solid ${V.outv}`,
                    backgroundColor: V.bg,
                    color: V.ink,
                    fontFamily: t.font,
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
                    borderRadius: V.rs,
                    border: `1px solid ${V.outv}`,
                    backgroundColor: V.bg,
                    color: V.ink,
                    fontFamily: t.font,
                    fontWeight: '600',
                    cursor: loading ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || isZeroCurrency || currentAmount <= 0 || isExceedingBalance}
                  style={{
                    flex: 2,
                    padding: '10px',
                    borderRadius: V.rs,
                    border: 'none',
                    backgroundColor:
                      loading || isZeroCurrency || currentAmount <= 0 || isExceedingBalance
                        ? V.outv
                        : V.pri,
                    color:
                      loading || isZeroCurrency || currentAmount <= 0 || isExceedingBalance
                        ? V.ink2
                        : V.onpri,
                    fontFamily: t.font,
                    fontWeight: '600',
                    cursor:
                      loading || isZeroCurrency || currentAmount <= 0 || isExceedingBalance
                        ? 'not-allowed'
                        : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    opacity: isZeroCurrency || isExceedingBalance ? 0.6 : 1,
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
