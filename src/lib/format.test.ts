import { describe, expect, it } from "vitest";
import {
  centsToPesosInput,
  formatArs,
  parseHourlyRateInput,
  parsePesosToCents,
} from "./format";

describe("formatArs", () => {
  it("formats integer cents with es-AR conventions (AR$ 1.234,56)", () => {
    expect(formatArs(123456)).toBe("AR$ 1.234,56");
  });

  it("formats zero cents", () => {
    expect(formatArs(0)).toBe("AR$ 0,00");
  });

  it("formats amounts below one peso with two decimals", () => {
    expect(formatArs(99)).toBe("AR$ 0,99");
  });

  it("formats thousands separators for large amounts", () => {
    expect(formatArs(10000000)).toBe("AR$ 100.000,00");
  });

  it("falls back to zero for non-finite input", () => {
    expect(formatArs(Number.NaN)).toBe("AR$ 0,00");
  });
});

describe("parsePesosToCents", () => {
  it("parses a plain integer pesos string", () => {
    expect(parsePesosToCents("1234")).toBe(123400);
  });

  it("parses dot-decimal pesos", () => {
    expect(parsePesosToCents("1234.56")).toBe(123456);
  });

  it("parses es-AR comma-decimal pesos", () => {
    expect(parsePesosToCents("1234,56")).toBe(123456);
  });

  it("parses es-AR thousands with comma decimals", () => {
    expect(parsePesosToCents("1.234,56")).toBe(123456);
  });

  it("parses thousands separators only", () => {
    expect(parsePesosToCents("100.000")).toBe(10000000);
  });

  it("parses decimal cents with a single leading digit", () => {
    expect(parsePesosToCents("0,99")).toBe(99);
  });

  it("trims whitespace", () => {
    expect(parsePesosToCents("  500  ")).toBe(50000);
  });

  it("returns null for empty input", () => {
    expect(parsePesosToCents("")).toBeNull();
    expect(parsePesosToCents("   ")).toBeNull();
  });

  it("returns null for invalid input", () => {
    expect(parsePesosToCents("abc")).toBeNull();
    expect(parsePesosToCents("-5")).toBeNull();
    expect(parsePesosToCents("1,2,3")).toBeNull();
  });

  it("rounds a single decimal to cents", () => {
    expect(parsePesosToCents("12.5")).toBe(1250);
  });
});

describe("centsToPesosInput", () => {
  it("formats cents to a plain pesos string", () => {
    expect(centsToPesosInput(123456)).toBe("1234.56");
  });

  it("returns empty for null", () => {
    expect(centsToPesosInput(null)).toBe("");
  });
});

describe("parseHourlyRateInput", () => {
  it("returns null cents for an empty or blank value (pack mode)", () => {
    expect(parseHourlyRateInput("")).toEqual({ ok: true, cents: null });
    expect(parseHourlyRateInput("   ")).toEqual({ ok: true, cents: null });
  });

  it("parses a valid pesos amount into cents", () => {
    expect(parseHourlyRateInput("1.500,50")).toEqual({ ok: true, cents: 150050 });
    expect(parseHourlyRateInput("0")).toEqual({ ok: true, cents: 0 });
  });

  it("rejects negative or malformed values", () => {
    expect(parseHourlyRateInput("-5")).toEqual({ ok: false });
    expect(parseHourlyRateInput("abc")).toEqual({ ok: false });
  });
});
