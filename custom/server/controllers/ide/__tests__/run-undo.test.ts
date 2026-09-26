// run 逐文件 Undo 守门（UI-5：反向 patch 真应用 added→删除/modified→还原/无 patch 422）。
import { describe, it, expect, beforeAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { execSync } from 'child_process'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'run-undo-test-'))
const repo = join(dir, 'repo')
const dbFile = join(dir, 'undo.db')
process.env.RUN_UNDO_DB = dbFile

interface CtxShape { request: { body: Record<string, unknown> }; status: number; body: unknown }
async function run(router: Router, ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = { request: { body: {} }, status: 200, body: undefined, ...ctx } as CtxShape
  const layer = router.stack.find((l) => l.methods.includes('POST') && l.match('/api/ide/run-undo'))
  expect(layer, 'route exists').toBeTruthy()
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

// 临时 git 仓（undo 目标工作区）
function git(args: string): void { execSync(`git ${args}`, { cwd: repo }) }

const HAND_PATCH = [
  'diff --git a/a.txt b/a.txt',
  '--- a/a.txt',
  '+++ b/a.txt',
  '@@ -1 +1 @@',
  '-line1',
  '+LINE1',
  '',
].join('\n')

beforeAll(() => {
  mkdirSync(repo)
  git('init -q')
  git('config user.email t@t')
  git('config user.name t')
  writeFileSync(join(repo, 'a.txt'), 'line1\n')
  git('add -A')
  git('commit -qm base')

  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec('CREATE TABLE workspace_run_change_files (id INTEGER, session_id TEXT, change_id TEXT, path TEXT, old_path TEXT, change_type TEXT, patch TEXT)')
  db.prepare('INSERT INTO workspace_run_change_files VALUES (1,?,?,?,?,?,?)').run('s1', 'chg1', 'a.txt', null, 'modified', HAND_PATCH)
  db.prepare('INSERT INTO workspace_run_change_files VALUES (2,?,?,?,?,?,?)').run('s1', 'chg1', 'b.bin', null, 'modified', null)
  db.close()
})

import router from '../run-undo'

describe('POST /api/ide/run-undo（反向 patch 真链路）', () => {
  it('无 patch 行 422；不存在行 404', async () => {
    const noPatch = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 2, workspace: repo } },
    })
    expect(noPatch.status).toBe(422)
    expect((noPatch.body as { detail: string }).detail).toContain('无 patch')
    const missing = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 99, workspace: repo } },
    })
    expect(missing.status).toBe(404)
  })

  it('modified 文件真反向应用：LINE1 → line1 恢复', async () => {
    writeFileSync(join(repo, 'a.txt'), 'LINE1\n') // 模拟 run 后状态
    const res = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 1, workspace: repo } },
    })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ ok: true, restoredPath: 'a.txt', changeType: 'modified' })
    expect(readFileSync(join(repo, 'a.txt'), 'utf8')).toBe('line1\n')
  })

  it('workspace 非绝对路径 400', async () => {
    const res = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 1, workspace: 'relative/path' } },
    })
    expect(res.status).toBe(400)
  })
})
