# Spotlight Toggle Plan

Status: Direction approved. Two final questions remain: deployment topology and badge emphasis.

## 1. Request

Add a session-wide **Spotlight** mode that the GM can switch between **Players** and
**GM** at any time during a live session.

- When the spotlight is on **Players**, players can move their own tokens normally.
- When the spotlight is on **GM**, players cannot move their tokens. The GM can still
  move any token, including player tokens, NPCs, and enemies.
- The active spotlight is visible to every player, but only the GM can change it.
- The GM control and the player indicator both live in the session header.

## 1a. Decisions from review

- Placement, movement, and removal of player tokens are all locked during GM spotlight.
- New sessions default to **Players**.
- The GM can move any token in either mode.
- In-progress placement cancels immediately, and the server rejects every move received
  after the switch.
- Players keep full access to drawers, tabs, notes, and stats. Only token movement and
  management are paused. This gives players something to review during the GM turn.
- If the GM disconnects, the last spotlight state remains.
- The mode is persisted on the live room and survives reloads, reconnects, and server
  restarts.
- The spotlight is session-wide, not per scene.
- The GM control is a two-segment `Players | GM` group.
- The player badge copy is `Players' spotlight` / `GM spotlight · movement paused`.
- The GM can set the mode before any players join.
- Pings stay enabled for players during GM spotlight. They are read-only and help the
  table draw attention.
- The Character drawer movement icon stays visible and is disabled with explanatory
  copy. The rest of the drawer, tabs, notes, and stats remain fully usable.
- Players get a persistent spotlight badge or alert, with no popup and nothing to click
  or acknowledge. Because the mode will switch often, avoid repeated toasts.
- A player who joins during GM spotlight cannot place their token until the mode switches
  back to Players. They can place it immediately when the mode returns.
- During Players spotlight, if the GM and the owner move the same token, the last move
  accepted by the server wins. The GM should normally leave player tokens to their owners
  and coordinate exceptions over Discord.
- Header crowding is acknowledged as a future concern as character and stats UI grows;
  keep this control compact and revisit the layout when those additions land.

## 2. Goals

- Make the current turn ownership obvious to the whole table.
- Prevent players from moving tokens while the GM is positioning in reaction to them.
- Keep the GM unrestricted at all times.
- Persist the mode for the life of the live room, including reloads, reconnects, and
  server restarts.
- Enforce the rule on the server, not only in the UI.

## 3. Non-goals for this pass

- Movement allowances, movement requests/approvals, or per-turn counters.
- Automatically locking the table when the GM disconnects.
- Per-scene spotlight state.
- Restricting pointers, pings, scene navigation, zoom, or stats.
- Saving the spotlight state into a campaign. It belongs to the live room only.
- Player ability to move NPC or other-player tokens. That remains GM-only.

## 4. Current behavior relevant to this feature

- Token movement is click-based. A player clicks their token (on the board or in the
  Character drawer), then clicks a grid square. The client sends `token:place`.
- Removing a token from the scene is `token:unplace`, triggered by the remove button,
  Backspace, or Delete while the token is selected.
- `canControlToken` currently allows the GM to control any token and a player to
  control only their own player token.
- `rooms.gridVisible` is the existing pattern for a room-wide, server-persisted
  session setting. It is stored in the `rooms` table, hydrated on server start, sent in
  `PublicRoom`, and updated through a GM-only socket event with a broadcast.
- `useRoomSocket` already handles `grid:changed`, `tokens:changed`, `scene:changed`,
  and `participants:update`, so a `spotlight:changed` handler fits the existing model.
- The GM header already has a header actions row with Grid, Join session, and End
  session. The player header has a title row with the session title and an optional GM
  offline chip.

## 4a. Deployment and remote play

The enforcement is server-side, so it behaves the same whether players are on localhost
or connecting from Reno. The GM's toggle and every player's move are requests to the
same server. The server processes them in arrival order and checks the room's current
mode at that moment. Network latency changes how quickly clients see the badge and how
long the GM control spends pending, not whether the rule is applied.

