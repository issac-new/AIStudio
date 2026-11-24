// Regression: ISSUE-009 — PATCH 返回 200 但 title/body 未持久化
// Found by /qa on 2026-11-22
// Report: .gstack/qa-reports/run-20261122T133641Z/qa-report-aistudio-2026-11-22.md
// 真实 CLI 端到端测试：二进制缺席（GH CI runner 无 hermes）整组跳过——
// mock 掉 CLI 即失去 ISSUE-009 回归意义；开发机/预推送门二进制在场时全量执行。
// N34-8：只有「二进制缺席」才允许跳过。在场但探针超时或非零退出必须显式报失败——
// 本机 hermes --version 冷启动实测 11 秒，原 10 秒超时在负载下会把整组回归静默跳过。
// 真实 CLI 用例超时放宽到 90 秒——冷启动＋隔离库下首次建板曾逼近默认 30 秒；超时是
// 显式失败而不是悄悄跳过（探针用例单独守住）。同轮实测还抓到过宿主安装锁被另一会话的
// hermes update 持锁 10 秒、真实 CLI 抛错——这类环境失败现在也是显式失败。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 与 resolveHermesBin()（vendor runtime/process）同序：HERMES_BIN → PATH hermes
const hermesBin = process.env.HERMES_BIN?.trim() || 'hermes'
/** 冷启动耗时（实测 11 秒）的五倍；超时不再是静默跳过的理由，而是一条显式失败。 */
const HERMES_PROBE_TIMEOUT_MS = 60_000
const hermesProbe = spawnSync(hermesBin, ['--version'], { timeout: HERMES_PROBE_TIMEOUT_MS })
const hermesMissing = (hermesProbe.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT'
const hermesAvailable = hermesProbe.status === 0

let home = ''
let previousKanbanHome: string | undefined

beforeEach(async () => {
  previousKanbanHome = process.env.HERMES_KANBAN_HOME
  home = await mkdtemp(join(tmpdir(), 'kanban-title-edit-'))
  process.env.HERMES_KANBAN_HOME = join(home, 'kanban')
})

afterEach(async () => {
  if (previousKanbanHome === undefined) delete process.env.HERMES_KANBAN_HOME
  else process.env.HERMES_KANBAN_HOME = previousKanbanHome
  if (home) await rm(home, { recursive: true, force: true })
})

describe('kanban PATCH title/body', () => {
  it('可用性探针：hermes 在场时必须成功（超时或非零退出不得静默跳过回归）', () => {
    if (hermesMissing) return
    expect(hermesProbe.error, `hermes 探针异常（${hermesBin} --version，超时 ${HERMES_PROBE_TIMEOUT_MS}ms）`).toBeUndefined()
    expect(hermesProbe.status, `hermes 探针非零退出：${String(hermesProbe.stderr ?? '').slice(0, 300)}`).toBe(0)
  })

  it.skipIf(!hermesAvailable)('通过真实 kanban CLI 编辑并在二次读取时保持新值', async () => {
    const cli = await import('../../../../../vendor/hermes-studio/packages/server/src/modules/hermes/services/kanban/kanban-service')
    const board = 'title-edit'
    await cli.createBoard({ slug: board, name: 'title edit regression' })
    const created = await cli.createTask('original title', { board, body: 'original body', triage: false })
    const updated = await cli.patchTask(created.id, { board, title: 'updated title', body: 'updated body' })
    expect(updated?.title).toBe('updated title')
    expect(updated?.body).toBe('updated body')
    const reread = await cli.getTask(created.id, { board })
    expect(reread?.task.title).toBe('updated title')
    expect(reread?.task.body).toBe('updated body')
  }, 90_000)
})
