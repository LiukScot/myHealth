import fs from "node:fs";
import path from "node:path";
import { openDb, runMigrations } from "./db.ts";

const args = new Set(process.argv.slice(2));
const fresh = args.has("--fresh");
const dbPathArg = [...args].find((a) => a.startsWith("--db="));
const dbPath = dbPathArg ? dbPathArg.slice("--db=".length) : process.env.DB_PATH || path.resolve(process.cwd(), "../data/health.sqlite");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fresh && fs.existsSync(dbPath)) {
  fs.rmSync(dbPath, { force: true });
}

const db = openDb(dbPath, process.env.DB_JOURNAL_MODE || "WAL");
runMigrations(db);
db.close();
console.log(`Health DB ready at ${dbPath}`);
