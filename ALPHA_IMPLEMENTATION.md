# GMTool Alpha — Implementation Notes

**Status:** Implemented local alpha with PostgreSQL persistence

**Scope:** Campaign dashboard, multi-scene builder, live scene switching, scene grid,
grid-aligned token placement, and restart-safe sessions

> **Persistence note:** Campaigns, scenes, tokens, live rooms, and participants are stored in
> PostgreSQL. Pointer positions, socket IDs, connection state, and pings remain in memory and
> reset on restart.

---

## 1. Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js 20 |
| Server | Express 4 |
| Real-time | Socket.IO 4 |
| Client | React 18 + Vite 6 |
| Routing | React Router 7 |
| Language | TypeScript |
| Styling | Plain CSS |
| Uploads | Multer 2 + local `uploads/` folder |
| Database | PostgreSQL 16 |
| ORM / migrations | Drizzle ORM + drizzle-kit |
| Auth | GM passphrase + HMAC-signed HttpOnly cookie |

### Why this stack

- One repository, one local server, one client dev server, and one Docker Postgres service.
- PostgreSQL enforces the data rules that matter: one active room, unique visible token squares,
  one player token per scene, and cascading campaign deletes.
- Drizzle keeps the schema in TypeScript and generates reviewable SQL migrations.
- Socket.IO gives presence, reconnection, rooms, and pointer broadcasts without a custom
  WebSocket protocol.
- Vite + React keeps the real-time scene UI straightforward.

Astro was considered, but the alpha is a real-time application shell rather than a content
site. Astro can wrap the React client later if the dashboard or marketing pages need it.

---

## 2. Project layout

```text
server/
  auth.ts        passphrase check, signed GM cookie, cookie parsing
  campaigns.ts   PostgreSQL campaign repository and validation
  db/
    client.ts    Postgres pool and Drizzle client
    schema.ts    Tables, enums, constraints, and partial indexes
    migrate.ts   Migration runner
    migrations/  Generated Drizzle SQL migrations
  index.ts       Express API, migrations, startup, upload handling, static client serving
  rooms.ts       database-backed rooms plus in-memory socket/pointer presence
  socket.ts      Socket.IO join, presence, pointer, token, grid, disconnect handling

src/
  shared/
    grid.ts      shared grid geometry, full-cell hit testing, and line positions
    types.ts     shared campaign, room, token, grid, and socket types
  client/
    main.tsx
    App.tsx
    styles.css
    lib/
      api.ts
      storage.ts
      tokens.ts
    hooks/
      useRoomSocket.ts
    components/
      SceneStage.tsx
      ScenePreview.tsx
      GridOverlay.tsx
      GridEditor.tsx
      SessionDrawers.tsx
      ParticipantStrip.tsx
    pages/
      GmPage.tsx             dashboard + login
      CampaignBuilderPage.tsx
      GmSessionPage.tsx
      JoinPage.tsx
      SessionPage.tsx
```

---

## 3. Runtime architecture

```text
Browser (GM) ───── HTTPS/HTTP + WebSocket ─────┐
                                              │
Browser (Player) ── HTTPS/HTTP + WebSocket ───┼── Express + Socket.IO
                                              │        │
                                              │        ├── active-room cache
                                              │        ├── socket/pointer maps
                                              │        ├── PostgreSQL
                                              │        └── uploads/ (local files)
                                              │
                                         Vite proxy in development
```

- PostgreSQL is the durable source of truth for campaigns and live rooms.
- The active-room aggregate is cached in memory for fast socket broadcasts.
- There is exactly one active room, enforced by a partial unique index.
- A new room ends the previous room and invalidates its join link.
- Pointer updates and socket IDs are ephemeral and never written to the database.
- The active room, scene index, tokens, and participants survive a server restart.

---

## 4. State model

The API-facing aggregate is loaded from PostgreSQL into the active-room cache.

