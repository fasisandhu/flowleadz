import "server-only";
import { Client } from "pg";

/**
 * Create a dedicated, non-pooled pg.Client suitable for LISTEN.
 *
 * Caller MUST end() the client when the consumer disconnects.
 */
export function createListenClient(): Client {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  return new Client({ connectionString });
}
