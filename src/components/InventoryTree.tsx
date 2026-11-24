import React, { useState, useEffect, useMemo, useCallback, useRef, useContext } from 'react';
import {
  ArrowUp,
  ArrowDown,
  FolderInput,
  FolderPlus,
  Trash2,
  X,
  FileText,
  SlidersHorizontal,
  AlertCircle,
} from 'lucide-react';
import { app } from '../linkpoint/app';
import { AppContext } from '../context/AppContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import FocusTrap from './FocusTrap';
import TouchTarget from './TouchTarget';
import CreateFolderModal from './CreateFolderModal';
import type { InspectableInventoryItem } from '../linkpoint/services/inventory-properties-service';

function useSafeTheme() {
  const context = useTheme();
  if (context && context.V) {
    return context;
  }
  return { V: {} as Record<string, string> };
}

export interface InventoryTreeProps {
  rootFolderId?: string;
  selectedId?: string;
  selectedIds?: string[];
  onSelect?: (item: any) => void;
  onSelectionChange?: (items: InspectableInventoryItem[]) => void;
  onOpenProperties?: (items: InspectableInventoryItem[], options?: { newWindow?: boolean }) => void;
  className?: string;
  filter?: string;
  onItemActivate?: (item: any) => void;
  expandRequest?: { folderId: string; seq: number } | null;
  onRequestCreateFolder?: (parentFolderId: string) => void;
}

export interface FlatTreeNode {
  id: string;
  depth: number;
  isFolder: boolean;
  isOpen: boolean;
  isSelected?: boolean;
  node: any;
}

const ROW_HEIGHT = 36; // Fixed row height in pixels for efficient index calculations
const OVERSCAN = 5; // Buffer rows rendered above and below the viewport

const TREE_ROW_STYLES = `
.inventory-node-row {
  display: flex;
  align-items: center;
  padding-right: 0.5rem;
  height: ${ROW_HEIGHT}px;
  box-sizing: border-box;
  cursor: pointer;
  border-radius: 4px;
  position: relative;
  outline-offset: -2px;
}
.inv-tree-expand-btn {
  background: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
  margin-right: 4px;
}
.inv-tree-leaf-spacer {
  width: 20px;
  display: inline-block;
  flex-shrink: 0;
}
.inv-tree-node-icon {
  margin-right: 8px;
  flex-shrink: 0;
}
.inv-tree-node-label {
  flex-grow: 1;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inv-tree-menu-wrap {
  position: relative;
}
.inv-tree-action-trigger {
  background: none;
  border: none;
  cursor: pointer;
  padding: 2px 4px;
  display: flex;
  align-items: center;
  border-radius: 4px;
}
`;

const CHEVRON_DOWN_SVG = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const CHEVRON_RIGHT_SVG = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="m9 18 6-6-6-6" />
  </svg>
);

const MORE_VERTICAL_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 6.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
  </svg>
);

interface TreeNodeRowProps {
  flatNode: FlatTreeNode;
  themeVars: ReturnType<typeof useSafeTheme>['V'];
  isSelected?: boolean;
  isFocused: boolean;
  onSelect?: (item: any) => void;
  onRowClick?: (flatNode: FlatTreeNode, e: React.MouseEvent | React.KeyboardEvent) => void;
  onInspectProperties?: (flatNode: FlatTreeNode, newWindow?: boolean) => void;
  toggleExpand: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  openMoveModal: (item: any) => void;
  openCreateFolderModal?: (folder: any) => void;
  openEmptyTrashModal?: () => void;
  onDeleteNode?: (flatNode: FlatTreeNode) => void;
  announce: (message: string) => void;
  onFocusNode: (id: string) => void;
  onNodeKeyDown: (e: React.KeyboardEvent, flatNode: FlatTreeNode) => void;
  onItemActivate?: (item: any) => void;
}

const EMPTY_IDS: string[] = [];
const EMPTY_ITEMS: InspectableInventoryItem[] = [];

const srOnlyStyle: React.CSSProperties = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
};

interface TreeNodeActionMenuProps {
  flatNode: FlatTreeNode;
  V: ReturnType<typeof useSafeTheme>['V'];
  setOpenMenuId: (id: string | null) => void;
  openMoveModal: (item: any) => void;
  openCreateFolderModal?: (folder: any) => void;
  openEmptyTrashModal?: () => void;
  onDeleteNode?: (flatNode: FlatTreeNode) => void;
  onInspectProperties?: (flatNode: FlatTreeNode, newWindow?: boolean) => void;
  onItemActivate?: (item: any) => void;
  announce: (message: string) => void;
}

