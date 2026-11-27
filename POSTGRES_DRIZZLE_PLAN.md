# Postgres + Drizzle Implementation Plan

Status: Implemented

## Goal

Replace the two in-memory stores with PostgreSQL, use Drizzle ORM for schema and migrations, and preserve the existing HTTP and Socket.IO behavior.

The public API and shared TypeScript types should remain stable. The main internal change is that database-backed service functions become asynchronous.

---

## 1. Architecture decisions

| Area | Decision |
|---|---|
| Database | PostgreSQL 16+ |
| ORM | Drizzle ORM |
| Driver | `pg` with `drizzle-orm/node-postgres` |
| Migrations | `drizzle-kit generate` + `drizzle-kit migrate` |
| Local database | Docker Compose, with a native Postgres fallback |
| Durable state | Campaigns, scenes, tokens, rooms, participants |
| Ephemeral state | Pointers, socket IDs, connected flags, pings |
| Uploaded files | Stay on disk; Postgres stores references |
| Active room | Enforced with a partial unique index |
| Active room reads | Small write-through in-memory cache for socket latency |
| Timestamps | `timestamptz` in Postgres, mapped back to epoch milliseconds |
| Nested grids/backgrounds | `jsonb` columns typed with the existing shared types |
| Tokens | Normalized rows so occupancy can be enforced by indexes |

The database is authoritative. The active-room cache exists only to keep `publicRoom`, `publicTokens`, and Socket.IO broadcasting fast. Cache updates happen only after a successful database transaction.

---

## 2. Dependencies and configuration

### Add dependencies

```powershell
npm install drizzle-orm pg
npm install -D drizzle-kit @types/pg
```

### Add scripts

```json
{
  "scripts": {
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:check": "drizzle-kit check",
    "db:studio": "drizzle-kit studio"
  }
}
```

Use `drizzle-kit generate` and committed SQL migrations. Do not use `drizzle-kit push` as the normal workflow.

### Add environment values

`.env.example`:

```env
DATABASE_URL=postgres://gmtool:gmtool@localhost:5433/gmtool
GM_SECRET=replace-with-a-long-random-string
```

`GM_SECRET` should be set explicitly so GM cookies survive a server restart. The current fallback generates a random secret each time the process starts.

### Add `compose.yaml`

Use Postgres 16 with a named volume and health check:

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gmtool
      POSTGRES_PASSWORD: gmtool
      POSTGRES_DB: gmtool
    ports:
      - "5433:5432"
    volumes:
      - gmtool_pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gmtool -d gmtool"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  gmtool_pgdata:
```

Add the database setup to `README.md`:

```powershell
docker compose up -d db
npm run db:migrate
npm run dev
```

---

## 3. Database schema

Create:

```text
server/db/
  client.ts        Pool and Drizzle instance
  schema.ts        Tables, enums, indexes, relations
  migrate.ts       Migration runner
  mappers.ts       Database rows -> shared API types
```

### Core tables

```text
campaigns
campaign_scenes
campaign_tokens

rooms
room_scenes
room_participants
room_tokens
```

Relationship shape:

```text
campaigns 1 ── * campaign_scenes 1 ── * campaign_tokens
campaigns 1 ── * rooms
rooms     1 ── * room_scenes 1 ── * room_tokens
rooms     1 ── * room_participants
```

Room scenes are snapshots of campaign scenes. They must not reference campaign scenes directly, because editing a campaign after launch must not change a live room.

### Recommended schema details

#### `campaigns`

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Index:

```sql
CREATE INDEX campaigns_updated_at_idx ON campaigns (updated_at DESC);
```

#### `campaign_scenes`

- `id uuid primary key`
- `campaign_id uuid not null references campaigns(id) on delete cascade`
- `position integer not null`
- `title text not null`
- `background jsonb not null`
- `grid jsonb`

Use `jsonb` for `background` and `grid` because they are value objects with the existing shared types:

```ts
background: jsonb('background').$type<SceneBackground>().notNull(),
grid: jsonb('grid').$type<GridSettings>(),
```

Constraint:

```sql
UNIQUE (campaign_id, position)
```

#### `campaign_tokens`

- `id uuid primary key`
- `scene_id uuid not null references campaign_scenes(id) on delete cascade`
- `position integer not null`
- `kind token_kind not null`
- `label text not null`
- `color text not null`
- `shape token_shape not null`
- `cell_col integer`
- `cell_row integer`
- `hidden boolean not null default false`

Constraints:

```sql
CHECK (kind IN ('enemy', 'npc'))
CHECK ((cell_col IS NULL) = (cell_row IS NULL))
CHECK (color ~ '^#[0-9a-fA-F]{6}$')
```

Unique occupied cell:

```sql
CREATE UNIQUE INDEX campaign_tokens_unique_cell
  ON campaign_tokens (scene_id, cell_col, cell_row)
  WHERE cell_col IS NOT NULL;
