# Independent Scene Zoom Plan

Status: Proposed

Date: 2026-11-27

## 1. Goal

Add independent, client-side zoom for the live scene so each GM and player can inspect the map at
their own scale. Zoom must work for both grid scenes and non-grid scenes and must not move, sync, or
resize any other participant's view.

The scene continues to fit the workspace at 100%. Zoom is a local camera transform on top of that
fit. The map background, grid, tokens, pointers, pings, and selection ghost all move and scale
together so their alignment never changes.

## 2. Clarification questions and recommended defaults

These are the decisions that affect the feel of the feature. The plan below uses the recommended
defaults. Each can be changed without altering the architecture.

1. **Should zoom include panning?**
   - Recommended: yes. Zooming around the cursor is useful, but a zoomed map is frustrating
     without a way to move around. Add middle-mouse drag and Space+drag panning in the same pass,
     plus arrow-key panning when the scene is focused.
   - Minimal alternative: ship zoom only and rely on cursor-anchored zoom plus a reset button.

2. **What is the zoom range?**
   - Recommended: 100% (fit) to 400%, never below fit. At 400%, a typical 24-column grid shows
     about six columns across, which is enough tactical detail without turning the image into
     mush.

3. **Should tokens and markers scale with the map or stay a fixed screen size?**
   - Recommended: scale everything with the map. This keeps token-to-grid alignment exact and
     makes small battlemaps readable. If pointer labels become too large at 4x, counter-scale just
     the labels as a polish step.

4. **Should zoom persist?**
   - Recommended for the first pass: keep the camera in component state and reset to 100% when the
     active scene changes or the page reloads.
   - Optional follow-up: store one camera per room and scene in `sessionStorage`, keyed by
     `roomId + sceneIndex`. This preserves zoom across refresh and scene switches without a
     database change and remains local to that browser tab.

5. **Which keyboard fallback should be primary?**
   - Recommended: `Shift+wheel` for pointer-anchored zoom, `Shift+ArrowUp` / `Shift+ArrowDown` as
     the arrow fallback, `Shift+=` / `Shift+-` as an additional shortcut, and `Shift+0` to reset.
     Plain arrow keys pan while the scene has focus and zoom is above 100%.

6. **Should the GM's zoom ever control the players?**
   - Recommended: no. Zoom is a per-client camera control only. Nothing is sent over the socket and
     nothing is stored on the server. This is the simplest and most predictable behavior for a
     remote table.

7. **Should touch pinch zoom be supported now?**
   - Recommended: not in this pass. The on-screen `−` / `+` / reset controls cover tablets and
     phones. Pinch can be added later with the same camera model.

## 3. Scope

### In scope

- Local zoom for GM and player live sessions.
- Grid and non-grid scenes.
- Cursor-anchored wheel zoom.
- Keyboard zoom fallback and keyboard panning.
- On-screen zoom controls and reset.
- Optional middle-mouse and Space+drag panning.
- Clamping, resize handling, and scene-change reset.
- Alignment coverage for token placement, movement, pings, and pointers.
- Accessibility and reduced-motion behavior.
- README and implementation-note updates.

### Out of scope

- Server, database, or socket changes.
- Syncing one participant's camera to another participant.
- GM "follow my view" or forced zoom.
- Pinch zoom and touch gesture recognition.
- Rotating, flipping, or skewing the scene.
- Zooming the campaign builder preview. The builder can reuse the same camera helper later.

## 4. Current state

Relevant files:

- `src/client/components/SceneStage.tsx`
  - Owns the live scene stage, frame sizing, token placement, pointer broadcast, pings, and local
    pings.
  - Fits the `.scene-frame` into the stage using the background aspect ratio.
  - Uses `frameRef.current.getBoundingClientRect()` in `readClientPoint` for normalized pointer and
    grid coordinates.
  - Positions tokens, pointers, pings, and local pings with percentage coordinates inside the
    frame.
- `src/shared/grid.ts`
  - Converts normalized scene coordinates to grid cells and cell centers.
  - Uses frame-relative units, so it does not need to know about screen pixels or zoom.
