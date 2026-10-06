import { defineConfig } from '@playwright/test';

// Playwright is used as a Node test runner and HTTP client only. No project
// uses `page` or `browser`, so no browser binaries are required.
export default defineConfig({
  reporter: [['list'], ['json', { outputFile: 'reports/evaluator-selftest.json' }]],
  projects: [
    { name: 'evaluator', testDir: 'tests/unit' },
    {
      name: 'live',
      testDir: 'tests/live',
      use: { baseURL: process.env.BASE_URL, extraHTTPHeaders: { 'Content-Type': 'application/json' } },
      timeout: 10_000,
    },
  ],
});
