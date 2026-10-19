// diagram PNG 导出测试（spec 项4）：真实 playwright 导出落盘 + 端点正反例。
// 真实工具链先行（§5.1）：不 mock 浏览器；宿主无浏览器时 runnerError 语义另测。
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'node:net'
import { defaultOutPath, runExportPng } from '../export-png'
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

const NO_SVG_HTML = '<!doctype html><html><body><p>没有图</p></body></html>'

function pngSize(path: string): { w: number; h: number } {
  const data = readFileSync(path)
  if (data.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('不是 PNG')
  return { w: data.readUInt32BE(16), h: data.readUInt32BE(20) }
}

let root = ''
let hermesHome = ''
let fixture = ''
let noSvg = ''
const prevHermesHome = process.env.HERMES_HOME

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'diagram-export-'))
  hermesHome = join(root, 'hermes')
  process.env.HERMES_HOME = hermesHome
  mkdirSync(join(hermesHome, 'work'), { recursive: true })
  fixture = join(hermesHome, 'work', 'arch.html')
  noSvg = join(hermesHome, 'work', 'nosvg.html')
  writeFileSync(fixture, PASS_HTML)
  writeFileSync(noSvg, NO_SVG_HTML)
})

afterAll(() => {
  if (prevHermesHome === undefined) delete process.env.HERMES_HOME
  else process.env.HERMES_HOME = prevHermesHome
  rmSync(root, { recursive: true, force: true })
})

describe('runExportPng（真实 playwright）', () => {
  it('viewBox 200x100 × scale 2 → PNG 400x200 落盘', async () => {
    const r = await runExportPng(fixture, { scale: 2 })
    expect(r.runnerError, r.runnerError).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.out).toBe(defaultOutPath(fixture))
    const { w, h } = pngSize(r.out!)
    expect([w, h]).toEqual([400, 200])
  }, 90_000)

  it('无 SVG 的 HTML 如实失败（不产出假 PNG）', async () => {
    const r = await runExportPng(noSvg, { scale: 1 })
    expect(r.ok).toBe(false)
    expect(r.runnerError).toContain('没有 SVG')
  }, 90_000)

  it('scale 越界 → 参数语义失败', async () => {
    const r = await runExportPng(fixture, { scale: 9 })
    expect(r.ok).toBe(false)
    expect(r.runnerError).toContain('1–4')
  })
})

describe('POST /api/hermes/diagram/export-png', () => {
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
    const res = await fetch(`${base}/api/hermes/diagram/export-png`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }

  it('合法产物 → ok=true + out 落盘', async () => {
    const { status, body } = await post({ path: fixture, scale: 1 })
    expect(status).toBe(200)
    if (body.runnerError) throw new Error(`runnerError: ${body.runnerError}`)
    expect(body.ok).toBe(true)
    expect(existsSync(body.out as string)).toBe(true)
  }, 90_000)

  it('scale 非法 400 / 越界 403 / 缺失 404', async () => {
    expect((await post({ path: fixture, scale: 0 })).status).toBe(400)
    expect((await post({ path: '/etc/x.html' })).status).toBe(403)
    expect((await post({ path: join(hermesHome, 'missing.html') })).status).toBe(404)
  })
})
