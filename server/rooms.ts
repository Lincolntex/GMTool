import crypto from 'node:crypto';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type {
  PlayerShape,
  PointerInfo,
  PublicParticipant,
  PublicRoom,
  SceneInfo,
  TokenCell,
  TokenInfo,
} from '../src/shared/types';
import { gridGeometry } from '../src/shared/grid';
import { GM_TOKEN_COLORS, gmTokenShape, isPlayerShape } from '../src/shared/shapes';
import { db, type Transaction } from './db/client';
import {
  roomParticipants,
  roomScenes,
  roomTokens,
  rooms,
} from './db/schema';

export interface ServerParticipant {
  id: string;
  tokenHash: string;
  name: string;
  color: string;
  shape: PlayerShape;
  socketId: string | null;
  joinedAt: number;
}

export interface RoomScene extends SceneInfo {
  id: string;
  position: number;
  tokens: TokenInfo[];
}

export interface Room {
  id: string;
  campaignId: string | null;
  title: string;
  pin: string;
  scenes: RoomScene[];
  activeSceneIndex: number;
  gridVisible: boolean;
  participants: Map<string, ServerParticipant>;
  pointers: Map<string, PointerInfo>;
  gmSocketId: string | null;
  createdAt: number;
  ended: boolean;
}

export interface RoomSceneInput extends SceneInfo {
  tokens?: TokenInfo[];
}

export interface TokenActor {
  role: 'gm' | 'player';
  participantId: string;
}

const MAX_PARTICIPANTS = 16;
const RESERVED_COLORS = new Set(['#cfd6df', '#ffffff']);

let activeRoom: Room | null = null;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function randomPin(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function activeScene(room: Room): RoomScene {
  const scene = room.scenes[room.activeSceneIndex];
  if (!scene) throw new Error('This session has no active scene.');
  return scene;
}

function canControlToken(actor: TokenActor, token: TokenInfo): boolean {
  if (actor.role === 'gm') return true;
  return token.kind === 'player' && token.ownerId === actor.participantId;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === '23505'
  );
}

function mapRoomToken(row: typeof roomTokens.$inferSelect): TokenInfo {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    color: row.color,
    shape: row.shape,
    ownerId: row.ownerParticipantId,
    cell:
      row.cellCol === null || row.cellRow === null
        ? null
        : { col: row.cellCol, row: row.cellRow },
    hidden: row.hidden,
  };
}

function mapParticipant(
  row: typeof roomParticipants.$inferSelect,
): ServerParticipant {
  return {
    id: row.id,
    tokenHash: row.tokenHash,
    name: row.name,
    color: row.color,
    shape: row.shape,
    socketId: null,
    joinedAt: row.joinedAt.getTime(),
  };
}

async function lockRoom(tx: Transaction, roomId: string): Promise<void> {
  const [row] = await tx
    .select({ id: rooms.id })
    .from(rooms)
    .where(and(eq(rooms.id, roomId), eq(rooms.status, 'active')))
    .for('update');

  if (!row) throw new Error('Session not found or already ended.');
}

async function nextTokenPosition(
  tx: Transaction,
  sceneId: string,
): Promise<number> {
  const [row] = await tx
    .select({
      max: sql<number>`coalesce(max(${roomTokens.position}), -1)::int`,
    })
    .from(roomTokens)
    .where(eq(roomTokens.sceneId, sceneId));

  return Number(row?.max ?? -1) + 1;
}

async function loadRoomAggregate(
  row: typeof rooms.$inferSelect,
): Promise<Room> {
  const sceneRows = await db
    .select()
    .from(roomScenes)
    .where(eq(roomScenes.roomId, row.id))
    .orderBy(asc(roomScenes.position));

  const sceneIds = sceneRows.map((scene) => scene.id);
  const tokenRows =
    sceneIds.length > 0
      ? await db
          .select()
          .from(roomTokens)
          .where(inArray(roomTokens.sceneId, sceneIds))
          .orderBy(asc(roomTokens.position))
      : [];

  const participantRows = await db
    .select()
    .from(roomParticipants)
    .where(eq(roomParticipants.roomId, row.id))
    .orderBy(asc(roomParticipants.joinedAt));

  const tokensByScene = new Map<string, TokenInfo[]>();
  for (const token of tokenRows) {
    const list = tokensByScene.get(token.sceneId) ?? [];
    list.push(mapRoomToken(token));
    tokensByScene.set(token.sceneId, list);
  }

  const scenes = sceneRows.map((scene) => ({
    id: scene.id,
    position: scene.position,
    title: scene.title,
    background: scene.background,
    grid: scene.grid,
    tokens: tokensByScene.get(scene.id) ?? [],
  }));

  const participants = new Map<string, ServerParticipant>();
  for (const participant of participantRows) {
    participants.set(participant.id, mapParticipant(participant));
  }

  return {
    id: row.id,
    campaignId: row.campaignId,
    title: row.title,
    pin: row.pin,
    scenes,
    activeSceneIndex:
      scenes.length === 0
        ? 0
        : Math.min(Math.max(0, row.activeSceneIndex), scenes.length - 1),
    gridVisible: row.gridVisible,
    participants,
    pointers: new Map(),
    gmSocketId: null,
    createdAt: row.createdAt.getTime(),
    ended: row.status === 'ended',
  };
}

