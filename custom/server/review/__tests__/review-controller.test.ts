// /api/review REST 守门（S-F：行内评论 file 路径归一，拒路径穿越/绝对路径/控制字符）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { reviewRoutes } from '../review-controller'
import { loadReview, openReview } from '../review-store'

type Handler = (ctx: Record<string, unknown>) => Promise<void>

/** 从 @koa/router 的 layer 栈取裸 handler（不经 HTTP，直接喂 fake ctx）。 */
function handlerFor(method: string, path: string): Handler {
  const layers = (reviewRoutes as unknown as {
    stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
  }).stack
  const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
  if (!layer) throw new Error(`route not found: ${method} ${path}`)
  return layer.stack[layer.stack.length - 1] as Handler
}

function fakeCtx(params: Record<string, string>, body: Record<string, unknown>, state: Record<string, unknown> = {}) {
  return { params, request: { body }, query: {}, state, status: 200, body: undefined }
}

const comment = () => handlerFor('POST', '/:id/comments')
const body = { commentId: 'c1', file: 'src/a.ts', line: 42, body: 'x' }

let dir: string
let govDir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'review-api-'))
  govDir = mkdtempSync(join(tmpdir(), 'review-gov-api-'))
  process.env.HERMES_REVIEW_DIR = dir
  process.env.HERMES_REVIEW_GOV_DIR = govDir
  openReview({ reviewId: 'r1', domain: 'baseline' })
})
afterEach(() => {
  delete process.env.HERMES_REVIEW_DIR
  delete process.env.HERMES_REVIEW_GOV_DIR
  rmSync(dir, { recursive: true, force: true })
  rmSync(govDir, { recursive: true, force: true })
})

describe('file 路径归一（S-F：项目相对路径）', () => {
  it('./ 前缀/反斜杠/重复斜杠归一为项目相对路径', async () => {
    const cases: Array<[string, string]> = [
      ['./src/a.ts', 'src/a.ts'],
      ['src\\a.ts', 'src/a.ts'],
      ['src//a.ts', 'src/a.ts'],
    ]
    for (const [i, [input, expected]] of cases.entries()) {
      const ctx = fakeCtx({ id: 'r1' }, { ...body, commentId: `c${i}`, file: input })
      await comment()(ctx)
      expect(ctx.status).toBe(200)
      expect((ctx.body as { review: { comments: Array<{ file: string }> } }).review.comments[i].file).toBe(expected)
    }
  })

  it('拒 .. 段/绝对路径/盘符/控制字符（路径穿越与不可见字符）', async () => {
    const bad = [
      '../secret.ts',
      'src/../../etc/passwd',
      '/etc/passwd',
      'C:\\Windows\\system32',
      `src${String.fromCharCode(7)}a.ts`,
      `src${String.fromCharCode(0)}a.ts`,
    ]
    for (const file of bad) {
      const ctx = fakeCtx({ id: 'r1' }, { ...body, commentId: `c-${file}`, file })
      await comment()(ctx)
      expect(ctx.status, `应拒：${JSON.stringify(file)}`).toBe(400)
    }
    expect(loadReview('r1')?.comments).toEqual([])  // 违例未落账
  })

  it('评论 actor 取 ctx.state.user（与 approval 域 callerOf 同源）', async () => {
    const ctx = fakeCtx({ id: 'r1' }, body, { user: { id: 7, username: 'alice' } })
    await comment()(ctx)
    expect(loadReview('r1')?.comments[0].actor).toBe('alice')
  })
})

describe('关联评审治理案例时的 approve 闸门', () => {
  it('案例未就绪返回 409；补齐人工审批与检查绿后放行', async () => {
    const { openCase, saveCase, loadCase } = await import('../../reviewgov/store')
    const { addApproval } = await import('../../reviewgov/convergence')
    const { loadReviewPolicy } = await import('../../reviewgov/policy-config')
    const policy = loadReviewPolicy()
    openCase({
      caseId: 'gov-1', title: '文档改动', headCommit: 'c1', changedPaths: ['docs/a.md'],
    }, policy)
    openReview({ reviewId: 'r-gov', domain: 'baseline', caseId: 'gov-1' })

    const verdict = handlerFor('POST', '/:id/verdict')
    const first = fakeCtx({ id: 'r-gov' }, { verdict: 'approve' })
    await verdict(first)
    expect(first.status).toBe(409)
    expect((first.body as { code: string }).code).toBe('case_not_ready')

    const approved = addApproval(loadCase('gov-1')!, {
      actor: 'alice', actorKind: 'human', decision: 'approve', commit: 'c1',
    })
    saveCase({ ...approved, checks: 'green' })

    const ok = fakeCtx({ id: 'r-gov' }, { verdict: 'approve' })
    await verdict(ok)
    expect(ok.status).toBe(200)
  })

  it('案例不存在时拒绝 approve（不静默放行）', async () => {
    openReview({ reviewId: 'r-missing', domain: 'baseline', caseId: 'nope' })
    const verdict = handlerFor('POST', '/:id/verdict')
    const res = fakeCtx({ id: 'r-missing' }, { verdict: 'approve' })
    await verdict(res)
    expect(res.status).toBe(409)
    expect((res.body as { code: string }).code).toBe('case_not_found')
  })
})
