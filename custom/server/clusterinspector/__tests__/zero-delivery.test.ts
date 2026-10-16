// zero-delivery.test.ts — completion.zero-delivery 检测器守门（run20 复盘产品化）
// 守门面：①缺席面=合法空态 ②非 done 态不判 ③有分支引用不判（归 anchor-missing 面）
// ④有 commit= 锚不判 ⑤零交付候选=warn+聚合单条+清单截断 ⑥detectAll 全量入口接线。
import { describe, it, expect } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll } from '../detectors'
import { classifyCard } from '../card-classify'
import { detectZeroDelivery } from '../detectors-zero-delivery'

function snap(cards: Array<Record<string, unknown>>, ok = true): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: true, rows: [] },
    runningCards: { ok, cards } as unknown as ClusterSnapshot['runningCards'],
    federation: { ok: true, machines: [] },
  } as unknown as ClusterSnapshot
}

function card(over: Record<string, unknown> = {}) {
  return { id: 't_1', assignee: 'chen-csw-pay-core', title: 'T01 支付核心', status: 'done', ...over }
}

describe('detectZeroDelivery（completion.zero-delivery，run20 复盘产品化）', () => {
  it('面缺席=合法空态静默', () => {
    expect(detectZeroDelivery(snap([], false))).toHaveLength(0)
  })

  it('非 done 态不判（running/ready/todo）', () => {
    for (const st of ['running', 'ready', 'todo', 'blocked', 'review']) {
      expect(detectZeroDelivery(snap([card({ status: st, body: '无锚正文' })]))).toHaveLength(0)
    }
  })

  it('done+无分支+无 commit 锚=warn 聚合单条', () => {
    const out = detectZeroDelivery(snap([card({ body: '做完了，请看板' }), card({ id: 't_2', body: '' })]))
    expect(out).toHaveLength(1)
    expect(out[0].detector).toBe('completion.zero-delivery')
    expect(out[0].severity).toBe('warn')
    expect((out[0].detail as { total: number }).total).toBe(2)
    expect(out[0].summary).toContain('零交付 2 张')
  })

  it('有 commit= 锚不判（结果凭证在位）', () => {
    expect(detectZeroDelivery(snap([card({ body: '完成 commit=1a2b3c4d5e' })]))).toHaveLength(0)
    expect(detectZeroDelivery(snap([card({ body: '见 commit=abcdef1234567890 分支' })]))).toHaveLength(0)
  })

  it('有分支引用不判（归 delivery.anchor-missing 面，防重复报）', () => {
    expect(detectZeroDelivery(snap([card({ branch_name: 'feat/DEV-PAYCORE-C', body: '无锚' })]))).toHaveLength(0)
  })

  it('候选清单截断 20 封顶（防载荷爆）', () => {
    const many = Array.from({ length: 25 }, (_, i) => card({ id: `t_${i}`, body: '无锚' }))
    const out = detectZeroDelivery(snap(many))
    expect(out).toHaveLength(1)
    expect((out[0].detail as { total: number }).total).toBe(25)
    expect((out[0].detail as { candidates: unknown[] }).candidates).toHaveLength(20)
  })

  it('分类判据：治理类卡零锚=静默剔除（run20 复盘件 4/4）', () => {
    const gov = [
      card({ id: 't_g1', title: 'RFD-001 发布准出评审（G5）', body: '评审通过' }),
      card({ id: 't_g2', title: 'RFD-001 复盘（G6 三段式）', body: '' }),
      card({ id: 't_g3', title: 'G2SREV-r1 支付核心侧安全设计条款（G2 修订）', body: '条款' }),
      card({ id: 't_g4', title: '工作台账登记', body: '' }),
    ]
    expect(detectZeroDelivery(snap(gov))).toHaveLength(0)
  })

  it('分类判据：研发类卡零锚=强告警（cls=delivery 标注）', () => {
    const dev = [
      card({ id: 't_d1', title: 'T01 统一下单幂等与状态机断言', body: '做完了' }),
      card({ id: 't_d2', title: 'DEV-CHWX 四方法实现', body: '' }),
    ]
    const out = detectZeroDelivery(snap(dev))
    expect(out).toHaveLength(1)
    const cands = (out[0].detail as { candidates: Array<{ cls: string }> }).candidates
    expect(cands.every((c) => c.cls === 'delivery')).toBe(true)
    expect(out[0].summary).toContain('研发交付类卡零凭证')
  })

  it('分类判据：双命中/双不命中=uncertain（维持人工分诊，禁臆断）', () => {
    expect(classifyCard({ title: '评审 DEV-CHWX 实现' })).toBe('uncertain')  // 双命中
    expect(classifyCard({ title: '杂项' })).toBe('uncertain')                 // 双不命中
    const out = detectZeroDelivery(snap([card({ id: 't_u1', title: '杂项', body: '' })]))
    expect(out).toHaveLength(1)
    expect((out[0].detail as { candidates: Array<{ cls: string }> }).candidates[0].cls).toBe('uncertain')
  })

  it('治理静默清单可反查（governanceNoAnchor 计入 detail）', () => {
    const mixed = [
      card({ id: 't_g1', title: 'RFD-001 发布准出评审（G5）', body: '' }),
      card({ id: 't_d1', title: 'T01 开发断言', body: '' }),
    ]
    const out = detectZeroDelivery(snap(mixed))
    expect(out).toHaveLength(1)
    const d = out[0].detail as { governanceNoAnchor: Array<{ card: string }>; total: number }
    expect(d.total).toBe(1)
    expect(d.governanceNoAnchor).toHaveLength(1)
    expect(d.governanceNoAnchor[0].card).toBe('t_g1')
  })

  it('detectAll 全量入口接线（防漏接线空转）', () => {
    const out = detectAll(snap([card({ body: '无锚' })]))
    expect(out.some((a) => a.detector === 'completion.zero-delivery')).toBe(true)
  })
})
