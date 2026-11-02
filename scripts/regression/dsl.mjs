// 测试稳定性 DSL 三件套（2026-11-02 批 A，MTSC2026 AI Native 测试方法论吸收）。
// 零依赖纯逻辑：waitFor（异步等待/Callback）、Teardown（状态恢复）、pick（数据选型/Selector）。
// 拆独立模块而非并入 harness.mjs 的原因：harness import @playwright/test，
// 守门测试导入它会拉浏览器链；本模块可被 vitest 直测（对齐纯函数直测模式）。
// 使用纪律（spec 2026-11-02-test-stability-dsl 决策 1/3）：
//   - waitFor 判据用应用状态而非固定 sleep（同 harness.waitForApp 的 2026-10-31 实测教训）
//   - Teardown 在走查脚本 finally 中调用；register 序即申请序，run 逆序释放
//   - pick 空 结果集抛错带条件描述，禁静默取 undefined 往下游传

/**
 * 通用谓词轮询：直到 predicate 返回真值（返回值原样透传）或超时抛错。
 * @param {() => boolean | Promise<boolean>} predicate async 允许
 * @param {{timeoutMs?: number, intervalMs?: number, label?: string}} opts
 *   timeoutMs 缺省 10000；intervalMs 缺省 200；label 进超时错误信息（必填场景：多步走查中定位是哪一步等超时）
 * @returns {Promise<void>} 谓词为真即 resolve
 */
export async function waitFor(predicate, { timeoutMs = 10000, intervalMs = 200, label = 'condition' } = {}) {
  const start = Date.now()
  let polls = 0
  // 首轮不等间隔立即判（多数场景首查即真，白等一个 interval 是纯损耗）
  for (;;) {
    polls++
    if (await predicate()) return
    if (Date.now() - start >= timeoutMs) {
      throw new Error(`waitFor timeout: ${label} 未在 ${timeoutMs}ms 内成立（${polls} 次轮询）`)
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

/**
 * 状态恢复队列：register 收集清理动作，run 逆序执行（后注册先释放，同 pytest fixture 惯例）。
 * 单条失败不阻断后续（否则环境残留放大排查成本），失败清单随返回值上报调用方记台账。
 */
export class Teardown {
  /** @param {string} label 走查面用于汇总日志定位 */
  constructor(label = 'teardown') {
    this.label = label
    this._steps = [] // {name, fn}
    this._ran = false
  }

  /**
   * @param {string} name 动作名（进失败汇总，须可读出「恢复的是什么」）
   * @param {() => void | Promise<void>} fn 清理动作；抛错被捕获计入 failures
   */
  register(name, fn) {
    this._steps.push({ name, fn })
  }

  /** 逆序执行全部已注册动作；幂等（二次 run 空转）。@returns {{ran: string[], failures: {name: string, error: string}[]}} */
  async run() {
    if (this._ran) return { ran: [], failures: [] }
    this._ran = true
    const ran = []
    const failures = []
    for (const step of this._steps.reverse()) {
      try {
        await step.fn()
        ran.push(step.name)
      } catch (err) {
        failures.push({ name: step.name, error: String(err?.message || err) })
      }
    }
    if (failures.length) {
      console.error(`[teardown:${this.label}] ${failures.length} 步失败: ${failures.map((f) => f.name).join(', ')}`)
    }
    return { ran, failures }
  }

  /** 已注册动作数（测试与自检用）。 */
  get size() {
    return this._steps.length
  }
}

/**
 * 数据选型：从集合按条件取一条，random 打散避免总打同一记录（长跑走查的隐性耦合源）。
 * @template T
 * @param {T[]} items 候选集合
 * @param {{where?: (item: T) => boolean, random?: boolean, label?: string}} opts
 *   where 过滤；random=true 在过滤结果中随机取（缺省 true）；label 进空结果错误
 * @returns {T} 命中一条
 * @throws 空集合/过滤后为空时抛错带 label 与候选规模（禁静默返回 undefined 往下游传）
 */
export function pick(items, { where, random = true, label = 'pick' } = {}) {
  if (!Array.isArray(items)) throw new Error(`pick: ${label} 输入非数组（got ${typeof items}）`)
  const pool = where ? items.filter(where) : items
  if (pool.length === 0) {
    throw new Error(`pick: ${label} 无匹配候选（输入 ${items.length} 条，条件${where ? '过滤后' : '为空即输入'}为 0）`)
  }
  return random ? pool[Math.floor(Math.random() * pool.length)] : pool[0]
}
