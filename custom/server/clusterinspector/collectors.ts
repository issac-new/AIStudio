// overlay/custom/server/clusterinspector/collectors.ts
// 集群巡检官采集层（设计：specs 集群巡检官方案；run11 监控 playbook 产品化）。
// 四采集器全部 fail-soft：任一失败只缺该面数据，不阻断巡检轮。
// 采集物=ClusterSnapshot（detectors.ts 的纯函数输入，测试友好）。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { compactThreshold } from '../compactthreshold/compact-threshold'

export interface GatewayFace {
  ok: boolean
  error?: string
  /** /health 探测（无鉴权面） */
  probe?: { status: string; latencyMs: number }
  /** gateway_state.json 内容（active_agents/platforms/gateway_state） */
  state?: Record<string, unknown>
  /** 容量泵 sidecar（run_busy 二期内省：<home>/runtime/capacity_retry.json） */
  capacity?: { ts: number; depth: number; anchors: number; cap: number }
}

export interface SessionsFace {
  ok: boolean
  error?: string
  entries: number
  live: number
  dead: Array<{ key: string; pid: number; surface?: string }>
}

export interface ProfileTail {
  profile: string
  /** 日志尾行（截断） */
  tail: string
  /** 尾行 mtime（epoch ms）——注意被 Matrix reaction 等 adapter 噪音持续刷新，
   *  会造成"假活跃"（run14 实锤：工作行已死 40min、mtime 仍新）。停摆判定一律用
   *  workTsMs；mtimeMs 仅作文件存在性/粗粒度参考。 */
  mtimeMs: number
  /** 最后工作行（API call #/tool completed）时间戳 epoch ms；无工作行=0 */
  workTsMs: number
}

export interface ProfilesFace {
  ok: boolean
  error?: string
  tails: ProfileTail[]
}

export interface RunningCard {
  id: string
  assignee?: string
  title?: string
}

export interface RunningCardsFace {
  ok: boolean
  error?: string
  cards: RunningCard[]
}

export interface FederationMachine {
  machineId: string
  lastSeenMs: number
  activeTasks: number
  activeAgents?: number
}

/** 会话遥测条目（长会话治理 602 sidecar：<home>/runtime/sessions-telemetry.json） */
export interface SessionTelemetryEntry {
  sessionKey: string
  tsMs: number
  sessionId?: string
  platform?: string
  model?: string | null
  watermarkPct?: number | null
  turns?: number
  cumApiCalls?: number
  emptyStreak?: number
  turnApiCalls?: number
  rotations?: number
  lastRotationReason?: string
  heartbeat?: { step?: number; emitted?: number; interval?: number }
  runaway?: { signal?: string | null; tool?: string | null; count?: number | null; decisions?: number }
  /** SoL-Pi 效能轮②：上下文绝对值（602 sidecar 自带，透传）+ 压缩三档投影 */
  lastPromptTokens?: number
  contextLength?: number
  compaction?: {
    level: 'under' | 'soon' | 'now'
    triggerTokens: number
    headroomTokens: number
    reserveTokens: number
  }
}

/** 会话遥测面（D9 水位 / D10 节奏 / D11 环检测的观测面） */
export interface SessionTelemetryFace {
  ok: boolean
  error?: string
  entries: SessionTelemetryEntry[]
}

/** 跨机联邦面（D8 的观测面）：联邦注册表快照——控制器注入（进度联邦模块），未接线=ok:false */
export interface FederationFace {
  ok: boolean
  error?: string
  nowMs: number
  machines: FederationMachine[]
}

export interface ClusterSnapshot {
  ts: number
  gateway: GatewayFace
  sessions: SessionsFace
  profiles: ProfilesFace
  /** kanban 诊断行（severity error/critical 的卡）——控制器注入，未接线=ok:false */
  kanban: { ok: boolean; error?: string; rows: Array<Record<string, unknown>> }
  /** 在办卡（status=running，含 assignee）——控制器注入（kanban list --json），未接线=ok:false */
  runningCards: RunningCardsFace
  /** 跨机联邦（2026-10-11 三步之③）——控制器注入，未接线=ok:false */
  federation: FederationFace
  /** 会话遥测（长会话治理 B1：602 sidecar 采集面）——缺文件=合法空态；
   *  可选：旧测试夹具/未升级快照不携带时 D9-D11 静默跳过（同 kanban 未接线语义） */
  sessionTelemetry?: SessionTelemetryFace
}

export interface CollectorDeps {
  fetchImpl?: typeof fetch
  hermesHome?: string
  /** gateway /health base（缺省 http://127.0.0.1:8801） */
  gatewayBase?: string
  /** 最多扫多少个 profile 日志尾（防大编制失控） */
  maxProfiles?: number
  now?: () => number
}

