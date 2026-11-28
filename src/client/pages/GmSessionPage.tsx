import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ParticipantStrip } from '../components/ParticipantStrip';
import { SceneStage } from '../components/SceneStage';
import { SessionDrawers } from '../components/SessionDrawers';
import { useRoomSocket } from '../hooks/useRoomSocket';
import { api } from '../lib/api';
import type { PublicParticipant, PublicRoom } from '../../shared/types';

type GmRoom = PublicRoom & { pin: string };

interface ActiveResponse {
  room: PublicRoom | null;
  pin?: string;
}

interface SessionCheck {
  authenticated: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function GmSessionPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [gmRoom, setGmRoom] = useState<GmRoom | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const session = await api<SessionCheck>('/api/gm/session');
        if (!session.authenticated) {
          navigate('/gm', { replace: true });
          return;
        }

        const active = await api<ActiveResponse>('/api/rooms/active');
        if (!active.room) {
          navigate('/gm', { replace: true });
          return;
        }

        if (!cancelled) {
          setGmRoom({ ...active.room, pin: active.pin ?? '' });
        }
      } catch (bootError) {
        if (!cancelled) setError(errorMessage(bootError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void boot();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (loading) {
    return (
      <main className="landing">
        <div className="card narrow centered">Loading live session...</div>
      </main>
    );
  }

  if (!gmRoom) {
    return (
      <main className="landing">
        <div className="card narrow">
          <span className="eyebrow">GM session</span>
          <h1>No live session</h1>
          <p className="notice error">{error || 'Launch a campaign from the dashboard first.'}</p>
          <button className="button primary" type="button" onClick={() => navigate('/gm')}>
            Return to dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <div className="app-shell session-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          GMTool <span>alpha</span>
        </Link>
        <div className="topbar-actions">
          <span className="muted small">Live GM session</span>
          <Link className="button ghost small" to="/gm">
            Dashboard
          </Link>
        </div>
      </header>

      <SessionPanel gmRoom={gmRoom} onEnded={() => navigate('/gm')} />
    </div>
  );
}

function SessionPanel({ gmRoom, onEnded }: { gmRoom: GmRoom; onEnded: () => void }) {
  const {
    room: liveRoom,
    pointers,
    pings,
    connected,
    ended,
    error,
    socket,
    selfId,
    request,
  } = useRoomSocket({
    roomId: gmRoom.id,
    role: 'gm',
    initialRoom: gmRoom,
  });
  const room = liveRoom ?? gmRoom;
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [sceneBusy, setSceneBusy] = useState(false);
  const [gridBusy, setGridBusy] = useState(false);
  const [placingTokenId, setPlacingTokenId] = useState<string | null>(null);
  const [joinOpen, setJoinOpen] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const joinUrl = `${window.location.origin}/join/${room.id}`;

  useEffect(() => {
    setPlacingTokenId(null);
  }, [room.activeSceneIndex]);

  async function copyInvite(): Promise<void> {
    setLocalError(null);
    try {
      await navigator.clipboard.writeText(`Join GMTool: ${joinUrl}\nPIN: ${gmRoom.pin}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setLocalError('Could not copy automatically. Select the link and PIN manually.');
    }
  }

  async function changeScene(payload: { direction?: 'prev' | 'next'; index?: number }): Promise<void> {
    if (sceneBusy) return;
    setSceneBusy(true);
    setLocalError(null);
    try {
      await api(`/api/rooms/${room.id}/scene`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (sceneError) {
      setLocalError(errorMessage(sceneError));
    } finally {
      setSceneBusy(false);
    }
  }

  async function createToken(kind: 'enemy' | 'npc', name: string): Promise<void> {
    setLocalError(null);
    const response = await request('token:create', { kind, name });
    if (!response.ok) {
      setLocalError(response.error ?? 'Could not add token.');
    }
  }

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

  async function renameToken(tokenId: string, name: string): Promise<void> {
    setLocalError(null);
    const response = await request('token:rename', { tokenId, name });
    if (!response.ok) setLocalError(response.error ?? 'Could not rename token.');
  }

  async function deleteToken(tokenId: string): Promise<void> {
    if (!window.confirm('Delete this token permanently from the tray and the scene?')) {
      return;
    }
    setLocalError(null);
    const response = await request('token:delete', { tokenId });
    if (!response.ok) {
      setLocalError(response.error ?? 'Could not delete token.');
      return;
    }
    if (placingTokenId === tokenId) setPlacingTokenId(null);
  }

  async function toggleTokenHidden(tokenId: string, hidden: boolean): Promise<void> {
    setLocalError(null);
    const response = await request('token:hide', { tokenId, hidden });
    if (!response.ok) {
      setLocalError(response.error ?? 'Could not change token visibility.');
    }
  }

  async function removeParticipant(participant: PublicParticipant): Promise<void> {
    if (
      !window.confirm(
        `Remove ${participant.name} from the session? Their token and player marker will be removed from every scene.`,
      )
    ) {
      return;
    }

    setLocalError(null);
    try {
      await api(`/api/rooms/${room.id}/participants/${participant.id}`, {
        method: 'DELETE',
      });
    } catch (removeError) {
      setLocalError(errorMessage(removeError));
    }
  }

  async function toggleGrid(): Promise<void> {
    if (gridBusy) return;
    setGridBusy(true);
    setLocalError(null);
    const response = await request('grid:toggle', { visible: !room.gridVisible });
    if (!response.ok) setLocalError(response.error ?? 'Could not change the grid.');
    setGridBusy(false);
  }

  async function endSession(): Promise<void> {
    if (
      !window.confirm(
        'End this session for everyone? The join link will stop working. The campaign itself will remain saved.',
      )
    ) {
      return;
    }
    setEnding(true);
    setLocalError(null);
    try {
      await api(`/api/rooms/${room.id}/end`, { method: 'POST' });
      onEnded();
    } catch (endError) {
      setLocalError(errorMessage(endError));
    } finally {
      setEnding(false);
    }
  }

  if (ended) {
    return (
      <section className="card narrow session-ended-card">
        <span className="eyebrow">Session ended</span>
        <h1>The table is closed.</h1>
        <p className="muted">The join link has been invalidated.</p>
        <button className="button primary" type="button" onClick={onEnded}>
          Return to dashboard
        </button>
      </section>
    );
  }

  return (
    <div className="session-page session-page-focus">
      <header className="session-header">
        <div className="session-heading">
          <span className="eyebrow">GM session</span>
          <div className="session-title-row">
            <h1>{room.title}</h1>
            <span className={connected ? 'status-chip online' : 'status-chip offline'}>
              {connected ? 'Connected' : 'Reconnecting...'}
            </span>
          </div>
          <p className="scene-subtitle">Active scene · {room.scene.title}</p>

          <div className="scene-switcher">
            <span className="header-label">Scenes</span>
            <button
              className="scene-arrow"
              type="button"
              aria-label="Previous scene"
              onClick={() => void changeScene({ direction: 'prev' })}
              disabled={sceneBusy || room.activeSceneIndex <= 0}
            >
              ←
            </button>
            <span className="scene-counter">
              {room.activeSceneIndex + 1} / {room.sceneCount}
            </span>
            <button
              className="scene-arrow"
              type="button"
              aria-label="Next scene"
              onClick={() => void changeScene({ direction: 'next' })}
              disabled={sceneBusy || room.activeSceneIndex >= room.sceneCount - 1}
            >
              →
            </button>
          </div>
        </div>

        <div className="session-header-actions">
          <button
            className={room.gridVisible ? 'button ghost small is-active' : 'button ghost small'}
            type="button"
            aria-pressed={room.gridVisible}
            title="Show or hide the scene grid for everyone"
            onClick={() => void toggleGrid()}
            disabled={gridBusy}
          >
            {room.gridVisible ? 'Grid on' : 'Grid off'}
          </button>
          <button
            className="button primary small"
            type="button"
            onClick={() => setJoinOpen(true)}
          >
            Join session
          </button>
          <button
            className="button danger small"
            type="button"
            onClick={() => void endSession()}
            disabled={ending}
          >
            {ending ? 'Ending...' : 'End session'}
          </button>
        </div>

        <div className="header-table">
          <span className="header-label">Table</span>
          <ParticipantStrip
            room={room}
            role="gm"
            onRemoveParticipant={(participant) => void removeParticipant(participant)}
          />
        </div>
      </header>

      <JoinDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        joinUrl={joinUrl}
        pin={gmRoom.pin}
        copied={copied}
        error={localError}
        onCopy={() => void copyInvite()}
      />

      {error || localError ? <div className="notice error">{localError || error}</div> : null}

      <div className="scene-workspace">
        <div className="scene-focus">
          <SceneStage
            room={room}
            socket={socket}
            pointers={pointers}
            pings={pings}
            role="gm"
            selfId={selfId}
            placingTokenId={placingTokenId}
            onStartPlacement={setPlacingTokenId}
            onCancelPlacement={() => setPlacingTokenId(null)}
            onPlaceToken={(tokenId, col, row) => void placeToken(tokenId, col, row)}
            onUnplaceToken={(tokenId) => void unplaceToken(tokenId)}
          />
        </div>

        <SessionDrawers
          role="gm"
          room={room}
          selfId={selfId}
          placingTokenId={placingTokenId}
          sceneBusy={sceneBusy}
          onStartPlacement={setPlacingTokenId}
          onCreateToken={(kind, name) => void createToken(kind, name)}
          onRenameToken={(tokenId, name) => void renameToken(tokenId, name)}
          onDeleteToken={(tokenId) => void deleteToken(tokenId)}
          onToggleHidden={(tokenId, hidden) => void toggleTokenHidden(tokenId, hidden)}
          onSelectScene={(index) => void changeScene({ index })}
        />
      </div>
    </div>
  );
}

function JoinDialog({
  open,
  onClose,
  joinUrl,
  pin,
  copied,
  error,
  onCopy,
}: {
  open: boolean;
  onClose: () => void;
  joinUrl: string;
  pin: string;
  copied: boolean;
  error: string | null;
  onCopy: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="join-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="join-dialog-title"
      >
        <div className="join-dialog-head">
          <div>
            <span className="eyebrow">Invite</span>
            <h2 id="join-dialog-title">Join session</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <p className="muted small">Share this link and PIN in Discord.</p>

        <code className="join-dialog-link">{joinUrl}</code>

        <div className="join-dialog-pin">
          <span className="header-label">PIN</span>
          <strong>{pin}</strong>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        <button className="button primary" type="button" onClick={onCopy} autoFocus>
          {copied ? 'Copied' : 'Copy link + PIN'}
        </button>
      </section>
    </div>
  );
}
