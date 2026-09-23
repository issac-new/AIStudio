// overlay/custom/__tests__/zcode-patches-guard.test.ts
// 守门：zcode 源码底座受管 patch 机制（2026-09-23 R2）。
// ① zcode-patches/series 与文件一一对应；② patch 目标都落在 zcode 仓内；
// ③ inject.mjs 双管线接线（目录路由 + manifest 键）；④ 接入脚本与 npm scripts；
// ⑤ 注入态断言（同 appsidebar 模式：patch 丢失/漂移当场 fail）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../..')
const ZCODE_ROOT = resolve(OVERLAY_ROOT, '..', 'upstream', 'zcode')

function readOverlay(rel: string): string {
  return readFileSync(resolve(OVERLAY_ROOT, rel), 'utf8')
}

describe('zcode-patches 受管机制（R2 守门）', () => {
  const series = readOverlay('zcode-patches/series')
    .split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))

  it('series 非空且条目文件一一存在', () => {
    expect(series.length).toBeGreaterThan(0)
    for (const p of series) {
      expect(existsSync(resolve(OVERLAY_ROOT, 'zcode-patches', p)), `缺 ${p}`).toBe(true)
    }
  })

  it('patch 目标全部落在 zcode 仓内（packages/ 或 apps/ 首段）', () => {
    for (const p of series) {
      const text = readOverlay(`zcode-patches/${p}`)
      const targets = [...text.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1])
      expect(targets.length, `${p} 无 diff 目标`).toBeGreaterThan(0)
      for (const t of targets) {
        expect(/^(packages|apps)\//.test(t), `${p} 目标越界: ${t}`).toBe(true)
      }
    }
  })

  it('inject.mjs 双管线接线：目录路由 + manifest 键 + clean 反向', () => {
    const inject = readOverlay('scripts/inject.mjs')
    expect(inject).toContain('readZcodeSeries')
    expect(inject).toContain('applyZcodePatches')
    expect(inject).toContain('reverseZcodePatches')
    expect(inject).toContain('appliedZcodePatches')
    // 容错语义：zcode patch 失败跳过而非 exit(1)（同 hermes-agent）
    expect(inject).toMatch(/zcode patch 失败,跳过/)
  })

  it('接入脚本存在且挂到 npm scripts（zcode:ensure/zcode:serve）', () => {
    expect(existsSync(resolve(OVERLAY_ROOT, 'scripts/zcode-engine.mjs'))).toBe(true)
    const pkg = JSON.parse(readOverlay('package.json'))
    expect(pkg.scripts['zcode:ensure']).toContain('zcode-engine.mjs ensure')
    expect(pkg.scripts['zcode:serve']).toContain('zcode-engine.mjs serve')
  })

  it('注入态：zcode 树已应用 series 全部 patch（appsidebar 同模式，clean 后跑则 fail 提示注入）', () => {
    const tsupPath = resolve(ZCODE_ROOT, 'packages/zcode-server-cli/tsup.config.ts')
    if (!existsSync(tsupPath)) return // zcode 树不存在时跳过（未克隆环境）
    const tsup = readFileSync(tsupPath, 'utf8')
    expect(tsup, 'yazl external 缺失——zcode patch 001 未注入？先 npm run inject').toMatch(/"yazl",/)
  })
})