```

#### `rooms`

- `id uuid primary key`
- `campaign_id uuid references campaigns(id) on delete set null`
- `title text not null`
- `pin text not null`
- `status room_status not null default 'active'`
- `active_scene_index integer not null default 0`
- `grid_visible boolean not null default false`
- `created_at timestamptz not null default now()`
- `ended_at timestamptz`

Enforce one active room:

```sql
CREATE UNIQUE INDEX rooms_one_active
  ON rooms (status)
  WHERE status = 'active';
```

Also add:

```sql
CHECK (status = 'active' OR ended_at IS NOT NULL)
```

The PIN remains plaintext because the GM must retrieve it. This is acceptable for a local-only app. If the app becomes remote, add rate limiting and reconsider PIN storage.

#### `room_scenes`

Same fields as `campaign_scenes`, but with `room_id`:

- `id uuid primary key`
- `room_id uuid not null references rooms(id) on delete cascade`
- `position integer not null`
- `title text not null`
- `background jsonb not null`
- `grid jsonb`

Constraint:

```sql
UNIQUE (room_id, position)
```

#### `room_participants`

- `id uuid primary key`
- `room_id uuid not null references rooms(id) on delete cascade`
- `token_hash text not null unique`
- `name text not null`
- `color text not null`
- `shape player_shape not null`
- `joined_at timestamptz not null default now()`

Do not store the raw participant bearer token. Generate the token on join, return it to the browser, and store only its SHA-256 hash. The existing `findParticipantByToken` becomes a hash lookup.

`connected` is not stored. It is derived from the live socket map.

#### `room_tokens`

- `id uuid primary key`
- `scene_id uuid not null references room_scenes(id) on delete cascade`
- `position integer not null`
- `kind token_kind not null`
- `label text not null`
- `color text not null`
- `shape token_shape not null`
- `owner_participant_id uuid references room_participants(id) on delete cascade`
- `cell_col integer`
- `cell_row integer`
- `hidden boolean not null default false`

Constraints:

```sql
CHECK ((cell_col IS NULL) = (cell_row IS NULL))
CHECK (kind <> 'player' OR (owner_participant_id IS NOT NULL AND hidden = false))
CHECK (kind = 'player' OR owner_participant_id IS NULL)
CHECK (color ~ '^#[0-9a-fA-F]{6}$')
```

Visible occupancy:

```sql
CREATE UNIQUE INDEX room_tokens_visible_cell
  ON room_tokens (scene_id, cell_col, cell_row)
  WHERE cell_col IS NOT NULL AND hidden = false;
```

One player token per participant per scene:

```sql
CREATE UNIQUE INDEX room_tokens_player_per_scene
  ON room_tokens (scene_id, owner_participant_id)
  WHERE kind = 'player' AND owner_participant_id IS NOT NULL;
