// overlay/custom/server/clusterinspector/collectors.ts
// 集群巡检官采集层（设计：specs 集群巡检官方案；run11 监控 playbook 产品化）。
// 四采集器全部 fail-soft：任一失败只缺该面数据，不阻断巡检轮。
// 采集物=ClusterSnapshot（detectors.ts 的纯函数输入，测试友好）。

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export interface GatewayFace {
  ok: boolean
  error?: string
  /** /health 探测（无鉴权面） */
  probe?: { status: string; latencyMs: number }
  /** gateway_state.json 内容（active_agents/platforms/gateway_state） */
  state?: Record<string, unknown>
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
  /** 尾行 mtime（epoch ms） */
  mtimeMs: number
}

export interface ProfilesFace {
  ok: boolean
  error?: string
  tails: ProfileTail[]
}

export interface ClusterSnapshot {
  ts: number
  gateway: GatewayFace
  sessions: SessionsFace
  profiles: ProfilesFace
  /** kanban 诊断行（severity error/critical 的卡）——控制器注入，未接线=ok:false */
  kanban: { ok: boolean; error?: string; rows: Array<Record<string, unknown>> }
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

/** ④ profile 日志尾（D4 会话卡死的观测面：尾行内容+mtime；判死逻辑在 detectors） */
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
        const tail = buf.toString('utf-8').split('\n').filter(Boolean).pop() ?? ''
        face.tails.push({ profile: name, tail: tail.slice(-240), mtimeMs: st.mtimeMs })
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
