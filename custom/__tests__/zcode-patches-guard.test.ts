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
    // 002（2026-11-22 回归批）：测试注册清单 scripts/engineering-test-files.json 是
    // zcode 工程套件唯一 include 事实源——新测试入套件必经此文件；精确放行该单文件，
    // 其余 scripts/ 目标仍全拦（R2 边界不放松到目录级）。
    // 013（2026-11-24 依赖安全刷新）：根 package.json 的 pnpm.overrides 与 pnpm-lock.yaml
    // 是依赖解析的落点，安全刷新只能改这两处；同样精确放行，不放开到“根目录任意文件”。
    const TARGET_ALLOWLIST = new Set(['scripts/engineering-test-files.json', 'package.json', 'pnpm-lock.yaml'])
    for (const p of series) {
      const text = readOverlay(`zcode-patches/${p}`)
      const targets = [...text.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1])
      expect(targets.length, `${p} 无 diff 目标`).toBeGreaterThan(0)
      for (const t of targets) {
        expect(/^(packages|apps)\//.test(t) || TARGET_ALLOWLIST.has(t), `${p} 目标越界: ${t}`).toBe(true)
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

  // 013/014 的修复只在注入态的锁文件与覆盖项里，源码补丁的“文件存在”标记在这里用不上：
  // 补丁没打上时树看起来完全正常，只是依赖还停在带通告的版本。期望值取自补丁文件本身。
  // 014（2026-11-25，挂账清偿批 B）起覆盖面泛化到序列里全部依赖类补丁（NNN-deps-*），
  // 以后再加同类补丁不必改这里。
  it('注入态：依赖安全刷新（序列里全部 deps 类补丁）的覆盖项已在 zcode 树的 package.json 与锁文件里（补丁只在干净树上生效一次）', () => {
    const depsPatches = series.filter((p) => /^0\d{2}-deps-.*\.patch$/.test(p))
    expect(depsPatches.some((p) => p.startsWith('013-')), 'series 未登记 013').toBe(true)
    expect(depsPatches.some((p) => p.startsWith('014-')), 'series 未登记 014').toBe(true)
    let total = 0
    if (!existsSync(resolve(ZCODE_ROOT, 'package.json'))) return // zcode 树不存在时跳过（未克隆环境）
    const injected = existsSync(resolve(ZCODE_ROOT, 'packages/zcode-cua/node-backend.js'))
    const manifest = readFileSync(resolve(ZCODE_ROOT, 'package.json'), 'utf8')
    const lock = readFileSync(resolve(ZCODE_ROOT, 'pnpm-lock.yaml'), 'utf8')
    for (const patchName of depsPatches) {
      const text = readOverlay(`zcode-patches/${patchName}`)
      const manifestHunk = text.slice(text.indexOf('diff --git a/package.json '), text.indexOf('diff --git a/pnpm-lock.yaml '))
      // 只取 overrides 段里的新增行；同一份补丁若还改了 patchedDependencies（如 014 把 vitest
      // 补丁登记的版本号改成 4.1.12），那几行的值是补丁文件路径，不是版本号，不能当覆盖项去锁文件里找。
      const overridesHunk = manifestHunk.slice(0, manifestHunk.indexOf('patchedDependencies') === -1 ? undefined : manifestHunk.indexOf('"patchedDependencies": {'))
      const overrides = [...overridesHunk.matchAll(/^\+\s+"([^"]+)": "([^"]+)",?$/gm)].map((m) => [m[1], m[2]] as const)
      expect(overrides.length, `${patchName} 里没有覆盖项`).toBeGreaterThan(0)
      for (const [selector, version] of overrides) {
        total += 1
        const inManifest = manifest.includes(`${JSON.stringify(selector)}: ${JSON.stringify(version)}`)
        // 锁文件顶部 overrides 段按 YAML 单引号记选择器
        const inLock = lock.includes(`'${selector}': ${version}`) || lock.includes(`${selector}: ${version}`)
        if (injected) {
          expect(inManifest, `${selector} 未写入注入态 package.json——${patchName} 未注入？先 npm run inject`).toBe(true)
          expect(inLock, `${selector} 未出现在注入态锁文件`).toBe(true)
        } else {
          // 干净树（未注入）不应带着覆盖项：说明有人绕过补丁通道直接改了 vendor
          expect(inManifest, `干净树上已有 ${selector}——vendor 基线被直接改动`).toBe(false)
        }
      }
    }
    expect(total, '依赖类补丁的覆盖项总数').toBeGreaterThan(40)
  })
})
