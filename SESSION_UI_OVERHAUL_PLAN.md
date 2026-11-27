# Session UI Overhaul Plan

Status: Implemented

> **Layout revision:** The reviewed layout places both icon rails beneath the app top bar
> instead of running them the full height of the viewport. Each drawer is attached to its rail
> and opens directly from it, overlaying both the session header and the scene map. The header
> is no longer kept uncovered. The scene keeps its existing size and position, and the left and
> right drawers remain independent. Where later sections still describe full-height rails or a
> protected header, this revision supersedes them.

## Goal

Replace the current text-tab session drawers with persistent icon rails that run from the bottom of the app top bar to the bottom of the viewport and frame the session area. Rework the player session tools around Scene, Character, Domain cards, and Notes.

The app title and session heading sit beneath the top bar. An open drawer may cover the heading; no space is reserved to keep it visible.

The rails never collapse. Clicking an icon slides its drawer out from the rail and over the session header and scene map. The scene map keeps its existing size and position; it is not pushed or shrunk.

Both the left and right drawers can be open at the same time. This supports lore-heavy sections where the scene is less important. Opening both covers more of the scene, but the scene remains the same size underneath.

The GM keeps the current scene, token, request, and notes tools, but the navigation becomes icon-first. The player gains a placed-token list and a local-only token ping.

This is a client UI change. No database or server payload changes are required.

---

## 1. Current state

Relevant files:

- `src/client/components/SessionDrawers.tsx`
  - Left text rail: GM `Scene`, `Token`, `Requests`; player `Character`.
  - Right text rail: GM `Notes`; player `Stats`, `Notes`.
  - GM token stats panel.
  - Player Stats/Notes tab bar.
- `src/client/pages/GmSessionPage.tsx`
  - Passes drawer props and handles token/grid/scene actions.
- `src/client/pages/SessionPage.tsx`
  - Player session shell and token placement callbacks.
- `src/client/components/SceneStage.tsx`
  - Renders board tokens, pointers, and broadcast pings.
- `src/client/hooks/useRoomSocket.ts`
  - Maintains room state and broadcast pings.
- `src/client/styles.css`
  - Drawer rail, drawer panel, stats, and responsive styles.

The current rails are text buttons. Drawers overlay the scene and the rail disappears while a drawer is open.

The new layout changes the navigation, not the scene size: the rails become the app borders, the drawers overlay the scene map, and the scene keeps its current dimensions.

The title and session heading move beneath the top bar and are no longer protected from drawer overlays.

---

## 2. Target navigation model

Use a **persistent icon rail** on each side of the session:

- Left rail for primary session tools.
- Right rail for notes.
- The rails are fixed to the screen edges, start beneath the app top bar, and run to the bottom of the viewport.
- The rails never collapse.
- The app title and session heading sit beneath the top bar and may be covered by an open drawer.
- Each drawer is attached to its rail and opens directly from it.
- The drawer is the collapsible part.
- Clicking an icon opens its drawer.
- Clicking the active icon closes that side's drawer.
- Clicking another icon on the same side swaps that side's drawer content.
- The left and right drawers are independent. Both can be open at the same time.
- Opening or closing one side never changes the other side's open state.
- Drawers overlay the scene map; they do not resize or reposition it.
- Hovering or focusing an icon shows its tab name in a tooltip.
- The drawer title also shows the full tab name.

### Layout

The app title and session heading sit beneath the top bar, inside the central area between the rails. An open drawer may cover the heading; no space is reserved to keep it visible.

The drawers overlay both the session header and the scene map. This keeps the layout compact instead of permanently reserving a header band.

```text
┌────────────────────────────────────────────────────────────┐
│ app top bar                                                │
├──────┬──────────────────────────────────────────────┬──────┤
│ rail │ session heading                              │ rail │
│      ├──────────────────────────────────────────────┤      │
│      │ scene map with drawers overlaying it         │      │
└──────┴──────────────────────────────────────────────┴──────┘
```

