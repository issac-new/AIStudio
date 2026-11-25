// 两套契约语义区分守门（2026-11-26 审查批 D 第 7 项，纯新增）。
//
// 被钉住的两个登记面语义不同，不得合并：
// ① custom/platform/contracts/execution.ts —— 工具入参契约/执行面分类：MCP_TOOL_VERBS
//    对运行时动态工具名 mcp__{server}__{tool} 做动词启发式风险分类（read/write/exec），
//    判不出即未知工具硬拒（mcp-unknown）。登记对象=工具族（动词正则+类别）。
// ② custom/server/governance/governance-ledger.ts（runtime/governance/action-contracts.yaml）
//    —— 治理动作契约声明面：关键派发/执行动作的「接口契约六件事」（用途/输入/输出/
//    错误词表/责任人+版本/变更通知），人工评审流写入。登记对象=业务动作（点分 id）。
// 误合并形态（本测试拦截）：契约 id 混入 mcp__ 前缀工具名空间、工具分类器被改成
// 认契约 id、契约错误词表混入工具风险类别词、两套登记字段面被拉平。
// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { loadActionContracts } from '../governance-ledger'
import { mcpCategoryOf, MCP_TOOL_VERBS } from '../../../platform/contracts/execution'

const contractsRes = loadActionContracts()
const contracts = contractsRes.doc?.contracts ?? []
const TOOL_CATEGORIES = ['read', 'write', 'exec'] as const

describe('两套契约语义区分（审查批 D 第 7 项）', () => {
  it('action-contracts.yaml 在场且零 problems（守门依赖真实声明面）', () => {
    expect(contractsRes.exists, 'action-contracts.yaml 未找到').toBe(true)
    expect(contractsRes.problems, `契约校验问题：\n${contractsRes.problems.join('\n')}`).toEqual([])
    expect(contracts.length).toBeGreaterThan(0)
  })

  it('契约 id 空间与 MCP 工具名空间不相交：无 mcp__ 前缀', () => {
    for (const c of contracts) {
      expect(c.id.startsWith('mcp__'), `契约 ${c.id} 混入了工具名空间（mcp__ 前缀）`).toBe(false)
    }
  })

  it('工具动词分类器不认契约 id：mcpCategoryOf 对全部契约 id 返回 null', () => {
    for (const c of contracts) {
      expect(mcpCategoryOf(c.id), `契约 ${c.id} 被工具分类器识别——两套登记被误合并`).toBeNull()
    }
  })

  it('词空间不相交：契约错误词表不含工具风险类别词（read/write/exec）', () => {
    for (const c of contracts) {
      for (const e of c.errors ?? []) {
        expect(TOOL_CATEGORIES).not.toContain(e as never)
      }
    }
  })

  it('字段面不同：工具族登记只有动词正则+类别两键；契约登记是六件事结构', () => {
    for (const entry of MCP_TOOL_VERBS) {
      expect(Object.keys(entry).sort()).toEqual(['cat', 're'])
    }
    for (const c of contracts) {
      for (const f of ['id', 'purpose', 'input', 'output', 'errors', 'owner', 'version', 'changeNotice']) {
        expect(c[f] !== undefined && c[f] !== '', `契约 ${c.id} 缺六件事字段 ${f}`).toBe(true)
      }
    }
  })

  it('工具分类器对真工具名仍分类正常（区分不误伤执行面语义）', () => {
    expect(mcpCategoryOf('mcp__jira__list_issues')).toBe('read')
    expect(mcpCategoryOf('mcp__fs__write_file')).toBe('write')
    expect(mcpCategoryOf('mcp__ops__run_deploy')).toBe('exec')
  })
})
