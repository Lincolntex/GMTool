# Spotlight Toggle Plan

Status: Proposed — awaiting answers to the open questions.

## 1. Request

Add a session-wide **Spotlight** mode that the GM can switch between **Players** and
**GM** at any time during a live session.

- When the spotlight is on **Players**, players can move their own tokens normally.
- When the spotlight is on **GM**, players cannot move their tokens. The GM can still
  move any token, including player tokens, NPCs, and enemies.
- The active spotlight is visible to every player, but only the GM can change it.
- The GM control and the player indicator both live in the session header.

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

## 5. Proposed behavior

### State model

The spotlight is a room-level value with two states:

```text
'players' | 'gm'
```

A new room starts on `'players'` unless the open questions change that. The state is
session-wide and survives scene changes.

### Permission matrix

| Spotlight | GM | Player |
| --- | --- | --- |
| Players | Move any token | Move, place, or unplace their own player token |
| GM | Move any token; add, rename, hide, delete, and place tokens | Cannot move, place, or unplace their own token |

Pointers, pings, zoom, pan, scene viewing, token stats, and drawer browsing remain
available to players in both modes.

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
- The Character drawer token icon is disabled with copy explaining that movement is
  paused.
- The remove/unplace action is hidden or disabled while locked.
- A short-lived notice near the board is optional: “The GM has the spotlight. Your
  token movement is paused.” It should not require dismissal.

## 6. Open questions

1. **Does “move” include placing and unplacing?**
   Recommendation: block all three for players during GM spotlight — placing from the
   drawer, moving on the board, and returning the token to the drawer. Removing a token
   changes the battlefield just as much as moving it.

2. **What is the default at launch?**
   Recommendation: **Players**, so a new table can start moving immediately. The GM can
   switch to GM spotlight whenever setup or reactions require it.

3. **Can the GM move player tokens during Player spotlight?**
   Recommendation: yes. The request says the GM can move any token regardless of the
   toggle, and the existing `canControlToken` already permits this.

4. **What should happen if a player is mid-placement when the GM takes the spotlight?**
   Recommendation: cancel the player's selection immediately and reject any move that
   reaches the server after the toggle. Do not allow the in-flight move to land.

5. **How much player feedback do you want?**
   Recommendation: the persistent header badge plus a locked cursor/title and disabled
   drawer control. Add a transient board notice only if you want a stronger signal.

6. **What happens if the GM disconnects while the spotlight is on Players?**
   Recommendation: keep the last state for this pass. The development plan mentions a
   future disconnect pause; that should be a separate rule with a timeout.

7. **Should the mode survive reloads, reconnects, and server restarts?**
   Recommendation: yes. Persist it on the live room, like `gridVisible`, and include it
   in `PublicRoom` and `room:state`.

8. **Is the spotlight session-wide or per scene?**
   Recommendation: session-wide. It is a table state, not a property of a map.

9. **Is the two-segment `Players | GM` control acceptable, or do you want a single
   on/off toggle?**
   Recommendation: two segments. It names both states directly and avoids ambiguity
   about whether “on” means the GM or the players.

10. **What exact player-facing copy do you want?**
    Recommendation: `Players' spotlight` / `GM spotlight · movement paused`, with the
    full sentence in the tooltip and screen-reader text.

11. **Should the GM control remain available when no players are connected?**
    Recommendation: yes. The GM may want to set the mode before players join.

## 7. Concerns and suggested solutions

### Server authority

A client-only gate can be bypassed with a crafted socket message. Add the spotlight
check inside `placeToken` and `unplaceToken` in `server/rooms.ts`, where
`canControlToken` is evaluated. Return a specific error such as “The GM has the
spotlight. You cannot move your token right now.” so the client can display it.

### Several movement entry points

Players can start movement from the board token, the Character drawer, the player token
list, the remove button, and Backspace/Delete. Gate them through one shared
`movementLocked` value (`role === 'player' && room.spotlight === 'gm'`) rather than
adding the check separately in each handler. Test every entry point.

### Toggle versus move race

If the GM toggles while a player is moving, the server order determines the result.
Make the in-memory room state take effect as soon as the GM toggle is accepted, then
persist it. If the database write fails, revert and report the error. Reject moves that
arrive after the switch. Test with a simultaneous toggle and move.

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
  - Disable the player's Character token icon and token-list move buttons while locked.
  - Update the “Click the token icon to move your token” copy to explain the pause.
  - Keep Stats and the player Scene drawer pings available.

### Styling

- Add `.spotlight-control`, `.spotlight-segments`, `.spotlight-segment`, and
  `.spotlight-badge` styles using the existing header label, accent, and chip patterns.
- Add a locked/GM state that uses a lock icon or amber accent, with text.
- Add responsive wrapping for the GM actions row.
- Add an optional `.spotlight-notice` only if the transient banner is approved.

### Documentation

- Update `README.md` and `ALPHA_IMPLEMENTATION.md` with the shortcut/behavior and the
  server-enforced movement rule.
- Keep the plan document updated with the final answers.

## 9. Acceptance criteria and test plan

Use a GM window and two player windows.

- A new room starts on the agreed default mode.
- The GM sees a segmented control in the session header; clicking Players or GM
  updates both players within a moment.
- Players see the badge update to the active mode.
- On Players spotlight:
  - Each player can move, place, and unplace their own token.
  - The GM can move any token.
- On GM spotlight:
  - Both players' own tokens show the locked treatment.
  - Clicking the board token, the Character drawer icon, or a token-list move control
    does not start placement.
  - Backspace/Delete and the remove button do not unplace the player's token.
  - A direct `token:place` or `token:unplace` socket request from a player is rejected
    by the server.
  - The GM can move player tokens, NPCs, and enemies normally.
  - Pings, pointers, zoom, pan, scene drawers, stats, and chat-like actions still work.
- Switching to GM while a player is mid-placement cancels the player's placement.
- Switching back to Players re-enables movement without a reload.
- A player who joins or reloads during GM spotlight sees the correct badge and is
  locked.
- The mode survives scene changes, reconnect, page reload, and a server restart.
- The header layout is usable at desktop and 620px widths.
- Keyboard focus reaches the GM control; `aria-pressed`/`aria-live` announce the state.
- No campaign data changes; starting a new session resets to the default.
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
