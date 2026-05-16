import { describe, expect, test } from "vitest";
import {
  average,
  calcDeltaPercent,
  csvToList,
  extractWellbeingSelection,
  formatDelta,
  formatDocumentTitle,
  formatNumber,
  getQuickRangeBounds,
  inDateRange,
  isSameMonth,
  listToCsv,
  mergeOptions,
  normalizeQuickRange,
  previousRange,
} from "./core";

describe("formatDocumentTitle", () => {
  test("appends Health when section provided", () => {
    expect(formatDocumentTitle("Diary")).toBe("Diary - Health");
  });

  test("returns Health alone when no section", () => {
    expect(formatDocumentTitle()).toBe("Health");
  });
});

describe("inDateRange", () => {
  test("returns true within bounds", () => {
    expect(inDateRange("2026-05-15", "2026-05-01", "2026-05-31")).toBe(true);
  });

  test("returns false below from", () => {
    expect(inDateRange("2026-04-30", "2026-05-01", "2026-05-31")).toBe(false);
  });

  test("returns false above to", () => {
    expect(inDateRange("2026-06-01", "2026-05-01", "2026-05-31")).toBe(false);
  });

  test("returns false on empty value", () => {
    expect(inDateRange("", "2026-05-01", "2026-05-31")).toBe(false);
  });
});

describe("average + formatNumber", () => {
  test("average ignores nullish + NaN", () => {
    expect(average([1, 2, null, undefined, 3])).toBeCloseTo(2);
  });

  test("average returns null on empty input", () => {
    expect(average([null, undefined])).toBeNull();
  });

  test("formatNumber returns dash for null", () => {
    expect(formatNumber(null)).toBe("–");
  });

  test("formatNumber respects digits option", () => {
    expect(formatNumber(1.234, 1)).toBe("1.2");
  });
});

describe("calcDeltaPercent + formatDelta", () => {
  test("returns null when previous is zero", () => {
    expect(calcDeltaPercent(5, 0)).toBeNull();
  });

  test("returns percent increase", () => {
    expect(calcDeltaPercent(15, 10)).toBeCloseTo(50);
  });

  test("formatDelta returns positive class on increase", () => {
    const out = formatDelta(10);
    expect(out?.className).toBe("positive");
    expect(out?.text).toBe("+10%");
  });

  test("formatDelta inverts on invert=true", () => {
    const out = formatDelta(10, true);
    expect(out?.className).toBe("negative");
  });
});

describe("csvToList + listToCsv", () => {
  test("csvToList trims, drops empty, dedupes case-insensitive", () => {
    expect(csvToList("a, A, b, , c")).toEqual(["a", "b", "c"]);
  });

  test("csvToList returns [] for falsy input", () => {
    expect(csvToList(undefined)).toEqual([]);
    expect(csvToList("")).toEqual([]);
  });

  test("listToCsv joins with ', '", () => {
    expect(listToCsv(["a", "b"])).toBe("a, b");
  });
});

describe("mergeOptions", () => {
  test("dedupes across multiple lists, preserves order", () => {
    expect(mergeOptions(["a", "b"], ["B", "c"], undefined)).toEqual(["a", "b", "c"]);
  });

  test("trims and ignores empty strings", () => {
    expect(mergeOptions([" a ", ""], ["b   "])).toEqual(["a", "b"]);
  });
});

describe("normalizeQuickRange + getQuickRangeBounds", () => {
  test("normalizeQuickRange returns valid value as-is", () => {
    expect(normalizeQuickRange("30")).toBe("30");
  });

  test("normalizeQuickRange falls back to 'all'", () => {
    expect(normalizeQuickRange("bogus")).toBe("all");
  });

  test("getQuickRangeBounds returns empty for 'all'", () => {
    expect(getQuickRangeBounds("all")).toEqual({ from: "", to: "" });
  });

  test("getQuickRangeBounds returns dates for numeric range", () => {
    const bounds = getQuickRangeBounds("7");
    expect(bounds.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(bounds.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("isSameMonth", () => {
  test("returns true for matching month/year", () => {
    expect(isSameMonth("2026-05-16", new Date(2026, 4, 1))).toBe(true);
  });

  test("returns false for different month", () => {
    expect(isSameMonth("2026-05-16", new Date(2026, 5, 1))).toBe(false);
  });
});

describe("previousRange", () => {
  test("computes a prior range (from < to, both YYYY-MM-DD)", () => {
    const out = previousRange("2026-05-08", "2026-05-15");
    expect(out).not.toBeNull();
    expect(out!.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out!.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out!.from < out!.to).toBe(true);
  });

  test("returns null when from is empty", () => {
    expect(previousRange("", "2026-05-15")).toBeNull();
  });
});

describe("extractWellbeingSelection", () => {
  test("returns defaults when no selection", () => {
    const out = extractWellbeingSelection(undefined);
    expect(out.pain).toBe(true);
    expect(out.mood).toBe(true);
  });

  test("overrides booleans from the graph-wellbeing node", () => {
    const out = extractWellbeingSelection({
      "graph-wellbeing": { pain: false, anxiety: false },
    });
    expect(out.pain).toBe(false);
    expect(out.anxiety).toBe(false);
    expect(out.mood).toBe(true);
  });
});
