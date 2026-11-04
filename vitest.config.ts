import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/*/test/**/*.test.ts', 'apps/*/test/**/*.test.ts', 'scripts/test/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'text-summary'],
      include: [
        'packages/core/src/**/*.ts',
        'packages/runtime/src/http-auth.ts',
        'apps/builder/src/allowlist.ts',
        'apps/builder/src/authorize.ts',
        'apps/builder/src/exec.ts',
        'apps/notary/src/inbound.ts',
      ],
      exclude: ['**/*.d.ts', '**/main.ts', '**/index.ts'],
      thresholds: {
        lines: 90,
        branches: 80,
      },
    },
  },
});
