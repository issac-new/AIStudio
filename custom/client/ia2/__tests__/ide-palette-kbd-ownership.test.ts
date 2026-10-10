// overlay/custom/client/ia2/__tests__/ide-palette-kbd-ownership.test.ts
// ⌘K 键盘归属守门（2026-10-10 wiki 回归 D6）：协作壳 IaShellHeader 的全局
// ⌘K（Spotlight）与 IDE 壳 IdeShell 的全局 ⌘K（命令面板）同页并存时，
// IDE 路由下必须让位——否则协作侧聚焦搜索框会掠走 IDE 面板 input 焦点，
// 回车执行不了面板命令（浏览器回归 pane-reopen 实锤）。守卫被删/漂移时当场红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { buildIdeRoutes } from '../../ide/routes'

const headerSrc = readFileSync(
  resolve(__dirname, '../components/IaShellHeader.vue'),
  'utf8',
)

function extractFn(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`function ${name} not found`)
  // 花括号配平截取函数体
  let depth = 0, end = -1
  for (let i = src.indexOf('{', start); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i; break } }
  }
  if (end === -1) throw new Error(`function ${name} body not closed`)
  return src.slice(start, end + 1)
}

describe('⌘K 键盘归属（IDE 路由让位）', () => {
  it('IaShellHeader 全局 ⌘K 处理器在 IDE 路由下让位（守卫先于 preventDefault）', () => {
    const fn = extractFn(headerSrc, 'onGlobalPaletteKey')
    const guardIdx = fn.indexOf("route.name === 'ide.shell'")
    const guardPathIdx = fn.indexOf("route.path === '/app/ide'")
    const preventIdx = fn.indexOf('e.preventDefault()')
    const focusIdx = fn.indexOf('searchInputEl.value?.focus()')
    expect(guardIdx).toBeGreaterThan(-1)
    expect(guardPathIdx).toBeGreaterThan(-1)
    // 守卫必须先于副作用（preventDefault/聚焦），否则让位失效
    expect(preventIdx).toBeGreaterThan(guardIdx)
    expect(focusIdx).toBeGreaterThan(guardIdx)
    // 守卫分支必须 return（放行给 IDE 壳的同名监听）
    const guardLine = fn.slice(guardIdx, fn.indexOf('\n', guardIdx))
    expect(guardLine).toContain('return')
  })

  it('路由契约：IDE 壳路由名 ide.shell / 路径 /app/ide 存在（守卫锚点不悬空）', () => {
    const ide = buildIdeRoutes().find(r => r.path === '/app/ide')
    expect(ide).toBeTruthy()
    expect(ide?.name).toBe('ide.shell')
  })
})