```

The occupancy index intentionally excludes hidden tokens, preserving the rule that a player may stand on a hidden GM token's square.

### PostgreSQL enums

Use `pgEnum` for stable enums:

```text
token_kind      = player | enemy | npc
player_shape    = circle | square | diamond | hexagon | star | heart | teardrop
token_shape     = player_shape | triangle-up | triangle-down
room_status     = active | ended
```

Adding a shape later requires a migration to add the enum value. That is acceptable because the shape list is stable.

### Drizzle schema shape

Use `uniqueIndex(...).where(sql`...`)` for partial indexes, and `check(...)` for row constraints.

Example:

```ts
export const roomTokens = pgTable(
  'room_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id').notNull(),
    kind: tokenKind('kind').notNull(),
    label: text('label').notNull(),
    color: text('color').notNull(),
    shape: tokenShape('shape').notNull(),
    ownerParticipantId: uuid('owner_participant_id'),
    cellCol: integer('cell_col'),
    cellRow: integer('cell_row'),
    hidden: boolean('hidden').notNull().default(false),
  },
  (table) => [
    uniqueIndex('room_tokens_visible_cell')
      .on(table.sceneId, table.cellCol, table.cellRow)
      .where(sql`${table.cellCol} is not null and ${table.hidden} = false`),
    uniqueIndex('room_tokens_player_per_scene')
      .on(table.sceneId, table.ownerParticipantId)
      .where(
        sql`${table.kind} = 'player' and ${table.ownerParticipantId} is not null`,
      ),
    check(
      'room_token_cell_pair',
      sql`(${table.cellCol} is null) = (${table.cellRow} is null)`,
    ),
  ],
);
```

---

## 4. Migration workflow

1. Edit `server/db/schema.ts`.
2. Run:

```powershell
npm run db:generate
```

3. Review the generated SQL in `server/db/migrations/`.
4. Commit the schema change and migration together.
5. Run:

```powershell
npm run db:migrate
```

6. Use `npm run db:studio` for inspection if desired.
7. Run `npm run db:check` in verification.

For this local alpha, run pending migrations at startup through `server/db/migrate.ts` before `httpServer.listen`. This keeps local setup simple and is safe while only one process runs.

If the app later runs multiple instances, move migrations to a release/deploy step.

---

## 5. Code refactor plan

### 5.1 Database client

Create `server/db/client.ts`:

```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { pool };
```

Enable graceful shutdown:

```ts
process.on('SIGINT', () => void pool.end());
process.on('SIGTERM', () => void pool.end());
```

Add a database check to `GET /api/health`:

```sql
SELECT 1
```

This prevents a false "healthy" response when Postgres is unavailable.

### 5.2 Async conversion

`pg` is asynchronous, unlike the previous in-memory store. This is the largest refactor.

Convert to `async`:

- Campaign repository functions.
- Room creation, launch, end, join, and token mutation functions.
- HTTP route handlers that call them.
- Socket mutation handlers.

Express 4 does not automatically catch rejected promises. Add a small `asyncHandler` wrapper.

For Socket.IO, wrap async handlers so every failure reaches the existing `ack`:

```ts
void handleTokenPlace(payload, ack).catch((error) => {
  reply(ack, {
    ok: false,
    error: error instanceof Error ? error.message : 'Unexpected error.',
  });
});
```

Do not leave unhandled promise rejections in socket handlers.

### 5.3 Active-room cache

Keep a cache to avoid rewriting all read and broadcast code:

```ts
let activeRoom: Room | null = null;

export async function hydrateActiveRoom(): Promise<void> {
  activeRoom = await loadActiveRoomAggregate();
}

export function getActiveRoom(): Room | null {
  return activeRoom;
}
```

Rules:

- Hydrate before the server begins listening.
- Database transaction succeeds first.
- Cache is updated second.
- Cache is cleared or replaced on room end/launch.
- Cache is never authoritative over Postgres.

`publicRoom`, `publicTokens`, and `publicParticipants` can remain synchronous because they operate on the loaded cache.

All room mutations must be serialized. Use one or both of:

- `SELECT ... FOR UPDATE` on the room row at the start of each write transaction.
- A per-room promise queue around cache mutation and database writes.

This prevents interleaved token moves and reveal-push operations now that event handlers are asynchronous.

### 5.4 Repository boundaries

Suggested files:

```text
server/repositories/
  campaigns.ts
  campaign-scenes.ts
  campaign-tokens.ts
  rooms.ts
  room-scenes.ts
  room-participants.ts
  room-tokens.ts
