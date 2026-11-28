CREATE TYPE "public"."player_shape" AS ENUM('circle', 'square', 'diamond', 'hexagon', 'star', 'heart', 'teardrop');--> statement-breakpoint
CREATE TYPE "public"."room_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."token_kind" AS ENUM('player', 'enemy', 'npc');--> statement-breakpoint
CREATE TYPE "public"."token_shape" AS ENUM('circle', 'square', 'diamond', 'hexagon', 'star', 'heart', 'teardrop', 'triangle-up', 'triangle-down');--> statement-breakpoint
CREATE TABLE "campaign_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"background" jsonb NOT NULL,
	"grid" jsonb
);
--> statement-breakpoint
CREATE TABLE "campaign_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "token_kind" NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"shape" "token_shape" NOT NULL,
	"cell_col" integer,
	"cell_row" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "campaign_tokens_kind_check" CHECK ("campaign_tokens"."kind" <> 'player'),
	CONSTRAINT "campaign_tokens_cell_pair_check" CHECK (("campaign_tokens"."cell_col" is null) = ("campaign_tokens"."cell_row" is null)),
	CONSTRAINT "campaign_tokens_color_check" CHECK ("campaign_tokens"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"shape" "player_shape" NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "room_participants_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "room_participants_color_check" CHECK ("room_participants"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "room_scenes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"background" jsonb NOT NULL,
	"grid" jsonb
);
--> statement-breakpoint
CREATE TABLE "room_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scene_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"kind" "token_kind" NOT NULL,
	"label" text NOT NULL,
	"color" text NOT NULL,
	"shape" "token_shape" NOT NULL,
	"owner_participant_id" uuid,
	"cell_col" integer,
	"cell_row" integer,
	"hidden" boolean DEFAULT false NOT NULL,
	CONSTRAINT "room_tokens_cell_pair_check" CHECK (("room_tokens"."cell_col" is null) = ("room_tokens"."cell_row" is null)),
	CONSTRAINT "room_tokens_player_owner_check" CHECK ("room_tokens"."kind" <> 'player' or ("room_tokens"."owner_participant_id" is not null and "room_tokens"."hidden" = false)),
	CONSTRAINT "room_tokens_gm_owner_check" CHECK ("room_tokens"."kind" = 'player' or "room_tokens"."owner_participant_id" is null),
	CONSTRAINT "room_tokens_color_check" CHECK ("room_tokens"."color" ~ '^#[0-9a-fA-F]{6}$')
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid,
	"title" text NOT NULL,
	"pin" text NOT NULL,
	"status" "room_status" DEFAULT 'active' NOT NULL,
	"active_scene_index" integer DEFAULT 0 NOT NULL,
	"grid_visible" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	CONSTRAINT "rooms_ended_at_check" CHECK ("rooms"."status" = 'active' or "rooms"."ended_at" is not null)
);
--> statement-breakpoint
ALTER TABLE "campaign_scenes" ADD CONSTRAINT "campaign_scenes_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_tokens" ADD CONSTRAINT "campaign_tokens_scene_id_campaign_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."campaign_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_scenes" ADD CONSTRAINT "room_scenes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_tokens" ADD CONSTRAINT "room_tokens_scene_id_room_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."room_scenes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_tokens" ADD CONSTRAINT "room_tokens_owner_participant_id_room_participants_id_fk" FOREIGN KEY ("owner_participant_id") REFERENCES "public"."room_participants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_scenes_position_unique" ON "campaign_scenes" USING btree ("campaign_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_tokens_cell_unique" ON "campaign_tokens" USING btree ("scene_id","cell_col","cell_row") WHERE "campaign_tokens"."cell_col" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "room_scenes_position_unique" ON "room_scenes" USING btree ("room_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "room_tokens_visible_cell_unique" ON "room_tokens" USING btree ("scene_id","cell_col","cell_row") WHERE "room_tokens"."cell_col" is not null and "room_tokens"."hidden" = false;--> statement-breakpoint
CREATE UNIQUE INDEX "room_tokens_player_per_scene_unique" ON "room_tokens" USING btree ("scene_id","owner_participant_id") WHERE "room_tokens"."kind" = 'player' and "room_tokens"."owner_participant_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "rooms_one_active_unique" ON "rooms" USING btree ("status") WHERE "rooms"."status" = 'active';