import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FolderPlus, X } from 'lucide-react';
import { app } from '../linkpoint/app';
import { useTheme } from '../context/ThemeContext.jsx';
import FocusTrap from './FocusTrap.jsx';
import TouchTarget from './TouchTarget';

function useSafeTheme() {
  const context = useTheme();
  if (context && context.V) {
    return context;
  }
  return { V: {} as Record<string, string> };
}

export interface CreateFolderModalProps {
  isOpen: boolean;
  initialParentId?: string;
  onClose: () => void;
  onSubmit: (params: { parentId: string; name: string }) => void;
}

const MAX_FOLDER_NAME_LENGTH = 63;

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  initialParentId,
  onClose,
  onSubmit,
}) => {
  const { V } = useSafeTheme();
  const [folderName, setFolderName] = useState('');
  const [destinationId, setDestinationId] = useState('');
  const [hasEditedName, setHasEditedName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  const writableFolders = useMemo(() => {
    if (!isOpen) return [];

    const getPath = (folderId: string): string => {
      const parts: string[] = [];
      const seen = new Set<string>();
      let curr: any = app.inventory.folders.get(folderId);
      while (curr && !seen.has(curr.id)) {
        seen.add(curr.id);
        parts.unshift(curr.name || 'Unnamed Folder');
        curr = curr.parent ? app.inventory.folders.get(curr.parent) : null;
      }
      return parts.join(' / ');
    };

    const list: Array<{ id: string; name: string; path: string; isRoot: boolean }> = [];
    app.inventory.folders.forEach((folder: any) => {
      if (!app.inventory.canCreateFolderIn(folder)) {
        return;
      }
      const isRoot =
        folder.id === app.inventory.rootFolder?.id || !folder.parent || folder.parent === 'root';
      list.push({
        id: folder.id,
        name: folder.name || 'Unnamed Folder',
        path: getPath(folder.id),
        isRoot,
      });
    });

    list.sort((a, b) => {
      if (a.isRoot !== b.isRoot) return a.isRoot ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

    return list;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setFolderName('');
    setHasEditedName(false);

    const preferred =
      initialParentId && writableFolders.some((f) => f.id === initialParentId)
        ? initialParentId
        : writableFolders[0]?.id || '';
    setDestinationId(preferred);

    if (nameInputRef.current) {
      nameInputRef.current.focus();
    } else {
      const frame = requestAnimationFrame(() => {
        nameInputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isOpen, initialParentId, writableFolders]);

  if (!isOpen) return null;

  // eslint-disable-next-line no-control-regex
  const sanitizedTrimmed = folderName.replace(/[\x00-\x1F\x7F|]/g, '').trim();
  const isEmpty = sanitizedTrimmed.length === 0;
  const isTooLong = sanitizedTrimmed.length > MAX_FOLDER_NAME_LENGTH;
  const isDestinationValid =
    Boolean(destinationId) && app.inventory.canCreateFolderIn(destinationId);
  const canSubmit = !isEmpty && !isTooLong && isDestinationValid;

  let validationMessage = '';
  if (isTooLong) {
    validationMessage = `Folder name must not exceed ${MAX_FOLDER_NAME_LENGTH} characters.`;
  } else if (hasEditedName && isEmpty) {
    validationMessage = 'Folder name must contain at least one non-whitespace character.';
  } else if (!isDestinationValid) {
    validationMessage = 'Select a writable destination folder.';
  }

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({
      parentId: destinationId,
      name: sanitizedTrimmed,
    });
  };

  return (
    <FocusTrap
      active={isOpen}
      autoFocus={false}
      onEscape={onClose}
      onClick={(e: React.MouseEvent<HTMLDivElement>) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-folder-modal-title"
        style={{
          backgroundColor: V.surf || '#1e293b',
          border: `1px solid ${V.bdg || V.outv || '#334155'}`,
          borderRadius: '8px',
          padding: '1.25rem',
          maxWidth: '420px',
          width: '100%',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
          color: V.ink || '#f8fafc',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '1rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FolderPlus size={18} style={{ color: V.pri || '#38bdf8' }} aria-hidden="true" />
            <h3
              id="create-folder-modal-title"
              style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
            >
              New Folder
            </h3>
          </div>
          <TouchTarget
            type="button"
            minSize={44}
            enhanced
            aria-label="Close dialog"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: V.ink2 || '#94a3b8',
              borderRadius: '4px',
            }}
          >
            <X size={18} />
          </TouchTarget>
        </div>

        <form onSubmit={handleFormSubmit} noValidate>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="new-folder-name-input"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: V.ink2 || '#cbd5e1',
                marginBottom: '0.375rem',
              }}
            >
              Folder Name
            </label>
            <input
              ref={nameInputRef}
              id="new-folder-name-input"
              type="text"
              value={folderName}
              maxLength={MAX_FOLDER_NAME_LENGTH}
              onChange={(e) => {
                setFolderName(e.target.value);
                setHasEditedName(true);
              }}
              placeholder="Enter folder name"
              aria-required="true"
              aria-invalid={Boolean(validationMessage)}
              aria-describedby="new-folder-validation-msg"
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.5rem 0.75rem',
                boxSizing: 'border-box',
                backgroundColor: V.bg || '#0f172a',
                border: `1px solid ${validationMessage ? V.err || '#ef4444' : V.bdg || V.outv || '#475569'}`,
                borderRadius: '4px',
                color: V.ink || '#f8fafc',
                fontSize: '0.875rem',
              }}
            />
            <div
              id="new-folder-validation-msg"
              aria-live="polite"
              style={{
                minHeight: '1.125rem',
                marginTop: '0.25rem',
                fontSize: '0.75rem',
                color: validationMessage ? V.err || '#f87171' : V.ink2 || '#94a3b8',
              }}
            >
              {validationMessage ||
                `${sanitizedTrimmed.length}/${MAX_FOLDER_NAME_LENGTH} characters`}
            </div>
          </div>

          <div style={{ marginBottom: '1.25rem' }}>
            <label
              htmlFor="new-folder-destination-select"
              style={{
                display: 'block',
                fontSize: '0.8125rem',
                fontWeight: 600,
                color: V.ink2 || '#cbd5e1',
                marginBottom: '0.375rem',
              }}
            >
              Destination Folder
            </label>
            <select
              id="new-folder-destination-select"
              aria-label="Destination folder"
              value={destinationId}
              onChange={(e) => setDestinationId(e.target.value)}
              style={{
                width: '100%',
                minHeight: '44px',
                padding: '0.5rem',
                boxSizing: 'border-box',
                backgroundColor: V.bg || '#0f172a',
                border: `1px solid ${V.bdg || V.outv || '#475569'}`,
                borderRadius: '4px',
                color: V.ink || '#f8fafc',
                fontSize: '0.875rem',
              }}
            >
              {writableFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
            <TouchTarget
              type="button"
              minSize={44}
              enhanced
              onClick={onClose}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: V.bdg || '#334155',
                border: 'none',
                borderRadius: '4px',
                color: V.ink || '#f8fafc',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Cancel
            </TouchTarget>
            <TouchTarget
              type="submit"
              minSize={44}
              enhanced
              disabled={!canSubmit}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: canSubmit ? V.pri || '#2563eb' : V.bdg || '#334155',
                border: 'none',
                borderRadius: '4px',
                color: canSubmit ? V.onpri || '#ffffff' : V.ink2 || '#94a3b8',
                fontSize: '0.875rem',
                fontWeight: 600,
                opacity: canSubmit ? 1 : 0.65,
              }}
            >
              Create Folder
            </TouchTarget>
          </div>
        </form>
      </div>
    </FocusTrap>
  );
};

export default CreateFolderModal;
