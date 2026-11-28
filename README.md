# GMTool Alpha

A local-only alpha for campaign prep and a shared Daggerheart session table.

The current shell includes:

- A GM dashboard with a PostgreSQL-backed campaign list.
- A campaign builder with multiple scenes, a scene stepper, a preview window, an optional
  square token grid, and pre-launch GM token placement.
- Copy, Edit, Delete, and Launch actions for each campaign.
- A live session with a scene grid, tokens, hidden-token controls, pointers, presence, and a
  join link/PIN.
- Slide-out session drawers for scenes, tokens, characters, stats placeholders, and notes.

Campaigns, scenes, tokens, live rooms, and participants persist in PostgreSQL. Pointers, socket
connections, and presence remain ephemeral.

No movement rules, movement approvals, character sheets, or note storage yet.

---

## Requirements

- Node.js **20 or newer**
- npm
- PostgreSQL **16 or newer**, or Docker Desktop
- A modern desktop browser

The alpha was developed on Windows with Node 20.15, npm 10.7, and PostgreSQL 16.

---

## Setup

```powershell
npm install
Copy-Item .env.example .env
docker compose up -d db
npm run db:migrate
```

Edit `.env` and set a GM passphrase:

```env
PORT=3001
GM_PASSPHRASE=your-local-passphrase
DATABASE_URL=postgres://gmtool:gmtool@localhost:5433/gmtool
GM_SECRET=replace-with-a-long-random-string
```

The included Compose service exposes PostgreSQL on **5433** so it does not conflict with a
Postgres installation already using 5432. If you use your own database, change `DATABASE_URL`.

`GM_SECRET` is optional. If it is omitted, a random secret is generated each time the server
starts, which means the GM has to log in again after a restart. Set it to keep the login cookie
valid across restarts.

For local development, the server applies pending Drizzle migrations before it starts. You can
also run them explicitly with `npm run db:migrate`.

### Database commands

```powershell
npm run db:generate   # generate a migration after changing server/db/schema.ts
npm run db:migrate    # apply pending migrations
npm run db:check      # check migration files
npm run db:studio     # inspect the database
```

Stop the database with `docker compose down`. The named `gmtool_pgdata` volume keeps the data.
Use `docker compose down -v` only when you intentionally want to delete all persisted data.

---

## Run in development

```powershell
npm run dev
```

This starts:

- The app server on `http://localhost:3001`
- The Vite client on `http://localhost:5173`

Open the GM console:

```text
http://localhost:5173/gm
```

The Vite dev server proxies `/api`, `/uploads`, and `/socket.io` to the app server.

---

## Run a local production build

```powershell
npm run build
npm start
```

Open:

```text
http://localhost:3001/gm
```

The Express server serves the built client and the API from one process.

---

## First test

1. Open the GM console and enter the passphrase.
2. Click **New Campaign**.
3. Enter a campaign name, then set up Scene 1.
4. Use **Add Scene** to create more scenes and the stepper to move between them. Use the
   **Order** ← / → buttons to move the current scene earlier or later.
5. Upload a background image or choose a built-in background. The preview updates.
6. Click **Add grid** under **Token grid** if this scene should hold tokens.
7. Drag the **Squares across** slider, or use the **← / →** arrows beside the count for
   single-step changes. Use the **Nudge** arrows until the grid lines align with the map.
8. In **Scene tokens**, optionally enter a name and click **Add** for each enemy or NPC.
9. Click a token marker, then click a square in the preview. Only the marker starts placement.
   Placed markers are shaded and gain **Hide / Show** and **Stats** actions. Names can be edited
   inline, and tokens can be deleted.
10. Click **Save Campaign**. The campaign appears on the dashboard.
11. Open the vertical ellipsis menu and choose **Launch**. Pre-placed GM tokens appear in the
    live scene.
12. In the live session, use the forward/back arrows under **Scenes** or the **Scene** drawer
    to move through the campaign.