- The GM control shows a pending/disabled state until the server acknowledges and
  broadcasts the change. Do not optimistically show the new state.
- A player move that reaches the server before the toggle is processed may land. A move
  that arrives after the toggle is rejected with a non-blocking notice, and the client
  refreshes the tokens. This is the accepted last-processed-wins behavior.
- A reconnect or reload receives `room:state` with the current spotlight, so a client
  that missed the broadcast corrects itself.
- The room row and its spotlight survive a server restart.
- Socket.IO already uses the deployed origin and reconnects automatically. No new
  transport or CORS work is required. The host or reverse proxy must allow WebSocket
  upgrades at `/socket.io`; the current session already needs this.

**Deployment constraint:** the current app keeps the active room and socket state in a
single Node process. Run one server instance for now. Multiple instances or serverless
deployments would need sticky sessions and a shared room store/Socket.IO adapter. That
constraint already applies to `gridVisible`, presence, and the active room; the spotlight
does not add a new one.

## 5. Proposed behavior

### State model

The spotlight is a room-level value with two states:

```text
'players' | 'gm'
```

A new room starts on `'players'`. The state is session-wide and survives scene changes.

### Permission matrix

| Spotlight | GM | Player |
| --- | --- | --- |
| Players | Move any token | Move, place, or unplace their own player token |
| GM | Move any token; add, rename, hide, delete, and place tokens | Cannot move, place, or unplace their own token |

Pointers, pings, zoom, pan, scene viewing, token stats, and every drawer and tab remain
available to players in both modes. Only the player's own token placement, movement, and
removal controls are disabled during GM spotlight.

### UI proposal

GM header actions:

```text
SPOTLIGHT  [ Players | GM ]    [ Grid off ]  [ Join session ]  [ End session ]
```

The active segment uses the existing gold accent and also carries `aria-pressed`. The
label and the text in each segment make the state clear without relying on color.

Player header title row:

```text
Player view
Persistence Test   [ Players' spotlight ]
```

or, while the GM has it:

```text
Player view
Persistence Test   [ GM spotlight · movement paused ]
```

The player indicator is read-only. It uses a flashlight/spotlight icon plus text and is
announced through `aria-live="polite"` when it changes.

### Player feedback while locked

- The player's own token uses the existing locked-token treatment (`board-token-locked`)
  with a `not-allowed` cursor and a title such as “The GM has the spotlight.”
- Only the Character drawer's movement icon is disabled; the drawer itself, its tabs,
  stats, notes, and scene list stay fully usable.
- The remove/unplace action is hidden or disabled while locked.
- Pings remain enabled. They do not change token state and do not weaken the movement
  lock.
- The persistent player badge is the alert. On a mode change, briefly highlight or pulse
  the badge for a moment and announce the change with `aria-live`. Do not show a modal,
  toast, or anything that requires a click or acknowledgement. Since the spotlight will
  switch often, avoid repeated transient messages.

## 6. Review decisions

The original questions are resolved:

1. **Movement scope** — place, move, and remove are all locked for players during GM
   spotlight.
2. **Default** — Players.
3. **GM movement** — the GM can move any token in either mode.
4. **Mid-placement** — cancel immediately; reject every move received after the switch.
5. **Player access** — drawers, tabs, notes, and stats remain fully available. Only
   token movement and management are locked.
6. **GM disconnect** — keep the last state for this pass.
7. **Persistence** — store it on the live room and survive reloads, reconnects, and
   server restarts.
8. **Scope** — session-wide across all scenes and players.
9. **Control** — a two-segment `Players | GM` group.
10. **Copy** — `Players' spotlight` / `GM spotlight · movement paused`; refinements can
    follow after implementation review.
11. **No players connected** — the GM control remains available.

## 6a. Follow-up decisions

1. **Pings** — keep them enabled. They help players draw attention and do not change
   token state.
