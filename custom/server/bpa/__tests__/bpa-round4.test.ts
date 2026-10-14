// bpa 第四轮测试：任务↔流程映射（task-link）+ validate 第 9 规则 PCF_UNMAPPED。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readTaskLinks, upsertTaskLink, removeTaskLink, groupByProcess } from '../bpa-task-link'
import { validateArchitecture } from '../bpa-validate'
import { seedArchitecture } from '../bpa-seed'
import { readArchitecture, writeArchitecture } from '../bpa-store'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'bpa-r4-'))
  process.env.BPA_TASK_LINK_STORE = join(dir, 'links.json')
  process.env.BPA_STORE = join(dir, 'arch.json')
  process.env.BPA_AUDIT_STORE = join(dir, 'audit.json')
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
  delete process.env.BPA_TASK_LINK_STORE
  delete process.env.BPA_STORE
  delete process.env.BPA_AUDIT_STORE
})

describe('bpa-task-link', () => {
  it('fail-soft 读 + upsert 幂等 + remove + 按流程归组', () => {
    expect(readTaskLinks()).toEqual([])
    upsertTaskLink('T-1001', 'L3-01-01-01', '需求澄清流程的任务')
    upsertTaskLink('T-1002', 'L3-01-01-01')
    upsertTaskLink('T-1003', 'L3-02-01-01', '缺陷修复流程的任务')
    expect(readTaskLinks()).toHaveLength(3)
    // 幂等：同 taskId+processId 覆盖 note，不重复加
    upsertTaskLink('T-1001', 'L3-01-01-01', '需求澄清（修订）')
    expect(readTaskLinks()).toHaveLength(3)
    expect(readTaskLinks()[0]?.note).toBe('需求澄清（修订）')
    const by = groupByProcess()
    expect(by['L3-01-01-01']).toHaveLength(2)
    expect(by['L3-02-01-01']).toHaveLength(1)
    removeTaskLink('T-1002', 'L3-01-01-01')
    expect(readTaskLinks()).toHaveLength(2)
  })
})

describe('bpa-validate 第 9 规则 PCF_UNMAPPED', () => {
  it('L1 无 pcfRef → medium 违规；有 pcfRef → 不触发', () => {
    const arch = readArchitecture()
    arch.nodes = [
      { id: 'L1-01', name: '有映射', level: 1, parentId: null, section: 'OPERATING', owner: '甲', pcfRef: '4.0', updatedAt: 0 },
      { id: 'L1-02', name: '无映射', level: 1, parentId: null, section: 'SUPPORTING', owner: '乙', updatedAt: 0 },
    ]
    writeArchitecture(arch.nodes, arch.config)
    const report = validateArchitecture(arch)
    const unmapped = report.violations.filter((v) => v.rule === 'PCF_UNMAPPED')
    expect(unmapped).toHaveLength(1)
    expect(unmapped[0].nodeId).toBe('L1-02')
    expect(unmapped[0].severity).toBe('medium')
  })

  it('种子示例 6 域全带 pcfRef → 零 PCF_UNMAPPED 违规', () => {
    const seeded = seedArchitecture()
    const report = validateArchitecture(seeded)
    expect(report.violations.filter((v) => v.rule === 'PCF_UNMAPPED')).toEqual([])
  })
})
