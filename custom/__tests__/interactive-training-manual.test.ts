import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import type { Server } from 'node:http'
import { createTrainingServer } from '../../scripts/start-training-manual.mjs'

const root = resolve(import.meta.dirname, '../..')
const pagePath = resolve(root, 'docs/manuals/aistudio-interactive-training.html')
const launcherPath = resolve(root, 'scripts/start-training-manual.mjs')
const html = readFileSync(pagePath, 'utf8')
let server: Server | null = null

afterEach(async () => {
  if (!server) return
  await new Promise<void>(resolveClose => server!.close(() => resolveClose()))
  server = null
})

function courseData() {
  const start = html.indexOf('const PARTS =')
  const end = html.indexOf('\n\nconst $ =')
  expect(start).toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return new Function(`${html.slice(start, end)}; return { PARTS, SCENES }`)() as {
    PARTS: Array<{ id: string; name: string }>
    SCENES: Array<{
      id: string; part: string; focus: string; duration: number; proof: string
      nodes: Array<{ id: string }>
      edges: Array<{ from: string; to: string }>
    }>
  }
}

describe('AIStudio 交互培训课程契约', () => {
  it('四部分各 3 幕，场景、焦点和连线完整', () => {
    const { PARTS, SCENES } = courseData()
    expect(PARTS.map(part => part.name)).toEqual(['设计', '实现', '部署', '使用'])
    expect(SCENES).toHaveLength(12)
    expect(new Set(SCENES.map(scene => scene.id)).size).toBe(12)
    for (const part of PARTS) {
      expect(SCENES.filter(scene => scene.part === part.id)).toHaveLength(3)
    }
    for (const scene of SCENES) {
      const ids = new Set(scene.nodes.map(item => item.id))
      expect(ids.size).toBe(scene.nodes.length)
      expect(ids.has(scene.focus)).toBe(true)
      expect(scene.duration).toBeGreaterThanOrEqual(5000)
      expect(scene.proof.length).toBeGreaterThan(20)
      for (const link of scene.edges) {
        expect(ids.has(link.from)).toBe(true)
        expect(ids.has(link.to)).toBe(true)
      }
    }
  })

  it('离线 HTML 包含动效和无障碍契约', () => {
    expect(html).not.toContain('__PRETEXT_BUNDLE__')
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(html).toContain('transform-style: preserve-3d')
    expect(html).toContain('prefers-reduced-motion: reduce')
    expect(html).toContain('class="focus-ring"')
    expect(html).toContain('task-flight')
    expect(html).toContain('pauseAnimations')
    expect(html).toContain('培训模拟 · 不连接真实数据')
    expect(html).toContain('GOVERNANCE_REPO')
    expect(html).toContain('prepareDynamicText()')
    expect(html).toContain("typeof prepare !== 'function' || typeof layout !== 'function'")
  })

  it('使用五层拓扑、可选 Matrix 分支和证据回流', () => {
    expect(html).toContain('function initTopologyScene')
    expect(html).toContain('function renderTopology')
    expect(html).toContain('id="topologySvg"')
    expect(html).toContain('协作消息与平台回执（可选）')
    expect(html).toContain('任务真值与状态')
    expect(html).toContain('独立验证与证据库')
    expect(html).toContain('TOPO_FLOW_BY_SCENE')
  })

  it('横屏布局包含短导航、目录弹窗和无遮罩说明区', () => {
    expect(html).toContain('class="course-strip"')
    expect(html).toContain('id="partNav"')
    expect(html).toContain('id="courseDialog"')
    expect(html).not.toContain('id="guideLink"')
    expect(html).toContain('#focusLayer, #guideLink { display: none !important; }')
    expect(html).toContain('.stage-footer .spatial-focus')
    expect(html).toContain('grid-template-columns: 1.2fr 1.25fr 1.1fr 250px')
    expect(html).toContain('.coach-route { display: none; }')
  })

  it('12 幕映射到五层拓扑的 15 个协作步骤', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const { TOPO_LAYERS, TOPO_FLOWS, TOPO_FLOW_BY_SCENE, TOPO_ANCHORS } = new Function(`${html.slice(start, end)}; return { TOPO_LAYERS, TOPO_FLOWS, TOPO_FLOW_BY_SCENE, TOPO_ANCHORS }`)()
    expect(TOPO_LAYERS.map((layer: { label: string }) => layer.label)).toEqual(['治理层', '产品交互层', '协作运行层', '执行层', '能力与治理支撑层'])
    expect(TOPO_FLOWS.map((flow: { id: number }) => flow.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(TOPO_FLOW_BY_SCENE).toHaveLength(12)
    expect(TOPO_ANCHORS).toHaveLength(12)
    for (const flowIds of TOPO_FLOW_BY_SCENE) {
      expect(flowIds.length).toBeGreaterThan(0)
      for (const id of flowIds) expect(TOPO_FLOWS.some((flow: { id: number }) => flow.id === id)).toBe(true)
    }
  })

  it('拓扑使用 PC 横屏视口与独立文字层级', () => {
    expect(html).toContain('viewBox="0 0 1200 760"')
    expect(html).toContain('.topology-node-title { fill: #1c2b22; font-size: 20px;')
    expect(html).toContain('.topology-node-subtitle { fill: #65776a; font-size: 13px;')
    expect(html).toContain('.topology-active .scene-viewport::before { display: none; }')
    expect(html).toContain('.sim-stage, .scene-viewport { background: #f3f5f2; }')
  })

  it('四个模块使用不同拓扑而非只切换高亮', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const views = new Function(`${html.slice(start, end)}; return TOPO_VIEWS`)() as Record<string, { nodes: Array<{ id: string; title: string; sub: string }>; flows: Array<{ label: string }> }>
    expect(Object.keys(views)).toEqual(['design', 'implementation', 'deployment', 'usage'])
    const signatures = new Set(Object.values(views).map(view => view.nodes.map(node => node.id).join(',')))
    expect(signatures.size).toBe(4)
    expect(views.implementation.nodes.map(node => node.title).join(' ')).toContain('ready')
    expect(views.implementation.nodes.map(node => node.title).join(' ')).toContain('running')
    expect(views.implementation.nodes.map(node => node.title).join(' ')).toContain('done')
    expect(views.implementation.nodes.map(node => node.title).join(' ')).toContain('blocked')
    expect(views.implementation.flows.map(flow => flow.label).join(' ')).toContain('打回返工')
    expect(views.deployment.nodes.map(node => node.title).join(' ')).toContain(':8647')
    expect(views.deployment.nodes.map(node => node.title).join(' ')).toContain(':8650')
    expect(views.deployment.nodes.map(node => node.title).join(' ')).toContain('kanban')
    expect(views.deployment.nodes.map(node => node.title).join(' ')).toContain('worker')
    expect(views.deployment.flows.map(flow => flow.label).join(' ')).toContain('worker 认领')
    expect(views.usage.nodes.map(node => node.title).join(' ')).toContain('同卷复评')
    expect(views.usage.nodes.map(node => node.sub).join(' ')).toContain('满足判据才关闭')
  })

  it('手册同步当前整体版本、Eval 八页签与技能评估契约', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const manual = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')
    expect(manual).toContain(`适用版本：AIStudio ${pkg.version}`)
    for (const tab of ['评测集', '运行记录', '指标治理', '安全红队', 'UI Oracle', '优化建议', '数据飞轮', '技能评估']) {
      expect(manual).toContain(tab)
    }
    expect(manual).toContain('评估对象是 spec 第 19 节的测试设计')
    expect(manual).toContain('全部维度为 `yes` 才是 `PASS`')
    expect(manual).toContain('其余情况是 `CONDITIONAL`')
    expect(manual).toContain('五个运行时组件不等于五个独立发布包')
    expect(html).toContain('同一页面的“技能评估”检查 spec 第 19 节')
  })

  it('npm 与双击启动入口存在', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    expect(pkg.scripts.training).toBe('node scripts/start-training-manual.mjs')
    expect(statSync(resolve(root, 'docs/manuals/start-training.command')).mode & 0o111).not.toBe(0)
    expect(statSync(resolve(root, 'docs/manuals/start-training.bat')).isFile()).toBe(true)
    const help = spawnSync(process.execPath, [launcherPath, '--help'], { encoding: 'utf8' })
    expect(help.status).toBe(0)
    expect(help.stdout).toContain('--no-open')
  })
})

describe('培训页本地启动器', () => {
  it('仅绑定回环地址，放行培训文档并拒绝其他路径和方法', async () => {
    server = createTrainingServer()
    await new Promise<void>(resolveListen => server!.listen(0, '127.0.0.1', () => resolveListen()))
    const address = server.address()
    expect(address && typeof address !== 'string' ? address.address : '').toBe('127.0.0.1')
    const port = address && typeof address !== 'string' ? address.port : 0
    const base = `http://127.0.0.1:${port}`

    const home = await fetch(`${base}/?autoplay=0`)
    expect(home.status).toBe(200)
    expect(home.headers.get('content-type')).toContain('text/html')
    expect(home.headers.get('content-security-policy')).toContain("connect-src 'none'")
    expect(await home.text()).toContain('AIStudio 交互式培训手册')

    const manual = await fetch(`${base}/aistudio-training-and-user-guide.md`)
    expect(manual.status).toBe(200)
    expect(await manual.text()).toContain('# AIStudio 培训和使用手册')

    expect((await fetch(`${base}/package.json`)).status).toBe(404)
    expect((await fetch(`${base}/../package.json`)).status).toBe(404)
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${base}/`, { method: 'HEAD' })).status).toBe(200)
  })
})
