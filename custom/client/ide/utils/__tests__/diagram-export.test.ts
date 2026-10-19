// diagram-export 测试（spec 项6）：纯函数品牌导出 + 三方 token 绊线 + 产出真跑 self_check。
import { describe, expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { CLIENT_BRAND, exportFlowDiagramHtml } from '../diagram-export'
import { BRAND as SERVER_BRAND } from '../../../../server/diagram/brand-tokens'

const execFileAsync = promisify(execFile)
const overlayRoot = resolve(__dirname, '..', '..', '..', '..', '..')
const PROFILE = join(overlayRoot, 'assets', 'skills', 'diagram-design-brand', 'swarmstudio.profile.md')
const SELF_CHECK = join(overlayRoot, 'assets', 'skills', 'diagram-design', 'scripts', 'self_check.py')

const NODES = [
  { id: 'a', label: '派发', sublabel: 'dispatch · done · 1.2s', status: undefined as undefined, x: 0, y: 0 },
  { id: 'b', label: '实现', sublabel: 'devimpl · running', status: 'running' as const, x: 240, y: 0 },
  { id: 'c', label: '评审', sublabel: 'review · failed', status: 'failed' as const, x: 480, y: 0 },
]
const EDGES = [
  { from: 'a', to: 'b', strong: true },
  { from: 'b', to: 'c', label: '×3', dashed: true },
  { from: 'c', to: 'b' }, // 回边（目标在源左侧）
]

describe('三方 token 绊线（client 副本 = server 镜像 = profile 唯一事实源）', () => {
  it('CLIENT_BRAND 与 server BRAND 逐值一致', () => {
    for (const key of ['paper', 'paper2', 'ink', 'muted', 'soft', 'ruleSolid', 'accent', 'link'] as const) {
      expect(CLIENT_BRAND[key], `key ${key}`).toBe(SERVER_BRAND[key])
    }
  })

  it('error 色锚定 status-colors.ts 语义（#c62828）', () => {
    expect(CLIENT_BRAND.error).toBe('#c62828')
  })
})

describe('exportFlowDiagramHtml', () => {
  const html = exportFlowDiagramHtml(NODES, EDGES, { title: '执行图' })

  it('a11y 契约 + viewBox + 品牌 token', () => {
    expect(html).toContain('role="img"')
    expect(html).toMatch(/aria-labelledby="fx\w+-title fx\w+-desc"/)
    expect(html).toContain('<desc id=')
    expect(html).toMatch(/viewBox="0 0 \d+ \d+"/)
    expect(html).toContain(CLIENT_BRAND.ink)
    expect(html).toContain(CLIENT_BRAND.paper)
    expect(html).not.toContain('<script')
    expect(html.replaceAll('http://www.w3.org/2000/svg', '')).not.toMatch(/https?:\/\//)
  })

  it('failed 节点 error 描边 + running 虚线 + 标签遮罩', () => {
    expect(html).toContain(`stroke="${CLIENT_BRAND.error}"`)
    expect(html).toContain('stroke-dasharray="6 4"')
    expect(html).toContain(`fill="${CLIENT_BRAND.paper}"/>`)
    expect(html).toContain('×3')
  })

  it('回边走底部绕行（不穿过节点行）', () => {
    // 回边路径应含向下的 L 分量（y 增大），非水平直连
    const paths = [...html.matchAll(/<path d="([^"]+)" fill="none"/g)].map((m) => m[1])
    expect(paths.length).toBe(3)
    const back = paths[2]
    expect(back).toMatch(/L \d+ \d{3,}/)
  })

  it('空节点如实抛错', () => {
    expect(() => exportFlowDiagramHtml([], [])).toThrowError(/至少一个节点/)
  })

  it('warning 节点琥珀描边 + invalid 边 error 描边加粗（D-10 如实入图）', () => {
    const html = exportFlowDiagramHtml(
      [
        { id: 'a', label: '审单', sublabel: 'gate · warning', status: 'warning', x: 0, y: 0 },
        { id: 'b', label: '放行', x: 240, y: 0 },
      ],
      [{ from: 'a', to: 'b', invalid: true, label: '非法' }],
      { title: '草稿' },
    )
    expect(html).toContain(`stroke="${CLIENT_BRAND.warning}"`)
    expect(html).toContain(`stroke="${CLIENT_BRAND.error}"`)
    expect(html).toContain('stroke-width="1.6"')
  })

  it('warning 色锚定 status-colors.ts 语义（#f57f17）', () => {
    expect(CLIENT_BRAND.warning).toBe('#f57f17')
  })
})

describe('产出真跑 self_check（真实工具链，--offline）', () => {
  it('品牌导出 HTML 通过机械门禁', async () => {
    expect(existsSync(SELF_CHECK)).toBe(true)
    const dir = mkdtempSync(join(tmpdir(), 'flow-export-'))
    const file = join(dir, 'export.html')
    writeFileSync(file, exportFlowDiagramHtml(NODES, EDGES, { title: '执行图' }))
    try {
      const { stdout } = await execFileAsync('python3', [SELF_CHECK, '--offline', file])
      expect(stdout.trim()).toBe(`OK ${file}`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('profile 唯一事实源联动', () => {
  it('CLIENT_BRAND 与 profile light 列一致（三方闭环）', () => {
    const md = readFileSync(PROFILE, 'utf8')
    const roles = new Map<string, string>()
    for (const line of md.split('\n')) {
      const m = line.match(/^\|\s*`([a-z0-9-]+)`\s*\|[^|]*\|\s*`([^`]+)`(?:\s*\([^)]*\))?\s*\|/i)
      if (m) roles.set(m[1], m[2])
    }
    for (const [key, role] of [
      ['paper', 'paper'], ['paper2', 'paper-2'], ['ink', 'ink'], ['muted', 'muted'],
      ['soft', 'soft'], ['ruleSolid', 'rule-solid'], ['accent', 'accent'], ['link', 'link'],
    ] as const) {
      expect(CLIENT_BRAND[key], `role ${role}`).toBe(roles.get(role))
    }
  })
})