export async function hydrateActiveRoom(): Promise<void> {
  const [row] = await db
    .select()
    .from(rooms)
    .where(eq(rooms.status, 'active'))
    .limit(1);

  activeRoom = row ? await loadRoomAggregate(row) : null;
}

export function getActiveRoom(): Room | null {
  return activeRoom;
}

export async function createRoom(input: {
  title: string;
  scenes: RoomSceneInput[];
  campaignId?: string | null;
}): Promise<Room> {
  if (input.scenes.length === 0) {
    throw new Error('A room needs at least one scene.');
  }

  const previous = activeRoom;
  const roomId = crypto.randomUUID();
  const pin = randomPin();
  const now = new Date();

  const sceneRows = input.scenes.map((scene, index) => ({
    id: crypto.randomUUID(),
    roomId,
    position: index,
    title: scene.title,
    background: scene.background,
    grid: scene.grid ? { ...scene.grid } : null,
  }));

  const tokenRows = input.scenes.flatMap((scene, sceneIndex) =>
    (scene.tokens ?? []).map((token, index) => ({
      id: crypto.randomUUID(),
      sceneId: sceneRows[sceneIndex]!.id,
      position: index,
      kind: token.kind,
      label: token.label,
      color: token.color,
      shape: token.shape,
      ownerParticipantId: null,
      cellCol: token.cell?.col ?? null,
      cellRow: token.cell?.row ?? null,
      hidden: token.hidden,
    })),
  );

  await db.transaction(async (tx) => {
    await tx
      .update(rooms)
      .set({ status: 'ended', endedAt: now })
      .where(eq(rooms.status, 'active'));

    await tx.insert(rooms).values({
      id: roomId,
      campaignId: input.campaignId ?? null,
      title: input.title,
      pin,
      status: 'active',
      activeSceneIndex: 0,
      gridVisible: false,
      createdAt: now,
      endedAt: null,
    });

    if (sceneRows.length > 0) {
      await tx.insert(roomScenes).values(sceneRows);
    }
    if (tokenRows.length > 0) {
      await tx.insert(roomTokens).values(tokenRows);
    }
  });

  if (previous) previous.ended = true;
  await hydrateActiveRoom();

  if (!activeRoom || activeRoom.id !== roomId) {
    throw new Error('Session could not be loaded after launch.');
  }
  return activeRoom;
}

async function switchScene(room: Room, index: number): Promise<void> {
  if (!Number.isInteger(index) || index < 0 || index >= room.scenes.length) {
    throw new Error('Invalid scene index.');
  }

  const scene = room.scenes[index];
  if (!scene) throw new Error('Invalid scene index.');

  const inserted: TokenInfo[] = [];

  await db.transaction(async (tx) => {
    await lockRoom(tx, room.id);
    await tx
      .update(rooms)
      .set({ activeSceneIndex: index })
      .where(eq(rooms.id, room.id));

    const existingRows = await tx
      .select({ ownerId: roomTokens.ownerParticipantId })
      .from(roomTokens)
      .where(
        and(
          eq(roomTokens.sceneId, scene.id),
          eq(roomTokens.kind, 'player'),
        ),
      );

    const existingOwners = new Set(
      existingRows
        .map((row) => row.ownerId)
        .filter((ownerId): ownerId is string => Boolean(ownerId)),
    );

    let position = await nextTokenPosition(tx, scene.id);
    const rows: Array<typeof roomTokens.$inferInsert> = [];

    for (const participant of room.participants.values()) {
      if (existingOwners.has(participant.id)) continue;

      const token: TokenInfo = {
        id: crypto.randomUUID(),
        kind: 'player',
        label: participant.name,
        color: participant.color,
        shape: participant.shape,
        ownerId: participant.id,
        cell: null,
        hidden: false,
      };

      inserted.push(token);
      rows.push({
        id: token.id,
        sceneId: scene.id,
        position: position++,
        kind: 'player',
        label: token.label,
        color: token.color,
        shape: token.shape,
        ownerParticipantId: participant.id,
        cellCol: null,
        cellRow: null,
        hidden: false,
      });
    }

    if (rows.length > 0) {
      await tx.insert(roomTokens).values(rows);
    }
  });

  room.activeSceneIndex = index;
  scene.tokens.push(...inserted);
}

