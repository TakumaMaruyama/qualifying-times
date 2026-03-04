CREATE TABLE "event_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meet_id" uuid NOT NULL,
	"event_code" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meet_likes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"meet_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_likes" ADD CONSTRAINT "event_likes_meet_id_meets_id_fk" FOREIGN KEY ("meet_id") REFERENCES "public"."meets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meet_likes" ADD CONSTRAINT "meet_likes_meet_id_meets_id_fk" FOREIGN KEY ("meet_id") REFERENCES "public"."meets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_likes_unique_key" ON "event_likes" USING btree ("meet_id","event_code","actor_id");--> statement-breakpoint
CREATE INDEX "event_likes_meet_event_idx" ON "event_likes" USING btree ("meet_id","event_code");--> statement-breakpoint
CREATE UNIQUE INDEX "meet_likes_unique_key" ON "meet_likes" USING btree ("meet_id","actor_id");--> statement-breakpoint
CREATE INDEX "meet_likes_meet_idx" ON "meet_likes" USING btree ("meet_id");