const TreeNodeActionMenu: React.FC<TreeNodeActionMenuProps> = ({
  flatNode,
  V,
  setOpenMenuId,
  openMoveModal,
  openCreateFolderModal,
  openEmptyTrashModal,
  onDeleteNode,
  onInspectProperties,
  onItemActivate,
  announce,
}) => {
  const { id, isFolder, node } = flatNode;
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const firstItem = menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]');
    firstItem?.focus();
  }, []);

  const isProtected = isFolder ? app.inventory.isProtectedFolder(node) : false;
  const canCreateSubfolder = isFolder ? app.inventory.canCreateFolderIn(node) : false;
  const isTrashFolder = isFolder
    ? node.folderType === 13 ||
      node.folderType === 14 ||
      String(node.name || '')
        .trim()
        .toLowerCase() === 'trash' ||
      app.inventory.getTrashFolder()?.id === id
    : false;
  const hasTrashChildren =
    isTrashFolder &&
    ((Array.isArray(node.children) && node.children.length > 0) ||
      (Array.isArray(app.inventory.folders.get(id)?.children) &&
        (app.inventory.folders.get(id)?.children?.length ?? 0) > 0));

  const menuItemStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: V.ink || '#f8fafc',
    padding: '8px 12px',
    textAlign: 'left',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '0.8125rem',
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`Actions menu for ${node.name}`}
      style={{
        position: 'absolute',
        right: 0,
        top: '100%',
        zIndex: 50,
        backgroundColor: V.surf || '#1e293b',
        border: `1px solid ${V.bdg || '#334155'}`,
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
        minWidth: '160px',
        padding: '4px 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {canCreateSubfolder && (
        <TouchTarget
          type="button"
          role="menuitem"
          minSize={44}
          enhanced
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
            openCreateFolderModal?.(node);
          }}
          style={{
            ...menuItemStyle,
            justifyContent: 'flex-start',
            width: '100%',
          }}
        >
          <FolderPlus size={14} style={{ color: V.pri || '#38bdf8' }} aria-hidden="true" />
          New Folder
        </TouchTarget>
      )}
      {!isFolder && Number(node.assetType) === 7 && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
            onItemActivate?.(node);
          }}
          style={menuItemStyle}
        >
          <FileText size={14} style={{ color: V.pri || '#38bdf8' }} />
          Open Notecard
        </button>
      )}
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(null);
          const success = app.inventory.moveItemUp(id);
          if (success) {
            announce(`Moved ${node.name} up`);
          }
          document.getElementById(`inventory-node-${id}`)?.focus();
        }}
        style={menuItemStyle}
      >
        <ArrowUp size={14} />
        Move Up
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(null);
          const success = app.inventory.moveItemDown(id);
          if (success) {
            announce(`Moved ${node.name} down`);
          }
          document.getElementById(`inventory-node-${id}`)?.focus();
        }}
        style={menuItemStyle}
      >
        <ArrowDown size={14} />
        Move Down
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={(e) => {
          e.stopPropagation();
          setOpenMenuId(null);
          openMoveModal(node);
        }}
        style={menuItemStyle}
      >
        <FolderInput size={14} />
        Move to Folder
      </button>
      {!isFolder && onInspectProperties && (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(null);
              onInspectProperties(flatNode, e.shiftKey);
            }}
            style={menuItemStyle}
          >
            <SlidersHorizontal size={14} style={{ color: V.pri || '#38bdf8' }} />
            Properties
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(null);
              onInspectProperties(flatNode, true);
            }}
            style={menuItemStyle}
          >
            <SlidersHorizontal size={14} style={{ color: V.sec || V.pri || '#38bdf8' }} />
            Compare in New Window
          </button>
        </>
      )}
      {!isProtected && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
            onDeleteNode?.(flatNode);
          }}
          style={menuItemStyle}
        >
          <Trash2 size={14} aria-hidden="true" />
          Delete
        </button>
      )}
      {isTrashFolder && hasTrashChildren && (
        <button
          type="button"
          role="menuitem"
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
            openEmptyTrashModal?.();
          }}
          style={menuItemStyle}
        >
          <Trash2 size={14} aria-hidden="true" />
          Empty Trash
        </button>
      )}
    </div>
  );
};

