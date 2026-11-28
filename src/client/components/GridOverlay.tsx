import type { CSSProperties } from 'react';
import { gridGeometry, gridLinePositions } from '../../shared/grid';
import type { GridSettings } from '../../shared/types';

interface GridOverlayProps {
  grid: GridSettings | null;
  aspect: number;
  faint?: boolean;
  lineWidth?: number;
  style?: CSSProperties;
}

export function GridOverlay({
  grid,
  aspect,
  faint = false,
  lineWidth = 1,
  style,
}: GridOverlayProps) {
  const geometry = gridGeometry(grid, aspect);
  if (!geometry) return null;

  const lines = gridLinePositions(geometry);

  return (
    <svg
      className={faint ? 'grid-overlay grid-overlay-faint' : 'grid-overlay'}
      style={style}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {lines.vertical.map((x, index) => (
        <line
          key={`v-${index}`}
          x1={x}
          y1={0}
          x2={x}
          y2={100}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: `${lineWidth}px` }}
        />
      ))}
      {lines.horizontal.map((y, index) => (
        <line
          key={`h-${index}`}
          x1={0}
          y1={y}
          x2={100}
          y2={y}
          vectorEffect="non-scaling-stroke"
          style={{ strokeWidth: `${lineWidth}px` }}
        />
      ))}
    </svg>
  );
}
