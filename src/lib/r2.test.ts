import { afterEach, describe, expect, it } from "vitest";
import { getUploadUrl, r2PublicBaseUrlOrNull, sanitizeFilename } from "./r2";

describe("sanitizeFilename", () => {
  it("keeps safe filename characters", () => {
    expect(sanitizeFilename("photo.jpg")).toBe("photo.jpg");
    expect(sanitizeFilename("my-photo_01.webp")).toBe("my-photo_01.webp");
  });

  it("replaces unsafe characters with underscores", () => {
    expect(sanitizeFilename("foto de hoy!.png")).toBe("foto_de_hoy_.png");
    expect(sanitizeFilename("a b/c\\d*e?.gif")).toBe("a_b_c_d_e_.gif");
    expect(sanitizeFilename("")).toBe("");
  });
});

describe("r2PublicBaseUrlOrNull", () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("returns null when R2_PUBLIC_BASE_URL is missing", () => {
    delete process.env.R2_PUBLIC_BASE_URL;
    expect(r2PublicBaseUrlOrNull()).toBeNull();
  });

  it("returns null when it looks like the S3 endpoint", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://acct.r2.cloudflarestorage.com";
    expect(r2PublicBaseUrlOrNull()).toBeNull();
  });

  it("returns the normalized public r2.dev URL otherwise", () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-abc.r2.dev/";
    expect(r2PublicBaseUrlOrNull()).toBe("https://pub-abc.r2.dev");
  });
});

describe("getUploadUrl dev-fallback hardening", () => {
  const OLD_ENV = process.env;

  afterEach(() => {
    process.env = { ...OLD_ENV };
  });

  it("returns dev-fallback when R2 is not configured", async () => {
    delete process.env.R2_ACCOUNT_ID;
    delete process.env.R2_ACCESS_KEY_ID;
    delete process.env.R2_SECRET_ACCESS_KEY;
    delete process.env.R2_BUCKET;
    const r = await getUploadUrl({ filename: "a.png", contentType: "image/png" });
    expect(r.uploadUrl).toBe("");
  });

  it("returns dev-fallback when R2 is configured but R2_PUBLIC_BASE_URL is missing", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET = "bucket";
    delete process.env.R2_PUBLIC_BASE_URL;
    const r = await getUploadUrl({ filename: "a.png", contentType: "image/png" });
    expect(r.uploadUrl).toBe("");
  });

  it("returns dev-fallback when R2_PUBLIC_BASE_URL is the S3 endpoint", async () => {
    process.env.R2_ACCOUNT_ID = "acct";
    process.env.R2_ACCESS_KEY_ID = "key";
    process.env.R2_SECRET_ACCESS_KEY = "secret";
    process.env.R2_BUCKET = "bucket";
    process.env.R2_PUBLIC_BASE_URL = "https://acct.r2.cloudflarestorage.com";
    const r = await getUploadUrl({ filename: "a.png", contentType: "image/png" });
    expect(r.uploadUrl).toBe("");
  });
});
