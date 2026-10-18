/**
 * IDE 编码引擎独立模型配置 REST（/api/ide/engine-models）——用户指令 2026-09-26：
 * IDE 工作台编程工具（zcode 底座）的模型配置与 hermes agent 独立设置。
 *
 * GET /api/ide/engine-models   读独立配置（空=未配置，客户端回落 hermes 目录兼容）
 * PUT /api/ide/engine-models   校验+原子写（幂等全量替换）
 *
 * 存储：runtime/ide-engine-models.json（与 hermes config.yaml/db 零共享）。
 * 挂载：patch 477 在 bootstrap/routes.ts（session-share 356 同款两行）。
 */
import Router from '@koa/router'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'
import {
  validateEngineModelConfig, type EngineModelConfig,
} from '../../enginemodels/engine-model-config'
import {
  deniedProviderIds, loadGovernancePolicyStatements, mergePolicyStatements,
  type PolicyStatement,
} from '../../enginemodels/provider-policy'

const engineModelsRouter = new Router({ prefix: '/api/ide/engine-models' })

// 存储路径支持 ENGINE_MODEL_STORE 覆盖（守门注入临时文件；生产默认 runtime/）。
const STORE_PATH = process.env.ENGINE_MODEL_STORE?.trim()
  ? resolve(process.env.ENGINE_MODEL_STORE)
  : join(__dirname, '../../../../runtime/ide-engine-models.json')

function readConfig(): EngineModelConfig {
  if (!existsSync(STORE_PATH)) return { providers: [], defaultModel: null }
  try {
    const raw = JSON.parse(readFileSync(STORE_PATH, 'utf8')) as EngineModelConfig
    if (!Array.isArray(raw.providers)) return { providers: [], defaultModel: null }
    return raw
  } catch {
    return { providers: [], defaultModel: null }
  }
}

// B2 治理面语句（4A 治理平面所有；HERMES_GOVERNANCE_POLICY 覆盖供守门测试）
const GOVERNANCE_POLICY_PATH = process.env.HERMES_GOVERNANCE_POLICY?.trim()
  ? resolve(process.env.HERMES_GOVERNANCE_POLICY)
  : join(__dirname, '../../../../runtime/governance/provider-policy.json')

function governanceStatements(): PolicyStatement[] {
  return loadGovernancePolicyStatements(GOVERNANCE_POLICY_PATH)
}

/** 有效策略快照：合并序=用户在前、治理面压轴（最后匹配生效 → 治理权威）。 */
function effectivePolicySnapshot(config: EngineModelConfig) {
  const user = config.policy?.statements ?? []
  const gov = governanceStatements()
  return {
    statements: mergePolicyStatements(user, gov),
    userCount: user.length,
    governanceCount: gov.length,
    denied: deniedProviderIds(user, gov, config.providers.map((p) => p.providerId)),
  }
}

function writeAtomic(config: EngineModelConfig): void {
  const tmp = `${STORE_PATH}.tmp`
  writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8')
  renameSync(tmp, STORE_PATH)
}

engineModelsRouter.get('/', (ctx) => {
  const config = readConfig()
  const zcodeGroups = readZcodeCatalog()
  ctx.body = {
    ok: true,
    config,
    // 2026-10-18 用户裁定：IDE 模型选择使用 Ycode（zcode）实际模型配置。
    // 独立目录为空时客户端优先用此目录；独立目录有值也一并返回，由客户端选源。
    // default=新会话默认模型（ZCode 配置的 provider family 首选，缺省取首个启用 provider 首模型）。
    zcode: { groups: zcodeGroups, default: readZcodeDefault(zcodeGroups) },
    effectivePolicy: effectivePolicySnapshot(config),
    store: 'runtime/ide-engine-models.json',
  }
})

engineModelsRouter.put('/', (ctx) => {
  const body = ctx.request?.body as Partial<EngineModelConfig> | undefined
  const config: EngineModelConfig = {
    providers: Array.isArray(body?.providers) ? body!.providers! : [],
    defaultModel: body?.defaultModel ?? null,
    policy: body?.policy && typeof body.policy === 'object' && Array.isArray(body.policy.statements)
      ? { statements: body.policy.statements }
      : undefined,
    // P3 档位映射透传（24h 审查补）：漏抄=每次 PUT 静默蒸发档位映射
    route: body?.route && typeof body.route === 'object' ? body.route : undefined,
  }
  const validation = validateEngineModelConfig(config)
  if (!validation.ok) {
    ctx.status = 400
    ctx.body = { ok: false, problems: validation.problems }
    return
  }
  writeAtomic(config)
  const passthrough = writeThroughToEngine(config)
  ctx.body = { ok: true, config, enginePassthrough: passthrough }
})

