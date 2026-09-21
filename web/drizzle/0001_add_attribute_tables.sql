CREATE TABLE "attribute_defs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"options" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "play_attribute_values" (
	"id" text PRIMARY KEY NOT NULL,
	"play_id" text NOT NULL,
	"attribute_def_id" text NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "play_attribute_values" ADD CONSTRAINT "play_attribute_values_play_id_plays_id_fk" FOREIGN KEY ("play_id") REFERENCES "public"."plays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "play_attribute_values" ADD CONSTRAINT "play_attribute_values_attribute_def_id_attribute_defs_id_fk" FOREIGN KEY ("attribute_def_id") REFERENCES "public"."attribute_defs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "play_attribute_values_play_attr_unique" ON "play_attribute_values" USING btree ("play_id","attribute_def_id");