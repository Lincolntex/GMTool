import { useEffect, useState, type FormEvent } from 'react';
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

  useEffect(() => {
    let cancelled = false;

    async function loadRoom() {
      if (!roomId) {
        setError('Missing session link.');
        setLoading(false);
        return;
      }

      try {
        const response = await api<RoomResponse>(`/api/rooms/${roomId}`);
        if (!cancelled) setRoom(response.room);
      } catch (loadError) {
        if (!cancelled) setError(errorMessage(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRoom();
    return () => {
      cancelled = true;
    };
  }, [roomId]);

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
              {COLORS.map((option) => (
                <button
                  key={option}
                  className={option === color ? 'color-swatch selected' : 'color-swatch'}
                  style={{ background: option }}
                  type="button"
                  aria-label={`Choose color ${option}`}
                  aria-pressed={option === color}
                  onClick={() => setColor(option)}
                />
              ))}
            </div>
            <small className="muted">
              The GM uses a silver downward triangle. A normal click does nothing;
              Shift+click pings.
            </small>
          </div>

          <div className="field">
            <span>Token shape</span>
            <div className="shape-picker" role="group" aria-label="Token shape">
              {PLAYER_SHAPES.map((option) => (
                <button
                  key={option}
                  className={option === shape ? 'shape-swatch selected' : 'shape-swatch'}
                  type="button"
                  aria-label={PLAYER_SHAPE_LABELS[option]}
                  aria-pressed={option === shape}
                  title={PLAYER_SHAPE_LABELS[option]}
                  onClick={() => setShape(option)}
                >
                  <ShapeIcon shape={option} color={color} />
                </button>
              ))}
            </div>
            <small className="muted">
              Your token and ping use this shape, so color is not the only cue.
            </small>
          </div>

          {error ? <div className="notice error">{error}</div> : null}

          <button className="button primary" type="submit" disabled={joining}>
            {joining ? 'Joining…' : 'Join the table'}
          </button>
        </form>
      </section>
    </main>
  );
}
