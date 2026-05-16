CREATE TABLE "comment_reactions" (
  "comment_id" uuid NOT NULL,
  "user_id" text NOT NULL,
  "emoji" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "comment_reactions_pk" PRIMARY KEY("comment_id","user_id","emoji"),
  CONSTRAINT "comment_reactions_comment_id_fk" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE,
  CONSTRAINT "comment_reactions_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);--> statement-breakpoint
CREATE INDEX "comment_reactions_comment_idx" ON "comment_reactions"("comment_id");
