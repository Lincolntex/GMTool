import { useEffect, useRef, useState } from 'react';
import {
  Cards,
  Image as ImageIcon,
  Notebook,
  Triangle,
  User,
  WarningCircle,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react';
import type { PublicRoom, Role, TokenInfo } from '../../shared/types';
import { gmTokenShape } from '../../shared/shapes';
import { GM_TOKEN_COLORS, tokenInitials, tokenShapeForToken } from '../lib/tokens';
import { SessionNavButton } from './SessionNavButton';
import { TokenGlyph } from './ShapeIcon';

interface SessionNavItem {
  id: string;
  label: string;
  icon: PhosphorIcon;
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
  onPingToken?: (token: TokenInfo) => void;
  onSelectScene: (index: number) => void;
}

const GM_LEFT_TABS: SessionNavItem[] = [
  { id: 'scene', label: 'Scenes', icon: ImageIcon },
  { id: 'token', label: 'Token', icon: Triangle },
  { id: 'requests', label: 'Requests', icon: WarningCircle },
];

const PLAYER_LEFT_TABS: SessionNavItem[] = [
  { id: 'scene', label: 'Scene', icon: ImageIcon },
  { id: 'character', label: 'Character', icon: User },
  { id: 'domainCards', label: 'Domain cards', icon: Cards },
];

const RIGHT_TABS: SessionNavItem[] = [
  { id: 'notes', label: 'Notes', icon: Notebook },
];

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
  onPingToken,
  onSelectScene,
}: SessionDrawersProps) {
  const leftTabs = role === 'gm' ? GM_LEFT_TABS : PLAYER_LEFT_TABS;
  const [leftId, setLeftId] = useState<string | null>(null);
  const [rightId, setRightId] = useState<string | null>(null);
  const [tokenName, setTokenName] = useState('');
  const [editingTokenId, setEditingTokenId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');
  const [statsTokenId, setStatsTokenId] = useState<string | null>(null);
  const editCommitted = useRef(false);
  const navButtons = useRef<Record<string, HTMLButtonElement | null>>({});
  const leftIdRef = useRef<string | null>(null);
  const rightIdRef = useRef<string | null>(null);
  leftIdRef.current = leftId;
  rightIdRef.current = rightId;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if (event.key === 'Escape') {
        const left = leftIdRef.current;
        const right = rightIdRef.current;
        setLeftId(null);
        setRightId(null);
        setStatsTokenId(null);
        if (left) navButtons.current[`left:${left}`]?.focus();
        else if (right) navButtons.current[`right:${right}`]?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    const topbar = document.querySelector<HTMLElement>('.topbar');
    if (!topbar) return;
    const bar = topbar;
    const root = document.documentElement;

    function syncTopOffset(): void {
      root.style.setProperty(
        '--session-top-offset',
        `${Math.ceil(bar.getBoundingClientRect().height)}px`,
      );
    }

    syncTopOffset();
    const observer = new ResizeObserver(syncTopOffset);
    observer.observe(bar);

    return () => {
      observer.disconnect();
      root.style.removeProperty('--session-top-offset');
    };
  }, []);

  function toggleLeft(tabId: string): void {
    setStatsTokenId(null);
    setLeftId((current) => (current === tabId ? null : tabId));
  }

  function toggleRight(tabId: string): void {
    setRightId((current) => (current === tabId ? null : tabId));
  }

  function closeLeft(): void {
    const current = leftId;
    setLeftId(null);
    setStatsTokenId(null);
    if (current) navButtons.current[`left:${current}`]?.focus();
  }

  function closeRight(): void {
    const current = rightId;
    setRightId(null);
    if (current) navButtons.current[`right:${current}`]?.focus();
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

  const leftLabel = leftTabs.find((tab) => tab.id === leftId)?.label ?? '';
  const rightLabel =
    RIGHT_TABS.find((tab) => tab.id === rightId)?.label ?? 'Notes';
  const hasGrid = Boolean(room.scene.grid);

  const gmTokens = room.tokens.filter((token) => token.kind !== 'player');
  const playerTokens = room.tokens.filter((token) => token.kind === 'player');
  const placedVisibleTokens = room.tokens.filter(
    (token) => !token.hidden && token.cell,
  );
  const statsToken = statsTokenId
    ? room.tokens.find((token) => token.id === statsTokenId) ?? null
    : null;
  const self =
    room.participants.find((participant) => participant.id === selfId) ?? null;
  const selfToken =
    room.tokens.find(
      (token) => token.kind === 'player' && token.ownerId === selfId,
    ) ?? null;

  return (
    <>
      <nav className="session-nav session-nav-left" aria-label="Session tools">
        {leftTabs.map((tab) => (
          <SessionNavButton
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={leftId === tab.id}
            side="left"
            controlsId="session-drawer-left"
            buttonRef={(node) => {
              navButtons.current[`left:${tab.id}`] = node;
            }}
            onClick={() => toggleLeft(tab.id)}
          />
        ))}
      </nav>

      <nav className="session-nav session-nav-right" aria-label="Session notes">
        {RIGHT_TABS.map((tab) => (
          <SessionNavButton
            key={tab.id}
            label={tab.label}
            icon={tab.icon}
            active={rightId === tab.id}
            side="right"
            controlsId="session-drawer-right"
            buttonRef={(node) => {
              navButtons.current[`right:${tab.id}`] = node;
            }}
            onClick={() => toggleRight(tab.id)}
          />
        ))}
      </nav>

      {leftId ? (
        <aside
          id="session-drawer-left"
          className="session-drawer session-drawer-left"
          aria-label={leftLabel}
        >
          <div className="drawer-head">
            <strong className="drawer-title">{leftLabel}</strong>
            <button
              className="icon-button"
              type="button"
              onClick={closeLeft}
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>

          <div className="drawer-body">
            {leftId === 'scene' && role === 'gm' ? (
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

            {leftId === 'scene' && role === 'player' ? (
              <div className="drawer-section">
                <p className="muted small">
                  Click a placed token to ping it on your scene.
                </p>

                {placedVisibleTokens.length === 0 ? (
                  <p className="muted small">
                    No placed visible tokens on this scene.
                  </p>
                ) : (
                  <div className="player-token-list">
                    {placedVisibleTokens.map((token) => (
                      <button
                        key={token.id}
                        className="player-token-row"
                        type="button"
                        aria-label={`Ping ${token.label}`}
                        title={`Ping ${token.label}`}
                        onClick={() => onPingToken?.(token)}
                      >
                        <DrawerCoin token={token} />
                        <span>{token.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {leftId === 'token' && role === 'gm' ? (
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
                    <span
                      className="drawer-token-shape drawer-token-shape-large"
                      aria-hidden="true"
                    >
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
                    <span
                      className="drawer-token-shape drawer-token-shape-large"
                      aria-hidden="true"
                    >
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
                            token.cell
                              ? `Move ${token.label}`
                              : `Place ${token.label}`
                          }
                          onClick={() => {
                            closeLeft();
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
                              closeLeft();
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

            {leftId === 'requests' && role === 'gm' ? (
              <div className="drawer-empty">
                <span className="eyebrow">Requests</span>
                <p className="muted">
                  Movement requests and approvals will appear here in a later pass.
                </p>
              </div>
            ) : null}

            {leftId === 'character' && role === 'player' ? (
              <div className="drawer-section">
                <span className="eyebrow">Session name</span>
                <h3 className="drawer-character-name">
                  {self?.name ?? 'Your character'}
                </h3>
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
                        closeLeft();
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

                <div className="drawer-subhead">
                  <span className="header-label">Stats</span>
                </div>
                <StatsBody
                  token={selfToken}
                  fallbackName={self?.name ?? 'Your character'}
                />
              </div>
            ) : null}

            {leftId === 'domainCards' && role === 'player' ? (
              <div className="drawer-empty">
                <span className="eyebrow">Domain cards</span>
                <p className="muted">
                  Daggerheart domain cards will appear here when the character system
                  is implemented.
                </p>
              </div>
            ) : null}
          </div>
        </aside>
      ) : null}

      {leftId === 'token' && role === 'gm' && statsToken ? (
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

      {rightId ? (
        <aside
          id="session-drawer-right"
          className="session-drawer session-drawer-right"
          aria-label={rightLabel}
        >
          <div className="drawer-head">
            <strong className="drawer-title">{rightLabel}</strong>
            <button
              className="icon-button"
              type="button"
              onClick={closeRight}
              aria-label="Close drawer"
            >
              ×
            </button>
          </div>
          <div className="drawer-body">
            <div className="drawer-empty">
              <span className="eyebrow">Notes</span>
              <p className="muted">
                Session notes will live here in a later pass. Voice and chat stay in
                Discord.
              </p>
            </div>
          </div>
        </aside>
      ) : null}
    </>
  );
}