// ── 层 2 写穿：IDE 独立配置 → zcode 引擎真实读的 ~/.zcode/v2/config.json ──
// 键位隔离：只写 `ide-engine:<providerId>` 前缀条目（用户已有条目零触碰）。
// apiKeyEnv 语义：服务端解析 env 取真值；env 缺失→enabled:false 占位（不写空 key）。
// 生效时点：引擎按自身配置装载节奏消费（写穿后新会话/引擎重载生效）。
function zcodeRoot(): string {
  return process.env.ZCODE_HOME?.trim() ? resolve(process.env.ZCODE_HOME) : join(homedir(), '.zcode')
}

function zcodeConfigPath(): string {
  return join(zcodeRoot(), 'v2', 'config.json')
}

export interface ZcodeCatalogGroup {
  provider: string
  label: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}

/** ZCode 供应商管理器（provider_config.json）：排序与显示名的真实来源——
 *  setting.json 的 family 键只管 OAuth 套餐 UI，与本机实际首选（用户在 provider
 *  管理器里排到第一位的）不一定一致（2026-10-18 用户实报「和本机 zcode 的配置
 *  不一样」：XGLM/glm-5.3 才是当前所用，而非 family 键指向的 coding-plan）。 */
interface ZcodeProviderRule {
  providerId: string
  providerName?: string
  enabled?: boolean
  config?: { modelOrder?: string[] }
}

function readZcodeProviderConfig(): { order: string[]; rules: Map<string, ZcodeProviderRule> } {
  try {
    const path = join(zcodeRoot(), 'v2', 'provider_config.json')
    if (!existsSync(path)) return { order: [], rules: new Map() }
    const raw = JSON.parse(readFileSync(path, 'utf8')) as {
      config?: { providerOrder?: string[]; providerConfigRules?: { providerRules?: ZcodeProviderRule[] } }
    }
    const rules = new Map((raw.config?.providerConfigRules?.providerRules ?? []).map(r => [r.providerId, r]))
    return { order: raw.config?.providerOrder ?? [], rules }
  } catch {
    return { order: [], rules: new Map() }
  }
}

/** 读 Ycode/ZCode 实际配置（~/.zcode/v2/config.json）的启用 provider → 模型目录。
 *  只投影 providerId/名称/模型 id 与推理档，不读取 options（密钥/端点不出口）。
 *  分组顺序与组内模型顺序对齐 provider_config.json（无记录的保持 config 序垫后）。 */
export function readZcodeCatalog(): ZcodeCatalogGroup[] {
  try {
    const path = zcodeConfigPath()
    if (!existsSync(path)) return []
    const engine = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: Record<string, {
        enabled?: boolean
        name?: string
        models?: Record<string, { reasoningLevels?: string[] }>
      }>
    }
    const { order, rules } = readZcodeProviderConfig()
    const groups: ZcodeCatalogGroup[] = []
    for (const [providerId, p] of Object.entries(engine.provider ?? {})) {
      if (!p || p.enabled === false) continue
      const rule = rules.get(providerId)
      if (rule && rule.enabled === false) continue
      const byId = new Map(Object.entries(p.models ?? {})
        .map(([id, m]) => [id, { id, ...(m?.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) }]))
      const ordered: Array<{ id: string; reasoningLevels?: string[] }> = []
      for (const id of rule?.config?.modelOrder ?? []) {
        const m = byId.get(id)
        if (m) { ordered.push(m); byId.delete(id) }
      }
      for (const m of byId.values()) ordered.push(m)
      if (ordered.length === 0) continue
      groups.push({
        provider: providerId,
        label: rule?.providerName || p.name || providerId,
        models: ordered,
      })
    }
    const rank = (id: string) => {
      const i = order.indexOf(id)
      return i === -1 ? order.length : i
    }
    // 稳定排序：providerOrder 命中的在前（按序），未命中的保持 config 声明序垫后。
    return groups.map((g, i) => ({ g, i }))
      .sort((a, b) => rank(a.g.provider) - rank(b.g.provider) || a.i - b.i)
      .map(x => x.g)
  } catch {
    return []
  }
}

/** ZCode 侧“当前首选 provider”：setting.json 的 provider family 选择（若存在）。
 *  形如 modelProviderFamilySelectedKeys.bigmodel = "coding-plan:builtin:bigmodel-coding-plan"，
 *  用 providerId 后缀匹配到目录组；用户未配置 family 时返回 null。 */
