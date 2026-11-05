// overlay/custom/server/harness/workbench/execution-trace.ts
// 执行证迹（W1，2026-11-05 四篇论文吸收）。
//
// Evo² §3.3.2 的硬约束：Reflector 的正增益只有在轨迹里能证明新机制真的运行过才计入，
// 否则置零；Harness² 的 compose 同样规定「任何关联 rollout 没产出交付物，该编辑判 UNSAFE」。
// 本模块只做一件事：从候选树推导**可判定标记**，再在探测轨迹里查这些标记是否出现。
//
// 边界（不造假）：
//   · skills / sub_agents 是文本件，可被自动探测；标记=名称。
//   · scripts / plugin 被 probe-runner 的禁跑闸拦住（assertTreeRunnable），不产生标记。
//   · system_prompt / guardrails / memory / tool_guidance 的「执行」就是被写进提示词，
//     轨迹证不了，记 static——不拿提示词哈希冒充行为证据。
import type { ExecutionTrace, SurfaceKey, Variant } from './types'

const OBSERVABLE_PREFIXES = ['skills/', 'sub_agents/', 'subagents/']

/** 从候选树推导标记：skill 目录名/文件名、子代理文件名。 */
export function executionMarkersOf(variant: Variant): { markers: string[]; observable: boolean } {
  const markers = new Set<string>()
  for (const file of variant.files ?? []) {
    const marker = markerOfPath(file.path)
    if (marker) markers.add(marker)
  }
  const list = [...markers].sort()
  return { markers: list, observable: list.length > 0 }
}

/** 单路径 → 标记；非可观测面返回 null。 */
export function markerOfPath(rawPath: string): string | null {
  const path = String(rawPath ?? '').replace(/\\/g, '/').replace(/^\.\//, '')
  if (!OBSERVABLE_PREFIXES.some((p) => path.startsWith(p))) return null
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  if (parts[0] === 'skills') {
    // skills/<name>/SKILL.md → <name>；skills/<name>.md → <name>
    if (parts.length === 2) return stripExt(parts[1])
    return parts[1]
  }
  // sub_agents/<name>.md → <name>
  return stripExt(parts[parts.length - 1])
}

function stripExt(name: string): string {
  return name.replace(/\.(md|markdown|txt|ya?ml)$/i, '')
}

/**
 * 汇总一次探测的执行证迹。
 * @param markers 候选的可判定标记（executionMarkersOf 的产物）
 * @param hits 轨迹中命中的标记
 * @param scannedChars 实际扫描字符数
 */
export function computeExecutionTrace(
  markers: string[],
  hits: string[],
  scannedChars: number,
  at: string = new Date().toISOString(),
): ExecutionTrace {
  const uniqueMarkers = [...new Set(markers.filter((m) => m.trim()))]
  if (uniqueMarkers.length === 0) {
    return { status: 'static', markers: [], hit: [], hitRatio: null, scannedChars, source: 'none', at }
  }
  const hitSet = new Set(hits)
  const matched = uniqueMarkers.filter((m) => hitSet.has(m))
  return {
    status: 'observed',
    markers: uniqueMarkers,
    hit: matched,
    hitRatio: matched.length / uniqueMarkers.length,
    scannedChars,
    source: 'stream-json',
    at,
  }
}

/** 未采集时的占位（面板/报告如实显示「未采集」）。 */
export function absentExecutionTrace(at: string = new Date().toISOString()): ExecutionTrace {
  return { status: 'absent', markers: [], hit: [], hitRatio: null, scannedChars: 0, source: 'none', at }
}

/** 该面是否可能产出执行证迹（起草器/面板提示用）。 */
export function surfaceTraceable(surfaceKey: SurfaceKey): boolean {
  return surfaceKey === 'skills'
}
