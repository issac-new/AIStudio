// overlay[simcenter]: 观察根与 run 守卫纯函数（自 simcenter-controller 抽出，2026-10-23
// 天猫吸收轮）。抽出动机：delivery/expertise 等消费域只需这几个纯函数，直接 import
// controller 会把整个 controller（含 @koa/router 依赖与更宽的类型面）拖进自身编译图。
// 本模块是唯一事实源；simcenter-controller 再导出保持既有 import 路径不破。

import { existsSync, statSync, readdirSync, realpathSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { homedir } from 'node:os'

/** run 参数字符集校验（纯函数）：631 同款 /^[A-Za-z0-9_.-]{1,64}$/。 */
export function isValidRun(run: string): boolean {
  return /^[A-Za-z0-9_.-]{1,64}$/.test(run)
}

/** 路径穿越二道闸（纯函数）：字符集放行的 '..'/'.' 在 resolve 后逃出 runs/ 基座
 * 即拒（startsWith(base+sep) 且不等于基座）。返回安全 run 目录或 null。 */
export function safeRunDir(root: string, run: string): string | null {
  if (!isValidRun(run)) return null
  const base = resolve(root, 'runs')
  const dir = resolve(base, run)
  if (dir === base || !dir.startsWith(base + sep)) return null
  return dir
}

/** SIM 根（fail-closed 门）：OBS_SIM_ROOT 缺席或不存在→null（调用方回 503）。 */
export function simRootOrNull(): string | null {
  const root = process.env.OBS_SIM_ROOT
  return root && existsSync(root) ? root : null
}

/** 观察面 SIM 根候选（纯函数，测试面）：显式 env 优先，其后按 overlay/upstream
 *  两种进程 cwd 形态向上找同级 ncwk-sim-mux，最后家目录约定位。 */
export function observerSimRootCandidates(env: NodeJS.ProcessEnv, cwd: string, home: string): string[] {
  const explicit = [env.SIM_OBSERVER_ROOT, env.OBS_SIM_ROOT, env.SIM_ROOT, env.AIPAY_SIM_ROOT]
    .map(v => (v ?? '').trim()).filter(Boolean) as string[]
  const heuristic = [
    resolve(cwd, '../ncwk-sim-mux'),
    resolve(cwd, '../../ncwk-sim-mux'),
    resolve(cwd, '../../../ncwk-sim-mux'),
    resolve(home, 'ncwk-sim-mux'),
  ]
  return [...new Set([...explicit, ...heuristic])]
}

/** 观察面 SIM 根解析：候选中第一个存在的目录；全缺席返回 null（fail-soft）。 */
export function observerSimRootOrNull(): string | null {
  for (const p of observerSimRootCandidates(process.env, process.cwd(), homedir())) {
    try { if (statSync(p).isDirectory()) return p } catch { /* 候选缺席继续 */ }
  }
  return null
}

/** 当前 run 解析（纯读）：优先 var/current-state.env 软链真身（runs/<id>/state.env），
 *  缺席回落 runs/* 按 state.env mtime 最新。均缺席返回 runId:null。 */
export function currentRunOf(root: string): { runId: string | null; stateFile: string | null } {
  try {
    const link = resolve(root, 'var', 'current-state.env')
    if (existsSync(link)) {
      const real = realpathSync(link)
      const m = /runs[/\\]([^/\\]+)[/\\]state\.env$/.exec(real)
      if (m) return { runId: m[1], stateFile: real }
    }
  } catch { /* 软链解析失败走回落 */ }
  try {
    const runsDir = resolve(root, 'runs')
    if (!existsSync(runsDir)) return { runId: null, stateFile: null }
    let best: { runId: string; stateFile: string; mtime: number } | null = null
    for (const name of readdirSync(runsDir)) {
      if (!isValidRun(name)) continue
      const stateFile = resolve(runsDir, name, 'state.env')
      try {
        const mtime = statSync(stateFile).mtimeMs
        if (!best || mtime > best.mtime) best = { runId: name, stateFile, mtime }
      } catch { /* 单 run 缺 state.env 跳过 */ }
    }
    return best ? { runId: best.runId, stateFile: best.stateFile } : { runId: null, stateFile: null }
  } catch {
    return { runId: null, stateFile: null }
  }
}