function preferredZcodeGroup(groups: ZcodeCatalogGroup[]): ZcodeCatalogGroup | null {
  try {
    const path = join(zcodeRoot(), 'v2', 'setting.json')
    if (!existsSync(path)) return null
    const setting = JSON.parse(readFileSync(path, 'utf8')) as {
      providerFamilyDomain?: string
      modelProviderFamilySelectedKeys?: Record<string, string>
    }
    const domain = setting.providerFamilyDomain
    const selected = domain ? setting.modelProviderFamilySelectedKeys?.[domain] : undefined
    if (!selected) return null
    return groups.find(g => selected.endsWith(g.provider)) ?? null
  } catch {
    return null
  }
}

/** 新会话默认模型：优先 provider 管理器排首位且启用的 provider 的首选模型
 *  （modelOrder 与目录交集的第一个）；无 provider_config 时回落 family 选择，
 *  再回落首个启用 provider 首模型（与选择器展示顺序一致）。目录空 → null。 */
export function readZcodeDefault(
  groups: ZcodeCatalogGroup[] = readZcodeCatalog(),
): { provider: string; model: string } | null {
  const { order, rules } = readZcodeProviderConfig()
  const byId = new Map(groups.map(g => [g.provider, g]))
  for (const id of order) {
    const rule = rules.get(id)
    if (rule && rule.enabled === false) continue
    const group = byId.get(id)
    if (group && group.models.length > 0) return { provider: group.provider, model: group.models[0].id }
  }
  const group = preferredZcodeGroup(groups) ?? groups.find(g => g.models.length > 0)
  const model = group?.models[0]?.id
  return group && model ? { provider: group.provider, model } : null
}

export interface EnginePassthrough {
  wrote: boolean
  providerKeys: string[]
  note: string
}

export function writeThroughToEngine(config: EngineModelConfig): EnginePassthrough {
  try {
    const path = zcodeConfigPath()
    if (!existsSync(path)) {
      return { wrote: false, providerKeys: [], note: `zcode config 不存在（${path}）——引擎未初始化，跳过写穿` }
    }
    const engine = JSON.parse(readFileSync(path, 'utf8')) as {
      provider?: Record<string, Record<string, unknown>>
    }
    engine.provider = engine.provider ?? {}
    // B2 策略强制面：被拒 provider 不写穿（引擎读不到=派发不可达），并清掉
    // 此前已写的同名键（策略收紧后不留可达残留）。
    const gov = loadGovernancePolicyStatements(GOVERNANCE_POLICY_PATH)
    // 判定集合=当前目录 ∪ 已存在的 ide-engine:* 键（历史残留键同样过策略——
    // 策略收紧后不在目录里的旧键也不留可达残留）。
    const existingIds = Object.keys(engine.provider)
      .filter((k) => k.startsWith('ide-engine:'))
      .map((k) => k.slice('ide-engine:'.length))
    const knownIds = [...new Set([...config.providers.map((p) => p.providerId), ...existingIds])]
    const denied = new Set(deniedProviderIds(config.policy?.statements ?? [], gov, knownIds).map((x) => x.providerId))
    const skipped: string[] = []
    for (const providerId of denied) {
      const key = `ide-engine:${providerId}`
      if (engine.provider[key]) { delete engine.provider[key]; skipped.push(`${key}（已清除残留）`) }
    }
    const keys: string[] = []
    for (const p of config.providers) {
      if (denied.has(p.providerId)) { skipped.push(`ide-engine:${p.providerId}`); continue }
      const key = `ide-engine:${p.providerId}`
      const apiKey = p.apiKeyEnv ? (process.env[p.apiKeyEnv] ?? '').trim() : ''
      const models: Record<string, unknown> = {}
      for (const m of p.models) {
        models[m.modelId] = {
          name: m.modelId,
          limit: { context: 1048576, output: 128000 },
          modalities: { input: ['text'], output: ['text'] },
          ...(m.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}),
        }
      }
      engine.provider[key] = {
        name: `IDE · ${p.providerId}`,
        kind: 'anthropic',
        options: { baseURL: p.baseURL, ...(apiKey ? { apiKey } : {}) },
        enabled: apiKey !== '' || !p.apiKeyEnv,
        source: 'custom',
        ...(Object.keys(models).length ? { models } : {}),
      }
      keys.push(key)
    }
    const tmp = `${path}.tmp`
    writeFileSync(tmp, JSON.stringify(engine, null, 2), 'utf8')
    renameSync(tmp, path)
    const deniedNote = skipped.length > 0 ? `；策略拒配跳过 ${skipped.length} 项` : ''
    return { wrote: true, providerKeys: keys, note: `已写穿 ~/.zcode/v2/config.json（ide-engine: 前缀条目；引擎重载/新会话生效）${deniedNote}` }
  } catch (err) {
    return { wrote: false, providerKeys: [], note: `写穿失败：${err instanceof Error ? err.message.slice(0, 200) : String(err)}` }
  }
}

export default engineModelsRouter
