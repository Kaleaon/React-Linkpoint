import React, { forwardRef, useImperativeHandle, useRef } from 'react';

export interface ViewportCanvasProps {
  /** Optional ID for the canvas element */
  id?: string;
  /** Name of the current 3D region / simulator */
  regionName?: string;
  /** Camera position [x, y, z] */
  position?: [number, number, number] | number[];
  /** Override full aria-label string */
  ariaLabel?: string;
  /** Callback when camera movement keys or pan buttons are activated */
  onCameraMove?: (forward: number, right: number, up: number) => void;
  /** Callback when zoom buttons or zoom keys are activated (+ for zoom in, - for zoom out) */
  onZoom?: (delta: number) => void;
  /** Callback to reset camera view */
  onResetView?: () => void;
  /** Callback when single-pointer pan buttons are activated (dx, dy) */
  onPan?: (dx: number, dy: number) => void;
  /** Optional keydown callback passed from parent */
  onKeyDown?: (event: React.KeyboardEvent<HTMLCanvasElement>) => void;
  /** Whether to render single-pointer overlay controls (default: true) */
  showOverlayControls?: boolean;
  /** Custom canvas style overrides */
  style?: React.CSSProperties;
  /** Custom class name for outer container */
  className?: string;
}

/**
 * Accessible 3D Viewport Canvas Component
 *
 * Complies with WCAG 2.2 Level A standards:
 * - 1.1.1 Non-text Content (Level A) & ARIA6: role="img", tabIndex={0}, dynamic aria-label, and fallback text.
 * - 2.1.1 Keyboard (Level A) & G90: Focusable canvas with onKeyDown handling Arrow, WASD, EQ, and +/- keys.
 * - 2.5.1 Pointer Gestures (Level A) & G215: Single-pointer viewport control overlay for zoom, pan, and reset.
 */
