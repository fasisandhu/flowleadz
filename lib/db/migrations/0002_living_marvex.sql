ALTER TYPE "public"."attachment_parent_type" ADD VALUE 'user_avatar';--> statement-breakpoint
ALTER TABLE "attachments" ALTER COLUMN "parent_id" SET DATA TYPE text;