13. Toggle **Grid** in the GM header. The setting is shared with every player.
14. Open the **Token** drawer. **Active Tokens** shows placed and unplaced GM tokens. Only the
    marker starts placement. Click the name to rename, use **Hide / Show**, **Stats**, or
    **Delete**. Placed markers are shaded.
15. **Stats** opens a smaller panel to the right of the token drawer. The **Players** section
    lets the GM view every player token's stats.
16. Click a placed token on the map to enter movement mode. Move over a square and click to
    move. Press **Backspace** or **Delete**, or click the **×**, to return it to the drawer.
17. Click **Join session**, then **Copy link + PIN**.
18. Open the join link in another browser window, incognito window, or a second browser.
19. Enter the PIN, a display name, a pointer color, and a token shape.
20. Open the **Character** drawer and click the token marker to place your token. On the right,
    **Stats** opens your stats drawer; **Notes** remains available.
21. Confirm both windows show the same scene, grid, and visible tokens.
22. Hide a GM token. The player view no longer shows it. Move the player token onto its square,
    then show the token again. The player token is pushed to a nearby free square.
23. Hold **Shift** and click the scene in one window. The other window should show your ping in
    your chosen shape.
24. Hold **Shift** and drag to point continuously. A normal click on empty scene space does
    nothing. This is intentional.

To test more players, repeat the join flow in more browser windows. Each participant needs a
distinct display name and color. Players can only place, move, and remove their own token; the
GM can control every token.

---

## Campaign dashboard

Each campaign row shows:

- Campaign name
- Number of scenes
- Last updated date
- A vertical ellipsis menu with:
  - **Copy** — duplicates the campaign and its scenes.
  - **Edit** — reopens the campaign builder.
  - **Delete** — permanently removes the campaign and its scenes from PostgreSQL.
  - **Launch** — starts a live session at the campaign's first scene.

If a session is already live, the dashboard shows a **Live session** banner with Resume and End
actions.

---

## What works

- Local GM passphrase.
- PostgreSQL-backed campaign list with Drizzle migrations.
- Multi-scene campaign builder with scene stepper and preview.
- Scene background upload or snow/grass/dungeon presets.
- Optional per-scene square grid with a size slider, single-step arrows, offset nudges, and
  alignment reset.
- Pre-launch GM token placement in the campaign builder, including names and placement in the
  preview. Pre-placed tokens appear when the campaign launches.
- Campaign scenes can be reordered with the builder's **Order** arrows; the new order is saved
  and used when the campaign launches.
- Placed campaign tokens have **Hide / Show** and **Stats** actions. Hidden tokens stay visible
  to the GM with a muted marker and launch in the hidden state.
- Campaign copy, edit, delete, and launch.
- One active live session at a time.
- Live session uses the campaign's scenes with forward/back scene arrows in the GM header.
- Scene picker in the GM **Scene** drawer.
- Shared grid visibility toggle in the GM header, off by default.
- A faint local-only grid appears while a player or GM is placing a token with the shared grid
  hidden.
- Red enemy tokens are upward triangles; green NPC tokens are downward triangles. Both are
  created from the GM **Token** drawer. Multiple copies are allowed.
- GM tokens can be named and renamed inline. **Active Tokens** keeps placed and unplaced tokens
  in one list. Only the marker starts placement; placed markers are shaded.
- Each GM token row has **Hide / Show**, **Stats**, and **Delete**. Hidden tokens are removed
  from the player view. Delete removes the token from both the tray and the scene.
- Players can move onto a hidden token's square. Revealing the token pushes the player token to
  a nearby free square.
- GM **Stats** opens a smaller drawer to the right of the token drawer. The **Players** section
  lets the GM view every player token's stats.
- One player token per player, using the color and shape chosen at join.
- Seven token shapes: circle, square, diamond, hexagon, 8-point star, heart, and teardrop.
- The selected color and shape appear in the session table strip and on the player token.
- Player pings use the player's selected shape and color.
- The GM pointer, GM ping, and GM table badge are silver downward triangles.
- The Character drawer shows the player name and darkens the token icon while that token is on
  the scene. Only the token marker starts player placement.