export function hermesHomeDefault(): string {
  return process.env.HERMES_HOME || join(homedir(), '.hermes')
}

/** 压缩三档投影参数：输出预算缺省（602 sidecar 不带逐模型输出上限；保守 8K 并在 UI 披露）。
 *  档位判定本身用 compactthreshold 域的 90% 线公式（单一事实源），此处只补输入。 */
const COMPACTION_DEFAULT_OUTPUT_BUDGET = 8192

/** 602 sidecar 原始条目 → { lastPromptTokens, contextLength, compaction? }。
 *  两个绝对值任一缺席（旧 sidecar/非回合采样）即不出档位——百分比不倒推绝对值。 */
function collectSessionCompaction(v: Record<string, unknown>): Pick<
  SessionTelemetryEntry, 'lastPromptTokens' | 'contextLength' | 'compaction'
> {
  const promptTokens = v.last_prompt_tokens
  const contextLength = v.context_length
  const out: Pick<SessionTelemetryEntry, 'lastPromptTokens' | 'contextLength' | 'compaction'> = {}
  if (typeof promptTokens === 'number' && Number.isFinite(promptTokens)) {
    out.lastPromptTokens = promptTokens
  }
  if (typeof contextLength === 'number' && Number.isFinite(contextLength) && contextLength > 0) {
    out.contextLength = contextLength
  }
  if (out.lastPromptTokens === undefined || out.contextLength === undefined) return out
  const d = compactThreshold({
    usedTokens: out.lastPromptTokens,
    limitTokens: out.contextLength,
    outputBudget: COMPACTION_DEFAULT_OUTPUT_BUDGET,
  })
  out.compaction = {
    level: d.level,
    triggerTokens: d.triggerTokens,
    headroomTokens: d.headroom,
    reserveTokens: d.reserveTokens,
  }
  return out
}

function pidAlive(pid: unknown): boolean {
  const n = Number(pid)
  if (!Number.isInteger(n) || n <= 0) return false
  try {
    process.kill(n, 0)
    return true
  } catch (e: unknown) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** ① 网关面：/health 探测 + gateway_state.json（runs 侧唯一权威 active_agents/platforms） */
export async function collectGateway(deps: CollectorDeps = {}): Promise<GatewayFace> {
  const base = (deps.gatewayBase || process.env.GATEWAY_BASE || 'http://127.0.0.1:8801').replace(/\/+$/, '')
  const doFetch = deps.fetchImpl ?? globalThis.fetch.bind(globalThis)
  const face: GatewayFace = { ok: false }
  const t0 = Date.now()
  try {
    const res = await doFetch(`${base}/health`, { signal: AbortSignal.timeout(3000) })
    face.probe = { status: String(res.status), latencyMs: Date.now() - t0 }
    face.ok = res.ok
  } catch (e) {
    face.error = `health probe failed: ${(e as Error).message}`
  }
  try {
    const capPath = join(deps.hermesHome || hermesHomeDefault(), 'runtime', 'capacity_retry.json')
    if (existsSync(capPath)) {
      const c = JSON.parse(readFileSync(capPath, 'utf-8')) as { ts: number; depth: number; anchors: number; cap: number }
      if (Date.now() - c.ts * 1000 < 600_000) face.capacity = c  // 10min 陈化丢弃
    }
  } catch { /* sidecar fail-soft */ }
  try {
    const statePath = join(deps.hermesHome || hermesHomeDefault(), 'gateway_state.json')
    if (existsSync(statePath)) {
      face.state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>
    }
  } catch (e) {
    face.error = face.error ? `${face.error}; state read failed: ${(e as Error).message}` : `state read failed: ${(e as Error).message}`
  }
  if (face.probe?.status === '200' || face.state) face.ok = face.ok || Boolean(face.state)
  return face
}

/** ③ 会话注册表对账：active_sessions.json 条目 pid 存活审计（槽位膨胀的证据面） */
export function collectSessions(deps: CollectorDeps = {}): SessionsFace {
  const face: SessionsFace = { ok: false, entries: 0, live: 0, dead: [] }
  try {
    const p = join(deps.hermesHome || hermesHomeDefault(), 'runtime', 'active_sessions.json')
    if (!existsSync(p)) {
      face.ok = true // 空注册表=合法态（无在途会话）
      return face
    }
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as { entries?: Array<Record<string, unknown>> }
    const entries = Array.isArray(raw.entries) ? raw.entries : []
    face.entries = entries.length
    for (const e of entries) {
      const pid = e.pid
      const key = String(e.session ?? e.key ?? e.surface ?? pid)
      if (pidAlive(pid)) face.live += 1
      else face.dead.push({ key, pid: Number(pid), surface: e.surface ? String(e.surface) : undefined })
    }
    face.ok = true
  } catch (e) {
    face.error = (e as Error).message
  }
  return face
}

/** ④ profile 日志尾（D4 会话卡死的观测面：尾行内容+mtime；停摆判定逻辑在 detectors） */
export function collectProfiles(deps: CollectorDeps = {}): ProfilesFace {
  const face: ProfilesFace = { ok: false, tails: [] }
  const cap = deps.maxProfiles ?? 40
  try {
    const dir = join(deps.hermesHome || hermesHomeDefault(), 'profiles')
    if (!existsSync(dir)) {
      face.ok = true
      return face
    }
    for (const name of readdirSync(dir).sort()) {
      if (face.tails.length >= cap) break
      const log = join(dir, name, 'logs', 'agent.log')
      try {
        const st = statSync(log)
        const buf = Buffer.alloc(512)
        const fd = require('node:fs').openSync(log, 'r')
        const len = Math.min(buf.length, st.size)
        require('node:fs').readSync(fd, buf, 0, len, Math.max(0, st.size - len))
        require('node:fs').closeSync(fd)
        const tail = buf.toString('utf-8', 0, len).replace(/\0+$/, '').split('\n').filter(Boolean).pop() ?? ''
        // 工作行活性（run14 v3 watcher 根治面移植）：从日志尾部回扫找最后一条
        // 工作行（API call #/tool completed）并解析其行首时间戳；mtime 不算活性。
        let workTsMs = 0
        try {
          const head = Buffer.alloc(65536)
          const hfd = require('node:fs').openSync(log, 'r')
          const hlen = Math.min(head.length, st.size)
          require('node:fs').readSync(hfd, head, 0, hlen, Math.max(0, st.size - hlen))
          require('node:fs').closeSync(hfd)
          const lines = head.toString('utf-8', 0, hlen).split('\n').filter(Boolean)
          for (let i = lines.length - 1; i >= 0; i--) {
            const m = lines[i]!.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}).*(API call #|tool [a-z_]+ completed)/)
            if (m) { workTsMs = Date.parse(m[1]!.replace(' ', 'T') + 'Z') || Date.parse(m[1]!.replace(' ', 'T')); break }
          }
        } catch { /* 工作行解析失败=0（D7 会按 mtime 兜底） */ }
        face.tails.push({ profile: name, tail: tail.slice(-240), mtimeMs: st.mtimeMs, workTsMs })
      } catch {
        // 单 profile 无日志/读失败：跳过（fail-soft 到 profile 粒度）
      }
    }
    face.ok = true
  } catch (e) {
    face.error = (e as Error).message
  }
  return face
}