The scene map occupies the full width between the rails. Each drawer is attached to its rail and opens from it, over the heading and scene.

```text
both closed:
┌────────┬──────────────────────────────────────────┬────────┐
│ rail   │               scene map                  │ rail   │
└────────┴──────────────────────────────────────────┴────────┘

both open:
┌────────┬──────────────┬──────────────┬──────────────┬────────┐
│ rail   │ left drawer  │ scene visible│ right drawer │ rail   │
│        │ overlaying   │ underneath   │ overlaying    │        │
└────────┴──────────────┴──────────────┴──────────────┴────────┘
```

- Rail width: `56px` desktop.
- Icon button: `40px × 40px`.
- Drawer width: `320px` to `360px` each.
- Drawers slide out from their rails over the header and scene map.
- The scene map keeps its size and position; it does not flex, shrink, or shift.
- The GM stats sub-panel opens beside the left drawer.
- There is no scrim. The drawers themselves are the only overlay.
- The rails begin beneath the top bar, so the app title stays visible when drawers are open.
- On narrow screens, cap the drawer widths so the uncovered part of the scene remains usable. Do not move the scene.
- Drawers run from the bottom of the top bar to the bottom of the viewport.

---

## 3. Icon library

Use **`@phosphor-icons/react`**.

Why:

- MIT licensed and tree-shakeable with Vite.
- Simple geometric silhouettes.
- Supports regular, bold, and filled weights.
- Covers every requested concept with one visual family.
- `currentColor` works with the existing CSS theme.

Prioritize the icon silhouette over a filled style. Use a simple outlined/bold glyph at 22px rather than a heavy filled icon:

```tsx
<Image weight="bold" size={22} aria-hidden="true" />
```

- Start with Phosphor's regular or bold weight.
- Use `weight="fill"` only when an outline is illegible at the target size.
- Do not use duotone, thin, or light variants.
- Active state is communicated with background/border, not by switching to a filled icon.
- If an outline is too weak at 22px, increase to `bold` before switching to `fill`.
- If Phosphor lacks the requested silhouette, generate a small custom SVG in the same 24×24 grid and visual weight.

### Icon mapping

| Role | Tab | Icon | Phosphor export | Notes |
|---|---|---|---|---|
| GM | Scenes | Picture | `Image` | Same visual family as the player Scene icon |
| GM | Token | Triangle | `Triangle` | Simple triangle silhouette |
| GM | Requests | Exclamation | `WarningCircle` | Circle with exclamation; avoids confusion with the token triangle |
| GM | Notes | Book/page | `Notebook` | Shared notes icon |
| Player | Scene | Picture | `Image` | Top item in the player left rail |
| Player | Character | Player | `User` | Character stats and token placement |
| Player | Domain cards | Playing card | `Cards` | Placeholder until Daggerheart domain support |
| Player | Notes | Book/page | `Notebook` | Must match the GM Notes icon |

If a requested glyph is not available in Phosphor, create a small local SVG in `ShapeIcon` style rather than mixing icon libraries. Keep the fallback within the same 24×24 grid and silhouette weight. A custom icon is the final fallback, not the first choice.

---

## 4. Icon rail component

Create a small reusable component, for example `src/client/components/SessionNavButton.tsx`.

Props:

```ts
interface SessionNavButtonProps {
  id: string;
  label: string;
  icon: PhosphorIcon;
  active: boolean;
  side: 'left' | 'right';
  onClick: () => void;
}
```

Behavior:

- Renders a `<button type="button">`.
- Uses `aria-label={label}`.
- Uses `aria-expanded={active}`.
- Uses `aria-controls` pointing at the drawer panel ID.
- Uses `title` as a native fallback, plus a CSS tooltip.
- Tooltip is shown on hover and `:focus-visible`.
- Tooltip position: right of the left rail, left of the right rail.
- Active state uses an accent background and accent icon color.
- Inactive icons use muted color.
- Icon is `aria-hidden="true"`; the button label carries the accessible name.

Tooltip structure:

