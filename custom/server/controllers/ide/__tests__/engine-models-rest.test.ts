// 引擎独立模型配置 REST 守门（router-harness 模式=session-share-round6 同款；
// 存储经 ENGINE_MODEL_STORE 注入临时文件，不碰生产 runtime/）。
import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync as fs_mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import Router from '@koa/router'

const dir = mkdtempSync(join(tmpdir(), 'engine-models-'))
process.env.ENGINE_MODEL_STORE = join(dir, 'engine-models.json')

interface CtxShape {
  request: { body: Record<string, unknown> }
  status: number
  body: unknown
}

async function run(router: Router, method: 'get' | 'put', ctx: Partial<CtxShape>): Promise<CtxShape> {
  const full: CtxShape = { request: { body: {} }, status: 200, body: undefined, ...ctx } as CtxShape
  const layer = router.stack.find((l) => l.methods.includes(method.toUpperCase()) && l.match('/api/ide/engine-models'))
  expect(layer, 'route exists').toBeTruthy()
  for (const mw of (layer as unknown as { stack: Array<(c: CtxShape, next?: () => Promise<void>) => Promise<void>> }).stack) {
    await mw(full, async () => {})
  }
  return full
}

describe('/api/ide/engine-models（独立设置守门）', () => {
  let router: Router
  beforeAll(async () => {
    const mod = await import('../engine-models')
    router = mod.default as unknown as Router
  })
  beforeEach(() => {
    if (existsSync(join(dir, 'engine-models.json'))) rmSync(join(dir, 'engine-models.json'))
  })

  it('GET 空态：空目录+独立存储声明（与 hermes 零共享）', async () => {
    const res = await run(router, 'get', {})
    expect(res.status).toBe(200)
    const body = res.body as { ok: boolean; config: { providers: unknown[] }; store: string }
    expect(body.ok).toBe(true)
    expect(body.config.providers).toEqual([])
    expect(body.store).toContain('engine-models.json')
  })

  it('层 2 写穿：合法 PUT 同步写 ~/.zcode/v2/config.json（ide-engine: 前缀+用户条目零触碰+env 缺失禁用）', async () => {
    // 临时 ZCODE_HOME（引擎配置树）
    const zhome = join(dir, 'zhome')
    mkdtempSync; // keep import used
    const v2 = join(zhome, 'v2')
    fs_mkdirSync(v2, { recursive: true })
    const engineCfgPath = join(v2, 'config.json')
    writeFileSync(engineCfgPath, JSON.stringify({ provider: { 'builtin:user-own': { name: 'User Own', kind: 'anthropic', options: {}, enabled: true } } }), 'utf8')
    process.env.ZCODE_HOME = zhome
    process.env.TEST_KEY_X = 'secret-value'

    const res = await run(router, 'put', {
      request: { body: {
        providers: [
          { providerId: 'with-key', baseURL: 'https://a.com/v1', apiKeyEnv: 'TEST_KEY_X', models: [{ modelId: 'm1', reasoningLevels: ['low'] }] },
          { providerId: 'no-key', baseURL: 'https://b.com/v1', apiKeyEnv: 'MISSING_ENV_VAR', models: [{ modelId: 'm2' }] },
        ],
        defaultModel: { providerId: 'with-key', modelId: 'm1' },
      } },
    })
    expect(res.status).toBe(200)
    const body = res.body as { enginePassthrough: { wrote: boolean; providerKeys: string[] } }
    expect(body.enginePassthrough.wrote).toBe(true)
    expect(body.enginePassthrough.providerKeys).toEqual(['ide-engine:with-key', 'ide-engine:no-key'])
    const engine = JSON.parse(readFileSync(engineCfgPath, 'utf8')) as { provider: Record<string, { enabled?: boolean; options?: { apiKey?: string }; models?: Record<string, unknown> }> }
    expect(engine.provider['builtin:user-own']).toBeTruthy() // 用户条目零触碰
    expect(engine.provider['ide-engine:with-key'].options?.apiKey).toBe('secret-value')
    expect(engine.provider['ide-engine:with-key'].models?.m1).toMatchObject({ name: 'm1', reasoningLevels: ['low'] })
    expect(engine.provider['ide-engine:no-key'].enabled).toBe(false) // env 缺失禁用占位
    delete process.env.ZCODE_HOME
    delete process.env.TEST_KEY_X
  })

  it('readZcodeCatalog：读 ZCODE_HOME/v2/config.json 启用 provider/模型，不出口 options', async () => {
    const zhome = mkdtempSync(join(tmpdir(), 'zcode-catalog-'))
    fs_mkdirSync(join(zhome, 'v2'), { recursive: true })
    writeFileSync(join(zhome, 'v2', 'config.json'), JSON.stringify({
      provider: {
        p1: { enabled: true, name: 'Provider One', options: { apiKey: 'SECRET' }, models: { m1: { reasoningLevels: ['low'] }, m2: {} } },
        p2: { enabled: false, models: { x: {} } },
        p3: { enabled: true, models: {} },
      },
    }))
    const prev = process.env.ZCODE_HOME
    process.env.ZCODE_HOME = zhome
    const mod = await import('../engine-models')
    const groups = mod.readZcodeCatalog()
    expect(groups).toEqual([
      { provider: 'p1', label: 'Provider One', models: [{ id: 'm1', reasoningLevels: ['low'] }, { id: 'm2' }] },
    ])
    expect(JSON.stringify(groups)).not.toContain('SECRET')
    if (prev === undefined) delete process.env.ZCODE_HOME
    else process.env.ZCODE_HOME = prev
    rmSync(zhome, { recursive: true, force: true })
  })

  it('readZcodeDefault：优先 setting.json 选中的 provider family，否则首个启用 provider 首模型', async () => {
    const zhome = mkdtempSync(join(tmpdir(), 'zcode-default-'))
    fs_mkdirSync(join(zhome, 'v2'), { recursive: true })
    writeFileSync(join(zhome, 'v2', 'config.json'), JSON.stringify({
      provider: {
        'builtin:bigmodel-coding-plan': { enabled: true, name: 'BigModel - Coding Plan', models: { 'GLM-5.3-Flash': {}, 'GLM-5.3': {} } },
        'builtin:bigmodel': { enabled: true, name: 'Bigmodel', models: { 'glm-5.3': {} } },
      },
    }))
    const prev = process.env.ZCODE_HOME
    process.env.ZCODE_HOME = zhome
    const mod = await import('../engine-models')
    const groups = mod.readZcodeCatalog()
    // 无 setting.json → 首个启用 provider 首模型
    expect(mod.readZcodeDefault(groups)).toEqual({ provider: 'builtin:bigmodel-coding-plan', model: 'GLM-5.3-Flash' })
    // 用户选中 bigmodel family 的 coding-plan provider → 用该 provider 首模型
    writeFileSync(join(zhome, 'v2', 'setting.json'), JSON.stringify({
      providerFamilyDomain: 'bigmodel',
      modelProviderFamilySelectedKeys: { bigmodel: 'coding-plan:builtin:bigmodel-coding-plan' },
    }))
    expect(mod.readZcodeDefault(groups)).toEqual({ provider: 'builtin:bigmodel-coding-plan', model: 'GLM-5.3-Flash' })
    expect(mod.readZcodeDefault([])).toBeNull()
    if (prev === undefined) delete process.env.ZCODE_HOME
    else process.env.ZCODE_HOME = prev
    rmSync(zhome, { recursive: true, force: true })
  })

  it('readZcodeDefault/Catalog：provider_config.json 的 providerOrder 是第一来源（2026-10-18 用户实报对齐）', async () => {
    const zhome = mkdtempSync(join(tmpdir(), 'zcode-pcorder-'))
    fs_mkdirSync(join(zhome, 'v2'), { recursive: true })
    writeFileSync(join(zhome, 'v2', 'config.json'), JSON.stringify({
      provider: {
        'builtin:bigmodel-coding-plan': { enabled: true, name: 'BigModel - Coding Plan', models: { 'GLM-5.3-Flash': {}, 'GLM-5.3': {} } },
        'xglm': { enabled: true, name: 'SRK', models: { 'glm-5.3-flash': {}, 'glm-5.3': {} } },
        'kimi-mid': { enabled: true, name: 'kimi-mid', models: { 'k3': {}, 'kimi-for-coding': {} } },
        'disabled-one': { enabled: true, name: 'Disabled', models: { 'x': {} } },
      },
    }))
    writeFileSync(join(zhome, 'v2', 'setting.json'), JSON.stringify({
      providerFamilyDomain: 'bigmodel',
      modelProviderFamilySelectedKeys: { bigmodel: 'coding-plan:builtin:bigmodel-coding-plan' },
    }))
    writeFileSync(join(zhome, 'v2', 'provider_config.json'), JSON.stringify({
      schemaVersion: 1,
      config: {
        providerOrder: ['xglm', 'missing-provider', 'disabled-one', 'kimi-mid'],
        providerConfigRules: { providerRules: [
          { providerId: 'xglm', providerName: 'XGLM', enabled: true, config: { modelOrder: ['glm-5.3', 'glm-5.3-flash', 'not-in-catalog'] } },
          { providerId: 'disabled-one', enabled: false, config: { modelOrder: ['x'] } },
          { providerId: 'kimi-mid', providerName: 'kimi-mid', enabled: true, config: { modelOrder: ['kimi-for-coding', 'k3'] } },
        ] },
      },
    }))
    const prev = process.env.ZCODE_HOME
    process.env.ZCODE_HOME = zhome
    const mod = await import('../engine-models')
    // 目录：providerOrder 命中的按序在前（xglm→kimi-mid），未命中的 config 序垫后；
    // 组内模型按 modelOrder（与目录交集）重排；label 取 providerName；规则禁用的剔除。
    const groups = mod.readZcodeCatalog()
    expect(groups.map(g => g.provider)).toEqual(['xglm', 'kimi-mid', 'builtin:bigmodel-coding-plan'])
    expect(groups[0]).toEqual({ provider: 'xglm', alias: 'xglm', label: 'XGLM', models: [{ id: 'glm-5.3' }, { id: 'glm-5.3-flash' }] })
    expect(groups[1].models.map(m => m.id)).toEqual(['kimi-for-coding', 'k3'])
    // 默认：排首位且启用的 xglm，其 modelOrder 首个在目录内的模型 glm-5.3
    // （压过 setting.json family 指向的 coding-plan/GLM-5.3-Flash）。
    expect(mod.readZcodeDefault(groups)).toEqual({ provider: 'xglm', model: 'glm-5.3' })
    if (prev === undefined) delete process.env.ZCODE_HOME
    else process.env.ZCODE_HOME = prev
    rmSync(zhome, { recursive: true, force: true })
  })

  it('模板供应商（bigmodel-api→builtin:bigmodel-coding-plan）+ rollout 在用模型为默认（3.15.3 用户实报口径）', async () => {
    const zhome = mkdtempSync(join(tmpdir(), 'zcode-tpl-'))
    fs_mkdirSync(join(zhome, 'v2'), { recursive: true })
    fs_mkdirSync(join(zhome, 'cli', 'rollout'), { recursive: true })
    writeFileSync(join(zhome, 'v2', 'config.json'), JSON.stringify({
      provider: {
        'builtin:bigmodel-coding-plan': { enabled: true, name: 'BigModel - Coding Plan', models: { 'GLM-5.3-Flash': {}, 'GLM-5.3': {}, 'offpeak-idle-plan/GLM-5.3': {} } },
        'xglm': { enabled: true, name: 'SRK', models: { 'glm-5.3': {}, 'glm-5.3-flash': {} } },
      },
    }))
    writeFileSync(join(zhome, 'v2', 'provider_config.json'), JSON.stringify({
      schemaVersion: 1,
      config: {
        providerOrder: ['xglm', 'bigmodel-api'],
        providerConfigRules: { providerRules: [
          { providerId: 'xglm', providerName: 'XGLM', enabled: true, config: { modelOrder: ['glm-5.3', 'glm-5.3-flash'] } },
          { providerId: 'bigmodel-api', templateId: 'bigmodel-api', providerName: 'SGLM', enabled: true, config: { modelOrder: ['GLM-5.3', 'GLM-5.3-Flash', 'GLM-5.3-Highspeed'] } },
        ] },
      },
    }))
    // 3.15.3 内置清单（两个版本目录，应取版本大的）；含思考档位规则——
    // 兜底 .* → 关/开，glm-5.3 系 → low/high/max（后命中覆盖）。
    for (const [ver, models] of [['3.14.0', ['GLM-4.5']], ['3.15.3', ['GLM-5.3', 'GLM-5.3-Flash']]] as const) {
      const dir = join(zhome, 'v2', 'runtime', 'provider', 'darwin-aarch64', ver, 'endpoint-x')
      fs_mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, 'zcode-builtin.json'), JSON.stringify({
        schemaVersion: 1,
        config: {
          providerConfigRules: { templateRules: [
            { templateId: 'bigmodel-api', templateNameMap: { 'zh-CN': 'BigModel Coding Plan' }, config: { logo: { key: 'bigmodel' }, access: { type: 'zhipu-coding-plan-api-key' }, builtinModelIds: models } },
          ] },
          modelConfigRules: { modelRules: [
            { modelMatch: '.*', config: { optionSpecs: { reasoningLevel: { values: ['disabled', 'enabled'] } } } },
            { modelMatch: '.*glm-5\\.3(?:-flash)?(?:[.\\-:/\\[].*)?$', config: { optionSpecs: { reasoningLevel: { values: ['low', 'high', 'max'] } } } },
          ] },
        },
      }))
    }
    writeFileSync(join(zhome, 'cli', 'rollout', 'model-io-sess-a.jsonl'), JSON.stringify({
      type: 'model', model: { providerId: 'bigmodel-api', modelId: 'GLM-5.3' },
    }) + '\n')
    const prev = process.env.ZCODE_HOME
    process.env.ZCODE_HOME = zhome
    const mod = await import('../engine-models')
    const groups = mod.readZcodeCatalog()
    // bigmodel-api 模板解析到引擎 builtin:bigmodel-coding-plan；label 用用户命名 SGLM；
    // 组内模型按 rule.modelOrder（GLM-5.3 在首位），引擎额外模型（offpeak）垫后。
    expect(groups.map(g => `${g.alias}:${g.provider}`)).toEqual(['xglm:xglm', 'bigmodel-api:builtin:bigmodel-coding-plan'])
    expect(groups[1]).toEqual({
      provider: 'builtin:bigmodel-coding-plan',
      alias: 'bigmodel-api',
      label: 'SGLM',
      // 思考档位按 manifest 规则补齐（2026-10-18 双源根治后=引擎语义：全匹配+
      // 大小写不敏感）：GLM-5.3 系（含大写）→ low/high/max。旧断言「大写只落
      // 兜底 disabled/enabled」正是目录/发送链不一致的缺陷化石，已修。
      models: [
        { id: 'GLM-5.3', reasoningLevels: ['low', 'high', 'max'] },
        { id: 'GLM-5.3-Flash', reasoningLevels: ['low', 'high', 'max'] },
        { id: 'offpeak-idle-plan/GLM-5.3', reasoningLevels: ['low', 'high', 'max'] },
      ],
    })
    expect(groups[0].models).toEqual([
      { id: 'glm-5.3', reasoningLevels: ['low', 'high', 'max'] },
      { id: 'glm-5.3-flash', reasoningLevels: ['low', 'high', 'max'] },
    ])
    // 默认 = rollout 在用模型（UI 命名空间 bigmodel-api/GLM-5.3 → 引擎组/GLM-5.3），
    // 压过 providerOrder 首位 xglm。
    expect(mod.readZcodeDefault(groups)).toEqual({ provider: 'builtin:bigmodel-coding-plan', model: 'GLM-5.3' })
    if (prev === undefined) delete process.env.ZCODE_HOME
    else process.env.ZCODE_HOME = prev
    rmSync(zhome, { recursive: true, force: true })
  })

  it('PUT 非法 400 带问题清单；合法原子落盘+回读一致', async () => {
    const bad = await run(router, 'put', {
      request: { body: { providers: [{ providerId: '', baseURL: 'x', models: [] }] } },
    })
    expect(bad.status).toBe(400)
    expect(((bad.body as { problems: string[] }).problems).length).toBeGreaterThan(0)

    const good = await run(router, 'put', {
      request: { body: {
        providers: [{ providerId: 'bigmodel', baseURL: 'https://a.com/v1', apiKeyEnv: 'BIGMODEL_KEY', models: [{ modelId: 'glm-5.3' }] }],
        defaultModel: { providerId: 'bigmodel', modelId: 'glm-5.3' },
      } },
    })
    expect(good.status).toBe(200)
    const onDisk = JSON.parse(readFileSync(join(dir, 'engine-models.json'), 'utf8'))
    expect(onDisk.providers[0].providerId).toBe('bigmodel')
    expect(onDisk.defaultModel).toEqual({ providerId: 'bigmodel', modelId: 'glm-5.3' })
    const read = await run(router, 'get', {})
    expect(((read.body as { config: { providers: Array<{ providerId: string }> } }).config).providers[0].providerId).toBe('bigmodel')
  })
})
