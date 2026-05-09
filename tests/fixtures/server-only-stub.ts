// Stub for the `server-only` package in Vitest.
// The real package throws when imported outside a Next.js server bundle;
// this stub is a no-op so service files that carry the guard can be
// imported in unit tests without the Next.js bundler being present.
export {};