```tsx
<button
  className={active ? 'session-nav-button active' : 'session-nav-button'}
  type="button"
  aria-label={label}
  aria-expanded={active}
  data-tooltip={label}
>
  <Icon weight="bold" size={22} aria-hidden="true" />
</button>
```

```css
.session-nav-button::after {
  content: attr(data-tooltip);
  /* visually hidden until hover/focus-visible */
}
```

Do not rely on `title` alone for the visible tooltip. Keep `title` only as a native fallback.

---

## 5. GM session navigation

### Left rail

Order:

1. **Scenes** — `Image`
2. **Token** — `Triangle`
3. **Requests** — `WarningCircle`

Drawer contents:

- **Scenes**: existing scene list, live indicator, and scene switching.
- **Token**: existing Active Tokens management and token creation.
- **Requests**: existing movement-request placeholder.

The GM token drawer keeps:

- Add Enemy / Add NPC.
- Active Tokens list.
- Inline rename.
- Hide / Show.
- Stats.
- Delete.
- Players section with Stats.

No behavior changes to token management in this pass.

### Right rail

- **Notes** — `Notebook`.

Drawer content remains the existing placeholder.

### GM stats panel

The existing smaller stats panel remains. It opens beside the left drawer and accounts for both the fixed rail and the expanded token drawer:

```text
left rail 56px + token drawer width
```

It overlays the scene map beside the left drawer, but it must not cover the left rail or the session heading. When both drawers are open, clamp it so it does not cover the right drawer. It stays below the icon rail tooltips and above the board content.

---

## 6. Player session navigation

### Left rail

Order:

1. **Scene** — `Image`
2. **Character** — `User`
3. **Domain cards** — `Cards`

### Right rail

- **Notes** — `Notebook`, matching the GM Notes icon.

The player Stats tab is removed entirely.

---

## 7. Player Scene drawer: Active tokens

Add a player-only Scene drawer at the top of the left rail.

Content:

- Title: `Scene` or `Active tokens`.
- A short hint: `Click a placed token to ping it.`
- A list of all **placed** tokens visible to the player on the active scene.
- Each row contains only:
  - The token glyph.
  - The token name.
- No Hide, Stats, Delete, rename, or placement controls.
- No player controls at all.

Filtering:

```ts
room.tokens.filter((token) => !token.hidden && token.cell)
```

Only placed tokens are listed. An unplaced token is either waiting to enter the scene or is no longer active, so it should not appear in the player Active tokens list.

The server currently sends hidden tokens to all clients; the player client must continue filtering them. The project is personal-use only and the table is not expected to inspect socket payloads, so client-side filtering is an accepted risk for this pass.

Ordering:

- Preserve the token order from the room payload.
- This matches board layering and the GM Active Tokens order.

Row behavior:

- Every visible row is placed and is a button.
- Clicking it triggers a local-only ping at the token’s square.
- Rows show only the token and name.

Empty state:

- `No placed visible tokens on this scene.`

Live updates:

- `tokens:changed` already refreshes room state.
- Hidden tokens disappear from the list when the GM hides them.
- Revealed tokens appear automatically.
- Unplaced tokens are omitted until the GM places them.
- When a token leaves the scene, its row disappears.

---

## 8. Player local token ping

The ping must be visible only to the player who clicked the token.

No socket event, server mutation, or broadcast is involved.

### State

Keep local ping state in `SessionPage`:

```ts
interface LocalTokenPing {
  id: string;
  tokenId: string;
  cell: TokenCell;
  color: string;
  shape: TokenShape;
}
```

Add:

- `localPing` state.
- A timeout that clears the ping after about `1400ms`.
- A new ping replaces the previous one and resets the timer.
- Snapshot the token’s cell at click time.
- Clear the ping on scene change and unmount.
- Also clear the ping if the token is removed or moves while the ping is visible. This avoids a delayed effect pointing at an old square.

### Rendering

Pass `localPing` to `SceneStage`.

`SceneStage` already has the active grid geometry and `cellCenter`. Render the local ping:

