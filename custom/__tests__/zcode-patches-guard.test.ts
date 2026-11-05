// overlay/custom/__tests__/zcode-patches-guard.test.ts
// 守门：zcode 源码底座受管 patch 机制（2026-09-23 R2）。
// ① zcode-patches/series 与文件一一对应；② patch 目标都落在 zcode 仓内；
// ③ inject.mjs 双管线接线（目录路由 + manifest 键）；④ 接入脚本与 npm scripts；
// ⑤ 注入态断言（同 appsidebar 模式：patch 丢失/漂移当场 fail）。
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'

const OVERLAY_ROOT = resolve(__dirname, '../..')
// 底座源码解析序与 inject/build 一致：仓内 vendor/zcode 优先，旧兄弟 upstream 仅作回落
// （单仓检出没有 ../upstream，旧写法会让本守门读到不存在的树）。
const ZCODE_ROOT = existsSync(resolve(OVERLAY_ROOT, 'vendor', 'zcode'))
  ? resolve(OVERLAY_ROOT, 'vendor', 'zcode')
  : resolve(OVERLAY_ROOT, '..', 'upstream', 'zcode')

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

  it('inject 主链双通道接线：目录路由 + manifest 派生 + clean 反向（P1 v2 语义）', () => {
    const inject = readOverlay('scripts/inject.mjs')
    expect(inject).toContain('readZcodeSeries')
    // P1 平台重写起 zcode apply 不再有独立 applyZcodePatches 函数——走平台 executor
    // （channel 路由 + 事务化应用），接线断言改为计划构造与 manifest v2 派生面。
    expect(inject).toContain('buildOverlayPlan')
    expect(inject).toContain('reverseZcodePatches')
    const manifestCore = readOverlay('scripts/platform/inject/manifest.mjs')
    expect(manifestCore).toContain('deriveAppliedZcodePatches')
    expect(manifestCore).toContain('deriveAppliedPatches')
    // 容错语义：zcode 是可选树（缺席/失败不牵连 studio 主链）
    expect(inject).toMatch(/可选树/)
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
    // 001 已在 v3.16.1 基线轮退役（yazl 由上游原生外置），改用 003 的运行时产物作注入标记。
    expect(
      existsSync(resolve(ZCODE_ROOT, 'packages/zcode-cua/node-backend.js')),
      'CUA 运行时缺失——zcode 补丁未注入？先 npm run inject',
    ).toBe(true)
  })
})
