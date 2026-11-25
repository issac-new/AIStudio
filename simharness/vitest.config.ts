// 纯对象导出（不 import vitest/config——本仓无 node_modules，借道 overlay vitest
// --root 调起；defineConfig 只是恒等助手，省掉即免解析）。
export default {
  // hookTimeout 与 testTimeout 对齐：beforeAll 要真实起 harness 服务并跑探测脚本
  // （capability-probes 常态约 5 秒），沿用框架默认 10 秒在高负载下间歇超时
  // （2026-11-22 全量回归首次记录，2026-11-25 复发）。
  test: { include: ['tests/**/*.test.ts'], environment: 'node', testTimeout: 120_000, hookTimeout: 120_000 },
}
