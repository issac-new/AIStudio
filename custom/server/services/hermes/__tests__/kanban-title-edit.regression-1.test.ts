// Regression: ISSUE-009 — PATCH 返回 200 但 title/body 未持久化
// Found by /qa on 2026-11-22
// Report: .gstack/qa-reports/run-20261122T133641Z/qa-report-aistudio-2026-11-22.md
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
  it('通过真实 kanban CLI 编辑并在二次读取时保持新值', async () => {
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
  }, 30_000)
})
