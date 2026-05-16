import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import authRoute from "./auth.ts";
import backupRoute from "./backup.ts";
import diaryRoute from "./diary.ts";
import painRoute from "./pain.ts";
import {
  createTestDb,
  extractSessionCookie,
  seedUser,
  type TestContext,
  type TestEnv,
} from "../test-helpers.ts";

async function setup(): Promise<{
  ctx: TestContext;
  app: Hono<TestEnv>;
  cookie: string;
}> {
  const ctx = createTestDb();
  const app = new Hono<TestEnv>();
  app.use("*", async (c, next) => {
    c.set("db", ctx.db);
    c.set("rawDb", ctx.rawDb);
    await next();
  });
  app.route("/auth", authRoute);
  app.route("/backup", backupRoute);
  app.route("/diary", diaryRoute);
  app.route("/pain", painRoute);
  await seedUser(ctx.db, { email: "user@example.com", password: "Password123!" });
  const loginRes = await app.request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "user@example.com", password: "Password123!" }),
  });
  const cookie = extractSessionCookie(loginRes.headers.get("set-cookie"));
  return { ctx, app, cookie };
}

const diaryBody = {
  entryDate: "2026-05-16",
  entryTime: "08:30",
  moodLevel: 7,
  depressionLevel: 2,
  anxietyLevel: 3,
  positiveMoods: "happy",
  negativeMoods: "",
  generalMoods: "calm",
  description: "Test entry",
  gratitude: "grateful",
};

const painBody = {
  entryDate: "2026-05-16",
  entryTime: "09:00",
  painLevel: 5,
  fatigueLevel: 4,
  coffeeCount: 2,
  area: "back",
  symptoms: "ache",
  activities: "walking",
  medicines: "",
  habits: "",
  other: "",
  note: "Test pain",
};

describe("backup auth", () => {
  test("GET /json requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/backup/json");
    expect(res.status).toBe(401);
  });

  test("POST /json/import requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/backup/json/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  test("GET /xlsx requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/backup/xlsx");
    expect(res.status).toBe(401);
  });

  test("POST /xlsx/import requires authentication", async () => {
    const { app } = await setup();
    const res = await app.request("/backup/xlsx/import", { method: "POST" });
    expect(res.status).toBe(401);
  });
});

describe("GET /backup/json", () => {
  test("returns empty backup envelope when no data", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/backup/json", { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.diary.rows).toEqual([]);
    expect(body.data.pain.rows).toEqual([]);
    expect(body.data.prefs).toBeDefined();
  });

  test("round-trips diary + pain rows back into export shape", async () => {
    const { app, cookie } = await setup();
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(diaryBody),
    });
    await app.request("/pain", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(painBody),
    });
    const res = await app.request("/backup/json", { headers: { cookie } });
    const body = await res.json();
    expect(body.data.diary.rows).toHaveLength(1);
    expect(body.data.pain.rows).toHaveLength(1);
    expect(body.data.diary.rows[0].date).toBe("2026-05-16");
    expect(body.data.pain.rows[0].date).toBe("2026-05-16");
  });
});

describe("POST /backup/json/import", () => {
  test("rejects malformed JSON with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/backup/json/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: "{ this is not json",
    });
    expect(res.status).toBe(400);
  });

  test("imports valid JSON payload (empty)", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/backup/json/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(200);
  });

  test("replaces existing diary/pain rows on import", async () => {
    const { app, cookie } = await setup();
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(diaryBody),
    });
    const res = await app.request("/backup/json/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ diary: { rows: [] }, pain: { rows: [] } }),
    });
    expect(res.status).toBe(200);
    const list = await (await app.request("/diary", { headers: { cookie } })).json();
    expect(list.data).toEqual([]);
  });
});

describe("POST /backup/xlsx/import", () => {
  test("rejects multipart without 'file' field with 400", async () => {
    const { app, cookie } = await setup();
    const form = new FormData();
    form.append("nope", "x");
    const res = await app.request("/backup/xlsx/import", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("MISSING_FILE");
  });

  test("rejects XLSX upload larger than 10 MB with 413 (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const oversized = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([oversized], "big.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const form = new FormData();
    form.append("file", file);
    const res = await app.request("/backup/xlsx/import", {
      method: "POST",
      headers: { cookie },
      body: form,
    });
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  test("rejects base64 payload larger than 10 MB with 413 (PR #82 regression)", async () => {
    const { app, cookie } = await setup();
    const oversized = Buffer.alloc(10 * 1024 * 1024 + 1).toString("base64");
    const res = await app.request("/backup/xlsx/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ base64: oversized }),
    });
    expect(res.status).toBe(413);
  });

  test("rejects JSON body without base64 with 400", async () => {
    const { app, cookie } = await setup();
    const res = await app.request("/backup/xlsx/import", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });
});

describe("backup data isolation (IDOR)", () => {
  test("user A export does not contain user B data", async () => {
    const { ctx, app, cookie } = await setup();
    await app.request("/diary", {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify(diaryBody),
    });
    await seedUser(ctx.db, { email: "other@example.com", password: "Password123!" });
    const otherLogin = await app.request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "other@example.com", password: "Password123!" }),
    });
    const otherCookie = extractSessionCookie(otherLogin.headers.get("set-cookie"));
    const res = await (
      await app.request("/backup/json", { headers: { cookie: otherCookie } })
    ).json();
    expect(res.data.diary.rows).toEqual([]);
    expect(res.data.pain.rows).toEqual([]);
  });
});
