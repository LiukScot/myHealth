import path from "node:path";
import { openDb, runMigrations } from "./db.ts";

const dbPath = process.env.DB_PATH || path.resolve(process.cwd(), "../data/health.sqlite");
const cmd = process.argv[2];
const args = process.argv.slice(3);

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const hit = args.find((a) => a.startsWith(pref));
  return hit ? hit.slice(pref.length) : undefined;
}

function required(name: string): string {
  const v = arg(name);
  if (!v) {
    throw new Error(`Missing --${name}=...`);
  }
  return v;
}

async function main() {
  const db = openDb(dbPath, process.env.DB_JOURNAL_MODE || "WAL");
  runMigrations(db);

  if (cmd === "list") {
    const rows = db
      .query(`SELECT id, email, name, disabled_at, created_at, updated_at FROM users ORDER BY id ASC`)
      .all() as any[];
    console.table(rows);
    db.close();
    return;
  }

  if (cmd === "create") {
    const email = required("email").trim().toLowerCase();
    const password = required("password");
    const name = arg("name") ?? null;
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    db.query(`INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)`).run(email, hash, name);
    console.log(`User created: ${email}`);
    db.close();
    return;
  }

  if (cmd === "reset-password") {
    const email = required("email").trim().toLowerCase();
    const password = required("password");
    const hash = await Bun.password.hash(password, { algorithm: "argon2id" });
    const result = db.query(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?`).run(hash, email);
    if (!result.changes) {
      throw new Error(`User not found: ${email}`);
    }
    console.log(`Password reset for ${email}`);
    db.close();
    return;
  }

  if (cmd === "disable") {
    const email = required("email").trim().toLowerCase();
    const result = db
      .query(`UPDATE users SET disabled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE email = ?`)
      .run(email);
    if (!result.changes) throw new Error(`User not found: ${email}`);
    console.log(`Disabled user: ${email}`);
    db.close();
    return;
  }

  if (cmd === "enable") {
    const email = required("email").trim().toLowerCase();
    const result = db.query(`UPDATE users SET disabled_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE email = ?`).run(email);
    if (!result.changes) throw new Error(`User not found: ${email}`);
    console.log(`Enabled user: ${email}`);
    db.close();
    return;
  }

  db.close();
  throw new Error(
    "Unknown command. Use: list | create --email= --password= [--name=] | reset-password --email= --password= | disable --email= | enable --email="
  );
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
