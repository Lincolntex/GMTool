import crypto from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import { isGmFromCookieHeader } from './auth';
import {
  createGmToken,
  deleteToken,
  findParticipantBySocket,
  findParticipantByToken,
  getActiveRoom,
  placeToken,
  publicRoom,
  publicParticipants,
  publicTokens,
  renameToken,
  setGridVisible,
  setTokenHidden,
  unplaceToken,
  type Room,
  type TokenActor,
} from './rooms';
import type { PointerInfo, SocketAck } from '../src/shared/types';

interface JoinPayload {
  roomId?: unknown;
  role?: unknown;
  participantToken?: unknown;
}

interface PointPayload {
  x?: unknown;
  y?: unknown;
}

interface TokenCreatePayload {
  kind?: unknown;
  name?: unknown;
}

interface TokenPlacePayload {
  tokenId?: unknown;
  col?: unknown;
  row?: unknown;
}

interface TokenUnplacePayload {
  tokenId?: unknown;
}

interface TokenRenamePayload {
  tokenId?: unknown;
  name?: unknown;
}

interface TokenDeletePayload {
  tokenId?: unknown;
}

interface TokenHidePayload {
  tokenId?: unknown;
  hidden?: unknown;
}

interface GridTogglePayload {
  visible?: unknown;
}

type Ack = (response: SocketAck) => void;

function reply(ack: unknown, response: SocketAck): void {
  if (typeof ack === 'function') ack(response);
}

function tokenActor(socket: Socket, room: Room): TokenActor | null {
  if (socket.data.role === 'gm') {
    return { role: 'gm', participantId: 'gm' };
  }
  const participant = findParticipantBySocket(room, socket.id);
  if (!participant) return null;
  return { role: 'player', participantId: participant.id };
}

function sendRoomError(socket: Socket, message: string): void {
  socket.emit('room:error', message);
}

function currentRoom(socket: Socket): Room | null {
  const room = getActiveRoom();
  if (!room || room.ended || socket.data.roomId !== room.id) return null;
  return room;
}

function pointerIdentity(socket: Socket, room: Room): PointerInfo | null {
  if (socket.data.role === 'gm') {
    return {
      participantId: 'gm',
      name: 'GM',
      color: '#cfd6df',
      shape: 'triangle-down',
      x: 0,
      y: 0,
    };
  }

  const participant = findParticipantBySocket(room, socket.id);
  if (!participant) return null;
  return {
    participantId: participant.id,
    name: participant.name,
    color: participant.color,
    shape: participant.shape,
    x: 0,
    y: 0,
  };
}