```ts
Room {
  id: string
  campaignId: string | null
  title: string
  pin: string
  scenes: RoomScene[]
  activeSceneIndex: number
  gridVisible: boolean
  participants: Map<participantId, ServerParticipant>
  pointers: Map<participantId | "gm", PointerInfo>
  gmSocketId: string | null
  createdAt: number
  ended: boolean
}

RoomScene {
  id: string
  position: number
  title: string
  background: SceneBackground
  grid: GridSettings | null
  tokens: TokenInfo[]
}

GridSettings {
  cellsAcross: number
  offsetX: number   // 0..1 of one cell; applied modulo 1
  offsetY: number
  aspect?: number   // saved image aspect for server-side row bounds
}

CampaignScene {
  id: string
  title: string
  background: SceneBackground
  grid: GridSettings | null
  tokens: TokenInfo[]   // pre-launch GM tokens
}

PlayerShape =
  "circle" | "square" | "diamond" | "hexagon" |
  "star" | "heart" | "teardrop"

TokenShape = PlayerShape | "triangle-up" | "triangle-down"

TokenInfo {
  id: string
  kind: "player" | "enemy" | "npc"
  label: string
  color: string
  shape: TokenShape
  ownerId: string | null   // participant id, null for GM-created tokens
  cell: { col: number; row: number } | null   // null = in the drawer
  hidden: boolean   // GM tokens only; hidden from player clients
}

ServerParticipant {
  id: string
  tokenHash: string   // SHA-256 of the browser's rejoin token
  name: string
  color: string
  shape: PlayerShape
  socketId: string | null   // in-memory only
  joinedAt: number
}
```

### Durable tables

```text
campaigns
campaign_scenes
campaign_tokens

rooms
room_scenes
room_participants
room_tokens
```

- `campaigns` and `rooms` hold top-level metadata and timestamps.
- `background` and `grid` are typed `jsonb` value objects.
- Scenes and tokens carry explicit `position` values to preserve UI order.
- `rooms_one_active_unique` is a partial unique index on active rooms.
- `room_tokens_visible_cell_unique` prevents visible tokens from sharing a square.
- `room_tokens_player_per_scene_unique` allows one player token per participant per scene.
- `room_participants.token_hash` stores only the SHA-256 digest of the rejoin token.
- `rooms`, `room_scenes`, `room_participants`, and `room_tokens` cascade on delete.

Pointers, `socketId`, `gmSocketId`, and connected flags are never persisted.

The public room shape omits participant tokens and the PIN, but includes the active scene,
scene summaries, grid visibility, and the active scene's tokens:

```ts
PublicRoom {
  id, title,
  scene: { title, background, grid },
  sceneList: { title, hasGrid }[],
  sceneCount, activeSceneIndex, gridVisible,
  tokens: TokenInfo[],
  participants: { id, name, color, shape, connected }[],
  gmConnected, createdAt
}
```

Player tokens are created unplaced when a participant joins and recreated for each scene as it
becomes active. GM enemy/NPC tokens belong to the scene where they were created. Switching back
to a scene restores that scene's token placements.

---

## 5. HTTP API

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | No | Health check |
| `POST` | `/api/gm/login` | Passphrase | Set GM cookie |
| `GET` | `/api/gm/session` | No | Check GM session; report default passphrase |
| `POST` | `/api/gm/logout` | No | Clear GM cookie |
| `GET` | `/api/campaigns` | GM | List campaigns with scene counts |
| `GET` | `/api/campaigns/:id` | GM | Load a campaign and its scenes |
| `POST` | `/api/campaigns` | GM | Create a campaign |
| `PUT` | `/api/campaigns/:id` | GM | Update a campaign |
| `DELETE` | `/api/campaigns/:id` | GM | Delete a campaign and its scenes from PostgreSQL |
| `POST` | `/api/campaigns/:id/copy` | GM | Duplicate a campaign and its scenes |
| `POST` | `/api/campaigns/:id/launch` | GM | Create a live room from the campaign scenes |
| `POST` | `/api/uploads` | GM | Upload a scene image; returns a `/uploads/...` URL |
| `GET` | `/api/rooms/active` | GM | Current live room + PIN |
| `POST` | `/api/rooms/:id/scene` | GM | Change scene by `{ direction }` or `{ index }` |
| `GET` | `/api/rooms/:id` | No | Public room data for the join screen |
| `POST` | `/api/rooms/:id/join` | PIN | Create participant from PIN, name, color, and shape; return participant token |
| `POST` | `/api/rooms/:id/end` | GM | End room and invalidate link |

