// overlay/custom/client/ide/__tests__/scss-syntax-guard.test.ts
// SCSS 语法守门（根治 2026-09-22 回归实锤）：R5 给 IdeSubagentsFloat 加
// steer 样式时引入 unmatched "}"，sass 编译失败导致 IdeChatPane→IdeSubagentsFloat
// 链断、整个 IDE 壳（/ide）与驾驶舱工作台（/app）渲染挂起（vite 报 Internal
// server error，但 vitest 2061 全绿——纯单测测不出运行时 sass 错）。
// 本守门对 ide 全部 .vue 的 <style lang="scss"> 块逐一过 sass.compileString，
// 任何语法错（含悬空 }）当场 fail。新增/改样式必过此门。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'fs'
import { resolve, join } from 'path'
import * as sass from 'sass'

const overlayRoot = resolve(__dirname, '../../../..')
const ideDir = resolve(overlayRoot, 'custom/client/ide')

function collectVueFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue
      out.push(...collectVueFiles(full))
    } else if (entry.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

function extractScssBlocks(source: string): string[] {
  const blocks: string[] = []
  const re = /<style[^>]*lang=["']scss["'][^>]*>([\s\S]*?)<\/style>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) blocks.push(m[1])
  return blocks
}

describe('ide .vue scss 语法守门（防运行时 sass 错断渲染链）', () => {
  const files = collectVueFiles(ideDir)
  expect(files.length).toBeGreaterThan(20) // ide 组件数量下限，防收集退化

  for (const file of files) {
    const rel = file.replace(overlayRoot + '/', '')
    const blocks = extractScssBlocks(readFileSync(file, 'utf8'))
    if (blocks.length === 0) continue
    it(`${rel}：${blocks.length} 个 scss 块全部可编译`, () => {
      blocks.forEach((scss, i) => {
        expect(
          () => sass.compileString(scss, { syntax: 'scss' }),
          `第 ${i + 1} 个 <style lang="scss"> 块语法错（如 unmatched }} 会断 vite 渲染链）`,
        ).not.toThrow()
      })
    })
  }
})
