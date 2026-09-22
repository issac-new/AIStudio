// overlay/custom/client/ide/__tests__/split-visual-coupling-guard.test.ts
// 分割条「可见耦合」守门（根治 2026-09-22 三分条拖了不动二轮）：上轮修复后事件链、
// localStorage、aside 盒宽全部「验证通过」，但用户看到的可见面板/轨道纹丝不动——
// 验证量错了对象。两处可见层断链实锤：
//   1) /app WorkbenchView：.wb 是 grid 且轨道写死 250px/240px，grid item 的内联
//      width 改不动固定轨道——aside 拖宽只是溢出轨道（被中栏盖住/悬出屏外）。
//   2) /ide IdeTaskSidebar：根节点 .ide-taskbar 写死 width:270px，aside 拖动与
//      可见面板无关（右栏 .ide-sidepane 因无固定宽而「唯一正常」即此差异）。
// 本守门防回退：宽度必须作用于「可见层」（grid 轨道 / 面板根宽度），任何人改回
// 作用于不可见层（grid item 内联 width / 面板固定宽），当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(__dirname, '../../../..')
const read = (rel: string): string => readFileSync(resolve(overlayRoot, rel), 'utf8')
/** 剥块注释与行注释，防注释里的历史数值（"曾固定 270px"）误命中 */
const stripComments = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
/** 取 .<cls> { ... } 规则块（到下一个顶层选择器为止） */
function ruleBlock(source: string, cls: string): string {
  const clean = stripComments(source)
  const start = clean.indexOf(`.${cls} {`)
  if (start < 0) return ''
  const rest = clean.slice(start)
  const next = rest.slice(clean.slice(start).indexOf('{') + 1).search(/\n\.[a-z]/)
  return next < 0 ? rest : rest.slice(0, rest.indexOf('{') + 1 + next + 1)
}

describe('分割条可见耦合守门（拖拽必须作用于可见层）', () => {
  it('/app WorkbenchView：栏宽必须进 grid 轨道（wbGridStyle 内联绑定）', () => {
    const src = read('custom/client/ia2/views/WorkbenchView.vue')
    expect(src).toContain('gridTemplateColumns')
    expect(src).toContain('${leftWidth.value}px')
    expect(src).toContain('${rightWidth.value}px')
    expect(src).toMatch(/:style="wbGridStyle"/)
  })

  it('/app WorkbenchView：grid item 上不得再挂内联 width（对固定轨道无效的旧病根）', () => {
    const src = read('custom/client/ia2/views/WorkbenchView.vue')
    expect(src).not.toContain('leftWidthStyle')
    expect(src).not.toContain('rightWidthStyle')
    // 栏容器规则块自身也不得写死 width（轨道才是宽度的唯一入口）
    for (const cls of ['wb__left', 'wb__right']) {
      const block = ruleBlock(src, cls)
      if (block) expect(block).not.toMatch(/(?<!min-)(?<!max-)width:\s*\d+px/)
    }
  })

  it('/ide IdeTaskSidebar：根面板不得固定宽（曾 270px 冻结可见层）', () => {
    const block = ruleBlock(read('custom/client/ide/views/IdeTaskSidebar.vue'), 'ide-taskbar')
    expect(block, '缺 .ide-taskbar 根规则').not.toBe('')
    expect(block).not.toMatch(/width:\s*\d+px/)
    expect(block).toMatch(/width:\s*100%/)
  })

  it('/ide IdeSidePane：根面板 min-width 不得超过 colWidths MIN_W（拖到下限须仍跟随）', () => {
    const colsSrc = read('custom/client/ia2/utils/colWidths.ts')
    const minW = Number(colsSrc.match(/MIN_W\s*=\s*(\d+)/)?.[1])
    expect(minW).toBeGreaterThan(0)
    const block = ruleBlock(read('custom/client/ide/views/IdeSidePane.vue'), 'ide-sidepane')
    expect(block, '缺 .ide-sidepane 根规则').not.toBe('')
    const mw = block.match(/min-width:\s*(\d+)px/)?.[1]
    expect(mw ? Number(mw) : 0, `min-width ${mw ?? 0} 不得超过 MIN_W=${minW}`).toBeLessThanOrEqual(minW)
  })

  it('/ide IdeShell：右栏最大化时 panewrap 须放开 flex（内联宽度常态钉死会压住最大化）', () => {
    const src = stripComments(read('custom/client/ide/views/IdeShell.vue'))
    expect(src).toMatch(/has-max-sidepane\s+\.ide-shell__panewrap\s*\{\s*flex:\s*1/)
  })
})
