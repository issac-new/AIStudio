// overlay/custom/server/approval/__tests__/approval-domain.test.ts
// R5-#4 守门：五档宽度候选（candidates[0] 窄默认）+ 八态决策冻结 + 求值序
// deny→ask→allow→default + 批准即学习落规则 + 存储幂等 + 控制器接线（patch 402）。
// X2 收口：规则读删归属——list/decide 回包按归属过滤，delete 下标按可见集（删对行）、
// 摘除权本人/super_admin（B 删不到 A 的规则）。
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, readdirSync } from 'fs'
import { homedir, tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  APPROVAL_DECISIONS, APPROVAL_SCOPES, buildScopeCandidates, domainOf,
  evaluate, isApprovalDecision, makeOwnershipPredicate, ruleFromDecision,
  canRemoveRule, ruleVisibleTo,
  type ApprovalRule, type ToolCallRequest,
} from '../approval-domain'
import { ApprovalRuleStore, __resetApprovalStoreForTests, resolveApprovalRulesPath } from '../approval-store'
import { approvalRoutes } from '../approval-controller'

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

  it('X2：学习规则记 owner；session 档绑定调用会话（不再全局可见）', () => {
    const c = buildScopeCandidates(call('terminal', ['rm']))
    const learned = ruleFromDecision('approved_scoped', call('terminal', ['rm']), c[0], 100, 'alice')
    expect(learned).toMatchObject({ owner: 'alice' })
    const denied = ruleFromDecision('denied_for_session', { tool: 'terminal', argv: ['rm'], sessionId: 's-42' }, c[0], 100, 'alice')
    expect(denied).toMatchObject({ list: 'deny', scope: 'session', owner: 'alice', sessionId: 's-42' })
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

  it('坏文件改名留档回默认（ask/空规则不炸，不静默清零）', () => {
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(join(dir, 'rules.json'), '{broken')
    const store = new ApprovalRuleStore()
    expect(store.defaultMode()).toBe('ask')
    expect(store.list()).toEqual([])
    // 坏文件留档 <path>.corrupt 保现场（可人工修复回填），原路径让位给后续干净写入
    expect(readFileSync(join(dir, 'rules.json.corrupt'), 'utf8')).toBe('{broken')
    expect(existsSync(join(dir, 'rules.json'))).toBe(false)
  })

  it('save 原子替换：临时文件 + rename，落盘无 .tmp 残留且整体替换', () => {
    const store = new ApprovalRuleStore()
    const rule: ApprovalRule = { list: 'allow', scope: 'global', tool: 'terminal', argvPrefix: 'git push', learnedFrom: 'approved_scoped', createdAt: 1 }
    store.save({ defaultMode: 'allow', rules: [rule] })
    expect(readdirSync(dir)).toEqual(['rules.json'])
    expect(JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8')).defaultMode).toBe('allow')
    store.save({ defaultMode: 'deny', rules: [] }) // 覆盖写同样走 rename，不留半截/临时文件
    expect(readdirSync(dir)).toEqual(['rules.json'])
    expect(JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8')).defaultMode).toBe('deny')
    expect(store.list()).toEqual([])
  })

  it('存储机制源级守门：path.dirname 切目录、rename 原子替换、坏文件 .corrupt 留档', () => {
    const src = readFileSync(join(OVERLAY_ROOT, 'custom/server/approval/approval-store.ts'), 'utf8')
    expect(src).toContain('dirname(this.path)') // 不用 lastIndexOf('/') 切目录（Windows 反斜杠路径会切出垃圾串）
    expect(src).not.toContain("lastIndexOf('/')")
    expect(src).toContain('renameSync(tmp') // 临时文件 + rename 原子替换，不直接覆盖写
    expect(src).toContain('.corrupt') // 坏文件留档
    expect(src).toContain('console.warn') // 解析失败可观测，不静默
  })
})

describe('规则文件路径解析（不落 cwd）', () => {
  let dir: string
  const savedEnv = process.env.HERMES_APPROVAL_RULES_FILE
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-path-'))
    delete process.env.HERMES_APPROVAL_RULES_FILE
  })
  afterEach(() => {
    if (savedEnv === undefined) delete process.env.HERMES_APPROVAL_RULES_FILE
    else process.env.HERMES_APPROVAL_RULES_FILE = savedEnv
    rmSync(dir, { recursive: true, force: true })
  })

  it('env 显式优先；缺省落 ~/.hermes-web-ui/approval（去掉 cwd 档：serve-server 以 upstream 为 cwd，cwd 档会写只读 upstream 树）', () => {
    const explicit = join(dir, 'rules.json')
    process.env.HERMES_APPROVAL_RULES_FILE = explicit
    expect(resolveApprovalRulesPath()).toBe(resolve(explicit))
    delete process.env.HERMES_APPROVAL_RULES_FILE
    expect(resolveApprovalRulesPath()).toBe(join(homedir(), '.hermes-web-ui', 'approval', 'rules.json'))
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

describe('归属谓词（X2：owner 按调用方身份匹配）', () => {
  const ownedByAlice: ApprovalRule = { list: 'allow', scope: 'global', tool: 'terminal', owner: 'alice', learnedFrom: 'approved_scoped', createdAt: 1 }
  const unowned: ApprovalRule = { list: 'deny', scope: 'global', tool: 'deploy', learnedFrom: 'denied_for_session', createdAt: 2 }

  it('他人规则不可见；本人与 super_admin 可见；无主规则全可见（旧档最小惊讶）', () => {
    const asAlice = makeOwnershipPredicate({ username: 'alice', role: 'admin' })
    const asBob = makeOwnershipPredicate({ username: 'bob', role: 'admin' })
    const asRoot = makeOwnershipPredicate({ username: 'root', role: 'super_admin' })
    expect(asAlice(ownedByAlice, call('terminal', []))).toBe(true)
    expect(asBob(ownedByAlice, call('terminal', []))).toBe(false)
    expect(asRoot(ownedByAlice, call('terminal', []))).toBe(true)
    for (const p of [asAlice, asBob, asRoot]) expect(p(unowned, call('deploy', []))).toBe(true)
  })

  it('未启用鉴权（调用方缺席）→ 全可见（单用户部署）；缺省谓词隐藏带 owner 规则', () => {
    expect(makeOwnershipPredicate(null)(ownedByAlice, call('terminal', []))).toBe(true)
    // evaluate 不注入谓词（缺省）：带 owner 的规则不参与求值，回落 defaultMode
    expect(evaluate(call('terminal', []), [ownedByAlice], 'ask')).toMatchObject({ list: 'default', mode: 'ask' })
    // 注入身份谓词后可见
    expect(evaluate(call('terminal', []), [ownedByAlice], 'ask', makeOwnershipPredicate({ username: 'alice' }))).toMatchObject({ list: 'allow' })
  })

  it('读删谓词同源（X2 收口）：ruleVisibleTo 同可见性；摘除权本人/super_admin，无主与他人仅 super_admin', () => {
    expect(ruleVisibleTo({ username: 'alice', role: 'admin' }, ownedByAlice)).toBe(true)
    expect(ruleVisibleTo({ username: 'bob', role: 'admin' }, ownedByAlice)).toBe(false)
    expect(canRemoveRule({ username: 'alice', role: 'admin' }, ownedByAlice)).toBe(true)
    expect(canRemoveRule({ username: 'bob', role: 'admin' }, ownedByAlice)).toBe(false)
    expect(canRemoveRule({ username: 'bob', role: 'admin' }, unowned)).toBe(false) // 无主=全局策略，摘除归管理面
    expect(canRemoveRule({ username: 'root', role: 'super_admin' }, ownedByAlice)).toBe(true)
    expect(canRemoveRule(null, ownedByAlice)).toBe(true) // 未启用鉴权放行（单用户部署）
  })
})

describe('上下文绑定（X2：session/agent 档不再全局可见）', () => {
  it('session 档只在绑定会话内可见；无绑定旧档保持升级前宽语义', () => {
    const bound: ApprovalRule = { list: 'deny', scope: 'session', tool: 'terminal', argvPrefix: 'rm', sessionId: 's-42', learnedFrom: 'denied_for_session', createdAt: 1 }
    expect(evaluate({ tool: 'terminal', argv: ['rm', '-rf'], sessionId: 's-42' }, [bound])).toMatchObject({ list: 'deny' })
    expect(evaluate({ tool: 'terminal', argv: ['rm', '-rf'], sessionId: 'other' }, [bound], 'allow')).toMatchObject({ list: 'default', mode: 'allow' })
    const legacy: ApprovalRule = { list: 'deny', scope: 'session', tool: 'terminal', argvPrefix: 'rm', learnedFrom: 'denied_for_session', createdAt: 1 }
    expect(evaluate({ tool: 'terminal', argv: ['rm', '-rf'], sessionId: 'other' }, [legacy])).toMatchObject({ list: 'deny' })
  })

  it('agent 档同理绑定 agentId；无 agent 上下文的调用不见 agent 档规则', () => {
    const bound: ApprovalRule = { list: 'allow', scope: 'agent', tool: 'terminal', agentId: 'a-1', learnedFrom: 'approved_scoped', createdAt: 1 }
    expect(evaluate({ tool: 'terminal', argv: ['ls'], agentId: 'a-1' }, [bound])).toMatchObject({ list: 'allow' })
    expect(evaluate({ tool: 'terminal', argv: ['ls'], agentId: 'a-2' }, [bound], 'ask')).toMatchObject({ list: 'default', mode: 'ask' })
    expect(evaluate({ tool: 'terminal', argv: ['ls'] }, [bound], 'ask')).toMatchObject({ list: 'default', mode: 'ask' })
  })
})

describe('X2 归属持久化（owner 字段 + 旧档兼容 + 按归属去重）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-owner-'))
    process.env.HERMES_APPROVAL_RULES_FILE = join(dir, 'rules.json')
    __resetApprovalStoreForTests()
  })
  afterEach(() => {
    delete process.env.HERMES_APPROVAL_RULES_FILE
    __resetApprovalStoreForTests()
    rmSync(dir, { recursive: true, force: true })
  })

  it('owner 落盘回读；两用户同款规则不去重互吞（去重键含归属）', () => {
    const store = new ApprovalRuleStore()
    const base = { list: 'allow' as const, scope: 'global' as const, tool: 'terminal', learnedFrom: 'approved_scoped' as const, createdAt: 1 }
    store.addRule({ ...base, owner: 'alice' })
    store.addRule({ ...base, owner: 'alice' }) // 同人同款 → 幂等去重
    store.addRule({ ...base, owner: 'bob' })   // 异人同款 → 各自持有一条
    expect(store.list()).toHaveLength(2)
    expect(JSON.parse(readFileSync(join(dir, 'rules.json'), 'utf8')).rules.map((r: { owner: string }) => r.owner).sort()).toEqual(['alice', 'bob'])
  })

  it('旧档缺 owner 原样保留（无主=全局可见，最小惊讶）；非法类型剥掉', () => {
    const fs = require('fs') as typeof import('fs')
    fs.writeFileSync(join(dir, 'rules.json'), JSON.stringify({
      defaultMode: 'ask',
      rules: [
        { list: 'allow', scope: 'global', tool: 'terminal', learnedFrom: 'approved_scoped', createdAt: 1 },
        { list: 'deny', scope: 'session', tool: 'terminal', owner: 123, sessionId: ['bad'], learnedFrom: 'denied_for_session', createdAt: 2 },
      ],
    }))
    const store = new ApprovalRuleStore()
    expect(store.list()[0].owner).toBeUndefined() // 旧档无主 → 全局可见
    expect(makeOwnershipPredicate({ username: 'bob', role: 'admin' })(store.list()[0], call('terminal', []))).toBe(true)
    expect(store.list()[1].owner).toBeUndefined() // 非法类型剥掉
    expect(store.list()[1].sessionId).toBeUndefined()
  })
})

