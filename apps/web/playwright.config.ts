// Browser tests: `npm run e2e` from the repo root. They drive a test build of the app in Chromium, starting each test
// from a game state built with the engine (see e2e/scene.ts).
import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const PORT = 5199;
// Cloud sessions' preinstalled Chromium: its build can be newer than the one this @playwright/test version would
// download, so it's launched by its path (Oct 23 2026). Elsewhere, `npx playwright install chromium`'s.
const CLOUD_CHROMIUM = "/opt/pw-browsers/chromium";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1600, height: 1000 }, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { browserName: "chromium", ...(existsSync(CLOUD_CHROMIUM) ? { launchOptions: { executablePath: CLOUD_CHROMIUM } } : {}) } }],
  // A built app (`vite build --mode e2e`, which keeps the test hooks) served by `vite preview`: the full run takes about
  // 6 minutes instead of 8 against the dev server (Oct 17 2026). E2E_SERVER=dev uses the dev server instead.
  webServer: {
    command: process.env.E2E_SERVER === "dev" ? `npx vite --port ${PORT} --strictPort` : `npx vite build --mode e2e --outDir dist-e2e --logLevel warn && npx vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
