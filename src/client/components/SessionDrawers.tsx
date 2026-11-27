import { useEffect, useRef, useState } from 'react';
import type { PublicRoom, Role, TokenInfo } from '../../shared/types';
import { gmTokenShape } from '../../shared/shapes';
import { GM_TOKEN_COLORS, tokenInitials, tokenShapeForToken } from '../lib/tokens';
import { TokenGlyph } from './ShapeIcon';

type DrawerSide = 'left' | 'right';

interface RailTab {
  id: string;
  label: string;
}

interface SessionDrawersProps {
  role: Role;
  room: PublicRoom;
  selfId: string | null;
  placingTokenId: string | null;
  sceneBusy: boolean;
  onStartPlacement: (tokenId: string) => void;
  onCreateToken: (kind: 'enemy' | 'npc', name: string) => void;
  onRenameToken: (tokenId: string, name: string) => void;
  onDeleteToken: (tokenId: string) => void;
  onToggleHidden: (tokenId: string, hidden: boolean) => void;
  onSelectScene: (index: number) => void;
}

function DrawerCoin({
  token,
  large = false,
}: {
  token: TokenInfo;
  large?: boolean;
}) {
  return (
    <span
      className={large ? 'drawer-token-shape drawer-token-shape-large' : 'drawer-token-shape'}
      aria-hidden="true"
    >
      <TokenGlyph
        shape={tokenShapeForToken(token)}
        color={token.color}
        label={tokenInitials(token.label)}
      />
    </span>
  );
}

function StatsBody({
  token,
  fallbackName,
}: {
  token: TokenInfo | null;
  fallbackName: string;
}) {
  const kindLabel = token
    ? token.kind === 'player'
      ? 'Player character'
      : token.kind === 'enemy'
        ? 'Enemy'
        : 'NPC'
    : 'Character';

  return (
    <div className="drawer-section stats-detail">
      {token ? (
        <span className="stats-token-icon">
          <DrawerCoin token={token} large />
        </span>
      ) : null}
      <span className="eyebrow">{kindLabel}</span>
      <h3 className="drawer-character-name">{token?.label ?? fallbackName}</h3>
      <p className="muted small">
        Daggerheart stats and abilities will appear here in a later pass.
      </p>
    </div>
  );
}