- At the center of the token’s cell.
- Using the token’s color and shape outline.
- Using the existing ping ring/shape visual language.
- Above the token but below the pointer layer.
- With a short fade/scale animation.

Suggested class:

```text
ping ping-shape ping-local
```

The local ping should not be added to the `pings` array from `useRoomSocket`, because that array represents broadcast pings.

### Accessibility

- Row button label: `Ping {token.label}`.
- Add a visually hidden `aria-live="polite"` message such as `Pinged Goblin`.
- Do not rely on color alone; the token glyph remains visible in the list.

---

## 9. Player Character drawer

Move the character content into the Character drawer.

The drawer contains:

1. **Character heading**
   - Session name.
   - Room title.
   - Player token placement card.
2. **Stats**
   - Reuse the existing placeholder stats body.
   - Heading: `Stats`.
   - `Daggerheart stats and abilities will appear here in a later pass.`
3. **Token placement help**
   - Keep the existing click-the-icon placement behavior.
   - Keep the no-grid warning.

The existing player right-side Stats tab and stats drawer are removed.

The Character tab icon is `User`.

---

## 10. Player Domain cards drawer

Add a placeholder drawer with the `Cards` icon.

Content:

- Title: `Domain cards`.
- Placeholder copy: `Daggerheart domain cards will appear here when the character system is implemented.`

No data model, server payload, or card UI is added yet.

---

## 11. Notes

Both roles use a single right-side Notes drawer with the `Notebook` icon.

- GM Notes and player Notes use the same icon.
- No tab bar is needed on the right.
- The right drawer title is `Notes`.
- The existing placeholder copy remains.

---

## 12. Component and state changes

### `SessionDrawers.tsx`

Replace the text rail model with icon metadata:

```ts
interface SessionNavItem {
  id: string;
  label: string;
  icon: PhosphorIcon;
  side: 'left' | 'right';
}
```

Role-based items:

```ts
const gmLeft = [
  { id: 'scene', label: 'Scenes', icon: Image },
  { id: 'token', label: 'Token', icon: Triangle },
  { id: 'requests', label: 'Requests', icon: WarningCircle },
];

const playerLeft = [
  { id: 'scene', label: 'Scene', icon: Image },
  { id: 'character', label: 'Character', icon: User },
  { id: 'domainCards', label: 'Domain cards', icon: Cards },
];
```

Keep independent open-tab state for each side:

```ts
const [leftTabId, setLeftTabId] = useState<string | null>(null);
const [rightTabId, setRightTabId] = useState<string | null>(null);
```

Both may be non-null at the same time. Clicking a nav icon only changes that side. Clicking the active icon sets that side's ID to `null`.

The drawer state only controls overlay visibility. It does not change the scene map's size or position.

```text
no drawer     -> scene fully visible
left drawer   -> left portion of scene covered
right drawer  -> right portion of scene covered
both drawers  -> both side portions covered; scene size unchanged
```

New props:

```ts
onPingToken?: (token: TokenInfo) => void;
```

Only the player session passes it.

### `SessionPage.tsx`

- Add local ping state and timer.
- Pass `onPingToken` to `SessionDrawers`.
- Pass `localPing` to `SceneStage`.
- Clear local ping when `room.activeSceneIndex` changes.
- Clear local ping if the pinged token is removed or moves.
- No scene-size state is needed for drawer visibility.

### `SceneStage.tsx`

- Accept `localPing?: LocalTokenPing | null`.
- Render local ping at the cell center.
- Do not emit any socket event for the local ping.

### `useRoomSocket.ts`

No changes required. Broadcast pings stay separate from local pings.

### `GmSessionPage.tsx`

- Continue passing the existing GM action callbacks.
- No new server actions.

---

## 13. CSS changes

Add:

```css
.session-workspace
.session-body
.session-nav
.session-nav-left
.session-nav-right
.session-nav-button
.session-nav-button.active
.session-nav-button::after
.session-nav-button:hover::after
.session-nav-button:focus-visible::after
.session-drawer-pane
.session-drawer-pane.open
.session-stats-drawer
.player-token-list
.player-token-row
.ping-local
```