- The player's right side has **Stats** and **Notes** drawers. The player sees only their own
  stats; the GM can view all player stats.
- Click-to-place movement mode with a transparent ghost token and full-square snapping.
- Occupied squares are rejected by the client and the server, except a player token may share a
  square with an invisible hidden GM token.
- `Backspace`/`Delete` or the token **×** returns a token to its drawer.
- Players can control only their own token; the GM can control every token.
- Per-scene token placement. Returning to a scene restores its tokens.
- Session drawers: GM Scene/Token/Requests and Notes; player Character, Stats, and Notes.
- Join link plus 6-digit PIN.
- Player display name, pointer color, and independent token shape.
- Live participant strip with color-and-shape markers and online/offline state.
- Shift+click ping and Shift+drag pointer, over the scene only.
- Color-plus-shape identification that does not rely on red/green distinction.
- Browser refresh or server restart rejoin while the session remains active.
- GM can end the session, invalidating the link.

## What does not exist yet

- Movement rules, movement allowance, board lock, or movement approvals.
- Multi-square tokens, token images, or token stacking outside the hidden-token case.
- Daggerheart stats and abilities. The Stats drawers are placeholders.
- Scene zoom, pan, rotation, or perspective correction for grids.
- Character sheets, characters, or character selection.
- Frames, session history, or snapshots.
- Notes storage, party journal, Fear, countdowns, or dice. The Notes drawer is a placeholder.
- Remote deployment beyond the local Docker Postgres service.
- Voice, video, or text chat.
- Rate limiting or hardened public-internet security.

---

## Project structure

```text
compose.yaml          Local PostgreSQL service
drizzle.config.ts     Drizzle schema and migration configuration
server/
  auth.ts             GM passphrase cookie
  campaigns.ts        PostgreSQL campaign repository
  db/
    client.ts         Postgres pool and Drizzle client
    schema.ts         Tables, enums, constraints, and indexes
    migrate.ts        Migration runner
    migrations/       Generated Drizzle SQL migrations
  index.ts            Express API, migrations, startup, and static serving
  rooms.ts            Database-backed rooms plus in-memory socket/pointer presence
  socket.ts           Socket.IO room, pointer, token, and grid events
src/
  client/
    components/       SceneStage, ScenePreview, GridOverlay, GridEditor,
                      CampaignTokenEditor, SessionDrawers, ShapeIcon,
                      ParticipantStrip
    hooks/            useRoomSocket
    lib/              API, sessionStorage, and token helpers
    pages/            Dashboard, campaign builder, GM session, join, player session
    App.tsx
    main.tsx
    styles.css
  shared/
    grid.ts           Shared square-grid geometry and cell math
    shapes.ts         Shape/color constants, labels, and GM token shapes
    types.ts          Shared client/server types
```

---

## Troubleshooting

- **GM login fails:** Check `GM_PASSPHRASE` in `.env`. The default is `gm-alpha`, but the
  server warns when it is active.
- **Campaigns disappeared after restart:** Expected. The campaign store is in memory for now.
- **Live session disappeared after restart:** Expected. Live rooms are in memory for now.
- **Player cannot rejoin after refresh:** The participant token is stored in
  `sessionStorage` for that tab. A brand-new tab must rejoin with the link and PIN.
- **Port already in use:** Change `PORT` in `.env` and the Vite proxy target in
  `vite.config.ts`, or stop the other process.
- **Upload rejected:** Use PNG, JPEG, or WebP under 10 MB.
- **Grid does not line up:** Use **Squares across** first, then the **Nudge** arrows. Partial
  edge squares are shown by the grid but cannot hold tokens.
- **Tokens cannot be placed:** The active scene has no grid. Add one in the campaign builder.
  Grid settings are copied when a session launches, so save them before launching.
- **Do not expose this alpha to the internet yet.** It is a local prototype without rate
  limiting or production hardening.

---

## Verification

```powershell
npm run typecheck
npm run build
npm audit
```

The current dependency tree reports zero known vulnerabilities.
