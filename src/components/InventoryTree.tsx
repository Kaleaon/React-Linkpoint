import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChevronRight, ChevronDown, Folder, File, MoreVertical, ArrowUp, ArrowDown, FolderInput, X } from 'lucide-react';
import { app } from '../linkpoint/app';
import FocusTrap from './FocusTrap';

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
  isSelected: boolean;
  node: any;
}

const ROW_HEIGHT = 36; // Fixed row height in pixels for efficient index calculations
const OVERSCAN = 5;    // Buffer rows rendered above and below the viewport

interface TreeNodeRowProps {
  flatNode: FlatTreeNode;
  onSelect?: (item: any) => void;
  toggleExpand: (id: string) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  openMoveModal: (item: any) => void;
  announce: (message: string) => void;
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

const TreeNodeRow: React.FC<TreeNodeRowProps> = React.memo(({
  flatNode,
  onSelect,
  toggleExpand,
  openMenuId,
  setOpenMenuId,
  openMoveModal,
  announce,
}) => {
  const { id, depth, isFolder, isOpen, isSelected, node } = flatNode;
  const isMenuOpen = openMenuId === id;
  const labelId = `inventory-label-${id}`;

  const handleSelect = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
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
  };

  const handleMoveDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    const success = app.inventory.moveItemDown(id);
    if (success) {
      announce(`Moved ${node.name} down`);
    }
  };

  const handleOpenMoveModal = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    openMoveModal(node);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(e);
      if (isFolder) {
        toggleExpand(id);
      }
    } else if (e.key === 'ArrowRight' && isFolder && !isOpen) {
      e.preventDefault();
      toggleExpand(id);
      announce(`Expanded ${node.name}`);
    } else if (e.key === 'ArrowLeft' && isFolder && isOpen) {
      e.preventDefault();
      toggleExpand(id);
      announce(`Collapsed ${node.name}`);
    }
  };

  return (
    <div
      role="treeitem"
      id={`inventory-node-${id}`}
      aria-labelledby={labelId}
      aria-expanded={isFolder ? isOpen : undefined}
      aria-selected={isSelected}
      aria-level={depth + 1}
      tabIndex={isSelected ? 0 : -1}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
      className={`inventory-node-row ${isSelected ? 'selected' : ''}`}
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
        backgroundColor: isSelected ? 'rgba(52, 118, 255, 0.15)' : 'transparent',
        color: isSelected ? '#ffffff' : '#e2e8f0',
      }}
    >
      {isFolder ? (
        <button
          type="button"
          aria-label={isOpen ? `Collapse ${node.name}` : `Expand ${node.name}`}
          onClick={handleToggleExpand}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
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
        <Folder size={18} style={{ color: '#38bdf8', marginRight: '8px', flexShrink: 0 }} />
      ) : (
        <File size={16} style={{ color: '#4ade80', marginRight: '8px', flexShrink: 0 }} />
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
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(isMenuOpen ? null : id);
          }}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: '#94a3b8',
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
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
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
              onClick={handleMoveUp}
              style={{
                background: 'none',
                border: 'none',
                color: '#f8fafc',
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
                color: '#f8fafc',
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
                color: '#f8fafc',
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
});

export const InventoryTree: React.FC<InventoryTreeProps> = ({
  rootFolderId,
  selectedId,
  onSelect,
  className,
  filter,
}) => {
  const [revision, setRevision] = useState(0);
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [moveTargetItem, setMoveTargetItem] = useState<any | null>(null);
  const [selectedTargetFolderId, setSelectedTargetFolderId] = useState<string>('');
  const [announcement, setAnnouncement] = useState<string>('');

  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);

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
      (f: any) => !f.parent || f.parent === 'root'
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
      const isSelected = selectedId === nodeId;

      if (filterQuery) {
        const nameMatches = String(node.name || '').toLocaleLowerCase().includes(filterQuery);
        if (nameMatches) {
          result.push({ id: nodeId, depth, isFolder, isOpen, isSelected, node });
        }
      } else {
        result.push({ id: nodeId, depth, isFolder, isOpen, isSelected, node });
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
  }, [effectiveRootId, expandedMap, selectedId, revision, filter]);

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

  const openMoveModal = (item: any) => {
    setMoveTargetItem(item);
    const initialTarget = candidateFolders.find((f) => f.id !== item.parent)?.id || candidateFolders[0]?.id || '';
    setSelectedTargetFolderId(initialTarget);
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
  const effectiveViewportHeight = viewportHeight || (containerRef.current?.clientHeight ?? 0) || 800;
  const totalCount = flatNodes.length;
  const totalHeight = totalCount * ROW_HEIGHT;

  const visibleCount = Math.ceil(effectiveViewportHeight / ROW_HEIGHT);
  const rawStartIndex = Math.floor(scrollTop / ROW_HEIGHT);

  const startIndex = Math.max(0, Math.min(rawStartIndex - OVERSCAN, Math.max(0, totalCount - visibleCount)));
  const endIndex = Math.min(totalCount, Math.max(startIndex + visibleCount + OVERSCAN * 2, rawStartIndex + visibleCount + OVERSCAN));

  const visibleNodes = useMemo(() => {
    return flatNodes.slice(startIndex, endIndex);
  }, [flatNodes, startIndex, endIndex]);

  return (
    <div
      ref={containerRef}
      className={`inventory-tree-container ${className || ''}`}
      onScroll={handleScroll}
      style={{
        width: '100%',
        height: '100%',
        overflowY: 'auto',
        backgroundColor: '#0f172a',
        padding: '0.5rem',
        boxSizing: 'border-box',
        position: 'relative',
      }}
    >
      {/* Screen Reader Live Region for Dynamic Notifications */}
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true" style={srOnlyStyle}>
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
                onSelect={onSelect}
                toggleExpand={toggleExpand}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                openMoveModal={openMoveModal}
                announce={announce}
              />
            ))}
          </div>
        ) : (
          <div style={{ color: '#94a3b8', padding: '1rem', textAlign: 'center', fontSize: '0.875rem' }}>
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
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '8px',
              padding: '1.25rem',
              maxWidth: '420px',
              width: '100%',
              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
              color: '#f8fafc',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 id="move-modal-title" style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>
                Move Item
              </h3>
              <button
                type="button"
                aria-label="Close dialog"
                onClick={() => setMoveTargetItem(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <p style={{ fontSize: '0.875rem', color: '#cbd5e1', marginBottom: '1rem' }}>
              Select target folder for <strong>{moveTargetItem.name}</strong>:
            </p>

            <select
              aria-label="Target folder"
              value={selectedTargetFolderId}
              onChange={(e) => setSelectedTargetFolderId(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                backgroundColor: '#0f172a',
                border: '1px solid #475569',
                borderRadius: '4px',
                color: '#f8fafc',
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
                  backgroundColor: '#334155',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#f8fafc',
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
                  backgroundColor: '#2563eb',
                  border: 'none',
                  borderRadius: '4px',
                  color: '#ffffff',
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
