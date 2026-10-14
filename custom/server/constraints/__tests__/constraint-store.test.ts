// overlay[constraints] 约束卡 store 与注入选择器测试。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _useStoreDirForTests, createConstraintCard, listConstraintCards,
  readConstraintStore, updateConstraintCard, deleteConstraintCard,
} from '../constraint-store'
import { constraintBriefLine, constraintLinesForDispatch, selectConstraints, selectConstraintsPreview } from '../constraint-inject'
import type { ConstraintCard } from '../constraint-types'

const dir = mkdtempSync(join(tmpdir(), 'constraints-test-'))
_useStoreDirForTests(dir)
afterAll(() => rmSync(dir, { recursive: true, force: true }))

beforeEach(() => {
  // 整文件重置（上一个测试可能留下坏 JSON，逐卡删会先在读取处炸）
  rmSync(join(dir, 'constraints.json'), { force: true })
})

function mk(partial: Partial<ConstraintCard> & { statement: string; sourceAnchor: string }) {
  return createConstraintCard({
    statement: partial.statement,
    sourceAnchor: partial.sourceAnchor,
    scope: partial.scope ?? { columns: ['devimpl'] },
    effectiveRun: partial.effectiveRun,
    enabled: partial.enabled,
  } as never)
}

describe('约束卡 store', () => {
  it('建卡：编号递增 + 全字段落盘', () => {
    const a = mk({ statement: '在已有 API 上扩展能力，不新增并列 API', sourceAnchor: 'specs/2026-10-14-ali-15agent-squad-research.md §3-D' })
    const b = mk({ statement: '改动须过守门测试再提交', sourceAnchor: '方案正本纪律 5', scope: { specialists: ['qa'] } })
    expect(a.id).toBe('ctr-001')
    expect(b.id).toBe('ctr-002')
    expect(listConstraintCards()).toHaveLength(2)
  })

  it('校验：空陈述/空 scope/缺来源锚均 400 语义抛错', () => {
    expect(() => mk({ statement: '', sourceAnchor: 'x' })).toThrow('statement 必填')
    expect(() => mk({ statement: 's', sourceAnchor: '' })).toThrow('sourceAnchor 必填')
    expect(() => createConstraintCard({ statement: 's', sourceAnchor: 'a', scope: {} } as never)).toThrow('scope 至少一维非空')
  })

  it('改卡启停 + 删卡 404 语义', () => {
    const a = mk({ statement: 's1', sourceAnchor: 'a1' })
    const off = updateConstraintCard(a.id, { statement: 's1', sourceAnchor: 'a1', scope: { columns: ['devimpl'] }, enabled: false } as never)
    expect(off.enabled).toBe(false)
    deleteConstraintCard(a.id)
    expect(() => deleteConstraintCard(a.id)).toThrow('不存在')
  })

  it('损坏文件如实上抛（不静默清零）', () => {
    // 直接写坏 JSON 到 store 路径再读——JSON.parse 语法错上抛，只有 ENOENT 走空账
    writeFileSync(join(dir, 'constraints.json'), '{broken', 'utf8')
    expect(() => readConstraintStore()).toThrow()
  })
})

describe('注入选择器', () => {
  it('按列命中 + 停用卡排除 + 封顶 5 张', () => {
    const cards: ConstraintCard[] = []
    for (let i = 0; i < 7; i++) {
      cards.push({
        id: `ctr-00${i + 1}`, statement: `s${i}`, scope: { columns: ['devimpl'] }, sourceAnchor: 'a',
        enabled: i !== 6, createdAt: `2026-01-0${i + 1}T00:00:00Z`, updatedAt: '',
      })
    }
    cards.push({ id: 'ctr-x', statement: 'other', scope: { columns: ['testpass'] }, sourceAnchor: 'a', enabled: true, createdAt: '2026-01-01T00:00:00Z', updatedAt: '' })
    const hit = selectConstraints(cards, { column: 'devimpl' })
    expect(hit).toHaveLength(5)
    expect(hit.every((c) => c.id !== 'ctr-x')).toBe(true)
    expect(hit.find((c) => c.id === 'ctr-007')).toBeUndefined()
  })

  it('specialist/stepId 命中维度', () => {
    const card: ConstraintCard = { id: 'c1', statement: 's', scope: { specialists: ['backend-integration-testing'] }, sourceAnchor: 'a', enabled: true, createdAt: 't', updatedAt: '' }
    expect(selectConstraints([card], { specialist: 'backend-integration-testing' })).toHaveLength(1)
    expect(selectConstraints([card], { column: 'devimpl' })).toHaveLength(0)
  })

  it('简报行格式：一行收拢带卡号与来源锚', () => {
    const line = constraintBriefLine([{
      id: 'ctr-001', statement: '在已有 API 上扩展', scope: { columns: ['devimpl'] },
      sourceAnchor: 'specs/xx.md', enabled: true, createdAt: 't', updatedAt: '',
    }])
    expect(line).toContain('架构约束（约束卡注册表')
    expect(line).toContain('[ctr-001] 在已有 API 上扩展')
    expect(line).toContain('源：specs/xx.md')
    expect(constraintBriefLine([])).toBeNull()
  })

  it('派单读取面 fail-soft：存储异常返回空数组', () => {
    writeFileSync(join(dir, 'constraints.json'), '{broken', 'utf8')
    expect(constraintLinesForDispatch({ column: 'devimpl' })).toEqual([])
    rmSync(join(dir, 'constraints.json'))
  })

  it('预演通道：关键词维度对标题/正文子串命中', () => {
    const card: ConstraintCard = { id: 'c1', statement: 's', scope: { keywords: ['支付回调'] }, sourceAnchor: 'a', enabled: true, createdAt: 't', updatedAt: '' }
    expect(selectConstraintsPreview([card], { title: '实现支付回调签名校验' })).toHaveLength(1)
    expect(selectConstraintsPreview([card], {})).toHaveLength(0)
  })
})
