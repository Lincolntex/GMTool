# Independent Scene Zoom Plan

Status: Implemented

Date: 2026-11-27

## 1. Goal

Add independent, client-side zoom and panning for the live scene so each GM and player can inspect
the map at their own scale. Zoom must work for both grid scenes and non-grid scenes and must not
move, sync, or resize any other participant's view.

The scene continues to fit the workspace at 100%. Zoom and pan are a local camera transform on top
of that fit. The map background, grid, tokens, pointers, pings, and selection ghost all move and
scale together so their alignment never changes.

## 2. Confirmed decisions

These decisions were confirmed in review on 2026-11-27.

1. **Zoom and panning** — Implement both, using standard map-viewer behavior:
   - Shift+wheel zooms around the pointer.
   - Middle-mouse drag and Space+drag pan.
   - Arrow keys pan while the scene is focused.
   - On-screen `−` / `+` / reset buttons are included.

2. **Zoom range** — 100% (fit) to 400%, never below fit. Revisit the maximum after table testing.

3. **What scales** — The whole map: background, grid, tokens, pointers, pings, and placement
   ghost. Token-to-grid alignment stays exact at every zoom level.

4. **Persistence** — Reset to 100% on scene change and page reload. No per-scene or per-room camera
   storage in this pass.

5. **Keyboard controls** — Only `Shift+wheel` and `Shift+=` / `Shift+-` zoom. Arrow keys are
   dedicated to panning when the scene is focused. `Shift+0` resets to 100% as a convenience.
   `Shift+ArrowUp` / `Shift+ArrowDown` are not zoom shortcuts.

6. **Realtime behavior** — Zoom remains local to each client. Nothing is sent over the socket and
   nothing is stored on the server.

7. **Mobile** — Mobile optimization is tabled. On-screen `−` / `+` / reset buttons are included
   because they are simple, useful on desktop, and the best fallback for touch later. Pinch zoom
   remains out of scope.

8. **Shift modifier pattern** — Keep **Shift** as the shared modifier for scene canvas actions:
   - Shift+click pings.
   - Shift+drag broadcasts the pointer.
   - Shift+wheel zooms.
   - Shift+= / Shift+- zoom.
   - Shift+0 resets.

   Token editing stays click-based. Do not introduce Alt, Ctrl, or Cmd requirements for scene
   actions. Plain arrow keys pan as a navigation action when the scene is focused.

9. **Consistency** — The zoom/pan controls and behavior are the same for GM and player views and for
   grid and non-grid scenes. The control cluster stays in the same position and uses the same
   shortcuts and reset behavior.

## 3. Scope

### In scope

- Local zoom and panning for GM and player live sessions.
- Grid and non-grid scenes.
- Cursor-anchored Shift+wheel zoom.
- Shift+= / Shift+- keyboard zoom and Shift+0 reset.
- Arrow-key panning and middle-mouse / Space+drag panning.
- On-screen `−` / `+` / reset controls.
- Clamping, resize handling, and scene-change reset.
- Alignment coverage for token placement, movement, pings, and pointers.
- Accessibility and reduced-motion behavior.
- README and implementation-note updates.

### Out of scope

- Server, database, or socket changes.
- Syncing one participant's camera to another participant.
- GM "follow my view" or forced zoom.
- Per-scene or per-room camera persistence.
- Pinch zoom and touch gesture recognition.
- Rotating, flipping, or skewing the scene.
- Zooming the campaign builder preview. The builder can reuse the same camera helper later.
- The campaign editor image-resolution callout. This is deferred to the planned Campaign Editor UI
  overhaul. Recommended copy and sizing guidance are retained in section 10 for that pass.

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

**Shift** is the shared modifier for scene canvas actions, matching Shift+click ping and Shift+drag
pointer broadcast. Token editing stays click-based.

- Hold **Shift** and scroll while the pointer is over the scene to zoom in or out.
- Zoom is anchored at the pointer: the map point under the cursor stays under the cursor.
- Normal wheel scrolling is untouched. Only Shift+wheel over the scene is captured.
- Do not intercept Ctrl+wheel, Cmd+wheel, or Alt+wheel. Those remain browser or OS gestures.
- Support both vertical and horizontal wheel deltas because Shift+wheel produces `deltaX` on some
  platforms and mice.
- Ignore zoom while a Shift+drag pointer broadcast is active, so the pointer position cannot jump.

### Keyboard

The scene becomes focusable (`tabIndex={0}`) with a visible focus ring.

- `Shift+=` / `Shift++`: zoom in around the viewport center.
- `Shift+-`: zoom out around the viewport center.
- `Shift+0`: reset to 100%.
- Plain `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`: pan when zoom is above 100%.
- `Shift+ArrowUp` and `Shift+ArrowDown` are not zoom shortcuts.
- Do not handle keys when focus is in an input, textarea, select, or contenteditable element.
- `preventDefault()` only for the shortcuts the scene handles.

### On-screen controls

Add a small control cluster fixed to the bottom-right of the scene stage, outside the transformed
frame:

