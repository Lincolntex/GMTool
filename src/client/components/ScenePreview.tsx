import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { Minus, Plus } from '@phosphor-icons/react';
import {
  cellAtPoint,
  cellCenter,
  gridGeometry,
  tokenDiameterPercent,
} from '../../shared/grid';
import type { CampaignScene, TokenCell } from '../../shared/types';
import {
  MAX_SCENE_SCALE,
  MIN_SCENE_SCALE,
  SCENE_KEY_ZOOM_FACTOR,
  SCENE_WHEEL_SENSITIVITY,
  clampSceneCamera,
  createDefaultCamera,
  panSceneCamera,
  zoomSceneCamera,
  type SceneCamera,
} from '../lib/sceneCamera';
import { tokenInitials, tokenShapeForToken } from '../lib/tokens';
import { GridOverlay } from './GridOverlay';
import { TokenGlyph } from './ShapeIcon';

interface ScenePreviewProps {
  scene: CampaignScene;
  expanded?: boolean;
  onAspectChange?: (aspect: number) => void;
  placingTokenId?: string | null;
  onStartPlacement?: (tokenId: string) => void;
  onPlaceToken?: (tokenId: string, col: number, row: number) => void;
  onCancelPlacement?: () => void;
}

interface PanState {
  pointerId: number;
  startX: number;
  startY: number;
  startCamera: SceneCamera;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function ScenePreview({
  scene,
  expanded = false,
  onAspectChange,
  placingTokenId = null,
  onStartPlacement,
  onPlaceToken,
  onCancelPlacement,
}: ScenePreviewProps) {
  const [aspect, setAspect] = useState(16 / 9);
  const [hoverCell, setHoverCell] = useState<TokenCell | null>(null);
  const [camera, setCamera] = useState<SceneCamera>(createDefaultCamera);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [zoomAnnouncement, setZoomAnnouncement] = useState('');
  const frameRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const cameraRef = useRef<SceneCamera>(createDefaultCamera());
  const panRef = useRef<PanState | null>(null);
  const spaceHeldRef = useRef(false);
  const panEndedAtRef = useRef(0);
  const announceTimerRef = useRef<number | null>(null);
  const aspectCallback = useRef(onAspectChange);
  const background = scene.background;
  const backgroundKey = background.type === 'upload' ? background.url : background.preset;
  const geometry = gridGeometry(scene.grid, aspect);
  const selectedToken = placingTokenId
    ? scene.tokens.find((token) => token.id === placingTokenId) ?? null
    : null;

  useEffect(() => {
    aspectCallback.current = onAspectChange;
  }, [onAspectChange]);

  function applyAspect(next: number): void {
    setAspect(next);
    aspectCallback.current?.(next);
  }

  useEffect(() => {
    applyAspect(16 / 9);
    // Reset when a different scene or background is shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey, scene.id]);

  useLayoutEffect(() => {
    resetCamera();
    // Reset the camera when the scene or background changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backgroundKey, scene.id]);

  useLayoutEffect(() => {
    resetCamera();
    // Reset when the aspect changes, such as after an uploaded image loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function updateSize(): void {
      clampCamera();
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function releaseSpace(): void {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    }

    function handleWindowKeyUp(event: KeyboardEvent): void {
      if (event.code === 'Space') releaseSpace();
    }

    function handleWindowBlur(): void {
      releaseSpace();
      if (panRef.current) finishPan();
    }

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keyup', handleWindowKeyUp);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keyup', handleWindowKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function handleWheel(event: WheelEvent): void {
      if (!event.shiftKey) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (panRef.current) return;

      event.preventDefault();
      const raw =
        Math.abs(event.deltaY) >= Math.abs(event.deltaX)
          ? event.deltaY
          : event.deltaX;
      const pixels =
        event.deltaMode === 1
          ? raw * 16
          : event.deltaMode === 2
            ? raw * viewportElement.clientHeight
            : raw;
      const factor = Math.min(
        1.18,
        Math.max(0.85, Math.exp(-pixels * SCENE_WHEEL_SENSITIVITY)),
      );

      zoomAt(cameraRef.current.scale * factor, event.clientX, event.clientY);
    }

    viewportElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewportElement.removeEventListener('wheel', handleWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setHoverCell(null);
  }, [placingTokenId, scene.id]);

  useEffect(() => {
    if (!placingTokenId) return;

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelPlacement?.();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placingTokenId, onCancelPlacement]);

  function commitCamera(next: SceneCamera): void {
    const current = cameraRef.current;
    if (
      next.scale === current.scale &&
      next.x === current.x &&
      next.y === current.y
    ) {
      return;
    }
    cameraRef.current = next;
    setCamera(next);
  }

  function getFrameBaseSize(): { width: number; height: number } {
    const frame = frameRef.current;
    return frame
      ? { width: frame.offsetWidth, height: frame.offsetHeight }
      : { width: 0, height: 0 };
  }

  function announceZoom(scale: number): void {
    if (announceTimerRef.current !== null) {
      window.clearTimeout(announceTimerRef.current);
    }
    announceTimerRef.current = window.setTimeout(() => {
      setZoomAnnouncement(`${Math.round(scale * 100)}% zoom`);
      announceTimerRef.current = null;
    }, 300);
  }

  function zoomAt(scale: number, clientX?: number, clientY?: number): void {
    const viewport = viewportRef.current;
    if (!viewport || panRef.current) return;

    const base = getFrameBaseSize();
    const rect = viewport.getBoundingClientRect();
    const anchorX = clientX ?? rect.left + rect.width / 2;
    const anchorY = clientY ?? rect.top + rect.height / 2;
    const next = zoomSceneCamera(
      cameraRef.current,
      scale,
      { x: anchorX, y: anchorY },
      {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      },
      base.width,
      base.height,
    );

    if (next === cameraRef.current) return;
    setHoverCell(null);
    commitCamera(next);
    announceZoom(next.scale);
  }

  function resetCamera(): void {
    const next = createDefaultCamera();
    const current = cameraRef.current;
    if (
      current.scale === next.scale &&
      current.x === next.x &&
      current.y === next.y
    ) {
      return;
    }
    setHoverCell(null);
    commitCamera(next);
    announceZoom(next.scale);
  }

  function clampCamera(): void {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const base = getFrameBaseSize();
    if (base.width <= 0 || base.height <= 0) return;

    commitCamera(
      clampSceneCamera(
        cameraRef.current,
        base.width,
        base.height,
        viewport.clientWidth,
        viewport.clientHeight,
      ),
    );
  }

  function panCameraBy(deltaX: number, deltaY: number): void {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const base = getFrameBaseSize();
    commitCamera(
      panSceneCamera(
        cameraRef.current,
        deltaX,
        deltaY,
        base.width,
        base.height,
        viewport.clientWidth,
        viewport.clientHeight,
      ),
    );
  }

  function releaseSpace(): void {
    if (!spaceHeldRef.current) return;
    spaceHeldRef.current = false;
    setSpaceHeld(false);
  }

  function handleViewportPointerDownCapture(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    viewportRef.current?.focus({ preventScroll: true });
  }

  function handleViewportPointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (event.shiftKey) return;

    const middleButton = event.button === 1;
    const spaceLeftButton = event.button === 0 && spaceHeldRef.current;
    if (!middleButton && !spaceLeftButton) return;
    if (middleButton) event.preventDefault();
    if (cameraRef.current.scale <= MIN_SCENE_SCALE) return;

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browsers may not have an active pointer to capture.
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCamera: cameraRef.current,
    };
    setPanning(true);
    setHoverCell(null);
  }

  function finishPan(event?: ReactPointerEvent<HTMLDivElement>): void {
    const pan = panRef.current;
    if (!pan) return;

    panRef.current = null;
    setPanning(false);
    panEndedAtRef.current = performance.now();

    try {
      if (event?.currentTarget.hasPointerCapture(pan.pointerId)) {
        event.currentTarget.releasePointerCapture(pan.pointerId);
      }
    } catch {
      // The browser may have already released capture.
    }
  }

  function handleViewportPointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;

    const viewport = viewportRef.current;
    if (!viewport) return;

    event.preventDefault();
    const base = getFrameBaseSize();
    commitCamera(
      panSceneCamera(
        pan.startCamera,
        event.clientX - pan.startX,
        event.clientY - pan.startY,
        base.width,
        base.height,
        viewport.clientWidth,
        viewport.clientHeight,
      ),
    );
  }

  function handleViewportPointerUp(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    finishPan(event);
  }

  function handleViewportKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ): void {
    const target = event.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    const zoomIn =
      event.shiftKey &&
      (event.key === '+' ||
        event.key === '=' ||
        event.code === 'Equal' ||
        event.code === 'NumpadAdd');
    if (zoomIn) {
      event.preventDefault();
      zoomAt(cameraRef.current.scale * SCENE_KEY_ZOOM_FACTOR);
      return;
    }

    const zoomOut =
      event.shiftKey &&
      (event.key === '-' ||
        event.key === '_' ||
        event.code === 'Minus' ||
        event.code === 'NumpadSubtract');
    if (zoomOut) {
      event.preventDefault();
      zoomAt(cameraRef.current.scale / SCENE_KEY_ZOOM_FACTOR);
      return;
    }

    const reset =
      event.shiftKey &&
      (event.key === '0' ||
        event.key === ')' ||
        event.code === 'Digit0' ||
        event.code === 'Numpad0');
    if (reset) {
      event.preventDefault();
      resetCamera();
      return;
    }

    if (event.code === 'Space') {
      if (target?.closest('button')) return;
      event.preventDefault();
      spaceHeldRef.current = true;
      setSpaceHeld(true);
      return;
    }

    if (
      event.key === 'ArrowUp' ||
      event.key === 'ArrowDown' ||
      event.key === 'ArrowLeft' ||
      event.key === 'ArrowRight'
    ) {
      event.preventDefault();
      if (cameraRef.current.scale <= MIN_SCENE_SCALE) return;

      const viewport = viewportRef.current;
      const step = viewport
        ? Math.max(
            32,
            Math.min(viewport.clientWidth, viewport.clientHeight) * 0.08,
          )
        : 40;
      const deltaX =
        event.key === 'ArrowLeft'
          ? step
          : event.key === 'ArrowRight'
            ? -step
            : 0;
      const deltaY =
        event.key === 'ArrowUp'
          ? step
          : event.key === 'ArrowDown'
            ? -step
            : 0;
      panCameraBy(deltaX, deltaY);
    }
  }

  function handleViewportKeyUp(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.code !== 'Space') return;
    releaseSpace();
  }

  function handleViewportBlur(): void {
    releaseSpace();
  }

  function readPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const frame = frameRef.current;
    if (!frame) return null;
    const bounds = frame.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp((clientX - bounds.left) / bounds.width),
      y: clamp((clientY - bounds.top) / bounds.height),
    };
  }

  function tokenAt(cell: TokenCell, ignoreId?: string): boolean {
    return scene.tokens.some(
      (token) =>
        token.id !== ignoreId &&
        token.cell?.col === cell.col &&
        token.cell?.row === cell.row,
    );
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (panRef.current) return;
    if (!placingTokenId || !geometry) return;
    const point = readPoint(event.clientX, event.clientY);
    setHoverCell(point ? cellAtPoint(geometry, point.x, point.y) : null);
  }

  function handleFrameClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (performance.now() - panEndedAtRef.current < 200) return;
    if (spaceHeldRef.current || event.shiftKey) return;
    if (!placingTokenId || !geometry || !onPlaceToken) return;
    const point = readPoint(event.clientX, event.clientY);
    if (!point) return;
    const cell = cellAtPoint(geometry, point.x, point.y);
    if (!cell || tokenAt(cell, placingTokenId)) return;
    onPlaceToken(placingTokenId, cell.col, cell.row);
  }

  function handleTokenClick(event: ReactMouseEvent, tokenId: string): void {
    event.stopPropagation();
    if (performance.now() - panEndedAtRef.current < 200) return;
    if (spaceHeldRef.current || event.shiftKey) return;
    if (!onStartPlacement) return;
    if (placingTokenId === tokenId) {
      onCancelPlacement?.();
      return;
    }
    onStartPlacement(tokenId);
  }

  const maxHeight = expanded ? 720 : 520;
  const ghostOccupied =
    selectedToken && hoverCell ? tokenAt(hoverCell, selectedToken.id) : false;
  const frameStyle = {
    '--scene-zoom': camera.scale,
    '--scene-pan-x': `${camera.x}px`,
    '--scene-pan-y': `${camera.y}px`,
  } as CSSProperties;
  const zoomPercent = Math.round(camera.scale * 100);
  const viewportClassName = [
    'scene-preview-viewport',
    camera.scale > MIN_SCENE_SCALE ? 'is-zoomed' : '',
    panning ? 'is-panning' : '',
    spaceHeld && camera.scale > MIN_SCENE_SCALE ? 'is-space-held' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="scene-preview-panel">
      <div
        ref={viewportRef}
        className={viewportClassName}
        style={{
          width: `min(100%, calc(${maxHeight}px * ${aspect}))`,
          aspectRatio: String(aspect),
        }}
        tabIndex={0}
        aria-label={`${scene.title} preview viewport`}
        aria-describedby="scene-preview-zoom-help"
        onKeyDown={handleViewportKeyDown}
        onKeyUp={handleViewportKeyUp}
        onBlur={handleViewportBlur}
        onPointerDownCapture={handleViewportPointerDownCapture}
        onPointerDown={handleViewportPointerDown}
        onPointerMove={handleViewportPointerMove}
        onPointerUp={handleViewportPointerUp}
        onPointerCancel={(event) => {
          if (panRef.current) finishPan(event);
        }}
      >
        <div
          ref={frameRef}
          className={[
            'scene-preview-frame',
            placingTokenId ? 'placing-token' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          style={frameStyle}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverCell(null)}
          onClick={handleFrameClick}
        >
          {background.type === 'upload' ? (
            <img
              src={background.url}
              alt=""
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  applyAspect(image.naturalWidth / image.naturalHeight);
                }
              }}
            />
          ) : (
            <div className={`scene-preset preset-${background.preset}`} aria-hidden="true" />
          )}

          <GridOverlay
            grid={scene.grid}
            aspect={aspect}
            lineWidth={1 / camera.scale}
          />

          {geometry ? (
            <div className="token-layer">
              {scene.tokens.map((token) => {
                if (!token.cell) return null;
                const center = cellCenter(geometry, token.cell);
                const size = tokenDiameterPercent(geometry);
                const selected = placingTokenId === token.id;

                return (
                  <div
                    className={[
                      'board-token-wrap',
                      selected ? 'selected' : '',
                      token.hidden ? 'is-hidden' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    key={token.id}
                    style={{
                      left: `${center.x * 100}%`,
                      top: `${center.y * 100}%`,
                      width: `${size}%`,
                    }}
                  >
                    <button
                      className="board-token"
                      type="button"
                      title={token.label}
                      aria-label={`${token.label} token`}
                      style={{ '--token-color': token.color } as CSSProperties}
                      onClick={(event) => handleTokenClick(event, token.id)}
                    >
                      <TokenGlyph
                        shape={tokenShapeForToken(token)}
                        color={token.color}
                        label={tokenInitials(token.label)}
                      />
                    </button>
                  </div>
                );
              })}

              {selectedToken && hoverCell ? (
                <div
                  className={
                    ghostOccupied
                      ? 'board-token-wrap token-ghost token-ghost-invalid'
                      : 'board-token-wrap token-ghost'
                  }
                  style={{
                    left: `${cellCenter(geometry, hoverCell).x * 100}%`,
                    top: `${cellCenter(geometry, hoverCell).y * 100}%`,
                    width: `${tokenDiameterPercent(geometry)}%`,
                  }}
                  aria-hidden="true"
                >
                  <div
                    className="board-token"
                    style={{ '--token-color': selectedToken.color } as CSSProperties}
                  >
                    <TokenGlyph
                      shape={tokenShapeForToken(selectedToken)}
                      color={selectedToken.color}
                      label={tokenInitials(selectedToken.label)}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>

        {selectedToken ? (
          <div className="scene-preview-hint">
            Click a square to place {selectedToken.label}. Escape cancels.
          </div>
        ) : null}

        <div className="scene-zoom-controls" role="group" aria-label="Scene zoom">
          <button
            className="scene-zoom-button"
            type="button"
            aria-label="Zoom out"
            title="Zoom out (Shift+-)"
            disabled={camera.scale <= MIN_SCENE_SCALE}
            onClick={() =>
              zoomAt(cameraRef.current.scale / SCENE_KEY_ZOOM_FACTOR)
            }
          >
            <Minus size={14} weight="bold" aria-hidden="true" />
          </button>

          <button
            className="scene-zoom-level"
            type="button"
            aria-label={`Reset zoom, currently ${zoomPercent}%`}
            title="Reset zoom to 100% (Shift+0)"
            onClick={resetCamera}
          >
            {zoomPercent}%
          </button>

          <button
            className="scene-zoom-button"
            type="button"
            aria-label="Zoom in"
            title="Zoom in (Shift+=)"
            disabled={camera.scale >= MAX_SCENE_SCALE}
            onClick={() =>
              zoomAt(cameraRef.current.scale * SCENE_KEY_ZOOM_FACTOR)
            }
          >
            <Plus size={14} weight="bold" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p id="scene-preview-zoom-help" className="sr-only">
        Use Shift plus the mouse wheel, or Shift plus or minus, to zoom. Press
        Shift+0 to reset. Use the arrow keys to pan when zoomed.
      </p>

      <span className="sr-only" aria-live="polite">
        {zoomAnnouncement}
      </span>

      <div className="scene-preview-meta">
        <span className="eyebrow">Preview</span>
        <h2>{scene.title}</h2>
      </div>
    </section>
  );
}
