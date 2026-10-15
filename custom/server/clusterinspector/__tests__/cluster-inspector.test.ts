// 集群巡检官测试：六检测器（run11 实录形态夹具）+ 冷却去重 + 巡检环重入保护。
import { describe, expect, it } from 'vitest'
import type { ClusterSnapshot } from '../collectors'
import { detectAll, detectBlockedStale, detectGateway, detectSessionStall, detectSlotInflation, detectStorm } from '../detectors'
import { ClusterInspector } from '../inspector'
import { probeBranchIntel } from '../collectors'

function snap(partial: Partial<ClusterSnapshot>): ClusterSnapshot {
  return {
    ts: 1,
    gateway: { ok: true },
    sessions: { ok: true, entries: 0, live: 0, dead: [] },
    profiles: { ok: true, tails: [] },
    kanban: { ok: false, rows: [] },
    runningCards: { ok: false, cards: [] },
    federation: { ok: false, nowMs: 1, machines: [] },
    ...partial,
  }
}

describe('detectors（run11 实录形态）', () => {
  it('D1：网关不可达=high；gateway_state 非 running=降级；platform needs_attention=warn', () => {
    const a = detectGateway(snap({ gateway: { ok: false, error: 'ECONNREFUSED' } }))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatchObject({ detector: 'gateway.unreachable', severity: 'high' })

    const b = detectGateway(snap({ gateway: { ok: true, state: { gateway_state: 'degraded' } } }))
    expect(b).toMatchObject([{ detector: 'gateway.degraded', severity: 'warn' }])

    const c = detectGateway(snap({ gateway: { ok: true, state: { gateway_state: 'running', platforms: { matrix: { needs_attention: true, state: 'retrying' } } } } }))
    expect(c).toMatchObject([{ detector: 'gateway.platform-attention', subject: 'platform:matrix', severity: 'warn' }])
  })

  it('D2：槽位膨胀 active=26 vs live=3 → warn；≥inflateHigh → high', () => {
    const gw = (n: number) => snap({ gateway: { ok: true, state: { active_agents: n } }, sessions: { ok: true, entries: 30, live: 3, dead: [] } })
    expect(detectSlotInflation(gw(8))).toHaveLength(0)                        // 差 5=容忍线内
    expect(detectSlotInflation(gw(9))[0]?.severity).toBe('warn')            // 差 6 超线
    expect(detectSlotInflation(gw(26))[0]).toMatchObject({ detector: 'gateway.slot-inflation', severity: 'high' })
    expect(detectSlotInflation(snap({ gateway: { ok: true, state: { active_agents: 2 } }, sessions: { ok: false, entries: 0, live: 0, dead: [] } }))).toHaveLength(0)
  })

  it('D3：kanban 诊断 error/critical → warn/high', () => {
    const rows = [
      { task_id: 't1', diagnostics: [{ severity: 'critical', title: '心跳陈旧 30min' }] },
      { task_id: 't2', diagnostics: [{ severity: 'warning', title: 'ok' }] },
    ]
    const out = detectAll(snap({ kanban: { ok: true, rows, } }))
    expect(out.filter((a) => a.detector === 'kanban.stale-worker')).toMatchObject([
      { subject: 't1', severity: 'high' },
    ])
  })

  it('D4：尾行错误态+静默>5min 判卡；正常尾/刚更新不判', () => {
    const now = 1_000_000
    const tails = [
      { profile: 'fanfan', tail: '2026-10-08 18:18:00 ERROR hindsight prefetch TimeoutError', mtimeMs: now - 400_000, workTsMs: now - 400_000 },
      { profile: 'hu', tail: '2026-10-08 18:18:00 INFO ok', mtimeMs: now - 400_000, workTsMs: now - 400_000 },
      { profile: 'lin', tail: '... Traceback ...', mtimeMs: now - 10_000, workTsMs: now - 10_000 },
    ]
    const out = detectSessionStall(snap({ profiles: { ok: true, tails } }), { nowMs: now })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ detector: 'session.stalled', subject: 'profile:fanfan' })
  })

  it('D5：同检测器 ≥3 主体 → 追加风暴 high', () => {
    const anomalies = detectGateway(snap({
      gateway: {
        ok: true,
        state: { gateway_state: 'running', platforms: Object.fromEntries(['a', 'b', 'c'].map((n) => [n, { needs_attention: true }])) },
      },
    }))
    const storm = detectStorm(anomalies)
    expect(storm).toMatchObject([{ detector: 'anomaly.storm', subject: 'gateway.platform-attention', severity: 'high' }])
  })
})

