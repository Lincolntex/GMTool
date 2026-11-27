import type { TokenInfo, TokenShape } from '../../shared/types';

export { GM_TOKEN_COLORS } from '../../shared/shapes';

export function tokenShapeForToken(token: TokenInfo): TokenShape {
  if (token.shape) return token.shape;
  if (token.kind === 'enemy') return 'triangle-up';
  if (token.kind === 'npc') return 'triangle-down';
  return 'circle';
}

export function tokenInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}
