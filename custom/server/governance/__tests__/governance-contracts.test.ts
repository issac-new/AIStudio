// 4A 治理层动作契约守门（spec 2026-09-29 §8 第二期 ①）——契约注册表 schema/
// refs 实物锚点/语义归一（completion_contract ∪ output_schema 判定词归口
// metrics.yaml，词面相似不构成判定依据）+ upstream 验证器存在性实证。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadActionContracts, findUpstreamRoot } from '../governance-ledger'

const ROOT = resolve(__dirname, '../../../..')
const contractsRes = loadActionContracts()

describe('① 动作契约：注册表 schema 与锚点', () => {
  it('action-contracts.yaml 存在且零 problems（含 refs.file/refs.upstream 实物存在）', () => {
    expect(contractsRes.exists, 'action-contracts.yaml 未找到').toBe(true)
    expect(contractsRes.problems, `契约校验问题：\n${contractsRes.problems.join('\n')}`).toEqual([])
  })

  it('八个关键动作全入账（create/assign/transition/delegate/mention/column/task.assign/task.receipt）', () => {
    const ids = (contractsRes.doc?.contracts ?? []).map((c) => c.id)
    for (const id of ['kanban.create', 'kanban.assign', 'kanban.transition', 'delegate_task', 'mention.dispatch', 'column.dispatch', 'task.assign', 'task.receipt']) {
      expect(ids, `缺契约 ${id}`).toContain(id)
    }
  })

  it('凡产出判定的契约判定词表均归口 metrics.yaml（语义归一红线）', () => {
    for (const c of contractsRes.doc?.contracts ?? []) {
      if (c.verdictCarrier) {
        expect(c.verdictVocabulary, `contract ${c.id} 判定词表未归口`).toBe('metrics.yaml')
      }
    }
  })
})

describe('① 语义归一：upstream 验证器存在性实证', () => {
  const upstreamRoot = findUpstreamRoot(ROOT)

  function upstreamContains(rel: string, needles: string[]): void {
    expect(upstreamRoot, 'upstream 根未找到（向上寻 6 层）').toBeTruthy()
    const file = resolve(upstreamRoot!, rel)
    expect(existsSync(file), `upstream 锚点缺失：${rel}`).toBe(true)
    const text = readFileSync(file, 'utf8')
    for (const n of needles) {
      expect(text, `${rel} 缺语义锚点「${n}」——验证器结构变更须同步 action-contracts.yaml`).toContain(n)
    }
  }

  it('kanban completion_contract 验证器在（validate_contract）', () => {
    upstreamContains('hermes-agent/hermes_cli/kanban_db.py', ['validate_contract'])
  })

  it('delegate output_schema 验证器在（output_schema + schema_valid）', () => {
    upstreamContains('hermes-agent/tools/delegate_tool.py', ['output_schema', 'schema_valid'])
  })

  it('列门禁四件套在（requiredHumanApproval/requiredChecklist/validatorCommand/gateMode）', () => {
    upstreamContains('hermes-agent/hermes_cli/kanban_gates.py', ['requiredHumanApproval', 'requiredChecklist', 'validatorCommand', 'gateMode'])
  })
})

describe('① 契约守门变异验证（有牙）', () => {
  it('verdictVocabulary 错配/缺字段/refs 失踪必被抓', async () => {
    const { validateContracts } = await import('../governance-ledger')
    const ok = contractsRes.doc!
    const badVocab = {
      ...ok,
      contracts: ok.contracts.map((c) => c.id === 'kanban.transition' ? { ...c, verdictVocabulary: 'elsewhere.md' } : c),
    }
    expect(validateContracts(badVocab, () => true, () => true).some((p) => p.includes('kanban.transition'))).toBe(true)
    const missingField = { ...ok, contracts: ok.contracts.map((c) => ({ ...c, purpose: '' })) }
    expect(validateContracts(missingField, () => true, () => true).length).toBeGreaterThan(0)
    expect(validateContracts(ok, () => false, () => true).some((p) => p.includes('refs.file'))).toBe(true)
    expect(validateContracts(ok, () => true, () => false).some((p) => p.includes('refs.upstream'))).toBe(true)
  })
})

describe('① REST 投影（HTTP 200 实证）', () => {
  it('/api/governance/contracts 返回实解内容', async () => {
    const { createServer } = await import('http')
    const Koa = (await import('koa')).default
    const { governanceRoutes } = await import('../governance-controller')
    const app = new Koa()
    app.use(governanceRoutes.routes())
    const server = createServer(app.callback())
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    const { port } = server.address() as { port: number }
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/governance/contracts`)
      expect(res.status).toBe(200)
      const body = await res.json() as { ok: boolean; problems: string[]; doc: { contracts: unknown[] } }
      expect(body.ok).toBe(true)
      expect(body.problems).toEqual([])
      expect(body.doc.contracts.length).toBeGreaterThanOrEqual(8)
    } finally {
      server.close()
    }
  })
})
