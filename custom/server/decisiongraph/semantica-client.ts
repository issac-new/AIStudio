/**
 * 决策图谱 Semantica 客户端（乙4，2026-09-30 调研落地）。
 *
 * 形态：短生命周期 python 子进程（semantica-bridge.py）读写 studio 专用 KG 文件，
 * 不与 agent MCP 实例的 kg.json 共文件（两写者冲突）；写操作进程内串行（promise 链）
 * + bridge 侧 fcntl 文件锁 + tmp/rename 原子落盘。所有调用 fail-soft：bridge 缺席/
 * 超时/损坏返回 null，绝不打断派发/审批主链路。
 *
 * KG 路径：SEMANTICA_STUDIO_KG 覆盖，默认 ~/.hermes/semantica/studio-decisions.json。
 * Python：SEMANTICA_PYTHON 覆盖，默认 hermes-agent venv（无则缺席降级）。
 */
import { spawn } from 'node:child_process'
import { maybeSnapshot } from './replay'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

export interface BridgeDecision {
  id: string
  category: string | null
  scenario: string | null
  outcome: string | null
  confidence: number | null
  decidedBy?: string | null
  reasoning?: string | null
  similarity?: number
}

export function studioKgPath(): string {
  const env = process.env.SEMANTICA_STUDIO_KG?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes', 'semantica', 'studio-decisions.json')
}

export function semanticaPython(): string | null {
  const env = process.env.SEMANTICA_PYTHON?.trim()
  if (env) return existsSync(env) ? env : null
  const def = join(homedir(), '.hermes', 'hermes-agent', 'venv', 'bin', 'python')
  return existsSync(def) ? def : null
}

/** bridge 脚本路径（custom/server/decisiongraph/semantica-bridge.py）。 */
export function bridgeScript(): string {
  return join(__dirname, 'semantica-bridge.py')
}

/** 执行器注入点（单测用假执行器；默认真实 execFile）。 */
export type BridgeRunner = (python: string, args: string[], input: string | null, timeoutMs: number)
  => Promise<string>

/** 真执行器：spawn + stdin 透传（record/similar 的 JSON 走 stdin，免 shell 转义）。 */
const defaultRunner: BridgeRunner = (python, args, input, timeoutMs) =>
  new Promise((resolve_, reject) => {
    const child = spawn(python, [bridgeScript(), ...args], { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`bridge-timeout>${timeoutMs}ms`))
    }, timeoutMs)
    child.stdout.on('data', (d: Buffer) => { out += d.toString() })
    child.stderr.on('data', (d: Buffer) => { err += d.toString() })
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve_(out)
      else reject(new Error(`bridge exit ${code}: ${err.slice(-300)}`))
    })
    if (input !== null) child.stdin.write(input)
    child.stdin.end()
  })

let runner: BridgeRunner = defaultRunner
export function setBridgeRunnerForTests(r: BridgeRunner | null): void {
  runner = r ?? defaultRunner
}

/** 写串行链：同进程内 bridge record 逐个执行（跨进程由 fcntl 锁兜底）。 */
let writeChain: Promise<unknown> = Promise.resolve()

function parseOut<T>(stdout: string): T | null {
  // bridge 的 json 行可能在 gensim 警告行之后——取最后一行合法 JSON。
  const lines = stdout.split('\n').filter((l) => l.trim().startsWith('{'))
  for (let i = lines.length - 1; i >= 0; i--) {
    try { return JSON.parse(lines[i]) as T } catch { /* 继续找 */ }
  }
  return null
}

async function runBridge<T>(op: string, opts: {
  input?: string, timeoutMs?: number, serialize?: boolean, extraArgs?: string[]
} = {}): Promise<T | null> {
  const python = semanticaPython()
  if (!python || process.env.HERMES_DECISION_GRAPH === '0') return null
  const timeoutMs = opts.timeoutMs ?? 8000
  const exec = async (): Promise<T | null> => {
    try {
      const args = [op, '--kg', studioKgPath(), ...(opts.extraArgs ?? [])]
      const stdout = await runner(python, args, opts.input ?? null, timeoutMs)
      const parsed = parseOut<T>(stdout)
      return parsed && (parsed as { ok?: boolean }).ok !== false ? parsed : null
    } catch (err) {
      console.warn(`[decision-graph] bridge ${op} 失败（fail-soft）：${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }
  if (opts.serialize) {
    const next = writeChain.then(exec, exec)
    writeChain = next.catch(() => undefined)
    return next
  }
  return exec()
}

export interface RecordInput {
  category: string
  scenario: string
  reasoning: string
  outcome: string
  confidence?: number
  decisionMaker?: string
  metadata?: Record<string, unknown>
  /** 落账后自动检索近邻先例并建 PRECEDENT_FOR 因果边（乙4 因果链）。 */
  linkPrecedent?: boolean
}

export async function recordDecision(input: RecordInput): Promise<{ decisionId: string; precedentOf: string | null } | null> {
  const res = await runBridge<{ ok: boolean; decisionId: string; precedentOf: string | null }>('record', {
    serialize: true,
    input: JSON.stringify({
      category: input.category,
      scenario: input.scenario,
      reasoning: input.reasoning,
      outcome: input.outcome,
      confidence: input.confidence ?? 0.8,
      decision_maker: input.decisionMaker ?? 'studio',
      metadata: input.metadata ?? {},
      link_precedent: input.linkPrecedent === true,
    }),
  })
  const out = res?.decisionId ? { decisionId: res.decisionId, precedentOf: res.precedentOf ?? null } : null
  // 落账成功后节流快照（丁9）：fire-and-forget，绝不阻塞落账返回。
  if (out) maybeSnapshot()
  return out
}

export async function findSimilar(scenario: string, category?: string, max = 3): Promise<BridgeDecision[]> {
  const res = await runBridge<{ ok: boolean; results: BridgeDecision[] }>('similar', {
    timeoutMs: 5000,
    input: JSON.stringify({ scenario, category, max }),
  })
  return res?.results ?? []
}

export async function causalChain(decisionId: string): Promise<BridgeDecision[]> {
  const res = await runBridge<{ ok: boolean; chain: BridgeDecision[] }>('chain', {
    timeoutMs: 5000,
    extraArgs: ['--id', decisionId],
  })
  return res?.chain ?? []
}

export async function listDecisions(limit = 50): Promise<{ decisions: BridgeDecision[]; total: number }> {
  const python = semanticaPython()
  if (!python || process.env.HERMES_DECISION_GRAPH === '0') return { decisions: [], total: 0 }
  try {
    const stdout = await runner(python, ['list', '--kg', studioKgPath(), '--limit', String(limit)], null, 6000)
    const parsed = parseOut<{ ok: boolean; decisions: BridgeDecision[]; total: number }>(stdout)
    return parsed ? { decisions: parsed.decisions ?? [], total: parsed.total ?? 0 } : { decisions: [], total: 0 }
  } catch {
    return { decisions: [], total: 0 }
  }
}

export async function kgStatus(): Promise<{ available: boolean; python: boolean; kgPath: string; exists: boolean; nodes: number; decisions: number }> {
  const python = semanticaPython()
  const kgPath = studioKgPath()
  const base = { available: false, python: Boolean(python), kgPath, exists: existsSync(kgPath), nodes: 0, decisions: 0 }
  if (!python) return base
  const res = await runBridge<{ ok: boolean; exists: boolean; nodes: number; decisions: number }>('status', { timeoutMs: 5000 })
  if (!res) return base
  return { available: true, python: true, kgPath, exists: res.exists, nodes: res.nodes, decisions: res.decisions }
}
