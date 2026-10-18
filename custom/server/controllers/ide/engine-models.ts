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
import { existsSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
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
  /** 引擎侧 provider id（会话切换实际使用的键，config.json 命名空间）。 */
  provider: string
  /** ZCode UI 侧 id（providerOrder/template 命名空间，如 bigmodel-api；默认与 provider 相同）。 */
  alias?: string
  label: string
  models: Array<{ id: string; reasoningLevels?: string[] }>
}

/** ZCode 供应商管理器（provider_config.json）：排序与显示名的真实来源——
 *  setting.json 的 family 键只管 OAuth 套餐 UI，与本机实际首选（用户在 provider
 *  管理器里排到第一位的）不一定一致（2026-10-18 用户实报「和本机 zcode 的配置
 *  不一样」：XGLM/glm-5.3 才是当前所用，而非 family 键指向的 coding-plan）。 */
interface ZcodeProviderRule {
  providerId: string
  templateId?: string
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

/** ZCode 内置供应商模板（runtime/provider 下各版本目录的 zcode-builtin.json）。
 *  模板 id（如 bigmodel-api）是 UI 命名空间；引擎侧对应 builtin:bigmodel-coding-plan。
 *  取版本号最大的清单（3.15.3 用户实报口径）。 */
interface ZcodeBuiltinTemplate {
  templateId: string
  templateNameMap?: Record<string, string>
  config?: {
    logo?: { key?: string }
    access?: { type?: string }
    builtinModelIds?: string[]
  }
}

function versionRank(dir: string): number[] {
  return dir.split('.').map(seg => Number(seg.replace(/[^0-9].*$/, '')) || 0)
}

function versionLt(a: string, b: string): boolean {
  const x = versionRank(a), y = versionRank(b)
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0)
    if (d !== 0) return d < 0
  }
  return false
}

function readZcodeBuiltinTemplates(): Map<string, ZcodeBuiltinTemplate> {
  try {
    const base = join(zcodeRoot(), 'v2', 'runtime', 'provider')
    if (!existsSync(base)) return new Map()
    let newest: { manifest: Record<string, unknown>; version: string } | null = null
    for (const platform of readdirSync(base)) {
      const platformDir = join(base, platform)
      if (!statSync(platformDir).isDirectory()) continue
      for (const version of readdirSync(platformDir)) {
        const versionDir = join(platformDir, version)
        if (!statSync(versionDir).isDirectory()) continue
        for (const entry of readdirSync(versionDir)) {
          const manifestPath = join(versionDir, entry, 'zcode-builtin.json')
          if (!existsSync(manifestPath)) continue
          if (!newest || versionLt(newest.version, version)) {
            newest = { manifest: JSON.parse(readFileSync(manifestPath, 'utf8')), version }
          }
        }
      }
    }
    const templates = ((newest?.manifest as { config?: { providerConfigRules?: { templateRules?: ZcodeBuiltinTemplate[] } } })
      ?.config?.providerConfigRules?.templateRules) ?? []
    return new Map(templates.map(t => [t.templateId, t]))
  } catch {
    return new Map()
  }
}

type EngineProviderMap = Record<string, {
  enabled?: boolean
  name?: string
  models?: Record<string, { reasoningLevels?: string[] }>
}>

/** 模板 → 引擎 provider id：family 取 logo.key，coding-plan 接入 → builtin:<family>-coding-plan，
 *  普通 api-key → builtin:<family>。找不到对应引擎条目时返回 null（模板不可执行）。 */
function templateEngineCounterpart(tpl: ZcodeBuiltinTemplate, engine: EngineProviderMap): string | null {
  const family = tpl.config?.logo?.key
  if (!family) return null
  const candidates = Object.keys(engine).filter(id => id === `builtin:${family}` || id.startsWith(`builtin:${family}-`))
  if (candidates.length === 0) return null
  const isCodingPlan = (tpl.config?.access?.type ?? '').includes('coding-plan')
  if (isCodingPlan) {
    return candidates.find(id => id.includes('coding-plan'))
      ?? candidates.find(id => id !== `builtin:${family}`) ?? null
  }
  return candidates.includes(`builtin:${family}`)
    ? `builtin:${family}`
    : candidates.find(id => !id.includes('coding-plan') && !id.includes('start-plan')) ?? candidates[0]
}

/** 读 Ycode/ZCode 实际配置的启用 provider → 模型目录。
 *  只投影 providerId/名称/模型 id 与推理档，不读取 options（密钥/端点不出口）。
 *  命名空间：按 provider_config 的 providerOrder 走 UI 顺序——rule 直连引擎条目
 *  （自定义 provider）或经 templateId 解析到 builtin 引擎条目（如 bigmodel-api →
 *  builtin:bigmodel-coding-plan，label 用用户命名如 SGLM）；两者都命不中的跳过，
 *  剩余启用引擎 provider 保持 config 序垫后。 */
