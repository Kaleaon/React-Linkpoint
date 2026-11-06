import React, { useState, useMemo } from 'react';
import Icon from './Icon.jsx';
import FocusTrap from './FocusTrap.jsx';
import AccessibleInput from './AccessibleInput.tsx';
import AccessibleButton from './AccessibleButton.jsx';
import { AccessibleSelect } from '@linkpoint/design-system/react';
import { app } from '../linkpoint/app.ts';
import { Utils } from '../linkpoint/utils.ts';

const ALLOWED_ASSET_TYPES = new Set([3, 5, 6, 7]);

function formatAssetTypeName(type) {
  const num = Number(type);
  switch (num) {
    case 3:
      return 'Landmark';
    case 5:
      return 'Clothing';
    case 6:
      return 'Object';
    case 7:
      return 'Notecard';
    default:
      return 'Item';
  }
}

/**
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {() => void} props.onClose
 * @param {string} props.groupId
 * @param {string} props.groupName
 * @param {(notice?: any) => void} [props.onNoticeSuccess]
 * @param {any} props.V
 * @param {any} [props.t]
 */
export function CreateGroupNoticeModal({
  isOpen,
  onClose,
  groupId,
  groupName,
  onNoticeSuccess,
  V,
  t: _t,
}) {
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedAttachmentId, setSelectedAttachmentId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const eligibleItems = useMemo(() => {
    if (!app.inventory || !app.inventory.items) return [];
    const items = [];
    for (const item of app.inventory.items.values()) {
      const type = Number(item.assetType ?? item.type);
      if (ALLOWED_ASSET_TYPES.has(type)) {
        items.push({
          id: String(item.id || item.itemId || ''),
          name: String(item.name || 'Unnamed item'),
          type,
          ownerId: String(item.ownerId || item.creatorId || ''),
        });
      }
    }
    return items.sort((a, b) => a.name.localeCompare(b.name));
  }, [isOpen]);

  const selectedAttachment = useMemo(() => {
    if (!selectedAttachmentId) return null;
    return eligibleItems.find((i) => i.id === selectedAttachmentId) || null;
  }, [eligibleItems, selectedAttachmentId]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (submitting) return;

    const cleanSubject = subject.trim();
    const cleanMessage = message.trim();

    if (!cleanSubject) {
      setError('Subject is required.');
      return;
    }
    if (!cleanMessage) {
      setError('Message is required.');
      return;
    }

    const subjectByteLength = new TextEncoder().encode(cleanSubject).length;
    if (subjectByteLength > 63) {
      setError('Subject cannot exceed 63 bytes.');
      return;
    }

    const messageByteLength = new TextEncoder().encode(cleanMessage).length;
    if (messageByteLength > 512) {
      setError('Message cannot exceed 512 bytes.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const attachment = selectedAttachment
        ? {
            itemId: selectedAttachment.id,
            itemName: selectedAttachment.name,
            itemType: selectedAttachment.type,
            ownerId: selectedAttachment.ownerId,
          }
        : null;

      const result = await app.sendGroupNotice(groupId, {
        subject: cleanSubject,
        message: cleanMessage,
        attachment,
      });

      Utils.showToast('Group notice dispatched successfully.', 'success');
      onNoticeSuccess?.(result);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err || 'Failed to dispatch notice.');
      setError(msg);
      Utils.showToast(msg, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const subjectCharCount = subject.length;
  const messageCharCount = message.length;

  return (
    <FocusTrap active={isOpen} onEscape={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-notice-dialog-title"
        aria-describedby="create-notice-dialog-desc"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.65)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: 16,
        }}
      >
        <div
          style={{
            background: V?.surf || '#ffffff',
            color: V?.ink || '#000000',
            border: `1px solid ${V?.outv || '#cccccc'}`,
            borderRadius: V?.rs || '8px',
            maxWidth: 480,
            width: '100%',
            padding: 22,
            boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)',
            display: 'grid',
            gap: 14,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3
              id="create-notice-dialog-title"
              style={{ margin: 0, fontSize: 16, color: V?.pri, fontWeight: 700 }}
            >
              Create Group Notice
            </h3>
            <AccessibleButton
              as="button"
              type="button"
              onClick={onClose}
              aria-label="Close notice composer"
              style={{
                border: 0,
                background: 'transparent',
                color: V?.ink2 || '#666666',
                cursor: 'pointer',
                padding: 4,
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <Icon name="x" size={16} />
            </AccessibleButton>
          </div>

          <p
            id="create-notice-dialog-desc"
            style={{ margin: 0, fontSize: 12.5, color: V?.ink2 || '#666666', lineHeight: 1.45 }}
          >
            Broadcast an announcement to all members of <strong>{groupName || 'this group'}</strong>
            .
          </p>

          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 14 }}>
            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>Subject:</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: subjectCharCount > 60 ? V?.err || '#dc2626' : V?.ink2 || '#666666',
                  }}
                  aria-live="polite"
                >
                  {subjectCharCount}/63
                </span>
              </div>
              <AccessibleInput
                id="notice-subject"
                type="text"
                value={subject}
                onChange={(e) => {
                  setSubject(e.target.value);
                  if (error) setError('');
                }}
                maxLength={63}
                placeholder="Notice subject (up to 63 characters)…"
                aria-label="Notice Subject"
                aria-required="true"
                autoFocus
                style={{
                  width: '100%',
                  borderColor: error && !subject.trim() ? V?.err || '#dc2626' : undefined,
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              <div
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>Message:</span>
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 400,
                    color: messageCharCount > 490 ? V?.err || '#dc2626' : V?.ink2 || '#666666',
                  }}
                  aria-live="polite"
                >
                  {messageCharCount}/512
                </span>
              </div>
              <AccessibleInput
                as="textarea"
                id="notice-message"
                rows={4}
                value={message}
                onChange={(e) => {
                  setMessage(e.target.value);
                  if (error) setError('');
                }}
                maxLength={512}
                placeholder="Write your notice message to group members (up to 512 characters)…"
                aria-label="Notice Message"
                aria-required="true"
                style={{
                  width: '100%',
                  minHeight: 90,
                  resize: 'vertical',
                  borderColor: error && !message.trim() ? V?.err || '#dc2626' : undefined,
                }}
              />
            </label>

            <label style={{ display: 'grid', gap: 5, fontSize: 12, fontWeight: 600 }}>
              <span>Inventory Attachment (optional):</span>
              <AccessibleSelect
                id="notice-attachment"
                value={selectedAttachmentId}
                onChange={(e) => setSelectedAttachmentId(e.target.value)}
                aria-label="Inventory Attachment"
                style={{ width: '100%' }}
              >
                <option value="">None (No attachment)</option>
                {eligibleItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    [{formatAssetTypeName(item.type)}] {item.name}
                  </option>
                ))}
              </AccessibleSelect>
            </label>

            {selectedAttachment && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 12px',
                  background: V?.bg || '#f3f4f6',
                  borderRadius: V?.rs || 4,
                  fontSize: 12,
                  border: `1px solid ${V?.outv || '#e5e7eb'}`,
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="paperclip" size={13} style={{ color: V?.pri }} />
                  <span>
                    Attached: <strong>{selectedAttachment.name}</strong> (
                    {formatAssetTypeName(selectedAttachment.type)})
                  </span>
                </span>
                <AccessibleButton
                  as="button"
                  type="button"
                  onClick={() => setSelectedAttachmentId('')}
                  aria-label="Remove attachment"
                  style={{
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                    color: V?.err || '#dc2626',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  Remove
                </AccessibleButton>
              </div>
            )}

            {error && (
              <div
                role="alert"
                style={{
                  color: V?.err || '#dc2626',
                  fontSize: 12,
                  padding: '8px 12px',
                  background: 'rgba(239, 68, 68, 0.1)',
                  borderRadius: V?.rs || 4,
                  border: `1px solid ${V?.err || '#dc2626'}`,
                }}
              >
                {error}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
              <AccessibleButton
                as="button"
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Cancel notice"
                style={{
                  minHeight: 34,
                  padding: '0 14px',
                  border: `1px solid ${V?.outv || '#cccccc'}`,
                  borderRadius: V?.rs || 4,
                  background: V?.surf || '#ffffff',
                  color: V?.ink || '#000000',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                Cancel
              </AccessibleButton>
              <AccessibleButton
                as="button"
                type="submit"
                disabled={submitting}
                aria-label="Send Notice"
                style={{
                  minHeight: 34,
                  padding: '0 16px',
                  border: `1px solid ${V?.pri || '#2563eb'}`,
                  borderRadius: V?.rs || 4,
                  background: V?.pri || '#2563eb',
                  color: V?.onpri || '#ffffff',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  opacity: submitting ? 0.6 : 1,
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <Icon name="send" size={13} />
                <span>{submitting ? 'Sending…' : 'Send Notice'}</span>
              </AccessibleButton>
            </div>
          </form>
        </div>
      </div>
    </FocusTrap>
  );
}

export default CreateGroupNoticeModal;