/** ⑤ 会话遥测（长会话治理 B1）：读 602 sidecar（<home>/runtime/sessions-telemetry.json）。
 *  与 capacity 同款 10 分钟陈化丢弃（ts 由网关每回合刷新）；缺文件=空态合法。 */
export function collectSessionTelemetry(deps: CollectorDeps = {}): SessionTelemetryFace {
  const face: SessionTelemetryFace = { ok: false, entries: [] }
  try {
    const p = join(deps.hermesHome || hermesHomeDefault(), 'runtime', 'sessions-telemetry.json')
    if (!existsSync(p)) {
      face.ok = true // sidecar 未生成=合法（网关未跑或 602 未部署）
      return face
    }
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, Record<string, unknown>>
    const now = Date.now()
    for (const [key, v] of Object.entries(raw)) {
      const tsMs = Number(v.ts ?? 0) * 1000
      if (!Number.isFinite(tsMs) || now - tsMs > 600_000) continue // 10min 陈化丢弃
      const hb = (v.heartbeat ?? {}) as SessionTelemetryEntry['heartbeat']
      const rw = (v.runaway ?? {}) as SessionTelemetryEntry['runaway']
      face.entries.push({
        sessionKey: key,
        tsMs,
        sessionId: typeof v.session_id === 'string' ? v.session_id : undefined,
        platform: typeof v.platform === 'string' ? v.platform : undefined,
        model: typeof v.model === 'string' ? v.model : null,
        watermarkPct: typeof v.watermark_pct === 'number' ? v.watermark_pct : null,
        turns: typeof v.turns === 'number' ? v.turns : undefined,
        cumApiCalls: typeof v.cum_api_calls === 'number' ? v.cum_api_calls : undefined,
        emptyStreak: typeof v.empty_streak === 'number' ? v.empty_streak : undefined,
        turnApiCalls: typeof v.turn_api_calls === 'number' ? v.turn_api_calls : undefined,
        rotations: typeof v.rotations === 'number' ? v.rotations : undefined,
        lastRotationReason: typeof v.last_rotation_reason === 'string' ? v.last_rotation_reason : undefined,
        heartbeat: hb,
        runaway: rw,
        ...collectSessionCompaction(v),
      })
    }
    face.ok = true
  } catch (e) {
    face.error = (e as Error).message
  }
  return face
}