const TreeNodeRow: React.FC<TreeNodeRowProps> = React.memo(
  ({
    flatNode,
    themeVars: V,
    isSelected: isSelectedProp,
    isFocused,
    onSelect,
    onRowClick,
    onInspectProperties,
    toggleExpand,
    openMenuId,
    setOpenMenuId,
    openMoveModal,
    openCreateFolderModal,
    openEmptyTrashModal,
    onDeleteNode,
    announce,
    onFocusNode,
    onNodeKeyDown,
    onItemActivate,
  }) => {
    const { id, depth, isFolder, isOpen, node } = flatNode;
    const isSelected = isSelectedProp !== undefined ? isSelectedProp : !!flatNode.isSelected;
    const isMenuOpen = openMenuId === id;
    const labelId = `inventory-label-${id}`;

    const handleSelect = (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      onFocusNode(id);
      if (onRowClick) {
        onRowClick(flatNode, e);
        return;
      }
      if (onSelect) {
        onSelect(node);
      }
      announce(`Selected ${node.name || 'Unnamed item'}`);
    };

    const handleToggleExpand = (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleExpand(id);
      announce(isOpen ? `Collapsed ${node.name}` : `Expanded ${node.name}`);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
      // 1. If action menu is open, handle menu navigation / escape without breaking tree roving state
      if (isMenuOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          setOpenMenuId(null);
          const rowEl = document.getElementById(`inventory-node-${id}`);
          rowEl?.focus();
          return;
        }

        const target = e.target as HTMLElement;
        if (target.closest('[role="menu"]')) {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopPropagation();
            const menuContainer = target.closest('[role="menu"]');
            const menuItems = Array.from(
              menuContainer?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [],
            );
            const idx = menuItems.indexOf(target);
            if (idx !== -1 && menuItems.length > 0) {
              const nextIdx =
                e.key === 'ArrowDown'
                  ? (idx + 1) % menuItems.length
                  : (idx - 1 + menuItems.length) % menuItems.length;
              menuItems[nextIdx]?.focus();
            }
            return;
          }
          if (e.key === 'Enter' || e.key === ' ') {
            // Let native button click handler run
            return;
          }
          return;
        }
      }

      // 2. Open action menu shortcut
      if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
        e.preventDefault();
        e.stopPropagation();
        setOpenMenuId(isMenuOpen ? null : id);
        return;
      }

      // 3. Keyboard Delete / Backspace workflow
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        if (onDeleteNode) {
          onDeleteNode(flatNode);
        }
        return;
      }

      // 4. Delegate arrow keys, Home, End, Enter, Space to treeview roving handler
      onNodeKeyDown(e, flatNode);
    };

    return (
      <div
        role="treeitem"
        id={`inventory-node-${id}`}
        aria-labelledby={labelId}
        aria-expanded={isFolder ? isOpen : undefined}
        aria-selected={isSelected}
        aria-level={depth + 1}
        tabIndex={isFocused ? 0 : -1}
        onClick={handleSelect}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFocusNode(id);
          setOpenMenuId(isMenuOpen ? null : id);
        }}
        onDoubleClick={() => {
          if (!isFolder) {
            onItemActivate?.(node);
          }
        }}
        onFocus={(e) => {
          if (e.target === e.currentTarget) {
            onFocusNode(id);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`inventory-node-row inventory-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
        style={{
          paddingLeft: `${depth * 1.25 + 0.5}rem`,
          outline: isFocused ? `2px solid ${V.pri || '#2563eb'}` : 'none',
          backgroundColor: isSelected ? V.priC || 'rgba(52, 118, 255, 0.15)' : 'transparent',
          color: isSelected ? V.onpriC || '#ffffff' : V.ink || '#e2e8f0',
        }}
      >
        {isFolder ? (
          <button
            type="button"
            className="inv-tree-expand-btn"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={handleToggleExpand}
            tabIndex={-1}
            style={{ color: V.ink2 || '#94a3b8' }}
          >
            {isOpen ? CHEVRON_DOWN_SVG : CHEVRON_RIGHT_SVG}
          </button>
        ) : (
          <span className="inv-tree-leaf-spacer" />
        )}

        {isFolder ? (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke={V.sec || '#38bdf8'}
            strokeWidth="2"
            aria-hidden="true"
            className="inv-tree-node-icon"
          >
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
          </svg>
        ) : (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke={V.ok || V.sec2 || '#4ade80'}
            strokeWidth="2"
            aria-hidden="true"
            className="inv-tree-node-icon"
          >
            <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          </svg>
        )}

        <span
          id={labelId}
          className="inv-tree-node-label"
          style={isFolder ? { fontWeight: 600 } : undefined}
        >
          {node.name || 'Unnamed item'}
        </span>

        {/* Action Menu Trigger (Single-Pointer Alternative) */}
        <div className="inv-tree-menu-wrap">
          <button
            type="button"
            className="inv-tree-action-trigger"
            aria-label={`Actions for ${node.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(isMenuOpen ? null : id);
            }}
            style={{ color: V.ink2 || '#94a3b8' }}
          >
            {MORE_VERTICAL_SVG}
          </button>

          {isMenuOpen && (
            <TreeNodeActionMenu
              flatNode={flatNode}
              V={V}
              setOpenMenuId={setOpenMenuId}
              openMoveModal={openMoveModal}
              openCreateFolderModal={openCreateFolderModal}
              openEmptyTrashModal={openEmptyTrashModal}
              onDeleteNode={onDeleteNode}
              onInspectProperties={onInspectProperties}
              onItemActivate={onItemActivate}
              announce={announce}
            />
          )}
        </div>
      </div>
    );
  },
);

