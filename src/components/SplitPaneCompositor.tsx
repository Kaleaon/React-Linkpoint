import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTheme } from '../context/ThemeContext.jsx';
import { app } from '../linkpoint/app';
import Icon from './Icon.jsx';
import ObjectInspector from './ObjectInspector';
import DiagnosticsPanel from '../screens/DiagnosticsPanel.jsx';
import AccessibleChatLog from './AccessibleChatLog.jsx';

export type PaneViewType = 'Viewport' | 'Inspector' | 'Diagnostics' | 'Chat';
export type WorkstationPreset = 'single' | 'dual' | 'inspector_stack' | 'terminal_split' | 'quad';

export interface SplitPaneLeafNode {
  type: 'leaf';
  id: string;
  view: PaneViewType;
}

export interface SplitPaneParentNode {
  type: 'parent';
  id: string;
  direction: 'horizontal' | 'vertical'; // 'horizontal' = split left/right, 'vertical' = split top/bottom
  splitRatio: number; // range 0.1 - 0.9
  children: [SplitPaneNode, SplitPaneNode];
}

export type SplitPaneNode = SplitPaneLeafNode | SplitPaneParentNode;

const LOCAL_STORAGE_TREE_KEY = 'linkpoint_split_pane_tree';
const LOCAL_STORAGE_PRESET_KEY = 'linkpoint_split_pane_preset';

