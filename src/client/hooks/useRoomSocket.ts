import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type {
  ParticipantsUpdate,
  PingInfo,
  PointerInfo,
  PublicRoom,
  Role,
  RoomState,
  SocketAck,
  TokenInfo,
} from '../../shared/types';

interface UseRoomSocketOptions {
  roomId: string | null;
  role: Role;
  participantToken?: string;
  initialRoom?: PublicRoom | null;
}

export function useRoomSocket({
  roomId,
  role,
  participantToken,
  initialRoom,
}: UseRoomSocketOptions) {
  const [room, setRoom] = useState<PublicRoom | null>(initialRoom ?? null);
  const [pointers, setPointers] = useState<Record<string, PointerInfo>>({});
  const [pings, setPings] = useState<PingInfo[]>([]);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [selfId, setSelfId] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    setRoom(initialRoom ?? null);
    setPointers({});
    setPings([]);
    setEnded(false);
    setError(null);
    setSelfId(null);
    // The room identity is the reset boundary. The initial room is set by its parent.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;

    const nextSocket = io({
      path: '/socket.io',
      withCredentials: true,
      transports: ['websocket', 'polling'],
    });
    setSocket(nextSocket);

    const handleConnect = () => {
      setConnected(true);
      setError(null);
      nextSocket.emit(
        'room:join',
        role === 'gm'
          ? { roomId, role: 'gm' }
          : { roomId, role: 'player', participantToken },
      );
    };

    const handleDisconnect = () => {
      setConnected(false);
    };

    const handleRoomState = (payload: RoomState) => {
      setRoom(payload.room);
      setPointers(payload.pointers ?? {});
      setSelfId(payload.participantId ?? null);
      setEnded(false);
      setError(null);
    };

    const handleTokensChanged = (tokens: TokenInfo[]) => {
      setRoom((previous) => (previous ? { ...previous, tokens } : previous));
    };

    const handleGridChanged = ({ visible }: { visible: boolean }) => {
      setRoom((previous) => (previous ? { ...previous, gridVisible: visible } : previous));
    };

    const handleParticipants = (payload: ParticipantsUpdate) => {
      setRoom((previous) =>
        previous
          ? {
              ...previous,
              participants: payload.participants,
              gmConnected: payload.gmConnected,
            }
          : previous,
      );
    };

    const handlePointer = (pointer: PointerInfo) => {
      setPointers((previous) => ({ ...previous, [pointer.participantId]: pointer }));
    };

    const handlePointerEnd = ({ participantId }: { participantId: string }) => {
      setPointers((previous) => {
        const next = { ...previous };
        delete next[participantId];
        return next;
      });
    };

    const handlePing = (ping: PingInfo) => {
      setPings((previous) => [...previous.slice(-19), ping]);
      const timer = window.setTimeout(() => {
        setPings((previous) => previous.filter((item) => item.id !== ping.id));
      }, 1400);
      timers.current.push(timer);
    };

    const handleSceneChanged = (nextRoom: PublicRoom) => {
      setRoom(nextRoom);
      setPointers({});
      setPings([]);
    };

    const handleEnded = () => {
      setEnded(true);
      setConnected(false);
      nextSocket.disconnect();
    };

    const handleRoomError = (message: string) => {
      setError(message);
    };

    const handleConnectError = (connectError: Error) => {
      setError(connectError.message || 'Unable to connect to the session.');
    };

    nextSocket.on('connect', handleConnect);
    nextSocket.on('disconnect', handleDisconnect);
    nextSocket.on('room:state', handleRoomState);
    nextSocket.on('participants:update', handleParticipants);
    nextSocket.on('pointer:update', handlePointer);
    nextSocket.on('pointer:end', handlePointerEnd);
    nextSocket.on('pointer:ping', handlePing);
    nextSocket.on('tokens:changed', handleTokensChanged);
    nextSocket.on('grid:changed', handleGridChanged);
    nextSocket.on('scene:changed', handleSceneChanged);
    nextSocket.on('session:ended', handleEnded);
    nextSocket.on('room:error', handleRoomError);
    nextSocket.on('connect_error', handleConnectError);

    return () => {
      for (const timer of timers.current) window.clearTimeout(timer);
      timers.current = [];
      nextSocket.disconnect();
      setSocket(null);
    };
  }, [roomId, role, participantToken]);

  const request = useCallback(
    (event: string, payload: unknown): Promise<SocketAck> =>
      new Promise((resolve) => {
        if (!socket || !socket.connected) {
          resolve({ ok: false, error: 'Not connected to the session.' });
          return;
        }
        socket.emit(event, payload, (response: SocketAck) => {
          resolve(response ?? { ok: false, error: 'The table did not respond.' });
        });
      }),
    [socket],
  );

  return { room, pointers, pings, connected, ended, error, socket, selfId, request };
}
