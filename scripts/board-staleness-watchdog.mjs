// overlay/scripts/board-staleness-watchdog.mjs
// 卡依赖图停滞看门狗（run23 实锤根治，spec 2026-10-29-kanban-deps-and-session-rotation 案一）
// —— 可被 cron/监控调用的薄封装：读产品端点 GET /api/sim/board-staleness（patch 706 挂载，
// custom/server/controllers/sim/board-staleness.ts），发现「blocked 超阈值且仍有在途子卡」的
// 父卡即输出驱动侧可消费的 issues 留痕行（ISSUE|key|actor|描述，simharness issues.log 同格式）。
//
// 用法（npm run watch:board-staleness -- --base URL --token JWT [--board slug] ...）：
//   --base URL          产品 server 基址（默认 http://127.0.0.1:8647）
//   --token JWT         Bearer token（/api/sim/* 在 authMiddleware 后，必须带；亦可 env HERMES_JWT）
//   --board slug        板名（default 缺省）
//   --stale-hours N     停滞阈值小时（缺省随端点默认 2）
//   --issues-log PATH   追加留痕的 issues.log 路径（缺省只打 stdout）
//   --timeout-ms N      HTTP 超时（缺省 8000）
//
// 退出码：0=无停滞或源缺席（fail-soft 属常态不告警）；1=看门狗自身故障（网络/非 2xx/
// 坏响应——必须可见，不静默）；3=检出停滞父卡（cron/监控据此分支告警）。
import { appendFileSync } from 'node:fs'

/** 单个停滞父卡 → 驱动侧留痕行（ISSUE|key|actor|描述；描述禁竖线防字段撕裂）。 */
export function formatIssueLine(board, parent) {
  const kids = parent.children
    .map((c) => `${c.id}:${c.status}`)
    .join(',')
  const desc = `看板停滞父卡：[${board}] ${parent.id}「${parent.title}」已 blocked ${parent.blockedHours}h（block_kind=${parent.blockKind ?? 'null'}），${parent.children.length} 张在途子卡被依赖守卫锁住（${kids}）——需人工拆链（unlink 或结父卡）`
    .replace(/\|/g, '/')
  return `ISSUE|board-stale-parent|${parent.id}|${desc}`
}

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback
}

export async function main(argv = process.argv, env = process.env, out = process.stdout) {
  const base = (argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : env.BOARD_STALENESS_BASE) || 'http://127.0.0.1:8647'
  const token = argv.includes('--token') ? argv[argv.indexOf('--token') + 1] : env.HERMES_JWT || env.AIPAY_JWT || ''
  const board = argv.includes('--board') ? argv[argv.indexOf('--board') + 1] : 'default'
  const issuesLog = argv.includes('--issues-log') ? argv[argv.indexOf('--issues-log') + 1] : ''
  const timeoutMs = Number(argv.includes('--timeout-ms') ? argv[argv.indexOf('--timeout-ms') + 1] : 8000)

  const url = new URL('/api/sim/board-staleness', base)
  url.searchParams.set('board', board)
  if (argv.includes('--stale-hours')) url.searchParams.set('staleHours', String(Number(argv[argv.indexOf('--stale-hours') + 1])))

  const headers = token ? { Authorization: `Bearer ${token}` } : {}
  let body
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) {
      out.write(`board-staleness-watchdog: HTTP ${res.status}（${url}）——token 过期或网关异常\n`)
      return 1
    }
    body = await res.json()
  } catch (err) {
    out.write(`board-staleness-watchdog: 请求失败（${url}）：${err instanceof Error ? err.message : String(err)}\n`)
    return 1
  }

  // fail-soft：源缺席（未配推演根/板库不在）是常态，不算看门狗故障
  if (!body || body.available !== true) {
    out.write(`board-staleness-watchdog: 源缺席（board=${board}）：${body?.note ?? '响应无 available'}\n`)
    return 0
  }
  const parents = Array.isArray(body.staleParents) ? body.staleParents : []
  if (parents.length === 0) return 0

  for (const p of parents) {
    const line = formatIssueLine(board, p)
    out.write(`${line}\n`)
    if (issuesLog) appendFileSync(issuesLog, `${line}\n`)
  }
  return 3
}

// 直跑守卫：被测试 import 时不触发副作用
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(await main())
}
