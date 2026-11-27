import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import {
  cellAtPoint,
  cellCenter,
  gridGeometry,
  tokenDiameterPercent,
} from '../../shared/grid';
import type { CampaignScene, TokenCell } from '../../shared/types';
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
  const frameRef = useRef<HTMLDivElement>(null);
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
    if (!placingTokenId || !geometry) return;
    const point = readPoint(event.clientX, event.clientY);
    setHoverCell(point ? cellAtPoint(geometry, point.x, point.y) : null);
  }

  function handleFrameClick(event: ReactMouseEvent<HTMLDivElement>): void {
    if (!placingTokenId || !geometry || !onPlaceToken) return;
    const point = readPoint(event.clientX, event.clientY);
    if (!point) return;
    const cell = cellAtPoint(geometry, point.x, point.y);
    if (!cell || tokenAt(cell, placingTokenId)) return;
    onPlaceToken(placingTokenId, cell.col, cell.row);
  }

  function handleTokenClick(event: ReactMouseEvent, tokenId: string): void {
    event.stopPropagation();
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

  return (
    <section className="scene-preview-panel">
      <div
        ref={frameRef}
        className={[
          'scene-preview-frame',
          expanded ? 'expanded' : '',
          placingTokenId ? 'placing-token' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: `min(100%, calc(${maxHeight}px * ${aspect}))`,
          aspectRatio: String(aspect),
        }}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverCell(null)}
        onClick={handleFrameClick}
      >
        {background.type === 'upload' ? (
          <img
            src={background.url}
            alt=""
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

        <GridOverlay grid={scene.grid} aspect={aspect} />

        {geometry ? (
          <div className="token-layer">
            {scene.tokens.map((token) => {
              if (!token.cell) return null;
              const center = cellCenter(geometry, token.cell);
              const size = tokenDiameterPercent(geometry);
              const selected = placingTokenId === token.id;

              return (
                <div
                  className={
                    selected ? 'board-token-wrap selected' : 'board-token-wrap'
                  }
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

        {selectedToken ? (
          <div className="scene-preview-hint">
            Click a square to place {selectedToken.label}. Escape cancels.
          </div>
        ) : null}
      </div>
      <div className="scene-preview-meta">
        <span className="eyebrow">Preview</span>
        <h2>{scene.title}</h2>
      </div>
    </section>
  );
}