2. **Character drawer movement icon** — keep it visible and disable it with explanatory
   copy. Everything else in the drawer remains usable.
3. **Badge/alert** — use a persistent badge with a brief non-blocking highlight or pulse
   when the mode changes. No popup, toast, or acknowledgement. Because the mode switches
   often, avoid repeated transient messages.
4. **New players** — no placement exception. A player who joins during GM spotlight can
   place their token as soon as the mode returns to Players.

## 6b. Final questions

1. **Deployment topology.** Will the app run as a single Node/Socket.IO server instance
   (the current architecture) for this deployment? The active room and sockets are held
   in memory, so the spotlight behaves correctly on a single instance. Running multiple
   instances or serverless would require sticky sessions and shared room state, which is
   an infrastructure change beyond this feature.
   Recommendation: deploy as a single instance for now and document the constraint.

2. **Badge emphasis.** Is a persistent badge with a brief highlight/pulse when the mode
   changes acceptable, or do you prefer a completely static badge? The highlight gives a
   little attention without a popup or acknowledgement.
   Recommendation: persistent badge plus a brief highlight and `aria-live` announcement.

## 7. Concerns and suggested solutions

### Server authority

A client-only gate can be bypassed with a crafted socket message. Add the spotlight
check inside `placeToken` and `unplaceToken` in `server/rooms.ts`, where
`canControlToken` is evaluated. Return a specific error such as “The GM has the
spotlight. You cannot move your token right now.” so the client can display it.

### Several movement entry points

Players can start movement from the board token, the Character drawer, the remove
button, and Backspace/Delete. The player Scene drawer is ping-only. Gate the movement
paths through one shared `movementLocked` value
(`role === 'player' && room.spotlight === 'gm'`) rather than adding the check separately
in each handler.

**Answer to “does reducing entry points make it easier?”** Reducing them slightly
shrinks the number of client gates and test cases, but the server check is the real
enforcement. The existing UI already funnels movement through `SceneStage` and the
drawers, so a single `movementLocked` prop is manageable. Removing entry points is not
required for security and would be a UX change. Recommendation: keep the entry points
and gate them centrally. If you want a smaller surface, disabling the Character drawer
movement icon is the only optional reduction worth considering.

### Toggle versus move race

**Answer to “the simpler the better.”** Use the existing `gridVisible` pattern: the GM
toggle updates the room state and persists it, then broadcasts the change. The server
checks the current mode when it processes each `token:place` or `token:unplace`. No
client-side optimistic lock, no sequence numbers, and no extra coordination layer. A
move already processed just before the switch may land; anything processed after the
switch is rejected. This matches the accepted tolerance for real-time reactivity.

If we want the smallest possible improvement, set the in-memory mode immediately before
awaiting the database write and revert it only if the write fails. That is a one-line
behavioral improvement, not a new synchronization system. Test a simultaneous toggle
and move once, but do not build a lock/queue around it.

This works the same in a deployed single-instance environment. Remote players experience
latency on the round trip, not a different rule: the GM control waits for the server
acknowledgement, and any move processed after the toggle is rejected. See section 4a for
the deployment constraint.

### Database migration

Add an additive `spotlight_mode` enum column to `rooms` with a default of `'players'`
and `NOT NULL`. Generate the migration with `npm run db:generate`. Existing active rooms
and old rows receive the default. Update room hydration and `publicRoom`; do not leave
the value only in memory, or a server restart would silently reset it.

### Client state divergence

Drive both headers from `room.spotlight` in the socket hook, not from separate local
booleans. The GM control should show a busy/disabled state while the socket request is
in flight. On failure, keep the previous state and show `localError`. Do not optimistically
flip the UI and leave it flipped after a rejected request.

### Mid-placement cleanup

When a player receives `spotlight: 'gm'`, clear `placingTokenId`, the hover ghost, and
any selected-token remove control. The board should immediately look locked rather than
leaving a stale placement crosshair.

### Late joiners and reconnects

Include the spotlight in `room:state` and `scene:changed` payloads. A player joining
during GM spotlight must see the badge and the locked state on their first render.