function readPoint(payload: PointPayload): { x: number; y: number } | null {
  const x = Number(payload?.x);
  const y = Number(payload?.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function broadcastPresence(io: Server, room: Room): void {
  io.to(room.id).emit('participants:update', {
    participants: publicParticipants(room),
    gmConnected: Boolean(room.gmSocketId),
  });
}

function emitRoomState(
  socket: Socket,
  room: Room,
  options: { pin?: string; participantId?: string } = {},
): void {
  socket.emit('room:state', {
    room: publicRoom(room),
    pointers: Object.fromEntries(room.pointers),
    ...(options.pin ? { pin: options.pin } : {}),
    ...(options.participantId ? { participantId: options.participantId } : {}),
  });
}

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket) => {
    socket.on('room:join', (payload: JoinPayload) => {
      const room = getActiveRoom();
      const roomId = typeof payload?.roomId === 'string' ? payload.roomId : '';
      if (!room || room.id !== roomId || room.ended) {
        sendRoomError(socket, 'Session not found or already ended.');
        return;
      }

      if (payload?.role === 'gm') {
        if (!isGmFromCookieHeader(socket.handshake.headers.cookie)) {
          sendRoomError(socket, 'GM login required.');
          return;
        }

        room.gmSocketId = socket.id;
        socket.data.roomId = room.id;
        socket.data.role = 'gm';
        socket.data.participantId = 'gm';
        void socket.join(room.id);
        emitRoomState(socket, room, { pin: room.pin });
        broadcastPresence(io, room);
        return;
      }

      const participantToken =
        typeof payload?.participantToken === 'string' ? payload.participantToken : undefined;
      const participant = findParticipantByToken(room, participantToken);
      if (!participant) {
        sendRoomError(socket, 'Your session identity is no longer valid. Rejoin from the link.');
        return;
      }

      participant.socketId = socket.id;
      socket.data.roomId = room.id;
      socket.data.role = 'player';
      socket.data.participantId = participant.id;
      void socket.join(room.id);
      emitRoomState(socket, room, { participantId: participant.id });
      broadcastPresence(io, room);
    });

    socket.on('token:create', (payload: TokenCreatePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      if (!room) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }
      if (socket.data.role !== 'gm') {
        reply(ack, { ok: false, error: 'Only the GM can add tokens.' });
        return;
      }

      const kind = payload?.kind;
      if (kind !== 'enemy' && kind !== 'npc') {
        reply(ack, { ok: false, error: 'Unknown token type.' });
        return;
      }

      try {
        const token = createGmToken(room, kind, payload?.name);
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true, token });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not add token.',
        });
      }
    });

    socket.on('token:place', (payload: TokenPlacePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      const actor = room ? tokenActor(socket, room) : null;
      if (!room || !actor) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }

      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : '';
      const col = Number(payload?.col);
      const row = Number(payload?.row);

      try {
        placeToken(room, actor, tokenId, { col, row });
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not move token.',
        });
      }
    });

    socket.on('token:unplace', (payload: TokenUnplacePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      const actor = room ? tokenActor(socket, room) : null;
      if (!room || !actor) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }

      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : '';
      try {
        unplaceToken(room, actor, tokenId);
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not remove token.',
        });
      }
    });

    socket.on('token:rename', (payload: TokenRenamePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      const actor = room ? tokenActor(socket, room) : null;
      if (!room || !actor) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }

      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : '';
      try {
        const token = renameToken(room, actor, tokenId, payload?.name);
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true, token });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not rename token.',
        });
      }
    });

    socket.on('token:delete', (payload: TokenDeletePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      const actor = room ? tokenActor(socket, room) : null;
      if (!room || !actor) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }

      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : '';
      try {
        deleteToken(room, actor, tokenId);
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not delete token.',
        });
      }
    });

    socket.on('token:hide', (payload: TokenHidePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      const actor = room ? tokenActor(socket, room) : null;
      if (!room || !actor) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }

      const tokenId = typeof payload?.tokenId === 'string' ? payload.tokenId : '';
      try {
        const token = setTokenHidden(room, actor, tokenId, payload?.hidden);
        io.to(room.id).emit('tokens:changed', publicTokens(room));
        reply(ack, { ok: true, token });
      } catch (error) {
        reply(ack, {
          ok: false,
          error: error instanceof Error ? error.message : 'Could not change token visibility.',
        });
      }
    });

    socket.on('grid:toggle', (payload: GridTogglePayload, ack?: Ack) => {
      const room = currentRoom(socket);
      if (!room) {
        reply(ack, { ok: false, error: 'Session not found or already ended.' });
        return;
      }
      if (socket.data.role !== 'gm') {
        reply(ack, { ok: false, error: 'Only the GM can change the grid.' });
        return;
      }

      const visible = Boolean(payload?.visible);
      setGridVisible(room, visible);
      io.to(room.id).emit('grid:changed', { visible });
      reply(ack, { ok: true });
    });

    socket.on('pointer:move', (payload: PointPayload) => {
      const room = currentRoom(socket);
      if (!room) return;
      const point = readPoint(payload);
      const identity = pointerIdentity(socket, room);
      if (!point || !identity) return;

      const pointer: PointerInfo = { ...identity, ...point };
      room.pointers.set(pointer.participantId, pointer);
      io.to(room.id).emit('pointer:update', pointer);
    });

    socket.on('pointer:end', () => {
      const room = currentRoom(socket);
      if (!room) return;
      const identity = pointerIdentity(socket, room);
      if (!identity) return;
      room.pointers.delete(identity.participantId);
      io.to(room.id).emit('pointer:end', { participantId: identity.participantId });
    });

    socket.on('pointer:ping', (payload: PointPayload) => {
      const room = currentRoom(socket);
      if (!room) return;
      const point = readPoint(payload);
      const identity = pointerIdentity(socket, room);
      if (!point || !identity) return;

      io.to(room.id).emit('pointer:ping', {
        ...identity,
        ...point,
        id: crypto.randomUUID(),
      });
    });

    socket.on('disconnect', () => {
      const room = currentRoom(socket);
      if (!room) return;

      if (room.gmSocketId === socket.id) {
        room.gmSocketId = null;
        room.pointers.delete('gm');
        io.to(room.id).emit('pointer:end', { participantId: 'gm' });
        broadcastPresence(io, room);
        return;
      }

      const participant = findParticipantBySocket(room, socket.id);
      if (!participant) return;

      participant.socketId = null;
      room.pointers.delete(participant.id);
      io.to(room.id).emit('pointer:end', { participantId: participant.id });
      broadcastPresence(io, room);
    });
  });
}
