/**
 * ARS (Argentine peso) money handling.
 *
 * Amounts are stored as integer cents. Input arrives as a pesos string from the
 * owner (e.g. "1.234,56" or "1234.56"); we parse it into cents and format back
 * to a human-friendly ARS string using es-AR conventions.
 */

// Format the numeric portion with es-AR grouping ('.') and decimals (','),
// but emit a fixed "AR$ " prefix ourselves. The es-AR ICU currency symbol for
// ARS varies across runtimes ("$" vs "AR$"), so we pin the required prefix to
// guarantee consistent output ("AR$ 1.234,56") in every environment.
const ARS_NUMBER = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const ARS_PREFIX = "AR$ ";

/**
 * Formats integer cents into an es-AR ARS currency string.
 * Example: formatArs(123456) -> "AR$ 1.234,56"
 */
export function formatArs(cents: number): string {
  if (!Number.isFinite(cents)) {
    return ARS_PREFIX + ARS_NUMBER.format(0);
  }
  return ARS_PREFIX + ARS_NUMBER.format(cents / 100);
}

/**
 * Parses a pesos string (user input) into integer cents.
 * Accepts "1000", "1.000,50", "1,000.50", "1234.56", "0,99".
 * Returns null when the input is not a valid non-negative amount.
 */
export function parsePesosToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s/g, "");
  if (!trimmed) {
    return null;
  }

  // The number may use either "." or "," (or both) as separators. The LAST
  // separator that appears with at most two trailing digits is the decimal
  // point; any other separators are thousands-grouping separators.
  const lastSepIndex = Math.max(
    trimmed.lastIndexOf("."),
    trimmed.lastIndexOf(","),
  );
  const lastSepChar = trimmed[lastSepIndex];
  let integerPart = trimmed;
  let fractionPart = "";

  if (lastSepIndex !== -1 && lastSepChar) {
    const after = trimmed.slice(lastSepIndex + 1);
    if (after.length >= 1 && after.length <= 2) {
      // It's a decimal separator.
      integerPart = trimmed.slice(0, lastSepIndex);
      fractionPart = after;
    }
  }

  // Remove grouping separators from the integer part and validate the grouping.
  const groupingChars = new Set([".", ","]);
  const cleaned: string[] = [];
  for (const ch of integerPart) {
    if (groupingChars.has(ch)) {
      continue;
    }
    if (!/\d/.test(ch)) {
      return null; // unexpected character
    }
    cleaned.push(ch);
  }
  const digits = cleaned.join("");
  if (digits.length === 0) {
    return null;
  }

  // Validate that integerPart's grouping is well-formed: if it contained
  // separators, every group after the first must be exactly 3 digits.
  if (integerPart.includes(".") || integerPart.includes(",")) {
    const groups = integerPart.split(/[.,]/);
    for (let i = 1; i < groups.length; i++) {
      if (!/^\d{3}$/.test(groups[i])) {
        return null; // malformed thousands grouping (e.g. "1,2,3")
      }
    }
    if (groups[0].length === 0 || !/^\d{1,3}$/.test(groups[0])) {
      return null;
    }
  }

  const fracDigits = fractionPart.padEnd(2, "0").slice(0, 2);
  const cents = BigInt(digits) * BigInt(100) + BigInt(fracDigits || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) {
    return null; // beyond safe integer
  }
  return Number(cents);
}

/**
 * Formats integer cents into a plain peso string for an input field
 * (no currency symbol, dot decimal separator, no thousands grouping),
 * e.g. 123456 -> "1234.56". Returns "" for null.
 */
export function centsToPesosInput(cents: number | null): string {
  if (cents === null || cents === undefined) {
    return "";
  }
  return (cents / 100).toFixed(2);
}

const ES_AR_DATE = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Formats a Date using es-AR conventions (dd/mm/aaaa).
 * Example: 2026-08-21 -> "21/08/2026"
 */
export function formatDateEs(date: Date): string {
  return ES_AR_DATE.format(date);
}

/**
 * Formats a Date as a plain "YYYY-MM-DD" string using local time, for use as
 * the value of an `<input type="date">`. Returns "" for null.
 */
export function formatDateInput(date: Date | null): string {
  if (date === null || date === undefined) {
    return "";
  }
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
