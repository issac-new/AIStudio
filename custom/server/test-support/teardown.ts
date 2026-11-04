// 测试稳定性 DSL 服务端面（2026-11-02 批 A）：测试收尾状态恢复。
// 背景与服务：服务端测试常建临时数据/启后台任务，散落的 afterAll 手写清理
// 在用例中途 throw 时整段跳过（残留放大下轮排查成本）；本件统一为
// 「测试体内 register、afterAll 统一逆序执行、单条失败不阻断」。
// 语义来源：spec 2026-11-02-test-stability-dsl 决策 3/4。

export interface TeardownFailure {
  name: string
  error: string
}

export interface TeardownScope {
  /** 注册收尾动作（测试体内调用）；register 序即申请序，run 逆序释放 */
  register(name: string, fn: () => void | Promise<void>): void
  /** 逆序执行全部动作；幂等。单条失败被捕获并进 failures，不阻断后续 */
  run(): Promise<{ ran: string[]; failures: TeardownFailure[] }>
}

export function createTeardownScope(label = 'teardown'): TeardownScope {
  const steps: Array<{ name: string; fn: () => void | Promise<void> }> = []
  let ran = false
  return {
    register(name, fn) {
      steps.push({ name, fn })
    },
    async run() {
      if (ran) return { ran: [], failures: [] }
      ran = true
      const executed: string[] = []
      const failures: TeardownFailure[] = []
      for (const step of steps.reverse()) {
        try {
          await step.fn()
          executed.push(step.name)
        } catch (err) {
          failures.push({ name: step.name, error: String((err as Error)?.message ?? err) })
        }
      }
      if (failures.length) {
        // 失败可见但不抛（清理失败不该把绿测试染红成假失败；台账语义同走查面）
        console.error(`[teardown:${label}] ${failures.length} 步失败: ${failures.map((f) => f.name).join(', ')}`)
      }
      return { ran: executed, failures }
    },
  }
}

/**
 * 把 scope 绑到当前 describe/文件 的 afterAll：测试体内只管 register，收尾自动跑。
 * 显式绑定而非全局 afterEach——避免隐式钩子污染未接入的测试文件（决策 4）。
 * 须在 describe 体顶层同步调用一次。
 */
export function bindTeardownToSuite(
  scope: TeardownScope,
  afterAllHook: (fn: () => void | Promise<void>) => void,
): void {
  // 钩子签名只收 void：run() 的结果内部已落账（failures 不抛），此处仅等待完成
  afterAllHook(async () => {
    await scope.run()
  })
}