- `−` zoom out.
- Current percentage, which is also a reset button (`125%`, `200%`, `100%`).
- `+` zoom in.
- A reset icon or the percentage button performs the reset.
- Tooltips describe the shortcut, for example `Zoom in (Shift+wheel or Shift+=)`.

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
- Reset to 100% when the background/aspect changes.
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
- `Shift+=` and `Shift++` zoom in; `Shift+-` zooms out. Apply `KEY_ZOOM_FACTOR` around the viewport
  center.
- `Shift+0` resets.
- Arrow keys pan by a fixed fraction of the viewport, for example 8% per key press.
- `Shift+ArrowUp` and `Shift+ArrowDown` are left alone as zoom shortcuts.
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

## 9. Camera lifetime and persistence

Keep the camera in `SceneStage` state only:

- Reset to `{ scale: 1, x: 0, y: 0 }` when `room.activeSceneIndex` changes.
- Reset when the background key or aspect changes.
- Reset on page reload.
- Keep the scale and clamp the pan when the window resizes.
- Provide the reset button as the manual escape hatch.

There is no `sessionStorage`, `localStorage`, database, or socket persistence in this pass. Each
new scene starts at 100%, which matches the confirmed decision and keeps the feature predictable.

## 10. Campaign editor image resolution guidance (deferred)

Zoom makes low-resolution background images more noticeable. The callout will be added during the
planned Campaign Editor UI overhaul, not as part of this zoom implementation.

Planned location: `src/client/pages/CampaignBuilderPage.tsx`, beside the existing
`PNG, JPEG, or WebP. Maximum 10 MB.` text under **Background image**.

Proposed copy for that pass:

> PNG, JPEG, or WebP. Maximum 10 MB. For sharp zoomed play, use at least 2560 px on the longest
> edge. 3840 px or larger is recommended if you expect to zoom to 200–400%.

Suggested guidance:

| Longest edge | Best for |
|---|---|
| 1920 px | 100–150% zoom |
| 2560 px | Up to about 200% zoom |
| 3840 px or larger | 300–400% zoom |

The callout is informational only. Do not block uploads based on dimensions, because file size,
compression, and available memory vary. Keep the existing 10 MB upload limit and accepted file
types. The scene already preserves the image aspect ratio, so the recommendation is about sharpness,
not layout.

This section is retained so the Campaign Editor overhaul can pick up the exact copy and guidance
without rediscovering it.

## 11. Accessibility

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

## 12. Performance

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

## 13. Interaction compatibility

- **Drawers:** zoom only affects the scene frame. Opening the left or right drawer still overlays
  the same stage without resizing the scene.
- **Token placement:** placement mode remains active while zooming. The hover ghost recalculates
  from the transformed frame rectangle.
- **Token movement:** clicking a placed token and then a cell still uses normalized coordinates.
- **Shift+click ping:** unchanged. Shift+wheel does not fire a click.
- **Shift+drag pointer broadcast:** suppress zoom while the drag is active. Do not start a pan with
  Shift held.
- **Local player pings:** percentages scale with the frame and stay on the clicked token.
- **Scene switching:** reset the camera to 100% before rendering the new scene.
- **GM removal and presence:** no interaction. Zoom state is local and disappears with the tab.
- **Resize:** re-clamp the camera after `ResizeObserver` updates.

## 14. Risks and mitigations

| Risk | Why it matters | Mitigation |
|---|---|---|
| Token, ghost, or ping coordinates drift after zoom | Misplaced tokens would corrupt play | Keep `getBoundingClientRect()` as the coordinate source; regression-test placement and pings at every zoom step |
| Shift+wheel conflicts with browser scrolling | Page jumps while trying to zoom | Native non-passive listener; `preventDefault()` only for Shift+wheel over the scene |
| Arrow keys conflict with page scroll or text selection | Keyboard panning becomes unreliable | Require scene focus; ignore form fields; `preventDefault()` handled arrows |
| Ctrl/Cmd+wheel is hijacked | Breaks browser zoom and accessibility | Ignore any modifier combination except plain Shift |
| Shift no longer feels like the scene-action modifier | Users must remember mixed modifier rules | Use Shift consistently for canvas actions: ping, pointer broadcast, zoom, and reset; keep token editing click-based and do not add Alt/Ctrl/Cmd requirements |
| Controls or behavior differ between GM/player or grid/non-grid scenes | Users have to relearn the interaction | Same control placement, shortcuts, scale range, reset behavior, and cursor states in every session view |
| Zoom and pan math drifts or exposes blank space | Map feels broken at high zoom | Single camera model, pure clamp functions, frame/viewport center math, reset at 100% |
| Grid strokes thicken at high zoom | Grid becomes visually heavy | Counter-scale stroke width by the zoom factor |
| Bitmap background blurs at 400% | Map detail becomes soft | Cap at 400%; retain the recommended-resolution guidance for the Campaign Editor overhaul; do not use nearest-neighbor rendering for photos |
| Pointer drag and zoom interact | Broadcast pointer can jump or a drag can start a pan | Ignore wheel zoom during active pointer drag; never start pan with Shift held |
| Camera state goes stale on resize | Map can drift out of view | Re-clamp on `ResizeObserver`; reset on aspect change |
| React wheel handler is passive | Zoom cannot prevent page scroll | Native listener with `{ passive: false }` |
| HMR or multiple camera sources cause jitter | Development-only confusion, but can reveal a state bug | One camera source of truth; apply through CSS variables or a single frame style |
| Zoom controls overlap the map or drawers | Buttons obscure tokens or become unreachable | Small bottom-right cluster, high enough z-index for the stage but below app rails and drawers; test narrow screens |
| Users expect the GM to control player zoom | Confusion at the table | Label the control as a personal view; document that zoom is local and never broadcast |
| Touch users cannot Shift+scroll | Feature unavailable on tablets | On-screen `−` / `+` / reset buttons; pinch can come later |
| Focus and keyboard conflicts | Accessibility regression | Focusable scene, visible focus ring, ignored form fields, no focus trap, reduced-motion support |