Uploads are `multipart/form-data` with an `image` field. Accepted types are PNG, JPEG, and WebP;
files are limited to 10 MB. Campaign scene backgrounds reference either an uploaded URL or a
built-in snow/grass/dungeon preset.

### Database and migrations

- `DATABASE_URL` points at PostgreSQL. The included Compose service uses port `5433`.
- `server/db/schema.ts` is the schema source of truth.
- `npm run db:generate` creates a new SQL migration after schema changes.
- `npm run db:migrate` applies pending migrations.
- The server also applies pending migrations before it starts listening.
- `GET /api/health` runs `select 1` and returns `503` if Postgres is unavailable.
- Campaign updates replace the campaign's scene/token tree inside one transaction.
- Room, token, reveal-push, scene-switch, join, launch, and end operations use transactions.
- Room mutations lock the active room row with `SELECT ... FOR UPDATE`.
- The `room_tokens_visible_cell_unique` index is the final occupancy authority. The service
  checks occupancy for a friendly message; a PostgreSQL `23505` violation is translated to the
  same error.
- Revealing a hidden token moves overlapping player tokens before setting `hidden = false`.

---

## 6. Socket events

| Direction | Event | Payload |
|---|---|---|
| C→S | `room:join` | `{ roomId, role: "gm" }` or `{ roomId, role: "player", participantToken }` |
| S→C | `room:state` | `{ room, pointers, participantId? }`; the GM also receives `pin` |
| S→C | `participants:update` | `{ participants, gmConnected }` |
| C→S | `pointer:move` | `{ x, y }` in normalized scene coordinates |
| S→C | `pointer:update` | `{ participantId, name, color, x, y }` |
| C→S | `pointer:end` | No payload |
| S→C | `pointer:end` | `{ participantId }` |
| C→S | `pointer:ping` | `{ x, y }` |
| S→C | `pointer:ping` | `{ id, participantId, name, color, x, y }` |
| C→S | `token:create` | `{ kind: "enemy" \| "npc", name? }`; GM only, acknowledged |
| C→S | `token:place` | `{ tokenId, col, row }`; acknowledged |
| C→S | `token:unplace` | `{ tokenId }`; acknowledged |
| C→S | `token:rename` | `{ tokenId, name }`; GM only, acknowledged |
| C→S | `token:delete` | `{ tokenId }`; GM only, acknowledged |
| C→S | `token:hide` | `{ tokenId, hidden }`; GM only, acknowledged |
| S→C | `tokens:changed` | Full token list for the active scene |
| C→S | `grid:toggle` | `{ visible: boolean }`; GM only, acknowledged |
| S→C | `grid:changed` | `{ visible: boolean }` |
| S→C | `scene:changed` | Updated `PublicRoom` with the new active scene and tokens |
| S→C | `session:ended` | No payload |
| S→C | `room:error` | Error string |

Token and grid actions use Socket.IO acknowledgements so the UI can show a server error without
adding HTTP routes. The server owns token ownership, column bounds, occupancy, and GM-only
checks. Full-row bounds come from the shared client grid math so partial edge squares are never
offered for placement.

The server validates pointer coordinates to `0..1`, so the UI can keep pointers aligned to the
scene regardless of window size or image aspect ratio.

---

## 7. Grid and token design

- Grid settings live on each campaign scene and are copied into the live room at launch.
- `cellsAcross` sets the number of square columns. Rows are derived from the rendered image
  aspect ratio, so cells stay square at any upload resolution.
- `offsetX`/`offsetY` shift the grid in fractions of one cell. The builder exposes 5% nudges,
  an alignment reset, and single-step arrows beside the squares-across count.
- `aspect` stores the preview image ratio for server-side full-row bounds. The builder refreshes
  it when the scene image loads.
- Partial edge squares are visible but never hold tokens.
- Grid geometry is shared by the builder preview, campaign placement preview, and live stage
  through `src/shared/grid.ts`.
- Grid visibility is session-wide and starts **off**. The GM toggles it for everyone.
- While a participant is in movement mode, their client shows a faint local-only grid if the
  shared grid is hidden.
- Campaign scenes own pre-launch GM tokens. The builder places them in the same preview geometry,
  saves them with the scene, and the launch copies them into the live room.
