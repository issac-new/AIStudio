// 执行内核统一 P0a 守门（2026-11-10，spec 2026-11-10-execution-kernel-unification §6 P0a/§10）：
// 四表完整性＋上游四挡目录重锚断言＋白名单口径。P0a 零行为变化——本测试只读契约，
// 不触发任何写路径；变异探针：任删四挡之一/edit 遗留/policyVersion 字段，此处必须红。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadExecutionContract, recordTypeForMode, riskClassForTool, validateContract,
} from '../server/executioncontract/index'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const contractPath = join(repoRoot, 'config', 'execution-contract.json')

describe('execution-contract P0a 四表', () => {
  it('契约正本可解析且版本在位', () => {
    const raw = JSON.parse(readFileSync(contractPath, 'utf8'))
    expect(raw.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(raw.sourceOfTruth.spec).toContain('2026-11-10-execution-kernel-unification')
  })

  it('四挡目录与上游 ZCODE_AGENT_MODE_OPTIONS 重锚（四个 id 逐字一致）', () => {
    const upstream = readFileSync(
      join(repoRoot, 'vendor/zcode/packages/shared/src/zcode-agent-model-state.ts'), 'utf8')
    const m = upstream.match(/const ZCODE_AGENT_MODE_OPTIONS[^;]+;/s)
    expect(m).toBeTruthy()
    const catalog = m![0]
    const contract = loadExecutionContract()
    for (const mode of contract.modes.canonical) {
      expect(catalog).toContain(`id: "${mode.id}"`)
      expect(catalog).toContain(`name: "${mode.name}"`)
    }
    // 上游 edit 保留约束在位（ZCODE_AGENT_MODE_ID_SET 含 edit）
    expect(upstream).toContain('"edit"')
  })

  it('edit 历史映射不得删除（上游注释约束）', () => {
    const contract = loadExecutionContract()
    const edit = contract.modes.legacyHidden.find(h => h.id === 'edit')
    expect(edit).toBeTruthy()
    expect(edit!.note).toContain('不得')
  })

  it('挡位→账本记录类型取数：build/guarded 落 pending，plan/yolo 落 exempted', () => {
    expect(recordTypeForMode('build')).toBe('approval.pending')
    expect(recordTypeForMode('guarded')).toBe('approval.pending')
    expect(recordTypeForMode('plan')).toBe('approval.exempted')
    expect(recordTypeForMode('yolo')).toBe('approval.exempted')
  })

  it('审批账本字段：policyVersion 与 decidedBy 必在；手工与免审同 schema', () => {
    const ledger = loadExecutionContract().approvalLedger
    expect(ledger.requiredFields).toContain('policyVersion')
    expect(ledger.requiredFields).toContain('decidedBy')
    expect(ledger.recordTypes).toEqual(['approval.pending', 'approval.resolved', 'approval.exempted'])
    expect(ledger.sameSchemaRule).toContain('decidedBy')
  })

  it('编码后端白名单：3 app / 2 注册项；13 家退役名单与注册表口径一致', () => {
    const backends = loadExecutionContract().codingBackends
    expect(backends.whitelist).toHaveLength(3)
    expect(new Set(backends.whitelist.map(b => b.registryId))).toEqual(new Set(['zcode', 'dsh']))
    expect(backends.retired).toHaveLength(13)
    expect(backends.retired).toContain('claude-code')
    expect(backends.retired).toContain('cursor')
    expect(backends.retired).not.toContain('dsh')
  })

  it('工具风险分级：精确/通配/未登记兜底宁高勿低', () => {
    expect(riskClassForTool('read_file')).toBe('readonly')
    expect(riskClassForTool('write_file')).toBe('write_file')
    expect(riskClassForTool('git_push')).toBe('git_write')
    expect(riskClassForTool('mcp:someops-external')).toBe('mcp_external')
    expect(riskClassForTool('brand_new_unknown_tool')).toBe('shell')
  })

  it('会话标识映射：hermes_session 为唯一 canonical owner；退役库只读标注', () => {
    const map = loadExecutionContract().sessionIdentityMap
    expect(map.canonicalOwner).toBe('hermes_session')
    expect(map.idKinds).toContain('zcode_native_session')
    expect(map.idKinds).toContain('ekko_session')
    expect(map.retiredStores.join(',')).toContain('只读')
    expect(map.bidirectionalRule).toContain('可逆')
  })

  it('事件语义表：统一事件覆盖 run/message/tool/approval/usage 生命周期；免审事件三源齐', () => {
    const names = loadExecutionContract().eventSemantics.unifiedEvents.map(e => e.name)
    for (const n of ['run.started', 'run.completed', 'run.failed', 'message.delta',
      'tool.started', 'tool.finished', 'approval.requested', 'approval.resolved',
      'approval.exempted', 'usage.reported']) expect(names).toContain(n)
    const exempted = loadExecutionContract().eventSemantics.unifiedEvents
      .find(e => e.name === 'approval.exempted')!
    expect(Object.keys(exempted.sources).sort()).toEqual(['ekko', 'hermes', 'zcode'])
  })

  it('变异探针：删一挡/删 edit/删 policyVersion 任一操作使 validateContract 抛错', () => {
    const base = JSON.parse(readFileSync(contractPath, 'utf8'))
    const dropMode = structuredClone(base); dropMode.modes.canonical = dropMode.modes.canonical.filter((m: { id: string }) => m.id !== 'guarded')
    expect(() => validateContract(dropMode)).toThrow(/缺 guarded/)
    const dropEdit = structuredClone(base); dropEdit.modes.legacyHidden = []
    expect(() => validateContract(dropEdit)).toThrow(/缺 edit/)
    const dropField = structuredClone(base)
    dropField.approvalLedger.requiredFields = dropField.approvalLedger.requiredFields
      .filter((f: string) => f !== 'policyVersion')
    expect(() => validateContract(dropField)).toThrow(/policyVersion/)
    const widenWhitelist = structuredClone(base)
    widenWhitelist.codingBackends.whitelist.push({ appId: 'x', registryId: 'codex', binary: 'x' })
    expect(() => validateContract(widenWhitelist)).toThrow(/whitelist/)
  })
})
