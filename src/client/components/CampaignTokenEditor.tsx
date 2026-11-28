import { useEffect, useRef, useState } from 'react';
import { GM_TOKEN_COLORS, gmTokenShape } from '../../shared/shapes';
import type { TokenInfo } from '../../shared/types';
import { tokenInitials, tokenShapeForToken } from '../lib/tokens';
import { TokenGlyph } from './ShapeIcon';

interface CampaignTokenEditorProps {
  tokens: TokenInfo[];
  hasGrid: boolean;
  placingTokenId: string | null;
  onAdd: (kind: 'enemy' | 'npc', name: string) => void;
  onStartPlacement: (tokenId: string) => void;
  onRename: (tokenId: string, name: string) => void;
  onToggleHidden: (tokenId: string, hidden: boolean) => void;
  onDelete: (tokenId: string) => void;
}

export function CampaignTokenEditor({
  tokens,
  hasGrid,
  placingTokenId,
  onAdd,
  onStartPlacement,
  onRename,
  onToggleHidden,
  onDelete,
}: CampaignTokenEditorProps) {
  const [tokenName, setTokenName] = useState('');
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [statsTokenId, setStatsTokenId] = useState<string | null>(null);
  const editCommitted = useRef(false);
  const statsToken = statsTokenId
    ? tokens.find((token) => token.id === statsTokenId) ?? null
    : null;

  useEffect(() => {
    if (statsTokenId && !tokens.some((token) => token.id === statsTokenId)) {
      setStatsTokenId(null);
    }
  }, [statsTokenId, tokens]);

  function beginRename(token: TokenInfo): void {
    editCommitted.current = false;
    setEditingTokenId(token.id);
    setDraftName(token.label);
  }

  function commitRename(token: TokenInfo): void {
    if (editCommitted.current) return;
    editCommitted.current = true;
    const name = draftName.trim();
    setEditingTokenId(null);
    setDraftName('');
    if (name && name !== token.label) onRename(token.id, name);
  }

  function cancelRename(): void {
    editCommitted.current = true;
    setEditingTokenId(null);
    setDraftName('');
  }

  function add(kind: 'enemy' | 'npc'): void {
    onAdd(kind, tokenName);
    setTokenName('');
  }

  return (
    <section className="campaign-token-editor">
      <div className="grid-editor-head">
        <div>
          <span className="grid-editor-title">Scene tokens</span>
          <p className="muted small">
            Add GM tokens before launch, then click a token marker and place it in the
            preview.
          </p>
        </div>
        <span className="muted small">
          {tokens.length} token{tokens.length === 1 ? '' : 's'}
        </span>
      </div>

      {!hasGrid ? (
        <div className="notice warning">
          Add a token grid before placing scene tokens.
        </div>
      ) : null}

      <label className="field">
        <span>Token name</span>
        <input
          value={tokenName}
          onChange={(event) => setTokenName(event.target.value.slice(0, 24))}
          maxLength={24}
          placeholder="Optional — defaults to Enemy 1 / NPC 1"
        />
      </label>

      <div className="token-sources">
        <button
          className="token-source"
          type="button"
          disabled={!hasGrid}
          onClick={() => add('enemy')}
        >
          <span className="drawer-token-shape drawer-token-shape-large" aria-hidden="true">
            <TokenGlyph shape={gmTokenShape('enemy')} color={GM_TOKEN_COLORS.enemy} />
          </span>
          <span className="token-source-copy">
            <strong>Enemy</strong>
            <small>Red triangle</small>
          </span>
          <span className="token-source-action">Add</span>
        </button>

        <button
          className="token-source"
          type="button"
          disabled={!hasGrid}
          onClick={() => add('npc')}
        >
          <span className="drawer-token-shape drawer-token-shape-large" aria-hidden="true">
            <TokenGlyph shape={gmTokenShape('npc')} color={GM_TOKEN_COLORS.npc} />
          </span>
          <span className="token-source-copy">
            <strong>NPC</strong>
            <small>Green triangle</small>
          </span>
          <span className="token-source-action">Add</span>
        </button>
      </div>

      {statsToken ? (
        <div className="drawer-stats-card campaign-token-stats">
          <div className="drawer-subhead">
            <span className="header-label">Stats</span>
            <button
              className="icon-button small"
              type="button"
              aria-label="Close stats"
              onClick={() => setStatsTokenId(null)}
            >
              ×
            </button>
          </div>
          <div className="campaign-token-stats-body">
            <span
              className="drawer-token-shape drawer-token-shape-large"
              aria-hidden="true"
            >
              <TokenGlyph
                shape={tokenShapeForToken(statsToken)}
                color={statsToken.color}
                label={tokenInitials(statsToken.label)}
              />
            </span>
            <div>
              <span className="eyebrow">
                {statsToken.kind === 'enemy' ? 'Enemy' : 'NPC'}
              </span>
              <strong>{statsToken.label}</strong>
              <p className="muted small">
                Daggerheart stats and abilities will appear here in a later pass.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {tokens.length === 0 ? (
        <p className="muted small">
          No scene tokens yet. Add one above, then place it in the preview.
        </p>
      ) : (
        <div className="drawer-token-list">
          {tokens.map((token) => (
            <div
              key={token.id}
              className={token.hidden ? 'active-token-row is-hidden' : 'active-token-row'}
            >
              <button
                className={[
                  'active-token-icon',
                  token.cell ? 'is-on-scene' : '',
                  token.hidden ? 'is-hidden' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                type="button"
                disabled={!hasGrid}
                title={token.cell ? 'Move token' : 'Place token'}
                aria-label={token.cell ? `Move ${token.label}` : `Place ${token.label}`}
                onClick={() => onStartPlacement(token.id)}
              >
                <span className="drawer-token-shape" aria-hidden="true">
                  <TokenGlyph
                    shape={tokenShapeForToken(token)}
                    color={token.color}
                    label={tokenInitials(token.label)}
                  />
                </span>
              </button>

              {editingTokenId === token.id ? (
                <input
                  className="active-token-name-input"
                  value={draftName}
                  maxLength={24}
                  autoFocus
                  onChange={(event) => setDraftName(event.target.value.slice(0, 24))}
                  onBlur={() => commitRename(token)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename(token);
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault();
                      cancelRename();
                    }
                  }}
                />
              ) : (
                <button
                  className="active-token-name"
                  type="button"
                  title="Rename token"
                  onClick={() => beginRename(token)}
                >
                  {token.label}
                </button>
              )}

              <div className="active-token-actions">
                {token.cell ? (
                  <>
                    <button
                      className={token.hidden ? 'token-action active' : 'token-action'}
                      type="button"
                      onClick={() => onToggleHidden(token.id, !token.hidden)}
                    >
                      {token.hidden ? 'Show' : 'Hide'}
                    </button>
                    <button
                      className="token-action"
                      type="button"
                      onClick={() => setStatsTokenId(token.id)}
                    >
                      Stats
                    </button>
                  </>
                ) : null}
                <button
                  className="token-action danger"
                  type="button"
                  onClick={() => {
                    if (window.confirm(`Delete "${token.label}" from this scene?`)) {
                      onDelete(token.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {placingTokenId ? (
        <p className="muted small">
          Click a square in the preview to place the selected token. Press Escape to
          cancel.
        </p>
      ) : null}
    </section>
  );
}