- Scenes can be reordered from the campaign builder with the **Order** arrows. Scene order is
  persisted through the scene `position` column and becomes the live scene order at launch.
- Placed campaign tokens have **Hide / Show** and **Stats** actions in the builder. Hidden tokens
  remain visible to the GM with a muted marker, and their hidden state is saved and copied into
  the live room.
- Tokens are stored per scene. Player tokens return to the drawer when entering a new scene, and
  the previous scene keeps its placements.
- Players receive exactly one token, using the color and shape chosen on the join screen.
- The seven player shapes are circle, square, diamond, hexagon, 8-point star, heart, and teardrop.
- Shapes are SVG paths with a white stroke and dark drop shadow so they remain legible on light and
  dark maps. Shape is never conveyed by color alone.
- Player shapes appear in the session table strip and on the board token. Player pointers remain
  circular with a name label. Player pings use the selected shape outline in the player color.
- The GM can add any number of red enemy tokens (upward triangle) and green NPC tokens (downward
  triangle). The GM pointer and ping also use a downward triangle, in silver.
- GM token creation is drawer-first: each Add creates an unplaced token in the **Active Tokens**
  list without closing the drawer or starting placement.
- **Active Tokens** includes both placed and unplaced GM tokens. A placed token keeps its row but
  its marker is shaded darker; no extra status text is shown.
- Only the token marker starts placement. Clicking the name edits it inline, Enter or blur saves,
  and Escape cancels. `token:rename` broadcasts the new label and initials.
- Each GM token row has **Hide / Show**, **Stats**, and **Delete**:
  - Hide/Show updates `hidden` through `token:hide`. Hidden GM tokens are omitted by player
    clients.
  - Stats opens a smaller panel immediately to the right of the token drawer.
  - Delete permanently removes the token from the tray and the scene.
- Hidden tokens do not block player-token placement. If a player token shares a hidden token's
  square when the token is revealed, the server moves the player token to the nearest free square,
  preferring adjacent cells, and unplaces it if the grid is full.
- The GM can add any number of red enemy and green NPC tokens and view all player stats from the
  **Players** section.
- GM token names are optional. A name is trimmed to 24 characters; otherwise the server assigns
  `Enemy N` or `NPC N`. The first two initials are rendered on every token.
- Player token icons remain in the Character drawer while on the scene, shaded darker. The
  drawer label is the player name in both placed and unplaced states. Only the Character token
  icon starts placement.
- Player stats live inside the Character drawer. The separate player Stats tab no longer exists.
- The player left nav is Scene, Character, and Domain cards. The Scene drawer lists only placed,
  visible tokens with a token glyph and name. Clicking a row emits a client-only ping at the
  token's square; it is not broadcast to other clients.
- Domain cards is a placeholder until Daggerheart domain support exists.
- Both roles use the same Notebook icon for the right-side Notes drawer.
- The session uses fixed full-height icon rails with hover/focus labels. The rails frame the app,
  the title and session heading sit between them, and drawers overlay the scene map without
  resizing or moving it. Both drawers may be open at once.
- Movement is click-to-place, not drag-and-drop: click a token marker, move over a full square,
  click to place. Escape or clicking the marker again cancels. Backspace/Delete or the × returns
  a token to the drawer.
- Occupied squares are rejected by both the client and the server, except that a player token may
  share a hidden GM token's square.
- Players can control only their own token. The GM can control every token, including unplaced
  player tokens from the GM Token drawer.

---

## 8. Scene switching

- The GM header has previous/next arrows and a `current / total` counter.
- The GM **Scenes** drawer lists every scene, marks the live one, and can jump directly to it.
- `scene:changed` broadcasts the new active scene, grid, and token list.
- Pointers and pings are cleared on a scene change.
- Player tokens are ensured for the new scene and start unplaced.

---

## 9. Pointer design

- Normal click: ignored.
- **Shift+click:** send `pointer:ping`; the server broadcasts a ripple.
- **Shift+click+drag:** send throttled `pointer:move` at roughly 20 Hz; the server broadcasts
  the live pointer.
- On release, send `pointer:end`.
- Pointers are rendered inside the scene frame, not over the rest of the UI.
- Player pointer colors come from the join form.
- The GM pointer is always `#cfd6df` (silver), rendered as a downward triangle. The GM ping is a
  downward-triangle outline.
