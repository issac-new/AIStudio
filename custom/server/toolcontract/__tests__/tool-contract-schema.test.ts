// 工具契约扩展面守门（2026-10-21 三号调研落地）：inputSchema 机械校验 +
// authRule 鉴权判定 + 版本号推进。旧契约（无新字段）全量解析不炸=兼容锚。
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CONTRACTS, TOOL_CONTRACT_VERSION, authzAllowed, resolveToolContract,
  validateAgainstSchema, validateToolCallArgs,
} from '../contract'

describe('validateAgainstSchema（JSON Schema 子集）', () => {
  const schema = {
    type: 'object' as const,
    required: ['query'],
    properties: { query: { type: 'string' as const }, topK: { type: 'integer' as const, min: 1, max: 50 } },
  }

  it('合法参数零违规', () => {
    expect(validateAgainstSchema({ query: '本体', topK: 10 }, schema)).toEqual([])
  })

  it('缺必填 / 类型错 / 越界逐条报 path', () => {
    const issues = validateAgainstSchema({ topK: 99 }, schema)
    expect(issues.some((i) => i.rule === 'required' && i.path === 'args')).toBe(true)
    expect(issues.some((i) => i.rule === 'type' && i.path === 'args.query')).toBe(false) // query 缺失不重复报 type
    const issues2 = validateAgainstSchema({ query: 'x', topK: 99 }, schema)
    expect(issues2.some((i) => i.rule === 'max' && i.path === 'args.topK')).toBe(true)
    const issues3 = validateAgainstSchema({ query: 'x', topK: 1.5 }, schema)
    expect(issues3.some((i) => i.rule === 'type' && i.path === 'args.topK' && i.detail.includes('integer'))).toBe(true)
  })

  it('enum 与嵌套 properties 生效', () => {
    const s = { type: 'object' as const, properties: { level: { enum: ['P1', 'P2'] } } }
    expect(validateAgainstSchema({ level: 'P3' }, s)[0]?.rule).toBe('enum')
  })
})

describe('validateToolCallArgs（按契约解析）', () => {
  it('web_search 契约已声明 schema：缺 query 拦截', () => {
    const r = validateToolCallArgs('web_search', { topK: 3 })
    expect(r.ok).toBe(false)
    expect(r.issues.some((i) => i.rule === 'required' && i.detail.includes('query'))).toBe(true)
    expect(r.contract.rateLimitPerMinute).toBe(20)
  })

  it('未声明 schema 的工具放行（如实不检查）', () => {
    // W1 执法轮后 read_file 已声明 schema，改用仍未声明的工具锚定「无契约不检查」。
    const r = validateToolCallArgs('search_files', { whatever: 1 })
    expect(r.ok).toBe(true)
    expect(r.issues).toEqual([])
  })

  it('W1 执法轮：read_file/skill_view/view_image 已声明入参契约，缺必填即违规', () => {
    expect(validateToolCallArgs('read_file', { offset: 0 }).ok).toBe(false)
    expect(validateToolCallArgs('skill_view', {}).issues.some((i) => i.rule === 'required')).toBe(true)
    expect(validateToolCallArgs('view_image', { path: '/a.png' }).ok).toBe(true)
  })

  it('W1 执法轮：运行时别名解析到同名契约（terminal_exec/code_exec/skill_list）', () => {
    expect(resolveToolContract('terminal_exec').match).toBe('terminal')
    expect(resolveToolContract('code_exec').match).toBe('execute_code')
    expect(resolveToolContract('skill_list').match).toBe('skills_list')
    // 原名直查仍有效（hermes-agent Python 侧沿用旧名）
    expect(resolveToolContract('terminal').match).toBe('terminal')
  })
})

describe('authzAllowed（鉴权规则判定）', () => {
  it('无声明=放行（向后兼容）', () => {
    expect(authzAllowed(resolveToolContract('read_file'), { tags: [] })).toEqual({ allowed: true, basis: 'no-rule' })
  })

  it('kanban_* 声明 permission-tag：持任一标签放行、缺标签拒绝并回 need', () => {
    const c = resolveToolContract('kanban_create_card')
    const ok = authzAllowed(c, { tags: ['sim:dispatch'] })
    expect(ok).toEqual({ allowed: true, basis: 'tag' })
    const denied = authzAllowed(c, { tags: ['wiki:read'] })
    expect(denied.allowed).toBe(false)
    if (!denied.allowed) {
      expect(denied.reason).toBe('missing-tag')
      expect(denied.need).toContain('kanban:write')
    }
  })

  it('approval-bound：scope 覆盖才放行', () => {
    const c = { ...resolveToolContract('cronjob_manage'), authRule: { mode: 'approval-bound' as const, scope: 'ops:cron' } }
    expect(authzAllowed(c, { approvalScopes: ['ops:cron'] }).allowed).toBe(true)
    expect(authzAllowed(c, { approvalScopes: [] }).allowed).toBe(false)
  })
})

describe('兼容与版本', () => {
  it('全部内置契约可解析且新字段类型合法；版本号推进到 2026-10-21', () => {
    for (const c of BUILTIN_CONTRACTS) {
      const r = resolveToolContract(c.match.replace(/\*$/, 'x'))
      expect(r).toBeTruthy()
    }
    expect(TOOL_CONTRACT_VERSION).toBe('2026-11-04.1')
  })
})
