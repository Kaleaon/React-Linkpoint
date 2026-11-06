import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import Icon from './Icon.jsx';
import CrystalLoader from './CrystalLoader.jsx';
import { SkeletonAssetPlaceholder } from './SkeletonLoader.jsx';
import TouchTarget from './TouchTarget.tsx';
import { app } from '../linkpoint/app.ts';
import {
  decodeLindenText,
  validateNotecardLength,
  MAX_NOTECARD_BYTES,
} from '../linkpoint/notecard.ts';

/**
 * AssetContainer component with skeleton UI placeholder, progressive download progress listener,
 * smooth transition to loaded asset content, clear error state with retry, and embedded text notecard editor.
 * @param {{
 *   asset?: any,
 *   onFetch?: ((asset: any, onProgress: (loaded: number, total: number) => void) => Promise<any>) | null,
 *   onProgress?: ((percent: number, loaded: number, total: number) => void) | null,
 *   autoFetch?: boolean,
 *   title?: string | null,
 *   renderContent?: ((data: any, asset: any) => import("react").ReactNode) | null,
 *   children?: import("react").ReactNode,
 *   style?: import("react").CSSProperties,
 *   className?: string,
 *   editable?: boolean,
 *   readOnly?: boolean,
 *   initialMode?: 'view' | 'edit',
 *   onSave?: ((params: { itemId: string; name?: string; text: string }) => Promise<any>) | null,
 *   onDirtyChange?: ((isDirty: boolean) => void) | null,
 * }} props
 */
