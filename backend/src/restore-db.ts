import fs from "node:fs";
import path from "node:path";

const fileArg = process.argv.slice(2).find((a) => a.startsWith("--file="));
if (!fileArg) {
  console.error("Usage: bun src/restore-db.ts --file=/absolute/path/to/backup.sqlite");
  process.exit(1);
}

const source = fileArg.slice("--file=".length);
const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "../data/health.sqlite");

if (!fs.existsSync(source)) {
  console.error(`Backup file not found: ${source}`);
  process.exit(1);
}

fs.mkdirSync(path.dirname(dbPath), { recursive: true });
if (fs.existsSync(dbPath)) {
  fs.copyFileSync(dbPath, `${dbPath}.pre-restore-${Date.now()}.bak`);
}
fs.copyFileSync(source, dbPath);
console.log(`Restored ${dbPath} from ${source}`);
