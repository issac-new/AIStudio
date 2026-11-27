// 场景准入守门测试（B1/B2，2026-11-28）：四条排除规则的三态判定、结论推导、追加式账本。
// 规则语义来自《德勤AI落地方法论拆解》场景排除清单；不打分、不加权——评分类断言一律不出现。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ADMISSION_RULES,
  assessAdmission,
  assessRule,
  type AdmissionDeps,
} from '../bpa-admission'
import {
  admissionStoreFile,
  appendAdmissionRecord,
  latestAdmissionOf,
  readAdmissionRecords,
  type BpaAdmissionRecord,
} from '../bpa-admission-store'
import type { BpaNode } from '../bpa-types'

const PEOPLE: NonNullable<AdmissionDeps['activePeople']> = [
  { id: 'p-1', name: '张三' },
  { id: 'p-2', name: '李四' },
]
const deps: AdmissionDeps = { activePeople: PEOPLE }

/** 合法最小的 L3 节点基底：四条规则全清。逐用例按需破坏。 */
function node(partial: Partial<BpaNode> = {}): BpaNode {
  return {
    id: 'L3-01-01-01',
    name: '需求澄清与验收标准',
    level: 3,
    parentId: 'L2-01-01',
    owner: 'p-1',
    kpis: [{ name: '验收标准一次通过率', target: '≥90%' }],
    dataCompliance: 'cleared',
    majorImpact: false,
    updatedAt: 0,
    ...partial,
  } as BpaNode
}

const verdictOf = (a: ReturnType<typeof assessAdmission>, rule: string) =>
  a.rules.find((r) => r.rule === rule)!

