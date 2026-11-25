// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/ekko-ui-patch-wiring.test.ts
// 批二补丁接线标记断言：锁 820/821 的接线痕迹，防补丁在重放或上游升级时静默漂移。
// 对补丁文本做断言（补丁是单一事实源），不依赖注入态——注入态的重放由 patches-series-guard 与全量重放验证。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'

const patchesDir = resolve(__dirname, '../../../../patches')

function patch(name: string): string {
  return readFileSync(resolve(patchesDir, name), 'utf8')
}

describe('补丁 820：MCP 五个工具', () => {
  const text = patch('820-mcp-ekko-studio-persistent-surfaces.patch')

  it('在 ekko-studio-interaction 里注册五个工具，且都是 plan 工具集', () => {
    for (const name of ['ekko_studio_surface_create', 'ekko_studio_surface_update', 'ekko_studio_surface_inspect', 'ekko_studio_surface_close', 'ekko_studio_surface_catalog']) {
      expect(text, name).toContain(`name: '${name}'`)
    }
    // 每个新工具的 toolset 都是 plan
    expect(text.match(/toolset: 'plan'/g)?.length).toBeGreaterThanOrEqual(5)
  })

  it('创建接口绑定当前轮上下文（加到运行凭证的路径清单）', () => {
    expect(text).toContain("'/api/studio/surfaces/create'].includes(path)")
  })

  it('每个工具都有处理器分支', () => {
    for (const [tool, path] of [
      ['ekko_studio_surface_create', '/api/studio/surfaces/create'],
      ['ekko_studio_surface_update', '/api/studio/surfaces/update'],
      ['ekko_studio_surface_inspect', '/api/studio/surfaces/inspect'],
      ['ekko_studio_surface_close', '/api/studio/surfaces/close'],
      ['ekko_studio_surface_catalog', '/api/studio/surfaces/catalog'],
    ] as const) {
      expect(text, tool).toContain(`case '${tool}':`)
      expect(text, path).toContain(path)
    }
  })

  it('订正了阻塞式工具描述里的硬编码部件清单（单一事实源回到协议模块）', () => {
    expect(text).toContain('Call ekko_studio_surface_catalog first for the component list')
    // 那串 v1 部件清单只允许作为被删除的行出现，不应出现在任何新增行里
    const addedLines = text.split('\n').filter(line => line.startsWith('+') && !line.startsWith('+++'))
    expect(addedLines.some(line => line.includes('box/stack/row/grid/card/divider/spacer'))).toBe(false)
  })

  it('在 779 之后（series 顺序）', () => {
    const series = readFileSync(resolve(patchesDir, 'series'), 'utf8').split('\n')
    const i779 = series.indexOf('779-mcp-ekko-studio-show-surface.patch')
    const i820 = series.indexOf('820-mcp-ekko-studio-persistent-surfaces.patch')
    const i821 = series.indexOf('821-studio-ekko-ui-persistent-wiring.patch')
    expect(i779).toBeGreaterThanOrEqual(0)
    expect(i820).toBeGreaterThan(i779)
    expect(i821).toBeGreaterThan(i820)
  })
})