export async function changeRoomScene(
  room: Room,
  direction: 'prev' | 'next',
): Promise<void> {
  const next =
    direction === 'next' ? room.activeSceneIndex + 1 : room.activeSceneIndex - 1;
  const index = Math.min(room.scenes.length - 1, Math.max(0, next));
  await switchScene(room, index);
}

export async function setRoomScene(room: Room, index: number): Promise<void> {
  await switchScene(room, index);
}

export async function endRoom(id: string): Promise<Room | null> {
  const ended = await db
    .update(rooms)
    .set({ status: 'ended', endedAt: new Date() })
    .where(and(eq(rooms.id, id), eq(rooms.status, 'active')))
    .returning({ id: rooms.id });

  if (ended.length === 0) return null;

  const room = activeRoom && activeRoom.id === id ? activeRoom : null;
  if (room) {
    room.ended = true;
    activeRoom = null;
  }
  return room;
}

export async function addParticipant(
  room: Room,
  name: string,
  color: string,
  shape: unknown,
): Promise<{ participant: ServerParticipant; token: string }> {
  const cleanName = name.trim().slice(0, 24);
  if (!cleanName) throw new Error('Display name is required.');
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Invalid marker color.');
  if (RESERVED_COLORS.has(color.toLowerCase())) {
    throw new Error('That color is reserved for the GM.');
  }
  if (!isPlayerShape(shape)) throw new Error('Choose a valid token shape.');
  if (room.participants.size >= MAX_PARTICIPANTS) {
    throw new Error('This session is full.');
  }

  const rawToken = crypto.randomBytes(32).toString('hex');
  const participant: ServerParticipant = {
    id: crypto.randomUUID(),
    tokenHash: hashToken(rawToken),
    name: cleanName,
    color,
    shape,
    socketId: null,
    joinedAt: Date.now(),
  };

  const scene = activeScene(room);
  const playerToken: TokenInfo = {
    id: crypto.randomUUID(),
    kind: 'player',
    label: participant.name,
    color: participant.color,
    shape: participant.shape,
    ownerId: participant.id,
    cell: null,
    hidden: false,
  };

  await db.transaction(async (tx) => {
    await lockRoom(tx, room.id);
    await tx.insert(roomParticipants).values({
      id: participant.id,
      roomId: room.id,
      tokenHash: participant.tokenHash,
      name: participant.name,
      color: participant.color,
      shape: participant.shape,
      joinedAt: new Date(participant.joinedAt),
    });

    const position = await nextTokenPosition(tx, scene.id);
    await tx.insert(roomTokens).values({
      id: playerToken.id,
      sceneId: scene.id,
      position,
      kind: 'player',
      label: playerToken.label,
      color: playerToken.color,
      shape: playerToken.shape,
      ownerParticipantId: participant.id,
      cellCol: null,
      cellRow: null,
      hidden: false,
    });
  });

  room.participants.set(participant.id, participant);
  scene.tokens.push(playerToken);
  return { participant, token: rawToken };
}

export function findParticipantByToken(
  room: Room,
  token: string | undefined,
): ServerParticipant | null {
  if (!token) return null;
  const tokenHash = hashToken(token);
  for (const participant of room.participants.values()) {
    if (safeEqual(participant.tokenHash, tokenHash)) return participant;
  }
  return null;
}

export function findParticipantBySocket(
  room: Room,
  socketId: string,
): ServerParticipant | null {
  for (const participant of room.participants.values()) {
    if (participant.socketId === socketId) return participant;
  }
  return null;
}

export function publicParticipants(room: Room): PublicParticipant[] {
  return [...room.participants.values()]
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map((participant) => ({
      id: participant.id,
      name: participant.name,
      color: participant.color,
      shape: participant.shape,
      connected: Boolean(participant.socketId),
    }));
}