- `src/client/components/GridOverlay.tsx`
  - Renders grid lines in a percentage `viewBox`.
  - Uses `vectorEffect="non-scaling-stroke"` for SVG-internal line stability.
- `src/client/styles.css`
  - Styles `.scene-stage` as a centered, `overflow: hidden` viewport.
  - Styles `.scene-frame`, `.scene-image`, `.scene-preset`, `.grid-overlay`, `.token-layer`,
    `.pointer-layer`, and `.ping`.
- `src/client/pages/GmSessionPage.tsx` and `src/client/pages/SessionPage.tsx`
  - Both render `<SceneStage />`; the component is the only place zoom state is needed.

The important existing property is that `readClientPoint` already measures the rendered frame with
`getBoundingClientRect()`. A CSS transform changes that rectangle, so the existing normalized
coordinate mapping continues to work as long as the zoom is applied to the frame as a whole and the
same frame element is still the measured element.

## 5. Interaction model

### Mouse and trackpad

- Hold **Shift** and scroll while the pointer is over the scene to zoom in or out.
- Zoom is anchored at the pointer: the map point under the cursor stays under the cursor.
- Normal wheel scrolling is untouched. Only Shift+wheel over the scene is captured.
- Do not intercept Ctrl+wheel, Cmd+wheel, or Alt+wheel. Those remain browser or OS gestures.
- Support both vertical and horizontal wheel deltas because Shift+wheel produces `deltaX` on some
  platforms and mice.
- Ignore zoom while a Shift+drag pointer broadcast is active, so the pointer position cannot jump.

### Keyboard

The scene becomes focusable (`tabIndex={0}`) with a visible focus ring.

- `Shift+ArrowUp` / `Shift+=` / `Shift++`: zoom in around the viewport center.
- `Shift+ArrowDown` / `Shift+-`: zoom out around the viewport center.
- `Shift+0`: reset to 100%.
- Plain `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`: pan when zoom is above 100%.
- Do not handle keys when focus is in an input, textarea, select, or contenteditable element.
- `preventDefault()` only for the shortcuts the scene handles.

### On-screen controls

Add a small control cluster fixed to the bottom-right of the scene stage, outside the transformed
frame:

- `−` zoom out.
- Current percentage, which is also a reset button (`125%`, `200%`, `100%`).
- `+` zoom in.
- A reset icon or the percentage button performs the reset.
- Tooltips describe the shortcut, for example `Zoom in (Shift+wheel or Shift+ArrowUp)`.

The controls are ordinary buttons, so they work on touch devices and with screen readers. They do
not scale with the map and remain usable at any zoom level.

### Panning

- Middle-mouse drag pans while zoomed.
- Space+left-drag pans while zoomed. Space should not activate scene tools while held.
- Arrow keys pan while the scene is focused and zoom is above 100%.
- Pan is clamped so the map cannot be dragged completely out of the viewport.
- Panning is ignored when `Shift` is held, preserving the existing Shift+drag pointer broadcast.
- At 100%, the camera is centered and panning has no effect.

## 6. Camera model and math

Use one camera object per `SceneStage` instance:

```ts
interface SceneCamera {
  scale: number; // 1 = fit
  x: number;     // screen-pixel translation from the centered layout position
  y: number;
}

const MIN_SCALE = 1;
const MAX_SCALE = 4;
const KEY_ZOOM_FACTOR = 1.15;
const WHEEL_SENSITIVITY = 0.0015;
```

### Recommended DOM structure

Add an explicit viewport wrapper inside the stage so clipping and centering are unambiguous:

```tsx
<div className="scene-stage" ref={stageRef}>
  <div className="scene-backdrop" aria-hidden="true" />
  <div className="scene-viewport" ref={viewportRef}>
    <div className="scene-frame" ref={frameRef} ...>
      ...
    </div>
  </div>
  <div className="scene-zoom-controls">...</div>
</div>
```

```css
.scene-viewport {
  position: absolute;
  inset: 8px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
```

The stage's current padding can be removed when the viewport uses the inset. The frame keeps its
existing fit sizing based on the viewport size instead of the stage size. The viewport is the
clipping box and gives the camera math a stable center.

### Applying the camera

