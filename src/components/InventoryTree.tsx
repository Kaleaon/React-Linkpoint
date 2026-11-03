import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Folder,
  File,
  MoreVertical,
  ArrowUp,
  ArrowDown,
  FolderInput,
  X,
} from 'lucide-react';
import { app } from '../linkpoint/app';
import { useTheme } from '../context/ThemeContext.jsx';
import FocusTrap from './FocusTrap';

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
  onSelect?: (item: any) => void;
  className?: string;
  filter?: string;
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

interface TreeNodeRowProps {
  flatNode: FlatTreeNode;
  isSelected?: boolean;
  isFocused: boolean;
  onSelect?: (item: any) => void;
  toggleExpand: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  openMoveModal: (item: any) => void;
  announce: (message: string) => void;
  onFocusNode: (id: string) => void;
  onNodeKeyDown: (e: React.KeyboardEvent, flatNode: FlatTreeNode) => void;
}

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

const TreeNodeRow: React.FC<TreeNodeRowProps> = React.memo(
  ({
    flatNode,
    isSelected: isSelectedProp,
    isFocused,
    onSelect,
    toggleExpand,
    openMenuId,
    setOpenMenuId,
    openMoveModal,
    announce,
    onFocusNode,
    onNodeKeyDown,
  }) => {
    const { V } = useSafeTheme();
    const { id, depth, isFolder, isOpen, node } = flatNode;
    const isSelected = isSelectedProp !== undefined ? isSelectedProp : !!flatNode.isSelected;
    const isMenuOpen = openMenuId === id;
    const labelId = `inventory-label-${id}`;
    const firstMenuItemRef = useRef<HTMLButtonElement | null>(null);

    // Auto-focus first menuitem when action menu popup opens
    useEffect(() => {
      if (isMenuOpen && firstMenuItemRef.current) {
        firstMenuItemRef.current.focus();
      }
    }, [isMenuOpen]);

    const handleSelect = (e: React.MouseEvent | React.KeyboardEvent) => {
      e.stopPropagation();
      onFocusNode(id);
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

    const handleMoveUp = (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenuId(null);
      const success = app.inventory.moveItemUp(id);
      if (success) {
        announce(`Moved ${node.name} up`);
      }
      document.getElementById(`inventory-node-${id}`)?.focus();
    };

    const handleMoveDown = (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenuId(null);
      const success = app.inventory.moveItemDown(id);
      if (success) {
        announce(`Moved ${node.name} down`);
      }
      document.getElementById(`inventory-node-${id}`)?.focus();
    };

    const handleOpenMoveModal = (e: React.MouseEvent) => {
      e.stopPropagation();
      setOpenMenuId(null);
      openMoveModal(node);
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

      // 3. Delegate arrow keys, Home, End, Enter, Space to treeview roving handler
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
        onFocus={(e) => {
          if (e.target === e.currentTarget) {
            onFocusNode(id);
          }
        }}
        onKeyDown={handleKeyDown}
        className={`inventory-node-row ${isSelected ? 'selected' : ''} ${isFocused ? 'focused' : ''}`}
        style={{
          display: 'flex',
          alignItems: 'center',
          paddingLeft: `${depth * 1.25 + 0.5}rem`,
          paddingRight: '0.5rem',
          height: `${ROW_HEIGHT}px`,
          boxSizing: 'border-box',
          cursor: 'pointer',
          borderRadius: '4px',
          position: 'relative',
          outline: isFocused ? `2px solid ${V.pri || '#2563eb'}` : 'none',
          outlineOffset: '-2px',
          backgroundColor: isSelected ? V.priC || 'rgba(52, 118, 255, 0.15)' : 'transparent',
          color: isSelected ? V.onpriC || '#ffffff' : V.ink || '#e2e8f0',
        }}
      >
        {isFolder ? (
          <button
            type="button"
            aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
            onClick={handleToggleExpand}
            tabIndex={-1}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: V.ink2 || '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              padding: '2px',
              marginRight: '4px',
            }}
          >
            {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        ) : (
          <span style={{ width: '20px', display: 'inline-block' }} />
        )}

        {isFolder ? (
          <Folder
            size={18}
            style={{ color: V.sec || '#38bdf8', marginRight: '8px', flexShrink: 0 }}
          />
        ) : (
          <File
            size={16}
            style={{ color: V.ok || V.sec2 || '#4ade80', marginRight: '8px', flexShrink: 0 }}
          />
        )}

        <span
          id={labelId}
          style={{
            flexGrow: 1,
            fontSize: '0.875rem',
            fontWeight: isFolder ? 600 : 400,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {node.name || 'Unnamed item'}
        </span>

        {/* Action Menu Trigger (Single-Pointer Alternative) */}
        <div style={{ position: 'relative' }}>
          <button
            type="button"
            aria-label={`Actions for ${node.name}`}
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              setOpenMenuId(isMenuOpen ? null : id);
            }}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: V.ink2 || '#94a3b8',
              padding: '2px 4px',
              display: 'flex',
              alignItems: 'center',
              borderRadius: '4px',
            }}
          >
            <MoreVertical size={16} />
          </button>

          {/* Context Menu Popup */}
          {isMenuOpen && (
            <div
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
                minWidth: '150px',
                padding: '4px 0',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                type="button"
                role="menuitem"
                ref={firstMenuItemRef}
                onClick={handleMoveUp}
                style={{
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
                }}
              >
                <ArrowUp size={14} />
                Move Up
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleMoveDown}
                style={{
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
                }}
              >
                <ArrowDown size={14} />
                Move Down
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={handleOpenMoveModal}
                style={{
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
                }}
              >
                <FolderInput size={14} />
                Move to Folder
              </button>
            </div>
          )}
        </div>
      </div>
    );
  },
);

export const InventoryTree: React.FC<InventoryTreeProps> = ({
  rootFolderId,
  selectedId,
  onSelect,
  className,
  filter,
}) => {
  const { V } = useSafeTheme();
  const [revision, setRevision] = useState(0);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [moveTargetItem, setMoveTargetItem] = useState<any | null>(null);
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
    if (!effectiveRootId) return [];

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

    traverse(effectiveRootId, 0);
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
        default:
          break;
      }
    },
    [announce, onSelect, scrollAndFocus, toggleExpand],
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

      {/* ARIA Tree */}
      <div
        role="tree"
        aria-label="Inventory Tree"
        style={{
          position: 'relative',
          minHeight: effectiveRootId ? `${totalHeight}px` : 'auto',
          width: '100%',
        }}
      >
        {effectiveRootId ? (
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
                isSelected={flatNode.id === selectedId}
                isFocused={flatNode.id === rovingTabNodeId}
                onSelect={onSelect}
                toggleExpand={toggleExpand}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                openMoveModal={openMoveModal}
                announce={announce}
                onFocusNode={handleFocusNode}
                onNodeKeyDown={handleNodeKeyDown}
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
    </div>
  );
};

export default InventoryTree;
