// overlay/custom/server/harness/workbench/probe-runner.ts
// 一键自动探测（spec §13）：物化候选树到隔离 HERMES_HOME，子进程驱动真实评测任务，
// 逐题记真实成本，超支硬停。可执行件（scripts/plugins/hooks/脚本文件）禁跑。
//
// 纪律：
//   1. spawnRun / sleep 全部可注入——单测不真起 agent，不伪造运行。
//   2. trace 只读隔离目录，不碰生产 ~/.hermes/traces。
//   3. 价目缺失的任务按估值记账并计入 estimatedTasks，如实呈现。
import { execFile } from 'child_process'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'
import { evidenceFromTraceLines } from '../../eval/runner'
import type { Evidence } from '../../eval/types'
import type { Variant } from './types'

/** 禁跑面：可执行件一律拒绝自动探测（spec §13 安全闸）。 */
const EXECUTABLE_RX = /\.(py|js|ts|sh|mjs|cjs)$/
const FORBIDDEN_PREFIX_RX = /^(scripts|plugin|plugins)\//

export function assertTreeRunnable(variant: Variant): { ok: boolean; problems: string[] } {
  const problems: string[] = []
  const paths = (variant.files ?? []).map((f) => f.path)
  if (paths.length === 0) paths.push('(single-file)')
  for (const rel of paths) {
    const p = rel.replace(/\\/g, '/')
    if (p === '.codex/hooks.json') {
      problems.push('.codex/hooks.json 会在工具循环内执行命令，禁跑')
      continue
    }
    if (FORBIDDEN_PREFIX_RX.test(p) || EXECUTABLE_RX.test(p)) {
      problems.push(`${p} 属可执行件，自动探测禁跑（纯文本候选才可自动跑）`)
    }
  }
  return { ok: problems.length === 0, problems }
}

/**
 * 物化隔离 home：base 内未触及条目符号链接；触及文件写实内容；deletions 不落盘。
 * 只处理相对路径，'..' 与绝对路径一律拒绝。
 */
export function materializeHome(
  baseHome: string,
  isoHome: string,
  tree: Record<string, string | null>,
): { ok: boolean; touched: string[]; error?: string } {
  const touched: string[] = []
  for (const rel of Object.keys(tree)) {
    if (rel.startsWith('/') || rel.split('/').includes('..')) {
      return { ok: false, touched: [], error: `非法树路径：${rel}` }
    }
  }
  mkdirSync(isoHome, { recursive: true })
  try {
    if (existsSync(baseHome)) {
      for (const entry of readdirSync(baseHome)) {
        const src = join(baseHome, entry)
        const dest = join(isoHome, entry)
        const hasTreeUnder = Object.keys(tree).some((rel) => rel === entry || rel.startsWith(`${entry}/`))
        if (!hasTreeUnder) {
          symlinkSync(src, dest)
          continue
        }
        const st = statSync(src)
        if (st.isDirectory()) {
          materializeDir(src, dest, entry, tree, touched)
        } else {
          const content = tree[entry]
          if (content != null) {
            writeFileSync(dest, content, 'utf8')
            touched.push(entry)
          }
        }
      }
    }
    // base 中不存在的树文件（新建）
    for (const [rel, content] of Object.entries(tree)) {
      if (content == null) continue
      const dest = join(isoHome, rel)
      if (!existsSync(dest)) {
        mkdirSync(dirname(dest), { recursive: true })
        writeFileSync(dest, content, 'utf8')
        touched.push(rel)
      }
    }
  } catch (e) {
    return { ok: false, touched, error: e instanceof Error ? e.message : String(e) }
  }
  return { ok: true, touched }
}

