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
import type { Socket } from 'socket.io-client';
import {
  cellAtPoint,
  cellCenter,
  gridGeometry,
  tokenDiameterPercent,
} from '../../shared/grid';
import type {
  PingInfo,
  PointerInfo,
  PublicRoom,
  Role,
  TokenCell,
  TokenInfo,
  TokenShape,
} from '../../shared/types';
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
import { ShapeIcon, TokenGlyph } from './ShapeIcon';

export interface LocalTokenPing {
  id: string;
  tokenId: string;
  cell: TokenCell;
  color: string;
  shape: TokenShape;
}

interface SceneStageProps {
  room: PublicRoom;
  socket: Socket | null;
  pointers: Record<string, PointerInfo>;
  pings: PingInfo[];
  localPing?: LocalTokenPing | null;
  role: Role;
  selfId: string | null;
  placingTokenId: string | null;
  onStartPlacement: (tokenId: string) => void;
  onCancelPlacement: () => void;
  onPlaceToken: (tokenId: string, col: number, row: number) => void;
  onUnplaceToken: (tokenId: string) => void;
}

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  startedAt: number;
  lastSentAt: number;
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

export function SceneStage({
  room,
  socket,
  pointers,
  pings,
  localPing = null,
  role,
  selfId,
  placingTokenId,
  onStartPlacement,
  onCancelPlacement,
  onPlaceToken,
  onUnplaceToken,
}: SceneStageProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const frameBaseRef = useRef({ width: 0, height: 0 });
  const dragRef = useRef<DragState | null>(null);
  const panRef = useRef<PanState | null>(null);
  const cameraRef = useRef<SceneCamera>(createDefaultCamera());
  const zoomAtRef = useRef<(scale: number, x?: number, y?: number) => void>(
    () => undefined,
  );
  const spaceHeldRef = useRef(false);
  const panEndedAtRef = useRef(0);
  const announceTimerRef = useRef<number | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [camera, setCamera] = useState<SceneCamera>(createDefaultCamera);
  const [panning, setPanning] = useState(false);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [zoomAnnouncement, setZoomAnnouncement] = useState('');
  const [hoverCell, setHoverCell] = useState<TokenCell | null>(null);
  const background = room.scene.background;
  const backgroundKey = background.type === 'upload' ? background.url : background.preset;
  const geometry = gridGeometry(room.scene.grid, aspect);
  const tokens = role === 'gm' ? room.tokens : room.tokens.filter((token) => !token.hidden);
  const selectedToken = placingTokenId
    ? tokens.find((token) => token.id === placingTokenId) ?? null
    : null;

  useLayoutEffect(() => {
    setAspect(16 / 9);
    setHoverCell(null);
    resetCamera();
  }, [backgroundKey, room.activeSceneIndex]);

  useLayoutEffect(() => {
    resetCamera();
  }, [aspect]);

  useEffect(() => {
    setHoverCell(null);
  }, [placingTokenId, room.activeSceneIndex]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    function updateSize() {
      if (!viewport) return;
      const availableWidth = viewport.clientWidth;
      const availableHeight = viewport.clientHeight;
      setViewportSize((previous) =>
        previous.width === availableWidth && previous.height === availableHeight
          ? previous
          : { width: availableWidth, height: availableHeight },
      );
      if (availableWidth <= 0 || availableHeight <= 0) return;

      let width = availableWidth;
      let height = width / aspect;
      if (height > availableHeight) {
        height = availableHeight;
        width = height * aspect;
      }

      setFrameWidth(Math.max(0, Math.floor(width)));
    }

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [aspect]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const viewport = viewportRef.current;
    if (!frame || !viewport) return;

    const scale = cameraRef.current.scale > 0 ? cameraRef.current.scale : 1;
    const frameRect = frame.getBoundingClientRect();
    const viewportRect = viewport.getBoundingClientRect();
    const base = {
      width: frameRect.width / scale,
      height: frameRect.height / scale,
    };
    frameBaseRef.current = base;

    commitCamera(
      clampSceneCamera(
        cameraRef.current,
        base.width,
        base.height,
        viewportRect.width,
        viewportRect.height,
      ),
    );
  }, [
    frameWidth,
    aspect,
    viewportSize.width,
    viewportSize.height,
    camera.scale,
  ]);

  useEffect(() => {
    return () => {
      if (announceTimerRef.current !== null) {
        window.clearTimeout(announceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    function releaseSpace() {
      if (!spaceHeldRef.current) return;
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    }

    function handleWindowKeyUp(event: KeyboardEvent) {
      if (event.code === 'Space') releaseSpace();
    }

    function handleWindowBlur() {
      releaseSpace();
      if (panRef.current) finishPan();
    }

    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('keyup', handleWindowKeyUp);
    return () => {
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('keyup', handleWindowKeyUp);
    };
  }, []);

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
    const base = frameBaseRef.current;
    if (base.width > 0 && base.height > 0) return base;

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

  function panCameraBy(deltaX: number, deltaY: number): void {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const base = getFrameBaseSize();
    const rect = viewport.getBoundingClientRect();
    commitCamera(
      panSceneCamera(
        cameraRef.current,
        deltaX,
        deltaY,
        base.width,
        base.height,
        rect.width,
        rect.height,
      ),
    );
  }

  zoomAtRef.current = zoomAt;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const viewportElement = viewport;

    function handleWheel(event: WheelEvent) {
      if (!event.shiftKey) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (dragRef.current || panRef.current) return;

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

      zoomAtRef.current(
        cameraRef.current.scale * factor,
        event.clientX,
        event.clientY,
      );
    }

    viewportElement.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewportElement.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    const tokenId: string = placingTokenId ?? '';
    if (!tokenId) return;

    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return;
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        onCancelPlacement();
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault();
        if (selectedToken?.cell) onUnplaceToken(tokenId);
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [placingTokenId, selectedToken?.cell, onCancelPlacement, onUnplaceToken]);

  function readClientPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const frame = frameRef.current;
    if (!frame) return null;
    const bounds = frame.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return null;
    return {
      x: clamp((clientX - bounds.left) / bounds.width),
      y: clamp((clientY - bounds.top) / bounds.height),
    };
  }

  function tokenAt(
    cell: TokenCell,
    ignoreId?: string,
    ignoreHidden = false,
  ): TokenInfo | null {
    return (
      tokens.find(
        (token) =>
          token.id !== ignoreId &&
          token.cell?.col === cell.col &&
          token.cell?.row === cell.row &&
          (!ignoreHidden || !token.hidden),
      ) ?? null
    );
  }

  function finishPointer(event?: ReactPointerEvent<HTMLDivElement>, allowPing = true): void {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    socket?.emit('pointer:end');

    if (allowPing && event && !drag.moved && performance.now() - drag.startedAt < 500) {
      const point = readClientPoint(event.clientX, event.clientY);
      if (point) socket?.emit('pointer:ping', point);
    }

    try {
      if (event?.currentTarget.hasPointerCapture(drag.pointerId)) {
        event.currentTarget.releasePointerCapture(drag.pointerId);
      }
    } catch {
      // The browser may have already released capture.
    }
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (!event.shiftKey || event.button !== 0) return;
    const point = readClientPoint(event.clientX, event.clientY);
    if (!point) return;

    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic events and some browsers may not have an active pointer to capture.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      moved: false,
      startedAt: performance.now(),
      lastSentAt: performance.now(),
    };
    socket?.emit('pointer:move', point);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    if (panRef.current) return;

    if (placingTokenId && geometry) {
      const point = readClientPoint(event.clientX, event.clientY);
      setHoverCell(point ? cellAtPoint(geometry, point.x, point.y) : null);
    }

    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    if (!event.shiftKey) {
      finishPointer(undefined, false);
      return;
    }

    if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) {
      drag.moved = true;
    }

    const now = performance.now();
    if (now - drag.lastSentAt < 50) return;
    drag.lastSentAt = now;

    const point = readClientPoint(event.clientX, event.clientY);
    if (point) socket?.emit('pointer:move', point);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    finishPointer(event, true);
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
    const rect = viewport.getBoundingClientRect();
    commitCamera(
      panSceneCamera(
        pan.startCamera,
        event.clientX - pan.startX,
        event.clientY - pan.startY,
        base.width,
        base.height,
        rect.width,
        rect.height,
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

  function handleSceneKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
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

  function handleSceneKeyUp(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.code !== 'Space') return;
    spaceHeldRef.current = false;
    setSpaceHeld(false);
  }

  function handleSceneBlur(): void {
    spaceHeldRef.current = false;
    setSpaceHeld(false);
  }

  function handleFrameClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (performance.now() - panEndedAtRef.current < 200) return;
    if (!placingTokenId || !geometry || event.shiftKey) return;
    const point = readClientPoint(event.clientX, event.clientY);
    if (!point) return;
    const cell = cellAtPoint(geometry, point.x, point.y);
    if (!cell) return;
    if (tokenAt(cell, placingTokenId, selectedToken?.kind === 'player')) return;
    onPlaceToken(placingTokenId, cell.col, cell.row);
  }

  function handleTokenClick(event: ReactMouseEvent, token: TokenInfo): void {
    event.stopPropagation();
    if (event.shiftKey) return;
    if (role === 'player' && token.ownerId !== selfId) return;
    if (placingTokenId === token.id) {
      onCancelPlacement();
      return;
    }
    onStartPlacement(token.id);
  }

  const frameStyle = {
    '--scene-aspect': aspect,
    '--scene-zoom': camera.scale,
    '--scene-pan-x': `${camera.x}px`,
    '--scene-pan-y': `${camera.y}px`,
    aspectRatio: String(aspect),
    width: frameWidth === null ? '100%' : `${frameWidth}px`,
  } as CSSProperties;

  const showGrid = Boolean(room.scene.grid) && (room.gridVisible || Boolean(placingTokenId));
  const ghostOccupied =
    selectedToken && hoverCell
      ? Boolean(
          tokenAt(hoverCell, selectedToken.id, selectedToken.kind === 'player'),
        )
      : false;
  const zoomPercent = Math.round(camera.scale * 100);
  const viewportClassName = [
    'scene-viewport',
    camera.scale > MIN_SCENE_SCALE ? 'is-zoomed' : '',
    panning ? 'is-panning' : '',
    spaceHeld && camera.scale > MIN_SCENE_SCALE ? 'is-space-held' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="scene-panel">
      <div
        className="scene-stage"
        onKeyDown={handleSceneKeyDown}
        onKeyUp={handleSceneKeyUp}
      >
        <div
          className={
            background.type === 'upload'
              ? 'scene-backdrop scene-backdrop-image'
              : `scene-backdrop preset-${background.preset}`
          }
          style={
            background.type === 'upload'
              ? { backgroundImage: `url(${background.url})` }
              : undefined
          }
          aria-hidden="true"
        />

        <div
          ref={viewportRef}
          className={viewportClassName}
          tabIndex={0}
          aria-label={`${room.scene.title} scene viewport`}
          aria-describedby="scene-zoom-help"
          onPointerDownCapture={handleViewportPointerDownCapture}
          onPointerDown={handleViewportPointerDown}
          onPointerMove={handleViewportPointerMove}
          onPointerUp={handleViewportPointerUp}
          onPointerCancel={(event) => {
            if (panRef.current) finishPan(event);
          }}
          onBlur={handleSceneBlur}
        >
          <div
            ref={frameRef}
            className={placingTokenId ? 'scene-frame placing-token' : 'scene-frame'}
            style={frameStyle}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => setHoverCell(null)}
            onPointerCancel={(event) => finishPointer(event, false)}
            onClick={handleFrameClick}
            aria-label={`Scene: ${room.scene.title}`}
          >
          {background.type === 'upload' ? (
            <img
              className="scene-image"
              src={background.url}
              alt=""
              draggable={false}
              onDragStart={(event) => event.preventDefault()}
              onLoad={(event) => {
                const image = event.currentTarget;
                if (image.naturalWidth > 0 && image.naturalHeight > 0) {
                  setAspect(image.naturalWidth / image.naturalHeight);
                }
              }}
            />
          ) : (
            <div className={`scene-preset preset-${background.preset}`} aria-hidden="true" />
          )}

          {showGrid ? (
            <GridOverlay
              grid={room.scene.grid}
              aspect={aspect}
              faint={!room.gridVisible}
              lineWidth={1 / camera.scale}
            />
          ) : null}

          {geometry ? (
            <div className="token-layer">
              {tokens.map((token) => {
                if (!token.cell) return null;
                const center = cellCenter(geometry, token.cell);
                const size = tokenDiameterPercent(geometry);
                const selected = placingTokenId === token.id;
                const controllable = role === 'gm' || token.ownerId === selfId;

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
                      className={
                        controllable
                          ? 'board-token'
                          : 'board-token board-token-locked'
                      }
                      type="button"
                      title={token.label}
                      aria-label={`${token.label} token`}
                      style={{ '--token-color': token.color } as CSSProperties}
                      onClick={(event) => handleTokenClick(event, token)}
                    >
                      <TokenGlyph
                        shape={tokenShapeForToken(token)}
                        color={token.color}
                        label={tokenInitials(token.label)}
                      />
                    </button>

                    {selected && token.cell ? (
                      <button
                        className="token-remove"
                        type="button"
                        aria-label={`Remove ${token.label} from the scene`}
                        title="Remove from scene (Delete)"
                        onClick={(event) => {
                          event.stopPropagation();
                          onUnplaceToken(token.id);
                        }}
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                );
              })}

              {selectedToken && hoverCell && geometry ? (
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

          <div className="pointer-layer" aria-hidden="true">
            {Object.values(pointers).map((pointer) => (
              <div
                key={pointer.participantId}
                className={pointer.participantId === 'gm' ? 'pointer pointer-gm' : 'pointer'}
                style={
                  {
                    left: `${pointer.x * 100}%`,
                    top: `${pointer.y * 100}%`,
                    '--pointer-color': pointer.color,
                  } as CSSProperties
                }
              >
                {pointer.participantId === 'gm' ? (
                  <span className="pointer-gm-shape">
                    <ShapeIcon shape="triangle-down" color={pointer.color} strokeWidth={2.5} />
                  </span>
                ) : (
                  <span className="pointer-dot" />
                )}
                <span className="pointer-label">{pointer.name}</span>
              </div>
            ))}

            {pings.map((ping) =>
              ping.participantId === 'gm' ? (
                <span
                  key={ping.id}
                  className="ping ping-gm-triangle"
                  style={{
                    left: `${ping.x * 100}%`,
                    top: `${ping.y * 100}%`,
                  }}
                >
                  <svg viewBox="0 0 100 100" aria-hidden="true">
                    <polygon
                      points="50,94 6,10 94,10"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={7}
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  </svg>
                </span>
              ) : (
                <span
                  key={ping.id}
                  className="ping ping-shape"
                  style={
                    {
                      left: `${ping.x * 100}%`,
                      top: `${ping.y * 100}%`,
                      '--pointer-color': ping.color,
                    } as CSSProperties
                  }
                >
                  <ShapeIcon
                    shape={ping.shape ?? 'circle'}
                    color={ping.color}
                    filled={false}
                    strokeWidth={3}
                    className="ping-shape-icon"
                  />
                </span>
              ),
            )}

            {localPing && geometry ? (
              <span
                key={localPing.id}
                className="ping ping-shape ping-local"
                style={
                  {
                    left: `${cellCenter(geometry, localPing.cell).x * 100}%`,
                    top: `${cellCenter(geometry, localPing.cell).y * 100}%`,
                    '--pointer-color': localPing.color,
                  } as CSSProperties
                }
              >
                <ShapeIcon
                  shape={localPing.shape}
                  color={localPing.color}
                  filled={false}
                  strokeWidth={3}
                  className="ping-shape-icon"
                />
              </span>
            ) : null}
          </div>
        </div>
        </div>

        <p id="scene-zoom-help" className="sr-only">
          Use Shift plus the mouse wheel, or Shift plus or minus, to zoom. Press
          Shift+0 to reset. Use the arrow keys to pan when zoomed.
        </p>

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

        <span className="sr-only" aria-live="polite">
          {zoomAnnouncement}
        </span>
      </div>
    </section>
  );
}

