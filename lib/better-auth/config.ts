import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink, organization } from "better-auth/plugins";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { env } from "@/lib/env";
import { log } from "@/lib/log";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
      organization: schema.organizations,
      member: schema.members,
      invitation: schema.invitations,
    },
  }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  // Rate limiting: disabled when DISABLE_RATE_LIMIT=1 (set in local .env for E2E
  // tests, which run multiple sign-ins in rapid succession and trip the default
  // 3-per-10s window). Never set this in production deployments.
  rateLimit: {
    enabled: process.env.DISABLE_RATE_LIMIT !== "1",
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 12,
  },
  socialProviders:
    env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET
      ? {
          google: {
            clientId: env.GOOGLE_OAUTH_CLIENT_ID,
            clientSecret: env.GOOGLE_OAUTH_CLIENT_SECRET,
          },
        }
      : {},
  plugins: [
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        // Phase 1: log to console for local dev. Plan 4 wires Resend.
        log.info({ email, url }, "Magic link email");
      },
    }),
    organization({
      allowUserToCreateOrganization: false,
    }),
  ],
  user: {
    additionalFields: {
      systemRole: {
        type: "string",
        required: true,
        defaultValue: "customer",
        input: false,
      },
    },
  },
  trustedOrigins: [env.APP_URL],
  logger: {
    log: (level, message, ...args) => {
      const meta = args[0] ?? {};
      if (level === "info") {
        log.info(meta, message);
      } else if (level === "warn") {
        log.warn(meta, message);
      } else {
        log.error(meta, message);
      }
    },
  },
});

export type Auth = typeof auth;