describe('X2 控制器权限面（approval-controller：owner 注入 + setDefaultMode 管理闸 + rules 读删归属）', () => {
  type Handler = (ctx: Record<string, unknown>) => Promise<void>

  /** 从 @koa/router 的 layer 栈取裸 handler（不经 HTTP，直接喂 fake ctx）。 */
  function handlerFor(method: string, path: string): Handler {
    const layers = (approvalRoutes as unknown as {
      stack: Array<{ path: string; methods: string[]; stack: Array<(...a: unknown[]) => unknown> }>
    }).stack
    const layer = layers.find((l) => l.path.endsWith(path) && l.methods.includes(method))
    if (!layer) throw new Error(`route not found: ${method} ${path}`)
    return layer.stack[layer.stack.length - 1] as Handler
  }

  function fakeCtx(body: Record<string, unknown>, user?: { username: string; role: string }, params: Record<string, string> = {}): Record<string, unknown> {
    return { request: { body }, params, state: user ? { user } : {}, status: 200, body: undefined }
  }

  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'approval-ctrl-'))
    process.env.HERMES_APPROVAL_RULES_FILE = join(dir, 'rules.json')
    __resetApprovalStoreForTests()
  })
  afterEach(() => {
    delete process.env.HERMES_APPROVAL_RULES_FILE
    __resetApprovalStoreForTests()
    rmSync(dir, { recursive: true, force: true })
  })

  it('execpolicy_amendment 改全局默认档须 super_admin：admin 被 403 且不落盘', async () => {
    const setDefault = handlerFor('POST', '/decide')
    const call0 = { tool: 'terminal', argv: [] }
    const denied = fakeCtx({ decision: 'execpolicy_amendment', defaultMode: 'allow', call: call0 }, { username: 'alice', role: 'admin' })
    await setDefault(denied)
    expect(denied.status).toBe(403)
    expect(new ApprovalRuleStore().defaultMode()).toBe('ask')
    const allowed = fakeCtx({ decision: 'execpolicy_amendment', defaultMode: 'allow', call: call0 }, { username: 'root', role: 'super_admin' })
    await setDefault(allowed)
    expect(allowed.body).toMatchObject({ ok: true, defaultMode: 'allow' })
    expect(new ApprovalRuleStore().defaultMode()).toBe('allow')
  })

  it('decide 学习规则 owner 取认证主体（body 自报身份不采信）；未启用鉴权不记 owner', async () => {
    const decide = handlerFor('POST', '/decide')
    const ctx = fakeCtx({ decision: 'approved_scoped', call: { tool: 'terminal', argv: ['ls'] }, candidate: { scope: 'wholeTool', tool: 'terminal', label: '' }, owner: 'mallory' }, { username: 'alice', role: 'admin' })
    await decide(ctx)
    expect((ctx.body as { learnedRule: { owner?: string } }).learnedRule.owner).toBe('alice')
    const anon = fakeCtx({ decision: 'approved_scoped', call: { tool: 'terminal', argv: ['git', 'push'] } })
    await decide(anon)
    expect((anon.body as { learnedRule: { owner?: string } }).learnedRule.owner).toBeUndefined()
  })

  it('evaluate 按调用方身份隔离：只见自己的规则 + 无主规则', async () => {
    new ApprovalRuleStore().addRule({ list: 'allow', scope: 'global', tool: 'terminal', owner: 'alice', learnedFrom: 'approved_scoped', createdAt: 1 })
    const preview = handlerFor('POST', '/evaluate')
    const asBob = fakeCtx({ tool: 'terminal', argv: ['ls'] }, { username: 'bob', role: 'admin' })
    await preview(asBob)
    expect((asBob.body as { verdict: { list: string } }).verdict.list).toBe('default')
    const asAlice = fakeCtx({ tool: 'terminal', argv: ['ls'] }, { username: 'alice', role: 'admin' })
    await preview(asAlice)
    expect((asAlice.body as { verdict: { list: string } }).verdict.list).toBe('allow')
  })

  it('GET /rules 读归属：只回本人 + 无主规则；super_admin 全量；decide 回包 rules 同过滤（读面不旁路）', async () => {
    const base = { list: 'allow' as const, scope: 'global' as const, learnedFrom: 'approved_scoped' as const, createdAt: 1 }
    new ApprovalRuleStore().addRule({ ...base, tool: 'terminal', owner: 'alice' })
    new ApprovalRuleStore().addRule({ ...base, tool: 'deploy', owner: 'bob' })
    new ApprovalRuleStore().addRule({ ...base, tool: 'write_file' }) // 无主（旧档/人工置入的全局策略）
    const listRules = handlerFor('GET', '/rules')
    const asBob = fakeCtx({}, { username: 'bob', role: 'admin' })
    await listRules(asBob)
    expect((asBob.body as { rules: Array<{ owner?: string }> }).rules.map((r) => r.owner ?? null)).toEqual(['bob', null]) // 本人 + 无主
    const asRoot = fakeCtx({}, { username: 'root', role: 'super_admin' })
    await listRules(asRoot)
    expect((asRoot.body as { rules: unknown[] }).rules).toHaveLength(3)
    const decide = handlerFor('POST', '/decide')
    const decided = fakeCtx({ decision: 'approved_once', call: { tool: 'terminal', argv: ['ls'] } }, { username: 'alice', role: 'admin' })
    await decide(decided)
    expect((decided.body as { rules: Array<{ owner?: string }> }).rules.map((r) => r.owner ?? null)).toEqual(['alice', null])
  })

  it('B 删不到 A 的规则：可见集外下标 404 且 A 规则仍在（下标同源，不删错行）', async () => {
    new ApprovalRuleStore().addRule({ list: 'allow', scope: 'global', tool: 'terminal', owner: 'alice', learnedFrom: 'approved_scoped', createdAt: 1 })
    const remove = handlerFor('DELETE', '/rules/:index')
    const asBob = fakeCtx({}, { username: 'bob', role: 'admin' }, { index: '0' })
    await remove(asBob)
    expect(asBob.status).toBe(404)
    // 新实例读盘核对（同实例有内存缓存，会掩盖误删）
    expect(new ApprovalRuleStore().list()).toMatchObject([{ owner: 'alice' }])
  })

  it('下标语义按可见集：B 的 index 0 = B 自己那行（删对行），A 的行不动', async () => {
    const base = { list: 'allow' as const, scope: 'global' as const, learnedFrom: 'approved_scoped' as const, createdAt: 1 }
    new ApprovalRuleStore().addRule({ ...base, tool: 'terminal', owner: 'alice' }) // 全量下标 0（B 不可见）
    new ApprovalRuleStore().addRule({ ...base, tool: 'deploy', owner: 'bob' }) // B 的可见下标 0
    const remove = handlerFor('DELETE', '/rules/:index')
    const asBob = fakeCtx({}, { username: 'bob', role: 'admin' }, { index: '0' })
    await remove(asBob)
    expect(asBob.body).toMatchObject({ ok: true })
    expect((asBob.body as { removed: { owner: string } }).removed.owner).toBe('bob')
    expect(new ApprovalRuleStore().list().map((r) => r.owner)).toEqual(['alice']) // A 的规则仍在
  })

  it('super_admin 按全量可见集可摘他人规则；无主全局策略非 super_admin 摘不动（403 且仍在）', async () => {
    const base = { list: 'deny' as const, scope: 'global' as const, learnedFrom: 'denied_for_session' as const, createdAt: 1 }
    new ApprovalRuleStore().addRule({ ...base, tool: 'terminal', owner: 'alice' })
    new ApprovalRuleStore().addRule({ ...base, tool: 'deploy' }) // 无主全局策略
    const remove = handlerFor('DELETE', '/rules/:index')
    const asRoot = fakeCtx({}, { username: 'root', role: 'super_admin' }, { index: '0' })
    await remove(asRoot)
    expect((asRoot.body as { removed: { owner?: string } }).removed.owner).toBe('alice')
    expect(new ApprovalRuleStore().list().map((r) => r.tool)).toEqual(['deploy'])
    const asBob = fakeCtx({}, { username: 'bob', role: 'admin' }, { index: '0' }) // bob 可见该行（可见下标 0）
    await remove(asBob)
    expect(asBob.status).toBe(403)
    expect(new ApprovalRuleStore().list()).toHaveLength(1) // 无主全局策略仍在
  })
})