```css
.scene-frame {
  transform-origin: 50% 50%;
  transform:
    translate3d(var(--scene-pan-x, 0px), var(--scene-pan-y, 0px), 0)
    scale(var(--scene-zoom, 1));
  will-change: transform;
}
```

Set `--scene-zoom`, `--scene-pan-x`, and `--scene-pan-y` from the camera state. `transform-origin:
50% 50%` means translation is measured in screen pixels from the centered layout position. The
translation is applied after scaling, so pan values do not need to be multiplied by the scale.

### Zoom anchored at a point

With the viewport centered frame:

- Viewport center: `(Cx, Cy)`.
- Base frame size: `(Fw, Fh)`.
- Current camera: `(scale, x, y)`.
- Pointer: `(px, py)`.

The normalized map coordinate under the pointer is:

```ts
const u = (px - Cx - x) / (Fw * scale) + 0.5;
const v = (py - Cy - y) / (Fh * scale) + 0.5;
```

For a new scale `nextScale`, keep that point under the pointer:

```ts
const nextX = px - Cx - (u - 0.5) * Fw * nextScale;
const nextY = py - Cy - (v - 0.5) * Fh * nextScale;
```

Then clamp the result. Keyboard zoom uses the viewport center as `(px, py)`.

### Clamping

For each axis:

```ts
function clampPan(pan: number, frameSize: number, viewportSize: number): number {
  const scaled = frameSize * scale;
  if (scaled <= viewportSize) return 0; // keep the axis centered
  const limit = (scaled - viewportSize) / 2;
  return Math.min(limit, Math.max(-limit, pan));
}
```

This prevents blank space from opening between the map and the viewport edge while zoomed, and
keeps the map centered on axes that still fit. At 100%, the limit is zero, so the map is always
centered.

### Resize and aspect changes

- Recompute the base frame size after `ResizeObserver` updates.
- Re-clamp the camera with the new viewport and frame dimensions.
- Reset to 100% when the active scene changes.
- Reset to 100% when the background/aspect changes, unless per-scene persistence is implemented.
- When the window resizes, preserve the scale and clamp the existing pan. Do not leave the map
  half outside the viewport.

## 7. Input implementation details

### Wheel

React's synthetic wheel listener may be passive depending on the React version and browser. Attach
a native listener instead:

```ts
useEffect(() => {
  const viewport = viewportRef.current;
  if (!viewport) return;

  function handleWheel(event: WheelEvent) {
    if (!event.shiftKey) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (dragRef.current) return;
    if ((event.target as HTMLElement)?.closest('.scene-zoom-controls')) return;

    event.preventDefault();
    const raw =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    const pixels =
      event.deltaMode === 1 ? raw * 16 : event.deltaMode === 2 ? raw * window.innerHeight : raw;
    const factor = clamp(Math.exp(-pixels * WHEEL_SENSITIVITY), 0.85, 1.18);
    zoomAt(event.clientX, event.clientY, camera.scale * factor);
  }

  viewport.addEventListener('wheel', handleWheel, { passive: false });
  return () => viewport.removeEventListener('wheel', handleWheel);
}, [camera]);
```

Use a ref for the current camera inside the listener or register the listener once and read
`cameraRef.current`, so the listener is not reattached on every wheel event.

### Keyboard

- Attach `keydown` to the focused scene stage element, not to `window`, so the scene must be
  focused before shortcuts apply.
- Ignore events from form controls and contenteditable elements.
- `Shift+ArrowUp` / `Shift+ArrowDown` zoom by `KEY_ZOOM_FACTOR`.
- `Shift+=` and `Shift++` zoom in; `Shift+-` zooms out.
- `Shift+0` resets.
- Plain arrow keys pan by a fixed fraction of the viewport, for example 8% per key press.
- Call `event.preventDefault()` for handled keys.

### Pan gestures

- Listen for `pointerdown` on the frame or viewport.
- Start a pan when:
  - `camera.scale > 1`, and
  - the middle button is pressed, or Space is held and the left button is pressed.
