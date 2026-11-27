import type { PlayerShape, TokenShape } from './types';

export const GM_TOKEN_COLORS = {
  enemy: '#c94b4b',
  npc: '#4f9d69',
} as const;

export const PLAYER_SHAPES: PlayerShape[] = [
  'circle',
  'square',
  'diamond',
  'hexagon',
  'star',
  'heart',
  'teardrop',
];

export const PLAYER_SHAPE_LABELS: Record<PlayerShape, string> = {
  circle: 'Circle',
  square: 'Square',
  diamond: 'Diamond',
  hexagon: 'Hexagon',
  star: '8-point star',
  heart: 'Heart',
  teardrop: 'Teardrop',
};

export function isPlayerShape(value: unknown): value is PlayerShape {
  return typeof value === 'string' && (PLAYER_SHAPES as string[]).includes(value);
}

export function gmTokenShape(kind: 'enemy' | 'npc'): TokenShape {
  return kind === 'enemy' ? 'triangle-up' : 'triangle-down';
}
