// B2 守门：提供方策略层——opencode v2 provider-policy 契约（最后匹配生效/
// 治理面压轴权威/默认放行/通配/词表校验）+ REST 级联（GET effectivePolicy/
// PUT 策略随档/层 2 写穿跳过被拒 provider）。
import { describe, it, expect } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'
import {
  evaluateProviderPolicy, matchPolicyResource, validatePolicyStatements,
  loadGovernancePolicyStatements, deniedProviderIds, type PolicyStatement,
} from '../provider-policy'

describe('B2 纯判定核', () => {
  it('通配：company-* 匹配 company-glm；空模式不匹配；字面量转义', () => {
    expect(matchPolicyResource('company-*', 'company-glm')).toBe(true)
    expect(matchPolicyResource('company-*', 'openai')).toBe(false)
    expect(matchPolicyResource('*', 'anything')).toBe(true)
    expect(matchPolicyResource('', 'x')).toBe(false)
    expect(matchPolicyResource('a.b', 'axb')).toBe(false)
    expect(matchPolicyResource('a.b', 'a.b')).toBe(true)
  })

  it('最后匹配生效；无匹配默认 allow（opencode 契约）', () => {
    const deny: PolicyStatement[] = [{ effect: 'deny', resource: '*' }]
    const allowThen: PolicyStatement[] = [
      { effect: 'allow', resource: 'openai' },
      { effect: 'deny', resource: 'openai' },
    ]
    expect(evaluateProviderPolicy([], [], 'openai')).toEqual({ allowed: true, source: 'default' })
    expect(evaluateProviderPolicy(deny, [], 'openai').allowed).toBe(false)
    expect(evaluateProviderPolicy(allowThen, [], 'openai').allowed).toBe(false)
    // 反序：deny 后 allow → allow（最后匹配）
    expect(evaluateProviderPolicy([...allowThen].reverse(), [], 'openai').allowed).toBe(true)
  })

  it('治理面压轴：治理 deny 压过用户 allow；治理 allow 只取消更早 deny、不越权', () => {
    const user: PolicyStatement[] = [{ effect: 'deny', resource: 'openai' }]
    const gov: PolicyStatement[] = [{ effect: 'allow', resource: 'openai' }]
    expect(evaluateProviderPolicy(user, gov, 'openai')).toMatchObject({ allowed: true, source: 'governance' })
    const userAllow: PolicyStatement[] = [{ effect: 'allow', resource: 'openai' }]
    const govDeny: PolicyStatement[] = [{ effect: 'deny', resource: 'openai' }]
    expect(evaluateProviderPolicy(userAllow, govDeny, 'openai')).toMatchObject({ allowed: false, source: 'governance' })
    const bothDeny: PolicyStatement[] = [{ effect: 'deny', resource: '*' }]
    expect(evaluateProviderPolicy(bothDeny, govDeny, 'openai').source).toBe('governance')
  })

  it('语句校验：effect 词表/resource 必填限长/计数上限', () => {
    expect(validatePolicyStatements(null)).toEqual({ ok: true, statements: [] })
    const bad = validatePolicyStatements([{ effect: 'maybe', resource: 'x' }, { effect: 'deny', resource: '' }, 'junk'])
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.problems.length).toBeGreaterThanOrEqual(3)
    expect(validatePolicyStatements(Array.from({ length: 51 }, () => ({ effect: 'deny' as const, resource: 'x' }))).ok).toBe(false)
  })

  it('治理面加载 fail-soft：缺席/坏档/结构不符=空；合法档读取', () => {
    const dir = mkdtempSync(join(tmpdir(), 'bpp-'))
    expect(loadGovernancePolicyStatements(join(dir, 'none.json'))).toEqual([])
    const badPath = join(dir, 'bad.json')
    writeFileSync(badPath, '{oops', 'utf8')
    expect(loadGovernancePolicyStatements(badPath)).toEqual([])
    const goodPath = join(dir, 'good.json')
    writeFileSync(goodPath, JSON.stringify({ statements: [{ effect: 'deny', resource: 'shadow-*' }] }), 'utf8')
    expect(loadGovernancePolicyStatements(goodPath)).toEqual([{ effect: 'deny', resource: 'shadow-*' }])
    rmSync(dir, { recursive: true, force: true })
  })

  it('deniedProviderIds：目录过滤投影', () => {
    const out = deniedProviderIds([{ effect: 'deny', resource: 'shadow-*' }], [], ['openai', 'shadow-1', 'shadow-2'])
    expect(out.map((x) => x.providerId)).toEqual(['shadow-1', 'shadow-2'])
    expect(out[0].verdict.source).toBe('user')
  })
})

