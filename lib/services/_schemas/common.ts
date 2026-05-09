import { z } from "zod";

// Accepts UUIDs (our domain IDs) AND Better Auth string IDs.
// UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
// Better Auth format: either a prefixed ID like "usr_abc123" OR a raw base62 string
// produced by generateId() (32 alphanumeric chars, no separators).
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Prefixed form e.g. "usr_abc123" or test IDs like "usr_1715301244-3".
const betterAuthPrefixedIdPattern = /^[a-z]+_[a-zA-Z0-9-]+$/;
// Raw form: generateId() returns 32 purely alphanumeric chars (no separators).
// Minimum length 16 to exclude short human-readable strings like "not-a-uuid".
const betterAuthRawIdPattern = /^[a-zA-Z0-9]{16,}$/;

export const idSchema = z.string().refine(
  (s) => uuidPattern.test(s) || betterAuthPrefixedIdPattern.test(s) || betterAuthRawIdPattern.test(s),
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
