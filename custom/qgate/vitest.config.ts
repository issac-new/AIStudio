// qgate 独立 vitest 配置（standalone npm test 与 CI 用；overlay 根配置面向全仓）。
// 只收 __tests__/*.test.ts：examples 下的 *.test.mjs 是 demo 脚本（process.exit 直退），
// 会被 vitest 默认 include 误扫并报错——2026-09-24 复盘实录。
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
})
