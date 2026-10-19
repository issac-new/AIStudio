// diagram Mermaid 品牌重绘测试（spec 项5）：
//   1. 品牌 token 绊线（brand-tokens.ts 与 swarmstudio.profile.md 逐值对账，禁双源漂移）
//   2. flowchart/sequence IR → 品牌 HTML（a11y 契约 + 品牌色 + 无远程引用）
//   3. 产出真跑 vendored self_check 通过（门禁吃自己的狗粮，真实工具链 §5.1）
//   4. 端点正反例（合法源/不支持图型如实回退/缺参 400）
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer } from 'node:http'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import Koa from 'koa'
import bodyParser from '@koa/bodyparser'
import type { AddressInfo } from 'node:net'
import { BRAND, hasCjk, textWidth } from '../brand-tokens'
import { renderBrandedHtml, type MermaidIrDiagram } from '../mermaid-branded'
import { runMermaidExtract } from '../mermaid-extract'
import { runSelfCheck } from '../self-check'
import { diagramRoutes } from '../diagram-controller'

const overlayRoot = resolve(__dirname, '..', '..', '..', '..')
const PROFILE = join(overlayRoot, 'assets', 'skills', 'diagram-design-brand', 'swarmstudio.profile.md')

const FLOWCHART: MermaidIrDiagram = {
  kind: 'flowchart',
  direction: 'LR',
  nodes: [
    { id: 'A', label: '用户请求', shape: 'rect', in_degree: 0, out_degree: 1 },
    { id: 'B', label: '鉴权网关', shape: 'rhombus', in_degree: 1, out_degree: 2 },
    { id: 'C', label: '订单服务', shape: 'rect', in_degree: 1, out_degree: 1 },
    { id: 'D', label: '401 页', shape: 'rect', in_degree: 1, out_degree: 0 },
    { id: 'E', label: '订单库', shape: 'cylinder', in_degree: 1, out_degree: 0 },
  ],
  edges: [
    { source: 'A', target: 'B', label: '', style: 'solid', order: 1 },
    { source: 'B', target: 'C', label: '通过', style: 'solid', order: 2 },
    { source: 'B', target: 'D', label: '拒绝', style: 'solid', order: 3 },
    { source: 'C', target: 'E', label: '', style: 'dashed', order: 4 },
  ],
}

const SEQUENCE: MermaidIrDiagram = {
  kind: 'sequenceDiagram',
  nodes: [
    { id: 'U', label: '用户', shape: 'lifeline' },
    { id: 'G', label: '网关', shape: 'lifeline' },
  ],
  edges: [
    { source: 'U', target: 'G', label: '登录请求', style: 'solid', order: 1 },
    { source: 'G', target: 'U', label: '令牌', style: 'dashed', order: 2 },
  ],
}