describe('四条排除规则（B1）', () => {
  it('规则常量：四条、顺序固定、码不与架构体检规则码重叠', () => {
    expect(ADMISSION_RULES.map((r) => r.code)).toEqual([
      'OWNER_MISSING', 'NO_BASELINE', 'DATA_UNLAWFUL', 'MAJOR_UNREVIEWED',
    ])
  })

  it('全清节点：四条 clear、derived=eligible、待补清单为空', () => {
    const a = assessAdmission(node(), deps)
    expect(a.derived).toBe('eligible')
    expect(a.pendingItems).toEqual([])
    expect(a.rules.every((r) => r.verdict === 'clear')).toBe(true)
  })

  it('①业务主责：未登记=命中；在岗自然人（编号或姓名）=未命中；登记了但不在岗名单=无法判定', () => {
    expect(assessRule('OWNER_MISSING', node({ owner: undefined }), deps))
      .toMatchObject({ verdict: 'hit', detail: expect.stringContaining('未登记业务负责人') })
    expect(assessRule('OWNER_MISSING', node({ owner: '' }), deps).verdict).toBe('hit')
    // 编号匹配
    expect(assessRule('OWNER_MISSING', node({ owner: 'p-2' }), deps)).toMatchObject({ verdict: 'clear' })
    // 姓名匹配
    expect(assessRule('OWNER_MISSING', node({ owner: '李四' }), deps)).toMatchObject({ verdict: 'clear' })
    // 登记了岗位名/不在册的人：判不了，不猜
    const r = assessRule('OWNER_MISSING', node({ owner: '安全评审AI' }), deps)
    expect(r.verdict).toBe('undetermined')
    expect(r.detail).toContain('安全评审AI')
    // 在岗名单读不到：已登记也判不了
    expect(assessRule('OWNER_MISSING', node(), { activePeople: null }).verdict).toBe('undetermined')
    // 名单读不到且未登记：仍是命中（缺失是事实，不依赖名单）
    expect(assessRule('OWNER_MISSING', node({ owner: undefined }), { activePeople: null }).verdict).toBe('hit')
  })

  it('②可比基线：无指标=命中；指标目标全部没有数值锚点=命中；有数值锚点=未命中', () => {
    expect(assessRule('NO_BASELINE', node({ kpis: undefined }), deps))
      .toMatchObject({ verdict: 'hit', detail: expect.stringContaining('未登记任何指标') })
    expect(assessRule('NO_BASELINE', node({ kpis: [] }), deps).verdict).toBe('hit')
    expect(assessRule('NO_BASELINE', node({ kpis: [{ name: '满意度', target: '高' }] }), deps))
      .toMatchObject({ verdict: 'hit', detail: expect.stringContaining('数值锚点') })
    const ok = assessRule('NO_BASELINE', node({ kpis: [{ name: '满意度', target: '高' }, { name: '时长', target: '≤24h' }] }), deps)
    expect(ok.verdict).toBe('clear')
    expect(ok.detail).toContain('时长')
  })

  it('③数据合规：已核与声明不涉及=未命中；待核=命中；未声明=无法判定', () => {
    expect(assessRule('DATA_UNLAWFUL', node({ dataCompliance: 'cleared' }), deps).verdict).toBe('clear')
    expect(assessRule('DATA_UNLAWFUL', node({ dataCompliance: 'none' }), deps).verdict).toBe('clear')
    expect(assessRule('DATA_UNLAWFUL', node({ dataCompliance: 'pending' }), deps))
      .toMatchObject({ verdict: 'hit', detail: expect.stringContaining('待核') })
    expect(assessRule('DATA_UNLAWFUL', node({ dataCompliance: undefined }), deps).verdict).toBe('undetermined')
  })

  it('④重大影响复核：未声明重大影响=未命中；声明了没复核人=命中；有复核人=未命中', () => {
    expect(assessRule('MAJOR_UNREVIEWED', node({ majorImpact: false }), deps).verdict).toBe('clear')
    expect(assessRule('MAJOR_UNREVIEWED', node({ majorImpact: undefined }), deps).verdict).toBe('clear')
    expect(assessRule('MAJOR_UNREVIEWED', node({ majorImpact: true, reviewer: undefined }), deps))
      .toMatchObject({ verdict: 'hit', detail: expect.stringContaining('复核人') })
    expect(assessRule('MAJOR_UNREVIEWED', node({ majorImpact: true, reviewer: ' ' }), deps).verdict).toBe('hit')
    expect(assessRule('MAJOR_UNREVIEWED', node({ majorImpact: true, reviewer: 'p-2' }), deps))
      .toMatchObject({ verdict: 'clear', detail: expect.stringContaining('p-2') })
  })
})

describe('结论推导（B2 前半：机器只算缺口）', () => {
  it('任一命中 → blocked，待补清单按规则序带规则名', () => {
    const a = assessAdmission(node({ majorImpact: true, reviewer: undefined, kpis: [] }), deps)
    expect(a.derived).toBe('blocked')
    expect(a.pendingItems).toHaveLength(2)
    expect(a.pendingItems[0]).toContain('可比基线：')
    expect(a.pendingItems[1]).toContain('重大影响复核：')
  })

  it('没有命中但有无法判定 → 同样 blocked（判不了不是通过）', () => {
    const a = assessAdmission(node({ dataCompliance: undefined }), deps)
    expect(a.derived).toBe('blocked')
    expect(a.pendingItems).toHaveLength(1)
    expect(a.pendingItems[0]).toContain('数据合规：')
    // 规则结果是 undetermined 而不是 hit
    expect(verdictOf(a, 'DATA_UNLAWFUL').verdict).toBe('undetermined')
  })

  it('待补清单保留无法判定与命中的原文，不加工不省略', () => {
    const a = assessAdmission(node({ owner: '安全评审AI' }), deps)
    expect(a.pendingItems[0]).toContain('业务主责：')
    expect(a.pendingItems[0]).toContain('安全评审AI')
  })
})

