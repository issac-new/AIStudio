// overlay/custom/server/diagram/self-check.ts
// diagram-design self_check.py 门禁包装：产物 .html 图机械验收（spec 项3）。
//
// 语义唯一事实源 = vendored scripts/self_check.py（决策 D-8：不重写 TS 版防双源漂移）。
// 本模块只做：路径政策（hermes base / 已知任务 workspace 内才放行）、python3 子进程
// 调用（超时+输出上限）、OK/FAIL 输出解析为结构化 findings。
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { isWithinKnownTaskWorkspace } from '../services/hermes/task-workspace-cache'

export interface DiagramCheckFinding {
  file: string
  message: string
}

export interface DiagramCheckResult {
  ok: boolean
  files: Array<{ path: string; ok: boolean }>
  findings: DiagramCheckFinding[]
  /** runner 自身失败（python3 缺失/超时/self_check 缺失）时如实标注，ok=false */
  runnerError?: string
  durationMs: number
}

const TIMEOUT_MS = 30_000
const MAX_BUFFER = 1024 * 1024

/** overlay 根：OVERLAY_ROOT 优先，缺省按本文件真实路径上推（custom/server/diagram → overlay） */
export function overlayRoot(): string {
  const env = process.env.OVERLAY_ROOT?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return resolve(__dirname, '..', '..', '..')
}

export function selfCheckScriptPath(root: string = overlayRoot()): string {
  return join(root, 'assets', 'skills', 'diagram-design', 'scripts', 'self_check.py')
}

/** hermes base 沙箱基底（与 cli-fast-gates 同一解析：HERMES_HOME → ~/.hermes） */
export function hermesBaseDir(): string {
  const env = process.env.HERMES_HOME?.trim()
  if (env) return resolve(env.replace(/^~/, homedir()))
  return join(homedir(), '.hermes')
}

/** 内联 isPathWithin（custom 模块不经 symlink import upstream，task-workspace-cache 同例） */
export function isPathWithin(targetPath: string, basePath: string): boolean {
  const base = resolve(basePath)
  const target = resolve(targetPath)
  const rel = target.slice(base.length)
  if (target === base) return true
  if (!target.startsWith(base)) return false
  return rel.startsWith('/')
}

export interface PathPolicy {
  hermesBase: string
  isKnownTaskWorkspace: (absPath: string) => boolean
}

export function defaultPathPolicy(): PathPolicy {
  // task-workspace-cache 为 TTL 缓存，同步接口永不阻塞；冷启动空缓存=只认
  // hermes base，如实收窄不误放。
  return { hermesBase: hermesBaseDir(), isKnownTaskWorkspace: isWithinKnownTaskWorkspace }
}

/** 产物路径政策：绝对路径 + 落在 hermes base 或已知任务 workspace 内 */
export function assertDiagramPath(path: unknown, policy: PathPolicy = defaultPathPolicy()): string {
  if (typeof path !== 'string' || !path.trim()) throw Object.assign(new Error('path 必填'), { code: 'invalid_path' })
  const p = path.trim()
  if (p.includes('\0') || p.includes('\n')) throw Object.assign(new Error('path 含非法字符'), { code: 'invalid_path' })
  if (!isAbsolute(p)) throw Object.assign(new Error('path 必须是绝对路径'), { code: 'invalid_path' })
  if (!/\.html?$/i.test(p)) throw Object.assign(new Error('只接受 .html 图产物'), { code: 'invalid_path' })
  if (!isPathWithin(p, policy.hermesBase) && !policy.isKnownTaskWorkspace(p)) {
    throw Object.assign(new Error('path 不在 hermes base 或已知任务 workspace 内'), { code: 'outside_sandbox' })
  }
  if (!existsSync(p)) throw Object.assign(new Error('文件不存在'), { code: 'not_found' })
  return p
}

/** 解析 self_check.py 输出：`OK <path>` / `FAIL <path>` + `- <error>` 明细行 */
export function parseSelfCheckOutput(stdout: string, stderr: string): Omit<DiagramCheckResult, 'ok' | 'durationMs'> {
  const files: Array<{ path: string; ok: boolean }> = []
  const findings: DiagramCheckFinding[] = []
  let current: string | null = null
  for (const line of `${stdout}\n${stderr}`.split('\n')) {
    const ok = line.match(/^OK\s+(.+)$/)
    if (ok) { current = ok[1].trim(); files.push({ path: current, ok: true }); continue }
    const fail = line.match(/^FAIL\s+(.+)$/)
    if (fail) { current = fail[1].trim(); files.push({ path: current, ok: false }); continue }
    const finding = line.match(/^\s*-\s+(.+)$/)
    if (finding && current) findings.push({ file: current, message: finding[1].trim() })
  }
  return { files, findings }
}

export interface RunOptions {
  offline?: boolean
  scriptPath?: string
  timeoutMs?: number
}

/** 真实调 python3 self_check.py（真实工具链先行，§5.1）；runner 失败如实报不错判 */
export function runSelfCheck(paths: string[], options: RunOptions = {}): Promise<DiagramCheckResult> {
  const script = options.scriptPath ?? selfCheckScriptPath()
  const started = Date.now()
  return new Promise((resolvePromise) => {
    if (!existsSync(script)) {
      resolvePromise({
        ok: false, files: [], findings: [],
        runnerError: `self_check.py 不在位：${script}（先跑 scripts/sync-diagram-skill.mjs 或检查 vendored 正本）`,
        durationMs: Date.now() - started,
      })
      return
    }
    const args = [script, ...(options.offline ? ['--offline'] : []), ...paths]
    execFile('python3', args, { timeout: options.timeoutMs ?? TIMEOUT_MS, maxBuffer: MAX_BUFFER }, (error, stdout, stderr) => {
      const parsed = parseSelfCheckOutput(stdout, stderr)
      const durationMs = Date.now() - started
      if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
        resolvePromise({ ok: false, ...parsed, runnerError: 'python3 不在 PATH（self_check 依赖宿主 python3）', durationMs })
        return
      }
      if (error?.killed || (error && /timed out/i.test(error.message))) {
        resolvePromise({ ok: false, ...parsed, runnerError: `self_check 超时（${options.timeoutMs ?? TIMEOUT_MS}ms）`, durationMs })
        return
      }
      // self_check 退出码 1=有 FAIL（语义在输出里）；>1/信号=runner 异常
      const exitCode = typeof error?.code === 'number' ? error.code : (error ? null : 0)
      if (exitCode !== null && exitCode > 1) {
        resolvePromise({
          ok: false, ...parsed,
          runnerError: `self_check 异常退出（code=${exitCode}）：${stderr.trim().slice(0, 300)}`,
          durationMs,
        })
        return
      }
      resolvePromise({ ok: parsed.files.length > 0 && parsed.files.every((f) => f.ok), ...parsed, durationMs })
    })
  })
}
