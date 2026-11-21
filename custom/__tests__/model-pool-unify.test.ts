// 补丁 812 守门（spec 2026-11-21-model-pool-unification）：
// 行为面＝内嵌 runtime 上游统一态直钉 cc-switch（PROXY_MANAGED）；内容面＝投影/池漏斗
// 改写点与 legacy 保留锁（补丁是本仓产物，内容断言成立——coding-agent-approval-ledger
// 先例）。legacy 路径会触真实账号面，不做行为调用，靠内容锁保证分支在位。
import { describe, expect, it, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../..')
const patch = readFileSync(join(repoRoot, 'patches/812-server-model-pool-unify.patch'), 'utf8')

afterEach(() => vi.unstubAllEnvs())

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
})