describe('ClusterInspector（冷却去重/重入/fail-soft）', () => {
  function stalledSnap() {
    return snap({
      gateway: { ok: false, error: 'probe failed' },
      profiles: { ok: true, tails: [{ profile: 'x', tail: '... TimeoutError', mtimeMs: 1, workTsMs: 1 }] },
    })
  }

  it('同 type+subject 冷却窗内只发一次；检测仍每轮全量', async () => {
    const events: Array<{ type: string }> = []
    // gatewayBase 指不可达端口：单测须与宿主真实网关（如 SIM 8801 在跑）隔离，防环境泄漏翻转断言
    const insp = new ClusterInspector({ emitGovEvent: (e) => events.push(e), hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1', now: () => 1_000_000 })
    const r1 = await insp.runOnce()
    expect(r1.anomalies.length).toBeGreaterThan(0)
    expect(r1.emitted).toBe(r1.anomalies.length)
    const r2 = await insp.runOnce()
    expect(r2.anomalies).toHaveLength(r1.anomalies.length)
    expect(r2.emitted).toBe(0)
    expect(r2.suppressedByCooldown).toBe(r2.anomalies.length)
    expect(events.map((e) => e.type).every((t) => t.startsWith('cluster.'))).toBe(true)
  })

  it('govbus 缺席 fail-soft（不抛错）', async () => {
    const insp = new ClusterInspector({ hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1', now: () => 1 })
    await expect(insp.runOnce()).resolves.toBeTruthy()
  })

  it('start/stop 幂等', () => {
    const insp = new ClusterInspector({ hermesHome: '/nonexistent' })
    insp.start(60_000)
    insp.start(60_000)
    insp.stop()
    insp.stop()
    expect(true).toBe(true)
  })
})

describe('二期：容量泵 D6 + safe-act', () => {
  it('D6：depth/cap ≥75% warn、≥90% high；<75% 无事件', () => {
    const mk = (depth: number) => snap({ gateway: { ok: true, capacity: { ts: Date.now() / 1000, depth, anchors: depth, cap: 64 } } })
    const only = (n: number) => detectAll(mk(n)).filter((a) => a.detector === 'gateway.capacity-pump')
    expect(only(50)[0]?.severity).toBe('warn')      // 78%
    expect(only(60)[0]).toMatchObject({ severity: 'high' })  // 94%
    expect(only(47)).toHaveLength(0)                // 73% 线内
    expect(only(10)).toHaveLength(0)
  })

  it('safe-act：SAFE_ACT=on 僵尸卡触发 reclaim；off 不动', async () => {
    const reclaimed: string[] = []
    const mkInsp = () => new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1',
      getKanbanDiagnostics: async () => [{ task_id: 't9', diagnostics: [{ severity: 'critical', title: '心跳陈旧' }] }],
      reclaimTask: async (id) => { reclaimed.push(id); return 'ok' },
      now: () => 1_000_000,
    })
    process.env.CLUSTER_INSPECTOR_SAFE_ACT = 'on'
    const r1 = await mkInsp().runOnce()
    delete process.env.CLUSTER_INSPECTOR_SAFE_ACT
    expect(r1.actions).toEqual(['t9:reclaimed'])
    expect(reclaimed).toEqual(['t9'])
    const r2 = await mkInsp().runOnce()
    expect(r2.actions ?? []).toEqual([])  // off：不动手（anomaly 仍报）
  })
})

describe('二期②③：matrix 提醒 + destructive 审批联动', () => {
  // D1 high（网关不可达）+ D4 stalled（fanfan 尾错误态且静默）双异常夹具
  function deadGatewaySnap() {
    return snap({
      gateway: { ok: false, error: 'probe failed' },
      profiles: { ok: true, tails: [{ profile: 'fanfan', tail: '... TimeoutError', mtimeMs: 1, workTsMs: 1 }] },
    })
  }
  it('② NUDGE=on 时 session.stalled 触发提醒（mentions 经凭据链由注入桩代验）', async () => {
    const { mkdtempSync, mkdirSync, writeFileSync, utimesSync } = require('node:fs')
    const { join } = require('node:path')
    const { tmpdir } = require('node:os')
    const home = mkdtempSync(join(tmpdir(), 'ci-home-'))
    const logDir = join(home, 'profiles', 'fanfan', 'logs')
    mkdirSync(logDir, { recursive: true })
    const log = join(logDir, 'agent.log')
    writeFileSync(log, '2026-10-08 18:18:00 ERROR hindsight prefetch TimeoutError\n')
    utimesSync(log, new Date(Date.now() - 400_000), new Date(Date.now() - 400_000))
    const nudged: Array<[string, string]> = []
    const insp = new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: home, gatewayBase: 'http://127.0.0.1:1',
      nudge: async (pf, sum) => { nudged.push([pf, sum]); return 'nudged' },
      now: () => 1,
    })
    process.env.CLUSTER_INSPECTOR_NUDGE = 'on'
    process.env.CLUSTER_INSPECTOR_NUDGE_ROOM = '!room:x'
    try {
      await insp.runOnce()
      expect(nudged).toEqual([['fanfan', expect.stringContaining('卡死')]])  // 注入桩收 a.summary；提醒话术在缺省发送体内
    } finally { delete process.env.CLUSTER_INSPECTOR_NUDGE; delete process.env.CLUSTER_INSPECTOR_NUDGE_ROOM }
  })

  it('③ destructive：high 网关异常→入审批队列；approve→重启一次；reject→不动', async () => {
    const { mkdtempSync, writeFileSync, mkdirSync, readFileSync } = require('node:fs')
    const { join } = require('node:path')
    const { tmpdir } = require('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'ci-appr-'))
    const restarts: string[] = []
    const mkInsp = () => new ClusterInspector({
      emitGovEvent: () => {}, hermesHome: '/nonexistent', gatewayBase: 'http://127.0.0.1:1',
      approvalsDir: dir, restartGateway: async (pf) => { restarts.push(pf); return { running: true, profile: pf } },
      now: () => 1,
    })
    process.env.CLUSTER_INSPECTOR_DESTRUCTIVE = 'approval'
    try {
      const r1 = await mkInsp().runOnce()
      expect(r1.actions?.some((a) => a.startsWith('approval-requested:'))).toBe(true)
      const q = readFileSync(join(dir, 'mx-requests.jsonl'), 'utf-8')
      const eid = (JSON.parse(q.trim().split('\n')[0]) as { eid: string }).eid
      // 裁决 approve → 下一轮重启
      mkdirSync(join(dir, 'responses'), { recursive: true })
      writeFileSync(join(dir, 'responses', `${eid}.json`), JSON.stringify({ decision: 'approve' }))
      const r2 = await mkInsp().runOnce()
      expect(r2.actions).toContain('gateway-restarted:default')
      expect(restarts).toEqual(['default'])
      // 已处理：第三轮不再动作
      const r3 = await mkInsp().runOnce()
      expect(r3.actions?.some((a) => a.startsWith('gateway-restarted'))).toBeFalsy()
    } finally { delete process.env.CLUSTER_INSPECTOR_DESTRUCTIVE }
  })
})


describe('D8 跨机静默（联邦三步之③）', () => {
  const now = 1_000_000_000_000
  const mk = (machines: Array<{ machineId: string; lastSeenMs: number; activeTasks: number }>) =>
    snap({ ts: now, federation: { ok: true, nowMs: now, machines } })
  it('机器静默超阈且带在途任务 → 报 machine.silent（附差分参照）', () => {
    const a = detectAll(mk([
      { machineId: 'mac-a', lastSeenMs: now - 1200_000, activeTasks: 3 },
      { machineId: 'mac-b', lastSeenMs: now - 60_000, activeTasks: 1 },
    ]), { nowMs: now })
    const hit = a.find((x) => x.detector === 'machine.silent')
    expect(hit).toBeTruthy()
    expect(hit!.subject).toBe('machine:mac-a')
    expect(hit!.summary).toContain('差分参照：其余 1/1')
  })
  it('空闲机器（0 在途）静默不报；活跃机器不报；面未接线零误报', () => {
    const a = detectAll(mk([
      { machineId: 'idle', lastSeenMs: now - 9999_000, activeTasks: 0 },
      { machineId: 'busy', lastSeenMs: now - 60_000, activeTasks: 5 },
    ]), { nowMs: now })
    expect(a.find((x) => x.detector === 'machine.silent')).toBeUndefined()
    const off = snap({ ts: now, federation: { ok: false, nowMs: now, machines: [{ machineId: 'x', lastSeenMs: 0, activeTasks: 9 }] } })
    expect(detectAll(off, { nowMs: now }).find((x) => x.detector === 'machine.silent')).toBeUndefined()
  })
})

describe('D7 在办任务·档案静默交叉（run14 三次停摆形态）', () => {
  const now = 1_000_000_000_000
  const mk = (mtime: number) => snap({
    ts: now,
    profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'INFO agent ok', mtimeMs: mtime, workTsMs: mtime }] },
    runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }, { id: 't_fix2', assignee: 'chen-csw-pay-core' }] },
  })
  it('在办卡+档案静默超阈 → 报 task.agent-silent（不要求日志尾错误态）', () => {
    const a = detectAll(mk(now - 1200_000), { nowMs: now })
    const hit = a.find((x) => x.detector === 'task.agent-silent')
    expect(hit).toBeTruthy()
    expect(hit!.subject).toBe('profile:chen-csw-pay-core')
    expect(hit!.summary).toContain('2 张在办卡')
  })
  it('真做判据（run19 上移）：嘴炮回合（单轮调用回话）不清静默账——workTsMs 新但 realWorkTsMs 旧 → 仍报', () => {
    const chatty = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'INFO reply sent', mtimeMs: now - 30_000, workTsMs: now - 30_000, realWorkTsMs: now - 1200_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    const hit = detectAll(chatty, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('真做静默')
  })
  it('真做判据：工具轮/多轮调用新鲜 → 不报（真在干活不误催）', () => {
    const working = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'INFO ok', mtimeMs: now - 30_000, workTsMs: now - 30_000, realWorkTsMs: now - 30_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    expect(detectAll(working, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
  it('档案活跃（刚写日志）→ 不报；无在办卡的静默档案 → 不报（真空闲不误报）', () => {
    expect(detectAll(mk(now - 60_000), { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
    const idle = snap({ ts: now, profiles: { ok: true, tails: [{ profile: 'ops', tail: 'x', mtimeMs: now - 9999_000, workTsMs: 0 }] }, runningCards: { ok: true, cards: [] } })
    expect(detectAll(idle, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
  it('假活跃防误判（run14 实锤形态）：mtime 被 reaction 噪音刷新但工作行已死 → 按 workTsMs 判停报', () => {
    const fake = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'Matrix: reaction ✅', mtimeMs: now - 60_000, workTsMs: now - 1200_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    const hit = detectAll(fake, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')
    expect(hit).toBeTruthy() // mtime 60s 前（新鲜）但工作行 20min 前 → 仍报
    const alive = snap({
      ts: now,
      profiles: { ok: true, tails: [{ profile: 'chen-csw-pay-core', tail: 'API call #5', mtimeMs: now - 60_000, workTsMs: now - 60_000 }] },
      runningCards: { ok: true, cards: [{ id: 't_fix1', assignee: 'chen-csw-pay-core' }] },
    })
    expect(detectAll(alive, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
  it('runningCards 面未接线 → 零误报', () => {
    const off = snap({ ts: now, profiles: { ok: true, tails: [{ profile: 'a', tail: 'x', mtimeMs: 0, workTsMs: 0 }] }, runningCards: { ok: false, cards: [] } })
    expect(detectAll(off, { nowMs: now }).find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
  })
})

describe('probeBranchIntel（分支感知催办情报，run19 上移）', () => {
  const setup = () => {
    const { mkdtempSync, mkdirSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const dir = mkdtempSync(join(require('node:os').tmpdir(), 'branch-intel-'))
    const repo = join(dir, 'repo.git')
    execFileSync('git', ['init', '-q', '--bare', repo])
    const work = join(dir, 'work')
    execFileSync('git', ['init', '-q', work])
    const g = (args: string[], env: Record<string, string> = {}) =>
      execFileSync('git', ['-C', work, ...args], { env: { ...process.env, ...env } })
    return { dir, repo, work, g }
  }
  const commitAt = (g: (a: string[], e?: Record<string, string>) => void, branch: string, author: string, dateIso: string) => {
    g(['checkout', '-qb', branch])
    g(['config', 'user.name', author]); g(['config', 'user.email', `${author}@x`])
    require('node:fs').writeFileSync(require('node:path').join(process.env.BI_WORK as string, branch.replace(/\//g, '_') + '.txt'), 'x')
    g(['add', '-A'])
    g(['commit', '-qm', 'wip'], { GIT_AUTHOR_DATE: dateIso, GIT_COMMITTER_DATE: dateIso })
    g(['push', '-q', process.env.BI_REPO as string, `HEAD:refs/heads/${branch}`])
  }
  it('命中：档案名下 freshH 内的新分支 → 带情报句', () => {
    const { dir, repo, work, g } = setup()
    process.env.BI_REPO = repo; process.env.BI_WORK = work
    const now = new Date()
    const iso = (offH: number) => new Date(now.getTime() - offH * 3600_000).toISOString()
    commitAt(g, 'feat/DEV-A', 'chen', iso(1))
    commitAt(g, 'feat/OLD', 'chen', iso(48))
    commitAt(g, 'feat/OTHER', 'lin', iso(1))
    process.env.CLUSTER_INSPECTOR_NUDGE_REPO = repo
    process.env.CLUSTER_INSPECTOR_BRANCH_FRESH_H = '24'
    const out = probeBranchIntel('chen-csw-pay-core')
    expect(out).toContain('feat/DEV-A@')
    expect(out).not.toContain('feat/OLD')
    expect(out).not.toContain('feat/OTHER')
    delete process.env.CLUSTER_INSPECTOR_NUDGE_REPO
    require('node:fs').rmSync(dir, { recursive: true, force: true })
  })
  it('未配置 NUDGE_REPO → 空串（fail-open 不阻塞催办）', () => {
    delete process.env.CLUSTER_INSPECTOR_NUDGE_REPO
    expect(probeBranchIntel('chen')).toBe('')
  })
})

describe('detectDeliveryAnchor（交付锚验证 A+B，run19 上移）', () => {
  const mkRepo = () => {
    const { mkdtempSync } = require('node:fs') as typeof import('node:fs')
    const { join } = require('node:path') as typeof import('node:path')
    const { execFileSync } = require('node:child_process') as typeof import('node:child_process')
    const dir = mkdtempSync(join(require('node:os').tmpdir(), 'anchor-'))
    const repo = join(dir, 'r')
    execFileSync('git', ['init', '-q', repo])
    const g = (args: string[], env: Record<string, string> = {}) =>
      execFileSync('git', ['-C', repo, ...args], { env: { ...process.env, ...env } })
    g(['config', 'user.name', 'chen']); g(['config', 'user.email', 'c@x'])
    const iso = (offH: number) => new Date(Date.now() - offH * 3600_000).toISOString()
    const commit = (branch: string, offH: number) => {
      g(['checkout', '-qb', branch])
      require('node:fs').writeFileSync(join(repo, branch.replace(/\//g, '_') + '.txt'), 'x')
      g(['add', '-A'])
      g(['commit', '-qm', 'w'], { GIT_AUTHOR_DATE: iso(offH), GIT_COMMITTER_DATE: iso(offH) })
    }
    return { repo, commit, cleanup: () => require('node:fs').rmSync(dir, { recursive: true, force: true }) }
  }
  const cards = (arr: Array<Record<string, unknown>>) =>
    ({ ok: true, cards: arr.map((c) => ({ id: 't1', title: 'X', ...c })) })
  it('A：done 卡分支 tip 早于 started_at → delivery.branch-stale', () => {
    const { repo, commit, cleanup } = mkRepo()
    commit('feat/OLD', 48); commit('feat/NEW', 1)
    process.env.CLUSTER_INSPECTOR_NUDGE_REPO = repo
    const now = Date.now()
    const snapA = snap({ ts: now, profiles: { ok: true, tails: [] },
      runningCards: cards([{ branch_name: 'feat/OLD', started_at: Math.round(now / 1000) - 7200, status: 'running' }]) })
    const hit = detectAll(snapA).find((x) => x.detector === 'delivery.branch-stale')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('上轮遗留')
    const snapB = snap({ ts: now, profiles: { ok: true, tails: [] },
      runningCards: cards([{ branch_name: 'feat/NEW', started_at: Math.round(now / 1000) - 7200, status: 'running' }]) })
    expect(detectAll(snapB).find((x) => x.detector === 'delivery.branch-stale')).toBeUndefined()
    delete process.env.CLUSTER_INSPECTOR_NUDGE_REPO
    cleanup()
  })
  it('B：done 卡分支仓中查无 → delivery.anchor-missing（本地有分支则不报）', () => {
    const { repo, commit, cleanup } = mkRepo()
    commit('feat/GOOD', 1)
    process.env.CLUSTER_INSPECTOR_NUDGE_REPO = repo
    const now = Date.now()
    const st = Math.round(now / 1000) - 7200
    const miss = snap({ ts: now, profiles: { ok: true, tails: [] },
      runningCards: cards([{ branch_name: 'feat/GHOST', started_at: st, status: 'done' }]) })
    const hit = detectAll(miss).find((x) => x.detector === 'delivery.anchor-missing')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('不可反查')
    const ok = snap({ ts: now, profiles: { ok: true, tails: [] },
      runningCards: cards([{ branch_name: 'feat/GOOD', started_at: st, status: 'done' }]) })
    expect(detectAll(ok).find((x) => x.detector === 'delivery.anchor-missing')).toBeUndefined()
    delete process.env.CLUSTER_INSPECTOR_NUDGE_REPO
    cleanup()
  })
  it('fail-open：未配 repo → 两型都不报', () => {
    delete process.env.CLUSTER_INSPECTOR_NUDGE_REPO
    const sp = snap({ ts: Date.now(), profiles: { ok: true, tails: [] },
      runningCards: cards([{ branch_name: 'feat/X', started_at: 1, status: 'done' }]) })
    const a = detectAll(sp)
    expect(a.find((x) => x.detector === 'delivery.anchor-missing')).toBeUndefined()
    expect(a.find((x) => x.detector === 'delivery.branch-stale')).toBeUndefined()
  })
})

describe('detectDispatcherStuck + detectFakeCompletion（run19 四病灶根治上移）', () => {
  const now = 1_000_000_000_000
  it('僵死：ready 卡滞留超阈 → dispatcher.stuck；未超阈/无卡不报', () => {
    const mkc = (status: string) => snap({ ts: now, profiles: { ok: true, tails: [] },
      runningCards: { ok: true, cards: [{ id: 't1', assignee: 'aa', status, branch_name: '', started_at: 1 }] } })
    const hit = detectAll(mkc('ready'), { nowMs: now, dispatcherStuckMs: 1_000_000 }).find((x) => x.detector === 'dispatcher.stuck')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('零孵化')
    expect(detectAll(mkc('ready'), { nowMs: now, dispatcherStuckMs: 0 }).find((x) => x.detector === 'dispatcher.stuck')).toBeUndefined()
    expect(detectAll(mkc('running'), { nowMs: now, dispatcherStuckMs: 9_999_999 }).find((x) => x.detector === 'dispatcher.stuck')).toBeUndefined()
  })
  it('假完成：done 卡但负责人零真做 → completion.no-realwork；有真做不报', () => {
    const mkp = (rw: number) => snap({ ts: now,
      profiles: { ok: true, tails: [{ profile: 'aa', tail: 'x', mtimeMs: now, workTsMs: now, realWorkTsMs: rw }] },
      runningCards: { ok: true, cards: [{ id: 't2', assignee: 'aa', status: 'done', branch_name: 'b', started_at: 1 }] } })
    const hit = detectAll(mkp(0), { nowMs: now }).find((x) => x.detector === 'completion.no-realwork')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('零真做')
    expect(detectAll(mkp(now - 60_000), { nowMs: now }).find((x) => x.detector === 'completion.no-realwork')).toBeUndefined()
  })
})

describe('detectLoadImbalance + detectIdleWithWorkAvailable（工作调节面，用户裁定）', () => {
  const now = 1_000_000_000_000
  const mksnap = (cards: Array<{ assignee?: string; status?: string }>, tails: Array<{ p: string; rw?: number }>) => snap({
    ts: now,
    profiles: { ok: true, tails: tails.map((t) => ({ profile: t.p, tail: 'x', mtimeMs: now - 3600_000, workTsMs: now - 3600_000, realWorkTsMs: t.rw ?? 0 })) },
    runningCards: { ok: true, cards: cards.map((c, i) => ({ id: `t${i}`, assignee: c.assignee, status: c.status ?? 'running', started_at: 1 })) },
  })
  it('不均衡：一人持 3 卡+一人零卡 → load.imbalance 附分布；人人≤2 不报', () => {
    const hit = detectAll(mksnap([
      { assignee: 'aa' }, { assignee: 'aa' }, { assignee: 'aa' },
    ], [{ p: 'aa' }, { p: 'bb' }]), { nowMs: now }).find((x) => x.detector === 'load.imbalance')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('aa 持 3 张在办卡')
    expect(hit!.summary).toContain('bb')
    expect(detectAll(mksnap([{ assignee: 'aa' }, { assignee: 'aa' }], [{ p: 'aa' }, { p: 'bb' }]), { nowMs: now }).find((x) => x.detector === 'load.imbalance')).toBeUndefined()
  })
  it('空闲正当性：零卡档案静默+队列有无主 ready 卡 → idle.with-work；队列无卡（真空闲）不报', () => {
    const un = [{ }, { assignee: '', status: 'ready' }]
    const hit = detectAll(mksnap([{ assignee: '', status: 'ready' }], [{ p: 'bb' }]), { nowMs: now }).find((x) => x.detector === 'idle.with-work')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('可领未领')
    expect(detectAll(mksnap([{ assignee: 'aa' }], [{ p: 'bb' }]), { nowMs: now }).find((x) => x.detector === 'idle.with-work')).toBeUndefined()
  })
})


describe('card.blocked-stale（run19 G5 熔断死等产品化——用户 300s 时限）', () => {
  const NOW = 1_790_000_000_000
  it('阻塞卡停滞超 300s → 报 warn；超 4 倍（20min）→ 升 high', () => {
    const base = (ageMs: number) => snap({
      blockedCards: { ok: true, cards: [
        { id: 't_g5', title: 'RFD-001 发布准出评审（G5）', assignee: 'fanfan', status: 'blocked', updated_at: NOW - ageMs },
      ] },
    })
    const warnOut = detectBlockedStale(base(300_000 + 1), { nowMs: NOW })
    expect(warnOut).toHaveLength(1)
    expect(warnOut[0]).toMatchObject({ detector: 'card.blocked-stale', subject: 'card:t_g5', severity: 'warn' })
    const highOut = detectBlockedStale(base(300_000 * 4 + 1), { nowMs: NOW })
    expect(highOut[0]).toMatchObject({ severity: 'high' })
  })
  it('未超阈值 / updated_at 缺失 / 面未接线 → 均静默零报', () => {
    const fresh = detectBlockedStale(snap({ blockedCards: { ok: true, cards: [
      { id: 't1', status: 'blocked', updated_at: NOW - 60_000 },
    ] } }), { nowMs: NOW })
    expect(fresh).toHaveLength(0)
    const noTs = detectBlockedStale(snap({ blockedCards: { ok: true, cards: [
      { id: 't2', status: 'blocked' },
    ] } }), { nowMs: NOW })
    expect(noTs).toHaveLength(0)
    const notWired = detectBlockedStale(snap({}), { nowMs: NOW })
    expect(notWired).toHaveLength(0)
  })
  it('真实表无 updated_at 列：last_heartbeat_at 回退仍触发（run19 巡检实锤修正）', () => {
    const out = detectBlockedStale(snap({ blockedCards: { ok: true, cards: [
      { id: 't4', status: 'blocked', last_heartbeat_at: NOW - 400_000 },
    ] } }), { nowMs: NOW })
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ detector: 'card.blocked-stale' })
  })
  it('detectAll 聚合含 card.blocked-stale（阈值可经 blockedStaleMs 收紧）', () => {
    const out = detectAll(snap({ blockedCards: { ok: true, cards: [
      { id: 't3', title: 'X', status: 'blocked', updated_at: NOW - 120_000 },
    ] } }), { nowMs: NOW, blockedStaleMs: 60_000 })
    expect(out.some((a) => a.detector === 'card.blocked-stale')).toBe(true)
  })
})

describe('work.expected-silent（run20 双盲区实录产品化——群消息派活形态空转唯一出口）', () => {
  const NOW = 1_800_000_000_000
  it('ready 卡 assignee=<名>-agent 且档案真做静默 → 报；无期望卡（期望集空）不报', () => {
    const out = detectAll(snap({
      expectedWorkCards: { ok: true, cards: [
        { id: 't1', assignee: 'hu-agent', status: 'ready' },
        { id: 't2', assignee: 'lin-agent', status: 'todo' },
      ] },
      profiles: { ok: true, tails: [
        { profile: 'hu', tail: 'x', mtimeMs: NOW - 3600_000, workTsMs: NOW - 3600_000, realWorkTsMs: NOW - 3600_000 },
        { profile: 'lin', tail: 'x', mtimeMs: NOW - 1000, workTsMs: NOW - 1000, realWorkTsMs: NOW - 1000 },
      ] },
    }), { nowMs: NOW })
    const hit = out.find((x) => x.detector === 'work.expected-silent')
    expect(hit).toBeTruthy()
    expect(hit!.summary).toContain('hu')
    expect(hit!.summary).toContain('2 张')
    expect(out.filter((x) => x.detector === 'work.expected-silent' && x.subject === 'profile:lin')).toHaveLength(0)
    const noCards = detectAll(snap({
      expectedWorkCards: { ok: true, cards: [] },
      profiles: { ok: true, tails: [{ profile: 'x', tail: 'x', mtimeMs: NOW - 3600_000, workTsMs: NOW - 3600_000, realWorkTsMs: NOW - 3600_000 }] },
    }), { nowMs: NOW })
    expect(noCards.find((x) => x.detector === 'work.expected-silent')).toBeUndefined()
  })
  it('assignee 无 -agent 后缀=原名匹配；面未接线（expectedWorkCards 空）=合法空态零报', () => {
    const out = detectAll(snap({
      expectedWorkCards: { ok: true, cards: [{ id: 't3', assignee: 'wei', status: 'ready' }] },
      profiles: { ok: true, tails: [{ profile: 'wei', tail: 'x', mtimeMs: NOW - 3600_000, workTsMs: NOW - 3600_000, realWorkTsMs: NOW - 3600_000 }] },
    }), { nowMs: NOW })
    expect(out.find((x) => x.detector === 'work.expected-silent')).toBeTruthy()
    const notWired = detectAll(snap({
      profiles: { ok: true, tails: [{ profile: 'x', tail: 'x', mtimeMs: NOW - 3600_000, workTsMs: NOW - 3600_000, realWorkTsMs: NOW - 3600_000 }] },
    }), { nowMs: NOW })
    expect(notWired.find((x) => x.detector === 'work.expected-silent')).toBeUndefined()
  })
  it('与 D7/idle 互补：running 卡走 D7、无主 ready 走 idle、有主 ready/todo 走 expected-silent', () => {
    const mk = (cards: Array<{ assignee?: string; status?: string }>, tails: Array<{ p: string; rw?: number }>) => snap({
      ts: NOW,
      expectedWorkCards: { ok: true, cards: cards.map((c, i) => ({ id: `t${i}`, assignee: c.assignee, status: c.status ?? 'ready' })) },
      profiles: { ok: true, tails: tails.map((t) => ({ profile: t.p, tail: 'x', mtimeMs: NOW - 3600_000, workTsMs: NOW - 3600_000, realWorkTsMs: t.rw ?? NOW - 3600_000 })) },
      runningCards: { ok: true, cards: [] },
    })
    const exp = detectAll(mk([{ assignee: 'chen-agent' }], [{ p: 'chen' }]), { nowMs: NOW })
    expect(exp.find((x) => x.detector === 'work.expected-silent')).toBeTruthy()
    expect(exp.find((x) => x.detector === 'task.agent-silent')).toBeUndefined()
    expect(exp.find((x) => x.detector === 'idle.with-work')).toBeUndefined()
  })
})