function materializeDir(
  srcDir: string,
  destDir: string,
  prefix: string,
  tree: Record<string, string | null>,
  touched: string[],
): void {
  mkdirSync(destDir, { recursive: true })
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry)
    const dest = join(destDir, entry)
    const rel = `${prefix}/${entry}`
    const exact = rel in tree
    const hasTreeUnder = Object.keys(tree).some((p) => p.startsWith(`${rel}/`))
    if (!exact && !hasTreeUnder) {
      symlinkSync(src, dest)
      continue
    }
    if (statSync(src).isDirectory() && hasTreeUnder && !exact) {
      materializeDir(src, dest, rel, tree, touched)
      continue
    }
    if (exact) {
      const content = tree[rel]
      if (content != null) {
        if (statSync(src).isDirectory()) {
          materializeDir(src, dest, rel, tree, touched)
        } else {
          writeFileSync(dest, content, 'utf8')
        }
        touched.push(rel)
      }
      // null = 删除：不落盘
    } else if (statSync(src).isDirectory()) {
      materializeDir(src, dest, rel, tree, touched)
    }
  }
}

// ---------- 任务驱动 ----------

export interface SpawnRunResult { ok: boolean; error?: string; /** stream-json stdout（新 CLI 机器可读通道；缺席则回退 trace 通道。 */ stdout?: string }

export type SpawnRun = (prompt: string, env: Record<string, string>, timeoutMs: number) => Promise<SpawnRunResult>

export interface TraceRead {
  sessionId: string
  evidence: Evidence
  /** trace usage 同源成本；价目缺失为 null（由调用方按估值记账）。 */
  costUsd: number | null
}

export const DEFAULT_TASK_COST_ESTIMATE_USD = 0.5
export const DEFAULT_TASK_TIMEOUT_MS = 600_000

function hermesBin(): string {
  return process.env.HERMES_PROBE_HERMES_BIN?.trim() || 'hermes'
}

/**
 * 默认驱动：kanban 派发先例的子进程形态（-p profile + --cli + accept-hooks）。
 * 失败时附 stderr 尾部——走查实录：只回 "Command failed" 吞掉现场，无法定位
 * （曾因此把模型 API 瞬态故障误判为隔离环境缺陷）。
 */
export const defaultSpawnRun: SpawnRun = (prompt, env, timeoutMs) =>
  new Promise((resolvePromise) => {
    execFile(
      hermesBin(),
      ['-p', env.HERMES_PROBE_PROFILE ?? 'orchestrator', '--cli', '--accept-hooks', 'chat',
        '--format', 'stream-json', '-q', prompt],
      { env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const tail = String(stderr ?? '').trim().slice(-400)
          const head = String(error.message ?? error).slice(0, 300)
          resolvePromise({ ok: false, error: tail ? `${head} | stderr 尾部：${tail}` : head })
        } else {
          resolvePromise({ ok: true, stdout: String(stdout ?? '') })
        }
      },
    )
  })

/**
 * stream-json result 事件 → 证据（新 CLI 的机器可读通道；走查实证当前 CLI 不落
 * jsonl trace，readNewestTrace 的 trace 通道降级为后备）。
 */
interface StreamJsonResult {
  session_id?: string
  exit_code?: number
  text?: string
  tokens?: { total?: number }
  duration_ms?: number
}

export function evidenceFromStreamJson(stdout: string): { sessionId: string; evidence: Evidence } | null {
  let last: StreamJsonResult | null = null
  for (const line of String(stdout ?? '').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const doc = JSON.parse(t) as { type?: string } & StreamJsonResult
      if (doc.type === 'result') last = doc
    } catch { /* 非 JSON 行跳过 */ }
  }
  if (!last || typeof last.text !== 'string') return null
  const tokens = typeof last.tokens?.total === 'number' ? last.tokens.total : undefined
  return {
    sessionId: typeof last.session_id === 'string' ? last.session_id : '',
    evidence: {
      transcript: last.text,
      ...(tokens != null || typeof last.duration_ms === 'number'
        ? { efficiency: { ...(tokens != null ? { tokens } : {}), ...(typeof last.duration_ms === 'number' ? { durationMs: last.duration_ms } : {}) } }
        : {}),
    },
  }
}

