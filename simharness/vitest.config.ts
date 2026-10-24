// 纯对象导出（不 import vitest/config——本仓无 node_modules，借道 overlay vitest
// --root 调起；defineConfig 只是恒等助手，省掉即免解析）。
export default {
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 120_000 },
}