```

Keep the existing public function names where practical:

- `listCampaigns`
- `getCampaign`
- `createCampaign`
- `updateCampaign`
- `deleteCampaign`
- `copyCampaign`
- `getActiveRoom`
- `createRoom`
- `changeRoomScene`
- `setRoomScene`
- `endRoom`
- `addParticipant`
- `findParticipantByToken`
- `findParticipantBySocket`
- `publicParticipants`
- `publicTokens`
- `createGmToken`
- `placeToken`
- `unplaceToken`
- `renameToken`
- `deleteToken`
- `setTokenHidden`
- `setGridVisible`
- `publicRoom`

This keeps the route and socket layers mostly recognizable while replacing their storage implementation.

### 5.5 Mapping layer

Create mappers that convert:

- `timestamptz` -> epoch milliseconds
- database enum/text -> `TokenShape`, `PlayerShape`, `TokenKind`
- `jsonb` -> `SceneBackground`, `GridSettings`
- joined rows -> `Campaign`, `Room`, `TokenInfo`, `ServerParticipant`

Preserve the existing API contract. Do not let `Date` objects leak into JSON responses.

### 5.6 Presence separation

Keep these in memory only:

```ts
const participantSockets = new Map<string, string>();
let gmSocketId: string | null = null;
const pointers = new Map<string, PointerInfo>();
```

Do not add database columns for:

- `socket_id`
- `connected`
- `gm_connected`
- pointer coordinates
- ping IDs

After a server restart, participants exist in Postgres but are disconnected until Socket.IO rejoins. This is correct behavior.

### 5.7 Upload handling

Phase 1 keeps the current behavior:

- Multer writes images to `uploads/`.
- Campaign and room scenes store the existing background URL in `jsonb`.
- No image bytes go into Postgres.

Optional later phase:

- Add an `uploads` table with filename, MIME type, byte size, and created time.
- Track references from campaign/room scenes.
- Add orphan cleanup for images no longer referenced.

Campaign copy reuses the same image URL, so upload cleanup must account for multiple references.

---

## 6. Transaction boundaries

Use `db.transaction()` for every multi-row operation.

| Operation | Transaction |
|---|---|
| Create campaign | Insert campaign, scenes, tokens |
| Update campaign | Lock campaign row; update it; replace scenes/tokens |
| Delete campaign | Delete campaign; cascades children |
| Copy campaign | Read source tree; insert new IDs |
| Launch room | End active room; insert room, scenes, tokens |
| End room | Set `status = 'ended'`, `ended_at` |
| Join player | Insert participant and player token |
| Switch scene | Update active index; insert missing player tokens |
| Place/unplace token | Validate control and cell; update token |
| Hide/show token | Update hidden flag; on reveal, move occupants first |
| Delete token | Delete token row |
| Toggle grid | Update `grid_visible` |

### Reveal-push ordering

The current order is:

1. Set `hidden = false`.
2. Move the player token.

With the partial unique index, that order fails. Change it to:

1. Find the hidden token and overlapping player tokens.
2. Move or unplace the player tokens.
3. Set `hidden = false`.
4. Commit.

All inside one transaction.

### Occupancy conflicts

The service should still check occupancy for a good error message, but the partial unique index is the final authority. Catch PostgreSQL unique violation `23505` and return the existing "That square is already occupied." message.

### Campaign update replacement

`updateCampaign` currently replaces the full scene/token tree. Preserve that behavior:

1. Lock the campaign row.
2. Update the campaign name and `updated_at`.
3. Delete the campaign's scenes; tokens cascade.
4. Insert the new scene and token rows with their positions.

Keep this scoped to the campaign ID. Do not allow a scene or token ID from another campaign to be overwritten.

---

## 7. Testing plan

Add a test database separate from the development database, for example:

```env
DATABASE_URL_TEST=postgres://gmtool:gmtool@localhost:5433/gmtool_test
```

Test cases:

### Campaigns

- Create, list, get, update, delete.
- Copy creates new campaign/scene/token IDs.
- Scene order is preserved.
- Nested tokens and grids round-trip correctly.
- Deleting a campaign removes its scenes and tokens.

### Rooms

- Launching snapshots the campaign.
- Launching ends the previous active room.
- The partial unique index prevents two active rooms.
- Ending a room clears the active room.
- Scene switching preserves per-scene tokens and creates missing player tokens.
- Restarting the server reloads the active room.

### Participants

- Join creates one participant and one player token.
- Rejoin via the hashed participant token works after restart.
- Connected state is derived from sockets, not the database.
- Participant tokens are not stored in plaintext.

### Tokens

- Place, unplace, rename, delete, hide, show.
- Visible tokens cannot share a square.
- A player can share a square with a hidden GM token.
- Revealing a hidden token pushes the player to a free square.
- Reveal fails safely if the player cannot be moved.
- Player tokens cannot be hidden.
- Players can only control their own token.

### API and sockets

- Express async errors return JSON errors, not process crashes.
- Socket acknowledgements always resolve on database errors.
- Rapid token events are serialized.
- No unhandled promise rejections.

### Verification

```powershell
npm run db:check
npm run typecheck
npm run build
npm audit --omit=dev
```

Then run a browser smoke test for:

- Campaign builder save/load/copy/launch.
- Live scene switching.
- Token placement and hiding.
- Player rejoin after server restart.
- GM and player stats drawers.
- No console errors.

---

## 8. Rollout sequence

### Phase 0 - Branch and infrastructure

- Create `feat/postgres-drizzle` per `AGENTS.MD`.
- Add `compose.yaml`, dependencies, scripts, env example, and DB client.
- Add the initial Drizzle schema and migration.
- Confirm the app starts with an empty database.

### Phase 1 - Campaigns

- Replace the `campaigns` array with repository functions.
- Convert campaign routes to async.
- Verify campaign CRUD and copy.
- This phase is lower risk and proves the ORM setup.

### Phase 2 - Rooms

- Add room repositories and mappers.
- Add active-room hydration.
- Convert room creation, launch, end, scene switching, and joins.
- Keep presence and pointers in memory.
- Preserve the active-room cache.

### Phase 3 - Tokens and grid

- Convert token create/place/unplace/rename/delete/hide.
- Add row locking and transaction boundaries.
- Implement reveal-push with the corrected ordering.
- Add unique index error handling.

### Phase 4 - Restart persistence

- Verify active room hydrates on boot.
- Verify player rejoin with the session token.
- Verify GM cookie persistence with `GM_SECRET`.
- Verify no stale socket IDs or pointer state are restored.

### Phase 5 - Cleanup and docs

- Update `README.md`, `ALPHA_IMPLEMENTATION.md`, and `MVP_OUTLINE.md`.
- Document database setup, migration commands, and backup notes.
- Add optional upload metadata/cleanup only if needed.
- Open a pull request to `main`.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Async refactor breaks socket error handling | Central async wrappers; always call `ack`; add error tests |
| Token races after going async | `SELECT ... FOR UPDATE` or per-room mutation queue |
| Reveal-push violates occupancy index | Move players before setting `hidden = false` |
| Campaign update touches another campaign's rows | Scope every child query by `campaign_id`; validate IDs |
| JSONB shape drift | Keep existing validators; add round-trip tests |
| Postgres unavailable locally | Docker health check and a database-aware `/api/health` |
| Migration drift | Commit generated SQL; review migrations; use `db:check` |
| Lost in-memory demo data | No migration exists; treat first Postgres start as a fresh database or add a one-time seed script |
| Uploaded files orphaned | Keep files; add reference-counted cleanup later |
| Multiple app instances later | Drop the active-room cache or add Redis; move migrations out of startup |

---

## 10. Acceptance criteria

The migration is complete when:

- `docker compose up -d db` and `npm run db:migrate` produce a working schema.
- Campaigns, scenes, tokens, and rooms survive a server restart.
- Only one active room can exist.
- Players can rejoin after restart.
- Token occupancy is enforced by Postgres.
- Hidden-token overlap and reveal-push work exactly as before.
- Pointers and presence remain ephemeral.
- The existing API and Socket.IO payloads are unchanged.
- `npm run typecheck`, `npm run build`, `npm run db:check`, and `npm audit --omit=dev` pass.
- Browser smoke tests pass with no console errors.

---

## 11. Implementation notes

- The Compose database publishes **5433** to avoid conflicting with an existing local
  PostgreSQL installation on 5432.
- Scene and token rows carry explicit `position` values so UI ordering survives database reads.
- Participant rejoin tokens are stored as SHA-256 hashes; the raw token only goes to the browser.
- The active room is cached in memory after hydration, but PostgreSQL remains authoritative.
- Room write transactions lock the active room row with `SELECT ... FOR UPDATE`.
- Ended rooms remain in the database for future history features; only one room can be active.
- The initial migration is `server/db/migrations/0000_rich_chameleon.sql`.
- Verified end to end: campaign CRUD/copy, multi-scene launch, player join and rejoin after a
  server restart, scene switching with player-token creation, hidden-token overlap, and reveal
  push.
