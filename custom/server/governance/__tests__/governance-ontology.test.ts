// 4A 治理层第五期守门——语义上下文/状态本体/影响图/数据集零漂移/执行端五问。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  loadStateModel, extractKanbanStatusFacts, buildDispatchSemanticContext, findUpstreamRoot, validateStateModel,
} from '../governance-ledger'
import { queryImpact, validateRuntimeConsumerAnchors } from '../governance-impact'

const ROOT = resolve(__dirname, '../../../..')

describe('② 状态-事件本体：词表与 upstream 逐字对齐', () => {
  it('extractKanbanStatusFacts 提取九态与终态映射（锚点 kanban_db.py:103/2377）', () => {
    const root = findUpstreamRoot(ROOT)
    expect(root, 'upstream 根未找到').toBeTruthy()
    const facts = extractKanbanStatusFacts(resolve(root!, 'hermes-agent/hermes_cli/kanban_db.py'))
    expect(facts?.validStatuses.sort()).toEqual(['archived', 'blocked', 'done', 'ready', 'review', 'running', 'scheduled', 'todo', 'triage'])
    expect(facts?.runOutcomeTerminal).toEqual({
      completed: 'done', review_requested: 'review', changes_requested: 'changes_requested',
      blocked: 'blocked', dependency_wait: 'blocked',
    })
  })

  it('state-model.yaml 零 problems（states/终态映射与 upstream 一致；转移引用契约全在册）', () => {
    const res = loadStateModel()
    expect(res.exists, 'state-model.yaml 未找到').toBe(true)
    expect(res.problems, `状态本体校验问题：\n${res.problems.join('\n')}`).toEqual([])
    expect((res.doc?.states ?? []).length).toBe(9)
    expect(res.doc?.transitions?.length).toBeGreaterThanOrEqual(5)
  })

  it('变异有牙：states 少一态必被抓', () => {
    const res = loadStateModel()
    const doc = JSON.parse(JSON.stringify(res.doc))
    doc.states = doc.states.filter((s: { id: string }) => s.id !== 'scheduled')
    const root = findUpstreamRoot(ROOT)
    const facts = extractKanbanStatusFacts(resolve(root!, 'hermes-agent/hermes_cli/kanban_db.py'))
    const problems = validateStateModel(doc, facts, new Set(['kanban.transition', 'column.dispatch']))
    expect(problems.some((p) => p.includes('VALID_STATUSES 不一致'))).toBe(true)
  })
})

describe('① 派单语义上下文（agent 消费本体通道）', () => {
  it('在册单元产出四行上下文（单元/能力/SLO 目标/判定词表）', () => {
    const ctx = buildDispatchSemanticContext('dev-crafter')
    expect(ctx).toBeTruthy()
    expect(ctx!).toContain('[语义上下文] 单元 dev-crafter（lane-specialist·主承载）')
    expect(ctx!).toContain('能力 eng.implement')
    expect(ctx!).toContain('SLO core 档：成功率目标 95%')
    expect(ctx!).toContain('判定词表 pass/fail/conditional/inconclusive/waived/not_applicable')
    expect(ctx!).toContain('词面相似不构成判定依据')
  })

  it('无册单元返回 null（fail-soft 不占行）', () => {
    expect(buildDispatchSemanticContext('nonexistent-unit')).toBeNull()
  })

  it('列派单文本含语义上下文块（column-dispatch 接线）', async () => {
    const src = readFileSync(resolve(ROOT, 'custom/server/kanban/column-dispatch.ts'), 'utf8')
    expect(src).toContain('buildDispatchSemanticContext(steps[index].specialist || \'\')')
  })
})

