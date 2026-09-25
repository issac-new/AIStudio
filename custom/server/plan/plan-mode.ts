// overlay/plan 域：Plan Mode 三件套轻量版（minimax §六 C 表 P1 吸收，矩阵 §3.4）。
//
// minimax 语义（Plan Mode 三件套：确认门+agent 主动进入+评审面板）：
// 1. **agent 主动进入**：运行中 agent 判断"先出计划再动手"→ 发 plan 申请；
// 2. **确认门**：申请须人确认（confirmed）才进入；拒绝=rejected；auto 通道
//    （auto-approved：低风险计划直接进，minimax 确认门免打扰档）；
// 3. **评审面板**：IdePlanFloat（旧账已核在）消费本域数据（计划文本+评论回流
//    衔接 414 评审域语义）。
// 存储：每 plan 一份 JSON（幂等 planId），HERMES_PLAN_DIR 降级同款。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export type PlanState = 'requested' | 'confirmed' | 'auto-approved' | 'rejected' | 'executing'

export interface PlanRequest {
  planId: string
  fromAgent: string
  taskId?: string
  planText: string
  at: number
  state: PlanState
  decision?: { by: string; at: number; note?: string }
}

function writable(dir: string): boolean {
  try {
    const probe = join(dir, `.plan-probe-${process.pid}`)
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

export function planDir(): string {
  const env = process.env.HERMES_PLAN_DIR?.trim()
  if (env) return resolve(env)
  const cwd = process.cwd()
  if (writable(cwd)) return resolve(cwd, '.plan-mode')
  return join(homedir(), '.hermes-web-ui', 'plan-mode')
}

function planFile(planId: string): string {
  return join(planDir(), `${planId.replace(/[^A-Za-z0-9._-]/g, '_')}.json`)
}

export function loadPlan(planId: string): PlanRequest | null {
  try {
    const raw = JSON.parse(readFileSync(planFile(planId), 'utf8'))
    if (raw && raw.planId === planId) return raw as PlanRequest
  } catch { /* 坏/无文件 fail-soft */ }
  return null
}

function save(p: PlanRequest): void {
  mkdirSync(planDir(), { recursive: true })
  writeFileSync(planFile(p.planId), JSON.stringify(p, null, 2))
}

/** agent 主动进入（发申请，幂等 planId；state=requested 除非 auto 通道）。 */
export function requestPlanMode(req: Omit<PlanRequest, 'at' | 'state'> & { at?: number; auto?: boolean }): PlanRequest {
  const existing = loadPlan(req.planId)
  if (existing) return existing
  const full: PlanRequest = {
    ...req,
    at: req.at ?? Date.now(),
    state: req.auto ? 'auto-approved' : 'requested',
  }
  save(full)
  return full
}

/** 确认门裁决（一次定音）。 */
export function decidePlan(planId: string, verdict: 'confirmed' | 'rejected', by: string, note?: string): PlanRequest | { error: string } {
  const p = loadPlan(planId)
  if (!p) return { error: '计划不存在' }
  if (p.state !== 'requested') return { error: `计划已裁决或已进入（当前 ${p.state}）` }
  p.state = verdict
  p.decision = { by, at: Date.now(), note }
  save(p)
  return p
}

/** 进入执行（confirmed/auto-approved → executing；评审面板"确认执行"动作）。 */
export function markExecuting(planId: string): PlanRequest | { error: string } {
  const p = loadPlan(planId)
  if (!p) return { error: '计划不存在' }
  if (p.state !== 'confirmed' && p.state !== 'auto-approved') {
    return { error: `未确认的计划不可执行（当前 ${p.state}）` }
  }
  p.state = 'executing'
  save(p)
  return p
}

/** 待确认队列（评审面板数据面）。 */
export function listRequested(): PlanRequest[] {
  const out: PlanRequest[] = []
  try {
    if (!existsSync(planDir())) return out
    const { readdirSync } = require('fs') as typeof import('fs')
    for (const f of readdirSync(planDir())) {
      if (!f.endsWith('.json')) continue
      const p = loadPlan(f.slice(0, -5))
      if (p && p.state === 'requested') out.push(p)
    }
  } catch { /* 目录缺席跳过 */ }
  return out.sort((a, b) => a.at - b.at)
}
