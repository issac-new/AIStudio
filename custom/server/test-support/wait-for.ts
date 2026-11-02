// 测试稳定性 DSL 服务端面（2026-11-02 批 A）：谓词轮询 waitFor。
// 与 scripts/regression/dsl.mjs 同语义（判据用状态而非固定 sleep）；服务端测试
// 不 import 走查模块（scripts/ 面属 ESM .mjs 装具链），TS 本仓单列一份。
// 语义来源：spec 2026-11-02-test-stability-dsl 决策 1/2。

export interface WaitForOptions {
  /** 总预算毫秒，缺省 5000（服务端单测比走查紧凑） */
  timeoutMs?: number
  /** 轮询间隔毫秒，缺省 20 */
  intervalMs?: number
  /** 进超时错误信息的定位标签（多步等待场景必填，定位是哪一步等超时） */
  label?: string
}

/**
 * 轮询谓词直到返回真值或超时抛错；async 谓词允许。
 * 首轮立即判（多数单测场景首查即真，白等一个 interval 是纯损耗）。
 */
export async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  { timeoutMs = 5000, intervalMs = 20, label = 'condition' }: WaitForOptions = {},
): Promise<void> {
  const start = Date.now()
  let polls = 0
  for (;;) {
    polls++
    if (await predicate()) return
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`waitFor timeout: ${label} 未在 ${timeoutMs}ms 内成立（${polls} 次轮询）`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}