export const InventoryTree: React.FC<InventoryTreeProps> = ({
  rootFolderId,
  selectedId,
  selectedIds: controlledSelectedIds,
  onSelect,
  onSelectionChange,
  onOpenProperties,
  className,
  filter,
  onItemActivate,
  expandRequest,
  onRequestCreateFolder,
}) => {
  const { V } = useSafeTheme();
  const appCtx = useContext(AppContext);
  const [revision, setRevision] = useState(0);
  const [internalSelectedIds, setInternalSelectedIds] = useState<string[]>([]);
  const anchorNodeIdRef = useRef<string | null>(null);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [moveTargetItem, setMoveTargetItem] = useState<any | null>(null);
  const [createFolderParentId, setCreateFolderParentId] = useState<string | null>(null);
  const [folderErrorAlert, setFolderErrorAlert] = useState<string>('');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [emptyTrashModalOpen, setEmptyTrashModalOpen] = useState(false);
  const [selectedTargetFolderId, setSelectedTargetFolderId] = useState<string>('');
  const [announcement, setAnnouncement] = useState<string>('');
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const shouldFocusRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

  useEffect(() => {
    if (selectedId) {
      setFocusedId(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    const handleUpdate = () => setRevision((v) => v + 1);
    app.inventory.on('inventory_updated', handleUpdate);
    app.inventory.on('inventory_loaded', handleUpdate);
    return () => {
      app.inventory.off('inventory_updated', handleUpdate);
      app.inventory.off('inventory_loaded', handleUpdate);
    };
  }, []);

  const announce = useCallback((msg: string) => {
    setAnnouncement(msg);
  }, []);

  const effectiveRootId = useMemo(() => {
    if (rootFolderId) return rootFolderId;
    if (app.inventory.rootFolder?.id) return app.inventory.rootFolder.id;
    const rootCandidate = Array.from(app.inventory.folders.values()).find(
      (f: any) => !f.parent || f.parent === 'root',
    );
    return rootCandidate?.id || null;
  }, [rootFolderId, revision]);

  // Expand root folder automatically on initial load
  useEffect(() => {
    if (effectiveRootId && expandedMap[effectiveRootId] === undefined) {
      setExpandedMap((prev) => ({ ...prev, [effectiveRootId]: true }));
    }
  }, [effectiveRootId]);

  // Expand requested parent folder (e.g., when toolbar creates a subfolder)
  useEffect(() => {
    if (expandRequest?.folderId) {
      setExpandedMap((prev) => ({ ...prev, [expandRequest.folderId]: true }));
    }
  }, [expandRequest]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Measure viewport height for virtual window calculations
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateHeight = () => {
      if (el.clientHeight > 0) {
        setViewportHeight(el.clientHeight);
      }
    };

    updateHeight();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateHeight);
      observer.observe(el);
      return () => observer.disconnect();
    }
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Construct flat linear array of expanded tree nodes for virtual rendering
  const flatNodes = useMemo(() => {
    const filterQuery = (filter || '').trim().toLocaleLowerCase();
    const result: FlatTreeNode[] = [];
    const visited = new Set<string>();

    const traverse = (nodeId: string, depth: number) => {
      if (visited.has(nodeId)) return;
      visited.add(nodeId);

      const folder = app.inventory.folders.get(nodeId);
      const item = app.inventory.items.get(nodeId);
      const node = folder || item;
      if (!node) return;

      const isFolder = !!folder;
      const isOpen = !!expandedMap[nodeId];

      if (filterQuery) {
        const nameMatches = String(node.name || '')
          .toLocaleLowerCase()
          .includes(filterQuery);
        if (nameMatches) {
          result.push({ id: nodeId, depth, isFolder, isOpen, node });
        }
      } else {
        result.push({ id: nodeId, depth, isFolder, isOpen, node });
      }

      if (isFolder && (isOpen || filterQuery)) {
        const children = Array.from(new Set((folder.children || []) as string[]));
        for (const childId of children) {
          traverse(childId, depth + 1);
        }
      }
    };

    if (effectiveRootId) {
      traverse(effectiveRootId, 0);
    } else {
      for (const [id, folder] of app.inventory.folders.entries()) {
        if (
          !folder.parent ||
          folder.parent === 'root' ||
          !app.inventory.folders.has(folder.parent)
        ) {
          traverse(id, 0);
        }
      }
      for (const [id, item] of app.inventory.items.entries()) {
        if (!item.parent || item.parent === 'root' || !app.inventory.folders.has(item.parent)) {
          traverse(id, 0);
        }
      }
    }
    return result;
  }, [effectiveRootId, expandedMap, revision, filter]);

  // Candidate destination folders for Move Modal
  const candidateFolders = useMemo(() => {
    if (!moveTargetItem) return [];

    const getPath = (folderId: string): string => {
      const parts: string[] = [];
      let curr: any = app.inventory.folders.get(folderId);
      while (curr) {
        parts.unshift(curr.name || 'Unnamed Folder');
        curr = curr.parent ? app.inventory.folders.get(curr.parent) : null;
      }
      return parts.join(' / ');
    };

    const isDescendant = (folderId: string, ancestorId: string): boolean => {
      let curr: any = app.inventory.folders.get(folderId);
      while (curr) {
        if (curr.id === ancestorId) return true;
        curr = curr.parent ? app.inventory.folders.get(curr.parent) : null;
      }
      return false;
    };

    const foldersList: Array<{ id: string; name: string; path: string }> = [];

    app.inventory.folders.forEach((folder: any) => {
      if (moveTargetItem.type === 'folder' && isDescendant(folder.id, moveTargetItem.id)) {
        return;
      }
      foldersList.push({
        id: folder.id,
        name: folder.name || 'Unnamed Folder',
        path: getPath(folder.id),
      });
    });

    foldersList.sort((a, b) => a.path.localeCompare(b.path));
    return foldersList;
  }, [moveTargetItem]);

  const openMoveModal = useCallback(
    (item: any) => {
      setMoveTargetItem(item);
      const initialTarget =
        candidateFolders.find((f) => f.id !== item.parent)?.id || candidateFolders[0]?.id || '';
      setSelectedTargetFolderId(initialTarget);
    },
    [candidateFolders],
  );

  const handleOpenCreateFolderModal = useCallback(
    (folder: any) => {
      if (!folder?.id) return;
      if (onRequestCreateFolder) {
        onRequestCreateFolder(folder.id);
        return;
      }
      setFolderErrorAlert('');
      setCreateFolderParentId(folder.id);
    },
    [onRequestCreateFolder],
  );

  const handleCreateFolderSubmit = useCallback(
    async ({ parentId, name }: { parentId: string; name: string }) => {
      setCreateFolderParentId(null);
      setFolderErrorAlert('');
      setExpandedMap((prev) => ({ ...prev, [parentId]: true }));

      try {
        const created = await app.inventory.createInventoryFolder({
          parentId,
          name,
          onOptimisticCreate: (optFolder) => {
            setFocusedId(optFolder.id);
            onSelect?.(optFolder);
          },
        });
        if (created) {
          setFocusedId(created.id);
          onSelect?.(created);
          announce(`Created folder ${created.name}`);
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Simulator network error';
        const alertMsg = `Failed to create folder: ${reason}`;
        setFolderErrorAlert(alertMsg);
        announce(alertMsg);
      }
    },
    [announce, onSelect],
  );

  const handleDeleteNode = useCallback(
    (flatNode: FlatTreeNode) => {
      const isProtected = app.inventory.isProtectedFolder(flatNode.id);
      if (isProtected) {
        announce('System folders cannot be deleted');
        return;
      }

      const inTrash = app.inventory.isItemInTrash(flatNode.id);
      if (inTrash) {
        setDeleteConfirmItem(flatNode.node);
        return;
      }

      const success = app.inventory.moveToTrash(flatNode.id);
      if (success) {
        announce('Moved item to Trash');
      }
    },
    [announce],
  );

  const handleOpenEmptyTrashModal = useCallback(() => {
    setEmptyTrashModalOpen(true);
  }, []);

  const handleConfirmEmptyTrash = async () => {
    setEmptyTrashModalOpen(false);
    try {
      await app.inventory.emptyTrash();
      announce('Trash emptied successfully');
    } catch (err) {
      console.error('Failed to empty trash:', err);
      announce('Failed to empty trash');
    }
  };

  const handleConfirmDeleteItem = async () => {
    if (!deleteConfirmItem) return;
    const itemToDelete = deleteConfirmItem;
    setDeleteConfirmItem(null);
    try {
      await app.inventory.permanentlyDeleteItem(itemToDelete.id);
      announce(`Permanently deleted ${itemToDelete.name || 'item'}`);
    } catch (err) {
      console.error('Failed to delete item:', err);
      announce('Failed to delete item');
    }
  };

  const handleConfirmMoveToFolder = () => {
    if (!moveTargetItem || !selectedTargetFolderId) return;
    const targetFolder = app.inventory.folders.get(selectedTargetFolderId);
    const targetName = targetFolder?.name || 'Selected Folder';
    const success = app.inventory.moveItemToFolder(moveTargetItem.id, selectedTargetFolderId);
    if (success) {
      announce(`Moved ${moveTargetItem.name} to folder ${targetName}`);
    }
    setMoveTargetItem(null);
  };

  // Compute virtual list window bounds
  const effectiveViewportHeight =
    viewportHeight || (containerRef.current?.clientHeight ?? 0) || 800;
  const totalCount = flatNodes.length;
  const totalHeight = totalCount * ROW_HEIGHT;

  const visibleCount = Math.ceil(effectiveViewportHeight / ROW_HEIGHT);
  const rawStartIndex = Math.floor(scrollTop / ROW_HEIGHT);

  const startIndex = Math.max(
    0,
    Math.min(rawStartIndex - OVERSCAN, Math.max(0, totalCount - visibleCount)),
  );
  const endIndex = Math.min(
    totalCount,
    Math.max(startIndex + visibleCount + OVERSCAN * 2, rawStartIndex + visibleCount + OVERSCAN),
  );

  const visibleNodes = useMemo(() => {
    return flatNodes.slice(startIndex, endIndex);
  }, [flatNodes, startIndex, endIndex]);

  const flatNodesRef = useRef<FlatTreeNode[]>([]);
  flatNodesRef.current = flatNodes;

  const rovingTabNodeId = useMemo(() => {
    if (focusedId && visibleNodes.some((n) => n.id === focusedId)) {
      return focusedId;
    }
    if (selectedId && visibleNodes.some((n) => n.id === selectedId)) {
      return selectedId;
    }
    if (visibleNodes.length > 0) {
      return visibleNodes[0].id;
    }
    return flatNodes[0]?.id || null;
  }, [focusedId, selectedId, visibleNodes, flatNodes]);

  useEffect(() => {
    if (shouldFocusRef.current && rovingTabNodeId) {
      const el = document.getElementById(`inventory-node-${rovingTabNodeId}`);
      if (el) {
        shouldFocusRef.current = false;
        el.focus();
      } else {
        const frame = requestAnimationFrame(() => {
          const delayedEl = document.getElementById(`inventory-node-${rovingTabNodeId}`);
          if (delayedEl) {
            shouldFocusRef.current = false;
            delayedEl.focus();
          }
        });
        return () => cancelAnimationFrame(frame);
      }
    }
  }, [rovingTabNodeId, visibleNodes, scrollTop]);

  const scrollAndFocus = useCallback(
    (targetId: string, targetIndex: number) => {
      const container = containerRef.current;
      if (container) {
        const clientHeight = container.clientHeight || effectiveViewportHeight || 800;
        const itemTop = targetIndex * ROW_HEIGHT;
        const itemBottom = itemTop + ROW_HEIGHT;
        const currentScrollTop = container.scrollTop;
        const currentScrollBottom = currentScrollTop + clientHeight;

        let newScrollTop: number | null = null;
        if (targetIndex === 0) {
          newScrollTop = 0;
        } else if (targetIndex === flatNodesRef.current.length - 1) {
          newScrollTop = Math.max(0, flatNodesRef.current.length * ROW_HEIGHT - clientHeight);
        } else if (itemBottom > currentScrollBottom) {
          newScrollTop = itemBottom - clientHeight;
        } else if (itemTop < currentScrollTop) {
          newScrollTop = itemTop;
        }

        if (newScrollTop !== null && newScrollTop !== currentScrollTop) {
          container.scrollTop = newScrollTop;
          setScrollTop(newScrollTop);
        }
      }
      shouldFocusRef.current = true;
      setFocusedId(targetId);
    },
    [effectiveViewportHeight],
  );

  const handleFocusNode = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  const handleNodeKeyDown = useCallback(
    (e: React.KeyboardEvent, flatNode: FlatTreeNode) => {
      const nodes = flatNodesRef.current;
      const currentIndex = nodes.findIndex((n) => n.id === flatNode.id);
      if (currentIndex === -1) return;

      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault();
          if (currentIndex < nodes.length - 1) {
            const nextNode = nodes[currentIndex + 1];
            scrollAndFocus(nextNode.id, currentIndex + 1);
          }
          break;
        }
        case 'ArrowUp': {
          e.preventDefault();
          if (currentIndex > 0) {
            const prevNode = nodes[currentIndex - 1];
            scrollAndFocus(prevNode.id, currentIndex - 1);
          }
          break;
        }
        case 'Home': {
          e.preventDefault();
          if (nodes.length > 0) {
            scrollAndFocus(nodes[0].id, 0);
          }
          break;
        }
        case 'End': {
          e.preventDefault();
          if (nodes.length > 0) {
            const lastIdx = nodes.length - 1;
            scrollAndFocus(nodes[lastIdx].id, lastIdx);
          }
          break;
        }
        case 'ArrowRight': {
          e.preventDefault();
          if (flatNode.isFolder) {
            if (!flatNode.isOpen) {
              toggleExpand(flatNode.id);
              announce(`Expanded ${flatNode.node.name || 'folder'}`);
            } else if (
              currentIndex < nodes.length - 1 &&
              nodes[currentIndex + 1].depth > flatNode.depth
            ) {
              const childNode = nodes[currentIndex + 1];
              scrollAndFocus(childNode.id, currentIndex + 1);
            }
          }
          break;
        }
        case 'ArrowLeft': {
          e.preventDefault();
          if (flatNode.isFolder && flatNode.isOpen) {
            toggleExpand(flatNode.id);
            announce(`Collapsed ${flatNode.node.name || 'folder'}`);
          } else {
            let parentIdx = -1;
            for (let i = currentIndex - 1; i >= 0; i--) {
              if (nodes[i].depth === flatNode.depth - 1) {
                parentIdx = i;
                break;
              }
            }
            if (parentIdx !== -1) {
              scrollAndFocus(nodes[parentIdx].id, parentIdx);
            }
          }
          break;
        }
        case 'Enter':
        case ' ': {
          e.preventDefault();
          if (onSelect) {
            onSelect(flatNode.node);
          }
          announce(`Selected ${flatNode.node.name || 'Unnamed item'}`);
          if (flatNode.isFolder) {
            toggleExpand(flatNode.id);
          }
          break;
        }
        case 'Delete':
        case 'Backspace': {
          e.preventDefault();
          handleDeleteNode(flatNode);
          break;
        }
        default:
          break;
      }
    },
    [announce, onSelect, scrollAndFocus, toggleExpand],
  );

  const effectiveSelectedIds = useMemo(() => {
    if (Array.isArray(controlledSelectedIds)) {
      return controlledSelectedIds;
    }
    if (internalSelectedIds.length > 0) {
      return internalSelectedIds;
    }
    return selectedId ? [selectedId] : EMPTY_IDS;
  }, [controlledSelectedIds, internalSelectedIds, selectedId]);

  const effectiveSelectedSet = useMemo(() => new Set(effectiveSelectedIds), [effectiveSelectedIds]);

  const selectedItemNodes = useMemo(() => {
    void revision;
    if (effectiveSelectedIds.length <= 1) {
      return EMPTY_ITEMS;
    }
    const items: InspectableInventoryItem[] = [];
    for (const id of effectiveSelectedIds) {
      const item = app.inventory.items.get(id) as InspectableInventoryItem | undefined;
      if (item && !item.folder && item.type !== 'folder') {
        items.push(item);
      }
    }
    return items;
  }, [effectiveSelectedIds, revision]);

  const selectionStateRef = useRef({
    effectiveSelectedIds,
    effectiveSelectedSet,
    selectedItemNodes,
  });
  selectionStateRef.current = {
    effectiveSelectedIds,
    effectiveSelectedSet,
    selectedItemNodes,
  };

  const applySelectedIds = useCallback(
    (nextIds: string[]) => {
      if (!Array.isArray(controlledSelectedIds)) {
        setInternalSelectedIds((prev) =>
          prev.length === 0 && nextIds.length === 0 ? prev : nextIds,
        );
      }
      if (onSelectionChange) {
        const items: InspectableInventoryItem[] = [];
        for (const id of nextIds) {
          const item = app.inventory.items.get(id) as InspectableInventoryItem | undefined;
          if (item && !item.folder && item.type !== 'folder') {
            items.push(item);
          }
        }
        onSelectionChange(items);
      }
    },
    [controlledSelectedIds, onSelectionChange],
  );

  const triggerOpenProperties = useCallback(
    (items: InspectableInventoryItem[], newWindow = false) => {
      if (items.length === 0) return;
      const opts = newWindow ? { newWindow: true } : undefined;
      if (onOpenProperties) {
        onOpenProperties(items, opts);
        return;
      }
      appCtx?.actions?.openItemProperties?.(items, opts);
    },
    [onOpenProperties, appCtx],
  );

  const handleRowClick = useCallback(
    (flatNode: FlatTreeNode, e: React.MouseEvent | React.KeyboardEvent) => {
      const { effectiveSelectedSet: curSet, effectiveSelectedIds: curIds } =
        selectionStateRef.current;
      const isModifier = 'ctrlKey' in e && (e.ctrlKey || e.metaKey);
      const isShift = 'shiftKey' in e && e.shiftKey;

      if (!flatNode.isFolder && isModifier) {
        const exists = curSet.has(flatNode.id);
        const nextIds = exists
          ? curIds.filter((id) => id !== flatNode.id)
          : [...curIds, flatNode.id];
        applySelectedIds(nextIds);
        anchorNodeIdRef.current = flatNode.id;
        onSelect?.(flatNode.node);
        announce(
          `${exists ? 'Deselected' : 'Selected'} ${flatNode.node.name || 'Unnamed item'} (${nextIds.length} selected)`,
        );
        return;
      }

      if (!flatNode.isFolder && isShift && anchorNodeIdRef.current) {
        const nodes = flatNodesRef.current;
        const aIdx = nodes.findIndex((n) => n.id === anchorNodeIdRef.current);
        const bIdx = nodes.findIndex((n) => n.id === flatNode.id);
        if (aIdx !== -1 && bIdx !== -1) {
          const [lo, hi] = aIdx <= bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
          const rangeItemIds = nodes
            .slice(lo, hi + 1)
            .filter((n) => !n.isFolder)
            .map((n) => n.id);
          if (rangeItemIds.length > 0) {
            applySelectedIds(rangeItemIds);
            onSelect?.(flatNode.node);
            announce(`Selected ${rangeItemIds.length} items`);
            return;
          }
        }
      }

      anchorNodeIdRef.current = flatNode.id;
      applySelectedIds(flatNode.isFolder ? EMPTY_IDS : [flatNode.id]);
      onSelect?.(flatNode.node);
      announce(`Selected ${flatNode.node.name || 'Unnamed item'}`);
    },
    [applySelectedIds, onSelect, announce],
  );

  const handleInspectProperties = useCallback(
    (flatNode: FlatTreeNode, newWindow = false) => {
      if (flatNode.isFolder) return;
      const { selectedItemNodes: curItems, effectiveSelectedSet: curSet } =
        selectionStateRef.current;
      if (curItems.length > 1 && curSet.has(flatNode.id)) {
        triggerOpenProperties(curItems, newWindow);
      } else {
        triggerOpenProperties([flatNode.node as InspectableInventoryItem], newWindow);
      }
    },
    [triggerOpenProperties],
  );

  return (
    <div
      ref={containerRef}
      className={`inventory-tree-container ${className || ''}`}
      onScroll={handleScroll}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: V.bg || '#0f172a',
        padding: '0.5rem',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      <style>{TREE_ROW_STYLES}</style>
      {/* Screen Reader Live Region for Dynamic Notifications */}
      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        style={srOnlyStyle}
      >
        {announcement}
      </div>

      {folderErrorAlert && (
        <div
          role="alert"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '8px 12px',
            marginBottom: '8px',
            borderRadius: '6px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${V.err || '#ef4444'}`,
            color: V.ink || '#fecaca',
            fontSize: '0.8125rem',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} style={{ color: V.err || '#ef4444', flexShrink: 0 }} />
            <span>{folderErrorAlert}</span>
          </span>
          <TouchTarget
            type="button"
            minSize={44}
            enhanced
            aria-label="Dismiss error alert"
            onClick={() => setFolderErrorAlert('')}
            style={{
              background: 'none',
              border: 'none',
              color: V.ink || '#fecaca',
              borderRadius: '4px',
            }}
          >
            <X size={16} />
          </TouchTarget>
        </div>
      )}

      {/* Multi-Selection Action Bar */}
      {selectedItemNodes.length > 1 && (
        <div
          data-testid="inventory-multi-select-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '6px 10px',
            marginBottom: '6px',
            borderRadius: '6px',
            backgroundColor: V.surf || '#1e293b',
            border: `1px solid ${V.pri || '#38bdf8'}`,
            color: V.ink || '#f8fafc',
            fontSize: '0.8125rem',
          }}
        >
          <span style={{ fontWeight: 600 }}>{selectedItemNodes.length} items selected</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              type="button"
              onClick={() => triggerOpenProperties(selectedItemNodes)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '4px',
                border: 'none',
                backgroundColor: V.pri || '#38bdf8',
                color: V.onpri || '#0f172a',
                fontWeight: 700,
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              <SlidersHorizontal size={13} />
              Properties
            </button>
            <button
              type="button"
              aria-label="Clear multi-selection"
              onClick={() => applySelectedIds([])}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '4px 6px',
                borderRadius: '4px',
                border: `1px solid ${V.bdg || '#334155'}`,
                backgroundColor: 'transparent',
                color: V.ink2 || '#94a3b8',
                fontSize: '0.75rem',
                cursor: 'pointer',
              }}
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {/* ARIA Tree */}
      <div
        role="tree"
        aria-label="Inventory Tree"
        aria-multiselectable="true"
        style={{
          position: 'relative',
          minHeight: effectiveRootId || flatNodes.length > 0 ? `${totalHeight}px` : 'auto',
          width: '100%',
        }}
      >
        {effectiveRootId || flatNodes.length > 0 ? (
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              transform: `translateY(${startIndex * ROW_HEIGHT}px)`,
            }}
          >
            {visibleNodes.map((flatNode) => (
              <TreeNodeRow
                key={flatNode.id}
                flatNode={flatNode}
                themeVars={V}
                isSelected={flatNode.id === selectedId || effectiveSelectedSet.has(flatNode.id)}
                isFocused={flatNode.id === rovingTabNodeId}
                onSelect={onSelect}
                onRowClick={handleRowClick}
                onInspectProperties={handleInspectProperties}
                toggleExpand={toggleExpand}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                openMoveModal={openMoveModal}
                openCreateFolderModal={handleOpenCreateFolderModal}
                openEmptyTrashModal={handleOpenEmptyTrashModal}
                onDeleteNode={handleDeleteNode}
                announce={announce}
                onFocusNode={handleFocusNode}
                onNodeKeyDown={handleNodeKeyDown}
                onItemActivate={onItemActivate}
              />
            ))}
          </div>
        ) : (
          <div
            style={{
              color: V.ink2 || '#94a3b8',
              padding: '1rem',
              textAlign: 'center',
              fontSize: '0.875rem',
            }}
          >
            No inventory loaded.
          </div>
        )}
      </div>

      {/* Target Folder Prompt Modal for Single-Pointer Item Movement */}
      {moveTargetItem && (
        <FocusTrap
          active={!!moveTargetItem}
          onEscape={() => setMoveTargetItem(null)}
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
            aria-labelledby="move-modal-title"
            style={{
              backgroundColor: V.surf || '#1e293b',
              border: `1px solid ${V.bdg || '#334155'}`,
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
              <h3 id="move-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Move Item
              </h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setMoveTargetItem(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: V.ink2 || '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: V.ink2 || '#cbd5e1', marginBottom: '1rem' }}>
              Select target folder for <strong>{moveTargetItem.name}</strong>:
            </p>

            <select
              aria-label="Target folder"
              value={selectedTargetFolderId}
              onChange={(e) => setSelectedTargetFolderId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: V.bg || '#0f172a',
                border: `1px solid ${V.bdg || '#475569'}`,
                borderRadius: '4px',
                color: V.ink || '#f8fafc',
                fontSize: '0.875rem',
                marginBottom: '1.25rem',
              }}
            >
              {candidateFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.path}
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setMoveTargetItem(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.bdg || '#334155',
                  border: 'none',
                  borderRadius: '4px',
                  color: V.ink || '#f8fafc',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmMoveToFolder}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.pri || '#2563eb',
                  border: 'none',
                  borderRadius: '4px',
                  color: V.onpri || '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Move to Folder
              </button>
            </div>
          </div>
        </FocusTrap>
      )}

      {/* Empty Trash Confirmation Modal */}
      {emptyTrashModalOpen && (
        <FocusTrap
          active={emptyTrashModalOpen}
          onEscape={() => setEmptyTrashModalOpen(false)}
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
            aria-labelledby="empty-trash-modal-title"
            style={{
              backgroundColor: V.surf || '#1e293b',
              border: `1px solid ${V.bdg || '#334155'}`,
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
              <h3
                id="empty-trash-modal-title"
                style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
              >
                Empty Trash
              </h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setEmptyTrashModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: V.ink2 || '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p
              style={{ fontSize: '0.875rem', color: V.ink2 || '#cbd5e1', marginBottom: '1.25rem' }}
            >
              Are you sure you want to permanently delete all items in the Trash folder? This
              operation cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setEmptyTrashModalOpen(false)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.bdg || '#334155',
                  border: 'none',
                  borderRadius: '4px',
                  color: V.ink || '#f8fafc',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmEmptyTrash}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.err || '#ef4444',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </FocusTrap>
      )}

      {/* Delete Item Confirmation Modal for Items in Trash */}
      {deleteConfirmItem && (
        <FocusTrap
          active={!!deleteConfirmItem}
          onEscape={() => setDeleteConfirmItem(null)}
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
            aria-labelledby="delete-confirm-modal-title"
            style={{
              backgroundColor: V.surf || '#1e293b',
              border: `1px solid ${V.bdg || '#334155'}`,
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
              <h3
                id="delete-confirm-modal-title"
                style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}
              >
                Delete Permanently
              </h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setDeleteConfirmItem(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: V.ink2 || '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            <p
              style={{ fontSize: '0.875rem', color: V.ink2 || '#cbd5e1', marginBottom: '1.25rem' }}
            >
              Are you sure you want to permanently delete <strong>{deleteConfirmItem.name}</strong>?
              This operation cannot be undone.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => setDeleteConfirmItem(null)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.bdg || '#334155',
                  border: 'none',
                  borderRadius: '4px',
                  color: V.ink || '#f8fafc',
                  fontSize: '0.875rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteItem}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: V.err || '#ef4444',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </FocusTrap>
      )}

      {createFolderParentId !== null && (
        <CreateFolderModal
          isOpen={true}
          initialParentId={createFolderParentId || undefined}
          onClose={() => setCreateFolderParentId(null)}
          onSubmit={handleCreateFolderSubmit}
        />
      )}
    </div>
  );
};

export default InventoryTree;