describe('动作契约登记（action-gate）', () => {
  // 2026-11-25 真实会话走查：surface_create 报 not registered in action contracts。
  // 代理运行时有一道动作闸门，工具没在契约里显式登记就按默认策略「不可逆」拦截；
  // 批一的 show_surface 当初也漏了，单测与接线断言都覆盖不到这一层。
  // 同日把其余三个服务（用法、浏览器、接口）共 44 个工具逐个定级并登记（spec
  // 2026-11-25-mcp-action-contracts-remaining，用户选做法 A「只登记」），守门随之扩到四个服务。
  // 键名格式：服务在配置里用连字符（ekko-studio-interaction），上线时经净化变成下划线，
  // 故键是 mcp__ekko_studio_<服务名>__ekko_studio_<工具名>——以克隆库里模型实际发出的名字为准。
  const contracts = readFileSync(resolve(__dirname, '../../../../team/profiles/_shared/action-contracts.yaml'), 'utf8')
  // MCP 脚本里的工具集 -> 模型发出的键前缀。服务在配置里用连字符，上线时经净化变成下划线：
  // ekko-studio-interaction -> mcp__ekko_studio_interaction__，其余三个同理。
  const TOOLSET_KEY_PREFIX: Record<string, string> = {
    plan: 'mcp__ekko_studio_interaction__ekko_studio_',
    use: 'mcp__ekko_studio_use__ekko_studio_',
    browser: 'mcp__ekko_studio_browser__ekko_studio_',
    api: 'mcp__ekko_studio_api__ekko_studio_',
  }
  // 契约里登记的键（只取 ekko_studio 的四个服务），原样保存，不做名字反解
  const registeredKeys = new Set(Array.from(contracts.matchAll(/^ {2}(mcp__ekko_studio_[a-z_]+__ekko_studio_[a-z0-9_]+):/gm), match => match[1]))

  /** 注入态 MCP 脚本里的工具定义：工具集 -> 工具名集合（去掉 ekko_studio_ 前缀）。 */
  function definedTools(): Map<string, Set<string>> {
    // 锁注入态（同 kanban-patch-409-guard 等先例）：npm test 的 pretest 先跑 ensure-injected，漏注入即红
    const scriptPath = resolve(__dirname, '../../../../vendor/hermes-studio/bin/ekko-studio-mcp.mjs')
    expect(existsSync(scriptPath), 'MCP 脚本在（未注入树先跑 npm run inject）').toBe(true)
    const script = readFileSync(scriptPath, 'utf8')
    // 工具定义：name: 'ekko_studio_xxx'，其后 400 字符内给出所属 toolset。
    const defined = new Map<string, string>()
    for (const match of script.matchAll(/name:\s*'(ekko_studio_[a-z0-9_]+)'[\s\S]{0,400}?toolset:\s*'([a-z_]+)'/g)) {
      if (!defined.has(match[1])) defined.set(match[1], match[2])
    }
    const byToolset = new Map<string, Set<string>>()
    for (const [name, toolset] of defined) {
      if (!byToolset.has(toolset)) byToolset.set(toolset, new Set())
      byToolset.get(toolset)!.add(name.replace(/^ekko_studio_/, ''))
    }
    return byToolset
  }

  it('注入态 MCP 脚本里四个服务的每个工具都在契约里有登记', () => {
    for (const [toolset, prefix] of Object.entries(TOOLSET_KEY_PREFIX)) {
      const tools = definedTools().get(toolset) ?? new Set<string>()
      expect(tools.size, `${toolset} 工具集在脚本里应有工具定义`).toBeGreaterThan(0)
      const missing = [...tools].filter(name => !registeredKeys.has(`${prefix}${name}`))
      expect(missing, `以下 ${toolset} 工具集的工具未在 team/profiles/_shared/action-contracts.yaml 登记，会被 action-gate 拦截：${missing.join(' ')}`).toEqual([])
    }
  })

  it('契约里每个 ekko-studio 登记的键，都在 MCP 脚本里有同名工具（防键写错等于没登记）', () => {
    const known = new Set<string>()
    for (const [toolset, tools] of definedTools()) {
      const prefix = TOOLSET_KEY_PREFIX[toolset]
      if (!prefix) continue
      for (const name of tools) known.add(`${prefix}${name}`)
    }
    const dangling = [...registeredKeys].filter(key => !known.has(key))
    expect(dangling, `以下登记在 MCP 脚本里找不到同名工具（键写错，或工具已退役）：${dangling.join(' ')}`).toEqual([])
  })

  it('界面工具与四个服务的登记数量符合预期', () => {
    const I = TOOLSET_KEY_PREFIX.plan
    // 交互服务：五个持久式 + 阻塞式 + 澄清 + 计划 + 两个会话目标
    for (const name of ['surface_create', 'surface_update', 'surface_inspect', 'surface_close', 'surface_catalog', 'show_surface']) {
      expect(registeredKeys.has(`${I}${name}`), name).toBe(true)
    }
    const count = (prefix: string) => [...registeredKeys].filter(key => key.startsWith(prefix)).length
    expect(count(TOOLSET_KEY_PREFIX.plan)).toBe(10)
    expect(count(TOOLSET_KEY_PREFIX.use)).toBe(29)
    expect(count(TOOLSET_KEY_PREFIX.browser)).toBe(13)
    expect(count(TOOLSET_KEY_PREFIX.api)).toBe(2)
  })

  it('登记条目的键是模型发出的全名，与 MCP 脚本里的工具名逐字对应', () => {
    // 闸门拿到的是原始工具名（mcp__<净化后的服务名>__<工具名>），不做去前缀，键写错等于没登记。
    // 净化规则的反向断言：契约里不应出现带连字符的服务名写法（那是配错键的典型形态）
    expect(contracts).not.toMatch(/^ {2}mcp__ekko-studio-/m)
    // 四个服务在契约里各有一段登记
    for (const prefix of Object.values(TOOLSET_KEY_PREFIX)) {
      expect(contracts).toContain(`\n  ${prefix}`)
    }
  })
})

describe('协议目录的模块格式作用域', () => {
  it('custom/client/chat/ekko-ui/package.json 存在且无 type 字段（截断根 type:module 继承）', () => {
    // 缺失时 ts-node 把 protocol.ts 当 ESM，服务端启动即 ERR_REQUIRE_ESM（2026-11-25 走查实测）
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../client/chat/ekko-ui/package.json'), 'utf8'))
    expect(pkg.type).toBeUndefined()
  })
})

describe('补丁 821：接线', () => {
  const text = patch('821-studio-ekko-ui-persistent-wiring.patch')

  it('路由装配挂上持久式界面路由', () => {
    expect(text).toContain("import { persistentSurfaceRoutes } from '../custom/ekko-ui/persistent-controller'")
    expect(text).toContain('app.use(persistentSurfaceRoutes.routes())')
  })

  it('套接字服务类在构造时把宿主交给路由（依赖注入，自定义代码不反向引用上游）', () => {
    expect(text).toContain('setPersistentSurfaceHost(this.persistentSurfaces)')
    expect(text).toContain("resolveTurn: (contextId, profile) => this.surfaceRuns.resolveTurn(contextId, profile)")
    expect(text).toContain("isEnabled: () => process.env.EKKO_UI_PERSISTENT !== '0'")
  })

  it('给智能体的两段说明补了持久式界面的指引', () => {
    expect(text).toContain('call ekko_studio_surface_create instead: it returns at once')
    expect(text).toContain('ekko_studio_surface_catalog before writing a spec')
  })

  it('挂载点让 surface_create 用持久式卡片、show_surface 仍用阻塞式卡片', () => {
    expect(text).toContain('EkkoUISurfacePersistentCard')
    expect(text).toContain('isPersistentSurfaceToolName')
    expect(text).toContain('<EkkoUISurfacePersistentCard v-if="isEkkoPersistentSurfaceTool"')
    expect(text).toContain('<EkkoUISurfaceCard v-else-if="isEkkoSurfaceTool"')
  })
})
