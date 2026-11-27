# Session UI Overhaul Plan

Status: Proposed

## Goal

Replace the current text-tab session drawers with a persistent, collapsible icon navigation rail. Rework the player session tools around Scene, Character, Domain cards, and Notes.

The GM keeps the current scene, token, request, and notes tools, but the navigation becomes icon-first. The player gains a visible-token list and a local-only token ping.

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

---

## 2. Target navigation model

Use a **persistent icon rail** on each side of the session:

- Left rail for primary session tools.
- Right rail for notes.
- The rail stays visible while a drawer is open.
- The drawer is the collapsible part.
- Clicking an icon opens its drawer.
- Clicking the active icon closes the drawer.
- Clicking another icon swaps the drawer content without closing the drawer.
- Hovering or focusing an icon shows its tab name in a tooltip.
- The drawer title also shows the full tab name.

### Layout

```text
┌──────┬──────────────┬───────────────────────────────┬──────────────┬──────┐
│ icon │ open drawer  │                               │              │ icon │
│ rail │  320-360px   │          scene stage          │              │ rail │
│ 56px │              │                               │              │ 56px │
└──────┴──────────────┴───────────────────────────────┴──────────────┴──────┘
```

- Rail width: `56px` desktop.
- Icon button: `40px × 40px`.
- Drawer width: `320px` to `360px`.
- Left drawer offset: `left: 56px`.
- Right drawer offset: `right: 56px`.
- The GM stats sub-panel opens immediately to the right of the left drawer.
- The scrim sits below the icon rails so the rail stays clickable.
- On narrow screens the drawer may occupy most of the viewport, but the rail remains visible.

---

## 3. Icon library

Use **`@phosphor-icons/react`**.

Why:

- MIT licensed and tree-shakeable with Vite.
- Simple geometric silhouettes.
- Supports `weight="fill"` for solid/filled icons.
- Covers every requested concept with one visual family.
- `currentColor` works with the existing CSS theme.

Use filled icons only:

```tsx
<Image weight="fill" size={22} aria-hidden="true" />
```

Do not mix outline, duotone, or thin variants. Keep icon size and stroke/fill treatment consistent.

### Icon mapping

| Role | Tab | Icon | Phosphor export | Notes |
|---|---|---|---|---|
| GM | Scenes | Picture | `Image` | Same visual family as the player Scene icon |
| GM | Token | Triangle | `Triangle` | Simple solid triangle |
| GM | Requests | Exclamation | `WarningCircle` | Circle with exclamation; avoids confusion with the token triangle |
| GM | Notes | Book/page | `Notebook` | Shared notes icon |
| Player | Scene | Picture | `Image` | Top item in the player left rail |
| Player | Character | Player | `User` | Character stats and token placement |
| Player | Domain cards | Playing card | `Cards` | Placeholder until Daggerheart domain support |
| Player | Notes | Book/page | `Notebook` | Must match the GM Notes icon |

If a requested glyph is not available in Phosphor, create a small local SVG in `ShapeIcon` style rather than mixing icon libraries. Keep the fallback within the same 24×24 grid and silhouette weight.

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
  <Icon weight="fill" size={22} aria-hidden="true" />
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

The existing smaller stats panel remains. It should now open beside the left drawer and account for the icon rail offset:

```text
left rail 56px + token drawer width
```

It must remain above the scene but below the icon rail tooltips.

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
- A list of all tokens visible to the player on the active scene.
- Each row contains only:
  - The token glyph.
  - The token name.
- No Hide, Stats, Delete, rename, or placement controls.
- No player controls at all.

Filtering:

```ts
room.tokens.filter((token) => !token.hidden)
```

The server currently sends hidden tokens to all clients; the player client must continue filtering them. Do not change the server payload for this feature.

Ordering:

- Preserve the token order from the room payload.
- This matches board layering and the GM Active Tokens order.

Row behavior:

