import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { ParticipantStrip } from '../components/ParticipantStrip';
import { SceneStage } from '../components/SceneStage';
import { SessionDrawers } from '../components/SessionDrawers';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { clearParticipantToken, getParticipantToken } from '../lib/storage';

export function SessionPage() {
  const { roomId = '' } = useParams();
  const token = roomId ? getParticipantToken(roomId) : null;

  if (!roomId) {
    return (
      <main className="landing">
        <div className="card narrow">
          <h1>Missing session link.</h1>
          <Link className="button primary" to="/">
            Return home
          </Link>
        </div>
      </main>
    );
  }

  if (!token) {
    return <Navigate to={`/join/${roomId}`} replace />;
  }

  return <PlayerSession roomId={roomId} token={token} />;
}

function PlayerSession({ roomId, token }: { roomId: string; token: string }) {
  const navigate = useNavigate();
  const {
    room,
    pointers,
    pings,
    connected,
    ended,
    error,
    socket,
    selfId,
    request,
  } = useRoomSocket({
    roomId,
    role: 'player',
    participantToken: token,
  });
  const [placingTokenId, setPlacingTokenId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    setPlacingTokenId(null);
  }, [room?.activeSceneIndex]);

  async function placeToken(tokenId: string, col: number, row: number): Promise<void> {
    setLocalError(null);
    const response = await request('token:place', { tokenId, col, row });
    if (!response.ok) {
      setLocalError(response.error ?? 'Could not place token.');
      return;
    }
    setPlacingTokenId(null);
  }

  async function unplaceToken(tokenId: string): Promise<void> {
    setLocalError(null);
    const response = await request('token:unplace', { tokenId });
    if (!response.ok) {
      setLocalError(response.error ?? 'Could not remove token.');
      return;
    }
    setPlacingTokenId(null);
  }

  function leave(): void {
    clearParticipantToken(roomId);
    navigate(`/join/${roomId}`, { replace: true });
  }

  if (ended) {
    return (
      <main className="landing">
        <div className="card narrow">
          <span className="eyebrow">Session ended</span>
          <h1>The GM closed the table.</h1>
          <p className="muted">The join link for this session no longer works.</p>
          <button className="button primary" type="button" onClick={leave}>
            Return to join screen
          </button>
        </div>
      </main>
    );
  }

  if (error && !room) {
    return (
      <main className="landing">
        <div className="card narrow">
          <span className="eyebrow">Session unavailable</span>
          <h1>Could not rejoin.</h1>
          <p className="notice error">{error}</p>
          <button className="button primary" type="button" onClick={leave}>
            Return to join screen
          </button>
        </div>
      </main>
    );
  }

  if (!room) {
    return (
      <main className="landing">
        <div className="card narrow centered">Connecting to the table…</div>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          GMTool <span>alpha</span>
        </Link>
        <div className="topbar-actions">
          <span className={connected ? 'status-chip online' : 'status-chip offline'}>
            {connected ? 'Connected' : 'Reconnecting...'}
          </span>
          <button className="button ghost small" type="button" onClick={leave}>
            Leave
          </button>
        </div>
      </header>

      <div className="session-page session-page-focus">
        <header className="session-header">
          <div className="session-heading">
            <span className="eyebrow">Player view</span>
            <div className="session-title-row">
              <h1>{room.title}</h1>
              {!room.gmConnected ? <span className="status-chip offline">GM offline</span> : null}
            </div>
            <p className="scene-subtitle">Active scene · {room.scene.title}</p>
          </div>

          <div className="header-table">
            <span className="header-label">Table</span>
            <ParticipantStrip room={room} />
          </div>
        </header>

        {error || localError ? (
          <div className="notice error">{localError || error}</div>
        ) : null}

        <SessionDrawers
          role="player"
          room={room}
          selfId={selfId}
          placingTokenId={placingTokenId}
          sceneBusy={false}
          onStartPlacement={setPlacingTokenId}
          onCreateToken={() => undefined}
          onRenameToken={() => undefined}
          onDeleteToken={() => undefined}
          onToggleHidden={() => undefined}
          onSelectScene={() => undefined}
        />

        <div className="scene-focus">
          <SceneStage
            room={room}
            socket={socket}
            pointers={pointers}
            pings={pings}
            role="player"
            selfId={selfId}
            placingTokenId={placingTokenId}
            onStartPlacement={setPlacingTokenId}
            onCancelPlacement={() => setPlacingTokenId(null)}
            onPlaceToken={(tokenId, col, row) => void placeToken(tokenId, col, row)}
            onUnplaceToken={(tokenId) => void unplaceToken(tokenId)}
          />
        </div>
      </div>
    </div>
  );
}
