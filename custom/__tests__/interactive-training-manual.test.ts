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

type Run28Evidence = {
  runId: string; source: string; locator: string; snapshot: string; status: string; fact: string
}

function courseData() {
  const markers = ['const PARTS =', 'const PHASES =', 'const RUN28_EVIDENCE =', 'const MANUAL_PRINCIPLES =', 'const MANUAL_PLAIN ='].map(marker => html.indexOf(marker))
  for (const start of markers) expect(start).toBeGreaterThan(-1)
  const start = Math.min(...markers)
  const end = html.indexOf('\n\nconst $ =')
  expect(end).toBeGreaterThan(start)
  return new Function(`${html.slice(start, end)}; return { PARTS, PHASES, SCENES, RUN28_EVIDENCE, MANUAL_PRINCIPLES, MANUAL_PLAIN }`)() as {
    PARTS: Array<{ id: string; name: string }>
    PHASES: Array<{ id: string }>
    RUN28_EVIDENCE: Record<string, Run28Evidence>
    MANUAL_PRINCIPLES: Record<string, string>
    MANUAL_PLAIN: Record<string, { title: string; what: string; why: string; goal: string; principle: string; prepare: string[]; steps: Array<{ action: string; explain: string; pass: string; fail: string; save: string }>; case: { title: string; background: string; action: string; result: string } }>
    SCENES: Array<{
      id: string; part: string; phase: string; navShort: string; focus: string; duration: number; summary: string; proof: string
      layer: string; practiceRef: string; feedsNextCycle?: string
      handoff: {
        consumes: Array<{ scene: string; artifact: string }>
        produces: string
        next: string | null
      }
      caseEvidenceIds: string[]
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
  it('四阶段 14 幕按规定顺序组成复核工作包，场景、焦点和连线完整', () => {
    const { PARTS, PHASES, SCENES } = courseData()
    expect(PARTS.map(part => part.name)).toEqual(['产品需求分析', '项目管理', '研发', '测试', '运维监控', '安全合规及审计内控'])
    expect(PHASES.map(phase => phase.id)).toEqual(['rules', 'execution', 'governance', 'capstone'])
    expect(SCENES.map(scene => scene.id)).toEqual([
      'product-overview',
      'product-spec-design',
      'development-swarm-yuan-tech',
      'operations-readiness',
      'project-dispatch',
      'development-swarm',
      'development-delivery',
      'testing-g4-review',
      'testing-eval',
      'audit-posture-approval',
      'project-release-retro',
      'operations-release',
      'audit-evidence-remediation',
      'project-run28-case',
    ])
    expect(new Set(SCENES.map(scene => scene.id)).size).toBe(14)
    const expectedSceneCounts: Record<string, number> = { product: 2, project: 3, development: 3, testing: 2, operations: 2, audit: 2 }
    for (const part of PARTS) {
      expect(SCENES.filter(scene => scene.part === part.id)).toHaveLength(expectedSceneCounts[part.id])
    }
    const phaseIds = new Set(PHASES.map(phase => phase.id))
    for (const scene of SCENES) {
      expect(phaseIds.has(scene.phase), `${scene.id} phase`).toBe(true)
      expect(scene.navShort.trim().length, `${scene.id} navShort`).toBeGreaterThan(0)
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
    expect(SCENES.at(-1)?.phase).toBe('capstone')
  })

  it('交接 DAG 的来源均在前面，产物与下一幕沿 14 幕链匹配并回流下一轮', () => {
    const { SCENES } = courseData()
    const artifacts = [
      'case-index',
      'spec-review',
      'skill-supply',
      'readiness',
      'dispatch-recon',
      'skill-live',
      'commit-pack',
      'g4-pack',
      'eval-pack',
      'approval-pack',
      'release-decision',
      'ops-timeline',
      'audit-pack',
      'capstone-verdict',
    ]
    const sceneIndexes = new Map(SCENES.map((scene, index) => [scene.id, index]))
    SCENES.forEach((scene, index) => {
      expect(scene.handoff.produces, scene.id).toBe(artifacts[index])
      expect(scene.handoff.next, scene.id).toBe(SCENES[index + 1]?.id ?? null)
      if (index === 0) {
        expect(scene.handoff.consumes, scene.id).toEqual([])
        return
      }
      expect(scene.handoff.consumes.length, scene.id).toBeGreaterThan(0)
      expect(scene.handoff.consumes, `${scene.id} keeps the main handoff chain`).toContainEqual({
        scene: SCENES[index - 1].id,
        artifact: artifacts[index - 1],
      })
      for (const consumed of scene.handoff.consumes) {
        const sourceIndex = sceneIndexes.get(consumed.scene)
        expect(sourceIndex, `${scene.id} consumes ${consumed.scene}`).toBeDefined()
        expect(sourceIndex!, `${scene.id} source must precede consumer`).toBeLessThan(index)
        expect(SCENES[sourceIndex!].handoff.produces, `${scene.id} consumed artifact`).toBe(consumed.artifact)
      }
    })
    const last = SCENES.at(-1)!
    expect(last.id).toBe('project-run28-case')
    expect(last.handoff.next).toBeNull()
    expect(last.feedsNextCycle).toBe('product-spec-design')
  })

  it('run28 证据登记字段完整，每幕引用均已注册且没有孤儿证据', () => {
    const { RUN28_EVIDENCE, SCENES } = courseData()
    const evidenceEntries = Object.entries(RUN28_EVIDENCE)
    expect(evidenceEntries.length).toBeGreaterThan(0)
    const evidenceById = new Map<string, Run28Evidence>()
    for (const [id, evidence] of evidenceEntries) {
      expect(id.trim().length, 'evidence id').toBeGreaterThan(0)
      for (const field of ['runId', 'source', 'locator', 'snapshot', 'status', 'fact'] as const) {
        expect(typeof evidence[field], `evidence ${id} ${field}`).toBe('string')
        expect(evidence[field].trim().length, `evidence ${id} ${field}`).toBeGreaterThan(0)
      }
      expect(evidence.runId, `evidence ${id} runId`).toBe('20261107-v8-run28')
      expect(evidenceById.has(id), `duplicate evidence ${id}`).toBe(false)
      evidenceById.set(id, evidence)
    }
    const referenced = new Set<string>()
    for (const scene of SCENES) {
      expect(scene.caseEvidenceIds.length, scene.id).toBeGreaterThan(0)
      expect(new Set(scene.caseEvidenceIds).size, `${scene.id} duplicate evidence references`).toBe(scene.caseEvidenceIds.length)
      for (const id of scene.caseEvidenceIds) {
        expect(evidenceById.has(id), `${scene.id} references ${id}`).toBe(true)
        referenced.add(id)
      }
    }
    for (const id of evidenceById.keys()) expect(referenced.has(id), `unreferenced evidence ${id}`).toBe(true)
  })

  it('技术手册：原理、实操、案例、证据与演示侧栏构成完整课程', () => {
    const s2 = (text: string) => text.split('id="topologySvg"').length - 1
    const { PHASES, SCENES, RUN28_EVIDENCE, MANUAL_PRINCIPLES, MANUAL_PLAIN } = courseData()
    expect(Object.keys(MANUAL_PRINCIPLES).sort()).toEqual(SCENES.map(scene => scene.id).sort())
    for (const scene of SCENES) expect(MANUAL_PRINCIPLES[scene.id].length, `${scene.id} 原理说明`).toBeGreaterThan(60)
    expect(Object.keys(MANUAL_PLAIN).sort()).toEqual(SCENES.map(scene => scene.id).sort())
    for (const scene of SCENES) {
      const plain = MANUAL_PLAIN[scene.id]
      expect(plain.steps, `${scene.id} 通俗步骤数`).toHaveLength(scene.steps.length)
      expect(plain.prepare.length, `${scene.id} 准备项`).toBeGreaterThanOrEqual(2)
      for (const [index, step] of plain.steps.entries()) {
        for (const field of ['action', 'explain', 'pass', 'fail', 'save'] as const) expect(step[field].length, `${scene.id} step ${index + 1} ${field}`).toBeGreaterThan(8)
        expect(`${step.action}${step.explain}${step.pass}${step.fail}${step.save}`, `${scene.id} step ${index + 1} 仍需懂内部缩写`).not.toMatch(/(DAG|RACI|MAET|SCHEMA_EPOCH|HERMES_\w+|G[1-6]|L[1-4])/)
      }
    }
    // 左侧进度轨由 PHASES 驱动，四阶段把 14 幕完整分组且全部可点导航；横幅带阶段与幕次
    expect(html).toContain('function renderPhaseRoute')
    expect(html).toContain('data-directory-scene="${entry.index}"')
    expect(html).toContain('id="stagePhase"')
    expect(html).toContain('第 ${current + 1} 幕 / 14')
    const phaseCounts = PHASES.map(phase => SCENES.filter(scene => scene.phase === phase.id).length)
    expect(phaseCounts).toEqual([4, 5, 4, 1])
    // 四组冲突数字原样呈现，且每个核心数字都能回溯到证据 fact，不另造口径
    const metricsBlock = html.slice(html.indexOf('const metrics = ['), html.indexOf("$('caseMetrics').innerHTML"))
    expect(metricsBlock.length).toBeGreaterThan(0)
    for (const token of ['26', '6/6 <em>≠</em> 5/6', '65 / 8/65', '11/13｜13/14', '流程步骤', '含代偿 ≠ 扣除后', '未关闭 / 已修复', '原报告｜后续核验']) {
      expect(metricsBlock, `metrics ${token}`).toContain(token)
    }
    const allFacts = Object.values(RUN28_EVIDENCE).map(item => item.fact).join('\n')
    for (const token of ['26', '6/6', '5/6', '8/65', '11/13', '13/14']) expect(allFacts, `fact trace ${token}`).toContain(token)
    // 附件签渲染 snapshot/status 原样状态词，observed 不翻译成通过；切步保留、切幕重置
    expect(html).toContain('function renderEvidenceAttachments')
    expect(html).toContain('if (!scene.caseEvidenceIds.includes(selectedEvidenceId)) selectedEvidenceId = scene.caseEvidenceIds[0]')
    const slipTemplate = html.slice(html.indexOf('evidence-slip ${'), html.indexOf('evidence-slip ${') + 420)
    expect(slipTemplate).toContain('${evidence.snapshot}/${evidence.status}')
    expect(slipTemplate).not.toContain('通过')
    // 拓扑只在讲解需要时展开：同一 svg 在隐藏宿主与 dialog 间移动，不复制
    expect(html).toContain('id="topologyHome"')
    expect(html).toContain("dialog.querySelector('.topology-canvas').appendChild($('topologySvg'))")
    expect(html).toContain("$('topologyHome').appendChild($('topologySvg'))")
    expect(s2(html), 'topologySvg 唯一').toBe(1)
    expect(html).toContain('id="topologyDialog"')
    expect(html).toContain('traversedFlowIds = [], traversedNodeIds = []')
    expect(html).toContain('previousGuides.flatMap(guide => guide.flowIds)')
    expect(html).toContain('.topology-flow.is-traversed')
    expect(html).toContain('.topology-node.is-traversed')
    // 屏幕为技术文档三栏，打印保持三列教案，不复制交互滚动区
    expect(html).toContain('class="manual-document" id="simStage"')
    expect(html).toContain('id="manualPrinciple"')
    expect(html).toContain('function renderDiagrams')
    for (const id of ['structureSvg', 'flowSvg', 'architectureSvg', 'relationshipSvg']) expect(html).toContain(`id="${id}"`)
    expect(html).toContain("$('architectureSvg').innerHTML = topologySvgContent")
    const principleBlock = html.slice(html.indexOf('id="principleSection"'), html.indexOf('id="practiceSection"'))
    const practiceBlock = html.slice(html.indexOf('id="practiceSection"'), html.indexOf('id="caseSection"'))
    const caseBlock = html.slice(html.indexOf('id="caseSection"'), html.indexOf('id="evidenceSection"'))
    expect(principleBlock.indexOf('id="structureSvg"')).toBeLessThan(principleBlock.indexOf('id="architectureSvg"'))
    expect(principleBlock).toContain('id="manualPrinciple"')
    expect(practiceBlock.indexOf('id="flowSvg"')).toBeLessThan(practiceBlock.indexOf('id="coachSteps"'))
    expect(caseBlock).toContain('id="relationshipSvg"')
    expect(html).toContain('${escapeSvg(plain.principle)}')
    expect(html).toContain('class="manual-notes"')
    expect(html).toContain('height: calc(100vh - 58px)')
    expect(html).not.toContain('function fitPageToViewport')
    expect(html).toContain('#printRoot .lesson-main { display: grid; grid-template-columns: 112mm 82mm 75mm; }')
  })

  it('每幕都有可执行教案和不同实例，而不是只有摘要壳', () => {
    const { SCENES, RUN28_EVIDENCE } = courseData()
    const allowedReferences = new Set([
      '/aistudio-training-and-user-guide.md',
      '/aistudio-feature-inventory.md',
      '/aistudio-operations-reference.md',
      '/aistudio-design-document-guide.md',
      '/aistudio-design-document-index.md',
      '/aistudio-run28-simulation-case.md',
      '/aistudio-run25-simulation-case.md',
      '/aistudio-swarm-yuan-guide.html',
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
      const exampleText = `${scene.example.given}\n${scene.example.when}\n${scene.example.then}`
      const usedEvidence = scene.caseEvidenceIds.some(id => exampleText.includes(RUN28_EVIDENCE[id].fact))
      expect(usedEvidence, `${scene.id} 实例必须直接消费本幕注册的 run28 证据`).toBe(true)
    }
    expect(stepSignatures.size).toBe(14)
    expect(exampleSignatures.size).toBe(14)
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

  it('使用五层拓扑、可选 Matrix 分支和证据回流，不再维护场景下标表', () => {
    expect(html).toContain('function initTopologyScene')
    expect(html).toContain('function renderTopology')
    expect(html).toContain('id="topologySvg"')
    expect(html).toContain('协作消息与平台回执（可选）')
    expect(html).toContain('任务真值与状态')
    expect(html).toContain('独立验证与证据库')
    for (const removed of ['TOPO_ANCHORS', 'TOPO_NODE_BY_SCENE', 'TOPO_FLOW_BY_SCENE']) expect(html).not.toContain(removed)
  })

  it('纸张右上角承载导航，三类信息节点在图内同步流转', () => {
    for (const removed of ['<header class="app-header">', '<nav class="course-strip"', '<div class="course-toolbar">', '<div class="course-controls">', 'completionDialog', 'printCompletionButton', 'replayButton']) {
      expect(html).not.toContain(removed)
    }
    const actions = html.match(/<div class="stage-actions"[\s\S]*?<\/div>/)?.[0] ?? ''
    for (const id of ['prevButton', 'playButton', 'nextButton', 'speedButton', 'courseMenuButton', 'swarmGuideButton', 'helpButton']) {
      expect(actions).toContain(`id="${id}"`)
    }
    expect(html).toContain('id="partNav"')
    expect(html).toContain('class="manual-topbar"')
    expect(html).toContain('id="directoryTeams"')
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
    expect(html).toContain('id="coachDeliverables"')
    expect(html).toContain('id="coachPitfalls"')
    expect(html).toContain('id="coachReferences"')
    expect(html).toContain('class="a4-page${dense}"')
    const stageStart = html.indexOf('<article class="manual-document" id="simStage"')
    const stageEnd = html.indexOf('\n  </main>', stageStart)
    expect(stageStart).toBeGreaterThan(-1)
    expect(stageEnd).toBeGreaterThan(stageStart)
    const stage = html.slice(stageStart, stageEnd)
    const appMarkup = html.slice(html.indexOf('<div id="appRoot">'), html.indexOf('<div id="printRoot"'))
    expect(appMarkup).not.toContain('class="page-footer"')
    expect(appMarkup).not.toContain('id="spatialFocus"')
    expect(appMarkup).not.toContain('class="panel-head"')
    expect(html).toContain('chip.textContent = `${label.id} · ${label.label}`')
    for (const marker of ['class="manual-document" id="simStage"', 'id="stagePhase"', 'id="manualPrinciple"', 'class="manual-steps"', 'class="case-narrative"', 'class="evidence-attachments" id="caseEvidence"']) {
      expect(stage).toContain(marker)
    }
    expect(html).toContain('grid-template-rows: 26mm 165mm')
    expect(html).toContain('grid-template-columns: 1.15fr 1fr 1.2fr .75fr')
    expect(html).toContain('.lesson-more-grid')
    expect(html).toContain('break-after: page')
    expect(html).toContain('break-inside: avoid')
    expect(html).toContain('打印 14 页 A4')
    expect(html).toContain("$('printRoot').innerHTML = SCENES.map(printPage).join('')")
    expect(html).toContain('#printRoot .lesson-main { display: grid; grid-template-columns: 112mm 82mm 75mm; }')
    const printTemplate = html.slice(html.indexOf('function printPage'), html.indexOf('function preparePrint'))
    expect(printTemplate).not.toContain('<details')
  })

  it('五层拓扑保留 15 个协作步骤，视图不携带整幕流线或焦点下标数组', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const { TOPO_LAYERS, TOPO_FLOWS, TOPO_VIEWS } = new Function(`${html.slice(start, end)}; return { TOPO_LAYERS, TOPO_FLOWS, TOPO_VIEWS }`)() as {
      TOPO_LAYERS: Array<{ label: string }>
      TOPO_FLOWS: Array<{ id: number }>
      TOPO_VIEWS: Record<string, { flowByScene?: number[][]; activeNode?: string[] }>
    }
    expect(TOPO_LAYERS.map(layer => layer.label)).toEqual(['治理层', '产品交互层', '协作运行层', '执行层', '能力与治理支撑层'])
    expect(TOPO_FLOWS.map(flow => flow.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
    for (const [part, view] of Object.entries(TOPO_VIEWS)) {
      expect(view, part).not.toHaveProperty('flowByScene')
      expect(view, part).not.toHaveProperty('activeNode')
    }
  })

  it('每幕步骤映射真实流线，整幕亮线等于步骤并集，默认焦点与节点连通', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const { SCENES } = courseData()
    type View = { nodes: Array<{ id: string; x: number; y: number; w: number; h: number }>; flows: Array<{ id: number; path: string }> }
    const { views, topologySvgContent } = new Function('SCENES', `${html.slice(start, end)}; return { views: TOPO_VIEWS, topologySvgContent }`)(SCENES) as {
      views: Record<string, View>
      topologySvgContent: (view: View, index: number, showAll: boolean, allowMotion: boolean) => string
    }
    SCENES.forEach((scene, index) => {
      expect(scene.stepGuide, scene.id).toHaveLength(scene.steps.length)
      const view = views[scene.part]
      const sceneFlows = [...new Set(scene.stepGuide.flatMap(guide => guide.flowIds))].sort((a, b) => a - b)
      expect(sceneFlows.length, scene.id).toBeGreaterThan(0)
      const svg = topologySvgContent(view, index, false, false)
      const activeFlows = [...svg.matchAll(/<path class="([^"]*)" data-flow-id="(\d+)"/g)]
        .filter(match => match[1].split(' ').includes('is-active'))
        .map(match => Number(match[2]))
        .sort((a, b) => a - b)
      expect(activeFlows, `${scene.id} derived scene flows`).toEqual(sceneFlows)
      const focusedNodes = [...svg.matchAll(/<g data-topo-node="([^"]+)" tabindex="(\d)"/g)]
        .filter(match => match[2] === '0')
        .map(match => match[1])
      expect(focusedNodes, `${scene.id} default focus`).toEqual([scene.focus])
      const validFlows = new Set(view.flows.map(flow => flow.id))
      const validNodes = new Set(view.nodes.map(node => node.id))
      for (const guide of scene.stepGuide) {
        expect(validNodes.has(guide.nodeId), `${scene.id} node ${guide.nodeId}`).toBe(true)
        expect(guide.flowIds.length, scene.id).toBeGreaterThan(0)
        for (const id of guide.flowIds) expect(validFlows.has(id), `${scene.id} flow ${id}`).toBe(true)
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
    })
  })

  it('拓扑使用固定 SVG 视口、可读文字层级与 A4 安全区', () => {
    expect(html).toContain('viewBox="0 0 1200 720"')
    expect(html).toContain('.topology-node-title { fill: #1c2b22; font-size: 21px;')
    expect(html).toContain('.topology-node-subtitle { fill: #65776a; font-size: 14px;')
    expect(html).toContain('grid-template-rows: 26mm 165mm')
    expect(html).toContain('grid-template-columns: 1.15fr 1fr 1.2fr .75fr')
    expect(html).toContain('stepNodeId = null')
    expect(html).toContain('#printRoot .a4-page { grid-template-rows: 27mm 87mm 74mm; }')
    expect(html).toContain('function caseEvidencePrint')
    expect(html).toContain('class="case-evidence-print"')
    expect(html).toContain('padding: 8mm')
    expect(html).toContain('return defs + layers + flowLines + nodes + flowLabels + pulses')
    expect(html).toContain('#appRoot, dialog, .skip-link { display: none !important; }')
    expect(html).not.toContain('availableHeight')
  })

  it('六团队使用不同拓扑，每幕焦点取 scene.focus 且派生流线非空', () => {
    const start = html.indexOf('let topologyActive = false')
    const end = html.indexOf('\n\nfunction renderTopology', start)
    const views = new Function(`${html.slice(start, end)}; return TOPO_VIEWS`)() as Record<string, {
      nodes: Array<{ id: string; title: string; sub: string }>
      flows: Array<{ label: string }>
    }>
    const { SCENES } = courseData()
    expect(Object.keys(views)).toEqual(['product', 'project', 'development', 'testing', 'operations', 'audit'])
    const signatures = new Set(Object.values(views).map(view => view.nodes.map(node => node.id).join(',')))
    expect(signatures.size).toBe(6)
    for (const [part, view] of Object.entries(views)) {
      const scenes = SCENES.filter(scene => scene.part === part)
      expect(scenes).toHaveLength(({ product: 2, project: 3, development: 3, testing: 2, operations: 2, audit: 2 } as Record<string, number>)[part])
      const nodeIds = new Set(view.nodes.map(node => node.id))
      for (const scene of scenes) {
        const sceneFlows = new Set(scene.stepGuide.flatMap(guide => guide.flowIds))
        expect(sceneFlows.size, scene.id).toBeGreaterThan(0)
        expect(nodeIds.has(scene.focus), `${scene.id} focus ${scene.focus}`).toBe(true)
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
    const operations = readFileSync(resolve(root, 'docs/manuals/aistudio-operations-reference.md'), 'utf8')
    const designGuide = readFileSync(resolve(root, 'docs/manuals/aistudio-design-document-guide.md'), 'utf8')
    const manifest = JSON.parse(readFileSync(resolve(root, 'RELEASE-MANIFEST.json'), 'utf8'))
    expect(manual).toContain(`适用版本：AIStudio ${pkg.version}`)
    expect(operations).toContain(pkg.version)
    for (const module of Object.values(manifest.modules) as Array<{ version: string }>) expect(designGuide).toContain(module.version)
    expect(html).toContain(`适用版本：AIStudio ${pkg.version}`)
    for (const tab of ['评测集', '运行记录', '指标治理', '安全红队', 'UI Oracle', '优化建议', '数据飞轮', '技能评估']) {
      expect(feature).toContain(tab)
    }
    expect(manual).toContain('技能评估位于第八页签，检查 spec 第 19 节')
    expect(manual).toContain('全部维度为 `yes` 才是 `PASS`')
    expect(manual).toContain('其余为 `CONDITIONAL`')
    expect(html).toContain('同一页面的“技能评估”检查 spec 第 19 节')
  })

  it('run28 复核幕与 swarm-yuan 技术页覆盖当前实现和证据边界', () => {
    const guide = readFileSync(resolve(root, 'docs/manuals/aistudio-swarm-yuan-guide.html'), 'utf8')
    for (const text of ['swarm-yuan Skill', 'v2.100.1', '59', '204', '32 个 standard', 'SCHEMA_EPOCH', 'shortcut:', 'references/lessons.md', 'check_spec_first_wiring', 'engine_bin_source', 'state-machine.sh guard build']) {
      expect(guide).toContain(text)
    }
    expect(guide).toContain('href="/aistudio-swarm-yuan-developer-guide.md"')
    const { SCENES } = courseData()
    const run28 = SCENES.find(scene => scene.id === 'project-run28-case')
    expect(run28, 'project-run28-case').toBeDefined()
    expect(run28!.part).toBe('project')
    expect(run28!.phase).toBe('capstone')
    expect(run28!.focus).toBe('g5')
    for (const text of ['20261107-v8-run28', '净额 5/6', 'open 65', '已修 8/65', '自主派发 14', '11/13', '13/14', 'mp_runtime_proof', '44954 秒', '14 例误杀']) {
      expect(`${run28!.summary}${run28!.steps.join('')}${run28!.example.given}${run28!.example.when}`).toContain(text)
    }
    const tech = SCENES.find(scene => scene.id === 'development-swarm-yuan-tech')
    expect(tech, 'development-swarm-yuan-tech').toBeDefined()
    expect(tech!.part).toBe('development')
    expect(tech!.phase).toBe('rules')
    expect(tech!.focus).toBe('swarm')
    for (const text of ['v2.100.1', 'SCHEMA_EPOCH', 'shortcut', 'lessons.md', 'standard 32', 'engine_bin_source', 'R134']) {
      expect(`${tech!.summary}${tech!.steps.join('')}${tech!.example.given}${tech!.example.when}`).toContain(text)
    }
    expect(html).toContain("goTo(SCENES.findIndex(scene => scene.id === 'development-swarm-yuan-tech'))")
    expect(html).toContain('href="#scene=development-swarm-yuan-tech"')
    expect(html).toContain('href="#scene=project-run28-case"')
    expect(html).toContain('function sceneIndexFromHash')
    expect(html).toContain('function syncSceneHash')
  })

  it('六团队手册覆盖独立交付主线、实现边界和所有参考材料', () => {
    const manual = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')
    const feature = readFileSync(resolve(root, 'docs/manuals/aistudio-feature-inventory.md'), 'utf8')
    expect(feature).toContain('默认内容路由 | **80**')
    expect(feature).toContain('IDE 辅助栏页签 | **23**')
    for (const route of ['/app/projects', '/app/projects/:id', '/app/records', '/app/records/:kind/:id']) expect(feature).toContain(route)
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
    const run28Case = readFileSync(resolve(root, 'docs/manuals/aistudio-run28-simulation-case.md'), 'utf8')
    expect(manual).toContain('20261107-v8-run28')
    for (const text of ['26', '净额 5/6', '14 条', '11/13', '12h29m14s', '13/14', 'mp_runtime_proof', 'run29']) expect(run28Case).toContain(text)
    expect(run28Case).toMatch(/open\s*=?\s*65/)
    for (const text of ['/app/projects', '/app/records', 'run28 裁决开立：先决定放行或冻结', 'contractGuardHook', '13/14']) expect(html).toContain(text)
    const yuanGuide = readFileSync(resolve(root, 'docs/manuals/aistudio-swarm-yuan-developer-guide.md'), 'utf8')
    for (const text of ['Step 1-13', '研发四阶段', 'L4 state-machine build guard', 'R134', '真实 ACP 编码回合', '59', '204', '`--all-full`=32', 'SCHEMA_EPOCH', 'shortcut:']) {
      expect(yuanGuide).toContain(text)
    }
  })

  it('设计索引唯一覆盖全部 spec，无冲突标记且分组计数一致', () => {
    const index = readFileSync(resolve(root, 'docs/manuals/aistudio-design-document-index.md'), 'utf8')
    expect(index).not.toMatch(/^(<<<<<<<|=======|>>>>>>>)/m)
    const rootFiles = readdirSync(resolve(root, 'docs/superpowers/specs')).filter(file => file.endsWith('.md'))
    const archiveFiles = readdirSync(resolve(root, 'docs/superpowers/specs/archive')).filter(file => file.endsWith('.md')).map(file => `archive/${file}`)
    const linkPattern = /^- \[([^\]]+\.md)\]\(\.\.\/superpowers\/specs\/([^)]+)\)$/gm
    const links = [...index.matchAll(linkPattern)]
    const linkedFiles = links.map(match => match[2])
    expect(new Set(linkedFiles).size, '索引不允许重复链接').toBe(linkedFiles.length)
    expect(new Set(linkedFiles)).toEqual(new Set([...rootFiles, ...archiveFiles]))
    const headers = [...index.matchAll(/^## (2026-\d{2})（(\d+) 份）$/gm)]
    for (const current of headers) {
      const sectionEnd = index.indexOf('\n## ', current.index + 1)
      const section = index.slice(current.index, sectionEnd === -1 ? index.length : sectionEnd)
      const actualCount = rootFiles.filter(file => file.startsWith(`${current[1]}-`)).length
      expect(Number(current[2]), `${current[1]} 标题计数`).toBe(actualCount)
      expect([...section.matchAll(linkPattern)].length, `${current[1]} 分组链接数`).toBe(actualCount)
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
    expect(await home.text()).toContain('AIStudio 技术培训与演示手册')

    const swarmGuide = await fetch(`${base}/aistudio-swarm-yuan-guide.html`)
    expect(swarmGuide.status).toBe(200)
    expect(swarmGuide.headers.get('content-type')).toContain('text/html')
    expect(await swarmGuide.text()).toContain('swarm-yuan Skill')

    const manual = await fetch(`${base}/aistudio-training-and-user-guide.md`)
    expect(manual.status).toBe(200)
    expect(await manual.text()).toContain('# AIStudio 产品交付团队培训手册')

    for (const path of ['aistudio-feature-inventory.md', 'aistudio-operations-reference.md', 'aistudio-design-document-guide.md', 'aistudio-design-document-index.md', 'aistudio-run28-simulation-case.md', 'aistudio-run25-simulation-case.md', 'aistudio-swarm-yuan-developer-guide.md']) {
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

describe('培训分层与诚实催办（P2 Task 3）', () => {
  const manualText = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')

  it('§1.1 六团队主读章节全部命中真实章节标题（指引不指空）', () => {
    // 真实章节号集：从 "## N. 标题" 提取
    const chapters = new Map<number, string>()
    for (const m of manualText.matchAll(/^## (\d+)\. (.+)$/gm)) chapters.set(Number(m[1]), m[2].trim())
    expect(chapters.size).toBeGreaterThanOrEqual(17)
    // §1.1 表六行：团队 → 期望章节号集（2026-11-06 P2 修正：产品 2/7、项目 7-12、
    // 研发 3-7、测试 6/7、运维 13、审计 14——与各章标题归属一致）
    const expected: Record<string, number[]> = {
      '产品需求分析': [2, 7],
      '项目管理': [7, 8, 9, 10, 11, 12],
      '研发': [3, 4, 5, 6, 7],
      '测试': [6, 7],
      '运维监控': [13],
      '安全合规及审计内控': [14],
    }
    const tableStart = manualText.indexOf('| 团队 | 主读章节 |')
    const tableEnd = manualText.indexOf('每章都要留下交付物', tableStart)
    expect(tableStart).toBeGreaterThan(-1)
    const table = manualText.slice(tableStart, tableEnd)
    for (const [team, chapterNumbers] of Object.entries(expected)) {
      const row = table.split('\n').find(line => line.startsWith(`| ${team} |`))
      expect(row, `§1.1 缺 ${team} 行`).toBeTruthy()
      const refs = [...row!.matchAll(/第 ([\d、—\-]+) 章/g)]
        .flatMap(m => m[1].split(/[、]/))
        .flatMap(part => {
          const range = part.match(/^(\d+)[—-](\d+)$/)
          if (range) {
            const out: number[] = []
            for (let n = Number(range[1]); n <= Number(range[2]); n++) out.push(n)
            return out
          }
          return [Number(part)]
        })
        .sort((a, b) => a - b)
      expect(refs, `${team} 主读章节与期望不一致`).toEqual(chapterNumbers)
      for (const n of chapterNumbers) {
        expect(chapters.has(n), `第 ${n} 章被 ${team} 引用但真实标题不存在`).toBe(true)
      }
    }
  })

  it('手册 §8.4 定义催办三态：routed-only/unassigned/解析失败，未发送是定义不是提示', () => {
    const section = manualText.slice(
      manualText.indexOf('### 8.4 `routed` 和催办不等于 worker'),
      manualText.indexOf('### 8.5'),
    )
    expect(section).toContain('routed-only')
    expect(section).toContain('sent/received 均为 null')
    expect(section).toContain('unassigned')
    expect(section).toContain('解析失败')
    expect(section).toContain('未发送消息')
    // 三态齐：路由已解析（未发送）/ 显式无人 / 解析失败
    expect(section).toContain('路由已解析')
  })

  it('交互页每幕声明 layer=simulation 且 practiceRef 命中手册真实 17.x 小节', () => {
    const { SCENES } = courseData()
    // 真实 17.x 小节标题集
    const sections = new Map<string, string>()
    for (const m of manualText.matchAll(/^### (17\.\d+) (.+)$/gm)) sections.set(m[1], m[2].trim())
    expect(sections.size).toBeGreaterThanOrEqual(7)
    const partToTeam: Record<string, string> = {
      development: '研发', project: '项目管理团队', product: '产品需求分析团队',
      testing: '测试团队', operations: '运维监控团队', audit: '安全合规及审计内控团队',
    }
    for (const scene of SCENES) {
      expect(scene.layer, `${scene.id} 缺 layer 声明`).toBe('simulation')
      expect(scene.practiceRef, `${scene.id} 缺 practiceRef`).toBeTruthy()
      expect(sections.has(scene.practiceRef), `${scene.id} practiceRef ${scene.practiceRef} 不指向真实 17.x 小节`).toBe(true)
      expect(sections.get(scene.practiceRef), `${scene.id} practiceRef 指错团队小节`).toContain(partToTeam[scene.part])
    }
    // 每幕模拟声明渲染面在位（renderCoach 消费 practiceRef/layer）
    expect(html).toContain('id="coachLayer"')
    expect(html).toContain('layer=simulation')
    expect(html).toContain('scene.practiceRef')
  })

  it('命令块标注「本页不执行」：交互面板与打印页两处代码块都带标注', () => {
    expect(html).toContain('本页不执行')
    // 交互面板代码块（coachCodeWrap）与打印页代码块（printPage lesson-code）各带标注
    const interactive = html.slice(html.indexOf('<div class="lesson-code" id="coachCodeWrap"'), html.indexOf('</div>', html.indexOf('id="coachCode"')))
    expect(interactive).toContain('本页不执行')
    const printFn = html.slice(html.indexOf('function printPage'), html.indexOf('function preparePrint'))
    expect(printFn).toContain('本页不执行')
  })
})