export function readZcodeCatalog(): ZcodeCatalogGroup[] {
  try {
    const path = zcodeConfigPath()
    if (!existsSync(path)) return []
    const engine = JSON.parse(readFileSync(path, 'utf8')) as { provider?: EngineProviderMap }
    const providers = engine.provider ?? {}
    const { order, rules } = readZcodeProviderConfig()
    const templates = readZcodeBuiltinTemplates()

    const orderModels = (preferred: string[] | undefined, providerId: string) => {
      const p = providers[providerId]
      const byId = new Map(Object.entries(p?.models ?? {})
        .map(([id, m]) => [id, { id, ...(m?.reasoningLevels ? { reasoningLevels: m.reasoningLevels } : {}) }]))
      const ordered: Array<{ id: string; reasoningLevels?: string[] }> = []
      for (const id of preferred ?? []) {
        const m = byId.get(id)
        if (m) { ordered.push(m); byId.delete(id) }
      }
      for (const m of byId.values()) ordered.push(m)
      return ordered
    }

    const groups: ZcodeCatalogGroup[] = []
    const used = new Set<string>()
    for (const id of order) {
      const rule = rules.get(id)
      if (rule && rule.enabled === false) continue
      let engineId: string | null = null
      let label = ''
      let preferred: string[] | undefined
      if (providers[id]) {
        engineId = id
        label = rule?.providerName || providers[id].name || id
        preferred = rule?.config?.modelOrder
      } else {
        const templateId = rule?.templateId || id
        const tpl = templates.get(templateId)
        engineId = tpl ? templateEngineCounterpart(tpl, providers) : null
        if (!engineId) continue
        label = rule?.providerName
          || tpl?.templateNameMap?.['zh-CN']
          || tpl?.templateNameMap?.['en-US']
          || providers[engineId]?.name
          || id
        preferred = rule?.config?.modelOrder ?? tpl?.config?.builtinModelIds
      }
      if (!providers[engineId] || providers[engineId].enabled === false) continue
      const models = orderModels(preferred, engineId)
      if (models.length === 0) continue
      used.add(engineId)
      groups.push({ provider: engineId, alias: id, label, models })
    }
    for (const [providerId, p] of Object.entries(providers)) {
      if (used.has(providerId)) continue
      // provider 管理器里被用户显式禁用的（rule.enabled=false）整组不进目录。
      if (rules.get(providerId)?.enabled === false) continue
      if (!p || p.enabled === false) continue
      const models = orderModels(undefined, providerId)
      if (models.length === 0) continue
      groups.push({ provider: providerId, label: p.name || providerId, models })
    }
    return groups
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

/** 本机 ZCode「正在用」的模型：cli/rollout/model-io-*.jsonl 按 mtime 取最新文件，
 *  读末行 model {providerId, modelId}（UI/template 命名空间）。无记录 → null。 */
function newestZcodeInUseModel(): { providerId: string; modelId: string } | null {
  try {
    const dir = join(zcodeRoot(), 'cli', 'rollout')
    if (!existsSync(dir)) return null
    const files = readdirSync(dir)
      .filter(f => f.startsWith('model-io-') && f.endsWith('.jsonl'))
      .map(f => ({ f, mtime: statSync(join(dir, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime)
    if (files.length === 0) return null
    const lines = readFileSync(join(dir, files[0].f), 'utf8').split('\n').filter(Boolean)
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const rec = JSON.parse(lines[i]) as { model?: { providerId?: string; modelId?: string } }
        if (rec.model?.providerId && rec.model?.modelId) {
          return { providerId: rec.model.providerId, modelId: rec.model.modelId }
        }
      } catch { /* 跳过残行 */ }
    }
    return null
  } catch {
    return null
  }
}

/** 新会话默认模型：优先「本机 ZCode 正在用的模型」（rollout 最新记录，经
 *  alias/provider 双键匹配回引擎组）；其次 provider 管理器排首位且启用的组；
 *  再回落 family 选择与首个启用组。目录空 → null。 */
export function readZcodeDefault(
  groups: ZcodeCatalogGroup[] = readZcodeCatalog(),
): { provider: string; model: string } | null {
  // 1) 正在用的模型（最强信号——用户实报口径：与本机 ZCode 当前会话一致）
  const inUse = newestZcodeInUseModel()
  if (inUse) {
    const group = groups.find(g => g.provider === inUse.providerId || g.alias === inUse.providerId)
    if (group && group.models.some(m => m.id === inUse.modelId)) {
      return { provider: group.provider, model: inUse.modelId }
    }
  }
  // 2) providerOrder 首个可用组（rule 直连或经 alias 命中）
  const { order, rules } = readZcodeProviderConfig()
  const byProvider = new Map(groups.map(g => [g.provider, g]))
  const byAlias = new Map(groups.filter(g => g.alias).map(g => [g.alias as string, g]))
  for (const id of order) {
    const rule = rules.get(id)
    if (rule && rule.enabled === false) continue
    const group = byProvider.get(id) ?? byAlias.get(id)
    if (group && group.models.length > 0) return { provider: group.provider, model: group.models[0].id }
  }
  // 3) family 选择 → 4) 首个启用组
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
