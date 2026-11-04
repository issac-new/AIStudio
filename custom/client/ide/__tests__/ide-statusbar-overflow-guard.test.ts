// overlay/custom/client/ide/__tests__/ide-statusbar-overflow-guard.test.ts
// 守门（2026-11-04 走查 bug1）：状态栏栏级 overflow:hidden 会把向上弹出的面板
// （工具下拉 IdeDevTools / ⚙ 插槽面板，均 bottom:100%）整个裁掉——DOM 里开着
// 但不可见不可点。jsdom 无真实层叠/裁剪，行为级断言不可行，取源码级断言
// （docs-ssot-guard / CSS 幽灵变量守门同先例）：
//   1. .ide-statusbar 块不得再声明 overflow: hidden
//   2. 两弹出面板 z-index ≥110（压过 .ide-shell__split 的 z-100 加宽命中域）
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ideRoot = resolve(__dirname, '..')

function read(rel: string): string {
  return readFileSync(resolve(ideRoot, rel), 'utf8')
}

/** 提取 SCSS 顶层类块（花括号配平，嵌套块并入父块文本）；剥注释——注释里的
 * 字样（如解释性 overflow:hidden）不算声明。 */
function cssBlock(src: string, selector: string): string {
  const idx = src.indexOf(selector)
  if (idx === -1) throw new Error(`selector not found: ${selector}`)
  const start = src.indexOf('{', idx)
  let depth = 0
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return src.slice(start, i).replace(/\/\*[\s\S]*?\*\//g, '')
    }
  }
  throw new Error(`unbalanced block: ${selector}`)
}

describe('IDE 状态栏弹出面板不被裁剪（bug1 守门）', () => {
  it('.ide-statusbar 栏级不再 overflow:hidden（向上弹出的面板依赖栏不裁剪）', () => {
    const block = cssBlock(read('views/IdeStatusBar.vue'), '.ide-statusbar {')
    expect(block, '栏级裁剪回归会重新裁掉工具/插槽面板').not.toMatch(/overflow:\s*hidden/)
    expect(block).toMatch(/overflow:\s*visible/)
  })

  it('⚙ 插槽面板 z-index ≥110（压过 .ide-shell__split z-100 命中域）', () => {
    const block = cssBlock(read('views/IdeStatusBar.vue'), '.ide-statusbar__slots-panel {')
    const z = Number(/z-index:\s*(\d+)/.exec(block)?.[1] ?? 0)
    expect(z).toBeGreaterThanOrEqual(110)
  })

  it('工具下拉面板 z-index ≥110（IdeDevTools）', () => {
    const block = cssBlock(read('components/IdeDevTools.vue'), '.ide-devtools__panel {')
    const z = Number(/z-index:\s*(\d+)/.exec(block)?.[1] ?? 0)
    expect(z).toBeGreaterThanOrEqual(110)
  })
})

describe('任务工作区根只读放行（bug2/3 守门：补丁 734 内容锚定）', () => {
  const patch = readFileSync(
    resolve(ideRoot, '../../../patches/734-server-files-root-task-workspace-readonly.patch'),
    'utf8',
  )

  it('补丁 734 存在且覆盖 files/download 两个控制器', () => {
    expect(patch).toContain('controllers/files.ts')
    expect(patch).toContain('controllers/download.ts')
  })

  it('三处 super_admin 闸均带任务工作区放行（isWithinKnownTaskWorkspace）', () => {
    const relaxCount = (patch.match(/isWithinKnownTaskWorkspace/g) ?? []).length
    // list/stat/download 三处闸门，每处 candidate 检查 2 次（prime 前后复查）
    expect(relaxCount).toBeGreaterThanOrEqual(6)
  })

  it('写面端点仍挂 requireSuperAdmin（routes 层不放松）', () => {
    const routes = readFileSync(
      resolve(ideRoot, '../../../vendor/hermes-studio/packages/server/src/modules/studio/routes/files.ts'),
      'utf8',
    )
    const gated = (routes.match(/requireSuperAdmin/g) ?? []).length
    expect(gated, '写面 8 端点 super_admin 闸必须原样保留').toBeGreaterThanOrEqual(8)
  })
})
