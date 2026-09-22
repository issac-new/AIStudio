// overlay/custom/client/ide/__tests__/split-hitzone-guard.test.ts
// 分割条命中域守门（根治 2026-09-22 真实鼠标拖不动实锤）：分割条视觉 6px，
// 真实鼠标命中率极低；且 z-index 6 被 chat-input-area（z-80）盖住右半——合成
// 事件绕过命中检测测不出，CUA 真实拖拽复现落空。
// 定版：z-index 100 压过栏内全部内容 + ::before 两侧各外延 5px 命中域。
// 本守门防回退：任何人把 z-index 改回 ≤80 或删掉命中域外延，当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(__dirname, '../../../..')
const files = [
  'custom/client/ide/views/IdeShell.vue',
  'custom/client/ia2/views/WorkbenchView.vue',
]

function splitBlock(source: string, cls: string): string {
  // 取 .<cls> { ... } 到下一个顶层规则为止（块内含嵌套 &::before/&:hover）
  const start = source.indexOf(`.${cls} {`)
  if (start < 0) return ''
  const rest = source.slice(start)
  const next = rest.slice(10).search(/\n\.[a-z]/)
  return next < 0 ? rest : rest.slice(0, next + 10)
}

describe('分割条命中域守门（真实鼠标可抓）', () => {
  it('IdeShell/WorkbenchView 分割条：z-index 100 压过栏内内容（chat-input-area z-80）', () => {
    for (const rel of files) {
      const src = readFileSync(resolve(overlayRoot, rel), 'utf8')
      const cls = rel.includes('ide/') ? 'ide-shell__split' : 'wb__split'
      const block = splitBlock(src, cls)
      expect(block, `${rel} 缺 .${cls} 规则`).not.toBe('')
      const z = block.match(/z-index:\s*(\d+)/)
      expect(z, `${rel} .${cls} 缺 z-index`).not.toBeNull()
      expect(Number(z![1]), `${rel} .${cls} z-index 必须 >80 压过 chat-input-area`).toBeGreaterThan(80)
    }
  })

  it('IdeShell/WorkbenchView 分割条：::before 命中域两侧外延（≥4px）', () => {
    for (const rel of files) {
      const src = readFileSync(resolve(overlayRoot, rel), 'utf8')
      const cls = rel.includes('ide/') ? 'ide-shell__split' : 'wb__split'
      const block = splitBlock(src, cls)
      expect(block, `${rel} .${cls} 缺 ::before 命中域`).toContain('&::before')
      const left = block.match(/&::before\s*\{[^}]*left:\s*-(\d+)px/)
      const right = block.match(/&::before\s*\{[^}]*right:\s*-(\d+)px/)
      expect(left, `${rel} ::before 缺 left 外延`).not.toBeNull()
      expect(right, `${rel} ::before 缺 right 外延`).not.toBeNull()
      expect(Number(left![1])).toBeGreaterThanOrEqual(4)
      expect(Number(right![1])).toBeGreaterThanOrEqual(4)
      expect(block).toContain('cursor: col-resize')
    }
  })
})
