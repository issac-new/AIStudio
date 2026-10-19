// zcode patch 新增文件解析守门：脏树缺文件必须被检出（2026-10-19 CUA 实录）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { addedFilesFromPatch, missingFiles } from '../../../../scripts/lib/zcode-patch-manifest.mjs'

const PATCH_003 = resolve(__dirname, '../../../../zcode-patches/003-zcode-cua-live.patch')

describe('zcode patch 新增文件清单', () => {
  it('解析 unified diff：new file mode 与 /dev/null 两种新增形态都识别', () => {
    const text = [
      'diff --git a/packages/x/a.js b/packages/x/a.js',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/packages/x/a.js',
      '@@ -0,0 +1 @@',
      '+export {}',
      'diff --git a/packages/x/b.js b/packages/x/b.js',
      '--- a/packages/x/b.js',
      '+++ b/packages/x/b.js',
      '@@ -1 +1 @@',
      '-old',
      '+new',
      'diff --git a/packages/x/c.js b/packages/x/c.js',
      '--- /dev/null',
      '+++ b/packages/x/c.js',
      '@@ -0,0 +1 @@',
      '+x',
    ].join('\n')
    expect(addedFilesFromPatch(text)).toEqual(['packages/x/a.js', 'packages/x/c.js'])
  })

  it('003 补丁声明的 CUA 新文件被识别（node-backend/tool-map/mcp-server）', () => {
    const files = addedFilesFromPatch(readFileSync(PATCH_003, 'utf8'))
    expect(files).toContain('packages/zcode-cua/node-backend.js')
    expect(files).toContain('packages/zcode-cua/tool-map.js')
    expect(files).toContain('packages/zcode-cua/mcp-server.js')
  })

  it('missingFiles 只报缺席项，空清单不产噪', () => {
    expect(missingFiles(['a', 'b'], (p) => p === 'a')).toEqual(['b'])
    expect(missingFiles([], () => false)).toEqual([])
  })
})
