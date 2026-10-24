import { defineConfig } from 'vitest/config';

// violating fixture（R132 D1 实态=trade-forge 形态）：阈值已配（阈值判定旧口径会过）+
// provider 缺失（同目录无 package.json 装 @vitest/coverage-v8）+ 执行通道未开——
// 配置通道≠生效通道，fw_jest_coverage_threshold 须 fail。
// 另保留：globals:true + 无 environment + 残留 jest.fn。
export default defineConfig({
  test: {
    globals: true,
    include: ['src/**/*.{test,spec}.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
