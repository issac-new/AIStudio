// overlay/custom/server/approval/__tests__/approval-domain.test.ts
// R5-#4 守门：五档宽度候选（candidates[0] 窄默认）+ 八态决策冻结 + 求值序
// deny→ask→allow→default + 批准即学习落规则 + 存储幂等 + 控制器接线（patch 402）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  APPROVAL_DECISIONS, APPROVAL_SCOPES, buildScopeCandidates, domainOf,
  evaluate, isApprovalDecision, ruleFromDecision,
  type ApprovalRule, type ToolCallRequest,
} from '../approval-domain'
import { ApprovalRuleStore } from '../approval-store'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')

const call = (tool: string, argv: string[]): ToolCallRequest => ({ tool, argv })

describe('五档宽度候选（candidateScopes）', () => {
  it('五档齐全且 candidates[0] 恒为窄默认（后向兼容约束）', () => {
    const c = buildScopeCandidates(call('terminal', ['git', 'push', 'origin', 'main']))
    expect(c.map((x) => x.scope)).toEqual(APPROVAL_SCOPES)
    expect(c[0].scope).toBe('narrow')
    expect(c[0].argvPrefix).toBe('git push origin main')
    expect(c[1]).toMatchObject({ scope: 'byFirstWord', argvPrefix: 'git' })
    expect(c[2]).toMatchObject({ scope: 'byArgvPrefix2', argvPrefix: 'git push' })
    expect(c[3]).toMatchObject({ scope: 'byDomain', tool: 'terminal' })
    expect(c[4]).toMatchObject({ scope: 'wholeTool', tool: 'terminal' })
  })

  it('单参调用退化为三档；域归类稳定', () => {
    const c = buildScopeCandidates(call('read_file', ['a.py']))
    expect(c.map((x) => x.scope)).toEqual(['narrow', 'byFirstWord', 'byDomain', 'wholeTool'])
    expect(domainOf('terminal')).toBe('terminal')
    expect(domainOf('write_file')).toBe('edit')
    expect(domainOf('web_search')).toBe('web')
  })
})

describe('决策八态（冻结词汇表）', () => {
  it('枚举顺序与字面值变更须显式过本守门', () => {
    expect([...APPROVAL_DECISIONS]).toEqual([
      'pending', 'approved_once', 'approved_for_session', 'approved_scoped', 'execpolicy_amendment',
      'denied_once', 'denied_for_session', 'hard_blocked',
    ])
    expect(isApprovalDecision('approved_scoped')).toBe(true)
    expect(isApprovalDecision('approved-forever')).toBe(false)
  })
})

describe('求值序 deny→ask→allow→default（安全序不可配置）', () => {
  const rules: ApprovalRule[] = [
    { list: 'allow', scope: 'global', tool: 'terminal', learnedFrom: 'approved_scoped', createdAt: 1 },
    { list: 'deny', scope: 'global', tool: 'terminal', argvPrefix: 'rm', learnedFrom: 'denied_for_session', createdAt: 2 },
    { list: 'ask', scope: 'global', tool: 'terminal', argvPrefix: 'git push', learnedFrom: 'approved_scoped', createdAt: 3 },
  ]

  it('deny 命中最优先（即便有更早的 allow）', () => {
    expect(evaluate(call('terminal', ['rm', '-rf', '/']), rules)).toMatchObject({ list: 'deny' })
  })

  it('allow 快路径先于 ask（minimax 三步决策流：硬拒绝→允许快路径→兜底 ask）', () => {
    expect(evaluate(call('terminal', ['ls', '-la']), rules)).toMatchObject({ list: 'allow' })
    // wholeTool allow 覆盖所有 terminal 调用——窄 ask 规则不再兜底（如需收紧须落 deny）。
    expect(evaluate(call('terminal', ['git', 'push']), rules)).toMatchObject({ list: 'allow' })
    // 仅 ask 规则的工具：兜底 ask 生效。
    expect(evaluate(call('deploy', ['prod']), [
      { list: 'ask', scope: 'global', tool: 'deploy', learnedFrom: 'approved_scoped', createdAt: 1 },
    ])).toMatchObject({ list: 'ask' })
  })

  it('无命中回落 defaultMode；byDomain 档跨工具命中而 wholeTool 不跨', () => {
    expect(evaluate(call('bash', ['ls']), rules, 'ask')).toMatchObject({ list: 'default', mode: 'ask' })
    const domainRules: ApprovalRule[] = [
      { list: 'ask', scope: 'global', tool: 'terminal', matchDomain: true, learnedFrom: 'approved_scoped', createdAt: 1 },
    ]
    expect(evaluate(call('bash', ['x']), domainRules, 'allow')).toMatchObject({ list: 'ask' })
  })
})