describe('签署结论账本（B2 后半：人签的可进试点/暂缓，追加式）', () => {
  let dir = ''
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bpa-admission-')); process.env.BPA_ADMISSION_STORE = join(dir, 'adm.json') })
  afterEach(() => { delete process.env.BPA_ADMISSION_STORE; rmSync(dir, { recursive: true, force: true }) })

  const snapshot = assessAdmission(node(), deps)

  it('追加后可读回；同节点重复签署产生两条记录，latest 取后签的', () => {
    const r1 = appendAdmissionRecord({ nodeId: 'L3-01-01-01', nodeName: '需求澄清', conclusion: 'pilot', reason: '四条全清且试点价值高', rulesSnapshot: snapshot.rules, pendingItems: [], signedBy: 'p-1', signedAt: 1000 })
    const r2 = appendAdmissionRecord({ nodeId: 'L3-01-01-01', nodeName: '需求澄清', conclusion: 'deferred', reason: '预算没批，暂缓', rulesSnapshot: snapshot.rules, pendingItems: [], signedBy: 'p-1', signedAt: 2000 })
    appendAdmissionRecord({ nodeId: 'L3-02-01-01', nodeName: '另一条', conclusion: 'deferred', reason: 'x', rulesSnapshot: snapshot.rules, pendingItems: [], signedBy: 'p-2', signedAt: 3000 })
    expect(readAdmissionRecords()).toHaveLength(3)
    const latest = latestAdmissionOf('L3-01-01-01')!
    expect(latest.recordId).toBe(r2.recordId)
    expect(latest.conclusion).toBe('deferred')
    expect(latest.recordId).not.toBe(r1.recordId)
    expect(latestAdmissionOf('L3-99-99-99')).toBeNull()
  })

  it('存储是原子写产物（tmp → rename）：落盘后目录里不残留 tmp 文件', () => {
    appendAdmissionRecord({ nodeId: 'n1', nodeName: 'n', conclusion: 'pilot', reason: 'r', rulesSnapshot: snapshot.rules, pendingItems: [], signedBy: 'p-1' })
    expect(existsSync(admissionStoreFile())).toBe(true)
    const siblings = require('node:fs').readdirSync(dir) as string[]
    expect(siblings.filter((f) => f.includes('.tmp'))).toEqual([])
  })

  it('记录带签署时的规则快照与待补清单：事后改节点不改写历史', () => {
    const blocked = assessAdmission(node({ kpis: [] }), deps)
    const rec: Omit<BpaAdmissionRecord, 'recordId' | 'signedAt'> = {
      nodeId: 'L3-01-01-01', nodeName: '需求澄清', conclusion: 'deferred',
      reason: '基线缺口待补', rulesSnapshot: blocked.rules, pendingItems: blocked.pendingItems, signedBy: 'p-1',
    }
    const saved = appendAdmissionRecord(rec)
    expect(saved.rulesSnapshot).toHaveLength(4)
    expect(saved.pendingItems.join()).toContain('未登记任何指标')
    // 改节点（内存对象）不影响已存快照
    node({ kpis: [{ name: 'x', target: '1' }] })
    const reread = latestAdmissionOf('L3-01-01-01')!
    expect(reread.pendingItems.join()).toContain('未登记任何指标')
  })

  it('存储文件损坏按空账读（fail-soft），不抛错', () => {
    const { writeFileSync } = require('node:fs') as typeof import('node:fs')
    writeFileSync(admissionStoreFile(), '{ not json')
    expect(readAdmissionRecords()).toEqual([])
    expect(latestAdmissionOf('x')).toBeNull()
  })

  it('签署记录的 JSON 含 signedBy 与 signedAt（审计最小字段），落盘可对账', () => {
    appendAdmissionRecord({ nodeId: 'n1', nodeName: 'n', conclusion: 'pilot', reason: 'r', rulesSnapshot: snapshot.rules, pendingItems: [], signedBy: 'p-1', signedAt: 12345 })
    const raw = JSON.parse(readFileSync(admissionStoreFile(), 'utf8')) as { records: BpaAdmissionRecord[] }
    expect(raw.records[0]).toMatchObject({ signedBy: 'p-1', signedAt: 12345, conclusion: 'pilot' })
  })
})