## 15. Testing plan

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
- Shift+=/− and Shift+0 work only when the scene is focused.
- Arrow keys pan only when zoomed and focused; Shift+ArrowUp/Down do not zoom.
- Middle-drag and Space+drag pan and clamp correctly.
- Zoom controls and percentage reset work with mouse and keyboard.
- Controls and shortcuts behave identically in GM and player views and on grid and non-grid scenes.
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
- Change scenes on one client; its zoom resets to 100% while the other client's view is unaffected.

### Regression checks

- Token placement, movement, Backspace/Delete removal, and token clicks.
- Shift+click and Shift+drag pointer behavior.
- GM token Hide/Show, Stats, Delete, and creation.
- Player local pings and Character/Domain cards.
- Scene switching with per-scene tokens and zoom reset.
- Grid visibility toggle and faint placement grid.
- GM participant removal.
- `npm run typecheck`
- `npm run build`
- `npm audit --omit=dev`
- No browser console errors.

## 16. Rollout phases

### Phase 1 — Camera foundation

- Add the viewport wrapper and camera state.
- Apply the transform to the scene frame.
- Add clamp math and reset at 100%.
- Verify token placement, pointer, and ping coordinates at 100% and 200%.
- No inputs or visible controls yet.

### Phase 2 — Inputs and controls

- Add the native Shift+wheel listener.
- Add `Shift+=` / `Shift+-` zoom and `Shift+0` reset.
- Add the on-screen zoom controls.
- Add cursor and focus states.
- Verify wheel does not interfere with page scroll or browser zoom.

### Phase 3 — Panning

- Add middle-drag and Space+drag panning.
- Add arrow-key panning when the scene is focused.
- Add pan clamping and resize handling.
- Verify Shift+drag pointer behavior is unchanged.

### Phase 4 — Polish

- Counter-scale grid strokes.
- Add zoom announcements and reduced-motion handling.
- Update `README.md` and `ALPHA_IMPLEMENTATION.md`.
- Leave the campaign editor image-resolution callout for the Campaign Editor UI overhaul.
- Run the full browser regression matrix.
- Open a pull request to `main`.

## 17. Acceptance criteria

The feature is complete when:

- GM and players can zoom independently without affecting each other.
- Zoom works on grid and non-grid scenes.
- Shift+wheel zooms around the pointer.
- Shift+=/− zoom from the keyboard when the scene is focused; Shift+0 resets to 100%.
- Arrow keys pan when the scene is focused and zoom is above 100%.
- On-screen zoom controls work for mouse, keyboard, and touch.
- Zoom is clamped to 100%–400%.
- Panning works when zoomed and is clamped so the map cannot be lost.
- Zoom resets on scene change and page reload.
- Zoom controls and behavior are identical in GM and player views and on grid and non-grid scenes.
- Token placement, movement, pings, pointers, and ghosts remain aligned at every zoom level.
- The scene frame remains the same fit size at 100%; drawers and app layout are unaffected.
- Normal scrolling and browser zoom shortcuts are not hijacked.
- Reduced-motion and keyboard accessibility are respected.
- Typecheck, production build, audit, and browser smoke tests pass.
- README and implementation notes describe the shortcuts and the independent-view behavior.

## 18. Resolved decisions

All implementation decisions are settled.

1. Include panning in the first pass using standard map-viewer behavior.
2. Zoom range is 100%–400%, subject to later testing.
3. The whole map scales, including tokens and markers.
4. The camera resets on scene change and page reload; there is no persistence.
5. Zoom is Shift+wheel or Shift+=/−. Arrow keys pan. On-screen controls are included.
6. Mobile is tabled. On-screen `−` / `+` / reset buttons are included for desktop and future touch
   use.
7. `Shift+0` remains a reset convenience.
8. Shift remains the shared modifier for scene canvas actions: ping, pointer broadcast, zoom, and
   reset. Token editing stays click-based. No Alt/Ctrl/Cmd requirements are added.
9. Zoom controls and behavior are identical in GM and player views and on grid and non-grid scenes.
10. The campaign editor image-resolution callout is deferred to the planned Campaign Editor UI
    overhaul. Section 10 retains the proposed copy and sizing guidance for that pass.

There are no outstanding questions blocking implementation.
