import { gridGeometry, wrapOffset } from '../../shared/grid';
import type { GridSettings } from '../../shared/types';

const NUDGE_STEP = 0.05;

interface GridEditorProps {
  grid: GridSettings | null;
  aspect: number;
  onChange: (grid: GridSettings | null) => void;
}

export function GridEditor({ grid, aspect, onChange }: GridEditorProps) {
  const geometry = grid ? gridGeometry(grid, aspect) : null;

  function nudge(deltaX: number, deltaY: number): void {
    if (!grid) return;
    onChange({
      ...grid,
      offsetX: wrapOffset(grid.offsetX + deltaX),
      offsetY: wrapOffset(grid.offsetY + deltaY),
    });
  }

  return (
    <section className="grid-editor">
      <div className="grid-editor-head">
        <div>
          <span className="grid-editor-title">Token grid</span>
          <p className="muted small">
            Optional. Align a square grid so player, NPC, and enemy tokens can be placed.
          </p>
        </div>
        <button
          className={grid ? 'button danger small' : 'button ghost small'}
          type="button"
          onClick={() =>
            onChange(
              grid
                ? null
                : { cellsAcross: 24, offsetX: 0, offsetY: 0, aspect },
            )
          }
        >
          {grid ? 'Remove grid' : 'Add grid'}
        </button>
      </div>

      {grid && geometry ? (
        <div className="grid-editor-controls">
          <div className="field">
            <span className="grid-size-label">
              Squares across
              <span className="grid-size-stepper">
                <button
                  className="grid-nudge"
                  type="button"
                  aria-label="One fewer square across"
                  disabled={grid.cellsAcross <= 4}
                  onClick={() =>
                    onChange({
                      ...grid,
                      cellsAcross: Math.max(4, grid.cellsAcross - 1),
                    })
                  }
                >
                  ←
                </button>
                <strong>{grid.cellsAcross}</strong>
                <button
                  className="grid-nudge"
                  type="button"
                  aria-label="One more square across"
                  disabled={grid.cellsAcross >= 80}
                  onClick={() =>
                    onChange({
                      ...grid,
                      cellsAcross: Math.min(80, grid.cellsAcross + 1),
                    })
                  }
                >
                  →
                </button>
              </span>
            </span>
            <input
              aria-label="Squares across"
              type="range"
              min={4}
              max={80}
              step={1}
              value={grid.cellsAcross}
              onChange={(event) =>
                onChange({ ...grid, cellsAcross: Number(event.target.value) })
              }
            />
          </div>

          <p className="muted small">
            {geometry.fullColumns} × {geometry.fullRows} full squares. Partial edge
            squares cannot hold tokens.
          </p>

          <div className="grid-nudge-row">
            <span className="muted small">Nudge</span>
            <div className="grid-nudges">
              <button
                className="grid-nudge"
                type="button"
                aria-label="Nudge grid left"
                onClick={() => nudge(-NUDGE_STEP, 0)}
              >
                ←
              </button>
              <button
                className="grid-nudge"
                type="button"
                aria-label="Nudge grid up"
                onClick={() => nudge(0, -NUDGE_STEP)}
              >
                ↑
              </button>
              <button
                className="grid-nudge"
                type="button"
                aria-label="Nudge grid down"
                onClick={() => nudge(0, NUDGE_STEP)}
              >
                ↓
              </button>
              <button
                className="grid-nudge"
                type="button"
                aria-label="Nudge grid right"
                onClick={() => nudge(NUDGE_STEP, 0)}
              >
                →
              </button>
            </div>
            <button
              className="button ghost small"
              type="button"
              onClick={() => onChange({ ...grid, offsetX: 0, offsetY: 0 })}
            >
              Reset alignment
            </button>
          </div>
        </div>
      ) : (
        <p className="muted small">
          Scenes without a grid cannot hold tokens. Add one for battle maps or any map
          where you want to place tokens.
        </p>
      )}
    </section>
  );
}
