import { defineConfig } from 'vitest/config';

// compliant fixture: 覆盖率阈值 + environment + setupFiles + 显式 import（无 globals）+ bench + typecheck
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    benchmark: {
      include: ['tests/**/*.bench.ts'],
    },
    typecheck: {
      enabled: true,
    },
  },
});
