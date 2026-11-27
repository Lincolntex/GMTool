import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import type { CampaignSummary, PublicRoom } from '../../shared/types';

interface ActiveResponse {
  room: PublicRoom | null;
  pin?: string;
}

interface CampaignListResponse {
  campaigns: CampaignSummary[];
}

interface SessionCheck {
  authenticated: boolean;
  defaultPassphrase: boolean;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function GmPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [defaultPassphrase, setDefaultPassphrase] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [activeRoom, setActiveRoom] = useState<PublicRoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadDashboard(): Promise<void> {
    const [campaignData, activeData] = await Promise.all([
      api<CampaignListResponse>('/api/campaigns'),
      api<ActiveResponse>('/api/rooms/active'),
    ]);
    setCampaigns(campaignData.campaigns);
    setActiveRoom(activeData.room);
  }

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const session = await api<SessionCheck>('/api/gm/session');
        if (cancelled) return;
        setAuthenticated(session.authenticated);
        setDefaultPassphrase(session.defaultPassphrase);
        if (session.authenticated) await loadDashboard();
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
  }, []);

  async function handleLogin(passphrase: string): Promise<void> {
    setError(null);
    await api('/api/gm/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passphrase }),
    });
    setAuthenticated(true);
    await loadDashboard();
  }

  async function handleLogout(): Promise<void> {
    await api('/api/gm/logout', { method: 'POST' });
    setAuthenticated(false);
    setCampaigns([]);
    setActiveRoom(null);
  }

  async function handleCopy(campaign: CampaignSummary): Promise<void> {
    setBusyId(campaign.id);
    setError(null);
    try {
      await api(`/api/campaigns/${campaign.id}/copy`, { method: 'POST' });
      await loadDashboard();
    } catch (copyError) {
      setError(errorMessage(copyError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(campaign: CampaignSummary): Promise<void> {
    if (!window.confirm(`Delete "${campaign.name}" permanently?`)) return;
    setBusyId(campaign.id);
    setError(null);
    try {
      await api(`/api/campaigns/${campaign.id}`, { method: 'DELETE' });
      await loadDashboard();
    } catch (deleteError) {
      setError(errorMessage(deleteError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleLaunch(campaign: CampaignSummary): Promise<void> {
    if (
      activeRoom &&
      !window.confirm(
        `"${activeRoom.title}" is already live. Launching "${campaign.name}" will end that session. Continue?`,
      )
    ) {
      return;
    }

    setBusyId(campaign.id);
    setError(null);
    try {
      await api(`/api/campaigns/${campaign.id}/launch`, { method: 'POST' });
      navigate('/gm/session');
    } catch (launchError) {
      setError(errorMessage(launchError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleEndLive(): Promise<void> {
    if (!activeRoom) return;
    if (!window.confirm('End the live session for everyone? The join link will stop working.')) {
      return;
    }
    setBusyId(activeRoom.id);
    setError(null);
    try {
      await api(`/api/rooms/${activeRoom.id}/end`, { method: 'POST' });
      setActiveRoom(null);
    } catch (endError) {
      setError(errorMessage(endError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          GMTool <span>alpha</span>
        </Link>
        <div className="topbar-actions">
          <span className="muted small">GM dashboard</span>
          {authenticated ? (
            <button className="button ghost small" type="button" onClick={() => void handleLogout()}>
              Log out
            </button>
          ) : null}
        </div>
      </header>

      <main className="dashboard-main">
        {loading ? <div className="card centered">Loading dashboard...</div> : null}

        {!loading && !authenticated ? (
          <LoginCard
            defaultPassphrase={defaultPassphrase}
            error={error}
            onLogin={handleLogin}
          />
        ) : null}

        {!loading && authenticated ? (
          <>
            {error ? <div className="notice error">{error}</div> : null}

            {activeRoom ? (
              <section className="live-banner">
                <div>
                  <span className="eyebrow">Live session</span>
                  <h2>{activeRoom.title}</h2>
                  <p className="muted small">
                    {activeRoom.scene.title} · {activeRoom.participants.length} player
                    {activeRoom.participants.length === 1 ? '' : 's'} joined
                  </p>
                </div>
                <div className="live-banner-actions">
                  <button
                    className="button primary small"
                    type="button"
                    onClick={() => navigate('/gm/session')}
                  >
                    Resume session
                  </button>
                  <button
                    className="button danger small"
                    type="button"
                    onClick={() => void handleEndLive()}
                    disabled={busyId === activeRoom.id}
                  >
                    End session
                  </button>
                </div>
              </section>
            ) : null}

            <div className="dashboard-heading">
              <div>
                <span className="eyebrow">Campaigns</span>
                <h1>Your campaigns</h1>
              </div>
              <Link className="button primary" to="/gm/campaigns/new">
                New Campaign
              </Link>
            </div>

            {campaigns.length === 0 ? (
              <section className="card empty-dashboard">
                <h2>No campaigns yet</h2>
                <p className="muted">
                  Create your first campaign to start building scenes for your next session.
                </p>
                <Link className="button primary" to="/gm/campaigns/new">
                  New Campaign
                </Link>
              </section>
            ) : (
              <ul className="campaign-list">
                {campaigns.map((campaign) => (
                  <li className="campaign-row" key={campaign.id}>
                    <div className="campaign-main">
                      <div className="campaign-scene-count">
                        <strong>{campaign.sceneCount}</strong>
                        <span>scene{campaign.sceneCount === 1 ? '' : 's'}</span>
                      </div>
                      <div className="campaign-copy">
                        <h2>{campaign.name}</h2>
                        <p className="muted small">
                          Updated{' '}
                          {new Date(campaign.updatedAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      </div>
                    </div>

                    <details className="campaign-menu">
                      <summary aria-label={`Actions for ${campaign.name}`}>⋮</summary>
                      <div className="campaign-menu-panel">
                        <button
                          type="button"
                          onClick={() => void handleCopy(campaign)}
                          disabled={busyId === campaign.id}
                        >
                          Copy
                        </button>
                        <button
                          type="button"
                          onClick={() => navigate(`/gm/campaigns/${campaign.id}/edit`)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(campaign)}
                          disabled={busyId === campaign.id}
                          className="menu-danger"
                        >
                          Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleLaunch(campaign)}
                          disabled={busyId === campaign.id}
                        >
                          Launch
                        </button>
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}

function LoginCard({
  defaultPassphrase,
  error,
  onLogin,
}: {
  defaultPassphrase: boolean;
  error: string | null;
  onLogin: (passphrase: string) => Promise<void>;
}) {
  const [passphrase, setPassphrase] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setLocalError(null);
    try {
      await onLogin(passphrase);
    } catch (loginError) {
      setLocalError(errorMessage(loginError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card narrow login-card">
      <span className="eyebrow">Game Master</span>
      <h1>Open the GM console</h1>
      <p className="muted">
        Enter the local GM passphrase from your <code>.env</code> file.
      </p>

      {defaultPassphrase ? (
        <div className="notice warning">
          The default passphrase is active. Set <code>GM_PASSPHRASE</code> in <code>.env</code>{' '}
          before using this outside your machine.
        </div>
      ) : null}

      <form className="stack" onSubmit={(event) => void submit(event)}>
        <label className="field">
          <span>GM passphrase</span>
          <input
            type="password"
            value={passphrase}
            onChange={(event) => setPassphrase(event.target.value)}
            autoFocus
            required
          />
        </label>

        {localError || error ? (
          <div className="notice error">{localError || error}</div>
        ) : null}

        <button className="button primary" type="submit" disabled={busy}>
          {busy ? 'Checking...' : 'Enter GM console'}
        </button>
      </form>
    </section>
  );
}
