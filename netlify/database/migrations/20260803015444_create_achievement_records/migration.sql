CREATE TABLE "achievements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"reference_number" text NOT NULL UNIQUE,
	"record_type" text NOT NULL,
	"teacher_name" text,
	"teacher_id" text,
	"position_or_field" text,
	"achievement_level" text NOT NULL,
	"activity_category" text NOT NULL,
	"activity_name" text NOT NULL,
	"achievement_result" text NOT NULL,
	"achievement_year" integer NOT NULL,
	"achievement_date" timestamp,
	"ppd" text,
	"coordinator_name" text,
	"notes" text,
	"status" text DEFAULT 'Menunggu fail' NOT NULL,
	"idempotency_key" text NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"action" text NOT NULL,
	"achievement_id" uuid,
	"role" text NOT NULL,
	"description" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"record_type" text NOT NULL,
	"achievement_year" integer NOT NULL,
	"current_value" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"event_type" text NOT NULL,
	"identifier" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uploaded_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"achievement_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"storage_key" text NOT NULL UNIQUE,
	"mime_type" text NOT NULL,
	"file_size" integer NOT NULL,
	"upload_token" text NOT NULL,
	"chunk_count" integer NOT NULL,
	"upload_complete" boolean DEFAULT false NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "achievements_year_idx" ON "achievements" ("achievement_year");--> statement-breakpoint
CREATE INDEX "achievements_type_idx" ON "achievements" ("record_type");--> statement-breakpoint
CREATE INDEX "achievements_level_idx" ON "achievements" ("achievement_level");--> statement-breakpoint
CREATE INDEX "achievements_created_idx" ON "achievements" ("created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_created_idx" ON "audit_logs" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "reference_counter_unique" ON "reference_counters" ("record_type","achievement_year");--> statement-breakpoint
CREATE INDEX "security_events_lookup_idx" ON "security_events" ("event_type","identifier","created_at");--> statement-breakpoint
CREATE INDEX "uploaded_files_achievement_idx" ON "uploaded_files" ("achievement_id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_achievement_id_achievements_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "uploaded_files" ADD CONSTRAINT "uploaded_files_achievement_id_achievements_id_fkey" FOREIGN KEY ("achievement_id") REFERENCES "achievements"("id") ON DELETE CASCADE;