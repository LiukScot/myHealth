import path from "node:path";
import { defineConfig } from "@playwright/test";

const smokePort = Number(process.env.SMOKE_PORT || 4173);
const smokeDbPath = path.resolve(__dirname, "backend/data/smoke-myhealth.sqlite");
const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

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
        command: `DB_PATH=${smokeDbPath} npm run smoke:seed && PORT=${smokePort} DB_PATH=${smokeDbPath} npm run smoke:serve`,
        port: smokePort,
        reuseExistingServer: false,
        timeout: 180_000
      }
});
