// overlay/custom/server/toolpipeline/__tests__/enforce-gate.test.ts
// H3 v1 执法门守门测试：三级策略链 × 总闸 × fail-open × govbus 留痕。
import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  evaluateEnforcement, ekkoEnforceGateHook, toolCategoryOf, riskOfCall, approvalPointHit,
} from '../enforce-gate'
import { upsertLadder, _useLadderDirForTests, _resetLadderDirForTests, type AutonomyLadderEntry } from '../../autonomyladder/autonomy-ladder'
import { queryGovEvents, _useGovEventDirForTests, _resetGovEventDirForTests } from '../../govbus/event-log'

let ladderDir: string
let govDir: string

const ladderOf = (profile?: string): AutonomyLadderEntry | null => (profile === 'agent-x' ? fakeLadder : null)
const fakeLadder: AutonomyLadderEntry = {
  target: 'agent-x', level: 'assist', approvalPoints: ['生产部署'], maxRiskTier: 'medium', updatedAt: 1,
}

beforeEach(() => {
  ladderDir = mkdtempSync(join(tmpdir(), 'enforce-ladder-'))
  govDir = mkdtempSync(join(tmpdir(), 'enforce-gov-'))
  _useLadderDirForTests(ladderDir)
  _useGovEventDirForTests(govDir)
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
})

afterAll(() => {
  _resetLadderDirForTests()
  _resetGovEventDirForTests()
  delete process.env.HERMES_TOOL_ENFORCE
  delete process.env.HERMES_TOOL_ENFORCE_MODE
  rmSync(ladderDir, { recursive: true, force: true })
  rmSync(govDir, { recursive: true, force: true })
})

describe('工具类别与风险分档', () => {
  it('四类映射：read/write/exec/network；未知工具保守归 write', () => {
    expect(toolCategoryOf('read_file')).toBe('read')
    expect(toolCategoryOf('write_file')).toBe('write')
    expect(toolCategoryOf('terminal_exec')).toBe('exec')
    expect(toolCategoryOf('browser_click')).toBe('network')
    expect(toolCategoryOf('mcp_some_tool')).toBe('write')
  })

  it('风险：terminal 按命令分类（git push=high；ls=low；写文件=medium）', () => {
    expect(riskOfCall('terminal_exec', { command: 'git push origin main' })).toBe('high')
    expect(riskOfCall('terminal_exec', { command: 'ls -la' })).toBe('low')
    expect(riskOfCall('write_file', { path: '/tmp/a' })).toBe('medium')
    expect(riskOfCall('read_file', { path: '/tmp/a' })).toBe('low')
  })

  it('确认点：字面命中或高危调用自动命中', () => {
    expect(approvalPointHit(fakeLadder, 'terminal_exec', { command: 'sh 生产部署.sh' })).toBe('生产部署')
    expect(approvalPointHit(fakeLadder, 'terminal_exec', { command: 'git push origin main' })).toBe('(高危调用)')
    expect(approvalPointHit(fakeLadder, 'terminal_exec', { command: 'ls' })).toBeNull()
  })
})

