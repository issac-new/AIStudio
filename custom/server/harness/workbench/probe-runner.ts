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

export interface SpawnRunResult { ok: boolean; error?: string }

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

/** 默认驱动：kanban 派发先例的子进程形态（-p profile + --cli + accept-hooks）。 */
export const defaultSpawnRun: SpawnRun = (prompt, env, timeoutMs) =>
  new Promise((resolvePromise) => {
    execFile(
      hermesBin(),
      ['-p', env.HERMES_PROBE_PROFILE ?? 'orchestrator', '--cli', '--accept-hooks', 'chat', '-q', prompt],
      { env: { ...process.env, ...env }, timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024 },
      (error) => {
        if (error) {
          resolvePromise({ ok: false, error: String(error.message ?? error).slice(0, 300) })
        } else {
          resolvePromise({ ok: true })
        }
      },
    )
  })

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
  estimatePerTaskUsd?: number
  timeoutPerTaskMs?: number
  spawnRun?: SpawnRun
  onProgress?: (done: number, costUsd: number, estimatedTasks: number) => void
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
}

/** 单候选逐题驱动：物化 → 逐题 spawn → 读 trace → 预算硬停。 */
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
  const samples: ProbeTaskRunResult['samples'] = {}
  let costUsd = 0
  let estimatedTasks = 0
  let done = 0
  for (const task of opts.prompts) {
    const startedAt = Date.now()
    const env = {
      HERMES_HOME: join(homeDir, 'home'),
      HERMES_RUN_TRACE_DIR: tracesDir,
      HERMES_PROBE_PROFILE: opts.profile,
    }
    const spawned = await spawn(task.prompt, env, timeout)
    if (!spawned.ok) {
      return { ok: false, samples, costUsd, estimatedTasks, tasksDone: done, error: `任务 ${task.taskId} 运行失败：${spawned.error}`, homeDir }
    }
    const trace = readNewestTrace(tracesDir, startedAt - 1000)
    if (!trace) {
      return { ok: false, samples, costUsd, estimatedTasks, tasksDone: done, error: `任务 ${task.taskId} 未产生 trace（运行器未落轨迹）`, homeDir }
    }
    samples[task.taskId] = [{ sessionId: trace.sessionId, evidence: trace.evidence }]
    if (trace.costUsd == null) {
      costUsd += estimate
      estimatedTasks += 1
    } else {
      costUsd += trace.costUsd
    }
    done += 1
    opts.onProgress?.(done, costUsd, estimatedTasks)
    if (costUsd >= opts.budgetRemainingUsd) {
      return { ok: true, stoppedBy: 'budget_stop', samples, costUsd, estimatedTasks, tasksDone: done, homeDir }
    }
  }
  return { ok: true, samples, costUsd, estimatedTasks, tasksDone: done, homeDir }
}