- Do not start a pan when Shift is held; that path belongs to pointer broadcast.
- Capture the pointer, track movement, update `x`/`y`, clamp, and release on pointerup/cancel.
- Set a `grabbing` cursor while panning and `grab` when zoomed and idle.
- Keep the existing crosshair cursor while placing a token.

## 8. Grid, token, and overlay behavior

### Grid lines

CSS parent scale also scales SVG strokes. At 200%, a 1px grid line becomes 2px. Keep the grid
visually consistent by passing the scale into the overlay or by using a CSS variable:

```css
.grid-overlay line {
  stroke-width: calc(1px / var(--scene-zoom, 1));
}
```

If `calc()` inside `stroke-width` is not reliable in the target browsers, pass a numeric
`strokeWidth={1 / scale}` prop to `GridOverlay` and set it inline. Verify in current Chrome, Edge,
and Firefox.

`vectorEffect="non-scaling-stroke"` can stay; it protects against SVG-internal scaling, but the CSS
parent transform is a separate scale.

### Tokens, pointers, pings, and ghosts

Everything inside `.scene-frame` is percentage-positioned relative to the frame. Scaling the frame
scales all of them together, so their relative alignment is preserved.

- Board tokens scale with the map. Their hit targets grow and shrink with the frame.
- Placement ghosts use `cellCenter()` percentages and therefore remain snapped to the correct
  cell.
- Pointer dots, pointer labels, broadcast pings, and local pings scale with the map. If labels are
  too large at high zoom, counter-scale only the label, not the anchor point.
- Hidden GM tokens, selected-token glow, and the token remove button continue to render as before.

### Coordinate mapping during placement and pings

`readClientPoint` uses `frameRef.current.getBoundingClientRect()`. A CSS transform is reflected in
that rectangle, so the returned normalized coordinates stay correct without inverse-transform
math. Do not replace this helper with `offsetWidth`, `offsetLeft`, or other layout-only values,
which would break under zoom.

Add regression coverage for:

- Clicking each corner of a cell at 100%, 200%, and 400%.
- Hovering the token ghost at multiple zoom levels.
- Shift+click pings at multiple zoom levels.
- Shift+drag pointer broadcast at multiple zoom levels.
- A remote pointer or ping arriving while the local view is zoomed.

## 9. Persistence

### Recommended first pass

Keep the camera in `SceneStage` state only:

- Reset to `{ scale: 1, x: 0, y: 0 }` when `room.activeSceneIndex` changes.
- Reset when the background key or aspect changes.
- Reset on page reload.
- Provide the reset button as the manual escape hatch.

This is the smallest change and fully satisfies independent zoom.

### Optional per-scene memory

If zoom should survive refresh and scene switching, add a local-only camera store:

- Key: `gmtool:scene-camera:<roomId>:<sceneIndex>` in `sessionStorage`.
- Value: `{ scale, centerX, centerY }`, where `center` is the normalized map point at the
  viewport center.
- On mount, compute the pan from the stored center using the current frame and viewport size, then
  clamp.
- On change, save the scale and center with a short debounce.
- Ignore or remove invalid entries.
- Keep this in session storage, not the database, because it is a per-device view preference.

Do not use `localStorage` by default. It would carry a camera into another session or another room
unless the key is carefully scoped. `sessionStorage` better matches "my current view".

## 10. Accessibility

- Give the scene a visible focus ring and `tabIndex={0}`.
- Add a concise `aria-label` or `aria-describedby` that mentions the zoom shortcuts.
- Use real buttons for the zoom controls with clear accessible names:
  - `Zoom out`
  - `Reset zoom to 100%`
  - `Zoom in`
- Expose the current zoom as text in the controls, for example a button labeled `Reset zoom,
  currently 200%`.
- Announce zoom changes through the percentage button or a visually hidden `aria-live="polite"`
  status. Avoid announcing on every wheel tick; update at most a few times per second.
- Do not trap focus in the scene.
- Respect `prefers-reduced-motion` by removing camera transitions. Zoom should still work.
- Do not rely on color alone for the controls; use icons plus labels/tooltips.
- Keep tooltips on hover and focus.

## 11. Performance

