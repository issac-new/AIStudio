// 信号问题记录守门测试（B6，2026-11-28）：告警与事故另立来源类型（不复用评测处置单），
// 建单抄入运行清单版本锚点、同来源幂等、关闭留痕。行号锚=实现文件头注。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  createSignalIssue, closeSignalIssue, listSignalIssues, findSignalIssueBySourceKey,
  _useObsIssueStoreForTests,
} from '../issue-store'
import type { RunManifest } from '../../runmanifest/run-manifest'

let dir = ''
let manifests: RunManifest[] = []

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'obs-issues-'))
  _useObsIssueStoreForTests(dir)
  manifests = [{
    runId: 'run-1', sessionId: 'sess-1', profileId: 'coding-agent', model: 'glm-5.3', provider: 'cc-switch',
    promptHash: 'abc123def4567890', permissionMode: 'guarded', toolContractVersion: '2026-11-20.1', startedAt: 1_700_000_000_000,
  }]
})

afterEach(() => {
  _useObsIssueStoreForTests(null)
  rmSync(dir, { recursive: true, force: true })
})

describe('建单（告警与事故的另立来源类型）', () => {
  it('告警建单：来源键=kind@窗口起点，带运行标识时抄入版本锚点', () => {
    const r = createSignalIssue({
      sourceKind: 'obs-alert', sourceKey: 'quality_drop@1790000000',
      title: '评测通过率较基线下降', severity: 'warn', detail: '当前窗 0.82，基线 0.90',
      runId: 'run-1', manifests,
    })
    expect(r.created).toBe(true)
    expect(r.record.issueId).toMatch(/^sig-/)
    expect(r.record.sourceKind).toBe('obs-alert')
    expect(r.record.status).toBe('open')
    expect(r.record.anchors).toMatchObject({
      runId: 'run-1', sessionId: 'sess-1', model: 'glm-5.3',
      promptHash: 'abc123def4567890', permissionMode: 'guarded', toolContractVersion: '2026-11-20.1',
    })
  })

  it('同一来源键重复建单幂等：返回已有记录（created=false），不重复留痕', () => {
    const first = createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'latency@1', title: 't', severity: 'warn', detail: 'd' })
    const again = createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'latency@1', title: 't', severity: 'warn', detail: 'd' })
    expect(again.created).toBe(false)
    expect(again.record.issueId).toBe(first.record.issueId)
    expect(listSignalIssues()).toHaveLength(1)
  })

  it('不带运行标识：锚点为 null 并写明缺席原因，不猜版本', () => {
    const r = createSignalIssue({ sourceKind: 'incident', sourceKey: 'incident:sess-9', title: '事故', severity: 'high', detail: 'd' })
    expect(r.record.anchors).toBeNull()
    expect(r.record.anchorNote).toContain('未提供')
    expect(r.record.anchorNote).toContain('版本锚点')
  })

  it('提供了 runId 但清单查不到：锚点缺席如实说明（清单只留 14 天）', () => {
    const r = createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'x@1', title: 't', severity: 'warn', detail: 'd', runId: 'run-gone', manifests })
    expect(r.record.anchors).toBeNull()
    expect(r.record.anchorNote).toContain('run-gone')
    expect(r.record.anchorNote).toContain('查不到')
  })

  it('事故建单：sessionId 查清单取最近一条', () => {
    const newer = { ...manifests[0]!, runId: 'run-2', startedAt: 1_700_000_100_000 }
    const r = createSignalIssue({ sourceKind: 'incident', sourceKey: 'incident:sess-1', title: '事故', severity: 'high', detail: 'd', sessionId: 'sess-1', manifests: [manifests[0]!, newer] })
    expect(r.record.anchors?.runId).toBe('run-2')
  })

  it('来源键区分来源类型：同键不同 kind 是两条记录', () => {
    createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'k@1', title: 'a', severity: 'warn', detail: 'd' })
    const r2 = createSignalIssue({ sourceKind: 'incident', sourceKey: 'k@1', title: 'b', severity: 'high', detail: 'd' })
    expect(r2.created).toBe(true)
    expect(listSignalIssues()).toHaveLength(2)
  })

  it('findSignalIssueBySourceKey 按 kind+key 命中', () => {
    createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'k@2', title: 'a', severity: 'warn', detail: 'd' })
    expect(findSignalIssueBySourceKey('obs-alert', 'k@2')).not.toBeNull()
    expect(findSignalIssueBySourceKey('incident', 'k@2')).toBeNull()
  })
})

describe('关闭', () => {
  it('关闭写 closureNote/closedBy/closedAt，状态转 closed；重复关闭拒绝', () => {
    const { record } = createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'k@3', title: 't', severity: 'warn', detail: 'd' })
    const closed = closeSignalIssue(record.issueId, '回归评测已过，关闭', 'p-1')
    expect(closed.ok).toBe(true)
    expect(closed.record?.status).toBe('closed')
    expect(closed.record?.closedBy).toBe('p-1')
    expect(closed.record?.closureNote).toContain('回归')
    const again = closeSignalIssue(record.issueId, '再关一次', 'p-1')
    expect(again.ok).toBe(false)
    expect(again.reason).toContain('已关闭')
  })

  it('关闭说明必填（空串拒绝）', () => {
    const { record } = createSignalIssue({ sourceKind: 'obs-alert', sourceKey: 'k@4', title: 't', severity: 'warn', detail: 'd' })
    const r = closeSignalIssue(record.issueId, '   ', 'p-1')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('说明')
  })

  it('不存在的问题 id：拒绝并说明', () => {
    const r = closeSignalIssue('sig-none', '关闭', 'p-1')
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('不存在')
  })
})
