// Browser tests: `npm run e2e` from the repo root. They drive the dev server in Chromium, starting each test from a
// game state built with the engine (see e2e/scene.ts).
import { defineConfig } from "@playwright/test";

const PORT = 5199;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1600, height: 1000 }, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: { command: `npx vite --port ${PORT} --strictPort`, url: `http://localhost:${PORT}`, reuseExistingServer: true, timeout: 60_000 },
});
