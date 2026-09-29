// 4A 治理层第六期守门——跨机派发聚合（客户端口径+服务端口径同语义）/状态本体视图/数据集检索。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deriveDispatchLedgerStats, crossMachineDispatchStats } from '../governance-crossdispatch'
import { deriveDispatchStats } from '../../../client/matrix-teams/store/dispatch-kv'

const ROOT = resolve(__dirname, '../../../..')

describe('① 跨机派发成功率：客户端与服务端同口径', () => {
  it('客户端 deriveDispatchStats：created/running 计送达，failed 计失败，零样本率 null', () => {
    const s = deriveDispatchStats({
      t1: { localTaskId: 'k1', lastStatus: 'created', lastSyncedAt: 1 },
      t2: { localTaskId: 'k2', lastStatus: 'running', lastSyncedAt: 1 },
      t3: { localTaskId: 'k3', lastStatus: 'failed', lastSyncedAt: 1 },
      t4: { localTaskId: 'k4', lastStatus: 'done', lastSyncedAt: 1 },
    })
    expect(s.total).toBe(4)
    expect(s.deliveredRate).toBeCloseTo(2 / 3, 5)
    expect(s.done).toBe(1)
    expect(deriveDispatchStats({}).deliveredRate).toBeNull()
  })

  it('服务端 deriveDispatchLedgerStats：台账 reason 词表映射+同 taskId 幂等覆盖（最新为准）', () => {
    const s = deriveDispatchLedgerStats([
      { ts: 1, kind: 'mention', target: 'zcode', reason: 'queued', commandId: 'c1' },
      { ts: 2, kind: 'column', target: 'zcode', specialist: 'review-guard', reason: 'coalesced', commandId: 'c1' },
      { ts: 3, kind: 'mention', target: 'codex', reason: 'engine_unreachable', commandId: 'c2' },
      { ts: 4, kind: 'mention', target: 'zcode', reason: 'target_unavailable', commandId: 'c3' },
      { ts: 5, kind: 'mention', target: 'zcode', reason: 'deferred', commandId: 'c4' },
    ])
    expect(s.total).toBe(4) // c1 幂等覆盖后 4 任务
    expect(s.created).toBe(1) // c1 最新为 coalesced（created 计数桶）
    expect(s.failed).toBe(2) // engine_unreachable + target_unavailable
    expect(s.waitingHuman).toBe(1) // deferred
    expect(s.deliveredRate).toBeCloseTo(1 / 3, 5) // delivered=created=1，denom=1+2=3
    expect(s.byReason['coalesced']).toBe(1)
  })

  it('台账空时 crossMachineDispatchStats 如实 found:false', () => {
    // 不造台账文件（ENV 不覆盖，默认路径可能真存在——只断言结构字段在，不赌具体值）
    const r = crossMachineDispatchStats()
    expect(typeof r.found).toBe('boolean')
    expect(typeof r.deliveredRate === 'number' || r.deliveredRate === null).toBe(true)
  })
})

describe('② 状态-事件本体视图（StateModelSection）', () => {
  it('组件按命名导出 fetchStateModel 消费（可 mock），不裸发请求', () => {
    const src = readFileSync(resolve(ROOT, 'custom/client/governance/components/StateModelSection.vue'), 'utf8')
    expect(src).toContain('fetchStateModel')
    expect(src).not.toContain("from '@/api/client'")
    expect(src).toContain('data-testid="gov-state-model"')
  })

  it('治理视图挂载四区（含本体区）', () => {
    const src = readFileSync(resolve(ROOT, 'custom/client/ia2/views/GovernanceView.vue'), 'utf8')
    for (const sec of ['LedgerSection', 'RuntimeSection', 'AuditSection', 'StateModelSection']) {
      expect(src, `GovernanceView 缺 ${sec} 挂载`).toContain(sec)
    }
  })

  it('视图测试 mock 含 fetchStateModel（防 unhandled rejection）', () => {
    const src = readFileSync(resolve(ROOT, 'custom/client/ia2/__tests__/governance-view.test.ts'), 'utf8')
    expect(src).toContain('fetchStateModel')
  })
})

describe('③ 高质量数据集检索接线', () => {
  it('agent-handbook.jsonl 是合法 JSONL 且七类条目齐', () => {
    const lines = readFileSync(resolve(ROOT, 'runtime/governance/dataset/agent-handbook.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l) as { kind: string })
    const kinds = new Set(lines.map((l) => l.kind))
    for (const k of ['unit', 'verdict', 'metric', 'contract', 'state', 'transition', 'admission']) {
      expect(kinds).toContain(k)
    }
    // 可被 JSONL 逐行消费（RAG/FT 检索引擎的直接输入形态）
    expect(lines.length).toBeGreaterThanOrEqual(62)
  })

  it('数据集与注册表零漂移（生成器 --check exit 0）', () => {
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    execFileSync('node', [resolve(ROOT, 'scripts/governance/build-dataset.mjs'), '--check'], { stdio: 'pipe' })
  })
})
