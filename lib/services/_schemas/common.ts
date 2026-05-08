import { z } from "zod";

// Accepts UUIDs (our domain IDs) AND Better Auth string IDs (e.g., "usr_abc123").
// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
// Better Auth format: prefix_alphanumeric (e.g. usr_abc123, team_xyz)
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Allow hyphens in the suffix so test-factory IDs like "usr_1715301244-3" are accepted.
const betterAuthIdPattern = /^[a-z]+_[a-zA-Z0-9-]+$/;

export const idSchema = z.string().refine(
  (s) => uuidPattern.test(s) || betterAuthIdPattern.test(s),
  "Must be a UUID or a valid ID (e.g. usr_abc123)",
);

// ISO date format, e.g. "2026-05-08". Postgres `date` type expects this.
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (expected YYYY-MM-DD)")
  .refine((s) => !Number.isNaN(Date.parse(s)), "Invalid calendar date");

export const positiveIntSchema = z.number().int().positive();

export const nonEmptyStringSchema = z
  .string()
  .trim()
  .min(1, "Required");
