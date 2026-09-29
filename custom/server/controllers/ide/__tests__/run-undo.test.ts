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

// 双 hunk patch（带上下文行，贴近真实存储形态）：验证 hunkIndexes 只反向选中块
const TWO_HUNK_PATCH = [
  'diff --git a/c.txt b/c.txt',
  '--- a/c.txt',
  '+++ b/c.txt',
  '@@ -1,3 +1,3 @@',
  ' l1',
  '-l2',
  '+L2',
  ' l3',
  '@@ -5,3 +5,3 @@',
  ' l5',
  '-l6',
  '+L6',
  ' l7',
  '',
].join('\n')

beforeAll(() => {
  mkdirSync(repo)
  git('init -q')
  git('config user.email t@t')
  git('config user.name t')
  writeFileSync(join(repo, 'a.txt'), 'line1\n')
  writeFileSync(join(repo, 'c.txt'), 'l1\nl2\nl3\nl4\nl5\nl6\nl7\n')
  git('add -A')
  git('commit -qm base')

  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(dbFile)
  db.exec('CREATE TABLE workspace_run_change_files (id INTEGER, session_id TEXT, change_id TEXT, path TEXT, old_path TEXT, change_type TEXT, patch TEXT)')
  db.prepare('INSERT INTO workspace_run_change_files VALUES (1,?,?,?,?,?,?)').run('s1', 'chg1', 'a.txt', null, 'modified', HAND_PATCH)
  db.prepare('INSERT INTO workspace_run_change_files VALUES (2,?,?,?,?,?,?)').run('s1', 'chg1', 'b.bin', null, 'modified', null)
  db.prepare('INSERT INTO workspace_run_change_files VALUES (3,?,?,?,?,?,?)').run('s1', 'chg1', 'c.txt', null, 'modified', TWO_HUNK_PATCH)
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

  it('hunkIndexes=[0]：只反向第一块，第二块保留', async () => {
    writeFileSync(join(repo, 'c.txt'), 'l1\nL2\nl3\nl4\nl5\nL6\nl7\n') // run 后状态
    const res = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 3, workspace: repo, hunkIndexes: [0] } },
    })
    expect(res.status).toBe(200)
    expect(readFileSync(join(repo, 'c.txt'), 'utf8')).toBe('l1\nl2\nl3\nl4\nl5\nL6\nl7\n')
  })

  it('hunkIndexes=[0,1]：整文件恢复', async () => {
    writeFileSync(join(repo, 'c.txt'), 'l1\nL2\nl3\nl4\nl5\nL6\nl7\n') // 重置 run 后状态（上一用例已反向 hunk0）
    const res = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 3, workspace: repo, hunkIndexes: [0, 1] } },
    })
    expect(res.status).toBe(200)
    expect(readFileSync(join(repo, 'c.txt'), 'utf8')).toBe('l1\nl2\nl3\nl4\nl5\nl6\nl7\n')
  })

  it('hunkIndexes 空数组 400；越界序号 422', async () => {
    const empty = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 3, workspace: repo, hunkIndexes: [] } },
    })
    expect(empty.status).toBe(400)
    const oob = await run(router as unknown as Router, {
      request: { body: { sessionId: 's1', changeId: 'chg1', fileId: 3, workspace: repo, hunkIndexes: [9] } },
    })
    expect(oob.status).toBe(422)
  })
})

// filterPatchHunks 纯函数直测：序号约定（@@ 次序 0 起）与客户端 parseHunks 对齐
import { filterPatchHunks } from '../run-undo'

describe('filterPatchHunks', () => {
  it('保头+选中块；空集合返空串', () => {
    const one = filterPatchHunks(TWO_HUNK_PATCH, new Set([1]))
    expect(one).toContain('diff --git a/c.txt b/c.txt')
    expect(one).toContain('@@ -5,3 +5,3 @@')
    expect(one).not.toContain('@@ -1,3 +1,3 @@')
    expect(filterPatchHunks(TWO_HUNK_PATCH, new Set())).toBe('')
  })
})