### New players and simultaneous moves

- A player who joins during GM spotlight cannot place their token until the mode changes
  back to Players. There is no join-time exception. The GM can place it for them in the
  meantime.
- During Players spotlight, the GM and the owner can both move the same token. The last
  move accepted by the server wins, which matches the current behavior. No extra
  concurrency control is needed for this pass.

### Header crowding

The GM actions row already holds three controls. Add the spotlight as a compact
segmented control, allow the actions row to wrap, and verify the header at the 620px
breakpoint. On the player side, place the badge in the title row so it wraps naturally
with the session name and GM-offline chip.

### Accessibility

- Use `aria-pressed` on the two GM segments, or a radiogroup with `aria-checked`.
- The player badge is not a button. Give it `aria-live="polite"` and text that names the
  current state.
- Do not rely on color alone; the segment text and badge text carry the state.
- Keep the control keyboard reachable and visible with the existing focus styles.
- Announce the change once, not on every re-render.

### Accidental moves and confusing errors

Disable the UI before the player tries to move: locked cursor, disabled drawer icon, and
a clear title. If a stale socket message still reaches the server, show the server error
in the existing notice area and refresh the tokens.

### Campaign versus room

The spotlight is a live-table state. Do not add it to campaigns, campaign saves, or
launch payloads. Starting a fresh session creates a new room with the default mode.

## 8. Implementation plan

### Shared types

- Add `SpotlightMode = 'players' | 'gm'` to `src/shared/types.ts`.
- Add `spotlight: SpotlightMode` to `PublicRoom`.
- Extend the socket event typings if the project adds them; otherwise follow the
  existing untyped event-name pattern.

### Database

- Add `spotlightModeEnum = pgEnum('spotlight_mode', ['players', 'gm'])` and
  `spotlight: spotlightModeEnum('spotlight').notNull().default('players')` to the
  `rooms` table in `server/db/schema.ts`.
- Generate and commit the Drizzle migration.
- Read the column in `loadRoomAggregate` and include it in the `Room` interface.
- Set the default explicitly in `createRoom` or rely on the database default.

### Server

- Add `setSpotlightMode(room, mode)` in `server/rooms.ts`:
  - Update the in-memory room state immediately so the next move sees the new mode.
  - Persist with `db.update(rooms).set({ spotlight: mode })`.
  - Revert the in-memory state if persistence fails.
  - No lock, queue, or client-side optimistic sequencing. The server checks the
    current mode when each move is processed.
- Include `spotlight` in `publicRoom`.
- Update `canControlToken` (or the callers) to reject a player when the mode is `'gm'`.
- Add a `spotlight:set` socket handler:
  - Require GM role.
  - Validate the payload is `'players'` or `'gm'`.
  - Call `setSpotlightMode`.
  - Broadcast `spotlight:changed` with `{ spotlight }` to the room.
  - Return an ack with the new mode.
- Ensure the move handlers return a clear spotlight-specific error for players.

### Client socket hook

- Handle `spotlight:changed` in `useRoomSocket` by patching `room.spotlight`.
- Expose the updated room state to both pages through the existing return value.

### GM header

- Add a `SpotlightControl` component (or inline markup) to the GM header actions.
- Props: `spotlight`, `busy`, `onChange`.
- Add a `spotlightBusy` state and a `setSpotlight(next)` function using the existing
  `request('spotlight:set', { spotlight: next })` pattern.
- Show `localError` if the request fails.
- While the socket is reconnecting, keep the last known state visible and disable the
  segments. Re-enable after `room:state` re-syncs.
- Place it before the Grid control.

### Player header and movement gating

- Add the read-only spotlight badge to the player title row.
- Add an effect that clears `placingTokenId` when the spotlight becomes `'gm'`.
- Compute `movementLocked = role === 'player' && room.spotlight === 'gm'`.
- Pass the value to `SceneStage` and `SessionDrawers`, or compute it from `room` in each.
- In `SceneStage`:
  - Do not allow `onStartPlacement` for the player's own token while locked.
  - Do not place from the frame while locked.
  - Do not unplace via the remove button or Backspace/Delete while locked.
  - Use the locked token styling and a clear title.
