import { describe, expect, it } from "vitest";
import { safeEqual, verifyPassphrase } from "./auth";

describe("safeEqual", () => {
  it("returns true for identical strings", () => {
    expect(safeEqual("s3cr3t", "s3cr3t")).toBe(true);
  });

  it("returns false for different strings", () => {
    expect(safeEqual("s3cr3t", "wrong")).toBe(false);
  });

  it("returns false for empty vs non-empty", () => {
    expect(safeEqual("", "x")).toBe(false);
  });

  it("returns true for equal empty strings", () => {
    expect(safeEqual("", "")).toBe(true);
  });
});

describe("verifyPassphrase", () => {
  it("returns ok for a correct passphrase", () => {
    const r = verifyPassphrase("correct-horse", "correct-horse", "k-correct");
    expect(r).toEqual({ ok: true });
  });

  it("returns invalid for a wrong passphrase", () => {
    const r = verifyPassphrase("nope", "correct-horse", "k-wrong1");
    expect(r).toEqual({ ok: false, error: "invalid" });
  });

  it("returns invalid when passphrase is missing", () => {
    const r = verifyPassphrase(undefined, "correct-horse", "k-missing");
    expect(r).toEqual({ ok: false, error: "invalid" });
  });

  it("returns invalid when secret is not configured", () => {
    const r = verifyPassphrase("anything", "", "k-nosecret");
    expect(r).toEqual({ ok: false, error: "invalid" });
  });

  it("locks the caller out after repeated failures", () => {
    const key = `k-lock-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      verifyPassphrase("bad", "correct-horse", key);
    }
    // The 6th attempt should be locked out even with the correct passphrase.
    const r = verifyPassphrase("correct-horse", "correct-horse", key);
    expect(r).toEqual({ ok: false, error: "locked" });
  });

  it("resets the failure count on a successful unlock", () => {
    const key = `k-reset-${Date.now()}`;
    verifyPassphrase("bad", "correct-horse", key);
    verifyPassphrase("bad", "correct-horse", key);
    // Successful unlock clears prior failures.
    expect(verifyPassphrase("correct-horse", "correct-horse", key)).toEqual({
      ok: true,
    });
    // A subsequent correct attempt still succeeds (not locked).
    expect(verifyPassphrase("correct-horse", "correct-horse", key)).toEqual({
      ok: true,
    });
  });
});
