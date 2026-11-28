import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { CampaignTokenEditor } from '../components/CampaignTokenEditor';
import { GridEditor } from '../components/GridEditor';
import { ScenePreview } from '../components/ScenePreview';
import { api } from '../lib/api';
import { gridGeometry } from '../../shared/grid';
import { GM_TOKEN_COLORS, gmTokenShape } from '../../shared/shapes';
import type {
  Campaign,
  CampaignScene,
  GridSettings,
  PresetId,
  TokenInfo,
} from '../../shared/types';

interface SessionCheck {
  authenticated: boolean;
}

interface CampaignResponse {
  campaign: Campaign;
}

function newScene(index: number): CampaignScene {
  return {
    id: crypto.randomUUID(),
    title: `Scene ${index + 1}`,
    background: { type: 'preset', preset: 'snow' },
    grid: null,
    tokens: [],
  };
}

function pruneTokens(
  tokens: TokenInfo[],
  grid: GridSettings | null,
  fallbackAspect: number,
): TokenInfo[] {
  if (!grid) return [];
  const geometry = gridGeometry(grid, grid.aspect ?? fallbackAspect);
  if (!geometry) return tokens.map((token) => ({ ...token, cell: null }));
  return tokens.map((token) => {
    if (
      token.cell &&
      (token.cell.col >= geometry.fullColumns || token.cell.row >= geometry.fullRows)
    ) {
      return { ...token, cell: null };
    }
    return token;
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}

export function CampaignBuilderPage() {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(campaignId);

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('Game Night!');
  const [scenes, setScenes] = useState<CampaignScene[]>([newScene(0)]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [previewAspect, setPreviewAspect] = useState(16 / 9);
  const [placingTokenId, setPlacingTokenId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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

        if (campaignId) {
          const response = await api<CampaignResponse>(`/api/campaigns/${campaignId}`);
          if (cancelled) return;
          setName(response.campaign.name);
          setScenes(response.campaign.scenes);
          setCurrentIndex(0);
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
  }, [campaignId, navigate]);

  const currentScene = scenes[currentIndex] ?? scenes[0];

  function updateCurrentScene(patch: Partial<CampaignScene>): void {
    setScenes((previous) =>
      previous.map((scene, index) => (index === currentIndex ? { ...scene, ...patch } : scene)),
    );
  }

  function updateGrid(grid: GridSettings | null): void {
    if (!grid && currentScene.tokens.length > 0) {
      if (
        !window.confirm(
          'Removing the grid will also delete every scene token. Continue?',
        )
      ) {
        return;
      }
    }

    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex
          ? {
              ...scene,
              grid,
              tokens: grid
                ? pruneTokens(scene.tokens, grid, previewAspect)
                : [],
            }
          : scene,
      ),
    );
    if (!grid) setPlacingTokenId(null);
  }

  function updatePreviewAspect(next: number): void {
    setPreviewAspect(next);
    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex && scene.grid
          ? { ...scene, grid: { ...scene.grid, aspect: next } }
          : scene,
      ),
    );
  }

  function addSceneToken(kind: 'enemy' | 'npc', name: string): void {
    if (!currentScene.grid) return;
    const count = currentScene.tokens.filter((token) => token.kind === kind).length + 1;
    const token: TokenInfo = {
      id: crypto.randomUUID(),
      kind,
      label: name.trim() || `${kind === 'enemy' ? 'Enemy' : 'NPC'} ${count}`,
      color: GM_TOKEN_COLORS[kind],
      shape: gmTokenShape(kind),
      ownerId: null,
      cell: null,
      hidden: false,
    };
    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex
          ? { ...scene, tokens: [...scene.tokens, token] }
          : scene,
      ),
    );
  }

  function placeSceneToken(tokenId: string, col: number, row: number): void {
    setScenes((previous) =>
      previous.map((scene, index) => {
        if (index !== currentIndex) return scene;
        const occupied = scene.tokens.some(
          (token) =>
            token.id !== tokenId &&
            token.cell?.col === col &&
            token.cell?.row === row,
        );
        if (occupied) return scene;
        return {
          ...scene,
          tokens: scene.tokens.map((token) =>
            token.id === tokenId ? { ...token, cell: { col, row } } : token,
          ),
        };
      }),
    );
    setPlacingTokenId(null);
  }

  function renameSceneToken(tokenId: string, name: string): void {
    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex
          ? {
              ...scene,
              tokens: scene.tokens.map((token) =>
                token.id === tokenId ? { ...token, label: name } : token,
              ),
            }
          : scene,
      ),
    );
  }

  function deleteSceneToken(tokenId: string): void {
    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex
          ? {
              ...scene,
              tokens: scene.tokens.filter((token) => token.id !== tokenId),
            }
          : scene,
      ),
    );
    if (placingTokenId === tokenId) setPlacingTokenId(null);
  }

  function toggleSceneTokenHidden(tokenId: string, hidden: boolean): void {
    setScenes((previous) =>
      previous.map((scene, index) =>
        index === currentIndex
          ? {
              ...scene,
              tokens: scene.tokens.map((token) =>
                token.id === tokenId ? { ...token, hidden } : token,
              ),
            }
          : scene,
      ),
    );
  }

  function selectScene(index: number): void {
    setCurrentIndex(index);
    setPlacingTokenId(null);
  }

  function moveCurrentScene(direction: -1 | 1): void {
    const targetIndex = currentIndex + direction;
    if (targetIndex < 0 || targetIndex >= scenes.length) return;

    setScenes((previous) => {
      const next = [...previous];
      const [moved] = next.splice(currentIndex, 1);
      next.splice(targetIndex, 0, moved!);
      return next;
    });
    setCurrentIndex(targetIndex);
    setPlacingTokenId(null);
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const uploaded = await api<{ url: string }>('/api/uploads', {
        method: 'POST',
        body: formData,
      });
      updateCurrentScene({ background: { type: 'upload', url: uploaded.url } });
    } catch (uploadError) {
      setError(errorMessage(uploadError));
    } finally {
      setUploading(false);
    }
  }

  function addScene(): void {
    const nextIndex = scenes.length;
    setScenes((previous) => [...previous, newScene(previous.length)]);
    setCurrentIndex(nextIndex);
    setPlacingTokenId(null);
  }

  function deleteScene(): void {
    if (scenes.length <= 1) return;
    if (!window.confirm(`Delete Scene ${currentIndex + 1}? Save the campaign to apply the change.`)) {
      return;
    }
    const next = scenes.filter((_, index) => index !== currentIndex);
    setScenes(next);
    setCurrentIndex(Math.max(0, Math.min(currentIndex, next.length - 1)));
    setPlacingTokenId(null);
  }

  async function saveCampaign(event: FormEvent): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError('Campaign name is required.');
      return;
    }
    if (scenes.some((scene) => !scene.title.trim())) {
      setError('Every scene needs a title.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        scenes: scenes.map((scene) => ({
          id: scene.id,
          title: scene.title,
          background: scene.background,
          grid: scene.grid,
          tokens: scene.tokens,
        })),
      };

      if (campaignId) {
        await api(`/api/campaigns/${campaignId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        await api('/api/campaigns', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      navigate('/gm');
    } catch (saveError) {
      setError(errorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <main className="landing">
        <div className="card narrow centered">Loading campaign...</div>
      </main>
    );
  }

  if (!currentScene) {
    return (
      <main className="landing">
        <div className="card narrow">
          <h1>Campaign unavailable</h1>
          <p className="notice error">{error || 'This campaign could not be loaded.'}</p>
          <Link className="button primary" to="/gm">
            Return to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const selectedPreset =
    currentScene.background.type === 'preset' ? currentScene.background.preset : '';

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand">
          GMTool <span>alpha</span>
        </Link>
        <div className="topbar-actions">
          <span className="muted small">Campaign builder</span>
          <Link className="button ghost small" to="/gm">
            Dashboard
          </Link>
        </div>
      </header>

      <main className="builder-main">
        <div className="builder-heading">
          <span className="eyebrow">{isEditing ? 'Edit campaign' : 'New campaign'}</span>
          <h1>Set the scene</h1>
          <p className="scene-subtitle">Scene {currentIndex + 1}</p>
        </div>

        {error ? <div className="notice error">{error}</div> : null}

        <form onSubmit={(event) => void saveCampaign(event)}>
          <label className="field campaign-name-field">
            <span>Campaign name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value.slice(0, 80))}
              maxLength={80}
              required
            />
          </label>

          <div className={currentScene.grid ? 'builder-layout grid-editing' : 'builder-layout'}>
            <section className="card builder-editor">
              <label className="field">
                <span>Scene title</span>
                <input
                  value={currentScene.title}
                  onChange={(event) =>
                    updateCurrentScene({ title: event.target.value.slice(0, 80) })
                  }
                  maxLength={80}
                  required
                />
              </label>

              <label className="field">
                <span>Background image</span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={(event) => void handleFile(event)}
                  disabled={uploading}
                />
                <small className="muted">
                  {uploading ? 'Uploading...' : 'PNG, JPEG, or WebP. Maximum 10 MB.'}
                </small>
              </label>

              <label className="field">
                <span>Or use a built-in background</span>
                <select
                  value={selectedPreset}
                  onChange={(event) => {
                    const preset = event.target.value as PresetId;
                    if (preset) updateCurrentScene({ background: { type: 'preset', preset } });
                  }}
                >
                  <option value="" disabled>
                    Uploaded image selected
                  </option>
                  <option value="snow">Snow</option>
                  <option value="grass">Grass</option>
                  <option value="dungeon">Dungeon</option>
                </select>
                <small className="muted">
                  Choosing a preset replaces the uploaded image for this scene.
                </small>
              </label>

              <GridEditor
                grid={currentScene.grid}
                aspect={previewAspect}
                onChange={updateGrid}
              />

              <CampaignTokenEditor
                key={currentScene.id}
                tokens={currentScene.tokens}
                hasGrid={Boolean(currentScene.grid)}
                placingTokenId={placingTokenId}
                onAdd={addSceneToken}
                onStartPlacement={setPlacingTokenId}
                onRename={renameSceneToken}
                onToggleHidden={toggleSceneTokenHidden}
                onDelete={deleteSceneToken}
              />

              <div className="builder-stepper-wrap">
                <div className="builder-stepper" role="tablist" aria-label="Campaign scenes">
                  {scenes.map((scene, index) => (
                    <button
                      key={scene.id}
                      className={index === currentIndex ? 'scene-step active' : 'scene-step'}
                      type="button"
                      role="tab"
                      aria-selected={index === currentIndex}
                      onClick={() => selectScene(index)}
                    >
                      Scene {index + 1}
                    </button>
                  ))}
                </div>

                <div className="scene-order-controls" aria-label="Move current scene">
                  <span className="muted small">Order</span>
                  <button
                    className="scene-order-button"
                    type="button"
                    title="Move this scene earlier"
                    aria-label="Move this scene earlier"
                    disabled={currentIndex === 0}
                    onClick={() => moveCurrentScene(-1)}
                  >
                    ←
                  </button>
                  <button
                    className="scene-order-button"
                    type="button"
                    title="Move this scene later"
                    aria-label="Move this scene later"
                    disabled={currentIndex === scenes.length - 1}
                    onClick={() => moveCurrentScene(1)}
                  >
                    →
                  </button>
                </div>

                <span className="muted small">
                  {scenes.length} scene{scenes.length === 1 ? '' : 's'}
                </span>
              </div>

              <div className="builder-actions">
                <button className="button primary" type="submit" disabled={saving || uploading}>
                  {saving ? 'Saving...' : 'Save Campaign'}
                </button>
                <button
                  className="button ghost"
                  type="button"
                  title="Return to the GM dashboard without saving"
                  disabled={saving}
                  onClick={() => navigate('/gm')}
                >
                  Exit
                </button>
                <button className="button" type="button" onClick={addScene}>
                  Add Scene
                </button>
                <button
                  className="button danger"
                  type="button"
                  onClick={deleteScene}
                  disabled={scenes.length <= 1}
                >
                  Delete Scene
                </button>
              </div>
            </section>

            <aside className="builder-preview">
              <ScenePreview
                scene={currentScene}
                expanded={Boolean(currentScene.grid)}
                onAspectChange={updatePreviewAspect}
                placingTokenId={placingTokenId}
                onStartPlacement={setPlacingTokenId}
                onPlaceToken={placeSceneToken}
                onCancelPlacement={() => setPlacingTokenId(null)}
              />
            </aside>
          </div>
        </form>
      </main>
    </div>
  );
}
