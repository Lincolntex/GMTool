import crypto from 'node:crypto';
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

export interface ServerParticipant {
  id: string;
  token: string;
  name: string;
  color: string;
  shape: PlayerShape;
  socketId: string | null;
  joinedAt: number;
}

export interface RoomScene extends SceneInfo {
  tokens: TokenInfo[];
}

export interface Room {
  id: string;
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

function randomPin(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

function activeScene(room: Room): RoomScene {
  const scene = room.scenes[room.activeSceneIndex];
  if (!scene) throw new Error('This session has no active scene.');
  return scene;
}

function ensurePlayerToken(room: Room, participant: ServerParticipant): TokenInfo {
  const scene = activeScene(room);
  const existing = scene.tokens.find(
    (token) => token.kind === 'player' && token.ownerId === participant.id,
  );
  if (existing) return existing;

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
  scene.tokens.push(token);
  return token;
}

function ensureParticipantTokens(room: Room): void {
  for (const participant of room.participants.values()) {
    ensurePlayerToken(room, participant);
  }
}

function canControlToken(actor: TokenActor, token: TokenInfo): boolean {
  if (actor.role === 'gm') return true;
  return token.kind === 'player' && token.ownerId === actor.participantId;
}

export function getActiveRoom(): Room | null {
  return activeRoom;
}

export function createRoom(input: { title: string; scenes: RoomSceneInput[] }): Room {
  if (input.scenes.length === 0) throw new Error('A room needs at least one scene.');
  if (activeRoom) activeRoom.ended = true;

  const room: Room = {
    id: crypto.randomUUID(),
    title: input.title,
    pin: randomPin(),
    scenes: input.scenes.map((scene) => ({
      title: scene.title,
      background: scene.background,
      grid: scene.grid ? { ...scene.grid } : null,
      tokens: (scene.tokens ?? []).map((token) => ({
        ...token,
        cell: token.cell ? { ...token.cell } : null,
        hidden: token.hidden ?? false,
      })),
    })),
    activeSceneIndex: 0,
    gridVisible: false,
    participants: new Map(),
    pointers: new Map(),
    gmSocketId: null,
    createdAt: Date.now(),
    ended: false,
  };

  activeRoom = room;
  return room;
}

export function changeRoomScene(room: Room, direction: 'prev' | 'next'): void {
  const next =
    direction === 'next' ? room.activeSceneIndex + 1 : room.activeSceneIndex - 1;
  room.activeSceneIndex = Math.min(room.scenes.length - 1, Math.max(0, next));
  ensureParticipantTokens(room);
}

export function setRoomScene(room: Room, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= room.scenes.length) {
    throw new Error('Invalid scene index.');
  }
  room.activeSceneIndex = index;
  ensureParticipantTokens(room);
}

export function endRoom(id: string): Room | null {
  if (!activeRoom || activeRoom.id !== id) return null;
  activeRoom.ended = true;
  const room = activeRoom;
  activeRoom = null;
  return room;
}

export function addParticipant(
  room: Room,
  name: string,
  color: string,
  shape: unknown,
): { participant: ServerParticipant; token: string } {
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

  const token = crypto.randomBytes(32).toString('hex');
  const participant: ServerParticipant = {
    id: crypto.randomUUID(),
    token,
    name: cleanName,
    color,
    shape,
    socketId: null,
    joinedAt: Date.now(),
  };

  room.participants.set(participant.id, participant);
  ensurePlayerToken(room, participant);
  return { participant, token };
}

export function findParticipantByToken(room: Room, token: string | undefined): ServerParticipant | null {
  if (!token) return null;
  for (const participant of room.participants.values()) {
    if (participant.token === token) return participant;
  }
  return null;
}

export function findParticipantBySocket(room: Room, socketId: string): ServerParticipant | null {
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

export function createGmToken(
  room: Room,
  kind: 'enemy' | 'npc',
  name?: unknown,
): TokenInfo {
  const scene = activeScene(room);
  if (!scene.grid) throw new Error('Add a grid to this scene before placing tokens.');

  const count = scene.tokens.filter((token) => token.kind === kind).length + 1;
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
  scene.tokens.push(token);
  return token;
}

export function placeToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  cell: TokenCell,
): TokenInfo {
  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (!canControlToken(actor, token)) throw new Error('You cannot move that token.');
  if (!scene.grid) throw new Error('Add a grid to this scene before placing tokens.');

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

  const ignoreHidden = token.kind === 'player';
  const occupied = scene.tokens.some(
    (candidate) =>
      candidate.id !== token.id &&
      candidate.cell?.col === cell.col &&
      candidate.cell?.row === cell.row &&
      (!ignoreHidden || !candidate.hidden),
  );
  if (occupied) throw new Error('That square is already occupied.');

  token.cell = { col: cell.col, row: cell.row };
  return token;
}

export function unplaceToken(room: Room, actor: TokenActor, tokenId: string): TokenInfo {
  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (!canControlToken(actor, token)) throw new Error('You cannot remove that token.');
  token.cell = null;
  return token;
}

export function renameToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  name: unknown,
): TokenInfo {
  if (actor.role !== 'gm') throw new Error('Only the GM can rename tokens.');

  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');

  const cleanedName = typeof name === 'string' ? name.trim().slice(0, 24) : '';
  if (!cleanedName) throw new Error('Token name is required.');
  token.label = cleanedName;
  return token;
}

export function deleteToken(
  room: Room,
  actor: TokenActor,
  tokenId: string,
): TokenInfo {
  if (actor.role !== 'gm') throw new Error('Only the GM can delete tokens.');

  const scene = activeScene(room);
  const index = scene.tokens.findIndex((candidate) => candidate.id === tokenId);
  if (index === -1) throw new Error('Token not found on this scene.');
  const [removed] = scene.tokens.splice(index, 1);
  return removed;
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

export function setTokenHidden(
  room: Room,
  actor: TokenActor,
  tokenId: string,
  hidden: unknown,
): TokenInfo {
  if (actor.role !== 'gm') throw new Error('Only the GM can hide tokens.');

  const scene = activeScene(room);
  const token = scene.tokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error('Token not found on this scene.');
  if (token.kind === 'player') throw new Error('Player tokens cannot be hidden.');

  const wasHidden = token.hidden;
  token.hidden = Boolean(hidden);

  if (wasHidden && !token.hidden && token.cell) {
    const revealedCell = { ...token.cell };
    const occupants = scene.tokens.filter(
      (candidate) =>
        candidate.kind === 'player' &&
        candidate.cell?.col === revealedCell.col &&
        candidate.cell?.row === revealedCell.row,
    );
    for (const occupant of occupants) {
      occupant.cell = findFreeCellForPlayer(scene, revealedCell, occupant.id);
    }
  }

  return token;
}

export function setGridVisible(room: Room, visible: boolean): void {
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
