import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
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
      inputs: string[]
      steps: string[]
      stepGuide: Array<{ nodeId: string; flowIds: number[]; deliverable: number; check: number; pitfall: number }>
      example: { title: string; given: string; when: string; then: string; code?: { label: string; content: string } }
      deliverables: string[]
      checks: string[]
      pitfalls: string[]
      references: Array<{ label: string; href: string }>
    }>
  }
}

describe('AIStudio 交互培训课程契约', () => {
  it('六团队各 2 幕，场景、焦点和连线完整', () => {
    const { PARTS, SCENES } = courseData()
    expect(PARTS.map(part => part.name)).toEqual(['产品需求分析', '项目管理', '研发', '测试', '运维监控', '安全合规及审计内控'])
    expect(SCENES).toHaveLength(12)
    expect(new Set(SCENES.map(scene => scene.id)).size).toBe(12)
    for (const part of PARTS) {
      expect(SCENES.filter(scene => scene.part === part.id)).toHaveLength(2)
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

  it('每幕都有可执行教案和不同实例，而不是只有摘要壳', () => {
    const { SCENES } = courseData()
    const allowedReferences = new Set([
      '/aistudio-training-and-user-guide.md',
      '/aistudio-feature-inventory.md',
      '/aistudio-operations-reference.md',
      '/aistudio-design-document-guide.md',
      '/aistudio-design-document-index.md',
      '/aistudio-run25-simulation-case.md',
      '/aistudio-swarm-yuan-developer-guide.md',
    ])
    const stepSignatures = new Set<string>()
    const exampleSignatures = new Set<string>()
    for (const scene of SCENES) {
      expect(scene.inputs.length, scene.id).toBeGreaterThanOrEqual(2)
      expect(scene.steps.length, scene.id).toBeGreaterThanOrEqual(4)
      expect(scene.deliverables.length, scene.id).toBeGreaterThanOrEqual(3)
      expect(scene.checks.length, scene.id).toBeGreaterThanOrEqual(2)
      expect(scene.pitfalls.length, scene.id).toBeGreaterThanOrEqual(2)
      expect(scene.references.length, scene.id).toBeGreaterThan(0)
      for (const text of [...scene.steps, scene.example.given, scene.example.when, scene.example.then]) {
        expect(text.length, scene.id).toBeGreaterThan(10)
      }
      for (const reference of scene.references) expect(allowedReferences.has(reference.href)).toBe(true)
      stepSignatures.add(scene.steps.join('\n'))
      exampleSignatures.add(`${scene.example.given}\n${scene.example.when}\n${scene.example.then}`)
    }
    expect(stepSignatures.size).toBe(12)
    expect(exampleSignatures.size).toBe(12)
  })

  it('离线 HTML 使用 A4 横屏与 SVG 动效，不再携带旧 3D 或 Pretext', () => {
    expect(html).not.toContain('__PRETEXT_BUNDLE__')
    expect(html).not.toMatch(/<script[^>]+src=/i)
    expect(html).not.toMatch(/<link[^>]+href=["']https?:/i)
    expect(html).toContain('@page { size: A4 landscape; margin: 0; }')
    expect(html).toContain('width: 297mm; height: 210mm')
    expect(html).toContain('prefers-reduced-motion: reduce')
    expect(html).toContain('pauseAnimations')
    expect(html).toContain('培训模拟 · 不连接真实数据')
    expect(html).toContain('GOVERNANCE_REPO')
    expect(html).toContain('function renderCoach')
    expect(html).not.toContain('webglCanvas')
    expect(html).not.toContain('prepareDynamicText')
    expect(html).not.toContain('transform-style: preserve-3d')
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

  it('纸张右上角承载导航，三类信息节点在图内同步流转', () => {
    for (const removed of ['<header class="app-header">', '<nav class="course-strip"', '<div class="course-toolbar">', '<div class="course-controls">', 'completionDialog', 'printCompletionButton', 'replayButton']) {
      expect(html).not.toContain(removed)
    }
    const actions = html.match(/<div class="stage-actions"[\s\S]*?<\/div>/)?.[0] ?? ''
    for (const id of ['prevButton', 'playButton', 'nextButton', 'speedButton', 'courseMenuButton', 'helpButton']) {
      expect(actions).toContain(`id="${id}"`)
    }
    expect(html).toContain('id="partNav"')
    expect(html).toContain('<nav class="page-side" aria-label="课程导航目录">')
    expect(html).toContain('id="directoryTeams" role="group"')
    expect(html).toContain('id="directoryScenes" role="group"')
    expect(html).toContain('data-directory-scene')
    expect(html).toContain('id="courseDialog"')
    expect(html).toContain('function renderCoach')
    expect(html).toContain('function renderStep')
    expect(html).toContain('function goToStep')
    expect(html).toContain('function advanceStep')
    expect(html).toContain('const atCourseEnd = current === SCENES.length - 1 && atSceneEnd')
    expect(html).toContain("$('nextStepButton').disabled = atCourseEnd")
    expect(html).toContain('let stepIndex = 0')
    expect(html).toContain('id="stepDots"')
    expect(html).toContain('data-guide-step')
    expect(html).toContain('id="coachInputs"')
    expect(html).toContain('id="coachSteps"')
    expect(html).toContain('id="exampleGiven"')
    expect(html).toContain('id="exampleWhen"')
    expect(html).toContain('id="exampleThen"')
    expect(html).toContain('id="exampleToggle"')
    expect(html).toContain('id="codeToggle"')
    expect(html).toContain('aria-controls="exampleDetail"')
    expect(html).toContain('id="coachMore"')
    expect(html).toContain('id="coachDeliverables"')
    expect(html).toContain('id="coachPitfalls"')
    expect(html).toContain('id="coachReferences"')
    expect(html).toContain('class="a4-page"')
    const stageStart = html.indexOf('<section class="topology-panel" id="simStage"')
    const stageEnd = html.indexOf('\n        </div>\n      </article>', stageStart)
    expect(stageStart).toBeGreaterThan(-1)
    expect(stageEnd).toBeGreaterThan(stageStart)
    const stage = html.slice(stageStart, stageEnd)
    const appMarkup = html.slice(html.indexOf('<div id="appRoot">'), html.indexOf('<div id="printRoot"'))
    expect(appMarkup).not.toContain('class="page-footer"')
    expect(appMarkup).not.toContain('id="spatialFocus"')
    expect(appMarkup).not.toContain('class="panel-head"')
    expect(html).toContain('chip.textContent = `${label.id} · ${label.label}`')
    for (const marker of ['class="lesson-steps flow-card"', 'class="lesson-example flow-card"', 'class="lesson-more" id="coachMore"', 'class="topology-flow-deck"', 'class="flow-cards"']) {
      expect(stage).toContain(marker)
    }
    expect(html).toContain('grid-template-rows: 26mm 165mm')
    expect(html).toContain('grid-template-columns: minmax(0, 1fr) 68mm')
    expect(html).toContain('#appRoot .topology-panel { display: grid; grid-template-rows: 165mm; }')
    expect(html).toContain('grid-template-columns: 1.15fr 1fr 1.2fr .75fr')
    expect(html).toContain('.lesson-more-grid')
    expect(html).toContain('section class="lesson-more" id="coachMore"')
    expect(html).toContain('break-after: page')
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('#printRoot .lesson-main { display: grid; grid-template-columns: 112mm 82mm 75mm; }')
    expect(html).not.toContain('<details')
  })

  it('12 幕映射到五层拓扑的 15 个协作步骤', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const { TOPO_LAYERS, TOPO_FLOWS, TOPO_FLOW_BY_SCENE, TOPO_ANCHORS } = new Function(`${html.slice(start, end)}; return { TOPO_LAYERS, TOPO_FLOWS, TOPO_FLOW_BY_SCENE, TOPO_ANCHORS }`)()
    expect(TOPO_LAYERS.map((layer: { label: string }) => layer.label)).toEqual(['治理层', '产品交互层', '协作运行层', '执行层', '能力与治理支撑层'])
    expect(TOPO_FLOWS.map((flow: { id: number }) => flow.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(TOPO_FLOW_BY_SCENE).toHaveLength(12)
    expect(TOPO_FLOW_BY_SCENE[0]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(TOPO_ANCHORS).toHaveLength(12)
    for (const flowIds of TOPO_FLOW_BY_SCENE) {
      expect(flowIds.length).toBeGreaterThan(0)
      for (const id of flowIds) expect(TOPO_FLOWS.some((flow: { id: number }) => flow.id === id)).toBe(true)
    }
  })

  it('每幕步骤映射真实流线并覆盖整幕路径，节点与亮线实际相连', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const views = new Function(`${html.slice(start, end)}; return TOPO_VIEWS`)() as Record<string, { nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>; flows: Array<{ id: number; path: string }>; flowByScene: number[][] }>
    const { SCENES } = courseData()
    SCENES.forEach((scene, index) => {
      expect(scene.stepGuide, scene.id).toHaveLength(scene.steps.length)
      const sceneFlows = views[scene.part].flowByScene[index]
      const validFlows = new Set(sceneFlows)
      const validNodes = new Set(views[scene.part].nodes.map(node => node.id))
      const coveredFlows = new Set<number>()
      const view = views[scene.part]
      for (const guide of scene.stepGuide) {
        expect(validNodes.has(guide.nodeId), `${scene.id} node ${guide.nodeId}`).toBe(true)
        expect(guide.flowIds.length, scene.id).toBeGreaterThan(0)
        for (const id of guide.flowIds) {
          expect(validFlows.has(id), `${scene.id} flow ${id}`).toBe(true)
          coveredFlows.add(id)
        }
        const node = view.nodes.find(item => item.id === guide.nodeId)!
        const connected = guide.flowIds.some(id => {
          const flow = view.flows.find(item => item.id === id)!
          const points = [...flow.path.matchAll(/[ML]([\d.]+)\s+([\d.]+)/g)].map(match => ({ x: Number(match[1]), y: Number(match[2]) }))
          return [points[0], points.at(-1)].some(point => point.x >= node.x - 4 && point.x <= node.x + node.w + 4 && point.y >= node.y - 4 && point.y <= node.y + node.h + 4)
        })
        expect(connected, `${scene.id} step node ${guide.nodeId} must touch an active flow`).toBe(true)
        expect(guide.deliverable).toBeGreaterThanOrEqual(0)
        expect(guide.deliverable).toBeLessThan(scene.deliverables.length)
        expect(guide.check).toBeGreaterThanOrEqual(0)
        expect(guide.check).toBeLessThan(scene.checks.length)
        expect(guide.pitfall).toBeGreaterThanOrEqual(0)
        expect(guide.pitfall).toBeLessThan(scene.pitfalls.length)
      }
      expect([...coveredFlows].sort((a, b) => a - b), scene.id).toEqual([...sceneFlows].sort((a, b) => a - b))
    })
  })

  it('拓扑使用固定 SVG 视口、可读文字层级与 A4 安全区', () => {
    expect(html).toContain('viewBox="0 0 1200 720"')
    expect(html).toContain('.topology-node-title { fill: #1c2b22; font-size: 21px;')
    expect(html).toContain('.topology-node-subtitle { fill: #65776a; font-size: 14px;')
    expect(html).toContain('grid-template-rows: 26mm 165mm')
    expect(html).toContain('grid-template-columns: 1.15fr 1fr 1.2fr .75fr')
    expect(html).toContain('grid-template-columns: minmax(0, 1fr) 68mm')
    expect(html).toContain('stepNodeId = null')
    expect(html).toContain('#printRoot .a4-page { grid-template-rows: 30mm 96mm 62mm; }')
    expect(html).toContain('padding: 8mm')
    expect(html).toContain('Math.min(1.35')
    expect(html).toContain('return defs + layers + flowLines + nodes + flowLabels + pulses')
    expect(html).toContain('#appRoot, dialog, .skip-link { display: none !important; }')
    expect(html).not.toContain('availableHeight')
  })

  it('六团队使用不同拓扑，且每幕激活流与跟练节点一致', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const views = new Function(`${html.slice(start, end)}; return TOPO_VIEWS`)() as Record<string, {
      nodes: Array<{ id: string; title: string; sub: string }>
      flows: Array<{ label: string }>
      flowByScene: number[][]
      activeNode: string[]
    }>
    const { SCENES } = courseData()
    expect(Object.keys(views)).toEqual(['product', 'project', 'development', 'testing', 'operations', 'audit'])
    const signatures = new Set(Object.values(views).map(view => view.nodes.map(node => node.id).join(',')))
    expect(signatures.size).toBe(6)
    for (const [part, view] of Object.entries(views)) {
      const sceneIndexes = SCENES.map((scene, index) => ({ scene, index })).filter(item => item.scene.part === part).map(item => item.index)
      expect(sceneIndexes).toHaveLength(2)
      const nodeIds = new Set(view.nodes.map(node => node.id))
      for (const index of sceneIndexes) {
        expect(view.flowByScene[index].length, `${part} scene ${index}`).toBeGreaterThan(0)
        expect(view.activeNode[index]).toBe(SCENES[index].focus)
        expect(nodeIds.has(view.activeNode[index])).toBe(true)
      }
    }
    expect(views.development.nodes.map(node => node.title).join(' ')).toContain('swarm-yuan')
    expect(views.development.nodes.map(node => node.title).join(' ')).toContain('<项目>-dev')
    expect(views.development.nodes.map(node => node.title).join(' ')).toContain('ACP')
    expect(views.development.nodes.map(node => node.title).join(' ')).toContain('Ycode')
    expect(views.development.flows.map(flow => flow.label).join(' ')).toContain('技能准备先于 ACP')
    expect(views.development.flows.map(flow => flow.label).join(' ')).toContain('本次实际读取技能')
    expect(views.project.flows.map(flow => flow.label).join(' ')).toContain('催办只返回路由，未发消息')
    expect(views.operations.nodes.map(node => node.title).join(' ')).toContain(':8647')
    expect(views.operations.nodes.map(node => node.title).join(' ')).toContain(':8649')
    expect(views.operations.nodes.map(node => node.title).join(' ')).toContain(':8650')
    expect(views.operations.nodes.map(node => node.title).join(' ')).toContain(':3030')
    expect(views.testing.nodes.map(node => node.title).join(' ')).toContain('同卷复评')
    expect(views.testing.nodes.map(node => node.sub).join(' ')).toContain('满足判据才关闭')
    expect(views.audit.flows.map(flow => flow.label).join(' ')).toContain('非主张人独立验证')
    expect(views.audit.flows.map(flow => flow.label).join(' ')).toContain('整改后独立复验')
  })

  it('角色手册同步当前整体版本、Eval 八页签与技能评估契约', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
    const manual = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')
    const feature = readFileSync(resolve(root, 'docs/manuals/aistudio-feature-inventory.md'), 'utf8')
    expect(manual).toContain(`适用版本：AIStudio ${pkg.version}`)
    for (const tab of ['评测集', '运行记录', '指标治理', '安全红队', 'UI Oracle', '优化建议', '数据飞轮', '技能评估']) {
      expect(feature).toContain(tab)
    }
    expect(manual).toContain('技能评估位于第八页签，检查 spec 第 19 节')
    expect(manual).toContain('全部维度为 `yes` 才是 `PASS`')
    expect(manual).toContain('其余为 `CONDITIONAL`')
    expect(html).toContain('同一页面的“技能评估”检查 spec 第 19 节')
  })

  it('六团队手册覆盖独立交付主线、实现边界和所有参考材料', () => {
    const manual = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')
    const feature = readFileSync(resolve(root, 'docs/manuals/aistudio-feature-inventory.md'), 'utf8')
    expect(feature).toContain('默认内容路由 | **79**')
    expect(feature).toContain('IDE 辅助栏页签 | **23**')
    for (const text of [
      '## 2. 产品需求分析团队：怎样形成可执行的 Spec 与设计',
      '## 4. 研发团队核心技能：用 swarm-yuan 约束真实交付',
      '## 8. 项目管理团队：怎样开工、派工与配置容量',
      '## 10. 项目管理团队：怎样使用 G1-G6 质量门',
      '## 13. 运维监控团队：怎样部署、观测、恢复与发布',
      '## 14. 安全合规及审计内控团队：怎样独立核验',
      'SIM 则按步 20 G5、步 21 UAT 执行',
      '没有实际发送 Matrix 或外部消息',
      '不是逐 AC 三态编辑台账',
      '系统存在 verdict 不自动证明独立评审',
      'HUMAN_GATE_REQUIRE_HUMAN_DECIDER=1',
      'GRAPH_ENGINE',
      'NODE_ENV=production',
      '整体源码包和 yuan everything 离线包及配套 SHA256 校验件',
    ]) {
      expect(manual).toContain(text)
    }
    for (const file of ['aistudio-feature-inventory.md', 'aistudio-operations-reference.md', 'aistudio-design-document-guide.md', 'aistudio-design-document-index.md', 'aistudio-run25-simulation-case.md', 'aistudio-swarm-yuan-developer-guide.md']) {
      expect(manual).toContain(`](${file})`)
      expect(statSync(resolve(root, 'docs/manuals', file)).size).toBeGreaterThan(1000)
      expect(html).toContain(`href="/${file}"`)
    }
    expect(html).toContain('href="/aistudio-training-and-user-guide.md"')
    const simulationCase = readFileSync(resolve(root, 'docs/manuals/aistudio-run25-simulation-case.md'), 'utf8')
    expect(manual).toContain('20261102-v8-run25')
    expect(simulationCase).toContain('通过 7、有条件 0、不通过 0')
    expect(simulationCase).toContain('G4-E=GAP')
    expect(simulationCase).toContain('N01-N06')
    expect(simulationCase).toContain('不是另一次 26 步完整推演')
    const yuanGuide = readFileSync(resolve(root, 'docs/manuals/aistudio-swarm-yuan-developer-guide.md'), 'utf8')
    for (const text of ['Step 1-13', '研发四阶段', 'L4 state-machine build guard', 'R134', '真实 ACP 编码回合']) {
      expect(yuanGuide).toContain(text)
    }
  })

  it('设计索引机械覆盖全部根目录与 archive spec', () => {
    const index = readFileSync(resolve(root, 'docs/manuals/aistudio-design-document-index.md'), 'utf8')
    for (const directory of ['docs/superpowers/specs', 'docs/superpowers/specs/archive']) {
      const files = readdirSync(resolve(root, directory)).filter(file => file.endsWith('.md'))
      expect(files.length).toBeGreaterThan(0)
      for (const file of files) expect(index, `${directory}/${file}`).toContain(file)
    }
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
    expect(await manual.text()).toContain('# AIStudio 产品交付团队培训手册')

    for (const path of ['aistudio-feature-inventory.md', 'aistudio-operations-reference.md', 'aistudio-design-document-guide.md', 'aistudio-design-document-index.md', 'aistudio-run25-simulation-case.md', 'aistudio-swarm-yuan-developer-guide.md']) {
      const reference = await fetch(`${base}/${path}`)
      expect(reference.status).toBe(200)
      expect(reference.headers.get('content-type')).toContain('text/plain')
      expect((await reference.text()).length).toBeGreaterThan(1000)
    }

    expect((await fetch(`${base}/package.json`)).status).toBe(404)
    expect((await fetch(`${base}/../package.json`)).status).toBe(404)
    expect((await fetch(`${base}/`, { method: 'POST' })).status).toBe(405)
    expect((await fetch(`${base}/`, { method: 'HEAD' })).status).toBe(200)
  })
})
