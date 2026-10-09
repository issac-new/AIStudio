import { describe, it, expect } from 'vitest'
// 派发边界纪律产品能力守门（过度交付盘查根因③，2026-10-09）：
// 模块在 overlay 正本（产品），本测试绝对路径直取——边界口径/幂等注入/角色推导/
// 模板全节点标注，任一端漂移当场红。
import {
  ROLE_BOUNDARIES, withBoundary, deriveBoundaryRole,
  roleBoundariesSnapshot, setBoundaryRegistry, setAgentRoleOverrides,
  setCapabilitiesProvider, applyBoundary,
} from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/node-executors/task-boundaries'
import {
  parseCapabilitiesTable, composeBoundary, requirementsFrom, capabilitiesRegistrySeed,
} from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/node-executors/capability-composer'
import { compileRequirementToGraph } from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/simulation-graph-template'
import { registerSimulationNodeTypes } from '/Users/cuishi/lab/ncwk/overlay/custom/server/graph/node-executors/index'

describe('派发边界纪律（task-boundaries 产品能力）', () => {
  it('五种角色边界声明齐备且含关键禁做语', () => {
    const roles = ['analyst', 'dev', 'reviewer', 'tester', 'governance'] as const
    for (const r of roles) expect(ROLE_BOUNDARIES[r].length).toBeGreaterThan(10)
    expect(ROLE_BOUNDARIES.analyst).toContain('禁写实现代码')
    expect(ROLE_BOUNDARIES.dev).toContain('不得直接推 origin/main')
    expect(ROLE_BOUNDARIES.tester).toContain('含 worktree')
    expect(ROLE_BOUNDARIES.governance).toContain('禁做任何代码或文档的集成合并')
  })

  it('withBoundary 幂等注入：带标记不叠加、空 brief 可用', () => {
    const once = withBoundary('做任务 X', 'dev')
    expect(once).toContain('【边界纪律】')
    expect(withBoundary(once, 'dev')).toBe(once)
    expect(withBoundary('', 'analyst')).toContain('【边界纪律】')
  })

  it('角色推导：显式优先；feat/ 产出=dev；文档产出=analyst；review/test 节点各归其位', () => {
    expect(deriveBoundaryRole({ boundaryRole: 'governance' }, 'task')).toBe('governance')
    expect(deriveBoundaryRole({ output: 'feat/DEV-MP' }, 'task')).toBe('dev')
    expect(deriveBoundaryRole({ output: 'docs/analysis/AN-X.md' }, 'task')).toBe('analyst')
    expect(deriveBoundaryRole({}, 'review')).toBe('reviewer')
    expect(deriveBoundaryRole({}, 'test')).toBe('tester')
  })

  it('模板全量标注：编译产物中 agent 任务节点均带 boundaryRole 且角色正确', () => {
    const spec = compileRequirementToGraph({
      title: 't', description: '微信与支付宝收银台小程序，含支付下单',
      modules: ['pay-core', 'channel-wechat'],
    })
    const tasks = spec.nodes.filter((n) => n.type === 'agent-task')
    expect(tasks.length).toBeGreaterThan(4)
    for (const n of tasks) {
      const role = (n.config as Record<string, unknown>).boundaryRole
      expect(['analyst', 'dev', 'governance'], `node ${n.id} role=${role}`).toContain(role)
    }
    const by = (id: string) => spec.nodes.find((n) => n.id === id)!.config as Record<string, unknown>
    expect(by('analysis-pay-core').boundaryRole).toBe('analyst')
    expect(by('coding-pay-core').boundaryRole).toBe('dev')
    expect(by('uat').boundaryRole).toBe('governance')
  })

  it('执行器模块可加载（边界注入接线在位）', () => {
    expect(typeof registerSimulationNodeTypes).toBe('function')
  })

  it('v2 注册表文件化：注册表加载成功（六角色含 generic 兜底）', () => {
    const snap = roleBoundariesSnapshot()
    for (const r of ['analyst', 'dev', 'reviewer', 'tester', 'governance', 'generic']) {
      expect(snap[r], `role ${r}`).toBeTruthy()
    }
  })

  it('v2 解析链：任务显式 > agent 覆盖 > 形状推导 > generic', () => {
    setAgentRoleOverrides({ 'new-agent-1': 'tester' })
    expect(deriveBoundaryRole({ boundaryRole: 'governance', assignee: 'new-agent-1' }, 'task')).toBe('governance') // 显式最高
    expect(deriveBoundaryRole({ assignee: 'new-agent-1', output: 'feat/X' }, 'task')).toBe('tester') // 覆盖层压过形状
    expect(deriveBoundaryRole({ assignee: 'unknown-2', output: 'feat/X' }, 'task')).toBe('dev') // 无覆盖走形状
    expect(deriveBoundaryRole({ assignee: 'unknown-2', output: 'bin/data' }, 'task')).toBe('generic') // 未知形状兜底
    setAgentRoleOverrides({})
  })

  it('v2 新角色零代码接入：注册表加模板即生效（分布式 fleet 扩展路径）', () => {
    const snapBefore = roleBoundariesSnapshot()
    const restore = Object.entries(snapBefore).map(([role, text]) => ({ role, text }))
    setBoundaryRegistry([...restore, { role: 'sre-oncall', text: '值班只做止血与升级；禁做功能开发与合并。' }])
    expect(withBoundary('处理告警', 'sre-oncall')).toContain('值班只做止血')
    expect(deriveBoundaryRole({ boundaryRole: 'sre-oncall' }, 'task')).toBe('sre-oncall')
    setBoundaryRegistry(restore) // 还原，不污染其他用例
  })

  it('M3 注册表解析：seed 表全量解析出四维声明', () => {
    const table = parseCapabilitiesTable(capabilitiesRegistrySeed())
    expect(table['chen']?.['vcs-scope']).toBe('own-branch-only')
    expect(table['fanfan']?.['integration-authority']).toBe('none')
    expect(table['qi']?.['deliverable-kinds']).toContain('test-report')
    expect(table['no-such-agent']).toBeUndefined()
  })

  it('M3 否定式合成：未授权维度生成显式禁止；全授权不合成；无声明不合成（宁紧勿松）', () => {
    // fanfan 声明 doc,report——要求写代码 → 禁代做
    const c = composeBoundary(requirementsFrom({ output: 'feat/DEV-X' }, 'task'), {
      'deliverable-kinds': ['doc', 'report'], 'vcs-scope': 'main-docs-only', 'integration-authority': 'none',
    })
    expect(c).toContain('未声明该类交付权限')
    expect(c).toContain('不得提交代码')
    // chen 声明 code——同任务全授权 → 不合成（模板地板仍会注入）
    expect(composeBoundary(requirementsFrom({ output: 'feat/DEV-X' }, 'task'), {
      'deliverable-kinds': ['code'], 'vcs-scope': 'own-branch-only',
    })).toBeNull()
    // 域不匹配（声明只管 pay-core，任务域 X）→ 转交
    const d = composeBoundary(requirementsFrom({ output: 'feat/DEV-X' }, 'task'), {
      'deliverable-kinds': ['code'], 'vcs-scope': 'own-branch-only', 'domain-scope': ['csw-pay-core'],
    })
    expect(d).toContain('须转交域内负责人')
    // 无声明 → null（走模板链，不放松）
    expect(composeBoundary(requirementsFrom({ output: 'feat/X' }, 'task'), undefined)).toBeNull()
  })

  it('M2 派发合成链：applyBoundary=模板地板+否定式条款叠加（provider 注入生效）', () => {
    setCapabilitiesProvider((a) => (a === 'fanfan' ? {
      'deliverable-kinds': ['doc', 'report'], 'vcs-scope': 'main-docs-only', 'integration-authority': 'none',
    } : undefined))
    const out = applyBoundary('开发收银台', { assignee: 'fanfan', output: 'feat/DEV-MP' }, 'task')
    expect(out).toContain('【边界纪律】')
    expect(out).toContain('不得直接推 origin/main')       // dev 模板地板
    expect(out).toContain('未声明该类交付权限')            // 否定式叠加（宁紧勿松：只增禁令）
    const unhooked = applyBoundary('做任务', { assignee: 'unknown-9', output: 'feat/X' }, 'task')
    expect(unhooked).toContain('不得直接推 origin/main')   // 无声明走地板
    setCapabilitiesProvider(null)
  })
})
