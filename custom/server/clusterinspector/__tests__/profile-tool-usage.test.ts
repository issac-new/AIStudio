// M6b teams 观测采集面单测（2026-10-16 安全轮）。
// 用临时真 sqlite 库验证聚合口径；fail-soft 三态（空库/坏库/无 profiles 目录）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let home: string

function makeDb(path: string, rows: Array<{ tool: string; args?: string; ageSec: number; hour?: number; daysAgo?: number }>): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { DatabaseSync } = require('node:sqlite')
  const db = new DatabaseSync(path)
  db.exec('CREATE TABLE messages (session_id TEXT, role TEXT, content TEXT, tool_calls TEXT, tool_name TEXT, timestamp REAL)')
  const ins = db.prepare('INSERT INTO messages (session_id, role, content, tool_calls, tool_name, timestamp) VALUES (?,?,?,?,?,?)')
  const now = Date.now() / 1000
  for (const r of rows) {
    let ts: number
    if (r.hour !== undefined) {
      const d = new Date()
      d.setDate(d.getDate() - (r.daysAgo ?? 0))
      d.setHours(r.hour, 0, 0, 0)
      ts = d.getTime() / 1000 - r.ageSec
    } else {
      ts = now - r.ageSec
    }
    ins.run('s1', 'assistant', 'x', JSON.stringify([{ function: { name: r.tool, arguments: r.args ?? '{}' } }]), null, ts)
  }
  db.close()
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'tool-usage-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('collectProfileToolUsage 聚合口径', () => {
  it('按 1h/24h 窗口计数，高危/时段/敏感路径分列，topTools 按量排序', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    mkdirSync(join(home, 'profiles', 'scout'), { recursive: true })
    const now = Date.now()
    // 钉死 now：1h 内 3 条（含 1 高危）、24h 内另 2 条、24h 外 1 条（应不计）
    const deps = { hermesHome: home, now: () => now }
    makeDb(join(home, 'profiles', 'scout', 'state.db'), [
      { tool: 'terminal', args: '{"command":"ls"}', ageSec: 60 },            // 1h 内 + 高危
      { tool: 'read_file', args: '{"path":"/etc/passwd"}', ageSec: 120 },   // 1h 内 + 敏感路径
      { tool: 'web_search', ageSec: 300 },                                   // 1h 内
      { tool: 'execute_code', ageSec: 7200 },                                // 24h 内 + 高危
      { tool: 'read_file', ageSec: 90000 },                                  // 24h 外
    ])
    const face = collectProfileToolUsage(deps)
    expect(face.ok).toBe(true)
    const e = face.entries.find((x) => x.profile === 'scout')!
    expect(e.total1h).toBe(3)
    expect(e.total24h).toBe(4)
    expect(e.highRisk24h).toBe(2)
    expect(e.sensitivePath24h).toBe(1)
    // 并列时排序不确定，不断言并列项的顺序；只断言每个工具的计数正确
    const byTool = Object.fromEntries(e.perTool24h.map((t) => [t.tool, t.n]))
    expect(byTool).toEqual({ terminal: 1, read_file: 1, web_search: 1, execute_code: 1 })
    expect(e.error).toBeUndefined()
  })

  it('topTools 按量降序（计数不同时首项是最高频）', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    mkdirSync(join(home, 'profiles', 'p2'), { recursive: true })
    makeDb(join(home, 'profiles', 'p2', 'state.db'), [
      { tool: 'terminal', ageSec: 10 },
      { tool: 'terminal', ageSec: 20 },
      { tool: 'read_file', ageSec: 30 },
    ])
    const face = collectProfileToolUsage({ hermesHome: home })
    const e = face.entries.find((x) => x.profile === 'p2')!
    expect(e.perTool24h[0]).toEqual({ tool: 'terminal', n: 2 })
    expect(e.perTool24h).toHaveLength(2)
  })

  it('非工作时段计数（本地 0-6 时；nowMs 钉在 03:00，午夜档命中、午间档不命中）', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    mkdirSync(join(home, 'profiles', 'p1'), { recursive: true })
    const at3am = new Date(); at3am.setHours(3, 0, 0, 0)
    makeDb(join(home, 'profiles', 'p1', 'state.db'), [
      { tool: 'terminal', args: '{"command":"ls"}', ageSec: 0, hour: 3 },        // 今天 03:00
      { tool: 'read_file', ageSec: 0, hour: 12, daysAgo: 1 },                    // 昨天 12:00（窗口内、非时段）
    ])
    const face = collectProfileToolUsage({ hermesHome: home, now: () => at3am.getTime() + 60_000 })
    const e = face.entries.find((x) => x.profile === 'p1')!
    expect(e.total24h).toBe(2)
    expect(e.offhours24h).toBe(1)
  })

  it('根库记为 default；无 profiles 目录时只采根库', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    makeDb(join(home, 'state.db'), [{ tool: 'terminal', args: '{"command":"ls"}', ageSec: 10 }])
    const face = collectProfileToolUsage({ hermesHome: home })
    expect(face.entries.map((e) => e.profile)).toEqual(['default'])
    expect(face.entries[0]!.total1h).toBe(1)
  })

  it('坏库 fail-soft 到 profile 粒度（该 profile 带 error，其余照常）', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    mkdirSync(join(home, 'profiles', 'good'), { recursive: true })
    mkdirSync(join(home, 'profiles', 'bad'), { recursive: true })
    writeFileSync(join(home, 'profiles', 'bad', 'state.db'), 'not a sqlite db at all')
    makeDb(join(home, 'profiles', 'good', 'state.db'), [{ tool: 'terminal', args: '{}', ageSec: 5 }])
    const face = collectProfileToolUsage({ hermesHome: home })
    expect(face.ok).toBe(true)
    const bad = face.entries.find((e) => e.profile === 'bad')!
    const good = face.entries.find((e) => e.profile === 'good')!
    expect(bad.error).toBeTruthy()
    expect(good.total1h).toBe(1)
  })

  it('home 不存在：合法空态（ok=true 空条目，不抛——同「未接线」语义）', async () => {
    const { collectProfileToolUsage } = await import('../profile-tool-usage')
    const face = collectProfileToolUsage({ hermesHome: join(home, 'nope') })
    expect(face.ok).toBe(true)
    expect(face.entries).toEqual([])
  })
})
