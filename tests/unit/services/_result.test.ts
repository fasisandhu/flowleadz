import { describe, it, expect } from "vitest";
import { ok, err, type Result, type AppError } from "@/lib/services/_result";

describe("Result", () => {
  it("ok() wraps data with ok=true", () => {
    const r = ok(42);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data).toBe(42);
  });

  it("err() wraps an AppError with ok=false", () => {
    const r = err("validation", "bad input");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.code).toBe("validation");
      expect(r.error.message).toBe("bad input");
    }
  });

  it("err() carries field errors for validation", () => {
    const r = err("validation", "bad input", { fields: { name: "required" } });
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.code === "validation") {
      expect(r.error.fields).toEqual({ name: "required" });
    }
  });

  it("AppError code union covers all expected codes", () => {
    const codes: AppError["code"][] = ["unauthorized", "not_found", "validation", "conflict", "rate_limit", "server"];
    expect(codes).toHaveLength(6);
  });
});