- Player pointers stay circular and labeled with their display name.
- Player identity also carries a shape from the join form. The shape is rendered in the table
  strip, on the player token, and as the player's ping outline.
- The ping payload carries the selected `shape`, so each player's ping matches their token
  without relying on color.
- Pointer state is not persisted and is removed when the sender disconnects.
- The scene frame uses the image's natural aspect ratio so normalized coordinates line up on
  every screen.

---

## 10. Security notes

This is a local alpha, not a public service.

Implemented:

- GM passphrase from `.env`.
- HMAC-signed HttpOnly, SameSite=Lax GM cookie.
- 6-digit PIN checked server-side.
- Participant token required to rejoin a socket as a player.
- Player colors cannot use the GM silver/white values.
- Upload MIME filtering, size limit, random filenames, and `nosniff`.
- `Referrer-Policy: no-referrer`.
- No account, email, phone, or persistent user record.
- No third-party analytics or scripts.

Not implemented yet:

- PIN brute-force rate limiting.
- CSRF tokens (local same-site app only).
- Production HTTPS cookie settings.
- Image re-encoding.
- Public-internet hardening.
- Persistence or audit logs.

Do not expose this alpha to the internet.

---

## 11. Testing performed

- `npm run typecheck`
- `npm run build`
- `npm audit` — zero known vulnerabilities
- API smoke test:
  - GM login
  - Room creation with built-in background
  - Room creation with uploaded PNG
  - Player join with correct PIN
  - Socket join as player and GM
  - Pointer update broadcast between players
  - Pointer ping broadcast
  - GM silver pointer identity
  - Server rejection of occupied and out-of-bounds token moves
- Browser test:
  - GM login
  - Active session rendering
  - Join screen
  - Player join
  - Shared scene and participant strip
  - Per-scene grid builder, slider, and nudge alignment on a preset and an uploaded map
  - GM grid toggle mirrored to the player view
  - GM enemy/NPC token creation and placement
  - Occupied-square ghost rejection
  - Token movement, Backspace deletion, and drawer return
  - Player character drawer and player token placement
  - GM control of a player token
  - Scene switch with per-scene tokens and player token reset
  - Faint local-only grid while the shared grid is hidden
  - Seven-shape join picker with color preview
  - Shape marker in the session table strip and on the player token
  - Silver downward-triangle GM pointer and ping
  - Red upward-triangle enemy and green downward-triangle NPC tokens
  - GM Token drawer triangle source markers
  - Batch GM token creation into the Active Tokens list without entering placement mode
  - Active Tokens list showing placed tokens with shaded markers
  - Inline GM token rename with live initials update on the board
  - Permanent GM token deletion from both tray and scene
  - Token marker-only placement interaction
  - Player Character drawer name label and darker on-scene icon state
  - Player ping outline matching the selected token shape
  - Rounder 8-point star geometry
  - Campaign builder grid arrows (24 → 25 → 24)
  - Pre-launch token placement, save, launch, and live render with initials
  - GM stats panel to the right of the token drawer
  - GM viewing a player token's stats from the Players section
  - Hide/Show removing a token from the player view
  - Player placement on a hidden token's square
  - Reveal pushing the player token to the nearest free adjacent square
  - Server and client no longer showing hidden tokens to players
  - Campaign scene reordering with persisted order
  - Campaign builder Hide/Show and Stats actions for placed tokens
  - Hidden campaign tokens shown muted in the builder preview
  - Full-height icon rails with hover/focus tooltips
  - Overlay drawers that do not resize the scene map
  - Independent left/right drawers that can both be open
  - Player placed-token list and client-only token ping
  - Player Character and Domain cards navigation, with stats moved into Character
  - Shared Notebook icon for GM and player Notes

---

## 12. Next implementation step

The next milestone is **movement rules and GM control**:

- Movement allowance or range-band checks during placement.
- Board lock and per-token locks.
- Movement requests and GM approvals in the **Requests** drawer.
- Optional drag-and-drop as a shortcut, reusing server validation.
- A visible indication when a move is requested or approved.

PostgreSQL persistence is already in place for campaigns, rooms, tokens, and participants.
