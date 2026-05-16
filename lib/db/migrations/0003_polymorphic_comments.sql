-- Polymorphic comments: replace daily_update_id + org_id with parent_type + parent_id
-- Pre-prod data loss accepted: comments table is cleared before schema change
DELETE FROM "comments";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_daily_update_id_daily_updates_id_fk";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_org_id_organizations_id_fk";--> statement-breakpoint
ALTER TABLE "comments" DROP CONSTRAINT IF EXISTS "comments_user_id_users_id_fk";--> statement-breakpoint
DROP INDEX IF EXISTS "comments_update_idx";--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "org_id";--> statement-breakpoint
ALTER TABLE "comments" DROP COLUMN "daily_update_id";--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "parent_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_parent_idx" ON "comments" USING btree ("parent_type","parent_id","created_at" desc);
