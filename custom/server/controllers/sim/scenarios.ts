// overlay/custom/server/controllers/sim/scenarios.ts
// 推演场景库只读投影（P2 场景库产品化，spec 2026-11-21-p2-p4-sim-product-final）：
// GET /api/sim/scenarios——场景发现（simharness/scenarios/ 目录扫描，_template 排除）；
// GET /api/sim/scenarios/:name——roster.env 数组面摘要（USERS/INSTANCED_USERS）。
// 诚实边界：roster.env 是 bash 源文件，函数体（boards_of 等）不解析——本端点只投影
// 数据数组面，完整语义由驱动链 bash 执行；正本仍在场景目录原位（不建第二事实源）。
// fail-soft：simharness 缺席（P4 归档后）＝available:false + 空列表，不报错。
import Router from '@koa/router'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { ok, fail } from '../../lib/http'

/** 场景库根：simharness 随仓（归档预备态见 README；缺席走 fail-soft 空态） */
function scenariosRoot(): string {
  return process.env.SIM_SCENARIOS_ROOT?.trim() || join(process.cwd(), 'simharness', 'scenarios')
}

/** bash 数组面抽取：`USERS=(a b c)` → ['a','b','c']（注释/空行/其余行忽略） */
function parseBashArray(src: string, name: string): string[] {
  const m = src.match(new RegExp(`^${name}=\\(([^)]*)\\)`, 'm'))
  if (!m) return []
  return m[1].split(/[\s\n]+/).map((s) => s.trim()).filter(Boolean)
}

function rosterSummary(name: string): { users: string[]; instancedUsers: string[] } | null {
  const p = join(scenariosRoot(), name, 'roster.env')
  if (!existsSync(p)) return null
  try {
    const src = readFileSync(p, 'utf8')
    return { users: parseBashArray(src, 'USERS'), instancedUsers: parseBashArray(src, 'INSTANCED_USERS') }
  } catch {
    return null // 读失败=该场景无摘要，fail-soft 不阻断发现面
  }
}

export function createSimScenariosRouter(): Router {
  const router = new Router()
  router.get('/api/sim/scenarios', async (ctx) => {
    const root = scenariosRoot()
    if (!existsSync(root)) { ok(ctx, { available: false, scenarios: [] }); return }
    const names = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name !== '_template')
      .map((d) => d.name)
      .sort()
    ok(ctx, {
      available: true,
      scenarios: names.map((name) => ({ name, roster: rosterSummary(name) })),
    })
  })
  router.get('/api/sim/scenarios/:name', async (ctx) => {
    const name = String(ctx.params.name ?? '')
    if (!/^[A-Za-z0-9._-]+$/.test(name)) { fail(ctx, 400, '场景名非法'); return }
    const summary = rosterSummary(name)
    if (!summary) { fail(ctx, 404, `场景不存在或缺 roster：${name}`); return }
    ok(ctx, { name, roster: summary })
  })
  return router
}

export default createSimScenariosRouter()
