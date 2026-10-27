// callgate 执法接线（wx 挂账 #14，2026-10-27 清偿批）。
//
// wx 吸收轮 D8 当年判定「执法接线需动 LLM 客户端与 MCP 网关（跨 upstream 面，
// 须 patch），单独成轮」；proactivity H4（enforce-gate 策略链 0.7）证明
// ekkoToolExecuteHooks 钩子链就是 overlay 可达的调用消费点——本模块沿该先例把
// callgate 从「只观测」升级为「opt-in 执法」，零新增 patch。
//
// 语义：
// - preExecute = check（准入问路，消耗速率窗与并发位）；verdict 非 allow 即拒，
//   文案带降级阶梯提示（degradeActionFor）与可等待时长。
// - postExecute = settle（结果 ok/success 入账熔断器、释放并发位）。
// - 总闸 HERMES_CALLGATE_ENFORCE=1（默认 0=零行为变化，HERMES_TOOL_ENFORCE 同款
//   纪律）；内部异常 fail-open（观测面照常）。
// - 资源映射：mcp__{server}__* → kind 'mcp'（按连接器分键）；其余工具 → 'tool'。
//   kind 'llm'（模型调用面）不在工具瀑布层，overlay 无消费点——保持观测/登记面，
//   如实边界不装已执法。
import { degradeActionFor, type CallResource, type CallgateRegistry, type ResourceKind } from './callgate'
import { overlayCallgate } from './registry'

interface PreExecuteVerdict { allow: false; error: string }

export interface CallgateHookDeps {
  registry?: CallgateRegistry
  /** 测试注入；缺省读 process.env.HERMES_CALLGATE_ENFORCE。 */
  enforceOn?: boolean
}

/** mcp__{server}__{tool} → mcp:server（server 段小写，与 enforce-gate 的 parseMcpName 同规）；其余 → tool:{name}。 */
export function resourceOfTool(name: string): CallResource {
  if (name.startsWith('mcp__')) {
    const rest = name.slice(5)
    const i = rest.indexOf('__')
    const server = (i > 0 ? rest.slice(0, i) : rest).toLowerCase()
    return { kind: 'mcp' as const, key: server || 'unknown' }
  }
  return { kind: 'tool' as const, key: name }
}

/** 拒绝文案（verdict → 人读原因 + 降级建议）。 */
export function denyErrorFor(resource: CallResource, verdict: string, retryAfterMs: number, breakerState: string): string {
  const kind: ResourceKind = resource.kind
  const degrade = degradeActionFor(verdict as Parameters<typeof degradeActionFor>[0], kind)
  const wait = retryAfterMs > 0 ? `，建议 ${Math.ceil(retryAfterMs / 1000)}s 后重试` : ''
  return `调用闸 ${verdict}：${resource.kind}:${resource.key}（熔断 ${breakerState}）${wait}——降级建议 ${degrade}`
}

/** 生成挂进 ekkoToolExecuteHooks 的 callgate 执法钩子（preExecute 准入 + postExecute 回执）。 */
export function callgateHook(deps: CallgateHookDeps = {}): {
  preExecute: (name: string, _input: Record<string, unknown>) => Promise<PreExecuteVerdict | void>
  postExecute: <T extends { ok?: boolean }>(name: string, _input: Record<string, unknown>, result: T) => Promise<void>
} {
  const registry = deps.registry ?? overlayCallgate
  const on = () => deps.enforceOn ?? process.env.HERMES_CALLGATE_ENFORCE === '1'
  return {
    async preExecute(name: string) {
      if (!on()) return
      try {
        const resource = resourceOfTool(name)
        const decision = registry.check(resource)
        if (decision.verdict === 'allow') return
        return { allow: false as const, error: denyErrorFor(resource, decision.verdict, decision.retryAfterMs, decision.breakerState) }
      } catch {
        return // fail-open：执法面异常不拦截（观测面照常）
      }
    },
    async postExecute(name: string, _input: Record<string, unknown>, result: { ok?: boolean }) {
      if (!on()) return // 未执法时 check 未消耗名额，settle 会使并发位/熔断失真——对称跳过
      try {
        registry.settle(resourceOfTool(name), result?.ok !== false)
      } catch { /* fail-soft：回执失败只丢一次熔断记账，不抛 */ }
    },
  }
}
