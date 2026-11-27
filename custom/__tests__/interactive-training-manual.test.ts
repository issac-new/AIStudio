import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
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
    // 版本与配置变量数不写死：读载体。此前此处断言 'v2.100.1' 与 '204'，手册停在旧版仍全绿。
    const yuanVersion = (JSON.parse(readFileSync(resolve(root, 'RELEASE-MANIFEST.json'), 'utf8')) as {
      modules: Record<string, { version?: string }>
    }).modules['yuan-skill']?.version ?? ''
    const factsConf = readFileSync(resolve(root, 'skills/swarm-yuan/assets/facts.conf'), 'utf8')
    const confVarCounts = ['CORE', 'ARCH', 'COMPLIANCE'].map((part) => {
      const match = new RegExp(`^FACT_CONF_VARS_${part}=(\\d+)`, 'm').exec(factsConf)
      expect(match, `facts.conf 缺 FACT_CONF_VARS_${part}`).not.toBeNull()
      return Number(match?.[1])
    })
    const confVarsTotal = confVarCounts.reduce((sum, count) => sum + count, 0)
    for (const text of ['swarm-yuan Skill', yuanVersion, '59', String(confVarsTotal), '32 个 standard', 'SCHEMA_EPOCH', 'shortcut:', 'references/lessons.md', 'check_spec_first_wiring', 'engine_bin_source', 'state-machine.sh guard build']) {
      expect(guide, `技术指南缺少：${text}`).toContain(text)
    }
    // 配置变量的分解必须等于 facts.conf 的三个分项；三份手册的版本必须等于发布清单。
    // 指南里该事实块是 <div class="fact"><b>205</b><span>配置变量 = core 31 + …</span></div>，按标签结构匹配。
    expect(guide, '技术指南的配置变量事实块').toContain(`<div class="fact"><b>${confVarsTotal}</b><span>配置变量 = core ${confVarCounts[0]} + arch ${confVarCounts[1]} + compliance ${confVarCounts[2]}</span></div>`)
    expect(guide).toContain(`<title>swarm-yuan Skill 技术指南 · ${yuanVersion}</title>`)
    // 新增的第 11 节「独立审查协议」整节必须在；节内引用的 floor-guard 行号须指向 vendor 排除行（蓝军 P0 的回归锁）。
    expect(guide, '技术指南缺独立审查协议节').toContain('<section id="review-protocol">')
    expect(guide, '独立审查协议节缺 floor-guard 排除引用').toContain('scripts/floor-guard.sh:')
    const floorRef = /scripts\/floor-guard\.sh:([\d,]+)/.exec(guide)?.[1] ?? ''
    const floorLines = readFileSync(resolve(root, 'skills/swarm-yuan/scripts/floor-guard.sh'), 'utf8').split('\n')
    for (const n of floorRef.split(',').filter(Boolean).map(Number)) {
      expect(floorLines[n - 1] ?? '', `floor-guard.sh:${n} 应为 vendor 排除行`).toContain('vendor')
    }
    const developerGuide = readFileSync(resolve(root, 'docs/manuals/aistudio-swarm-yuan-developer-guide.md'), 'utf8')
    expect(developerGuide, '研发指南当前版本').toContain(`**当前版本**：${yuanVersion}`)
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
    const techSceneText = `${tech!.summary}${tech!.steps.join('')}${tech!.example.given}${tech!.example.when}`
    for (const text of [yuanVersion, 'SCHEMA_EPOCH', 'shortcut', 'lessons.md', 'standard 32', 'engine_bin_source', 'R134']) {
      expect(techSceneText, `swarm-yuan 技术幕缺少：${text}`).toContain(text)
    }
    expect(techSceneText).toContain(`配置变量 ${confVarsTotal}=${confVarCounts.join('+')}`)
    // 独立审查协议（v2.101.0 起）的两条核心判据要出现在这一幕里
    for (const text of ['not run 不等于零发现', '连续两轮 clean 才算收敛']) {
      expect(techSceneText, `swarm-yuan 技术幕缺独立审查判据：${text}`).toContain(text)
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
    // 功能清单的总数不写死：头部声明的默认内容页数必须等于各章声明数之和（2026-11-26 文档刷新批；
    // 此前断言写死 80，清单多算一个已删除的页面并漏收五个上游页面时仍全绿）。
    const contentTotal = Number(/默认内容路由 \| \*\*(\d+)\*\*/.exec(feature)?.[1])
    const chapterTotals = [
      ...feature.matchAll(/^## [二三四五六七八九]、[^\n]*?(\d+) 个内容路由/gm),
    ].map(match => Number(match[1]))
    expect(chapterTotals, '功能清单第二至九章应各有「N 个内容路由」声明').toHaveLength(8)
    expect(contentTotal, '功能清单缺「默认内容路由 | **N**」').toBeGreaterThan(0)
    expect(chapterTotals.reduce((sum, n) => sum + n, 0), '默认内容页数不等于各章声明之和').toBe(contentTotal)
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
    // 门禁数与配置变量数不写死：读载体。此前此处断言 '204'，指南停在旧值时仍全绿
    // （2026-11-26 文档刷新批改为结构断言；同文件上方技术指南断言已是同一写法）。
    const factsForGuide = readFileSync(resolve(root, 'skills/swarm-yuan/assets/facts.conf'), 'utf8')
    const factOf = (key: string): string => {
      const match = new RegExp(`^${key}=(\\d+)`, 'm').exec(factsForGuide)
      expect(match, `facts.conf 缺 ${key}`).not.toBeNull()
      return String(match?.[1])
    }
    // 数字断言带语境：裸数字做子串匹配时，文档别处出现同一数字即可误过
    // （2026-11-26 变异探针实证：改掉一处 205 后仍全绿）。绑定到陈述该数字的短语上。
    // 随技能分发的档数读注册表的 distributed 列（standard/compliance/lite 三类计入分发）。
    // 变异探针实证：只锁总数不锁分发数时，把 44 改回 42 仍全绿。
    const referencesTsv = readFileSync(resolve(root, 'skills/swarm-yuan/assets/registry/references.tsv'), 'utf8')
    const distributedCount = referencesTsv
      .split('\n')
      .filter((line) => line && !line.startsWith('#'))
      .filter((line) => ['standard', 'compliance', 'lite'].includes(line.split('\t')[5] ?? ''))
      .length
    const core = factOf('FACT_CONF_VARS_CORE')
    const arch = factOf('FACT_CONF_VARS_ARCH')
    const comp = factOf('FACT_CONF_VARS_COMPLIANCE')
    expect(Number(factOf('FACT_CONF_VARS'))).toBe(Number(core) + Number(arch) + Number(comp))
    for (const text of [
      'Step 1-13', '研发四阶段', 'L4 state-machine build guard', 'R134', '真实 ACP 编码回合', '`--all-full`=32', 'SCHEMA_EPOCH', 'shortcut:',
      `门禁总数 ${factOf('FACT_GATES_TOTAL')}，`,
      `配置变量为 ${factOf('FACT_CONF_VARS')}，即 core ${core}、arch ${arch}、compliance ${comp}`,
      `${factOf('FACT_REFERENCES')} 份 references`,
      `${factOf('FACT_REFERENCES')} 档中 ${distributedCount} 档随技能分发`,
    ]) {
      expect(yuanGuide, `研发指南缺少：${text}`).toContain(text)
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

describe('文档结构检查（2026-11-26 文档刷新批）', () => {
  const feature = readFileSync(resolve(root, 'docs/manuals/aistudio-feature-inventory.md'), 'utf8')

  it('功能清单：带编号的表格行连续不断开，行数等于本章声明的数量', () => {
    // 2026-11-26 蓝军实证：第九章表格外（分隔线之后）另放了五行编号行，按表格解析全部丢失。
    const chapters = [...feature.matchAll(/^## ([一二三四五六七八九十]+)、([^\n]*)$/gm)]
    expect(chapters.length).toBeGreaterThan(10)
    // 编号行是「内容路由」的章：编号行数必须等于标题声明的路由数
    const routeChapters = new Set(['二', '四', '七', '八', '九', '十一'])
    for (const [index, chapter] of chapters.entries()) {
      const end = chapters[index + 1]?.index ?? feature.length
      const body = feature.slice(chapter.index!, end)
      const lines = body.split('\n')
      const numbered = lines
        .map((line, at) => ({ line, at }))
        .filter(({ line }) => /^\| \d+ \| /.test(line))
      if (numbered.length === 0) continue
      const numbers = numbered.map(({ line }) => Number(/^\| (\d+) \|/.exec(line)![1]))
      expect(numbers, `第${chapter[1]}章编号行应从 1 连续编号`).toEqual(numbers.map((_, at) => at + 1))
      // 首末编号行之间不允许出现非表格行（空行、分隔线、说明段都算把表格断开）
      const between = lines.slice(numbered[0].at, numbered[numbered.length - 1].at + 1)
        .filter(line => !line.startsWith('|'))
      expect(between, `第${chapter[1]}章编号表格中间有非表格行`).toEqual([])
      if (routeChapters.has(chapter[1])) {
        const declared = chapter[2].match(/(\d+) 个(?:内容路由|重定向)/)
        expect(declared, `第${chapter[1]}章标题应声明数量`).not.toBeNull()
        expect(numbered.length, `第${chapter[1]}章编号行数与标题声明不符`).toBe(Number(declared![1]))
      }
    }
  })

  it('功能清单：路由清单生成器覆盖注册入口里全部会注册路由的模块', () => {
    // 2026-11-26 蓝军实证：/app/expdual 在 bootstrap 注册、生成器漏登记，路由计数少一条。
    const bootstrap = readFileSync(resolve(root, 'registries/client/bootstrap.ts'), 'utf8')
    const generator = readFileSync(resolve(root, 'scripts/regression/route-manifest.ts'), 'utf8')
    const imported = (text: string) => new Set(
      [...text.matchAll(/import\('\.\.\/\.\.\/custom\/client\/([a-z0-9-]+)'\)/g)].map(match => match[1]),
    )
    const entryModules = imported(bootstrap)
    const generatorModules = imported(generator)
    expect(entryModules.size, '注册入口应引入多个 custom 模块').toBeGreaterThan(5)
    // 这五个模块的路由不走 registerRoute 收集：ia2、ide 由生成器用 build*Routes 另行加入，
    // branding、cockpit、kanban 不注册页面路由。名单之外出现漏登记即失败。
    const notCollected = new Set(['branding', 'cockpit', 'ia2', 'ide', 'kanban'])
    const missing = [...entryModules].filter(name => !generatorModules.has(name) && !notCollected.has(name))
    expect(missing, '这些模块在 bootstrap 注册路由，但 scripts/regression/route-manifest.ts 没有引入').toEqual([])
  })

  it('研发指南：参考文档分组表逐行数量、合计与登记表一致', () => {
    // 2026-11-26 蓝军实证：分组表九行相加只有 61，登记表是 63，两份文档漏列。
    const guide = readFileSync(resolve(root, 'docs/manuals/aistudio-swarm-yuan-developer-guide.md'), 'utf8')
    const heading = /^### (\d+) 份方法论与规范文档$/m.exec(guide)
    expect(heading, '研发指南缺「N 份方法论与规范文档」小节').not.toBeNull()
    const start = heading!.index! + heading![0].length
    const section = guide.slice(start, guide.indexOf('\n### ', start) === -1 ? guide.length : guide.indexOf('\n### ', start))
    const rows = [...section.matchAll(/^\| ([^|（]+)（(\d+)） \| ([^|]+) \|/gm)]
    expect(rows.length, '分组表应有九个主题域').toBe(9)
    const listed = new Set<string>()
    for (const row of rows) {
      const items = row[3].split('、').map(item => item.trim()).filter(Boolean)
      expect(items.length, `「${row[1].trim()}」声明 ${row[2]} 份，实列 ${items.length} 份`).toBe(Number(row[2]))
      for (const item of items) listed.add(item)
    }
    const total = rows.reduce((sum, row) => sum + Number(row[2]), 0)
    expect(Number(heading![1]), '小节标题的份数').toBe(total)
    const facts = readFileSync(resolve(root, 'skills/swarm-yuan/assets/facts.conf'), 'utf8')
    // facts.conf 的赋值行数字后带行内注释，只比对数值
    expect(Number(/^FACT_REFERENCES=(\d+)/m.exec(facts)?.[1]), 'facts.conf 的 FACT_REFERENCES 与分组表合计不符').toBe(total)
    const registry = readFileSync(resolve(root, 'skills/swarm-yuan/assets/registry/references.tsv'), 'utf8')
    const registered = new Set(registry.split('\n').filter(line => line && !line.startsWith('#')).map(line => line.split('\t')[0]))
    expect([...listed].filter(id => !registered.has(id)), '分组表列了登记表没有的文档').toEqual([])
    expect([...registered].filter(id => !listed.has(id)), '分组表漏列登记表里的文档').toEqual([])
  })

  it('文档间指向培训手册小节与培训课程场景的锚点都真实存在', () => {
    // 2026-11-26 实证：README 与使用指南指向「#34-创建首个管理员账号」，手册分层重排后该小节早已不在。
    const manual = readFileSync(resolve(root, 'docs/manuals/aistudio-training-and-user-guide.md'), 'utf8')
    const slug = (heading: string) => heading.toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').trim().replace(/\s+/g, '-')
    const manualAnchors = new Set([...manual.matchAll(/^#{1,6} (.+)$/gm)].map(match => slug(match[1])))
    const { SCENES } = courseData()
    const sceneIds = new Set(SCENES.map(scene => scene.id))
    const sources = [
      resolve(root, 'README.md'),
      ...['docs', 'docs/manuals'].flatMap(dir => readdirSync(resolve(root, dir))
        .filter(file => /\.(md|html)$/.test(file) && file !== 'aistudio-training-and-user-guide.md')
        .map(file => resolve(root, dir, file))),
    ]
    const dangling: string[] = []
    let checked = 0
    for (const file of sources) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/aistudio-training-and-user-guide\.md#([^\s)'"<>]+)/g)) {
        checked += 1
        if (!manualAnchors.has(decodeURIComponent(match[1]))) dangling.push(`${file.slice(root.length + 1)} → #${match[1]}`)
      }
      for (const match of text.matchAll(/aistudio-interactive-training\.html#scene=([a-z0-9-]+)/g)) {
        checked += 1
        if (!sceneIds.has(match[1])) dangling.push(`${file.slice(root.length + 1)} → scene=${match[1]}`)
      }
    }
    expect(checked, '应当至少检查到十处锚点').toBeGreaterThan(10)
    expect(dangling, '悬空锚点').toEqual([])
  })

  it('功能清单：页签数声明与各章来源一致', () => {
    // 2026-11-27 二轮审查实证：经验台账并入后「专题 26 签」漏改成 30，正文两处残留——
    // 这类页签数声明此前无任何检查。数值全部由文档自身推导，不写死。
    const headerTab = (label: string): number => {
      const match = new RegExp(`\\| ${label} \\| \\*\\*(\\d+)\\*\\*`).exec(feature)
      expect(match, `功能清单缺「${label}」页签声明`).not.toBeNull()
      return Number(match![1])
    }
    const chapterTitle = (marker: RegExp, what: string): number => {
      const match = marker.exec(feature)
      expect(match, `功能清单缺${what}`).not.toBeNull()
      return Number(match![1])
    }
    expect(headerTab('六阶段页签')).toBe(chapterTitle(/## 三、[^\n]*?(\d+) 个页签/, '第三章页签数'))
    expect(headerTab('IDE 辅助栏页签')).toBe(chapterTitle(/## 六、[^\n]*?(\d+) 个辅助页签/, '第六章页签数'))
    const chapterFive = feature.slice(
      feature.indexOf('## 五、'),
      feature.indexOf('## 六、'),
    )
    const sectionTabs = [...chapterFive.matchAll(/^### 5\.\d [^\n]*?，(\d+) 签$/gm)].map(m => Number(m[1]))
    expect(sectionTabs.length, '第五章应有每节页签数声明').toBeGreaterThan(4)
    expect(headerTab('五专题页签')).toBe(sectionTabs.reduce((sum, n) => sum + n, 0))
    // 正文里的「专题 N 签」提及必须与头部声明一致（二轮审查实证：两处正文残留 26）
    const fiveTabs = headerTab('五专题页签')
    const proseMentions = [...feature.matchAll(/专题 (\d+) 签/g)].map(m => Number(m[1]))
    expect(proseMentions.length, '应有「专题 N 签」的正文提及').toBeGreaterThan(0)
    for (const n of proseMentions) {
      expect(n, `正文「专题 ${n} 签」与页签声明 ${fiveTabs} 不一致`).toBe(fiveTabs)
    }
  })

  it('团队说明：档位数等于 team/profiles 的实际档位目录数', () => {
    // 2026-11-26 蓝军实证：两份说明写 30 个，三个领域网关档位于 2026-11-18 并入主档位后实际是 27 个。
    const actual = readdirSync(resolve(root, 'team/profiles'), { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name !== '_shared').length
    expect(actual).toBeGreaterThan(10)
    for (const [file, pattern, headline] of [
      ['team/README_zh.md', /^### .+?（(\d+) 个 profile）/gm, `**本仓 ${actual} 个 profile**`],
      ['team/README.md', /^### .+?\((\d+) profiles?\)/gm, `**${actual} profiles**`],
    ] as const) {
      const text = readFileSync(resolve(root, file!), 'utf8')
      const sections = [...text.matchAll(pattern!)].filter(match => !match[0].includes('已移除'))
      expect(sections.length, `${file} 应有团队分节`).toBeGreaterThan(5)
      expect(sections.reduce((sum, match) => sum + Number(match[1]), 0), `${file} 各分节档位数之和`).toBe(actual)
      expect(text, `${file} 开头的档位数`).toContain(headline!)
    }
  })

  it('功能清单：路由定义行的行号锚点能落到对应路由上', () => {
    // 2026-11-26 实证：清单里的路由行号几乎整体偏位——本仓路由文件 99 处只有 15 处落到该路由的定义上，
    // 上游路由文件偏 5—6 行；这些行号在任何一版已提交文件里都没对过。规则：某行主题是路由路径时，
    // 它引用的路由文件里只要定义了这条路径，同一行引用该文件的行号就必须有一段落到定义上。
    // 上游文件只读 git show 取已提交基线，不读注入后的工作树；本仓文件直接读工作树。
    expect(feature, '功能清单应声明行号基准').toContain('本文引用的 `vendor/` 行号按已提交的基线文件')
    const vendorRouter = 'vendor/hermes-studio/packages/client/src/router/index.ts'
    const fileLines = new Map<string, string[]>()
    const linesOf = (file: string): string[] => {
      if (!fileLines.has(file)) {
        fileLines.set(file, file.startsWith('vendor/')
          ? execFileSync('git', ['show', `HEAD:${file}`], { cwd: root, encoding: 'utf8' }).split('\n')
          : readFileSync(resolve(root, file), 'utf8').split('\n'))
      }
      return fileLines.get(file)!
    }
    const routeFiles = /((?:custom\/client\/[a-z0-9-]+\/(?:routes|index)\.ts|vendor\/hermes-studio\/packages\/client\/src\/router\/index\.ts)):([\d,-]+)/g
    let checked = 0
    for (const line of feature.split('\n')) {
      const subject = [...line.matchAll(/`([^`]+)`/g)].map(match => match[1]).find(token => token.startsWith('/'))
      if (!subject) continue
      // 三种写法都认：annex('路径'…) 一行式、path: '路径'、重定向表的 from:；/app 下的子路由写相对路径。
      // 清单把正则参数缩写成 :section(...)，按左前缀匹配。
      const forms = [subject.split('(')[0]]
      if (subject.startsWith('/app/')) forms.push(subject.slice('/app/'.length).split('(')[0])
      const needle = new RegExp(`(?:annex\\(\\s*|path:\\s*|from:\\s*)'(?:${[...new Set(forms)].map(form => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})${subject.includes('(') ? '\\(' : "'"}`)
      // 按文件分别判断：同一行引用同一个文件可能有多个行号（路径定义、守卫逻辑等），
      // 只要其中一段落到定义上，这个文件的行号就算对。
      const byFile = new Map<string, number[][]>()
      for (const anchor of line.matchAll(routeFiles)) {
        const ranges = byFile.get(anchor[1]) ?? []
        ranges.push(...anchor[2].split(',').map(range => range.split('-').map(Number)))
        byFile.set(anchor[1], ranges)
      }
      for (const [file, ranges] of byFile) {
        const defined = linesOf(file).map((text, at) => (needle.test(text) ? at + 1 : 0)).filter(Boolean)
        // 该文件里没有这条路径的定义时不判（例如清单只是提到一个已退役的路径）
        if (defined.length === 0) continue
        const hit = ranges.some(([from, to]) => defined.some(at => at >= from && at <= (to ?? from)))
        expect(hit, `「${subject}」引用 ${file}:${ranges.map(range => range.join('-')).join('、')}，但这条路由定义在第 ${defined.join('、')} 行`).toBe(true)
        checked += 1
      }
    }
    expect(checked, '应当至少检查到一百处路由行号').toBeGreaterThan(100)
  })
})