export function SessionDrawers({
  role,
  room,
  selfId,
  placingTokenId,
  sceneBusy,
  onStartPlacement,
  onCreateToken,
  onRenameToken,
  onDeleteToken,
  onToggleHidden,
  onSelectScene,
}: SessionDrawersProps) {
  const leftTabs: RailTab[] =
    role === 'gm'
      ? [
          { id: 'scene', label: 'Scene' },
          { id: 'token', label: 'Token' },
          { id: 'requests', label: 'Requests' },
        ]
      : [{ id: 'character', label: 'Character' }];
  const rightTabs: RailTab[] =
    role === 'player'
      ? [
          { id: 'stats', label: 'Stats' },
          { id: 'notes', label: 'Notes' },
        ]
      : [{ id: 'notes', label: 'Notes' }];

  const [openSide, setOpenSide] = useState<DrawerSide | null>(null);
  const [leftTab, setLeftTab] = useState(leftTabs[0]?.id ?? 'scene');
  const [rightTab, setRightTab] = useState(rightTabs[0]?.id ?? 'notes');
  const [tokenName, setTokenName] = useState('');
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [statsTokenId, setStatsTokenId] = useState<string | null>(null);
  const editCommitted = useRef(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'Escape') {
        setOpenSide(null);
        setStatsTokenId(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function toggleLeft(tabId: string): void {
    if (openSide === 'left' && leftTab === tabId) {
      close();
      return;
    }
    setLeftTab(tabId);
    setStatsTokenId(null);
    setOpenSide('left');
  }

  function changeLeftTab(tabId: string): void {
    if (tabId !== leftTab) setStatsTokenId(null);
    setLeftTab(tabId);
  }

  function toggleRight(tabId: string): void {
    if (openSide === 'right' && rightTab === tabId) {
      close();
      return;
    }
    setStatsTokenId(null);
    setRightTab(tabId);
    setOpenSide('right');
  }

  function close(): void {
    setOpenSide(null);
    setStatsTokenId(null);
  }

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
    if (name && name !== token.label) onRenameToken(token.id, name);
  }

  function cancelRename(): void {
    editCommitted.current = true;
    setEditingTokenId(null);
    setDraftName('');
  }

  const activeLeftLabel = leftTabs.find((tab) => tab.id === leftTab)?.label ?? '';
  const hasGrid = Boolean(room.scene.grid);

  const gmTokens = room.tokens.filter((token) => token.kind !== 'player');
  const playerTokens = room.tokens.filter((token) => token.kind === 'player');
  const statsToken = statsTokenId
    ? room.tokens.find((token) => token.id === statsTokenId) ?? null
    : null;
  const rightTitle = rightTab === 'stats' ? 'Stats' : 'Notes';
  const self = room.participants.find((participant) => participant.id === selfId) ?? null;
  const selfToken =
    room.tokens.find(
      (token) => token.kind === 'player' && token.ownerId === selfId,
    ) ?? null;

  return (
    <>
      {openSide !== 'left' ? (
        <nav className="drawer-rail drawer-rail-left" aria-label="Left session drawers">
          {leftTabs.map((tab) => (
            <button
              key={tab.id}
              className="drawer-rail-tab"
              type="button"
              aria-expanded={false}
              onClick={() => toggleLeft(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      {openSide !== 'right' ? (
        <nav className="drawer-rail drawer-rail-right" aria-label="Right session drawers">
          {rightTabs.map((tab) => (
            <button
              key={tab.id}
              className="drawer-rail-tab"
              type="button"
              aria-expanded={false}
              onClick={() => toggleRight(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      ) : null}

      {openSide ? <div className="drawer-scrim" onClick={close} role="presentation" /> : null}

      {openSide === 'left' ? (
        <aside className="session-drawer session-drawer-left" aria-label={activeLeftLabel}>
          <div className="drawer-head">
            <strong className="drawer-title">{activeLeftLabel}</strong>
            <button className="icon-button" type="button" onClick={close} aria-label="Close drawer">
              ×
            </button>
          </div>

          {leftTabs.length > 1 ? (
            <div className="drawer-tabbar">
              {leftTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={leftTab === tab.id ? 'drawer-tab active' : 'drawer-tab'}
                  type="button"
                  onClick={() => changeLeftTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="drawer-body">
            {leftTab === 'scene' && role === 'gm' ? (
              <div className="drawer-section">
                <p className="muted small">Switch the live scene for everyone.</p>
                <div className="drawer-scene-list">
                  {room.sceneList.map((scene, index) => (
                    <button
                      key={`${scene.title}-${index}`}
                      className={
                        index === room.activeSceneIndex
                          ? 'drawer-scene active'
                          : 'drawer-scene'
                      }
                      type="button"
                      disabled={sceneBusy}
                      onClick={() => onSelectScene(index)}
                    >
                      <span className="drawer-scene-index">{index + 1}</span>
                      <span className="drawer-scene-copy">
                        <strong>{scene.title}</strong>
                        <small>{scene.hasGrid ? 'Grid ready' : 'No grid'}</small>
                      </span>
                      {index === room.activeSceneIndex ? (
                        <span className="drawer-scene-active">Live</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {leftTab === 'token' && role === 'gm' ? (
              <div className="drawer-section">
                <p className="muted small">
                  Add a red enemy or green NPC token. Each click creates an unplaced copy
                  under Active Tokens.
                </p>

                {!hasGrid ? (
                  <div className="notice warning">
                    This scene has no grid. Add one in the campaign builder before
                    launching the session.
                  </div>
                ) : null}

                <label className="field token-name-field">
                  <span>Token name</span>
                  <input
                    value={tokenName}
                    onChange={(event) => setTokenName(event.target.value.slice(0, 24))}
                    maxLength={24}
                    placeholder="Optional — defaults to Enemy 1 / NPC 1"
                  />
                  <small className="muted">Initials appear on the token.</small>
                </label>

                <div className="token-sources">
                  <button
                    className="token-source"
                    type="button"
                    disabled={!hasGrid}
                    onClick={() => {
                      onCreateToken('enemy', tokenName);
                      setTokenName('');
                    }}
                  >
                    <span className="drawer-token-shape drawer-token-shape-large" aria-hidden="true">
                      <TokenGlyph
                        shape={gmTokenShape('enemy')}
                        color={GM_TOKEN_COLORS.enemy}
                      />
                    </span>
                    <span className="token-source-copy">
                      <strong>Enemy</strong>
                      <small>Red token</small>
                    </span>
                    <span className="token-source-action">Add</span>
                  </button>

                  <button
                    className="token-source"
                    type="button"
                    disabled={!hasGrid}
                    onClick={() => {
                      onCreateToken('npc', tokenName);
                      setTokenName('');
                    }}
                  >
                    <span className="drawer-token-shape drawer-token-shape-large" aria-hidden="true">
                      <TokenGlyph
                        shape={gmTokenShape('npc')}
                        color={GM_TOKEN_COLORS.npc}
                      />
                    </span>
                    <span className="token-source-copy">
                      <strong>NPC</strong>
                      <small>Green token</small>
                    </span>
                    <span className="token-source-action">Add</span>
                  </button>
                </div>

                <div className="drawer-subhead">
                  <span className="header-label">Active Tokens</span>
                  <span className="muted small">{gmTokens.length}</span>
                </div>

                {gmTokens.length === 0 ? (
                  <p className="muted small">
                    No tokens yet. Add an enemy or NPC above.
                  </p>
                ) : (
                  <div className="drawer-token-list">
                    {gmTokens.map((token) => (
                      <div
                        key={token.id}
                        className={
                          token.hidden
                            ? 'active-token-row is-hidden'
                            : 'active-token-row'
                        }
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
                          aria-label={
                            token.cell ? `Move ${token.label}` : `Place ${token.label}`
                          }
                          onClick={() => {
                            close();
                            onStartPlacement(token.id);
                          }}
                        >
                          <DrawerCoin token={token} />
                        </button>

                        {editingTokenId === token.id ? (
                          <input
                            className="active-token-name-input"
                            value={draftName}
                            maxLength={24}
                            autoFocus
                            onChange={(event) =>
                              setDraftName(event.target.value.slice(0, 24))
                            }
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
                          <button
                            className={
                              token.hidden
                                ? 'token-action active'
                                : 'token-action'
                            }
                            type="button"
                            onClick={() =>
                              onToggleHidden(token.id, !token.hidden)
                            }
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
                          <button
                            className="token-action danger"
                            type="button"
                            onClick={() => onDeleteToken(token.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {playerTokens.length > 0 ? (
                  <>
                    <div className="drawer-subhead">
                      <span className="header-label">Players</span>
                      <span className="muted small">{playerTokens.length}</span>
                    </div>
                    <div className="drawer-token-list">
                      {playerTokens.map((token) => (
                        <div key={token.id} className="active-token-row">
                          <button
                            className={
                              token.cell
                                ? 'active-token-icon is-on-scene'
                                : 'active-token-icon'
                            }
                            type="button"
                            disabled={!hasGrid}
                            title={token.cell ? 'Move token' : 'Place token'}
                            aria-label={
                              token.cell
                                ? `Move ${token.label}`
                                : `Place ${token.label}`
                            }
                            onClick={() => {
                              close();
                              onStartPlacement(token.id);
                            }}
                          >
                            <DrawerCoin token={token} />
                          </button>
                          <span className="active-token-label">{token.label}</span>
                          <div className="active-token-actions">
                            <button
                              className="token-action"
                              type="button"
                              onClick={() => setStatsTokenId(token.id)}
                            >
                              Stats
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}

            {leftTab === 'character' && role === 'player' ? (
              <div className="drawer-section">
                <span className="eyebrow">Session name</span>
                <h3 className="drawer-character-name">{self?.name ?? 'Your character'}</h3>
                <p className="muted small">{room.title}</p>

                {selfToken ? (
                  <div
                    className={[
                      'character-token',
                      selfToken.cell ? 'is-on-scene' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <button
                      className="character-token-icon"
                      type="button"
                      disabled={!hasGrid}
                      title={selfToken.cell ? 'Move token' : 'Place token'}
                      aria-label={
                        selfToken.cell
                          ? `Move ${selfToken.label}`
                          : `Place ${selfToken.label}`
                      }
                      onClick={() => {
                        close();
                        onStartPlacement(selfToken.id);
                      }}
                    >
                      <DrawerCoin token={selfToken} large />
                    </button>
                    <span className="character-token-copy">
                      <strong>{selfToken.label}</strong>
                      <small>
                        {selfToken.cell
                          ? 'Click the token icon to move your token'
                          : 'Click the token icon to place your token'}
                      </small>
                    </span>
                  </div>
                ) : (
                  <p className="muted small">Your token will appear here shortly.</p>
                )}

                {!hasGrid ? (
                  <div className="notice warning">
                    This scene has no grid, so tokens cannot be placed here.
                  </div>
                ) : (
                  <p className="muted small">
                    While placing, use Backspace or Delete to return your token to the
                    drawer.
                  </p>
                )}
              </div>
            ) : null}

            {leftTab === 'requests' && role === 'gm' ? (
              <div className="drawer-empty">
                <span className="eyebrow">Requests</span>
                <p className="muted">
                  Movement requests and approvals will appear here in a later pass.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {openSide === 'left' && leftTab === 'token' && statsToken ? (
        <aside className="session-stats-drawer" aria-label="Token stats">
          <div className="drawer-head">
            <strong className="drawer-title">Stats</strong>
            <button
              className="icon-button"
              type="button"
              onClick={() => setStatsTokenId(null)}
              aria-label="Close stats"
            >
              ×
            </button>
          </div>
          <div className="drawer-body">
            <StatsBody token={statsToken} fallbackName="Token" />
          </div>
        </aside>
      ) : null}

      {openSide === 'right' ? (
        <aside className="session-drawer session-drawer-right" aria-label={rightTitle}>
          <div className="drawer-head">
            <strong className="drawer-title">{rightTitle}</strong>
            <button className="icon-button" type="button" onClick={close} aria-label="Close drawer">
              ×
            </button>
          </div>

          {rightTabs.length > 1 ? (
            <div className="drawer-tabbar">
              {rightTabs.map((tab) => (
                <button
                  key={tab.id}
                  className={rightTab === tab.id ? 'drawer-tab active' : 'drawer-tab'}
                  type="button"
                  onClick={() => setRightTab(tab.id)}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : null}

          <div className="drawer-body">
            {rightTab === 'stats' ? (
              <StatsBody
                token={selfToken}
                fallbackName={self?.name ?? 'Your character'}
              />
            ) : (
              <div className="drawer-empty">
                <span className="eyebrow">Notes</span>
                <p className="muted">
                  Session notes will live here in a later pass. Voice and chat stay in
                  Discord.
                </p>
              </div>
            )}
          </div>
        </aside>
      ) : null}
    </>
  );
}