export function publicTokens(room: Room): TokenInfo[] {
  return activeScene(room).tokens.map((token) => ({
    ...token,
    cell: token.cell ? { ...token.cell } : null,
  }));
}

export async function createGmToken(
  room: Room,
  kind: 'enemy' | 'npc',
  name?: unknown,
): Promise<TokenInfo> {
  const scene = activeScene(room);
  if (!scene.grid) {
    throw new Error('Add a grid to this scene before placing tokens.');
  }

  const count =
    scene.tokens.filter((token) => token.kind === kind).length + 1;
  const cleanedName =
    typeof name === 'string' ? name.trim().slice(0, 24) : '';

  const token: TokenInfo = {
    id: crypto.randomUUID(),
    kind,
    label: cleanedName || `${kind === 'enemy' ? 'Enemy' : 'NPC'} ${count}`,
    color: GM_TOKEN_COLORS[kind],
    shape: gmTokenShape(kind),
    ownerId: null,
    cell: null,
    hidden: false,
  };

  await db.transaction(async (tx) => {
    await lockRoom(tx, room.id);
    const position = await nextTokenPosition(tx, scene.id);
    await tx.insert(roomTokens).values({
      id: token.id,
      sceneId: scene.id,
      position,
      kind: token.kind,
      label: token.label,
      color: token.color,
      shape: token.shape,
      ownerParticipantId: null,
      cellCol: null,
      cellRow: null,
      hidden: false,
    });
  });

  scene.tokens.push(token);
  return token;
}

export async function placeToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  cell: TokenCell,
): Promise<TokenInfo> {
  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (!canControlToken(actor, token)) {
    throw new Error('You cannot move that token.');
  }
  if (!scene.grid) {
    throw new Error('Add a grid to this scene before placing tokens.');
  }

  const geometry = gridGeometry(scene.grid, scene.grid.aspect ?? 16 / 9);
  if (!geometry) throw new Error('This scene has no valid grid.');

  if (!Number.isInteger(cell.col) || !Number.isInteger(cell.row)) {
    throw new Error('Invalid square.');
  }
  if (
    cell.col < 0 ||
    cell.col >= geometry.fullColumns ||
    cell.row < 0 ||
    cell.row >= geometry.fullRows
  ) {
    throw new Error('That square is outside the grid.');
  }

  try {
    await db.transaction(async (tx) => {
      await lockRoom(tx, room.id);
      const [row] = await tx
        .select()
        .from(roomTokens)
        .where(eq(roomTokens.id, tokenId))
        .for('update');

      if (!row || row.sceneId !== scene.id) {
        throw new Error('Token not found on this scene.');
      }

      const conditions = [
        eq(roomTokens.sceneId, scene.id),
        eq(roomTokens.cellCol, cell.col),
        eq(roomTokens.cellRow, cell.row),
        ne(roomTokens.id, tokenId),
      ];
      if (row.kind === 'player') {
        conditions.push(eq(roomTokens.hidden, false));
      }

      const [occupied] = await tx
        .select({ id: roomTokens.id })
        .from(roomTokens)
        .where(and(...conditions))
        .limit(1);

      if (occupied) throw new Error('That square is already occupied.');

      await tx
        .update(roomTokens)
        .set({ cellCol: cell.col, cellRow: cell.row })
        .where(eq(roomTokens.id, tokenId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('That square is already occupied.');
    }
    throw error;
  }

  token.cell = { col: cell.col, row: cell.row };
  return token;
}

export async function unplaceToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
): Promise<TokenInfo> {
  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (!canControlToken(actor, token)) {
    throw new Error('You cannot remove that token.');
  }

  await db
    .update(roomTokens)
    .set({ cellCol: null, cellRow: null })
    .where(eq(roomTokens.id, tokenId));

  token.cell = null;
  return token;
}

export async function renameToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  name: unknown,
): Promise<TokenInfo> {
  if (actor.role !== 'gm') throw new Error('Only the GM can rename tokens.');

  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');

  const cleanedName = typeof name === 'string' ? name.trim().slice(0, 24) : '';
  if (!cleanedName) throw new Error('Token name is required.');

  await db
    .update(roomTokens)
    .set({ label: cleanedName })
    .where(eq(roomTokens.id, tokenId));

  token.label = cleanedName;
  return token;
}

export async function deleteToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
): Promise<TokenInfo> {
  if (actor.role !== 'gm') throw new Error('Only the GM can delete tokens.');

  const scene = activeScene(room);
  const index = scene.tokens.findIndex((candidate) => candidate.id === tokenId);
  if (index === -1) throw new Error('Token not found on this scene.');

  await db.delete(roomTokens).where(eq(roomTokens.id, tokenId));
  const [removed] = scene.tokens.splice(index, 1);
  return removed!;
}

