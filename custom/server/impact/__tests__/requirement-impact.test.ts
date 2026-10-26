// P5（JoyAI 闭环吸收轮）守门：需求影响推演——四路命中 + 建议模块同源 + 保守边界。
// 语义：本体实例/板级 KG/FIBO 术语按词面提及命中（带命中词面可核对）；specs 历史迭代
// 按实体词面检索；短词不参与；源缺席该路 0 命中（fail-soft）；HTTP 面 400 校验。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

let ontoDir: string
let kgDir: string
let specsDir: string

beforeEach(async () => {
  ontoDir = mkdtempSync(join(tmpdir(), 'impact-onto-'))
  kgDir = mkdtempSync(join(tmpdir(), 'impact-kg-'))
  specsDir = mkdtempSync(join(tmpdir(), 'impact-specs-'))
  process.env.ONTOLOGY_DIR = ontoDir
  process.env.SEMANTICA_BOARD_KG_DIR = kgDir
  process.env.SPECS_DIR = specsDir

  // 本体实例：一任务（label=短词面「收银台」——命中方向=实体词面出现在需求文本）
  const { replaceIngested } = await import('../../ontology/ontology-store')
  replaceIngested('kb:', [{
    id: 'kb:b1:task:T-1', type: 'Task', label: '收银台', data: { title: '收银台', status: 'done', taskRef: 'b1#T-1' },
    relations: [], updatedAt: 1,
  }])

  // 板级 KG：一结案任务节点（标题=「退款逆向流」）
  writeFileSync(join(kgDir, 'board-b1.json'), JSON.stringify({
    nodes: [{ id: 'kb:b1:task:T-2', type: 'task', properties: { title: '退款逆向流' } }],
    edges: [],
  }), 'utf8')

  // specs：一份提及收银台的历史设计
  writeFileSync(join(specsDir, '2026-03-01-cashier-design.md'), '# 收银台设计\n当年做过收银台前端改造。', 'utf8')
})

afterEach(() => {
  delete process.env.ONTOLOGY_DIR
  delete process.env.SEMANTICA_BOARD_KG_DIR
  delete process.env.SPECS_DIR
  for (const d of [ontoDir, kgDir, specsDir]) rmSync(d, { recursive: true, force: true })
})

describe('analyzeRequirementImpact（四路命中）', () => {
  it('支付收银台需求：本体任务命中 + FIBO 术语命中 + specs 迭代命中 + 建议模块同源', async () => {
    const { analyzeRequirementImpact } = await import('../requirement-impact')
    const r = analyzeRequirementImpact('收银台改版', '小程序收银台支持微信支付，涉及支付流程与退款')
    expect(r.entities.some((e) => e.source === 'ontology-instance' && e.id === 'kb:b1:task:T-1')).toBe(true)
    // B5：实体命中 spec 文档（共现边数据面）——本体任务命中词面「收银台」在历史 spec 出现
    const t1 = r.entities.find((e) => e.id === 'kb:b1:task:T-1')!
    expect(t1.docs).toContain('2026-03-01-cashier-design.md')
    expect(r.entities.some((e) => e.source === 'fibo-term' && e.id === 'Payment')).toBe(true)
    expect(r.relatedSpecs.some((h) => h.file === '2026-03-01-cashier-design.md')).toBe(true)
    // 建议模块与导演台 inferModules 同源（词面命中支付+微信+收银+小程序）
    expect(r.suggestedModules).toContain('pay-core')
    expect(r.suggestedModules).toContain('cashier-mp')
    expect(r.boundary).toContain('规则式')
  })

  it('KG 节点命中带板 slug；无关需求零命中不猜数', async () => {
    const { analyzeRequirementImpact } = await import('../requirement-impact')
    const r = analyzeRequirementImpact('退款逆向', '梳理退款逆向流的处理边界')
    const kgHit = r.entities.find((e) => e.source === 'board-kg')
    expect(kgHit?.detail).toBe('b1')
    const none = analyzeRequirementImpact('完全无关', '关于图片压缩算法的调研')
    expect(none.entities.filter((e) => e.source !== 'fibo-term').length).toBe(0)
    expect(none.counts.fibo).toBe(0)
  })
})

describe('POST /api/hermes/impact/requirement（HTTP 投影）', () => {
  let server: Server | null = null
  let base = ''

  beforeEach(async () => {
    const { createServer } = await import('node:http')
    const Koa = (await import('koa')).default
    const bodyparser = (await import('@koa/bodyparser')).default
    const { impactRoutes } = await import('../impact-controller')
    const app = new Koa()
    app.use(bodyparser())
    app.use(impactRoutes.routes())
    server = createServer(app.callback())
    await new Promise<void>((res) => server!.listen(0, '127.0.0.1', res))
    base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}/api/hermes/impact`
  })

  afterEach(async () => {
    if (server) await new Promise<void>((res) => server!.close(() => res()))
  })

  it('200 返回影响卡；缺 title 400', async () => {
    const ok = await fetch(`${base}/requirement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: '收银台', description: '支持微信支付' }),
    })
    expect(ok.status).toBe(200)
    const j = await ok.json() as any
    expect(j.ok).toBe(true)
    expect(j.impact.counts).toBeTruthy()
    const bad = await fetch(`${base}/requirement`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: '无标题' }),
    })
    expect(bad.status).toBe(400)
  })
})