- Animate or update only `transform`; do not change width, height, top, or left for zoom.
- Update the camera at most once per animation frame for wheel input.
- Keep the React render of tokens, pings, and pointers unchanged for camera-only updates where
  possible. Prefer applying the camera through CSS variables or a direct frame style update while
  the wheel is moving.
- `will-change: transform` is acceptable on the single scene frame. Remove it after a few seconds
  of inactivity if a long-lived layer is a concern.
- Cap zoom at 400% to limit bitmap blur and layer size.
- The existing `scene-backdrop` is already blurred and fixed; leave it outside the transformed frame.
- Do not add transitions longer than roughly 80ms, and disable them under reduced motion.

## 12. Interaction compatibility

- **Drawers:** zoom only affects the scene frame. Opening the left or right drawer still overlays
  the same stage without resizing the scene.
- **Token placement:** placement mode remains active while zooming. The hover ghost recalculates
  from the transformed frame rectangle.
- **Token movement:** clicking a placed token and then a cell still uses normalized coordinates.
- **Shift+click ping:** unchanged. Shift+wheel does not fire a click.
- **Shift+drag pointer broadcast:** suppress zoom while the drag is active. Do not start a pan with
  Shift held.
- **Local player pings:** percentages scale with the frame and stay on the clicked token.
- **Scene switching:** reset the camera before rendering the new scene, or restore a per-scene
  camera if persistence is enabled.
- **GM removal and presence:** no interaction. Zoom state is local and disappears with the tab.
- **Resize:** re-clamp the camera after `ResizeObserver` updates.

## 13. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Token, ghost, or ping coordinates drift after zoom | Misplaced tokens would corrupt play | Keep `getBoundingClientRect()` as the coordinate source; regression-test placement and pings at every zoom step |
| Shift+wheel conflicts with browser scrolling | Page jumps while trying to zoom | Native non-passive listener; `preventDefault()` only for Shift+wheel over the scene |
| Shift+arrow conflicts with page scroll or text selection | Keyboard fallback becomes unreliable | Require scene focus; ignore form fields; `preventDefault()` handled shortcuts |
| Ctrl/Cmd+wheel is hijacked | Breaks browser zoom and accessibility | Ignore any modifier combination except plain Shift |
| Zoom and pan math drifts or exposes blank space | Map feels broken at high zoom | Single camera model, pure clamp functions, frame/viewport center math, reset at 100% |
| Grid strokes thicken at high zoom | Grid becomes visually heavy | Counter-scale stroke width by the zoom factor |
| Bitmap background blurs at 400% | Map detail becomes soft | Cap at 400%; recommend high-resolution uploaded maps; do not use nearest-neighbor rendering for photos |
| Pointer drag and zoom interact | Broadcast pointer can jump or a drag can start a pan | Ignore wheel zoom during active pointer drag; never start pan with Shift held |
| Camera state goes stale on resize | Map can drift out of view | Re-clamp on `ResizeObserver`; reset on aspect change |
| React wheel handler is passive | Zoom cannot prevent page scroll | Native listener with `{ passive: false }` |
| HMR or multiple camera sources cause jitter | Development-only confusion, but can reveal a state bug | One camera source of truth; apply through CSS variables or a single frame style |
| Zoom controls overlap the map or drawers | Buttons obscure tokens or become unreachable | Small bottom-right cluster, high enough z-index for the stage but below app rails and drawers; test narrow screens |
| Users expect the GM to control player zoom | Confusion at the table | Label the control as a personal view; document that zoom is local and never broadcast |
| Touch users cannot Shift+scroll | Feature unavailable on tablets | On-screen `−` / `+` / reset buttons; pinch can come later |
| Focus and keyboard conflicts | Accessibility regression | Focusable scene, visible focus ring, ignored form fields, no focus trap, reduced-motion support |

## 14. Testing plan

### Manual matrix

Test each combination:

- GM and player.
- Grid scene and non-grid scene.
- Scene background preset and uploaded image.
- 100%, 125%, 200%, 300%, 400%.
- Left drawer open, right drawer open, both drawers open.
- Window resized while zoomed.

### Interaction checks

