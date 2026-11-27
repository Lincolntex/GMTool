import crypto from 'node:crypto';
import { asc, desc, eq, inArray, sql } from 'drizzle-orm';
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
import { db, type Transaction } from './db/client';
import {
  campaignScenes,
  campaignTokens,
  campaigns,
} from './db/schema';

const PRESETS: PresetId[] = ['snow', 'grass', 'dungeon'];
const MAX_SCENES = 50;

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
      label: cleanText(
        candidate.label,
        candidate.kind === 'enemy' ? 'Enemy' : 'NPC',
        24,
      ),
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
    id:
      typeof scene.id === 'string' && scene.id
        ? scene.id
        : crypto.randomUUID(),
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

async function insertSceneTree(
  tx: Transaction,
  campaignId: string,
  scenes: CampaignScene[],
): Promise<void> {
  const sceneRows = scenes.map((scene, index) => ({
    id: scene.id,
    campaignId,
    position: index,
    title: scene.title,
    background: scene.background,
    grid: scene.grid,
  }));

  if (sceneRows.length === 0) return;
  await tx.insert(campaignScenes).values(sceneRows);

  const tokenRows = scenes.flatMap((scene) =>
    scene.tokens.map((token, index) => ({
      id: token.id,
      sceneId: scene.id,
      position: index,
      kind: token.kind,
      label: token.label,
      color: token.color,
      shape: token.shape,
      cellCol: token.cell?.col ?? null,
      cellRow: token.cell?.row ?? null,
      hidden: token.hidden,
    })),
  );

  if (tokenRows.length > 0) {
    await tx.insert(campaignTokens).values(tokenRows);
  }
}

async function loadCampaign(id: string): Promise<Campaign | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);

  if (!row) return null;

  const sceneRows = await db
    .select()
    .from(campaignScenes)
    .where(eq(campaignScenes.campaignId, id))
    .orderBy(asc(campaignScenes.position));

  const sceneIds = sceneRows.map((scene) => scene.id);
  const tokenRows =
    sceneIds.length > 0
      ? await db
          .select()
          .from(campaignTokens)
          .where(inArray(campaignTokens.sceneId, sceneIds))
          .orderBy(asc(campaignTokens.position))
      : [];

  const tokensByScene = new Map<string, TokenInfo[]>();
  for (const token of tokenRows) {
    const list = tokensByScene.get(token.sceneId) ?? [];
    list.push({
      id: token.id,
      kind: token.kind,
      label: token.label,
      color: token.color,
      shape: token.shape,
      ownerId: null,
      cell:
        token.cellCol === null || token.cellRow === null
          ? null
          : { col: token.cellCol, row: token.cellRow },
      hidden: token.hidden,
    });
    tokensByScene.set(token.sceneId, list);
  }

  return {
    id: row.id,
    name: row.name,
    scenes: sceneRows.map((scene) => ({
      id: scene.id,
      title: scene.title,
      background: scene.background,
      grid: scene.grid,
      tokens: tokensByScene.get(scene.id) ?? [],
    })),
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

export async function listCampaigns(): Promise<CampaignSummary[]> {
  const rows = await db
    .select({
      id: campaigns.id,
      name: campaigns.name,
      sceneCount: sql<number>`count(${campaignScenes.id})::int`,
      updatedAt: campaigns.updatedAt,
    })
    .from(campaigns)
    .leftJoin(campaignScenes, eq(campaignScenes.campaignId, campaigns.id))
    .groupBy(campaigns.id, campaigns.name, campaigns.updatedAt)
    .orderBy(desc(campaigns.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    sceneCount: Number(row.sceneCount),
    updatedAt: row.updatedAt.getTime(),
  }));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  return loadCampaign(id);
}

export async function createCampaign(input: unknown): Promise<Campaign> {
  const cleaned = cleanInput(input);
  const id = crypto.randomUUID();
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id,
      name: cleaned.name,
      createdAt: now,
      updatedAt: now,
    });
    await insertSceneTree(tx, id, cleaned.scenes);
  });

  const campaign = await loadCampaign(id);
  if (!campaign) throw new Error('Campaign could not be loaded after creation.');
  return campaign;
}

export async function updateCampaign(
  id: string,
  input: unknown,
): Promise<Campaign | null> {
  const cleaned = cleanInput(input);
  const now = new Date();

  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: campaigns.id })
      .from(campaigns)
      .where(eq(campaigns.id, id))
      .for('update');

    if (!existing) return false;

    await tx
      .update(campaigns)
      .set({ name: cleaned.name, updatedAt: now })
      .where(eq(campaigns.id, id));

    await tx.delete(campaignScenes).where(eq(campaignScenes.campaignId, id));
    await insertSceneTree(tx, id, cleaned.scenes);
    return true;
  });

  if (!updated) return null;
  return loadCampaign(id);
}

export async function deleteCampaign(id: string): Promise<boolean> {
  const deleted = await db
    .delete(campaigns)
    .where(eq(campaigns.id, id))
    .returning({ id: campaigns.id });
  return deleted.length > 0;
}

export async function copyCampaign(id: string): Promise<Campaign | null> {
  const source = await loadCampaign(id);
  if (!source) return null;

  const copyId = crypto.randomUUID();
  const now = new Date();
  const scenes = source.scenes.map((scene) => ({
    ...scene,
    id: crypto.randomUUID(),
    grid: scene.grid ? { ...scene.grid } : null,
    tokens: scene.tokens.map((token) => ({
      ...token,
      id: crypto.randomUUID(),
      cell: token.cell ? { ...token.cell } : null,
    })),
  }));

  await db.transaction(async (tx) => {
    await tx.insert(campaigns).values({
      id: copyId,
      name: `${source.name} Copy`,
      createdAt: now,
      updatedAt: now,
    });
    await insertSceneTree(tx, copyId, scenes);
  });

  return loadCampaign(copyId);
}
