import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:4173/MyQuiz/',
    headless: true,
    // Use the preinstalled Chromium in the cloud container when present; otherwise Playwright's own.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: { command: 'npm run preview -- --port 4173 --strictPort', url: 'http://localhost:4173/MyQuiz/', reuseExistingServer: true, timeout: 60_000 },
})
