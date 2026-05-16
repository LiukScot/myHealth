import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { z } from "zod";
import {
  parseJson,
  buildSessionCookie,
  clearSessionCookie,
  readCookie,
  toUniqueValues,
  toCsvValue,
  mergeOptions,
  rowPainField,
  emptyPainTags,
  parseLegacyPainTags,
} from "./helpers.ts";
import { env } from "./env.ts";

describe("readCookie", () => {
  test("returns null when no Cookie header", () => {
    const req = new Request("http://x/");
    expect(readCookie(req, "any")).toBeNull();
  });

  test("returns null when name missing from cookie string", () => {
    const req = new Request("http://x/", { headers: { cookie: "foo=bar" } });
    expect(readCookie(req, "missing")).toBeNull();
  });

  test("returns value when name present", () => {
    const req = new Request("http://x/", { headers: { cookie: "foo=bar; baz=qux" } });
    expect(readCookie(req, "baz")).toBe("qux");
  });
});

describe("buildSessionCookie", () => {
  test("includes name, sid value, HttpOnly, Path=/, SameSite=Lax, Max-Age", () => {
    const out = buildSessionCookie("abc123");
    expect(out).toContain(`${env.SESSION_COOKIE_NAME}=abc123`);
    expect(out).toContain("HttpOnly");
    expect(out).toContain("Path=/");
    expect(out.toLowerCase()).toContain("samesite=lax");
    expect(out).toContain("Max-Age=");
  });
});

describe("clearSessionCookie", () => {
  test("emits Max-Age=0 to clear cookie", () => {
    const out = clearSessionCookie();
    expect(out).toContain("Max-Age=0");
    expect(out).toContain(`${env.SESSION_COOKIE_NAME}=`);
  });
});

describe("parseJson", () => {
  test("returns parsed payload on valid body", async () => {
    const schema = z.object({ x: z.number() });
    const app = new Hono();
    app.post("/", async (c) => {
      const v = await parseJson(c, schema);
      return c.json({ data: v });
    });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: 1 }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({ x: 1 });
  });

  test("throws HTTPException 400 on invalid JSON", async () => {
    const schema = z.object({ x: z.number() });
    const app = new Hono();
    app.post("/", async (c) => {
      const v = await parseJson(c, schema);
      return c.json({ data: v });
    });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });

  test("throws HTTPException 400 on schema mismatch", async () => {
    const schema = z.object({ x: z.number() });
    const app = new Hono();
    app.post("/", async (c) => {
      const v = await parseJson(c, schema);
      return c.json({ data: v });
    });
    const res = await app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x: "not-a-number" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("toUniqueValues + toCsvValue", () => {
  test("splits comma-separated string while preserving numeric pairs", () => {
    expect(toUniqueValues("a, b, c")).toEqual(["a", "b", "c"]);
  });

  test("drops duplicates case-insensitively", () => {
    expect(toUniqueValues(["a", "A", "b"])).toEqual(["a", "b"]);
  });

  test("returns [] for non-string non-array input", () => {
    expect(toUniqueValues(null)).toEqual([]);
    expect(toUniqueValues(undefined)).toEqual([]);
    expect(toUniqueValues(42)).toEqual([]);
  });

  test("toCsvValue joins with ', '", () => {
    expect(toCsvValue(["a", "b"])).toBe("a, b");
  });
});

describe("mergeOptions", () => {
  test("appends new values case-insensitively, preserving order", () => {
    expect(mergeOptions(["a", "b"], ["B", "c"])).toEqual(["a", "b", "c"]);
  });

  test("trims and drops empty strings", () => {
    expect(mergeOptions([], ["  hello  ", "   "])).toEqual(["hello"]);
  });
});

describe("rowPainField + parseLegacyPainTags + emptyPainTags", () => {
  test("emptyPainTags returns all fields as []", () => {
    const out = emptyPainTags();
    expect(out.area).toEqual([]);
    expect(out.symptoms).toEqual([]);
  });

  test("rowPainField prefers row[field] over legacy tags", () => {
    expect(rowPainField({ area: "back, neck" }, "area")).toBe("back, neck");
  });

  test("rowPainField falls back to legacy tags object", () => {
    expect(rowPainField({ tags: { area: ["back"] } }, "area")).toBe("back");
  });

  test("parseLegacyPainTags ignores non-object input", () => {
    expect(parseLegacyPainTags(null)).toEqual(emptyPainTags());
  });
});
