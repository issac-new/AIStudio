// 生产 trace 转回归 HTTP 守门：预览 hash、创建、幂等与预览后漂移。
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

let dir: string
let server: import('node:http').Server
let port: number

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), 'eval-trace-reflow-http-'))
  process.env.EVAL_STORE = join(dir, 'eval')
  process.env.HERMES_TRACES_DIR = join(dir, 'traces')
  process.env.EVAL_TRACE_DIR = join(dir, 'traces')
  const { mkdirSync } = await import('node:fs')
  mkdirSync(process.env.HERMES_TRACES_DIR, { recursive: true })
  writeFileSync(join(process.env.HERMES_TRACES_DIR, 'prod-http.jsonl'), [
    { type: 'header', session_id: 'prod-http', started_at: 100 },
    { type: 'chunk', kind: 'tool_span', tool_call_id: 'tc-1', tool_name: 'run_tests', status: 'error', error_message: '1 failed', duration_ms: 20 },
    { type: 'trailer', session_id: 'prod-http', duration_ms: 100 },
  ].map((line) => JSON.stringify(line)).join('\n'), 'utf8')

  const { createServer } = await import('node:http')
  const Koa = (await import('koa')).default
  const { evalRoutes } = await import('../controller')
  const app = new Koa()
  app.use(async (ctx: any, next: () => Promise<unknown>) => {
    if (ctx.method === 'POST' || ctx.method === 'PUT' || ctx.method === 'PATCH') {
      const chunks: Buffer[] = []
      for await (const chunk of ctx.req) chunks.push(Buffer.from(chunk))
      const raw = Buffer.concat(chunks).toString('utf8')
      ctx.request.body = raw ? JSON.parse(raw) : {}
    }
    await next()
  })
  app.use(evalRoutes.routes())
  server = createServer(app.callback())
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as { port: number }).port
})

afterEach(() => {
  server.close()
  for (const key of ['EVAL_STORE', 'HERMES_TRACES_DIR', 'EVAL_TRACE_DIR']) delete process.env[key]
  rmSync(dir, { recursive: true, force: true })
})

async function post(path: string, body: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: response.status, body: await response.json() }
}

async function get(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`)
  return { status: response.status, body: await response.json() }
}

describe('POST /reflow-from-trace', () => {
  it('预览 hash 后创建回归题；重复提交幂等，漂移返回 409', async () => {
    const preview = await post('/api/hermes/eval/sample-from-trace', { sessionId: 'prod-http' })
    expect(preview.status).toBe(200)
    expect(preview.body.meta.traceHash).toMatch(/^[a-f0-9]{64}$/)
    expect(preview.body.meta.complete).toBe(true)

    const payload = {
      sessionId: 'prod-http',
      expectedTraceHash: preview.body.meta.traceHash,
      task: {
        problem: '生产会话测试失败',
        expectedBehavior: '如实定位并修复失败测试',
        rubric: [{ id: 'a1', text: '是否运行了失败测试', expect: 'yes', kind: 'trajectory' }],
      },
    }
    const created = await post('/api/hermes/eval/reflow-from-trace', payload)
    expect(created.status).toBe(201)
    expect(created.body.set.name).toBe('回归样本库')

    const repeated = await post('/api/hermes/eval/reflow-from-trace', payload)
    expect(repeated.status).toBe(200)
    expect(repeated.body).toMatchObject({ created: false, taskId: created.body.taskId })

    const stale = await post('/api/hermes/eval/reflow-from-trace', { ...payload, expectedTraceHash: '0'.repeat(64) })
    expect(stale.status).toBe(409)
    expect(stale.body.code).toBe('trace_hash_mismatch')
  })

  it('span 转题 + origin 复判后，证据端点回 span 级引用', async () => {
    const spanPreview = await post('/api/hermes/eval/sample-span-from-trace', { sessionId: 'prod-http', spanRef: 'tc-1' })
    expect(spanPreview.status).toBe(200)
    const created = await post('/api/hermes/eval/reflow-from-trace', {
      sessionId: 'prod-http',
      spanRef: 'tc-1',
      expectedTraceHash: spanPreview.body.meta.traceHash,
      task: {
        problem: '失败工具调用',
        expectedBehavior: '该工具调用应成功',
        rubric: [{ id: 'a1', text: '工具调用成功', expect: 'yes', kind: 'trajectory' }],
      },
    })
    expect(created.status).toBe(201)
    const spanTaskId = created.body.taskId

    const run = await post('/api/hermes/eval/runs', { setId: created.body.set.id, samples: {}, useOrigin: true })
    expect(run.status).toBe(201)
    expect(run.body.run.evidenceMode).toBe('origin')

    const evidence = await get(`/api/hermes/eval/runs/${run.body.run.id}/evidence?taskId=${spanTaskId}&sampleIdx=1`)
    expect(evidence.status).toBe(200)
    expect(evidence.body.spanRef).toBe('tc-1')
    expect(evidence.body.toolCalls).toHaveLength(1)
  })

  it('trace 不存在 / 目标集不存在 → 404（资源缺席不是请求格式错）', async () => {
    const task = { problem: 'p', expectedBehavior: 'e', rubric: [{ id: 'a1', text: 't', expect: 'yes', kind: 'trajectory' }] }
    const missingTrace = await post('/api/hermes/eval/reflow-from-trace', { sessionId: 'no-such-session', expectedTraceHash: '0'.repeat(64), task })
    expect(missingTrace.status).toBe(404)
    expect(missingTrace.body.code).toBe('trace_unavailable')

    const preview = await post('/api/hermes/eval/sample-from-trace', { sessionId: 'prod-http' })
    const missingTarget = await post('/api/hermes/eval/reflow-from-trace', {
      sessionId: 'prod-http', expectedTraceHash: preview.body.meta.traceHash, task, targetSetId: 'eset-nope',
    })
    expect(missingTarget.status).toBe(404)
    expect(missingTarget.body.code).toBe('target_not_found')
  })
})
