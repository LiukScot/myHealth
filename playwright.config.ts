import { defineConfig } from "@playwright/test";

const smokePort = Number(process.env.SMOKE_PORT || process.env.PORT || 5555);

export default defineConfig({
  testDir: "./tests",
  timeout: 60_000,
  use: {
    baseURL: `http://127.0.0.1:${smokePort}`,
    headless: true
  },
  webServer: {
    command: `PORT=${smokePort} npm run smoke:serve`,
    port: smokePort,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  }
});