describe('③ 反向影响查询', () => {
  it('内置消费面锚点全部有效（清单随代码走，腐烂即红）', () => {
    expect(validateRuntimeConsumerAnchors(), '锚点失效清单').toEqual([])
  })

  it('unit 查询给直接消费方（能力/预算闸/派发台账/列编排）', () => {
    const r = queryImpact('unit.dev-crafter')
    expect(r.found).toBe(true)
    expect(r.direct.some((c) => c.id === 'eng.implement')).toBe(true)
    expect(r.direct.some((c) => c.id === 'governance-budget')).toBe(true)
  })

  it('verdicts/sloTargets/state-model/contract 查询与未知目标如实', () => {
    expect(queryImpact('metrics.verdicts').direct.length).toBeGreaterThanOrEqual(3)
    expect(queryImpact('metrics.sloTargets').direct.length).toBeGreaterThanOrEqual(2)
    expect(queryImpact('state-model').found).toBe(true)
    const c = queryImpact('contract.kanban.transition')
    expect(c.found).toBe(true)
    expect(c.direct.some((x) => x.kind === 'transition')).toBe(true)
    expect(queryImpact('unit.ghost').found).toBe(false)
    expect(queryImpact('blah').kind).toBe('unknown')
  })

  it('REST /impact 与 /state-model HTTP 200 实证', async () => {
    const { createServer } = await import('http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const r1 = await fetch(`http://127.0.0.1:${port}/api/governance/state-model`)
      expect(r1.status).toBe(200)
      const b1 = await r1.json() as { ok: boolean; problems: string[]; doc: { states: unknown[] } }
      expect(b1.ok).toBe(true)
      expect(b1.problems).toEqual([])
      expect(b1.doc.states.length).toBe(9)
      const r2 = await fetch(`http://127.0.0.1:${port}/api/governance/impact?target=verdicts`)
      expect(r2.status).toBe(200)
      const b2 = await r2.json() as { ok: boolean; direct: unknown[] }
      expect(b2.direct.length).toBeGreaterThanOrEqual(3)
      const r3 = await fetch(`http://127.0.0.1:${port}/api/governance/impact`)
      expect(r3.status).toBe(400)
    } finally {
      server.close()
    }
  })
})

describe('④ 高质量数据集：生成器与零漂移', () => {
  it('产物在库且重新生成零 diff（--check exit 0）', () => {
    const outPath = resolve(ROOT, 'runtime/governance/dataset/agent-handbook.jsonl')
    expect(existsSync(outPath), '数据集未生成（跑 node scripts/governance/build-dataset.mjs）').toBe(true)
    execFileSync('node', [resolve(ROOT, 'scripts/governance/build-dataset.mjs'), '--check'], { stdio: 'pipe' })
  })

  it('六类条目齐全（unit/verdict/metric/contract/state/transition/admission）', () => {
    const lines = readFileSync(resolve(ROOT, 'runtime/governance/dataset/agent-handbook.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string })
    const kinds = new Set(lines.map((l) => l.kind))
    for (const k of ['unit', 'verdict', 'metric', 'contract', 'state', 'transition', 'admission']) {
      expect(kinds, `数据集缺 ${k} 类条目`).toContain(k)
    }
    expect(lines.filter((l) => l.kind === 'unit').length).toBeGreaterThanOrEqual(27)
    expect(lines.filter((l) => l.kind === 'state').length).toBe(9)
  })

  it('漂移检测有牙：篡改产物后 --check exit 1', () => {
    const outPath = resolve(ROOT, 'runtime/governance/dataset/agent-handbook.jsonl')
    const backup = readFileSync(outPath, 'utf8')
    try {
      const fs = require('node:fs') as typeof import('node:fs')
      fs.writeFileSync(outPath, backup + '{"kind":"tamper"}\n')
      let failed = false
      try {
        execFileSync('node', [resolve(ROOT, 'scripts/governance/build-dataset.mjs'), '--check'], { stdio: 'pipe' })
      } catch { failed = true }
      expect(failed, '篡改未被 --check 抓获').toBe(true)
    } finally {
      const fs = require('node:fs') as typeof import('node:fs')
      fs.writeFileSync(outPath, backup)
    }
  })
})

describe('⑤ 执行端五问强制（receiveAssign 拒收）', () => {
  it('doReceiveAssign 源码含 admission-incomplete 拒收路径且先于建卡', () => {
    const src = readFileSync(resolve(ROOT, 'custom/client/matrix-teams/stores/task-dispatch.ts'), 'utf8')
    const gateIdx = src.indexOf("reason: 'admission-incomplete'")
    const createIdx = src.indexOf('await createTask(')
    expect(gateIdx).toBeGreaterThan(-1)
    expect(createIdx).toBeGreaterThan(-1)
    expect(gateIdx).toBeLessThan(createIdx)
    expect(src.slice(gateIdx - 800, gateIdx)).toContain('admissionOk')
  })
})
