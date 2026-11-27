import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  GridSettings,
  SceneBackground,
} from '../../src/shared/types';

const PLAYER_SHAPES = [
  'circle',
  'square',
  'diamond',
  'hexagon',
  'star',
  'heart',
  'teardrop',
] as const;

const TOKEN_SHAPES = [
  ...PLAYER_SHAPES,
  'triangle-up',
  'triangle-down',
] as const;

export const tokenKindEnum = pgEnum('token_kind', [
  'player',
  'enemy',
  'npc',
]);

export const playerShapeEnum = pgEnum('player_shape', PLAYER_SHAPES);
export const tokenShapeEnum = pgEnum('token_shape', TOKEN_SHAPES);
export const roomStatusEnum = pgEnum('room_status', ['active', 'ended']);

export const campaigns = pgTable('campaigns', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignScenes = pgTable(
  'campaign_scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    background: jsonb('background').$type<SceneBackground>().notNull(),
    grid: jsonb('grid').$type<GridSettings>(),
  },
  (table) => [
    uniqueIndex('campaign_scenes_position_unique').on(
      table.campaignId,
      table.position,
    ),
  ],
);

export const campaignTokens = pgTable(
  'campaign_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => campaignScenes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: tokenKindEnum('kind').notNull(),
    label: text('label').notNull(),
    color: text('color').notNull(),
    shape: tokenShapeEnum('shape').notNull(),
    cellCol: integer('cell_col'),
    cellRow: integer('cell_row'),
    hidden: boolean('hidden').notNull().default(false),
  },
  (table) => [
    uniqueIndex('campaign_tokens_cell_unique')
      .on(table.sceneId, table.cellCol, table.cellRow)
      .where(sql`${table.cellCol} is not null`),
    check(
      'campaign_tokens_kind_check',
      sql`${table.kind} <> 'player'`,
    ),
    check(
      'campaign_tokens_cell_pair_check',
      sql`(${table.cellCol} is null) = (${table.cellRow} is null)`,
    ),
    check(
      'campaign_tokens_color_check',
      sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
  ],
);

export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').references(() => campaigns.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull(),
    pin: text('pin').notNull(),
    status: roomStatusEnum('status').notNull().default('active'),
    activeSceneIndex: integer('active_scene_index').notNull().default(0),
    gridVisible: boolean('grid_visible').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('rooms_one_active_unique')
      .on(table.status)
      .where(sql`${table.status} = 'active'`),
    check(
      'rooms_ended_at_check',
      sql`${table.status} = 'active' or ${table.endedAt} is not null`,
    ),
  ],
);

export const roomScenes = pgTable(
  'room_scenes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    background: jsonb('background').$type<SceneBackground>().notNull(),
    grid: jsonb('grid').$type<GridSettings>(),
  },
  (table) => [
    uniqueIndex('room_scenes_position_unique').on(
      table.roomId,
      table.position,
    ),
  ],
);

export const roomParticipants = pgTable(
  'room_participants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    name: text('name').notNull(),
    color: text('color').notNull(),
    shape: playerShapeEnum('shape').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      'room_participants_color_check',
      sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
  ],
);

export const roomTokens = pgTable(
  'room_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sceneId: uuid('scene_id')
      .notNull()
      .references(() => roomScenes.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: tokenKindEnum('kind').notNull(),
    label: text('label').notNull(),
    color: text('color').notNull(),
    shape: tokenShapeEnum('shape').notNull(),
    ownerParticipantId: uuid('owner_participant_id').references(
      () => roomParticipants.id,
      { onDelete: 'cascade' },
    ),
    cellCol: integer('cell_col'),
    cellRow: integer('cell_row'),
    hidden: boolean('hidden').notNull().default(false),
  },
  (table) => [
    uniqueIndex('room_tokens_visible_cell_unique')
      .on(table.sceneId, table.cellCol, table.cellRow)
      .where(sql`${table.cellCol} is not null and ${table.hidden} = false`),
    uniqueIndex('room_tokens_player_per_scene_unique')
      .on(table.sceneId, table.ownerParticipantId)
      .where(
        sql`${table.kind} = 'player' and ${table.ownerParticipantId} is not null`,
      ),
    check(
      'room_tokens_cell_pair_check',
      sql`(${table.cellCol} is null) = (${table.cellRow} is null)`,
    ),
    check(
      'room_tokens_player_owner_check',
      sql`${table.kind} <> 'player' or (${table.ownerParticipantId} is not null and ${table.hidden} = false)`,
    ),
    check(
      'room_tokens_gm_owner_check',
      sql`${table.kind} = 'player' or ${table.ownerParticipantId} is null`,
    ),
    check(
      'room_tokens_color_check',
      sql`${table.color} ~ '^#[0-9a-fA-F]{6}$'`,
    ),
  ],
);
