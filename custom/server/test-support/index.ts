// 测试稳定性 DSL 服务端面单一导出面（2026-11-02 批 A）。
// 使用：import { waitFor, createTeardownScope, bindTeardownToSuite } from '../test-support'
export { waitFor } from './wait-for'
export type { WaitForOptions } from './wait-for'
export { createTeardownScope, bindTeardownToSuite } from './teardown'
export type { TeardownScope, TeardownFailure } from './teardown'