export const ViewportCanvas = forwardRef<HTMLCanvasElement, ViewportCanvasProps>((props, ref) => {
  const {
    id = 'world-canvas',
    regionName = '3D Scene',
    position = [0, 0, 0],
    ariaLabel,
    onCameraMove,
    onZoom,
    onResetView,
    onPan,
    onKeyDown,
    showOverlayControls = true,
    style,
    className,
  } = props;

  const internalCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useImperativeHandle(ref, () => internalCanvasRef.current as HTMLCanvasElement);

  const posStr = Array.isArray(position) ? position.map(Math.round).join(', ') : '0, 0, 0';

  const computedAriaLabel =
    ariaLabel ||
    `Interactive 3D viewport canvas for ${regionName}. Position: ${posStr}. Drag or use single-pointer controls to navigate. Arrow keys or WASD move camera, + and - keys zoom, Home key resets view.`;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLCanvasElement>) => {
    // Respect modifier keys and text input focus
    if (event.ctrlKey || event.metaKey || event.altKey) {
      onKeyDown?.(event);
      return;
    }

    const key = event.key;
    const code = event.code;

    let handled = false;

    switch (code) {
      case 'ArrowUp':
      case 'KeyW':
        onCameraMove?.(1, 0, 0);
        handled = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        onCameraMove?.(-1, 0, 0);
        handled = true;
        break;
      case 'ArrowLeft':
      case 'KeyA':
        onCameraMove?.(0, -1, 0);
        handled = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        onCameraMove?.(0, 1, 0);
        handled = true;
        break;
      case 'KeyE':
      case 'PageUp':
        onCameraMove?.(0, 0, 1);
        handled = true;
        break;
      case 'KeyQ':
      case 'PageDown':
        onCameraMove?.(0, 0, -1);
        handled = true;
        break;
      case 'Home':
        onResetView?.();
        handled = true;
        break;
      default:
        break;
    }

    if (!handled) {
      if (key === '+' || key === '=' || code === 'NumpadAdd') {
        onZoom?.(0.2);
        handled = true;
      } else if (key === '-' || key === '_' || code === 'NumpadSubtract') {
        onZoom?.(-0.2);
        handled = true;
      } else if (code === 'KeyR') {
        onResetView?.();
        handled = true;
      }
    }

    if (handled) {
      event.preventDefault();
    }

    onKeyDown?.(event);
  };

  const buttonStyle: React.CSSProperties = {
    minWidth: '44px',
    minHeight: '44px',
    width: '44px',
    height: '44px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: '1px solid rgba(255, 255, 255, 0.3)',
    borderRadius: '8px',
    background: 'rgba(0, 0, 0, 0.65)',
    color: '#ffffff',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
    userSelect: 'none',
    backdropFilter: 'blur(4px)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    touchAction: 'manipulation',
  };

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        ...style,
      }}
    >
      <canvas
        ref={internalCanvasRef}
        id={id}
        role="img"
        tabIndex={0}
        aria-label={computedAriaLabel}
        onKeyDown={handleKeyDown}
        style={{
          width: '100%',
          height: '100%',
          display: 'block',
          cursor: 'grab',
          touchAction: 'none',
        }}
      >
        <p>
          Interactive 3D viewport canvas displaying {regionName}. Camera position: {posStr}.
          Use the single-pointer control buttons or keyboard shortcuts (Arrow keys or WASD to move, + and - to zoom, Home to reset) to navigate the 3D scene.
        </p>
      </canvas>

      {showOverlayControls && (
        <aside
          aria-label="Single-pointer camera controls"
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            zIndex: 10,
            pointerEvents: 'auto',
          }}
        >
          {/* Zoom controls */}
          <div
            aria-label="Zoom controls"
            role="group"
            style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            <button
              type="button"
              aria-label="Zoom in"
              title="Zoom in (+)"
              onClick={() => onZoom?.(0.2)}
              style={buttonStyle}
            >
              +
            </button>
            <button
              type="button"
              aria-label="Zoom out"
              title="Zoom out (-)"
              onClick={() => onZoom?.(-0.2)}
              style={buttonStyle}
            >
              −
            </button>
          </div>

          {/* Pan / Directional Movement controls */}
          <div
            aria-label="Pan camera controls"
            role="group"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 44px)',
              gridTemplateRows: 'repeat(3, 44px)',
              gap: 4,
            }}
          >
            <span />
            <button
              type="button"
              aria-label="Pan camera up"
              title="Pan camera up"
              onClick={() => {
                if (onPan) onPan(0, 1);
                else onCameraMove?.(1, 0, 0);
              }}
              style={buttonStyle}
            >
              ▲
            </button>
            <span />

            <button
              type="button"
              aria-label="Pan camera left"
              title="Pan camera left"
              onClick={() => {
                if (onPan) onPan(-1, 0);
                else onCameraMove?.(0, -1, 0);
              }}
              style={buttonStyle}
            >
              ◄
            </button>
            <button
              type="button"
              aria-label="Reset camera view"
              title="Reset view (Home)"
              onClick={() => onResetView?.()}
              style={{ ...buttonStyle, fontSize: '11px', fontWeight: 600 }}
            >
              RESET
            </button>
            <button
              type="button"
              aria-label="Pan camera right"
              title="Pan camera right"
              onClick={() => {
                if (onPan) onPan(1, 0);
                else onCameraMove?.(0, 1, 0);
              }}
              style={buttonStyle}
            >
              ►
            </button>

            <span />
            <button
              type="button"
              aria-label="Pan camera down"
              title="Pan camera down"
              onClick={() => {
                if (onPan) onPan(0, -1);
                else onCameraMove?.(-1, 0, 0);
              }}
              style={buttonStyle}
            >
              ▼
            </button>
            <span />
          </div>
        </aside>
      )}
    </div>
  );
});

ViewportCanvas.displayName = 'ViewportCanvas';

export default ViewportCanvas;