function parseProfileLight(): Map<string, string> {
  const md = readFileSync(PROFILE, 'utf8')
  const roles = new Map<string, string>()
  for (const line of md.split('\n')) {
    const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|\s*`([^`]+)`(?:\s*\([^)]*\))?\s*\|/i)
    if (m) roles.set(m[1], m[2])
  }
  return roles
}

describe('品牌 token 绊线（TS 镜像 vs profile 唯一事实源）', () => {
  it('light 列逐值一致', () => {
    const roles = parseProfileLight()
    const pairs: Array<[string, string]> = [
      ['paper', BRAND.paper], ['paper-2', BRAND.paper2], ['ink', BRAND.ink],
      ['muted', BRAND.muted], ['soft', BRAND.soft], ['rule', BRAND.rule],
      ['rule-solid', BRAND.ruleSolid], ['accent', BRAND.accent],
      ['accent-tint', BRAND.accentTint], ['link', BRAND.link],
    ]
    for (const [role, tsValue] of pairs) {
      expect(tsValue, `role ${role} 漂移`).toBe(roles.get(role))
    }
  })
})

describe('宽度预算', () => {
  it('CJK 1em / Latin 0.6em / 逐字符计量', () => {
    expect(hasCjk('请求项')).toBe(true)
    expect(hasCjk('abc')).toBe(false)
    // 「請求項 v2.1」= 3 全角 + 5 窄字符（style-guide 数script陷阱例）
    expect(textWidth('請求項 v2.1', 10)).toBeCloseTo((3 * 1 + 5 * 0.6) * 10, 5)
  })
})

describe('renderBrandedHtml', () => {
  it('flowchart：a11y 契约 + 品牌色 + 正交路径 + 无远程引用', () => {
    const r = renderBrandedHtml(FLOWCHART, '订单调用链')!
    expect(r.kind).toBe('flowchart')
    expect(r.html).toContain('role="img"')
    expect(r.html).toMatch(/aria-labelledby="dg\w+-title dg\w+-desc"/)
    expect(r.html).toContain(`stroke="${BRAND.ink}"`)
    expect(r.html).toContain(`background:${BRAND.paper}`)
    // 无远程引用（xmlns 是命名空间 URI 不是网络请求，self_check 同样放行）
    expect(r.html.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//)
    expect(r.html).not.toContain('<script')
    // 标签遮罩=paper 填充（连线硬规则：标签垫不透明遮罩）
    expect(r.html).toContain(`fill="${BRAND.paper}"/>`)
    // 无对角线：flowchart 边只允许 elbow（M/L/Q 命令），不允许裸斜线
    const paths = [...r.html.matchAll(/<path d="([^"]+)" fill="none" stroke/g)].map((m) => m[1])
    expect(paths.length).toBeGreaterThan(0)
    for (const d of paths) expect(d).not.toMatch(/L \S+ \S+ L \S+ \S+ L/)
  })

  it('sequence：生命线 + 实/虚线消息 + 标签遮罩', () => {
    const r = renderBrandedHtml(SEQUENCE, '登录时序')!
    expect(r.html).toContain('stroke-dasharray="6 4"')
    expect(r.html).toContain('登录请求')
    expect(r.html).toContain('role="img"')
  })

  it('不支持的图型返回 null（如实回退，不假装覆盖）', () => {
    expect(renderBrandedHtml({ kind: 'erDiagram', nodes: [], edges: [] })).toBeNull()
  })

  it('stateDiagram-v2：start/end 圆点 + 状态圆角框', () => {
    const r = renderBrandedHtml({
      kind: 'stateDiagram-v2',
      direction: 'TD',
      nodes: [
        { id: '__start_1', label: '[start]', shape: 'start', in_degree: 0, out_degree: 1 },
        { id: '待审', label: '待审', shape: 'state', in_degree: 1, out_degree: 1 },
        { id: '__end_1', label: '[end]', shape: 'end', in_degree: 1, out_degree: 0 },
      ],
      edges: [
        { source: '__start_1', target: '待审', label: '', style: 'solid', order: 1 },
        { source: '待审', target: '__end_1', label: '通过', style: 'solid', order: 2 },
      ],
    }, '审批状态机')!
    expect(r.kind).toBe('stateDiagram-v2')
    expect(r.html).toContain('<circle')
    expect(r.html).toContain('待审')
  })
})

describe('产出真跑 self_check（门禁吃自己的狗粮）', () => {
  let dir = ''
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'branded-html-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('flowchart 品牌 HTML 通过（含 --offline）', async () => {
    const file = join(dir, 'flow.html')
    writeFileSync(file, renderBrandedHtml(FLOWCHART, '订单调用链')!.html)
    const r = await runSelfCheck([file], { offline: true })
    expect(r.runnerError).toBeUndefined()
    expect(r.findings.map((f) => f.message)).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('sequence 品牌 HTML 通过（含 --offline）', async () => {
    const file = join(dir, 'seq.html')
    writeFileSync(file, renderBrandedHtml(SEQUENCE, '登录时序')!.html)
    const r = await runSelfCheck([file], { offline: true })
    expect(r.findings.map((f) => f.message)).toEqual([])
    expect(r.ok).toBe(true)
  })
})

describe('runMermaidExtract（真实 python3 提取器）', () => {
  it('flowchart 源 → IR kind/nodes/edges', async () => {
    const r = await runMermaidExtract('flowchart LR\n  A[甲] --> B[乙]\n')
    expect(r.runnerError).toBeUndefined()
    expect(r.ok).toBe(true)
    expect(r.kind).toBe('flowchart')
    expect(r.diagram!.nodes).toHaveLength(2)
    expect(r.diagram!.edges).toHaveLength(1)
  })

  it('空源/超长源如实拒绝', async () => {
    expect((await runMermaidExtract('  ')).ok).toBe(false)
    expect((await runMermaidExtract('x'.repeat(20_001))).ok).toBe(false)
  })
})

describe('POST /api/hermes/diagram/mermaid-brand', () => {
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
    const res = await fetch(`${base}/api/hermes/diagram/mermaid-brand`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }

  it('flowchart 源 → ok + 品牌 HTML', async () => {
    const { status, body } = await post({ source: 'flowchart LR\n  A[用户] --> B[服务]\n', title: '调用图' })
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.kind).toBe('flowchart')
    expect(body.html as string).toContain('role="img"')
    expect(body.html as string).toContain(BRAND.paper)
  })

  it('不支持的图型 → ok=false + unsupported_kind（客户端回退现状渲染）', async () => {
    const { body } = await post({ source: 'erDiagram\n  FOO ||--o{ BAR : has\n' })
    expect(body.ok).toBe(false)
    expect(body.reason).toBe('unsupported_kind')
  })

  it('缺 source → 400', async () => {
    expect((await post({})).status).toBe(400)
  })
})
