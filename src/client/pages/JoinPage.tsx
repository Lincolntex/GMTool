import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ShapeIcon } from '../components/ShapeIcon';
import { api } from '../lib/api';
import { getParticipantToken, setParticipantToken } from '../lib/storage';
import { PLAYER_SHAPES, PLAYER_SHAPE_LABELS } from '../../shared/shapes';
import type { PlayerShape, PublicRoom } from '../../shared/types';

const COLORS = [
  '#e05d5d',
  '#f2a65a',
  '#e8c547',
  '#6fcf97',
  '#56ccf2',
  '#9b7ede',
  '#f178b6',
  '#2dd4bf',
];

interface RoomResponse {
  room: PublicRoom;
}

interface JoinResponse {
  participantToken: string;
  room: PublicRoom;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function JoinPage() {
  const { roomId = '' } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<PublicRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [shape, setShape] = useState<PlayerShape>('circle');
  const [joining, setJoining] = useState(false);

  const existingToken = roomId ? getParticipantToken(roomId) : null;

  const loadRoom = useCallback(
    async (initial: boolean) => {
      if (!roomId) {
        if (initial) {
          setError('Missing session link.');
          setLoading(false);
        }
        return;
      }

      try {
        const response = await api<RoomResponse>(`/api/rooms/${roomId}`);
        setRoom(response.room);
      } catch (loadError) {
        if (initial) setError(errorMessage(loadError));
      } finally {
        if (initial) setLoading(false);
      }
    },
    [roomId],
  );

  useEffect(() => {
    void loadRoom(true);
    const timer = window.setInterval(() => void loadRoom(false), 4000);
    const handleFocus = () => void loadRoom(false);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadRoom]);

  const usedColors = new Set(
    room?.participants.map((participant) => participant.color.toLowerCase()) ?? [],
  );
  const usedShapes = new Set(
    room?.participants.map((participant) => participant.shape) ?? [],
  );
  const noColorAvailable = COLORS.every((option) =>
    usedColors.has(option.toLowerCase()),
  );
  const noShapeAvailable = PLAYER_SHAPES.every((option) => usedShapes.has(option));
  const noMarkerAvailable = noColorAvailable || noShapeAvailable;

  useEffect(() => {
    if (!room) return;
    const takenColors = new Set(
      room.participants.map((participant) => participant.color.toLowerCase()),
    );
    const takenShapes = new Set(
      room.participants.map((participant) => participant.shape),
    );

    setColor((current) =>
      takenColors.has(current.toLowerCase())
        ? COLORS.find((option) => !takenColors.has(option.toLowerCase())) ?? current
        : current,
    );
    setShape((current) =>
      takenShapes.has(current)
        ? PLAYER_SHAPES.find((option) => !takenShapes.has(option)) ?? current
        : current,
    );
  }, [room]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setJoining(true);
    setError(null);

    try {
      const response = await api<JoinResponse>(`/api/rooms/${roomId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin, name, color, shape }),
      });
      setParticipantToken(roomId, response.participantToken);
      navigate(`/session/${roomId}`, { replace: true });
    } catch (joinError) {
      setError(errorMessage(joinError));
      await loadRoom(false);
    } finally {
      setJoining(false);
    }
  }

  if (existingToken) {
    return <Navigate to={`/session/${roomId}`} replace />;
  }

  if (loading) {
    return (
      <main className="landing">
        <div className="card narrow centered">Looking for the session…</div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="landing">
        <div className="card narrow">
          <span className="eyebrow">Join</span>
          <h1>Session unavailable</h1>
          <p className="notice error">{error || 'This session is not active.'}</p>
          <Link className="button primary" to="/">
            Return home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="landing">
      <section className="card narrow">
        <span className="eyebrow">Join session</span>
        <h1>{room.title}</h1>
        <p className="muted">
          Scene: <strong>{room.scene.title}</strong> · {room.participants.length} player
          {room.participants.length === 1 ? '' : 's'} already joined
        </p>

        <form className="stack" onSubmit={(event) => void submit(event)}>
          <label className="field">
            <span>6-digit PIN</span>
            <input
              value={pin}
              onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span>Display name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 24))}
              maxLength={24}
              placeholder="Your name"
              required
            />
          </label>

          <div className="field">
            <span>Pointer color</span>
            <div className="color-picker" role="group" aria-label="Pointer color">
              {COLORS.map((option) => {
                const taken = usedColors.has(option.toLowerCase());
                return (
                  <button
                    key={option}
                    className={[
                      'color-swatch',
                      option === color && !taken ? 'selected' : '',
                      taken ? 'is-taken' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={{ background: option }}
                    type="button"
                    aria-label={taken ? `Color ${option} is in use` : `Choose color ${option}`}
                    aria-pressed={option === color && !taken}
                    title={taken ? 'Already in use by another player' : undefined}
                    disabled={taken}
                    onClick={() => setColor(option)}
                  />
                );
              })}
            </div>
            <small className="muted">
              The GM uses a silver downward triangle. A normal click does nothing;
              Shift+click pings. Colors already in use by another player are disabled.
            </small>
          </div>

          <div className="field">
            <span>Token shape</span>
            <div className="shape-picker" role="group" aria-label="Token shape">
              {PLAYER_SHAPES.map((option) => {
                const taken = usedShapes.has(option);
                return (
                  <button
                    key={option}
                    className={[
                      'shape-swatch',
                      option === shape && !taken ? 'selected' : '',
                      taken ? 'is-taken' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    type="button"
                    aria-label={
                      taken
                        ? `${PLAYER_SHAPE_LABELS[option]} is in use`
                        : PLAYER_SHAPE_LABELS[option]
                    }
                    aria-pressed={option === shape && !taken}
                    title={
                      taken
                        ? 'Already in use by another player'
                        : PLAYER_SHAPE_LABELS[option]
                    }
                    disabled={taken}
                    onClick={() => setShape(option)}
                  >
                    <ShapeIcon shape={option} color={color} />
                  </button>
                );
              })}
            </div>
            <small className="muted">
              Your token and ping use this shape, so color is not the only cue. Shapes
              already claimed by another player are disabled.
            </small>
          </div>

          {noMarkerAvailable ? (
            <div className="notice warning">
              No player markers are available. Every pointer color or token shape is
              already in use.
            </div>
          ) : null}

          {error ? <div className="notice error">{error}</div> : null}

          <button
            className="button primary"
            type="submit"
            disabled={
              joining ||
              noMarkerAvailable ||
              usedColors.has(color.toLowerCase()) ||
              usedShapes.has(shape)
            }
          >
            {joining ? 'Joining…' : 'Join the table'}
          </button>
        </form>
      </section>
    </main>
  );
}
