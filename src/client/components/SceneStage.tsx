import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
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
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [aspect, setAspect] = useState(16 / 9);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const [hoverCell, setHoverCell] = useState<TokenCell | null>(null);
  const background = room.scene.background;
  const backgroundKey = background.type === 'upload' ? background.url : background.preset;
  const geometry = gridGeometry(room.scene.grid, aspect);
  const tokens = role === 'gm' ? room.tokens : room.tokens.filter((token) => !token.hidden);
  const selectedToken = placingTokenId
    ? tokens.find((token) => token.id === placingTokenId) ?? null
    : null;

  useEffect(() => {
    setAspect(16 / 9);
    setHoverCell(null);
  }, [backgroundKey]);

  useEffect(() => {
    setHoverCell(null);
  }, [placingTokenId, room.activeSceneIndex]);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    function updateSize() {
      if (!stage) return;
      const availableWidth = stage.clientWidth - 16;
      const availableHeight = stage.clientHeight - 16;
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
    observer.observe(stage);
    return () => observer.disconnect();
  }, [aspect]);

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

  function handleFrameClick(event: ReactMouseEvent<HTMLDivElement>): void {
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

  return (
    <section className="scene-panel">
      <div className="scene-stage" ref={stageRef}>
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
    </section>
  );
}