export default function AssetContainer({
  asset = null,
  onFetch = null,
  onProgress: externalOnProgress = null,
  autoFetch = true,
  title = null,
  renderContent = null,
  children = null,
  style = {},
  className = '',
  editable = false,
  readOnly = false,
  initialMode = 'view',
  onSave = null,
  onDirtyChange = null,
}) {
  const { V } = useTheme?.() || { V: {} };

  const [status, setStatus] = useState(asset?.data ? 'loaded' : 'idle'); // "idle" | "loading" | "downloading" | "loaded" | "error"
  const [progress, setProgress] = useState(0); // 0 to 100
  const [bytesInfo, setBytesInfo] = useState({ loaded: 0, total: 0 });
  const [loadedData, setLoadedData] = useState(asset?.data || null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Text editor state
  const isNotecard = Number(asset?.assetType) === 7 || editable;
  const [mode, setMode] = useState(initialMode); // 'view' | 'edit'
  const [text, setText] = useState(() => (asset?.data ? decodeLindenText(asset.data) : ''));
  const [initialText, setInitialText] = useState(() =>
    asset?.data ? decodeLindenText(asset.data) : '',
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  const isLoggedIn = useMemo(() => {
    try {
      return Boolean(app?.auth?.isLoggedIn?.());
    } catch {
      return true;
    }
  }, []);

  const handleProgress = useCallback(
    (loadedBytes, totalBytes) => {
      let percent = 0;
      if (totalBytes > 0) {
        percent = Math.min(100, Math.max(0, (loadedBytes / totalBytes) * 100));
      } else if (loadedBytes > 0) {
        percent = Math.min(99, loadedBytes % 100);
      }
      setProgress(percent);
      setBytesInfo({ loaded: loadedBytes, total: totalBytes });
      setStatus('downloading');
      if (externalOnProgress) {
        externalOnProgress(percent, loadedBytes, totalBytes);
      }
    },
    [externalOnProgress],
  );

  const executeFetch = useCallback(async () => {
    if (!asset && !onFetch) return;
    setStatus('loading');
    setProgress(0);
    setErrorMsg(null);

    try {
      if (onFetch) {
        const result = await onFetch(asset, handleProgress);
        const resolved = result || asset?.data || true;
        setLoadedData(resolved);
        const decoded = typeof resolved === 'string' ? decodeLindenText(resolved) : '';
        setText(decoded);
        setInitialText(decoded);
      } else if (asset?.data) {
        setLoadedData(asset.data);
        const decoded = decodeLindenText(asset.data);
        setText(decoded);
        setInitialText(decoded);
      } else if (Number(asset?.assetType) === 7 && app?.assets?.fetchNotecard) {
        const result = await app.assets.fetchNotecard(asset, handleProgress);
        setLoadedData(result);
        const decoded = decodeLindenText(result);
        setText(decoded);
        setInitialText(decoded);
      } else {
        // Fallback progress simulation if no custom fetch provided
        handleProgress(50, 100);
        await new Promise((resolve) => setTimeout(resolve, 100));
        handleProgress(100, 100);
        setLoadedData(asset || true);
      }
      setStatus('loaded');
    } catch (err) {
      const message = err?.message || 'Failed to download asset from network.';
      setErrorMsg(message);
      setStatus('error');
    }
  }, [asset, onFetch, handleProgress]);

  useEffect(() => {
    if (asset?.data && !onFetch) {
      setLoadedData(asset.data);
      const decoded = decodeLindenText(asset.data);
      setText(decoded);
      setInitialText(decoded);
      setStatus('loaded');
      return;
    }
    if (autoFetch) {
      void executeFetch();
    }
  }, [asset, autoFetch, executeFetch, onFetch]);

  // Reset editor state when asset changes
  const prevAssetIdRef = useRef(asset?.id);
  useEffect(() => {
    if (prevAssetIdRef.current !== asset?.id) {
      prevAssetIdRef.current = asset?.id;
      setIsDirty(false);
      onDirtyChange?.(false);
      setSaveError(null);
      setSaveSuccess(false);
      setMode(initialMode);
    }
  }, [asset?.id, initialMode, onDirtyChange]);

  const handleRetry = () => {
    void executeFetch();
  };

  const handleTextChange = (e) => {
    const val = e.target.value;
    setText(val);
    const dirty = val !== initialText;
    setIsDirty(dirty);
    onDirtyChange?.(dirty);
  };

  const handleCancel = () => {
    setText(initialText);
    setIsDirty(false);
    onDirtyChange?.(false);
    setMode('view');
    setSaveError(null);
  };

  const validation = useMemo(() => validateNotecardLength(text), [text]);

  const handleSave = async () => {
    if (!validation.valid) {
      setSaveError(validation.error || 'Text exceeds maximum length');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      if (onSave) {
        await onSave({ itemId: asset?.id, name: asset?.name, text });
      } else if (app?.assets?.saveNotecard) {
        await app.assets.saveNotecard({
          itemId: asset?.id,
          name: asset?.name,
          description: asset?.description,
          text,
        });
      }
      setInitialText(text);
      setIsDirty(false);
      onDirtyChange?.(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err?.message || 'Failed to save notecard');
    } finally {
      setIsSaving(false);
    }
  };

  const displayTitle = title || asset?.name || 'Asset View';

  if (status === 'loading' || status === 'idle') {
    return <SkeletonAssetPlaceholder title={displayTitle} progress={null} />;
  }

  if (status === 'downloading') {
    return (
      <div
        className={`asset-container asset-downloading ${className}`}
        style={{
          background: V?.surf || 'rgba(0,0,0,0.2)',
          border: `1px solid ${V?.outv || 'rgba(255,255,255,0.15)'}`,
          borderRadius: V?.rs || '6px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          ...style,
        }}
        data-testid="asset-downloading-state"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CrystalLoader size={18} variant="inline" />
          <span style={{ fontWeight: 700, fontSize: '13px', color: V?.ink || '#fff' }}>
            {displayTitle}
          </span>
        </div>
        <SkeletonAssetPlaceholder title={displayTitle} progress={progress} />
        {bytesInfo.total > 0 && (
          <div style={{ fontSize: '11px', color: V?.ink2 || '#aaa', textAlign: 'right' }}>
            {(bytesInfo.loaded / 1024).toFixed(1)} KB / {(bytesInfo.total / 1024).toFixed(1)} KB
          </div>
        )}
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div
        className={`asset-container asset-error ${className}`}
        style={{
          background: V?.surf || 'rgba(0,0,0,0.2)',
          border: `1px solid ${V?.err || '#ff4d4d'}`,
          borderRadius: V?.rs || '6px',
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          maxWidth: '100%',
          boxSizing: 'border-box',
          ...style,
        }}
        role="alert"
        data-testid="asset-error-state"
      >
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '8px', color: V?.err || '#ff4d4d' }}
        >
          <Icon name="alert-triangle" size={20} />
          <span style={{ fontWeight: 700, fontSize: '14px' }}>Asset Load Error</span>
        </div>
        <p style={{ fontSize: '12px', margin: 0, color: V?.ink || '#fff' }}>{errorMsg}</p>
        <button
          type="button"
          onClick={handleRetry}
          data-testid="asset-retry-button"
          style={{
            alignSelf: 'flex-start',
            padding: '8px 16px',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '.1em',
            background: V?.err || '#ff4d4d',
            color: '#ffffff',
            border: 'none',
            borderRadius: V?.rs || '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Icon name="rotate-cw" size={14} />
          RETRY
        </button>
      </div>
    );
  }

  // "loaded" state
  return (
    <div
      className={`asset-container asset-loaded ${className}`}
      style={{
        background: V?.surf || 'rgba(0,0,0,0.2)',
        border: `1px solid ${V?.outv || 'rgba(255,255,255,0.15)'}`,
        borderRadius: V?.rs || '6px',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        maxWidth: '100%',
        boxSizing: 'border-box',
        ...style,
      }}
      data-testid="asset-loaded-state"
    >
      {renderContent ? (
        renderContent(loadedData, asset)
      ) : children ? (
        children
      ) : isNotecard ? (
        <div
          className="notecard-editor-container"
          style={{ display: 'flex', flexDirection: 'column', gap: '10px', width: '100%' }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '8px',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon name="file-text" size={16} style={{ color: V?.pri || '#6CFF9A' }} />
              <span style={{ fontWeight: 700, fontSize: '13px', color: V?.ink || '#fff' }}>
                {displayTitle}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background:
                    mode === 'edit'
                      ? 'rgba(108,255,154,0.15)'
                      : V?.surf2 || 'rgba(255,255,255,0.08)',
                  color: mode === 'edit' ? V?.pri || '#6CFF9A' : V?.ink2 || '#aaa',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                }}
              >
                {mode === 'edit' ? 'Editing' : 'Read-Only'}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {mode === 'view' ? (
                <TouchTarget
                  minSize={24}
                  onClick={() => setMode('edit')}
                  disabled={readOnly || !isLoggedIn}
                  aria-label="Edit notecard"
                  title={!isLoggedIn ? 'Log in to edit notecards' : 'Edit notecard text'}
                  style={{
                    padding: '6px 12px',
                    fontSize: '11px',
                    fontWeight: 700,
                    background: V?.pri || '#6CFF9A',
                    color: '#000',
                    border: 'none',
                    borderRadius: V?.rs || '4px',
                    cursor: readOnly || !isLoggedIn ? 'not-allowed' : 'pointer',
                    opacity: readOnly || !isLoggedIn ? 0.5 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <Icon name="edit-3" size={13} />
                  EDIT
                </TouchTarget>
              ) : (
                <>
                  <TouchTarget
                    minSize={24}
                    onClick={handleCancel}
                    disabled={isSaving}
                    aria-label="Cancel editing"
                    style={{
                      padding: '6px 10px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: 'transparent',
                      color: V?.ink2 || '#aaa',
                      border: `1px solid ${V?.outv || 'rgba(255,255,255,0.2)'}`,
                      borderRadius: V?.rs || '4px',
                      cursor: isSaving ? 'not-allowed' : 'pointer',
                    }}
                  >
                    CANCEL
                  </TouchTarget>
                  <TouchTarget
                    minSize={24}
                    onClick={handleSave}
                    disabled={isSaving || !validation.valid || !isDirty}
                    aria-label="Save notecard"
                    style={{
                      padding: '6px 12px',
                      fontSize: '11px',
                      fontWeight: 700,
                      background: V?.pri || '#6CFF9A',
                      color: '#000',
                      border: 'none',
                      borderRadius: V?.rs || '4px',
                      cursor: isSaving || !validation.valid || !isDirty ? 'not-allowed' : 'pointer',
                      opacity: isSaving || !validation.valid || !isDirty ? 0.5 : 1,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Icon name="save" size={13} />
                    {isSaving ? 'SAVING…' : 'SAVE'}
                  </TouchTarget>
                </>
              )}
            </div>
          </div>

          {!isLoggedIn && (
            <div
              role="status"
              data-testid="notecard-login-prompt"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(255, 170, 0, 0.15)',
                border: '1px solid rgba(255, 170, 0, 0.3)',
                color: '#ffbb33',
              }}
            >
              Connect to a grid to edit notecards.
            </div>
          )}

          {saveSuccess && (
            <div
              role="status"
              data-testid="notecard-save-success"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(108, 255, 154, 0.15)',
                border: '1px solid rgba(108, 255, 154, 0.3)',
                color: V?.pri || '#6CFF9A',
              }}
            >
              Notecard saved successfully.
            </div>
          )}

          {saveError && (
            <div
              role="alert"
              data-testid="notecard-save-error"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(255, 77, 77, 0.15)',
                border: '1px solid rgba(255, 77, 77, 0.3)',
                color: V?.err || '#ff4d4d',
              }}
            >
              {saveError}
            </div>
          )}

          {!validation.valid && (
            <div
              role="alert"
              data-testid="notecard-validation-error"
              style={{
                padding: '6px 10px',
                fontSize: '11px',
                borderRadius: '4px',
                background: 'rgba(255, 77, 77, 0.15)',
                border: '1px solid rgba(255, 77, 77, 0.3)',
                color: V?.err || '#ff4d4d',
              }}
            >
              {validation.error}
            </div>
          )}

          {mode === 'edit' ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <textarea
                aria-label="Notecard text editor"
                data-testid="notecard-text-editor"
                value={text}
                onChange={handleTextChange}
                rows={8}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  minHeight: '160px',
                  maxHeight: '360px',
                  resize: 'vertical',
                  fontFamily: 'monospace, sans-serif',
                  fontSize: '12px',
                  lineHeight: '1.4',
                  padding: '10px',
                  background: V?.surf2 || 'rgba(0,0,0,0.3)',
                  color: V?.ink || '#fff',
                  border: `1px solid ${validation.valid ? V?.outv || 'rgba(255,255,255,0.15)' : V?.err || '#ff4d4d'}`,
                  borderRadius: V?.rs || '4px',
                  outline: 'none',
                }}
              />
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '10px',
                  color: V?.ink2 || '#aaa',
                }}
              >
                <span>{isDirty ? 'Unsaved changes' : 'No changes'}</span>
                <span style={{ color: !validation.valid ? V?.err || '#ff4d4d' : undefined }}>
                  {validation.byteLength.toLocaleString()} / {MAX_NOTECARD_BYTES.toLocaleString()}{' '}
                  bytes
                </span>
              </div>
            </div>
          ) : (
            <pre
              data-testid="notecard-text-view"
              style={{
                fontFamily: 'monospace, sans-serif',
                fontSize: '12px',
                lineHeight: '1.4',
                background: V?.surf2 || 'rgba(0,0,0,0.3)',
                color: V?.ink || '#fff',
                padding: '10px',
                borderRadius: V?.rs || '4px',
                overflowX: 'auto',
                overflowY: 'auto',
                maxHeight: '360px',
                minHeight: '60px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                margin: 0,
              }}
            >
              {text || <span style={{ opacity: 0.5, fontStyle: 'italic' }}>Empty notecard.</span>}
            </pre>
          )}
        </div>
      ) : (
        <div>
          <div
            style={{
              fontWeight: 700,
              fontSize: '14px',
              marginBottom: '6px',
              color: V?.ink || '#fff',
            }}
          >
            {displayTitle}
          </div>
          {asset?.description && (
            <p style={{ fontSize: '12px', color: V?.ink2 || '#aaa', margin: '0 0 8px 0' }}>
              {asset.description}
            </p>
          )}
          {typeof loadedData === 'string' ? (
            <pre
              style={{
                fontFamily: 'monospace',
                fontSize: '11px',
                background: V?.surf2 || 'rgba(0,0,0,0.3)',
                padding: '10px',
                borderRadius: '4px',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
              }}
            >
              {loadedData}
            </pre>
          ) : (
            <div style={{ fontSize: '12px', color: V?.pri || '#6CFF9A' }}>
              Asset loaded successfully.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
