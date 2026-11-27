import type { CSSProperties } from 'react';
import type { TokenShape } from '../../shared/types';

interface ShapeIconProps {
  shape: TokenShape;
  color: string;
  className?: string;
  strokeWidth?: number;
  filled?: boolean;
  strokeColor?: string;
}

function starPoints(): string {
  const points: string[] = [];
  for (let index = 0; index < 16; index += 1) {
    const angle = (-90 + index * 22.5) * (Math.PI / 180);
    const radius = index % 2 === 0 ? 46 : 29;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    points.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return points.join(' ');
}

const STAR_POINTS = starPoints();

export function ShapeIcon({
  shape,
  color,
  className,
  strokeWidth = 2,
  filled = true,
  strokeColor,
}: ShapeIconProps) {
  const common = {
    fill: filled ? color : 'none',
    stroke: strokeColor ?? (filled ? 'rgba(255, 255, 255, 0.95)' : color),
    strokeWidth,
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    vectorEffect: 'non-scaling-stroke' as const,
  };

  return (
    <svg
      className={className ? `shape-icon ${className}` : 'shape-icon'}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      style={{ '--shape-color': color } as CSSProperties}
    >
      {shape === 'circle' ? <circle cx={50} cy={50} r={42} {...common} /> : null}
      {shape === 'square' ? (
        <rect x={9} y={9} width={82} height={82} rx={7} {...common} />
      ) : null}
      {shape === 'diamond' ? (
        <polygon points="50,7 93,50 50,93 7,50" {...common} />
      ) : null}
      {shape === 'hexagon' ? (
        <polygon points="50,5 89,27.5 89,72.5 50,95 11,72.5 11,27.5" {...common} />
      ) : null}
      {shape === 'star' ? <polygon points={STAR_POINTS} {...common} /> : null}
      {shape === 'heart' ? (
        <path
          d="M50 92 C44 86 6 60 6 32 C6 16 18 6 33 6 C42 6 48 11 50 20 C52 11 58 6 67 6 C82 6 94 16 94 32 C94 60 56 86 50 92 Z"
          {...common}
        />
      ) : null}
      {shape === 'teardrop' ? (
        <path
          d="M50 7 C56 22 87 45 87 66 C87 83 70 94 50 94 C30 94 13 83 13 66 C13 45 44 22 50 7 Z"
          {...common}
        />
      ) : null}
      {shape === 'triangle-up' ? (
        <polygon points="50,6 94,90 6,90" {...common} />
      ) : null}
      {shape === 'triangle-down' ? (
        <polygon points="50,94 6,10 94,10" {...common} />
      ) : null}
    </svg>
  );
}

export function TokenGlyph({
  shape,
  color,
  label,
  className,
}: {
  shape: TokenShape;
  color: string;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={className ? `token-glyph ${className}` : 'token-glyph'}
      style={{ '--token-color': color } as CSSProperties}
    >
      <ShapeIcon shape={shape} color={color} className="token-glyph-shape" />
      {label ? <span className="token-glyph-text">{label}</span> : null}
    </span>
  );
}
