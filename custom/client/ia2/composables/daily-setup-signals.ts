// overlay/custom/client/ia2/composables/daily-setup-signals.ts
// 日常搭建完成的真实信号（2026-10-26 全量盘点 R1：六阶段统一日常口径）。
//
// 此前用推演 run-state 的五步完成键冒充日常进度；日常模式下又恒返 current。
// 本模块只读三处真实配置（组织注册表 / 人员名册 / 智能体档案）：
//   org      = /api/governance/registry/org 的首张表有非空数据行
//   accounts = /api/governance/registry/roster 的首张表有非空数据行
//   agents   = /api/hermes/profiles 档案数 > 0
// 团队与环境资产没有稳定的日常完成信号，保持 null（UI 显示「未纳入跟踪」），
// 不猜、不拿任务状态代填。
//
// 缓存 60s + inflight 去重；源失败=该项 null（fail-soft，不阻断导航）。
import { ref } from 'vue'
import type { SetupStep, SetupStepState } from './useStageProgress'

export interface DailySetupSignals {
  org: boolean | null
  accounts: boolean | null
  agents: boolean | null
}

const signals = ref<DailySetupSignals>({ org: null, accounts: null, agents: null })
const loadedAt = ref(0)
let inflight: Promise<void> | null = null
const TTL_MS = 60_000

function hasRows(markdown: string): boolean {
  const lines = markdown.split('\n')
  let start = -1
  for (let i = 0; i + 1 < lines.length; i += 1) {
    if (/^\|/.test(lines[i]) && /^\|[\s:|-]+\|$/.test(lines[i + 1])) { start = i + 2; break }
  }
  if (start < 0) return false
  for (let i = start; i < lines.length && /^\|/.test(lines[i]); i += 1) {
    const cells = lines[i].replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|')
    if (cells.some(c => c.trim())) return true
  }
  return false
}

export function ensureDailySetupSignals(force = false): Promise<void> {
  if (!force && inflight) return inflight
  if (!force && signals.value.org !== null && Date.now() - loadedAt.value < TTL_MS) return Promise.resolve()
  inflight = (async () => {
    // 每个 specifier 只 import 一次、实例上多次调用：同一 specifier 的并发
    // dynamic import 在测试 mock 拦截层会竞态（第二次拿到未拦截真模块）；
    // 生产无影响，但一次导入本就是正确形态。
    const [registry, profilesMod] = await Promise.allSettled([
      import('@/custom/governance/api/adminRegistry'),
      import('@/api/hermes/profiles'),
    ])
    const settle = <T,>(p: Promise<T>, pick: (v: T) => boolean | null): Promise<boolean | null> =>
      p.then(v => pick(v), () => null)
    const [org, roster, agents] = await Promise.all([
      registry.status === 'fulfilled'
        ? settle(registry.value.fetchRegistry('org'), d => hasRows(d.markdown ?? ''))
        : Promise.resolve(null),
      registry.status === 'fulfilled'
        ? settle(registry.value.fetchRegistry('roster'), d => hasRows(d.markdown ?? ''))
        : Promise.resolve(null),
      profilesMod.status === 'fulfilled'
        ? settle(profilesMod.value.fetchProfiles(), list => (list?.length ?? 0) > 0)
        : Promise.resolve(null),
    ])
    signals.value = { org, accounts: roster, agents }
    loadedAt.value = Date.now()
  })().finally(() => { inflight = null })
  return inflight
}

export function dailySetupSignals(): DailySetupSignals {
  return signals.value
}

/** 五步状态：org/accounts/agents 有真值；teams/env 无日常信号=untracked。
 *  第一个未完成且可判的步骤为 current，其余未完成= pending。 */
export function dailySetupStepState(step: SetupStep, sig: DailySetupSignals): SetupStepState {
  const key = step.key as keyof DailySetupSignals
  if (!(key in sig)) return 'untracked'
  const value = sig[key]
  if (value === null) return 'untracked'
  if (value) return 'done'
  const order: Array<keyof DailySetupSignals> = ['org', 'accounts', 'agents']
  const firstOpen = order.find(k => sig[k] === false)
  return firstOpen === key ? 'current' : 'pending'
}

/** ①搭建阶段态：可判项全完成=done；有可判项但未全完成=current；
 *  全部不可判=pending（不假装完成，也不假装进行中）。 */
export function dailySetupStageState(sig: DailySetupSignals): 'done' | 'current' | 'pending' {
  const tracked = ([sig.org, sig.accounts, sig.agents] as Array<boolean | null>).filter(v => v !== null) as boolean[]
  if (!tracked.length) return 'pending'
  if (tracked.every(Boolean)) return 'done'
  return 'current'
}

/** 测试专用：清缓存与 inflight */
export function __resetDailySetupSignalsForTest(): void {
  signals.value = { org: null, accounts: null, agents: null }
  loadedAt.value = 0
  inflight = null
}