describe('批准即学习（ruleFromDecision）', () => {
  it('approved_scoped 按所选宽度落 allow；denied_for_session 落 session 档 deny；once/for_session 不学习', () => {
    const c = buildScopeCandidates(call('terminal', ['git', 'push']))
    const learned = ruleFromDecision('approved_scoped', call('terminal', ['git', 'push']), c[2], 100)
    expect(learned).toMatchObject({ list: 'allow', scope: 'global', tool: 'terminal', argvPrefix: 'git push', learnedFrom: 'approved_scoped' })
    const denied = ruleFromDecision('denied_for_session', call('terminal', ['rm']), c[0], 100)
    expect(denied).toMatchObject({ list: 'deny', scope: 'session', learnedFrom: 'denied_for_session' })
    expect(ruleFromDecision('approved_once', call('terminal', []), c[0], 1)).toBeNull()
    expect(ruleFromDecision('approved_for_session', call('terminal', []), c[0], 1)).toBeNull()
    expect(ruleFromDecision('denied_once', call('terminal', []), c[0], 1)).toBeNull()
  })
})

describe('规则存储（rules.json）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-'))
    process.env.HERMES_APPROVAL_RULES_FILE = join(dir, 'rules.json')
  })
  afterEach(() => {
    delete process.env.HERMES_APPROVAL_RULES_FILE
    rmSync(dir, { recursive: true, force: true })
  })

  it('落盘三列表+defaultMode；同键去重幂等', () => {
    const store = new ApprovalRuleStore()
    const rule: ApprovalRule = { list: 'allow', scope: 'global', tool: 'terminal', argvPrefix: 'git push', learnedFrom: 'approved_scoped', createdAt: 1 }
    store.addRule(rule)
    store.addRule(rule) // 幂等
    expect(store.list()).toHaveLength(1)
    store.setDefaultMode('deny', 'execpolicy_amendment')
    expect(store.defaultMode()).toBe('deny')
    const onDisk = JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8'))
    expect(onDisk).toMatchObject({ defaultMode: 'deny' })
    expect(onDisk.rules).toHaveLength(1)
  })

  it('坏文件容错回默认（ask/空规则不炸）', () => {
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(join(dir, 'rules.json'), '{broken')
    const store = new ApprovalRuleStore()
    expect(store.defaultMode()).toBe('ask')
    expect(store.list()).toEqual([])
  })
})

describe('控制器接线（patch 402）', () => {
  it('approval-controller 挂五端点；routes.ts 注入态含挂载', () => {
    const src = readFileSync(join(OVERLAY_ROOT, 'custom/server/approval/approval-controller.ts'), 'utf8')
    for (const route of ["router.get('/rules'", "router.post('/candidates'", "router.post('/evaluate'", "router.post('/decide'", "router.delete('/rules/:index'"]) {
      expect(src).toContain(route)
    }
    const series = readFileSync(join(OVERLAY_ROOT, 'patches/series'), 'utf8')
    expect(series).toMatch(/^402-server-approval-routes-mount\.patch$/m)
    const routesPath = join(OVERLAY_ROOT, '../upstream/hermes-studio/packages/server/src/bootstrap/routes.ts')
    if (existsSync(routesPath)) {
      expect(readFileSync(routesPath, 'utf8')).toContain("import { approvalRoutes } from '../custom/approval/approval-controller'")
    }
  })
})

describe('命令替换递归删除硬规则（cc 2.1.281 概念吸收）', () => {
  const allowAll: ApprovalRule[] = [
    { list: 'allow', scope: 'global', tool: 'terminal', learnedFrom: 'approved_scoped', createdAt: 1 },
  ]
  it('rm -rf "$(pwd)" 类：allow 全放行也强制 ask', () => {
    expect(evaluate(call('terminal', ['rm', '-rf', '"$(pwd)"']), allowAll)).toMatchObject({ list: 'ask' })
    expect(evaluate(call('terminal', ['rm', '-rf', '`pwd`/build']), allowAll)).toMatchObject({ list: 'ask' })
  })
  it('静态目标的 rm -rf 与无删除命令不受硬规则影响（allow 正常放行）', () => {
    expect(evaluate(call('terminal', ['rm', '-rf', '/tmp/build']), allowAll)).toMatchObject({ list: 'allow' })
    expect(evaluate(call('terminal', ['echo', '"$(date)"']), allowAll)).toMatchObject({ list: 'allow' })
  })
  it('deny 仍最优先于硬规则', () => {
    const denyAll: ApprovalRule[] = [
      { list: 'deny', scope: 'global', tool: 'terminal', learnedFrom: 'denied_for_session', createdAt: 1 },
    ]
    expect(evaluate(call('terminal', ['rm', '-rf', '"$(pwd)"']), denyAll)).toMatchObject({ list: 'deny' })
  })
})
