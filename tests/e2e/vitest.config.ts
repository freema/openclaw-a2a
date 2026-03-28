import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60000, // 60s — real OpenClaw API calls can be slow
    hookTimeout: 15000,
    globalSetup: ['tests/e2e/global-setup.ts'],
    // Sequential — E2E tests share server state
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
  },
});
