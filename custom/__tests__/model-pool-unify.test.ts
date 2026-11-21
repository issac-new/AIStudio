// 补丁 812 守门（spec 2026-11-21-model-pool-unification）：
// 行为面＝内嵌 runtime 上游统一态直钉 cc-switch（PROXY_MANAGED）；内容面＝投影/池漏斗
// 改写点与 legacy 保留锁（补丁是本仓产物，内容断言成立——coding-agent-approval-ledger
// 先例）。legacy 路径会触真实账号面，不做行为调用，靠内容锁保证分支在位。
import { describe, expect, it, afterEach, beforeAll, vi } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const patch = readFileSync(join(repoRoot, 'patches/812-server-model-pool-unify.patch'), 'utf8')

afterEach(() => vi.unstubAllEnvs())

// —— 投影统一态行为测试脚手架（审查 P2-2 补：mock 账号面/存储面，真跑 synchronize）——
const vendorServer = join(repoRoot, 'vendor/hermes-studio/packages/server/src')
let srcDir = ''
let profileDir = ''
let accountHome = ''
let written: Record<string, string> = {}

vi.mock('../../vendor/hermes-studio/packages/server/src/modules/studio/public/provider-config', () => ({
  readConfigYamlForProfile: async () => ({}),
}))
vi.mock('../../vendor/hermes-studio/packages/server/src/modules/studio/services/providers/supplemental-routing', () => ({
  supplementalSections: [],
  readSupplementalEdits: async () => ({}),
  applySupplementalEdits: async () => undefined,
}))
vi.mock('../../vendor/hermes-studio/packages/server/src/modules/studio/services/providers/account-store', () => ({
  internalModelCredential: async () => ({ token: 'test-token' }),
  providerProfileDir: () => profileDir,
  providerSourceDir: () => srcDir,
  providerAccountHome: () => accountHome,
}))
vi.mock('../../vendor/hermes-studio/packages/server/src/modules/studio/public/safe-file-store', () => ({
  safeFileStore: {
    readText: async () => '',
    updateTexts: async (_paths: string[], fn: (current: Record<string, string>) => Promise<{ files: Record<string, string> }>) => {
      const result = await fn({})
      written = result?.files ?? {}
      for (const [path, content] of Object.entries(written)) writeFileSync(path, content)
      return result
    },
  },
}))

describe('synchronizeHermesProvider 行为（统一态）', () => {
  beforeAll(async () => {
    const root = join(tmpdir(), `mpu-proj-${Date.now()}`)
    srcDir = join(root, 'src'); profileDir = join(root, 'profile'); accountHome = join(root, 'home')
    for (const dir of [srcDir, profileDir, accountHome]) mkdirSync(dir, { recursive: true })
    const { configureProviderProjection } = await import(join(vendorServer, 'modules/studio/services/providers/hermes-projection'))
    // 统一态不消费账号池：resolver 给异源组也必须被忽略。
    configureProviderProjection(async () => [{ provider: 'glm', models: ['glm-5.3'] }])
  })

  it('投影产物＝cc-switch-route 单条：裸模型名（无 namespace 前缀）＋PROXY_MANAGED＋会话亲和＋default=aim', async () => {
    vi.stubEnv('EKKO_MODEL_UPSTREAM_BASE_URL', '')
    const { synchronizeHermesProvider } = await import(join(vendorServer, 'modules/studio/services/providers/hermes-projection'))
    await synchronizeHermesProvider('p1')
    const config = written[join(srcDir, 'config.yaml')] ?? ''
    expect(config).toContain('name: cc-switch-route')
    expect(config).toContain('base_url: http://127.0.0.1:15721/hermes/v1')
    expect(config).toContain('api_key: PROXY_MANAGED')
    expect(config).toContain('session_affinity_header: session_id')
    expect(config).toContain('default: glm-5.3')
    // 审查 P1-1 回归锁：统一态清单不得出现 namespace 前缀（曾漏网为 cc-switch-route/aim）。
    expect(config).not.toContain('cc-switch-route/')
    for (const model of ['aim', 'glm-5.3', 'kimi-for-coding', 'glm-5.3-flash', 'claude-opus-5']) {
      expect(config).toContain(`- ${model}\n`)
    }
  })
})

describe('resolveAgentGatewayRuntime 行为（统一态）', () => {
  it('env 缺省＝直钉 cc-switch hermes lane，凭据 PROXY_MANAGED，协议 codex_responses', async () => {
    vi.stubEnv('EKKO_MODEL_UPSTREAM_BASE_URL', '')
    const { resolveAgentGatewayRuntime } = await import('../../vendor/hermes-studio/packages/server/src/bootstrap/provider-gateway-client')
    await expect(resolveAgentGatewayRuntime({ profile: 'default', provider: 'glm', model: 'aim' })).resolves.toEqual({
      provider: 'cc-switch-route',
      baseUrl: 'http://127.0.0.1:15721/hermes/v1',
      apiKey: 'PROXY_MANAGED',
      apiMode: 'codex_responses',
    })
  })

  it('显式 URL 覆盖默认上游（trim 后）', async () => {
    vi.stubEnv('EKKO_MODEL_UPSTREAM_BASE_URL', ' http://127.0.0.1:19999/hermes/v1 ')
    const { resolveAgentGatewayRuntime } = await import('../../vendor/hermes-studio/packages/server/src/bootstrap/provider-gateway-client')
    await expect(resolveAgentGatewayRuntime({ profile: 'default', provider: 'glm' })).resolves.toMatchObject({
      baseUrl: 'http://127.0.0.1:19999/hermes/v1', apiKey: 'PROXY_MANAGED',
    })
  })
})

describe('补丁 812 改写点内容锁', () => {
  it('投影：providers 条目带 PROXY_MANAGED＋会话亲和头，模型名裸透传', () => {
    expect(patch).toContain("? { [UNIFIED_PROVIDER]: { name: UNIFIED_PROVIDER, base_url: upstream.baseUrl, api_key: 'PROXY_MANAGED'")
    expect(patch).toContain("session_affinity_header: 'session_id'")
    expect(patch).toContain('{ provider: UNIFIED_PROVIDER, model: value.model,')
  })

  it('投影：网关选择（hermesGatewaySelection）统一态早退且保留 legacy 分支', () => {
    expect(patch).toContain('gateway_runtime: { provider: \'custom\', api_mode: \'codex_responses\', base_url: upstream.baseUrl, api_key: \'PROXY_MANAGED\' } }')
    expect(patch).toContain('base_url: studioModelGatewayUrl(), api_key: credential.token')
  })

  it('池漏斗：buildAvailableForProfile 统一态早退给白名单单组', () => {
    expect(patch).toContain('if (upstream.unified) {')
    expect(patch).toContain("label: 'cc-switch（统一模型池）'")
    expect(patch).toContain('default: UNIFIED_POOL.defaultModel, default_provider: UNIFIED_PROVIDER')
  })

  it('挂载：/api/modelpool 路由接线', () => {
    expect(patch).toContain("import { modelPoolRoutes } from '../custom/modelpool/controller'")
    expect(patch).toContain('app.use(modelPoolRoutes.routes())')
  })

  it('studio 侧 KNOWN_KEYS 识别会话亲和头（根治 boot 告警；python 侧 config_providers 原生消费）', () => {
    expect(patch).toContain("'session_affinity_header',")
  })
})