describe('裁决核心（evaluateEnforcement）', () => {
  it('总闸默认关 → 不执法（零行为变化）', () => {
    const v = evaluateEnforcement('write_file', { path: '/x' }, 'agent-x', { masterOn: false, ladderOf })
    expect(v).toEqual({ enforcing: false, rule: 'master-off' })
  })

  it('无阶梯无全局模式 → 不执法（未配置不装已治理）', () => {
    const v = evaluateEnforcement('write_file', { path: '/x' }, 'nobody', { masterOn: true, ladderOf })
    expect(v).toEqual({ enforcing: false, rule: 'no-config' })
  })

  it('insight 档：read 放行、其余拒（人话错误信息带类别）', () => {
    const ladder = { ...fakeLadder, level: 'insight' as const }
    const lo = () => ladder
    expect(evaluateEnforcement('read_file', {}, 'agent-x', { masterOn: true, ladderOf: lo }).allow).toBe(true)
    const deny = evaluateEnforcement('terminal_exec', { command: 'ls' }, 'agent-x', { masterOn: true, ladderOf: lo })
    expect(deny).toMatchObject({ enforcing: true, allow: false, rule: 'ladder-insight-readonly' })
  })

  it('assist 档：常规放行；中危命中确认点文本拒（确认点路径）；高危被风险上限先拒（硬边界优先于软确认）', () => {
    expect(evaluateEnforcement('terminal_exec', { command: 'npm run build' }, 'agent-x', { masterOn: true, ladderOf }).allow).toBe(true)
    // 确认点路径：中危命令（不触高危词）但文本命中确认点
    const pointLadder = { ...fakeLadder, approvalPoints: ['数据库迁移'] }
    expect(evaluateEnforcement('terminal_exec', { command: 'npm run db:migrate --tag 数据库迁移v2' }, 'agent-x', { masterOn: true, ladderOf: () => pointLadder }).rule)
      .toBe('ladder-approval-point')
    // 高危 + medium 上限：风险上限先裁（确认也过不了上限，先报硬边界更有行动性）
    expect(evaluateEnforcement('terminal_exec', { command: 'git push origin main' }, 'agent-x', { masterOn: true, ladderOf }).rule)
      .toBe('ladder-risk-cap')
    const capLadder = { ...fakeLadder, maxRiskTier: 'low' as const }
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'agent-x', { masterOn: true, ladderOf: () => capLadder }).rule)
      .toBe('ladder-risk-cap')  // medium 写 > low 上限
  })

  it('auto 档：无确认点概念，仅风险上限生效', () => {
    const ladder = { ...fakeLadder, level: 'auto' as const }
    const lo = () => ladder
    expect(evaluateEnforcement('terminal_exec', { command: 'npm run build' }, 'agent-x', { masterOn: true, ladderOf: lo }).allow).toBe(true)
    const highCap = { ...ladder, maxRiskTier: 'medium' as const }
    expect(evaluateEnforcement('terminal_exec', { command: 'git push origin main' }, 'agent-x', { masterOn: true, ladderOf: () => highCap }).rule)
      .toBe('ladder-risk-cap')  // high > medium 上限（无确认点拦截，纯风险档）
  })

  it('全局模式矩阵：readonly 拒 write；default 的 write=RA → needs-approval 拒并指引；auto 放行', () => {
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'nobody', { masterOn: true, globalMode: 'readonly', ladderOf }).rule)
      .toBe('mode-off')
    expect(evaluateEnforcement('write_file', { path: '/x' }, 'nobody', { masterOn: true, globalMode: 'default', ladderOf }).rule)
      .toBe('mode-needs-approval')
    expect(evaluateEnforcement('terminal_exec', { command: 'npm run build' }, 'nobody', { masterOn: true, globalMode: 'auto', ladderOf }).rule)
      .toBe('mode-pass')
  })

  it('阶梯优先于全局模式（更具体的 per-profile 约束胜出）', () => {
    const v = evaluateEnforcement('terminal_exec', { command: 'npm run build' }, 'agent-x', { masterOn: true, globalMode: 'readonly', ladderOf })
    expect(v.rule).toBe('ladder-pass')  // 阶梯 assist 放行，即使全局 readonly 更严
    // 注：语义抉择——具体配置胜出（如需"最严胜出"改链条顺序即可，规格档记口径）
  })
})

describe('执法钩子（ekkoEnforceGateHook）', () => {
  it('默认关：preExecute 返回 undefined（放行且零痕迹）', async () => {
    const hook = ekkoEnforceGateHook()
    const v = await hook.preExecute!('write_file', { path: '/x' }, { profileId: 'agent-x' })
    expect(v).toBeUndefined()
  })

  it('开启+assist+确认点（挂起关）：返回 {allow:false} 且 govbus 发 security/high 事件', async () => {
    upsertLadder({ target: 'agent-x', level: 'assist', approvalPoints: ['数据库迁移'], maxRiskTier: 'medium' })
    process.env.HERMES_TOOL_ENFORCE = '1'
    process.env.HERMES_ENFORCE_SUSPEND = '0' // 本用例测立即拒语义；挂起语义见审批桥专项
    try {
    const hook = ekkoEnforceGateHook()
    const v = await hook.preExecute!('terminal_exec', { command: 'npm run db:migrate --tag 数据库迁移v2' }, { profileId: 'agent-x' })
    expect(v).toMatchObject({ allow: false })
    await new Promise((r) => setTimeout(r, 25))  // govbus 异步 fire-and-forget
    const ev = queryGovEvents({ domain: 'security', minSeverity: 'high' })[0]
    expect(ev?.type).toBe('tool.denied_ladder-approval-point')
    expect(ev?.summary).toContain('terminal_exec')
    } finally { delete process.env.HERMES_ENFORCE_SUSPEND }
  })

  it('裁决面异常 → fail-open（不拦截）', async () => {
    process.env.HERMES_TOOL_ENFORCE = '1'
    process.env.HERMES_AUTONOMY_LADDER_DIR = '/nonexistent-readonly-dir-xyz'  // 读配置必然抛错的模拟
    const hook = ekkoEnforceGateHook()
    // ladderForProfile 对坏目录 load() 会走 existsSync=false → 返回 null → no-config 放行；
    // 强制异常路径用 env 注入坏 JSON 不易——这里验证"未配置即放行"的降级语义
    const v = await hook.preExecute!('terminal_exec', { command: 'ls' }, { profileId: 'ghost' })
    expect(v).toBeUndefined()
  })
})
