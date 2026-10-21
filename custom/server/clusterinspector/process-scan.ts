// overlay/clusterinspector 域：Shadow agent 进程扫描（2026-10-21 AGT 吸收轮 C，用户裁定「全做」）。
//
// 背景：微软 Agent Governance Toolkit 的 Shadow AI Discovery 立论——多数团队第一次
// 治理 agent 的真实起点是「我不知道这台机器上跑着几个 agent」。安全检查 F 域同结论：
// studio 只看得见注册进来的 profile（网关 active_agents 是计数不是名单）。本模块
// 补「本机进程面」：ps 全量扫 hermes 形态进程，与已知 profile 名册对账。
//
// 判定纪律（纯函数 detectUnregisteredAgents 在 detectors.ts，本文件只采集）：
//   - 进程指纹 = 命令行含 hermes 可执行（hermes / hermes.py / 路径段含 hermes-agent）
//     且带 agent 形态参数（chat/-p/--profile/gateway run）——只认事实形态，不猜；
//   - 已知名册 = <home>/profiles/<name> 目录名 + default（与 profile-tool-usage
//     同款路径规律）；
//   - 扫描只读（ps 子进程），不杀不写。
import { execFile } from 'child_process'
import { existsSync, readdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'node:path'

export interface HermesProcessInfo {
  pid: number
  ppid: number
  command: string
  /** 从 -p/--profile 参数提取的 profile 名（提取不出=null）。 */
  profile: string | null
  /** 进程形态归类。 */
  kind: 'agent' | 'gateway' | 'other'
}

export interface ProcessScanFace {
  ok: boolean
  error?: string
  at: number
  procs: HermesProcessInfo[]
  /** 已知 profile 名册（对账基准）。 */
  registered: string[]
  /** 采集器可用性（ps 不可用时 ok=false，检测器静默跳过）。 */
  scanned: boolean
}

/** 已知名册：default + profiles/<name>。 */
export function registeredProfiles(hermesHome: string): string[] {
  const out = ['default']
  try {
    const dir = join(hermesHome, 'profiles')
    if (existsSync(dir)) {
      for (const name of readdirSync(dir)) out.push(name)
    }
  } catch { /* 枚举失败只报 default */ }
  return out
}

/** 命令行 → 形态判定与 profile 提取（纯函数，测试面）。 */
export function classifyHermesCommand(command: string): { kind: HermesProcessInfo['kind']; profile: string | null } | null {
  // 排除自身噪音：studio server（node + hermes-studio 路径）与测试进程不算 agent。
  if (/hermes-studio|vitest|node_modules\/\.bin|spd-log-tail/.test(command)) return null
  const isHermesBin = /(^|[/\s])hermes(\.py)?(\s|$)/.test(command) || /hermes-agent\/(hermes|main\.py)(\s|$)/.test(command)
  if (!isHermesBin) return null
  const profileMatch = command.match(/(?:^|\s)-p(?:\s+|=)([^\s]+)/) ?? command.match(/(?:^|\s)--profile(?:\s+|=)([^\s]+)/)
  const profile = profileMatch ? profileMatch[1] : null
  if (/gateway\s+run/.test(command)) return { kind: 'gateway', profile }
  if (/\bchat\b|\bsingle-query\b|-q(\s|$)|--query/.test(command)) return { kind: 'agent', profile }
  return { kind: 'other', profile }
}

/** 解析 ps 输出行（pid ppid command；command 含空格整体取余段）。 */
export function parsePsLines(stdout: string): Array<{ pid: number; ppid: number; command: string }> {
  const out: Array<{ pid: number; ppid: number; command: string }> = []
  for (const line of stdout.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)
    if (!m) continue
    out.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] })
  }
  return out
}

export interface ProcessScanDeps {
  hermesHome?: string
  execImpl?: (cmd: string, args: string[]) => Promise<{ stdout: string }>
  now?: () => number
}

/** 采集本机 hermes 形态进程（fail-soft：ps 失败=ok:false，缺面不缺轮）。 */
export async function collectProcessScan(deps: ProcessScanDeps = {}): Promise<ProcessScanFace> {
  const now = deps.now ?? (() => Date.now())
  const hermesHome = deps.hermesHome || process.env.HERMES_HOME || join(homedir(), '.hermes')
  const face: ProcessScanFace = { ok: true, at: now(), procs: [], registered: registeredProfiles(hermesHome), scanned: false }
  const exec = deps.execImpl ?? ((cmd: string, args: string[]) =>
    new Promise<{ stdout: string }>((resolve, reject) => {
      execFile(cmd, args, { timeout: 5_000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
        if (err) reject(err)
        else resolve({ stdout: String(stdout ?? '') })
      })
    }))
  try {
    const { stdout } = await exec('ps', ['-axo', 'pid,ppid,command'])
    face.scanned = true
    for (const row of parsePsLines(stdout)) {
      const hit = classifyHermesCommand(row.command)
      if (!hit) continue
      face.procs.push({ pid: row.pid, ppid: row.ppid, command: row.command.slice(0, 300), profile: hit.profile, kind: hit.kind })
    }
  } catch (e) {
    face.ok = false
    face.error = (e as Error).message.slice(0, 120)
  }
  return face
}
