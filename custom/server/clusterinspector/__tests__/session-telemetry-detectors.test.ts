// 长会话治理 B1：会话遥测采集器 + D9/D10/D11 检测器
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'node:fs'
import { describe, it, expect, afterAll } from 'vitest'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  collectSessionTelemetry,
  type ClusterSnapshot,
} from '../collectors'
import {
  detectAll, detectContextWatermark, detectEmptyStreak, detectRunawayLoop,
} from '../detectors'

const HOME = mkdtempSync(join(tmpdir(), 'ci-telemetry-'))

function writeSidecar(entries: Record<string, unknown>, staleSec = 0) {
  mkdirSync(join(HOME, 'runtime'), { recursive: true })
  const payload: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(entries)) {
    payload[k] = { ts: Math.floor(Date.now() / 1000) - staleSec, ...v as object }
  }
  writeFileSync(join(HOME, 'runtime', 'sessions-telemetry.json'), JSON.stringify(payload))
}

function snapWith(te: ClusterSnapshot['sessionTelemetry']): ClusterSnapshot {
  return {
    ts: Date.now(),
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: false, cards: [] },
    federation: { ok: false, nowMs: Date.now(), machines: [] },
    sessionTelemetry: te,
  }
}

afterAll(() => rmSync(HOME, { recursive: true, force: true }))

describe('collectSessionTelemetry', () => {
  it('missing sidecar is a legal empty state', () => {
    const face = collectSessionTelemetry({ hermesHome: HOME + '-absent' })
    expect(face.ok).toBe(true)
    expect(face.entries).toHaveLength(0)
  })

  it('reads entries and drops stale ones (10min)', () => {
    writeSidecar({
      fresh: { session_id: 's1', platform: 'matrix', watermark_pct: 90.0, turns: 5, cum_api_calls: 40 },
      stale: { session_id: 's2', watermark_pct: 50 },
    }, 0)
    // 手动把 stale 条目改成 15 分钟前
    const p = join(HOME, 'runtime', 'sessions-telemetry.json')
    const raw = JSON.parse(readFileSync(p, 'utf-8'))
    raw.stale.ts = Math.floor(Date.now() / 1000) - 900
    writeFileSync(p, JSON.stringify(raw))
    const face = collectSessionTelemetry({ hermesHome: HOME })
    expect(face.ok).toBe(true)
    expect(face.entries.map((e) => e.sessionKey)).toEqual(['fresh'])
    expect(face.entries[0]?.watermarkPct).toBe(90)
    expect(face.entries[0]?.cumApiCalls).toBe(40)
  })
})

describe('D9 context watermark', () => {
  it('warns at 85 and escalates at 95; silent below', () => {
    const te = {
      ok: true, entries: [
        { sessionKey: 'low', tsMs: Date.now(), watermarkPct: 40 },
        { sessionKey: 'mid', tsMs: Date.now(), watermarkPct: 88, cumApiCalls: 120 },
        { sessionKey: 'hot', tsMs: Date.now(), watermarkPct: 96, rotations: 1 },
      ],
    }
    const out = detectContextWatermark(snapWith(te))
    expect(out.map((a) => a.subject).sort()).toEqual(['session:hot', 'session:mid'])
    expect(out.find((a) => a.subject === 'session:hot')?.severity).toBe('high')
    expect(out.find((a) => a.subject === 'session:mid')?.severity).toBe('warn')
  })
})

describe('D10 empty streak', () => {
  it('fires at the limit and escalates at 2x; honours custom limit', () => {
    const te = {
      ok: true, entries: [
        { sessionKey: 'ok', tsMs: Date.now(), emptyStreak: 1 },
        { sessionKey: 'stuck', tsMs: Date.now(), emptyStreak: 5 },
        { sessionKey: 'deep', tsMs: Date.now(), emptyStreak: 9 },
      ],
    }
    const snap = snapWith(te)
    const out = detectEmptyStreak(snap)
    expect(out.map((a) => a.subject).sort()).toEqual(['session:deep', 'session:stuck'])
    expect(out.find((a) => a.subject === 'session:deep')?.severity).toBe('high')
    const custom = detectEmptyStreak(snap, { emptyStreakLimit: 6 })
    expect(custom.map((a) => a.subject)).toEqual(['session:deep'])
  })
})

describe('D11 runaway loop', () => {
  it('fires on repeated decisions (>=2), not on a single observation', () => {
    const te = {
      ok: true, entries: [
        { sessionKey: 'once', tsMs: Date.now(), runaway: { signal: 'polling_repeat', decisions: 1 } },
        { sessionKey: 'loop', tsMs: Date.now(), runaway: { signal: 'abab_action_cycle', tool: 'read_file', decisions: 2 } },
        { sessionKey: 'hell', tsMs: Date.now(), runaway: { signal: 'exact_action_repeat', decisions: 5 } },
      ],
    }
    const out = detectRunawayLoop(snapWith(te))
    expect(out.map((a) => a.subject).sort()).toEqual(['session:hell', 'session:loop'])
    expect(out.find((a) => a.subject === 'session:hell')?.severity).toBe('high')
  })
})

describe('detectAll wiring', () => {
  it('new detectors participate in the full sweep', () => {
    const te = {
      ok: true, entries: [{ sessionKey: 'k1', tsMs: Date.now(), watermarkPct: 91, emptyStreak: 6, runaway: { decisions: 3 } }],
    }
    const out = detectAll(snapWith(te))
    const detectors = new Set(out.map((a) => a.detector))
    expect(detectors.has('session.context-watermark')).toBe(true)
    expect(detectors.has('session.empty-streak')).toBe(true)
    expect(detectors.has('session.runaway-loop')).toBe(true)
  })
})
