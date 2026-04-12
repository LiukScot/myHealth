import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const smokePort = Number(process.env.SMOKE_PORT || 4173);
const smokeDbDir = fs.mkdtempSync(path.join(os.tmpdir(), "health-playwright-"));
const smokeDbPath = path.join(smokeDbDir, "smoke-health.sqlite");
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;
const quoteShell = (value: string) => JSON.stringify(value);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: externalBaseURL || `http://127.0.0.1:${smokePort}`,
    headless: true
  },
  webServer: externalBaseURL
    ? undefined
    : {
        command: `rm -f ${quoteShell(smokeDbPath)} ${quoteShell(`${smokeDbPath}-shm`)} ${quoteShell(`${smokeDbPath}-wal`)} && DB_JOURNAL_MODE=DELETE DB_PATH=${quoteShell(smokeDbPath)} npm run smoke:seed && PORT=${smokePort} DB_JOURNAL_MODE=DELETE DB_PATH=${quoteShell(smokeDbPath)} npm run smoke:serve`,
        port: smokePort,
        reuseExistingServer: false,
        timeout: 180_000
      }
});
