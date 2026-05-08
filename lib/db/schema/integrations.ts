import { pgTable, uuid, text, timestamp, jsonb, customType, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { organizations } from "./better-auth";

const bytea = customType<{ data: Buffer; default: false }>({
  dataType() {
    return "bytea";
  },
});

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().default(sql`uuidv7()`),
    orgId: text("org_id").notNull().references(() => organizations.id),
    provider: text("provider").notNull(),
    accessTokenEncrypted: bytea("access_token_encrypted"),
    refreshTokenEncrypted: bytea("refresh_token_encrypted"),
    connectedAt: timestamp("connected_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  },
  (t) => ({
    uniqueProvider: uniqueIndex("integrations_org_provider_unique").on(t.orgId, t.provider),
  }),
);
