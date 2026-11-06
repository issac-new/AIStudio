// hrgov.workunit-contract 门的守门测试（2026-11-06 执行单元责任台账批）。
// 目的：门不悬空、不骗人——require 列出的文件必须真实在位（防幽灵门），
// mustContain 的 marker 必须同时出现在门 yaml 原文与目标文件中（防 marker
// 只写在门里而目标早已删空），且门 yaml 能被 qgate 内核解析器接受
//（防 schema 漂移导致 loader 把门静默丢进 diagnostics）。
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

import { parseGateSpec } from '../qgate/src/core/parse.js'

const GATE_PATH = '.qgate/gates/hrgov.workunit-contract.yaml'
const GATE_ID = 'hrgov.workunit-contract'

interface MustContainEntry {
  file: string
  markers: string[]
}

function loadGate(): Record<string, any> {
  return parse(readFileSync(GATE_PATH, 'utf8')) as Record<string, any>
}

describe('hrgov.workunit-contract 门契约', () => {
  it('门文件在位且关键字段与任务要求一致', () => {
    expect(existsSync(GATE_PATH), `门文件缺失：${GATE_PATH}`).toBe(true)
    const doc = loadGate()
    expect(doc.apiVersion).toBe('qgate/v1alpha1')
    expect(doc.kind).toBe('Gate')
    expect(doc.metadata?.id).toBe(GATE_ID)
    expect(String(doc.metadata?.description)).toContain('执行单元责任台账契约在位（advisory 起步）')
    expect(doc.spec?.domain).toBe('L4')
    expect(doc.spec?.triggers).toContain('task_close')
  })

  it('appliesWhen.changed.any 覆盖责任台账的全部改动面', () => {
    const any = loadGate().spec?.appliesWhen?.changed?.any as string[]
    expect(Array.isArray(any)).toBe(true)
    // 排序后整表比对：多一条少一条都算改动面漂移
    expect([...any].sort()).toEqual([
      'custom/client/governance/components/Judgment*',
      'custom/client/governance/components/SixQuestions*',
      'custom/client/governance/components/WorkUnit*',
      'custom/server/agentidentity/**',
      'custom/server/autonomygov/**',
      'docs/superpowers/specs/2026-11-06-workunit-responsibility-ledger.md',
      'simharness/mux/mx-workunit-lib.sh',
    ].sort())
  })

  it('executor 是 files 型并声明 files-check-result 证据', () => {
    const executors = loadGate().spec?.executors as Array<Record<string, any>>
    expect(executors?.length).toBeGreaterThanOrEqual(1)
    expect(executors[0].type).toBe('files')
    expect(executors[0].evidenceType).toBe('files-check-result')
    expect(loadGate().spec?.evidence?.required).toContain('files-check-result')
  })

  it('require 列出的每个文件都真实在位（防幽灵门）', () => {
    const require = loadGate().spec?.executors[0]?.require as string[]
    expect(Array.isArray(require)).toBe(true)
    expect(require.length).toBeGreaterThanOrEqual(11)
    for (const file of require) {
      expect(existsSync(file), `require 悬空：${file}`).toBe(true)
    }
    // 四域 ts 与对应测试逐一在位；identity-card 投影与六问链路不得删空
    for (const must of [
      'custom/server/agentidentity/responsibility.ts',
      'custom/server/agentidentity/lifecycle.ts',
      'custom/server/agentidentity/judgments.ts',
      'custom/server/agentidentity/people.ts',
      'custom/server/agentidentity/__tests__/responsibility.test.ts',
      'custom/server/agentidentity/__tests__/lifecycle.test.ts',
      'custom/server/agentidentity/__tests__/judgments.test.ts',
      'custom/server/agentidentity/__tests__/people.test.ts',
      'custom/server/agentidentity/__tests__/identity-card.test.ts',
      'custom/server/autonomygov/six-questions.ts',
      'custom/server/autonomygov/__tests__/six-questions.test.ts',
    ]) {
      expect(require, `require 缺条目：${must}`).toContain(must)
    }
  })

  it('mustContain 的 marker 同时出现在门 yaml 与目标文件中', () => {
    const gateRaw = readFileSync(GATE_PATH, 'utf8')
    const mustContain = loadGate().spec?.executors[0]?.mustContain as MustContainEntry[]
    expect(Array.isArray(mustContain)).toBe(true)

    const byFile = new Map(mustContain.map((m) => [m.file, m.markers]))
    // 三组 marker 不得被静默删减：spec 六问/署名、判定 human-entry、生命周期 changing
    expect(byFile.get('docs/superpowers/specs/2026-11-06-workunit-responsibility-ledger.md'))
      .toEqual(expect.arrayContaining(['批准前六问', '署名', '六问']))
    expect(byFile.get('custom/server/agentidentity/judgments.ts')).toContain('human-entry')
    expect(byFile.get('custom/server/agentidentity/lifecycle.ts')).toContain('changing')

    for (const { file, markers } of mustContain) {
      expect(existsSync(file), `mustContain 目标缺失：${file}`).toBe(true)
      const target = readFileSync(file, 'utf8')
      for (const marker of markers) {
        // marker 必须真的写在门 yaml 原文里（防只在断言里硬编码）
        expect(gateRaw, `门 yaml 未声明 marker：${marker}`).toContain(marker)
        // 且真的命中目标文件（这才是门的实际判定面）
        expect(target, `${file} 未命中 marker：${marker}`).toContain(marker)
      }
    }
  })

  it('门 yaml 能被 qgate 内核解析器接受（防 schema 漂移被静默丢弃）', () => {
    const spec = parseGateSpec(parse(readFileSync(GATE_PATH, 'utf8')))
    expect(spec, 'parseGateSpec 拒绝了本门：字段不满足 qgate/v1alpha1 Gate schema').not.toBeNull()
    expect(spec?.metadata.id).toBe(GATE_ID)
    expect(spec?.spec.triggers).toContain('task_close')
  })
})
