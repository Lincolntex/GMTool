import crypto from 'node:crypto';
import type {
  Campaign,
  CampaignScene,
  CampaignSummary,
  GridSettings,
  PresetId,
  SceneBackground,
  TokenInfo,
} from '../src/shared/types';
import { clampCellsAcross, gridGeometry, wrapOffset } from '../src/shared/grid';
import { GM_TOKEN_COLORS, gmTokenShape } from '../src/shared/shapes';

const PRESETS: PresetId[] = ['snow', 'grass', 'dungeon'];
const MAX_SCENES = 50;

/**
 * Temporary in-memory campaign store for the dashboard shell.
 * This intentionally resets when the server restarts.
 * The API shape is designed so a database-backed store can replace this module later.
 */
let campaigns: Campaign[] = [];

function cleanText(value: unknown, fallback: string, maxLength = 80): string {
  const text = typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
  return text || fallback;
}

function cleanBackground(value: unknown): SceneBackground {
  if (!value || typeof value !== 'object') {
    throw new Error('A scene background is required.');
  }

  const background = value as Partial<SceneBackground> & {
    preset?: unknown;
    url?: unknown;
  };

  if (background.type === 'preset') {
    const preset = String(background.preset || '');
    if (!PRESETS.includes(preset as PresetId)) {
      throw new Error('Invalid preset background.');
    }
    return { type: 'preset', preset: preset as PresetId };
  }

  if (background.type === 'upload') {
    const url = String(background.url || '');
    if (!/^\/uploads\/[0-9a-f-]{36}\.(png|jpg|webp)$/i.test(url)) {
      throw new Error('Invalid uploaded background.');
    }
    return { type: 'upload', url };
  }

  throw new Error('Invalid scene background.');
}

function cleanGrid(value: unknown): GridSettings | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'object') {
    throw new Error('Invalid scene grid.');
  }

  const grid = value as Partial<GridSettings>;
  const cellsAcross = clampCellsAcross(Number(grid.cellsAcross));
  const aspect = Number(grid.aspect);
  return {
    cellsAcross,
    offsetX: wrapOffset(Number(grid.offsetX ?? 0)),
    offsetY: wrapOffset(Number(grid.offsetY ?? 0)),
    ...(Number.isFinite(aspect) && aspect > 0 ? { aspect } : {}),
  };
}

function cleanTokens(value: unknown, grid: GridSettings | null): TokenInfo[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('Invalid scene tokens.');
  if (value.length > 100) throw new Error('A scene can have at most 100 tokens.');
  if (value.length > 0 && !grid) {
    throw new Error('Add a grid before adding tokens to a scene.');
  }

  const geometry = grid ? gridGeometry(grid, grid.aspect ?? 16 / 9) : null;
  const occupied = new Set<string>();
  const tokens: TokenInfo[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid token.');
    const candidate = entry as Partial<TokenInfo> & {
      cell?: { col?: unknown; row?: unknown } | null;
    };
    if (candidate.kind !== 'enemy' && candidate.kind !== 'npc') {
      throw new Error('Campaign scenes only support enemy and NPC tokens.');
    }

    let cell: TokenInfo['cell'] = null;
    if (candidate.cell) {
      const col = Number(candidate.cell.col);
      const row = Number(candidate.cell.row);
      if (!Number.isInteger(col) || !Number.isInteger(row)) {
        throw new Error('Invalid token square.');
      }
      if (
        !geometry ||
        col < 0 ||
        col >= geometry.fullColumns ||
        row < 0 ||
        row >= geometry.fullRows
      ) {
        throw new Error('Token square is outside the scene grid.');
      }
      const key = `${col}:${row}`;
      if (occupied.has(key)) throw new Error('Two tokens cannot share a square.');
      occupied.add(key);
      cell = { col, row };
    }

    tokens.push({
      id:
        typeof candidate.id === 'string' && candidate.id
          ? candidate.id
          : crypto.randomUUID(),
      kind: candidate.kind,
      label: cleanText(candidate.label, candidate.kind === 'enemy' ? 'Enemy' : 'NPC', 24),
      color: GM_TOKEN_COLORS[candidate.kind],
      shape: gmTokenShape(candidate.kind),
      ownerId: null,
      cell,
      hidden: Boolean(candidate.hidden),
    });
  }

  return tokens;
}

function cleanScene(value: unknown): CampaignScene {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid scene.');
  }

  const scene = value as Partial<CampaignScene>;
  const grid = cleanGrid(scene.grid);
  return {
    id: typeof scene.id === 'string' && scene.id ? scene.id : crypto.randomUUID(),
    title: cleanText(scene.title, 'Untitled scene'),
    background: cleanBackground(scene.background),
    grid,
    tokens: cleanTokens(scene.tokens, grid),
  };
}

function cleanInput(input: unknown): { name: string; scenes: CampaignScene[] } {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid campaign data.');
  }

  const value = input as { name?: unknown; scenes?: unknown };
  if (!Array.isArray(value.scenes) || value.scenes.length === 0) {
    throw new Error('A campaign needs at least one scene.');
  }
  if (value.scenes.length > MAX_SCENES) {
    throw new Error(`A campaign can have at most ${MAX_SCENES} scenes.`);
  }

  return {
    name: cleanText(value.name, 'Untitled campaign'),
    scenes: value.scenes.map(cleanScene),
  };
}

export function listCampaigns(): CampaignSummary[] {
  return [...campaigns]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      sceneCount: campaign.scenes.length,
      updatedAt: campaign.updatedAt,
    }));
}

export function getCampaign(id: string): Campaign | null {
  const campaign = campaigns.find((candidate) => candidate.id === id);
  return campaign ? structuredClone(campaign) : null;
}

export function createCampaign(input: unknown): Campaign {
  const cleaned = cleanInput(input);
  const now = Date.now();
  const campaign: Campaign = {
    id: crypto.randomUUID(),
    name: cleaned.name,
    scenes: cleaned.scenes,
    createdAt: now,
    updatedAt: now,
  };
  campaigns.push(campaign);
  return structuredClone(campaign);
}

export function updateCampaign(id: string, input: unknown): Campaign | null {
  const index = campaigns.findIndex((campaign) => campaign.id === id);
  if (index === -1) return null;

  const existing = campaigns[index];
  const cleaned = cleanInput(input);
  const updated: Campaign = {
    ...existing,
    name: cleaned.name,
    scenes: cleaned.scenes,
    updatedAt: Date.now(),
  };

  campaigns[index] = updated;
  return structuredClone(updated);
}

export function deleteCampaign(id: string): boolean {
  const index = campaigns.findIndex((campaign) => campaign.id === id);
  if (index === -1) return false;
  campaigns.splice(index, 1);
  return true;
}

export function copyCampaign(id: string): Campaign | null {
  const source = campaigns.find((campaign) => campaign.id === id);
  if (!source) return null;

  const now = Date.now();
  const copy: Campaign = {
    id: crypto.randomUUID(),
    name: `${source.name} Copy`,
    scenes: source.scenes.map((scene) => ({
      ...scene,
      id: crypto.randomUUID(),
      grid: scene.grid ? { ...scene.grid } : null,
      tokens: scene.tokens.map((token) => ({
        ...token,
        id: crypto.randomUUID(),
        cell: token.cell ? { ...token.cell } : null,
      })),
    })),
    createdAt: now,
    updatedAt: now,
  };

  campaigns.push(copy);
  return structuredClone(copy);
}