- Shift+wheel over the scene zooms and does not scroll the page.
- Normal wheel over the scene does nothing different from today.
- Shift+ArrowUp/Down, Shift+=/−, and Shift+0 work only when the scene is focused.
- Plain arrow keys pan only when zoomed and focused.
- Middle-drag and Space+drag pan and clamp correctly.
- Zoom controls and percentage reset work with mouse and keyboard.
- The map point under the cursor stays under the cursor while wheel zooming.
- The map stays centered at 100% and does not expose blank space beyond the frame while zoomed.

### Alignment checks

- Place a token in each visible corner cell at 100%, 200%, and 400%.
- Move an existing token at each zoom level.
- Hover the placement ghost across cell boundaries at each zoom level.
- Shift+click a ping at a cell corner at each zoom level; compare local and remote views.
- Shift+drag a pointer at each zoom level; the other client sees the same normalized position.
- Click a player Scene drawer token row at a non-100% zoom; the local ping lands on the token.
- Confirm hidden tokens remain hidden and GM-only tokens remain GM-only.

### Independence checks

- Zoom the GM view; the player view stays at its own scale.
- Zoom the player view; the GM view stays at its own scale.
- Open scene drawers on both clients; each keeps its own zoom.
- Reload one client; the other client's view is unaffected.
- If persistence is enabled, confirm each scene restores its own camera and invalid entries are
  ignored.

### Regression checks

- Token placement, movement, Backspace/Delete removal, and token clicks.
- Shift+click and Shift+drag pointer behavior.
- GM token Hide/Show, Stats, Delete, and creation.
- Player local pings and Character/Domain cards.
- Scene switching with per-scene tokens.
- Grid visibility toggle and faint placement grid.
- GM participant removal.
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev`
- No browser console errors.

## 15. Rollout phases

### Phase 1 — Camera foundation

- Add the viewport wrapper and camera state.
- Apply the transform to the scene frame.
- Add clamp math and reset at 100%.
- Verify token placement, pointer, and ping coordinates at 100% and 200%.
- No inputs or visible controls yet.

### Phase 2 — Inputs and controls

- Add the native Shift+wheel listener.
- Add keyboard zoom and reset.
- Add the on-screen zoom controls.
- Add cursor and focus states.
- Verify wheel does not interfere with page scroll or browser zoom.

### Phase 3 — Panning

- Add middle-drag and Space+drag panning.
- Add arrow-key panning.
- Add pan clamping and resize handling.
- Verify Shift+drag pointer behavior is unchanged.

### Phase 4 — Polish

- Counter-scale grid strokes.
- Add zoom announcements and reduced-motion handling.
- Add optional per-scene session storage if approved.
- Update `README.md` and `ALPHA_IMPLEMENTATION.md`.
- Run the full browser regression matrix.
- Open a pull request to `main`.

## 16. Acceptance criteria

The feature is complete when:

- GM and players can zoom independently without affecting each other.
- Zoom works on grid and non-grid scenes.
- Shift+wheel zooms around the pointer.
- Shift+ArrowUp/Down (and Shift+=/−) zoom from the keyboard when the scene is focused.
- Shift+0 resets to 100%.
- On-screen zoom controls work for mouse, keyboard, and touch.
- Zoom is clamped to 100%–400%.
- Panning works when zoomed and is clamped so the map cannot be lost.
- Token placement, movement, pings, pointers, and ghosts remain aligned at every zoom level.
- The scene frame remains the same fit size at 100%; drawers and app layout are unaffected.
- Normal scrolling and browser zoom shortcuts are not hijacked.
- Reduced-motion and keyboard accessibility are respected.
- Typecheck, production build, audit, and browser smoke tests pass.
- README and implementation notes describe the shortcuts and the independent-view behavior.

## 17. Decisions to confirm before implementation

1. Include panning in the first pass, or ship zoom-only first?
2. Zoom range: 100%–400%, or a different maximum?
3. Whole-map scaling, or fixed-size tokens and labels over a scaled background/grid?
4. Reset on scene change and refresh, or remember one camera per scene locally?
5. Keep the scene keyboard shortcuts strictly Shift-based, or also allow plain `+` / `−` when the
   scene is focused?
6. Should there be a GM "follow my view" option later, or should views always remain unlinked?