let idCounter = 1;
function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${idCounter++}`;
}

export function createSinglePreset(): SplitPaneNode {
  return {
    type: 'leaf',
    id: genId('pane-viewport'),
    view: 'Viewport',
  };
}

export function createDualPreset(): SplitPaneNode {
  return {
    type: 'parent',
    id: genId('split-root'),
    direction: 'horizontal',
    splitRatio: 0.5,
    children: [
      { type: 'leaf', id: genId('pane-viewport'), view: 'Viewport' },
      { type: 'leaf', id: genId('pane-inspector'), view: 'Inspector' },
    ],
  };
}

export function createInspectorStackPreset(): SplitPaneNode {
  return {
    type: 'parent',
    id: genId('split-root'),
    direction: 'horizontal',
    splitRatio: 0.65,
    children: [
      { type: 'leaf', id: genId('pane-viewport'), view: 'Viewport' },
      {
        type: 'parent',
        id: genId('split-right-stack'),
        direction: 'vertical',
        splitRatio: 0.5,
        children: [
          { type: 'leaf', id: genId('pane-inspector'), view: 'Inspector' },
          { type: 'leaf', id: genId('pane-diagnostics'), view: 'Diagnostics' },
        ],
      },
    ],
  };
}

export function createTerminalSplitPreset(): SplitPaneNode {
  return {
    type: 'parent',
    id: genId('split-root'),
    direction: 'vertical',
    splitRatio: 0.65,
    children: [
      { type: 'leaf', id: genId('pane-viewport'), view: 'Viewport' },
      { type: 'leaf', id: genId('pane-diagnostics'), view: 'Diagnostics' },
    ],
  };
}

export function createQuadPreset(): SplitPaneNode {
  return {
    type: 'parent',
    id: genId('split-root'),
    direction: 'horizontal',
    splitRatio: 0.5,
    children: [
      {
        type: 'parent',
        id: genId('split-left'),
        direction: 'vertical',
        splitRatio: 0.5,
        children: [
          { type: 'leaf', id: genId('pane-viewport'), view: 'Viewport' },
          { type: 'leaf', id: genId('pane-chat'), view: 'Chat' },
        ],
      },
      {
        type: 'parent',
        id: genId('split-right'),
        direction: 'vertical',
        splitRatio: 0.5,
        children: [
          { type: 'leaf', id: genId('pane-inspector'), view: 'Inspector' },
          { type: 'leaf', id: genId('pane-diagnostics'), view: 'Diagnostics' },
        ],
      },
    ],
  };
}

export function getNodeDepth(node: SplitPaneNode, targetId?: string, currentDepth = 1): number {
  if (!targetId) {
    if (node.type === 'leaf') return currentDepth;
    return Math.max(
      getNodeDepth(node.children[0], undefined, currentDepth + 1),
      getNodeDepth(node.children[1], undefined, currentDepth + 1),
    );
  }

  if (node.id === targetId) return currentDepth;
  if (node.type === 'parent') {
    const d1 = getNodeDepth(node.children[0], targetId, currentDepth + 1);
    if (d1 > 0) return d1;
    const d2 = getNodeDepth(node.children[1], targetId, currentDepth + 1);
    if (d2 > 0) return d2;
  }
  return 0;
}

export function splitLeafInTree(
  node: SplitPaneNode,
  targetId: string,
  direction: 'horizontal' | 'vertical',
  currentDepth = 1,
): SplitPaneNode {
  if (node.type === 'leaf') {
    if (node.id === targetId) {
      if (currentDepth >= 3) {
        return node;
      }
      const existingView = node.view;
      const nextView: PaneViewType =
        existingView === 'Viewport'
          ? 'Inspector'
          : existingView === 'Inspector'
            ? 'Diagnostics'
            : 'Viewport';

      return {
        type: 'parent',
        id: genId('split-parent'),
        direction,
        splitRatio: 0.5,
        children: [
          { type: 'leaf', id: node.id, view: existingView },
          { type: 'leaf', id: genId('pane-child'), view: nextView },
        ],
      };
    }
    return node;
  }

  return {
    ...node,
    children: [
      splitLeafInTree(node.children[0], targetId, direction, currentDepth + 1),
      splitLeafInTree(node.children[1], targetId, direction, currentDepth + 1),
    ],
  };
}

export function closeLeafInTree(node: SplitPaneNode, targetId: string): SplitPaneNode | null {
  if (node.type === 'leaf') {
    return node.id === targetId ? null : node;
  }

  const child0 = closeLeafInTree(node.children[0], targetId);
  const child1 = closeLeafInTree(node.children[1], targetId);

  if (child0 === null && child1 === null) return null;
  if (child0 === null) return child1;
  if (child1 === null) return child0;

  return {
    ...node,
    children: [child0, child1],
  };
}

export function updateLeafViewInTree(
  node: SplitPaneNode,
  targetId: string,
  view: PaneViewType,
): SplitPaneNode {
  if (node.type === 'leaf') {
    return node.id === targetId ? { ...node, view } : node;
  }
  return {
    ...node,
    children: [
      updateLeafViewInTree(node.children[0], targetId, view),
      updateLeafViewInTree(node.children[1], targetId, view),
    ],
  };
}

export function updateSplitRatioInTree(
  node: SplitPaneNode,
  parentId: string,
  splitRatio: number,
): SplitPaneNode {
  const clampedRatio = Math.max(0.1, Math.min(0.9, splitRatio));
  if (node.type === 'parent') {
    if (node.id === parentId) {
      return { ...node, splitRatio: clampedRatio };
    }
    return {
      ...node,
      children: [
        updateSplitRatioInTree(node.children[0], parentId, clampedRatio),
        updateSplitRatioInTree(node.children[1], parentId, clampedRatio),
      ],
    };
  }
  return node;
}

export interface SplitPaneCompositorProps {
  renderViewport?: (paneId: string) => React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
  initialPreset?: WorkstationPreset;
}

export const SplitPaneCompositor: React.FC<SplitPaneCompositorProps> = ({
  renderViewport,
  style,
  className,
  initialPreset = 'single',
}) => {
  const { V, t } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [activePreset, setActivePreset] = useState<WorkstationPreset>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_PRESET_KEY);
      if (
        saved &&
        ['single', 'dual', 'inspector_stack', 'terminal_split', 'quad'].includes(saved)
      ) {
        return saved as WorkstationPreset;
      }
    } catch {}
    return initialPreset;
  });

  const [tree, setTree] = useState<SplitPaneNode>(() => {
    try {
      const savedTree = localStorage.getItem(LOCAL_STORAGE_TREE_KEY);
      if (savedTree) {
        const parsed = JSON.parse(savedTree);
        if (parsed && (parsed.type === 'leaf' || parsed.type === 'parent')) {
          return parsed;
        }
      }
    } catch {}
    return getPresetTree(initialPreset);
  });

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1024,
  );
  const [activeMobileView, setActiveMobileView] = useState<PaneViewType>('Viewport');
  const [chatInputText, setChatInputText] = useState('');
  const [chatMessages, setChatMessages] = useState<any[]>(() => app.chat?.messages || []);

  const draggingRef = useRef<{
    parentId: string;
    direction: 'horizontal' | 'vertical';
    containerRect: DOMRect;
  } | null>(null);

  const rafIdRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_TREE_KEY, JSON.stringify(tree));
      localStorage.setItem(LOCAL_STORAGE_PRESET_KEY, activePreset);
    } catch {}
  }, [tree, activePreset]);

  useEffect(() => {
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const updateChat = () => setChatMessages([...(app.chat?.messages || [])]);
    app.chat?.on('message_received', updateChat);
    app.chat?.on('message_sent', updateChat);
    return () => {
      app.chat?.off('message_received', updateChat);
      app.chat?.off('message_sent', updateChat);
    };
  }, []);

  const saveTreeState = useCallback((newTree: SplitPaneNode, presetName?: WorkstationPreset) => {
    setTree(newTree);
    if (presetName) {
      setActivePreset(presetName);
      try {
        localStorage.setItem(LOCAL_STORAGE_PRESET_KEY, presetName);
      } catch {}
    }
    try {
      localStorage.setItem(LOCAL_STORAGE_TREE_KEY, JSON.stringify(newTree));
    } catch {}

    window.dispatchEvent(new Event('resize'));
  }, []);

  function getPresetTree(preset: WorkstationPreset): SplitPaneNode {
    switch (preset) {
      case 'dual':
        return createDualPreset();
      case 'inspector_stack':
        return createInspectorStackPreset();
      case 'terminal_split':
        return createTerminalSplitPreset();
      case 'quad':
        return createQuadPreset();
      case 'single':
      default:
        return createSinglePreset();
    }
  }

  const handleSelectPreset = (preset: WorkstationPreset) => {
    const newTree = getPresetTree(preset);
    saveTreeState(newTree, preset);
  };

  const handleSplitLeaf = (targetId: string, direction: 'horizontal' | 'vertical') => {
    const depth = getNodeDepth(tree, targetId);
    if (depth >= 3) {
      return;
    }
    const nextTree = splitLeafInTree(tree, targetId, direction);
    saveTreeState(nextTree);
  };

  const handleCloseLeaf = (targetId: string) => {
    const nextTree = closeLeafInTree(tree, targetId);
    if (nextTree) {
      saveTreeState(nextTree);
    }
  };

  const handleChangeView = (targetId: string, view: PaneViewType) => {
    const nextTree = updateLeafViewInTree(tree, targetId, view);
    saveTreeState(nextTree);
  };

  const handleSendChat = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const text = chatInputText.trim();
    if (!text) return;
    try {
      if (app.auth.isLoggedIn()) {
        await app.chat.sendMessage(text, 0, 1);
      } else {
        app.notifications?.handleNotification({ title: 'Spatial Chat', message: text });
      }
    } catch (err) {
      console.warn('Chat error:', err);
    }
    setChatInputText('');
  };

  const handleStartDrag = (
    e: React.MouseEvent | React.TouchEvent,
    parentId: string,
    direction: 'horizontal' | 'vertical',
    containerElement: HTMLElement,
  ) => {
    e.preventDefault();
    const rect = containerElement.getBoundingClientRect();
    draggingRef.current = {
      parentId,
      direction,
      containerRect: rect,
    };

    const handlePointerMove = (moveEvt: MouseEvent | TouchEvent) => {
      if (!draggingRef.current) return;
      const clientX = 'touches' in moveEvt ? moveEvt.touches[0].clientX : moveEvt.clientX;
      const clientY = 'touches' in moveEvt ? moveEvt.touches[0].clientY : moveEvt.clientY;

      const { parentId, direction, containerRect } = draggingRef.current;

      let ratio = 0.5;
      if (direction === 'horizontal') {
        ratio = (clientX - containerRect.left) / containerRect.width;
      } else {
        ratio = (clientY - containerRect.top) / containerRect.height;
      }

      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      rafIdRef.current = requestAnimationFrame(() => {
        setTree((currentTree) => {
          const updated = updateSplitRatioInTree(currentTree, parentId, ratio);
          try {
            localStorage.setItem(LOCAL_STORAGE_TREE_KEY, JSON.stringify(updated));
          } catch {}
          return updated;
        });

        window.dispatchEvent(new Event('resize'));
      });
    };

    const handlePointerUp = () => {
      draggingRef.current = null;
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);

      window.dispatchEvent(new Event('resize'));
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove);
    window.addEventListener('touchend', handlePointerUp);
  };

  const renderToolSurface = (view: PaneViewType, leafId: string): React.ReactNode => {
    switch (view) {
      case 'Viewport':
        return renderViewport ? renderViewport(leafId) : null;
      case 'Inspector':
        return <ObjectInspector style={{ height: '100%', width: '100%' }} />;
      case 'Diagnostics':
        return (
          <div
            style={{
              height: '100%',
              width: '100%',
              overflowY: 'auto',
              background: V.surf,
              padding: '8px',
            }}
          >
            <DiagnosticsPanel />
          </div>
        );
      case 'Chat':
        return (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              background: V.surf,
            }}
          >
            <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
              <AccessibleChatLog messages={chatMessages} variant="embedded" />
            </div>
            <form
              onSubmit={handleSendChat}
              style={{
                display: 'flex',
                gap: '6px',
                padding: '8px',
                borderTop: `1px solid ${V.outv}`,
                background: V.bg,
              }}
            >
              <input
                type="text"
                value={chatInputText}
                onChange={(e) => setChatInputText(e.target.value)}
                placeholder="Send nearby spatial chat..."
                style={{
                  flex: 1,
                  height: '30px',
                  padding: '0 8px',
                  background: V.surf,
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  fontSize: '11px',
                  fontFamily: t.font,
                }}
              />
              <button
                type="submit"
                style={{
                  height: '30px',
                  padding: '0 12px',
                  background: V.pri,
                  color: V.onpri,
                  border: 0,
                  borderRadius: V.rs,
                  fontWeight: 700,
                  fontSize: '10px',
                  cursor: 'pointer',
                }}
              >
                SAY
              </button>
            </form>
          </div>
        );
      default:
        return null;
    }
  };

  const renderTreeNode = (node: SplitPaneNode, currentDepth = 1): React.ReactNode => {
    if (node.type === 'leaf') {
      const isSingleLeaf = tree.type === 'leaf';
      const depthReached = currentDepth >= 3;

      return (
        <div
          key={node.id}
          className="split-pane-leaf"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            minHeight: 0,
            height: '100%',
            width: '100%',
            position: 'relative',
            background: V.bg,
            border: `1px solid ${V.outv}`,
            boxSizing: 'border-box',
          }}
        >
          {/* Tile Header Bar */}
          <div
            style={{
              height: '28px',
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 8px',
              background: V.surf2 || V.surf,
              borderBottom: `1px solid ${V.outv}`,
              fontSize: '10px',
              fontWeight: 700,
              userSelect: 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Icon
                name={
                  node.view === 'Viewport'
                    ? 'eye'
                    : node.view === 'Inspector'
                      ? 'box'
                      : node.view === 'Diagnostics'
                        ? 'activity'
                        : 'message-square'
                }
                size={12}
                color={V.pri}
              />
              <select
                value={node.view}
                onChange={(e) => handleChangeView(node.id, e.target.value as PaneViewType)}
                aria-label={`Tile tool view selector for pane ${node.id}`}
                style={{
                  background: 'transparent',
                  color: V.ink,
                  border: `1px solid ${V.outv}`,
                  borderRadius: V.rs,
                  fontSize: '10px',
                  fontWeight: 700,
                  padding: '2px 4px',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="Viewport">3D Viewport</option>
                <option value="Inspector">Object Inspector</option>
                <option value="Diagnostics">Diagnostics</option>
                <option value="Chat">Spatial Chat</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {!depthReached && (
                <>
                  <button
                    type="button"
                    onClick={() => handleSplitLeaf(node.id, 'horizontal')}
                    aria-label="Split panel horizontally"
                    title="Split Horizontally (Side-by-side)"
                    style={{
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      color: V.ink,
                      borderRadius: V.rs,
                      padding: '2px 6px',
                      fontSize: '9px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    SPLIT H
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSplitLeaf(node.id, 'vertical')}
                    aria-label="Split panel vertically"
                    title="Split Vertically (Stacked)"
                    style={{
                      background: V.surf,
                      border: `1px solid ${V.outv}`,
                      color: V.ink,
                      borderRadius: V.rs,
                      padding: '2px 6px',
                      fontSize: '9px',
                      cursor: 'pointer',
                      fontWeight: 600,
                    }}
                  >
                    SPLIT V
                  </button>
                </>
              )}

              {!isSingleLeaf && (
                <button
                  type="button"
                  onClick={() => handleCloseLeaf(node.id)}
                  aria-label="Close pane"
                  title="Close Pane"
                  style={{
                    background: 'transparent',
                    border: 0,
                    color: V.ink2,
                    cursor: 'pointer',
                    fontSize: '12px',
                    padding: '0 4px',
                    fontWeight: 700,
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Tile Surface Area */}
          <div
            style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden' }}
          >
            {renderToolSurface(node.view, node.id)}
          </div>
        </div>
      );
    }

    // Parent Node
    const isHoriz = node.direction === 'horizontal';
    const splitRatio = node.splitRatio ?? 0.5;
    const pct1 = `${splitRatio * 100}%`;
    const pct2 = `${(1 - splitRatio) * 100}%`;

    return (
      <div
        key={node.id}
        data-parent-id={node.id}
        style={{
          display: 'flex',
          flexDirection: isHoriz ? 'row' : 'column',
          width: '100%',
          height: '100%',
          position: 'relative',
          overflow: 'hidden',
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <div
          style={{
            flex: `0 0 ${pct1}`,
            minWidth: isHoriz ? '10%' : 0,
            minHeight: isHoriz ? 0 : '10%',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {renderTreeNode(node.children[0], currentDepth + 1)}
        </div>

        {/* Splitter Divider Handle */}
        <div
          role="separator"
          tabIndex={0}
          aria-valuenow={Math.round(splitRatio * 100)}
          aria-valuemin={10}
          aria-valuemax={90}
          aria-label={`Pane divider for ${node.direction} split`}
          onMouseDown={(e) =>
            handleStartDrag(e, node.id, node.direction, e.currentTarget.parentElement!)
          }
          onTouchStart={(e) =>
            handleStartDrag(e, node.id, node.direction, e.currentTarget.parentElement!)
          }
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
              e.preventDefault();
              saveTreeState(updateSplitRatioInTree(tree, node.id, splitRatio - 0.05));
            } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
              e.preventDefault();
              saveTreeState(updateSplitRatioInTree(tree, node.id, splitRatio + 0.05));
            }
          }}
          style={{
            flex: '0 0 6px',
            background: V.outv || 'rgba(255, 255, 255, 0.15)',
            cursor: isHoriz ? 'col-resize' : 'row-resize',
            zIndex: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          <div
            style={{
              width: isHoriz ? '2px' : '16px',
              height: isHoriz ? '16px' : '2px',
              background: V.pri,
              borderRadius: '1px',
            }}
          />
        </div>

        <div
          style={{
            flex: `0 0 ${pct2}`,
            minWidth: isHoriz ? '10%' : 0,
            minHeight: isHoriz ? 0 : '10%',
            overflow: 'hidden',
            display: 'flex',
          }}
        >
          {renderTreeNode(node.children[1], currentDepth + 1)}
        </div>
      </div>
    );
  };

  const isNonDesktop = viewportWidth < 768;

  const containerStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    height: '100%',
    position: 'relative',
    overflow: 'hidden',
    background: V.bg,
    color: V.ink,
    fontFamily: t.font,
    ...style,
  };

  return (
    <div ref={containerRef} className={className} style={containerStyle}>
      {/* Workstation Preset Toolbar */}
      <div
        role="toolbar"
        aria-label="Workstation Viewport Layout Presets"
        style={{
          height: '34px',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 10px',
          background: V.surf,
          borderBottom: `1px solid ${V.outv}`,
          gap: '8px',
          overflowX: 'auto',
          zIndex: 20,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Icon name="grid" size={14} color={V.pri} />
          <span
            style={{ fontSize: '11px', fontWeight: 700, color: V.pri, letterSpacing: '0.05em' }}
          >
            WORKSTATION LAYOUT
          </span>
        </div>

        {!isNonDesktop ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {(
              [
                ['single', 'Single Viewport', 'square'],
                ['dual', 'Dual / Split', 'columns'],
                ['inspector_stack', 'Inspector Stack', 'sidebar'],
                ['terminal_split', 'Terminal Split', 'rows'],
                ['quad', 'Quad Viewport', 'grid'],
              ] as const
            ).map(([presetKey, label, iconName]) => {
              const isActive = activePreset === presetKey;
              return (
                <button
                  key={presetKey}
                  type="button"
                  onClick={() => handleSelectPreset(presetKey)}
                  aria-pressed={isActive}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    height: '24px',
                    padding: '0 8px',
                    background: isActive ? V.pri : V.surf2 || 'transparent',
                    color: isActive ? V.onpri : V.ink2,
                    border: `1px solid ${isActive ? V.pri : V.outv}`,
                    borderRadius: V.rs,
                    fontSize: '10px',
                    fontWeight: 700,
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <Icon name={iconName} size={11} />
                  <span>{label}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ fontSize: '10px', color: V.ink2, fontWeight: 600 }}>
            MOBILE STACKED FALLBACK
          </div>
        )}
      </div>

      {/* Main Split Body or Responsive Mobile Fallback */}
      <div style={{ flex: 1, minHeight: 0, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
        {isNonDesktop ? (
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
            {/* Mobile Tab Switcher */}
            <div
              style={{
                display: 'flex',
                background: V.surf,
                borderBottom: `1px solid ${V.outv}`,
                padding: '4px',
                gap: '4px',
              }}
            >
              {(['Viewport', 'Inspector', 'Diagnostics', 'Chat'] as PaneViewType[]).map((vt) => {
                const isActive = activeMobileView === vt;
                return (
                  <button
                    key={vt}
                    type="button"
                    onClick={() => setActiveMobileView(vt)}
                    style={{
                      flex: 1,
                      padding: '6px 4px',
                      fontSize: '10px',
                      fontWeight: 700,
                      background: isActive ? V.pri : 'transparent',
                      color: isActive ? V.onpri : V.ink2,
                      border: 0,
                      borderRadius: V.rs,
                      cursor: 'pointer',
                    }}
                  >
                    {vt}
                  </button>
                );
              })}
            </div>
            <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
              {renderToolSurface(activeMobileView, 'mobile-pane')}
            </div>
          </div>
        ) : (
          renderTreeNode(tree)
        )}
      </div>
    </div>
  );
};

export default SplitPaneCompositor;
