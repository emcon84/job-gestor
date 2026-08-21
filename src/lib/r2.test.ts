import { describe, expect, it } from "vitest";
import { sanitizeFilename } from "./r2";

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
