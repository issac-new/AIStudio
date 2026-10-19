// diagram 门禁测试（spec 项3）：真实 python3 self_check 过/败夹具 + 路径政策 + REST 端点。
// 真实工具链先行（§5.1）：不 mock self_check 语义，直接用 vendored 脚本跑。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'node:net'
import { assertDiagramPath, isPathWithin, parseSelfCheckOutput, runSelfCheck } from '../self-check'
import { diagramRoutes } from '../diagram-controller'

const PASS_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>t</title></head><body>
<svg role="img" aria-labelledby="arch-title arch-desc" viewBox="0 0 200 100" xmlns="http://www.w3.org/2000/svg">
<title id="arch-title">架构图</title>
<desc id="arch-desc">网关到服务的一次调用</desc>
<rect x="8" y="8" width="60" height="28" rx="6" fill="#fff" stroke="#1a1a1a"/>
<text x="20" y="26">网关</text>
<rect x="120" y="8" width="60" height="28" rx="6" fill="#fff" stroke="#1a1a1a"/>
<text x="132" y="26">服务</text>
<path d="M 68 22 L 120 22" stroke="#666666" fill="none"/>
</svg>
</body></html>
`

const FAIL_HTML = `<!doctype html><html><body>
<iframe src="https://evil.example"></iframe>
<svg role="img" aria-labelledby="evil-title evil-desc" viewBox="0 0 10 10" xmlns="http://www.w3.org/2000/svg"><title id="evil-title">t</title><desc id="evil-desc">d</desc></svg>
</body></html>
`

let root = ''
let hermesHome = ''
let passPath = ''
let failPath = ''
const prevHermesHome = process.env.HERMES_HOME

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'diagram-check-'))
  hermesHome = join(root, 'hermes')
  process.env.HERMES_HOME = hermesHome
  passPath = join(hermesHome, 'work', 'pass.html')
  failPath = join(hermesHome, 'work', 'fail.html')
  mkdirSync(join(hermesHome, 'work'), { recursive: true })
  writeFileSync(passPath, PASS_HTML)
  writeFileSync(failPath, FAIL_HTML)
})

afterAll(() => {
  if (prevHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = prevHermesHome
  // task-workspace-cache 后台 hermes CLI 可能正往 HERMES_HOME（=本夹具 root）写状态，
  // 与 rm 竞态报 ENOTEMPTY——重试窗口覆盖（maxRetries×retryDelay≈500ms）。
  rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})

describe('parseSelfCheckOutput', () => {
  it('OK/FAIL 行与明细行解析', () => {
    const out = parseSelfCheckOutput('OK /a.html\nFAIL /b.html\n  - <iframe> is not allowed in a diagram file\n  - remote reference on <iframe>: https://x\n', '')
    expect(out.files).toEqual([{ path: '/a.html', ok: true }, { path: '/b.html', ok: false }])
    expect(out.findings).toHaveLength(2)
    expect(out.findings[0]).toEqual({ file: '/b.html', message: '<iframe> is not allowed in a diagram file' })
  })
})

describe('isPathWithin', () => {
  it('前缀边界不误放（/a/b 不放行 /a/bc）', () => {
    expect(isPathWithin('/a/b/c', '/a/b')).toBe(true)
    expect(isPathWithin('/a/b', '/a/b')).toBe(true)
    expect(isPathWithin('/a/bc/x', '/a/b')).toBe(false)
    expect(isPathWithin('/etc/passwd', '/a/b')).toBe(false)
  })
})

describe('assertDiagramPath 路径政策', () => {
  it('hermes base 内 .html 放行；越界/非 html/缺失/相对路径拒绝', () => {
    expect(assertDiagramPath(passPath)).toBe(passPath)
    expect(() => assertDiagramPath('/etc/passwd.html')).toThrowError(/不在 hermes base/)
    expect(() => assertDiagramPath(join(hermesHome, 'x.txt'))).toThrowError(/只接受 .html/)
    expect(() => assertDiagramPath(join(hermesHome, 'missing.html'))).toThrowError(/不存在/)
    expect(() => assertDiagramPath('relative/pass.html')).toThrowError(/绝对路径/)
    expect(() => assertDiagramPath(undefined)).toThrowError(/必填/)
  })
})

describe('runSelfCheck（真实 python3 + vendored 脚本）', () => {
  it('通过夹具 ok=true', async () => {
    const r = await runSelfCheck([passPath])
    expect(r.runnerError).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.files).toEqual([{ path: passPath, ok: true }])
  })

  it('注入夹具 ok=false 且 findings 含 iframe 条款', async () => {
    const r = await runSelfCheck([failPath])
    expect(r.ok).toBe(false)
    expect(r.findings.some((f) => f.message.includes('<iframe> is not allowed'))).toBe(true)
    expect(r.findings.some((f) => f.message.includes('remote reference'))).toBe(true)
  })

  it('脚本缺失时 runnerError 如实标注（不错判为图失败）', async () => {
    const r = await runSelfCheck([passPath], { scriptPath: join(root, 'nope.py') })
    expect(r.ok).toBe(false)
    expect(r.runnerError).toContain('self_check.py 不在位')
  })
})

describe('POST /api/hermes/diagram/check', () => {
  let srv: ReturnType<typeof createServer>
  let base = ''

  beforeAll(async () => {
    const app = new Koa()
    app.use(bodyParser())
    app.use(diagramRoutes.routes())
    srv = createServer(app.callback())
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`
  })

  afterAll(() => new Promise<void>((r) => srv.close(() => r())))

  async function post(body: unknown) {
    const res = await fetch(`${base}/api/hermes/diagram/check`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }

  it('通过产物 → 200 ok=true', async () => {
    const { status, body } = await post({ path: passPath })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('注入产物 → 200 ok=false + findings', async () => {
    const { status, body } = await post({ path: failPath })
    expect(status).toBe(200)
    expect(body.ok).toBe(false)
    expect((body.findings as unknown[]).length).toBeGreaterThan(0)
  })

  it('越界 403 / 缺失 404 / 非 html 400 / 缺参 400', async () => {
    expect((await post({ path: '/etc/passwd.html' })).status).toBe(403)
    expect((await post({ path: join(hermesHome, 'missing.html') })).status).toBe(404)
    expect((await post({ path: join(hermesHome, 'x.txt') })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })
})
