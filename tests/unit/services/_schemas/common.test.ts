import { describe, expect, it } from "vitest";
import { idSchema, dateSchema, positiveIntSchema, nonEmptyStringSchema } from "@/lib/services/_schemas/common";

describe("idSchema", () => {
  it("accepts a UUID v7", () => {
    const r = idSchema.safeParse("0190b7f3-c3a8-7000-8000-000000000001");
    expect(r.success).toBe(true);
  });
  it("rejects non-uuid strings", () => {
    const r = idSchema.safeParse("not-a-uuid");
    expect(r.success).toBe(false);
  });
  it("accepts Better Auth string IDs (non-uuid)", () => {
    const r = idSchema.safeParse("usr_abc123");
    expect(r.success).toBe(true);
  });
});

describe("dateSchema", () => {
  it("accepts ISO date strings", () => {
    expect(dateSchema.safeParse("2026-05-08").success).toBe(true);
  });
  it("rejects malformed dates", () => {
    expect(dateSchema.safeParse("not-a-date").success).toBe(false);
    expect(dateSchema.safeParse("2026-13-01").success).toBe(false);
  });
});

describe("positiveIntSchema", () => {
  it("accepts positive integers", () => {
    expect(positiveIntSchema.safeParse(1).success).toBe(true);
    expect(positiveIntSchema.safeParse(60).success).toBe(true);
  });
  it("rejects zero, negatives, and floats", () => {
    expect(positiveIntSchema.safeParse(0).success).toBe(false);
    expect(positiveIntSchema.safeParse(-1).success).toBe(false);
    expect(positiveIntSchema.safeParse(1.5).success).toBe(false);
  });
});

describe("nonEmptyStringSchema", () => {
  it("rejects empty + whitespace-only strings", () => {
    expect(nonEmptyStringSchema.safeParse("").success).toBe(false);
    expect(nonEmptyStringSchema.safeParse("   ").success).toBe(false);
  });
  it("accepts non-empty strings, trimmed", () => {
    const r = nonEmptyStringSchema.safeParse("  hello  ");
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toBe("hello");
  });
});
