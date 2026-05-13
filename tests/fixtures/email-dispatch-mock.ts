import { vi } from "vitest";

// Mock the email dispatch module so that:
//  1. .tsx React-Email templates are never imported (no JSX parse issues)
//  2. Unit tests for emit() and work-request services don't make real HTTP calls
// Tests that specifically want to assert on email dispatch behaviour should
// override this mock locally with vi.mocked(...).mockResolvedValueOnce(...)

vi.mock("@/lib/email/dispatch", () => ({
  sendNotificationEmail: vi.fn().mockResolvedValue({ ok: true, messageId: "test-skipped" }),
}));