- In `SessionDrawers`:
  - Disable only the player's Character drawer movement icon while locked.
  - Update the “Click the token icon to move your token” copy to explain the pause.
  - Keep the drawer navigation, every tab, notes, Stats, and the player Scene drawer
    pings available. Movement gating must not close or disable the drawers.
  - The GM's Token drawer move controls remain fully enabled.

### Styling

- Add `.spotlight-control`, `.spotlight-segments`, `.spotlight-segment`, and
  `.spotlight-badge` styles using the existing header label, accent, and chip patterns.
- Add a locked/GM state that uses a lock icon or amber accent, with text.
- Add a brief badge highlight/pulse when the mode changes. Disable the animation under
  `prefers-reduced-motion`.
- Add responsive wrapping for the GM actions row.
- Do not add a modal or acknowledgement-based notice.

### Documentation

- Update `README.md` and `ALPHA_IMPLEMENTATION.md` with the shortcut/behavior and the
  server-enforced movement rule.
- Keep the plan document updated with the final answers.

## 9. Acceptance criteria and test plan

Use a GM window and two player windows.

- A new room starts on Players.
- The GM sees a segmented control in the session header; clicking Players or GM
  updates both players within a moment.
- Players see the badge update to the active mode. The badge briefly highlights or
  pulses; no modal, toast, or acknowledgement appears.
- The GM control shows a pending state while the request is in flight and disables
  while the socket is reconnecting.
- On Players spotlight:
  - Each player can move, place, and unplace their own token.
  - The GM can move any token.
- On GM spotlight:
  - Both players' own tokens show the locked treatment.
  - Clicking the board token or the Character drawer movement icon does not start
    placement.
  - Backspace/Delete and the remove button do not unplace the player's token.
  - A direct `token:place` or `token:unplace` socket request from a player is rejected
    by the server.
  - The GM can move player tokens, NPCs, and enemies normally, including from the GM
    Token drawer.
  - Player pings still work, including from the Scene drawer.
  - Pointers, zoom, pan, scene drawers, every tab, notes, and stats still work.
  - The drawers remain fully usable; only the player's movement controls are disabled.
- Switching to GM while a player is mid-placement cancels the player's placement.
- Switching back to Players re-enables movement without a reload.
- A player who joins or reloads during GM spotlight sees the correct badge and is
  locked. They cannot place their token until the mode returns to Players; the GM can
  place it for them.
- During Players spotlight, if the GM and a player move the same token at nearly the
  same time, the last server-accepted move is the one everyone sees.
- The mode survives scene changes, reconnect, page reload, and a server restart.
- A stale player move rejected by the server shows a non-blocking notice and refreshes
  the token state.
- The header layout is usable at desktop and 620px widths.
- Keyboard focus reaches the GM control; `aria-pressed`/`aria-live` announce the state.
- No campaign data changes; starting a new session resets to the default.
- Remote/deployed check: connect one client from a second machine or the deployed URL,
  toggle the spotlight, confirm the badge and lock propagate, confirm a stale move is
  rejected, and confirm a reconnect re-syncs the state. Run on a single server instance.
- `npm run typecheck`, `npm run build`, and `npm audit --omit=dev` pass; no browser
  console errors.

## 10. Suggested implementation order

1. Types, room schema, migration, hydration, and `publicRoom`.
2. Server `setSpotlightMode`, socket event, and move/unplace enforcement.
3. Socket hook handling and the GM control.
4. Player badge, placement cancellation, and locked token UI.
5. Drawer/movement gating and responsive/accessibility polish.
6. Full two-player test matrix, docs, commit, and PR.

This plan is intentionally scoped to the live room. Movement allowances, movement
requests, and disconnect auto-pause remain future work.
