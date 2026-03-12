import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Database } from "bun:sqlite";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function text(out: Uint8Array): string {
  return Buffer.from(out).toString("utf8");
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "myhealth-migration-fixture-"));
const sourcePath = path.join(workDir, "legacy.sqlite");
const targetPath = path.join(workDir, "myhealth.sqlite");
const reportPath = path.join(workDir, "report.json");

const source = new Database(sourcePath);
source.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT,
    updated_at TEXT
  );
  CREATE TABLE files (
    name TEXT PRIMARY KEY,
    data TEXT NOT NULL
  );
  CREATE TABLE user_settings (
    user_id INTEGER NOT NULL,
    gemini_key TEXT
  );
`);

source
  .query(`INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
  .run(1, "primary@example.com", "legacy-hash-1", "Primary", "2026-01-01 00:00:00", "2026-01-01 00:00:00");
source
  .query(`INSERT INTO users (id, email, password_hash, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
  .run(2, "secondary@example.com", "legacy-hash-2", "Secondary", "2026-01-01 00:00:00", "2026-01-01 00:00:00");

const diaryPayload = {
  rows: [
    {
      date: "2026-01-10",
      hour: "09:30",
      "mood level": 7,
      depression: 2,
      anxiety: 3,
      description: "Good day",
      gratitude: "Family",
      reflection: "Steady"
    },
    {
      date: "2026-01-11",
      hour: "10:15",
      "mood level": 6,
      depression: 3,
      anxiety: 4,
      description: "Busy day",
      gratitude: "Work",
      reflection: "Need rest"
    }
  ]
};

const painPayload = {
  rows: [
    {
      date: "2026-01-12",
      hour: "08:10",
      "pain level": 5,
      "fatigue level": 4,
      coffee: 1,
      note: "Mild pain",
      area: "head,neck",
      symptoms: "nausea",
      activities: "driving",
      medicines: "ibuprofen",
      habits: "low sleep",
      other: "windy"
    }
  ],
  options: {
    options: {
      area: ["head", "neck"],
      symptoms: ["nausea"],
      activities: [],
      medicines: [],
      habits: [],
      other: []
    }
  }
};

const prefsPayload = {
  model: "mistral-small-latest",
  chatRange: "all",
  lastRange: "all",
  graphSelection: { mood: true }
};

source.query(`INSERT INTO files (name, data) VALUES (?, ?)`).run("diary.json", JSON.stringify(diaryPayload));
source.query(`INSERT INTO files (name, data) VALUES (?, ?)`).run("pain.json", JSON.stringify(painPayload));
source.query(`INSERT INTO files (name, data) VALUES (?, ?)`).run("prefs.json", JSON.stringify(prefsPayload));
source.query(`INSERT INTO user_settings (user_id, gemini_key) VALUES (?, ?)`).run(1, "fixture-key");
source.close();

const migration = Bun.spawnSync(
  [
    process.execPath,
    "src/migrate-from-mytools.ts",
    "--fresh",
    `--source=${sourcePath}`,
    `--target=${targetPath}`,
    `--report=${reportPath}`,
    "--primary-email=primary@example.com"
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdout: "pipe",
    stderr: "pipe"
  }
);

if (migration.exitCode !== 0) {
  throw new Error(`Migration failed\nstdout:\n${text(migration.stdout)}\nstderr:\n${text(migration.stderr)}`);
}

const report = JSON.parse(fs.readFileSync(reportPath, "utf8")) as Record<string, unknown>;
assert(report.usersCopied === 2, "Expected 2 migrated users");
assert(report.diaryRows === 2, "Expected 2 diary rows");
assert(report.painRows === 1, "Expected 1 pain row");
assert(report.aiKeys === 1, "Expected 1 AI key");

const target = new Database(targetPath, { readonly: true });
const count = (table: string) => Number((target.query(`SELECT COUNT(*) as c FROM ${table}`).get() as any)?.c ?? 0);
assert(count("users") === 2, "Target users count mismatch");
assert(count("diary_entries") === 2, "Target diary count mismatch");
assert(count("pain_entries") === 1, "Target pain count mismatch");

const painRow = target
  .query(`SELECT area, symptoms, activities, medicines, habits, other FROM pain_entries LIMIT 1`)
  .get() as Record<string, string>;
assert(painRow.area === "head, neck", "Area migration mismatch");
assert(painRow.symptoms === "nausea", "Symptoms migration mismatch");
assert(painRow.activities === "driving", "Activities migration mismatch");
assert(painRow.medicines === "ibuprofen", "Medicines migration mismatch");
assert(painRow.habits === "low sleep", "Habits migration mismatch");
assert(painRow.other === "windy", "Other migration mismatch");
target.close();

console.log("myHealth migration fixture check passed");
