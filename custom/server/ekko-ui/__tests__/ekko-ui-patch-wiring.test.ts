// @vitest-environment node
// overlay/custom/server/ekko-ui/__tests__/ekko-ui-patch-wiring.test.ts
// 批二补丁接线标记断言：锁 820/821 的接线痕迹，防补丁在重放或上游升级时静默漂移。
// 对补丁文本做断言（补丁是单一事实源），不依赖注入态——注入态的重放由 patches-series-guard 与全量重放验证。
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'fs'
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

describe('协议目录的模块格式作用域', () => {
  it('custom/client/chat/ekko-ui/package.json 存在且无 type 字段（截断根 type:module 继承）', () => {
    // 缺失时 ts-node 把 protocol.ts 当 ESM，服务端启动即 ERR_REQUIRE_ESM（2026-11-25 走查实测）
    const pkg = JSON.parse(readFileSync(resolve(__dirname, '../../../client/chat/ekko-ui/package.json'), 'utf8'))
    expect(pkg.type).toBeUndefined()
  })
})

describe('补丁 821：接线', () => {
  const text = patch('821-studio-ekko-ui-persistent-wiring.patch')