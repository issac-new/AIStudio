// overlay/custom/server/controllers/sim/capture-plan.ts
// 帧拍摄位注册表只读投影（P3 采集面产品化，spec 2026-11-21-p2-p4-sim-product-final）：
// GET /api/sim/capture-plan——capture-plan.env 四态解析为结构化 JSON。
// 语义正本=simharness/mux/capture-plan.env（本端点只读投影，不建第二事实源；
// 维护纪律仍走该文件头注）。四态：
//   step|url|user[|action]  → {kind:'page', url, user, action?}
//   step|none|理由          → {kind:'none', reason}
//   step|repo|理由          → {kind:'repo', reason}
//   step|file:<path>        → {kind:'file', path}
// fail-soft：文件缺席（P4 归档后）＝available:false + 空表。
import Router from '@koa/router'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { ok } from '../../lib/http'

export interface CapturePlanEntry {
  step: string
  kind: 'page' | 'none' | 'repo' | 'file'
  url?: string
  user?: string
  action?: string
  reason?: string
  path?: string
}

function capturePlanPath(): string {
  return process.env.SIM_CAPTURE_PLAN_PATH?.trim() || join(process.cwd(), 'simharness', 'mux', 'capture-plan.env')
}

export function parseCapturePlan(src: string): CapturePlanEntry[] {
  const out: CapturePlanEntry[] = []
  for (const rawLine of src.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const cols = line.split('|').map((c) => c.trim())
    const step = cols[0]
    if (!step) continue
    const second = cols[1] ?? ''
    if (second === 'none' || second === 'repo') {
      out.push({ step, kind: second, reason: cols.slice(2).join('|') || '（未注理由）' })
    } else if (second.startsWith('file:')) {
      out.push({ step, kind: 'file', path: second.slice('file:'.length) })
    } else if (second) {
      const entry: CapturePlanEntry = { step, kind: 'page', url: second, user: cols[2] || 'fanfan' }
      if (cols[3]) entry.action = cols[3]
      out.push(entry)
    }
  }
  return out
}

export function createSimCapturePlanRouter(): Router {
  const router = new Router()
  router.get('/api/sim/capture-plan', async (ctx) => {
    const p = capturePlanPath()
    if (!existsSync(p)) { ok(ctx, { available: false, plan: [] }); return }
    try {
      const entries = parseCapturePlan(readFileSync(p, 'utf8'))
      ok(ctx, { available: true, plan: entries })
    } catch {
      ok(ctx, { available: false, plan: [] }) // 读失败=空态（fail-soft：审计可见不阻断）
    }
  })
  return router
}

export default createSimCapturePlanRouter()