Update:

- Fix the rails to the viewport edges from below the top bar to the bottom.
- Inset the session content by the rail width so the rails do not cover it.
- Let drawers overlay the session header and scene map.
- Remove text-tab-specific styles that are no longer used.
- Keep the scene map at its current size and position.
- Position drawer panes fixed to the viewport, flush with their rail.
- Left drawer: `left` equals the left rail width; right drawer: `right` equals the right rail width.
- Allow both drawer panes to be open at once.
- Animate each drawer with transform/opacity, not width.
- Do not use flex/grid width changes that shrink the scene.
- Adjust the GM stats panel offset to include the fixed rail and open token drawer.
- Add responsive rail width and drawer width rules.
- Keep the rails' vertical start in sync with the measured top bar height.
- Respect `prefers-reduced-motion` for the drawer and ping animations.
- Hide tooltips on coarse-pointer devices if they interfere with touch, but keep `aria-label`.

Suggested visual treatment:

- Rail background: dark translucent panel matching the topbar.
- Rail border: existing `--border`.
- Icon button border radius: `10px`.
- Active icon: accent background with accent-strong icon.
- Hover: subtle white overlay.
- Tooltip: dark pill, high contrast, small text, no arrow required.

---

## 14. Accessibility

- Use `<nav aria-label="Session tools">` for each rail.
- Every icon is a real `<button>` with an accessible name.
- `aria-expanded` reflects drawer state.
- `aria-controls` points to the drawer panel.
- `aria-current="page"` or `aria-pressed` is acceptable for the active tool, but use only one pattern consistently.
- Tooltips appear on hover and keyboard focus.
- Escape closes the open drawer.
- Closing via Escape returns focus to the active nav button.
- Drawer close button has an accessible label.
- Player token rows are buttons with `aria-label="Ping Goblin"`.
- Only placed tokens are rendered, so there are no disabled token rows.
- Add an `aria-live` status for the last local ping.
- Keep the session heading before the workspace in DOM order so the title and controls remain immediately reachable.
- Verify tab order: session header, left rail, drawer controls, scene, right rail.
- Do not communicate active state by color alone; use background, border, and/or icon weight.
- When a drawer closes, the scene returns to its previous width and the focus returns to the controlling icon.

---

## 15. Testing plan

### GM

- Scenes icon opens the scene drawer.
- Token icon opens token management.
- Requests icon opens the request placeholder.
- Notes icon opens notes.
- Hover and keyboard focus show the correct tooltip.
- Clicking the active icon closes its drawer.
- Switching icons swaps content without closing the drawer.
- Opening the right drawer does not close the left drawer, and vice versa.
- Both drawers can be open at the same time.
- Left drawer overlays the left side of the scene map.
- Right drawer overlays the right side of the scene map.
- The scene map keeps the same size and position with either or both drawers open.
- With both drawers open, more of the scene is covered, but the scene size is unchanged.
- The app top bar stays visible above the rails and drawers.
- Open drawers can cover the session heading, campaign name, controls, and table strip.
- No full-screen scrim is added; the drawer is the only overlay.
- Drawers start below the top bar and run to the bottom of the viewport on all sizes.
- GM stats sub-panel opens beside the token drawer and is not clipped by the rail.
- With both drawers open, the stats panel does not cover the right drawer.
- Existing token create/place/rename/hide/stats/delete still work.

### Player

- Left rail order is Scene, Character, Domain cards.
- Scene drawer lists only placed, visible tokens.
- Hidden tokens never appear.
- Unplaced tokens are omitted.
- Revealed tokens appear without a refresh.
- Token rows show only the glyph and name.
- Placed-token click produces a local ping at the correct cell.
- The ping disappears after roughly 1.4 seconds.
- Repeated clicks reset the timer.
- Moving or removing the token clears the local ping.
- The GM and other players do not see the local ping.
- Character drawer contains token placement and stats placeholder.
- Domain cards drawer shows the placeholder.
- Stats tab is gone.
- Notes uses the same icon as the GM Notes tab.