/** 读取隔离 traces 目录中 sinceMs 之后产生的最新一份 trace。 */
export function readNewestTrace(tracesDir: string, sinceMs: number): TraceRead | null {
  if (!existsSync(tracesDir)) return null
  const files = readdirSync(tracesDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => ({ f, mtime: statSync(join(tracesDir, f)).mtimeMs }))
    .filter((x) => x.mtime >= sinceMs)
    .sort((a, b) => b.mtime - a.mtime)
  if (files.length === 0) return null
  const file = join(tracesDir, files[0].f)
  const lines: Array<Record<string, unknown>> = []
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      lines.push(JSON.parse(trimmed) as Record<string, unknown>)
    } catch { /* 半行跳过 */ }
  }
  const header = lines.find((l) => l.type === 'header')
  const sessionId = typeof header?.session_id === 'string' ? header.session_id : basename(file, '.jsonl')
  const evidence = evidenceFromTraceLines(lines)
  return { sessionId, evidence, costUsd: evidence.efficiency?.costUsd ?? null }
}

export interface ProbeTaskRunOptions {
  prompts: Array<{ taskId: string; prompt: string }>
  baseHome: string
  profile: string
  variantTree: Record<string, string | null>
  budgetRemainingUsd: number
  /** 每题样本数（R4/D4 匹配预算口径；缺省 2，预算不足时由调用方降 1）。 */
  k?: number
  estimatePerTaskUsd?: number
  timeoutPerTaskMs?: number
  spawnRun?: SpawnRun
  onProgress?: (done: number, costUsd: number, estimatedTasks: number) => void
  /** spawn 失败重试前的等待（缺省 5s；测试传 0）。 */
  retryDelayMs?: number
  /**
   * 并发样本数（调度面 probeConcurrency，2026-11-03）：1=串行（缺省，行为与旧版一致）；
   * >1 时按有界工作池并行跑「题×样本」单元，预算按在途估值预扣，避免并发超支。
   */
  concurrency?: number
  /**
   * 执行证迹标记（W1，2026-11-05）：候选引入的 skill/子代理名。给了就在每个单元的
   * 原始 stream-json stdout 上做包含性扫描，回 markerHits。不给=不采集。
   */
  markers?: string[]
}

/** 执行证迹的采集读数（W1）：命中集合 + 实际扫描字符数。 */
export interface MarkerHits {
  markers: string[]
  hits: string[]
  scannedChars: number
}

export interface ProbeTaskRunResult {
  ok: boolean
  stoppedBy?: 'budget_stop'
  samples: Record<string, Array<{ sessionId?: string; evidence?: Evidence }>>
  costUsd: number
  estimatedTasks: number
  tasksDone: number
  error?: string
  homeDir: string
  /** 观测用：本次探测同时在跑的样本数峰值（并发是否真的生效）。 */
  peakInFlight?: number
  /** 执行证迹采集结果（W1）；未下传 markers 时缺席。 */
  markerHits?: MarkerHits
}

/**
 * 单候选驱动：物化 → 逐题（×k 样本）spawn → 读证据 → 预算硬停。
 *
 * 并发（2026-11-03 调度面接线）：`concurrency > 1` 时把「题×样本」当工作单元，用有界池并行；
 * 预算按**在途估值预扣**（cost + reserved + estimate ≤ budget 才派新单元），因此在途最多
 * 多花 (concurrency-1)×estimate。并发下证据只认 stream-json 通道——jsonl trace 是「取目录里
 * 最新一份」，多路并行会张冠李戴，宁可如实报错也不串证据。
 */