- If the token is placed (`token.cell` is not null), the row is a button.
- Clicking it triggers a local-only ping at the token’s square.
- If the token is unplaced, the row is disabled and visually muted.
- Rows still show only the token and name. Use a disabled state rather than adding status controls.

Empty state:

- `No visible tokens on this scene.`

Live updates:

- `tokens:changed` already refreshes room state.
- Hidden tokens disappear from the list when the GM hides them.
- Revealed tokens appear automatically.
- Placed/unplaced changes update row clickability.

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
- Clear the ping on scene change and unmount.

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

Keep one open-side state and one active-tab state per side.

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
.session-nav
.session-nav-left
.session-nav-right
.session-nav-button
.session-nav-button.active
.session-nav-button::after
.session-nav-button:hover::after
.session-nav-button:focus-visible::after
.session-drawer-left
.session-drawer-right
.session-stats-drawer
.player-token-list
.player-token-row
.player-token-row:disabled
.ping-local
```

Update:

- Remove text-tab-specific styles that are no longer used.
- Keep `.session-drawer` base styles.
- Adjust drawer offsets for the persistent rails.
- Adjust scrim stacking so rails stay clickable.
- Adjust the GM stats panel offset.
- Add responsive rail width and drawer width rules.
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
- Player token rows are buttons with `aria-label="Ping Goblin"` when placed.
- Disabled unplaced rows use `disabled` and remain readable.
- Add an `aria-live` status for the last local ping.
- Verify tab order: left rail, drawer controls, scene, right rail.
- Do not communicate active state by color alone; use background, border, and/or icon weight.

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
- GM stats sub-panel opens beside the token drawer and is not clipped by the rail.
- Existing token create/place/rename/hide/stats/delete still work.

### Player

- Left rail order is Scene, Character, Domain cards.
- Scene drawer lists only visible tokens.
- Hidden tokens never appear.
- Revealed tokens appear without a refresh.
- Token rows show only the glyph and name.
- Placed-token click produces a local ping at the correct cell.
- The ping disappears after roughly 1.4 seconds.
- Repeated clicks reset the timer.
- Unplaced rows are disabled.
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
- Keyboard-only navigation check.
- Verify the scene remains reachable when a drawer is closed.

---

## 16. Rollout sequence

### Phase 1 — Icon foundation

- Add `@phosphor-icons/react`.
- Create `SessionNavButton`.
- Add rail and tooltip CSS.
- Replace the text rails without changing drawer content.

### Phase 2 — GM navigation

- Wire GM Scenes, Token, Requests, and Notes.
- Verify the stats sub-panel offset.
- Confirm existing token actions are unchanged.

### Phase 3 — Player navigation

- Add Scene, Character, Domain cards, and Notes.
- Move stats into Character.
- Remove the player Stats tab.
- Add the Domain cards placeholder.

### Phase 4 — Player active tokens and local ping

- Filter visible tokens.
- Add the player token list.
- Add local ping state and rendering.
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
- No text tab bar remains in the session drawers.
- GM icons match: picture, triangle, exclamation, notebook.
- Player icons match: picture, player, playing cards, notebook.
- The player Scene drawer lists only visible tokens.
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
| Icon library | `@phosphor-icons/react`, filled silhouettes |
| Requests icon | `WarningCircle` to avoid reusing the token triangle |
| Domain cards icon | Phosphor `Cards`; custom SVG fallback if needed |
| Active tokens list | All visible tokens; unplaced rows disabled |
| Local ping | Client-only state, no socket event |
| Ping duration | About 1.4 seconds, matching existing pings |
| Stats tab | Removed; stats moved into Character |
| Notes icon | Shared `Notebook` icon |
| Server changes | None |
| Database changes | None |

Open question to confirm during implementation:

- If “collapsible side nav” also means hiding the icon rail itself, add a separate rail-collapse toggle in a later pass. This plan keeps the icon rail persistent and collapses the drawer panels, which matches the requested hover-name behavior.