### Cross-cutting

- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev`
- No browser console errors.
- Desktop and narrow viewport checks.
- Verify the session heading remains visible and unobstructed at all drawer states.
- Keyboard-only navigation check.
- Verify the scene remains reachable when a drawer is closed.
- Verify drawer overlay animations respect `prefers-reduced-motion`.
- Verify icon silhouettes are legible at 22px without relying on filled icons.

---

## 16. Rollout sequence

### Phase 1 — Icon foundation and overlay layout

- Add `@phosphor-icons/react`.
- Create `SessionNavButton`.
- Add fixed rail and tooltip CSS below the top bar.
- Add the session workspace below the session heading.
- Add drawer panes attached to the rails that overlay the header and scene map.
- Verify the scene map keeps its size and position as drawers open.
- Verify the top bar stays visible above the overlay.
- Replace the text rails without changing drawer content.

### Phase 2 — GM navigation

- Wire GM Scenes, Token, Requests, and Notes.
- Verify the stats sub-panel offset.
- Confirm existing token actions are unchanged.
- Verify independent left/right drawers, both-open overlay behavior, and unchanged scene size.

### Phase 3 — Player navigation

- Add Scene, Character, Domain cards, and Notes.
- Move stats into Character.
- Remove the player Stats tab.
- Add the Domain cards placeholder.

### Phase 4 — Player active tokens and local ping

- Filter to placed, visible tokens.
- Add the player token list.
- Add local ping state and rendering.
- Clear local ping on scene change, token move, or token removal.
- Add accessibility announcement.

### Phase 5 — Polish and verification

- Responsive and keyboard checks.
- Remove obsolete rail CSS.
- Update `README.md` and `ALPHA_IMPLEMENTATION.md`.
- Open a pull request to `main`.

---

## 17. Acceptance criteria

The overhaul is complete when:

- Both session roles use icon-only side navigation with hover/focus tooltips.
- The rails are fixed to the screen edges beneath the top bar.
- The rails never collapse.
- The app title and session heading sit beneath the top bar and may be covered by a drawer.
- Clicking a nav icon slides its drawer out from the rail and over the header and scene map.
- The scene map keeps the same size and position whether drawers are open or closed.
- Both drawers can be open at the same time.
- Both drawers open covers more of the header and scene map, but does not resize the scene.
- Drawers attach directly to their rails.
- No full-screen scrim is added.
- No text tab bar remains in the session drawers.
- GM icons match: picture, triangle, exclamation, notebook.
- Player icons match: picture, player, playing cards, notebook.
- Icons prioritize simple silhouettes over filled styles.
- The player Scene drawer lists only placed, visible tokens.
- Player token rows show only token glyph and name.
- Clicking a placed token pings it locally for that player only.
- Hidden tokens are absent from the player Active tokens list.
- Character stats live in the Character drawer.
- The player Stats tab is removed.
- Domain cards has a placeholder drawer.
- Notes uses the same icon for GM and player.
- Existing scene, token, grid, pointer, and join behavior remains intact.
- Typecheck, production build, and browser smoke tests pass.

---

## 18. Risks and decisions

| Item | Decision |
|---|---|
| Icon library | `@phosphor-icons/react`, outline/bold silhouettes first |
| Requests icon | `WarningCircle` to avoid reusing the token triangle |
| Domain cards icon | Phosphor `Cards`; custom SVG fallback if needed |
| Active tokens list | Only placed, visible tokens |
| Local ping | Client-only state, no socket event |
| Ping duration | About 1.4 seconds, matching existing pings |
| Ping stale state | Clear on scene change, token move, or token removal |
| Stats tab | Removed; stats moved into Character |
| Notes icon | Shared `Notebook` icon |
| Rails | Fixed beneath the top bar; never collapse |
| Drawers | Attached to their rails; overlay the header and scene map with no resize or reposition |
| Open drawers | Independent; both may be open |
| Header | Beneath the top bar; may be covered by a drawer |
| Scene size | Unchanged when drawers open or close |
| Scrim | No full-screen scrim |
| Hidden-token privacy | Client-side filtering accepted for personal use |
| Server changes | None |
| Database changes | None |

---

## 19. Risk management decisions

1. **Hidden tokens**
   - This is a personal-use app. Players are not expected to inspect socket payloads.
   - Keep client-side filtering. Do not add server-side role filtering in this pass.
   - Document this as a known limitation rather than a security boundary.

2. **Local ping**
   - Use a separate `localPing` state.
   - Do not reuse the broadcast `pointer:ping` event.
   - Verify with two clients that only the clicking player sees the ping.

3. **Migration risk**
   - Split the work into the phases above.
   - Verify GM token management immediately after the navigation shell change.
   - Run regression tests for create, place, rename, hide, stats, delete, and scene switching.

4. **Layout risk**
   - Make the rails fixed from below the top bar to the viewport bottom.
   - Let drawers overlay the session header and scene map.
   - Attach each drawer flush to its rail.
   - Overlay each drawer on top of the scene map; do not resize or reposition the scene.
   - Use CSS variables for rail width and drawer width.
   - Test left-only, right-only, both-open, and both-closed states.
   - Test GM stats panel offset and narrow viewports.
   - Test that the rails track the top bar height on narrow viewports.

5. **Collapse behavior**
   - The rails themselves do not collapse.
   - The drawer is the collapsible element.
   - Clicking the active icon collapses the drawer and uncovers that side of the scene.
   - The scene map size and position do not change.

6. **Active tokens**
   - Only display placed, visible tokens.
   - Unplaced tokens are either waiting to enter the scene or no longer active, so they are omitted.
   - When a token is placed, it appears in the list automatically.

7. **Icon style**
   - Prioritize silhouette clarity over filled icons.
   - Start with regular/bold Phosphor glyphs.
   - Use fill only if the outline is illegible at 22px.
   - Generate a custom SVG as the final fallback.

8. **Tooltip accessibility**
   - Show tooltips on hover and `:focus-visible`.
   - Keep `aria-label` and a native `title` fallback.
   - Do not rely on hover alone.

9. **Character drawer density**
   - Use clear sections for character identity, token placement, and stats.
   - Allow the drawer body to scroll.
   - Keep the stats placeholder compact until the full sheet exists.

10. **Dead Stats tab code**
    - Remove the player right-side Stats tab and its state paths.
    - Keep the reusable stats body for the Character drawer.
    - Search for and remove obsolete stats-tab CSS and props.

11. **Stale local ping**
    - Snapshot the clicked token’s cell.
    - Clear the ping on scene change.
    - Clear the ping if the token moves or is removed.
    - A small visual delay is acceptable, but stale pings should not persist.

12. **Testing**
    - Test with a GM tab and at least one player tab.
    - Verify local ping isolation, hidden-token filtering, drawer overlay behavior, and keyboard navigation.
    - Test both-open and both-closed drawer states.
    - Confirm the scene map size and position do not change.
    - Keep manual testing focused on the same interaction areas during review.

13. **Both drawers open**
    - Both sides may be open at the same time.
    - More of the scene map is covered during lore-heavy sections. This is an accepted tradeoff.
    - The scene map keeps its existing size underneath.
    - Cap drawer widths on narrower viewports so some of the scene remains visible.
    - Adjust drawer widths or layering later if the table finds the scene too obscured.

### Resolved decision

The side rails are fixed beneath the top bar and run to the bottom of the viewport. They do not collapse. The app title and session heading sit beneath the top bar and may be covered by an open drawer.

The drawers are the collapsible elements and can be open independently. Both may be open at the same time. Each open drawer is attached to its rail and overlays the session header and scene map from its side. The scene map keeps its existing size and position. With both open, more of the header and scene is covered, but the scene itself does not resize or move. Drawers start below the top bar on all viewport sizes.