describe('B2 REST 级联（engine-models 策略随档）', () => {
  const dir = mkdtempSync(join(tmpdir(), 'bpp-rest-'))
  const engineStore = join(dir, 'engine-models.json')
  process.env.ENGINE_MODEL_STORE = engineStore
  process.env.HERMES_GOVERNANCE_POLICY = join(dir, 'gov.json')
  // 临时 ZCODE_HOME（层 2 写穿目标）
  const zhome = join(dir, 'zhome')
  mkdirSync(join(zhome, 'v2'), { recursive: true })
  writeFileSync(join(zhome, 'v2', 'config.json'), JSON.stringify({ provider: { 'ide-engine:shadow-stale': { name: '旧残留' } } }), 'utf8')
  process.env.ZCODE_HOME = zhome
  process.env.BPP_TEST_KEY = 'sk-test'

  interface CtxShape { request: { body: Record<string, unknown> }; status: number; body: unknown }
  async function run(router: Router, method: 'get' | 'put', ctx: Partial<CtxShape>): Promise<CtxShape> {
    const full: CtxShape = { request: { body: {} }, status: 200, body: undefined, ...ctx } as CtxShape
    const layer = router.stack.find((l) => l.methods.includes(method.toUpperCase()) && l.match('/api/ide/engine-models'))
    expect(layer, 'route exists').toBeTruthy()
    for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
      await mw(full, async () => {})
    }
    return full
  }

  it('PUT 带策略→GET effectivePolicy（治理面 deny 权威）；层 2 跳过被拒并清残留', async () => {
    // 治理面拒 shadow-*
    writeFileSync(join(dir, 'gov.json'), JSON.stringify({ statements: [{ effect: 'deny', resource: 'shadow-*' }] }), 'utf8')
    const mod = await import('../../controllers/ide/engine-models')
    const router = mod.default as unknown as Router

    const put = await run(router, 'put', {
      request: { body: {
        // 用户 allow shadow-1（试图盖治理 deny——必须被压过）
        policy: { statements: [{ effect: 'allow', resource: 'shadow-1' }] },
        providers: [
          { providerId: 'good-openai', baseURL: 'https://api.example.com', apiKeyEnv: 'BPP_TEST_KEY', models: [{ modelId: 'g-test' }] },
          { providerId: 'shadow-1', baseURL: 'https://shadow.example.com', models: [{ modelId: 's-test' }] },
        ],
        defaultModel: { providerId: 'good-openai', modelId: 'g-test' },
      } },
    })
    expect(put.status).toBe(200)
    const passthrough = (put.body as { enginePassthrough: { providerKeys: string[]; note: string } }).enginePassthrough
    expect(passthrough.providerKeys).toEqual(['ide-engine:good-openai']) // shadow-1 被拒未写
    expect(passthrough.note).toContain('策略拒配跳过')

    const engineCfg = JSON.parse(readFileSync(join(zhome, 'v2', 'config.json'), 'utf8')) as { provider: Record<string, unknown> }
    expect(engineCfg.provider['ide-engine:good-openai']).toBeTruthy()
    expect(engineCfg.provider['ide-engine:shadow-1']).toBeUndefined()
    expect(engineCfg.provider['ide-engine:shadow-stale']).toBeUndefined() // 残留被清

    const get = await run(router, 'get', {})
    const body = get.body as {
      effectivePolicy: { denied: Array<{ providerId: string; verdict: { source: string } }>; governanceCount: number; userCount: number }
    }
    expect(body.effectivePolicy.governanceCount).toBe(1)
    expect(body.effectivePolicy.userCount).toBe(1)
    expect(body.effectivePolicy.denied).toEqual([
      expect.objectContaining({ providerId: 'shadow-1', verdict: expect.objectContaining({ source: 'governance', allowed: false }) }),
    ])

    // 策略随档持久化（重读 store 保留 policy 字段）
    expect(JSON.parse(readFileSync(engineStore, 'utf8')).policy.statements).toEqual([{ effect: 'allow', resource: 'shadow-1' }])
    rmSync(dir, { recursive: true, force: true })
  })
})