function findFreeCellForPlayer(
  scene: RoomScene,
  from: TokenCell,
  movingId: string,
): TokenCell | null {
  const geometry = gridGeometry(scene.grid, scene.grid?.aspect ?? 16 / 9);
  if (!geometry) return null;
  const { fullColumns, fullRows } = geometry;

  function isFree(col: number, row: number): boolean {
    if (col < 0 || col >= fullColumns || row < 0 || row >= fullRows) {
      return false;
    }
    return !scene.tokens.some(
      (token) =>
        token.id !== movingId &&
        token.cell?.col === col &&
        token.cell?.row === row &&
        !token.hidden,
    );
  }

  const maxRadius = Math.max(fullColumns, fullRows);
  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const col = from.col + dx;
        const row = from.row + dy;
        if (isFree(col, row)) return { col, row };
      }
    }
  }
  return null;
}

export async function setTokenHidden(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  hidden: unknown,
): Promise<TokenInfo> {
  if (actor.role !== 'gm') throw new Error('Only the GM can hide tokens.');

  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (token.kind === 'player') {
    throw new Error('Player tokens cannot be hidden.');
  }

  const nextHidden = Boolean(hidden);
  const moves: Array<{ id: string; cell: TokenCell | null }> = [];

  try {
    await db.transaction(async (tx) => {
      await lockRoom(tx, room.id);
      const [row] = await tx
        .select()
        .from(roomTokens)
        .where(eq(roomTokens.id, tokenId))
        .for('update');

      if (!row || row.sceneId !== scene.id) {
        throw new Error('Token not found on this scene.');
      }

      if (row.hidden && !nextHidden && row.cellCol !== null && row.cellRow !== null) {
        const revealedCell = { col: row.cellCol, row: row.cellRow };
        const tokenRows = await tx
          .select()
          .from(roomTokens)
          .where(eq(roomTokens.sceneId, scene.id))
          .orderBy(asc(roomTokens.position));

        const workingTokens = tokenRows.map(mapRoomToken);
        const workingScene: RoomScene = { ...scene, tokens: workingTokens };
        const occupants = workingTokens.filter(
          (candidate) =>
            candidate.kind === 'player' &&
            candidate.cell?.col === revealedCell.col &&
            candidate.cell?.row === revealedCell.row,
        );

        for (const occupant of occupants) {
          const freeCell = findFreeCellForPlayer(
            workingScene,
            revealedCell,
            occupant.id,
          );
          occupant.cell = freeCell;
          moves.push({ id: occupant.id, cell: freeCell });
          await tx
            .update(roomTokens)
            .set({
              cellCol: freeCell?.col ?? null,
              cellRow: freeCell?.row ?? null,
            })
            .where(eq(roomTokens.id, occupant.id));
        }
      }

      await tx
        .update(roomTokens)
        .set({ hidden: nextHidden })
        .where(eq(roomTokens.id, tokenId));
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error('Could not reveal that token because the square is occupied.');
    }
    throw error;
  }

  token.hidden = nextHidden;
  for (const move of moves) {
    const cached = scene.tokens.find((candidate) => candidate.id === move.id);
    if (cached) cached.cell = move.cell;
  }
  return token;
}

export async function setGridVisible(room: Room, visible: boolean): Promise<void> {
  await db.update(rooms).set({ gridVisible: visible }).where(eq(rooms.id, room.id));
  room.gridVisible = visible;
}

export function publicRoom(room: Room): PublicRoom {
  const scene = activeScene(room);
  const sceneInfo: SceneInfo = {
    title: scene.title,
    background: scene.background,
    grid: scene.grid ? { ...scene.grid } : null,
  };

  return {
    id: room.id,
    title: room.title,
    scene: sceneInfo,
    sceneList: room.scenes.map((entry) => ({
      title: entry.title,
      hasGrid: Boolean(entry.grid),
    })),
    sceneCount: room.scenes.length,
    activeSceneIndex: room.activeSceneIndex,
    gridVisible: room.gridVisible,
    tokens: publicTokens(room),
    participants: publicParticipants(room),
    gmConnected: Boolean(room.gmSocketId),
    createdAt: room.createdAt,
  };
}
