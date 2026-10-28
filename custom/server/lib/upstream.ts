// custom/server/lib/upstream.ts
// 上游模块的运行期加载（2026-10-28 K17）：
//
// 背景：custom 侧有 6 处 `require('../../../../upstream/hermes-studio/…')`。这个字面量是
// **构建期契约**——`vendor/hermes-studio/scripts/build-server.mjs` 的 esbuild 插件
// （补丁 525/663 `overlay-upstream-escape`）按 `(../)+upstream/<tree>/` 前缀把模块重锚进包体，
// 打包产物里这些 require 被静态内联，不依赖运行期路径。
//
// 但 dev（ts-node）下同一字面量按文件真实位置解析：`<repo>/custom/server/<域>` 上溯四层
// 落到仓外，只有在存在历史兄弟目录 `<repo>/../upstream/`（或仓内 `upstream/`）的机器上才
// 解析成功。纯单仓检出会直接抛 ENOENT。
//
// 因此本模块提供「先字面量、失败再按解析序回退」的加载器：
//   - 生产打包：字面量被打包，永不走回退（行为与今日一致）。
//   - dev/沙箱：字面量失败时按 env（OVERLAY_UPSTREAM_ROOT）→ 仓内 vendor → 仓内 upstream
//     → 兄弟 ../upstream 解析。
// 解析根以**模块位置**为锚（向上找含 package.json 且 name=aistudio 的仓根），不用 cwd——
// serve-server 以 vendor 树为子进程 cwd，用 cwd 会解析到 vendor/vendor。
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

let cachedRepoRoot: string | null = null

/**
 * 仓根解析（CJS 编译产物里不可用 import.meta，故以 cwd 上溯 + 仓库标记 package.json）。
 * 关键用例：dev server 以 vendor/hermes-studio 为 cwd 启动，上溯两级即命中本仓根
 * （vendor/hermes-studio → vendor → 仓根 name=aistudio），因此不依赖调用位置。
 * OVERLAY_REPO_ROOT 可显式覆盖（容器/异常 cwd）。
 */
export function repoRoot(): string {
  if (cachedRepoRoot) return cachedRepoRoot
  const env = process.env.OVERLAY_REPO_ROOT?.trim()
  if (env) { cachedRepoRoot = resolve(env); return cachedRepoRoot }
  let dir = process.cwd()
  for (let i = 0; i < 12; i += 1) {
    const pkg = join(dir, 'package.json')
    if (existsSync(pkg)) {
      try {
        if (JSON.parse(readFileSync(pkg, 'utf8')).name === 'aistudio') { cachedRepoRoot = dir; return dir }
      } catch { /* 坏 package.json 继续上溯 */ }
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  cachedRepoRoot = process.cwd()
  return cachedRepoRoot
}

/** 上游树候选根（按优先级）：显式 env → 仓内 vendor → 仓内 upstream → 兄弟 upstream */
export function upstreamRoots(tree: string): string[] {
  const roots: string[] = []
  const env = process.env.OVERLAY_UPSTREAM_ROOT?.trim()
  if (env) roots.push(resolve(env, tree))
  const repo = repoRoot()
  roots.push(join(repo, 'vendor', tree))
  roots.push(join(repo, 'upstream', tree))
  roots.push(resolve(repo, '..', 'upstream', tree))
  return roots
}

/** 解析某树内文件的绝对路径（不存在时返回首选候选，便于错误信息指向具体文件） */
export function upstreamFile(tree: string, ...segments: string[]): string {
  const roots = upstreamRoots(tree)
  for (const root of roots) {
    const p = join(root, ...segments)
    if (existsSync(p) || existsSync(`${p}.ts`) || existsSync(`${p}.js`)) return p
  }
  return join(roots[0], ...segments)
}

/**
 * 上游模块加载：先走构建期字面量（让 esbuild 静态打包），失败再按解析序回退。
 * `loadLiteral` 必须是**含字面量 require 的箭头函数**，否则打包期无法解析。
 */
export function loadUpstreamModule<T>(loadLiteral: () => T, tree: string, ...segments: string[]): T {
  try {
    return loadLiteral()
  } catch {
    const file = upstreamFile(tree, ...segments)
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(file) as T
  }
}
