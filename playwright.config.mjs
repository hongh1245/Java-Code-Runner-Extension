import { defineConfig } from '@playwright/test';
export default defineConfig({
  projects: [
    { name: 'extension', testDir: './test/browser' },
    { name: 'ui', testDir: './test/ui' }
  ],
  fullyParallel: false,
  workers: 1,
  timeout: 40000,
  expect: { timeout: 20000 },
  reporter: 'list'
});
