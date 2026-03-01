CREATE TABLE "meets" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "level" "standard_level" NOT NULL,
  "season" integer NOT NULL,
  "course" "course" NOT NULL,
  "name" text NOT NULL,
  "metadata_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "meets_unique_key" ON "meets" USING btree ("level","season","course","name");
--> statement-breakpoint
CREATE INDEX "meets_lookup_idx" ON "meets" USING btree ("season","course","level");
--> statement-breakpoint
ALTER TABLE "standards" ADD COLUMN "meet_id" uuid;
--> statement-breakpoint
INSERT INTO "meets" ("level", "season", "course", "name", "metadata_json")
SELECT DISTINCT
  s."level",
  s."season",
  s."course",
  '既存取込データ',
  jsonb_build_object('migrated', true)
FROM "standards" s
ON CONFLICT ("level", "season", "course", "name") DO NOTHING;
--> statement-breakpoint
UPDATE "standards" s
SET "meet_id" = m."id"
FROM "meets" m
WHERE
  m."level" = s."level"
  AND m."season" = s."season"
  AND m."course" = s."course"
  AND m."name" = '既存取込データ';
--> statement-breakpoint
ALTER TABLE "standards" ALTER COLUMN "meet_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "standards" ADD CONSTRAINT "standards_meet_id_meets_id_fk"
FOREIGN KEY ("meet_id") REFERENCES "public"."meets"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
DROP INDEX "standards_lookup_idx";
--> statement-breakpoint
DROP INDEX "standards_unique_key";
--> statement-breakpoint
CREATE UNIQUE INDEX "standards_unique_key" ON "standards" USING btree ("meet_id","gender","age_min","age_max","event_code");
--> statement-breakpoint
CREATE INDEX "standards_meet_gender_idx" ON "standards" USING btree ("meet_id","gender");
--> statement-breakpoint
ALTER TABLE "standards" DROP COLUMN "level";
--> statement-breakpoint
ALTER TABLE "standards" DROP COLUMN "season";
--> statement-breakpoint
ALTER TABLE "standards" DROP COLUMN "course";
