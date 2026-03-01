CREATE TYPE "public"."course" AS ENUM('SCM', 'LCM');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('M', 'F');--> statement-breakpoint
CREATE TYPE "public"."standard_level" AS ENUM('national', 'kyushu', 'kagoshima');--> statement-breakpoint
CREATE TABLE "sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"pages_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "standard_level" NOT NULL,
	"season" integer NOT NULL,
	"course" "course" NOT NULL,
	"gender" "gender" NOT NULL,
	"age_min" integer NOT NULL,
	"age_max" integer NOT NULL,
	"event_code" text NOT NULL,
	"time_ms" integer NOT NULL,
	"source_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "standards_unique_key" ON "standards" USING btree ("level","season","course","gender","age_min","age_max","event_code");--> statement-breakpoint
CREATE INDEX "standards_lookup_idx" ON "standards" USING btree ("season","course","gender","level");