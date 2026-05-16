import { describe, expect, test, vi, afterEach } from "vitest";
import { apiFetch, toLocalDateTimeValue, splitDateTime, getErrorMessage } from "./lib";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("apiFetch", () => {
  test("returns parsed payload on 200", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { ok: true } }), { status: 200 })
      )
    );
    const out = await apiFetch("/api/x", { method: "GET" }, (raw) => raw as { data: { ok: boolean } });
    expect(out.data.ok).toBe(true);
  });

  test("throws with body error.message on non-OK", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Bad thing" } }), { status: 400 })
      )
    );
    await expect(
      apiFetch("/api/x", { method: "GET" }, (raw) => raw)
    ).rejects.toThrow("Bad thing");
  });

  test("throws with HTTP status when no message in body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce(new Response("", { status: 500 }))
    );
    await expect(
      apiFetch("/api/x", { method: "GET" }, (raw) => raw)
    ).rejects.toThrow(/HTTP 500/);
  });

  test("sends Content-Type: application/json when body present", async () => {
    const fetchSpy = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ data: {} }), { status: 200 })
    );
    vi.stubGlobal("fetch", fetchSpy);
    await apiFetch("/api/x", { method: "POST", body: "{}" }, (raw) => raw);
    const [, init] = fetchSpy.mock.calls[0]!;
    const headers = init.headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
  });
});

describe("toLocalDateTimeValue + splitDateTime", () => {
  test("toLocalDateTimeValue joins date and time", () => {
    expect(toLocalDateTimeValue("2026-05-16", "08:30")).toBe("2026-05-16T08:30");
  });

  test("toLocalDateTimeValue returns now-ish ISO when missing args", () => {
    const out = toLocalDateTimeValue();
    expect(out).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  test("splitDateTime returns date + time slices", () => {
    const out = splitDateTime("2026-05-16T08:30");
    expect(out.entryDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(out.entryTime).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("getErrorMessage", () => {
  test("returns message from Error instance", () => {
    expect(getErrorMessage(new Error("oh no"))).toBe("oh no");
  });

  test("stringifies non-Error", () => {
    expect(getErrorMessage("plain string")).toBe("plain string");
    expect(getErrorMessage(42)).toBe("42");
  });
});
