-- Add a generated tsvector column to each searchable entity, populated from
-- the entity's primary text columns. Postgres maintains these automatically.
ALTER TABLE "tasks"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;

ALTER TABLE "daily_updates"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce("body", ''))) STORED;

ALTER TABLE "work_requests"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("title", '') || ' ' || coalesce("description", ''))
  ) STORED;

-- GIN indexes for fast `@@` matching.
CREATE INDEX "tasks_search_vector_idx" ON "tasks" USING gin ("search_vector");
CREATE INDEX "daily_updates_search_vector_idx" ON "daily_updates" USING gin ("search_vector");
CREATE INDEX "work_requests_search_vector_idx" ON "work_requests" USING gin ("search_vector");
