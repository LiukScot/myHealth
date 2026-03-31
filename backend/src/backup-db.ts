import fs from "node:fs";
import path from "node:path";
import { Database } from "bun:sqlite";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "../data/health.sqlite");
const backupDir = process.env.BACKUP_DIR || path.resolve(process.cwd(), "../data/backups");

if (!fs.existsSync(dbPath)) {
  console.error(`DB not found: ${dbPath}`);
  process.exit(1);
}

fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const target = path.join(backupDir, `health-${stamp}.sqlite`);

// Serialize from SQLite itself so WAL-backed committed data is included in one snapshot file.
const db = new Database(dbPath, { readonly: true });
try {
  const snapshot = db.serialize();
  fs.writeFileSync(target, snapshot);
} finally {
  db.close();
}

console.log(target);