export async function runProbeTasks(opts: ProbeTaskRunOptions): Promise<ProbeTaskRunResult> {
  const homeDir = mkdtempSync(join(tmpdir(), 'harness2-probe-'))
  const tracesDir = join(homeDir, 'traces')
  mkdirSync(tracesDir, { recursive: true })
  const mat = materializeHome(opts.baseHome, join(homeDir, 'home'), opts.variantTree)
  if (!mat.ok) {
    return { ok: false, samples: {}, costUsd: 0, estimatedTasks: 0, tasksDone: 0, error: mat.error, homeDir }
  }
  const spawn = opts.spawnRun ?? defaultSpawnRun
  const estimate = opts.estimatePerTaskUsd ?? DEFAULT_TASK_COST_ESTIMATE_USD
  const timeout = opts.timeoutPerTaskMs ?? DEFAULT_TASK_TIMEOUT_MS
  const retryDelay = opts.retryDelayMs ?? 5_000
  // 执行证迹（W1）：标记去重后逐单元扫原始事件流；单单元与总量双上限，防轨迹把内存吃穿。
  const markers = [...new Set((opts.markers ?? []).map((m) => String(m ?? '').trim()).filter(Boolean))]
  const markerHits = new Set<string>()
  let scannedChars = 0
  const SCAN_UNIT_CAP = 4 * 1024 * 1024
  const SCAN_TOTAL_CAP = 32 * 1024 * 1024
  const scanForMarkers = (text: string): void => {
    if (markers.length === 0 || scannedChars >= SCAN_TOTAL_CAP) return
    const room = Math.min(SCAN_UNIT_CAP, SCAN_TOTAL_CAP - scannedChars)
    const window = text.length > room ? text.slice(0, room) : text
    scannedChars += window.length
    for (const m of markers) {
      if (!markerHits.has(m) && window.includes(m)) markerHits.add(m)
    }
  }
  const markerReport = (): MarkerHits | undefined => (markers.length === 0
    ? undefined
    : { markers, hits: [...markerHits].sort(), scannedChars })
  // R4（2026-10-31 D4 匹配预算口径）：每题 k 个样本（缺省 2）
  const k = Math.max(1, Math.trunc(opts.k ?? 2))
  // 并发收敛（2026-11-03 缺省评估）：
  //   ① 不超过单元数（题×k）——3 路跑 2 个单元只是多占位；
  //   ② 不超过预算允许的超支——并发最多多花 (c-1)×单题估值，把它压到剩余预算的 10% 内，
  //      避免「小预算 + 宽并发」把硬限额花穿。首个单元仍无条件放行（见下）。
  const requested = Math.max(1, Math.min(8, Math.trunc(opts.concurrency ?? 1)))
  const units = opts.prompts.length * k
  const overshootBudget = opts.budgetRemainingUsd * 0.1
  const byBudget = Math.max(1, Math.floor(overshootBudget / Math.max(estimate, 1e-9)) + 1)
  const concurrency = Math.max(1, Math.min(requested, units, byBudget, 8))

  const samples: ProbeTaskRunResult['samples'] = {}
  const scheduledPerTask = new Map<string, number>()
  const collectedPerTask = new Map<string, number>()
  for (const task of opts.prompts) {
    scheduledPerTask.set(task.taskId, 0)
    collectedPerTask.set(task.taskId, 0)
  }
  let costUsd = 0
  let estimatedTasks = 0
  let tasksDone = 0
  let peakInFlight = 0
  let reserved = 0
  let failure: string | null = null
  let budgetStopped = false

  const envBase = {
    HERMES_HOME: join(homeDir, 'home'),
    HERMES_RUN_TRACE_DIR: tracesDir,
    HERMES_PROBE_PROFILE: opts.profile,
  }

  /** 跑一个「题×样本」单元；返回本单元成本（估算或真实）。 */
  const runUnit = async (taskId: string, prompt: string, sampleIdx: number): Promise<void> => {
    const startedAt = Date.now()
    // 每个单元一个独立 trace 目录：并发时「取最新一份」不会串到别的题上——
    // 归因靠隔离而不是靠禁止并发（trace-only 环境也能并发）。
    const unitTraceDir = join(tracesDir, `${taskId}-${sampleIdx}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(unitTraceDir, { recursive: true })
    const env = { ...envBase, HERMES_RUN_TRACE_DIR: unitTraceDir }
    let spawned = await spawn(prompt, env, timeout)
    if (!spawned.ok) {
      if (retryDelay > 0) await new Promise((r) => setTimeout(r, retryDelay))
      spawned = await spawn(prompt, env, timeout)
    }
    if (!spawned.ok) {
      failure = `任务 ${taskId} 运行失败（已重试一次）：${spawned.error}`
      return
    }
    // 证据双通道：stream-json 优先；trace 后备仅在串行时可用（并发会串证据）
    const stream = spawned.stdout ? evidenceFromStreamJson(spawned.stdout) : null
    // 执行证迹只看原始事件流：工具调用参数只在这里，result.text 只有最终答复。
    if (spawned.stdout) scanForMarkers(spawned.stdout)
    const trace = stream ? null : readNewestTrace(unitTraceDir, startedAt - 1000)
    const picked = stream ?? trace
    if (!picked) {
      failure = `任务 ${taskId} 第 ${sampleIdx + 1} 样本未产生证据（stream-json 与 trace 通道均缺席）`
      return
    }
    const costOf = picked.evidence.efficiency?.costUsd ?? null
    if (costOf == null) {
      costUsd += estimate
      estimatedTasks += 1
    } else {
      costUsd += costOf
    }
    if (!samples[taskId]) samples[taskId] = []
    samples[taskId][sampleIdx] = { sessionId: picked.sessionId, evidence: picked.evidence }
    const got = (collectedPerTask.get(taskId) ?? 0) + 1
    collectedPerTask.set(taskId, got)
    // 进度按「已出样本的题数」报（并发下题与样本交错；与旧串行语义一致：
    // 预算停在半途的题也计一次 done，不是等 k 样本凑齐才计）
    const touchedTasks = opts.prompts.filter((x) => (collectedPerTask.get(x.taskId) ?? 0) > 0).length
    opts.onProgress?.(touchedTasks, costUsd, estimatedTasks)
  }

  // 单元调度：按「题顺序 × 样本序」推进，预算不足即停止派新单元
  let taskIdx = 0
  let sampleIdx = 0
  const inFlight = new Set<Promise<void>>()
  const hasNextUnit = (): boolean => taskIdx < opts.prompts.length
  const scheduleNext = (): void => {
    const task = opts.prompts[taskIdx]
    scheduledPerTask.set(task.taskId, (scheduledPerTask.get(task.taskId) ?? 0) + 1)
    reserved += estimate
    const p = runUnit(task.taskId, task.prompt, sampleIdx).finally(() => {
      reserved -= estimate
      inFlight.delete(p)
    })
    inFlight.add(p)
    sampleIdx += 1
    if (sampleIdx >= k) {
      sampleIdx = 0
      taskIdx += 1
    }
  }

  while (true) {
    while (
      !failure &&
      !budgetStopped &&
      hasNextUnit() &&
      inFlight.size < concurrency &&
      (costUsd + reserved + estimate <= opts.budgetRemainingUsd ||
        // 预算连一题估值都不够时也放行第一单元：旧串行语义就是「先跑一题，再按真实成本停」，
        // 这里保持一致（否则小预算提案会零样本收场，反而看不出真实成本）。
        (costUsd === 0 && reserved === 0 && inFlight.size === 0))
    ) {
      scheduleNext()
      peakInFlight = Math.max(peakInFlight, inFlight.size)
    }
    if (inFlight.size === 0) break
    await Promise.race([...inFlight])
    if (costUsd >= opts.budgetRemainingUsd) budgetStopped = true
  }

  // tasksDone：已完整派出的题（index < taskIdx）中至少收到一个样本的；预算/失败中断时，
  // 当前题若已有样本也算完成（与旧串行语义一致：停在半途的题照样记一次 done）
  const partial = taskIdx < opts.prompts.length && sampleIdx > 0
  const completed = opts.prompts
    .map((t2, i) => ({ id: t2.taskId, i }))
    .filter(({ id, i }) => (collectedPerTask.get(id) ?? 0) > 0 && (i < taskIdx || (partial && i === taskIdx)))
    .length
  tasksDone = completed

  if (failure) {
    return { ok: false, samples, costUsd, estimatedTasks, tasksDone, error: failure, homeDir, peakInFlight, markerHits: markerReport() }
  }
  if (budgetStopped || hasNextUnit()) {
    return { ok: true, stoppedBy: 'budget_stop', samples, costUsd, estimatedTasks, tasksDone, homeDir, peakInFlight, markerHits: markerReport() }
  }
  return { ok: true, samples, costUsd, estimatedTasks, tasksDone, homeDir, peakInFlight, markerHits: markerReport() }
}
