// overlay[delivery]: 群体协作四维度读数测试面（2026-10-24 群体协作评测基准吸收轮）。
// 纯函数正反例（run22 真实行样本做夹具）+ tmpdir SIM 根起 koa 端到端。
// 纪律：断言写真实读数（计数/比例/前沿标记），缺席输入如实 null 不造数。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Koa from 'koa'
import { createServer } from 'node:http'

import {
  parseScenarioDispatches,
  parseIssuesLog,
  completedTaskIds,
  markParetoFrontier,
  swarmCollabOf,
  textSimilarityOf,
  parseByzantineInjections,
  ablationCompareOf,
  cadenceOf,
  parseTruthAnchors,
  taskLatencyOf,
} from '../swarm-collab'
import { parseLedgerTsv } from '../interventions'
import { deliveryRouter } from '../delivery-controller'

// ── run22 真实行样本（20261021-v8-run22 evidence；逐字取自行内锚点） ──
const RUN22_SCENARIO = [
  '[mux 10:08:40] [qi] 派发 ($pyj4kJujYaB96jVjDoZqacE8vDAIFUg_IcqRhjAjCug): @qi-agent:matrix.test 测试左移任务 UC-RFD-001（用户案例设计，与系统分析并行推进，不等分析稿）：',
  '[mux 10:38:44] [chen] 派发 ($FVc_DvtBuCSqEuWhmZjyAq408Y9oIo4Rf67qZ01gccU): @chen-agent:matrix.test 执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）。',
  '[mux 10:38:48] [xiao] 派发 ($0BO0nLQXBQ_PoTdNyX-Tdl0-73B2afV14lLZGwm8KsM): @xiao-agent:matrix.test 执行任务 AN-MP（csw-cashier-mp 小程序收银台前端系分）。',
  '[mux 10:38:52] [hu] 派发 ($mQH1Y5FxCKYurdpVE_3_QzBRKXLM-X7dBehiwTu1s0k): @hu-agent:matrix.test 执行任务 AN-CHWX（csw-channel-wechat 财付通渠道系分）。',
  '[mux 11:30:46] [真值] 仓库出现 docs/analysis/AN-MP-analysis.md ✓',
  '[mux 11:31:10] [真值] 仓库出现 docs/analysis/AN-PAYCORE-analysis.md ✓',
  '[mux 10:36:47] [真值] 房间出现 @chen-agent 与 @wei-agent 的 RACI 派发 ✗（60s 超时）',
  '[mux 12:00:00] [观察] AN-MP 回执未见（免等窗：回灌已发+记录放行）',
].join('\n')

const RUN22_ISSUES = [
  'ISSUE|receipt-missing|AN-MP|完成回执未见（免等窗即刻记录；回灌补发要求已发，入库真值在案）',
  'ISSUE|raci-dispatch-missing|fanfan-agent|@chen/@wei RACI 双 @ 群通知未见（补发要求已发；真值=主卡 raci 列，验证归审计段）',
  'ISSUE|g5-ready-fail|driver|G5 准备失败',
].join('\n')

const RUN22_LEDGER = [
  'id\tts\ttype\tdefect\tdetail\tstatus\tresolution',
  'c1792550207-345784\t2026-10-21 10:36:47\tdispatch-preset\tPR-7\tbackfill raci-dispatch-missing（补登/核验回灌代催）\topen\t',
  'c1792550207-445784\t2026-10-21 10:36:47\tdispatch-preset\tPR-7\tbackfill raci-not-structured（补登/核验回灌代催）\topen\t',
  'c1792565330-4517705\t2026-10-21 14:48:50\tnudge\tPR-3\tagents=qi desc=测试报告入库（空转过半轻推）\topen\t',
].join('\n')

const RUN22_UAT = [
  JSON.stringify({ ts: '2026-10-21T16:38:22.113Z', actor: 'admin', ac: 'AC-1', verdict: 'pass' }),
  JSON.stringify({ ts: '2026-10-21T16:38:22.170Z', actor: 'admin', ac: 'AC-2', verdict: 'pass' }),
  JSON.stringify({ ts: '2026-10-21T16:38:22.224Z', actor: 'admin', ac: 'AC-3', verdict: 'reject' }),
].join('\n')

const RUN22_GATE = [
  JSON.stringify({ ts: '2026-10-21T15:00:00Z', actor: 'admin', action: 'reject' }),
  JSON.stringify({ ts: '2026-10-21T16:26:33Z', actor: 'admin', action: 'approve' }),
].join('\n')

function readoutFixtureArgs() {
  return {
    run: '20261021-fx',
    scenarioLog: RUN22_SCENARIO,
    ledgerRows: parseLedgerTsv(RUN22_LEDGER),
    issuesLog: RUN22_ISSUES,
    uatVerdicts: [
      { ac: 'AC-1', verdict: 'pass' },
      { ac: 'AC-2', verdict: 'pass' },
      { ac: 'AC-3', verdict: 'reject' },
    ],
    gateDecisions: [{ decision: 'reject' }, { decision: 'approve' }],
  }
}

function readoutFixture() {
  return swarmCollabOf(readoutFixtureArgs())
}

describe('群体协作读数 · 解析器（run22 真实行）', () => {
  it('派发行解析：sender/target/任务 ID/模块锚', () => {
    const ds = parseScenarioDispatches(RUN22_SCENARIO)
    expect(ds).toHaveLength(4)
    const paycore = ds.find(d => d.taskId === 'AN-PAYCORE')
    expect(paycore?.sender).toBe('chen')
    expect(paycore?.target).toBe('chen-agent')
    expect(paycore?.moduleSlug).toBe('csw-pay-core')
    expect(ds.find(d => d.taskId === 'UC-RFD-001')?.moduleSlug).toBeNull()
  })

  it('真值✓行 → 完成锚（✗ 行不计）', () => {
    const done = completedTaskIds(RUN22_SCENARIO)
    expect([...done].sort()).toEqual(['AN-MP', 'AN-PAYCORE'])
  })

  it('issues.log 解析：key/owner', () => {
    const issues = parseIssuesLog(RUN22_ISSUES)
    expect(issues).toHaveLength(3)
    expect(issues[0]).toMatchObject({ key: 'receipt-missing', owner: 'AN-MP' })
  })
})

describe('群体协作读数 · 四维度换算', () => {
  it('维度一（通信拓扑）：MOR 字符口径 + 锚点保真 + 等待信号', () => {
    const r = readoutFixture()
    const c = r.communication
    expect(c.dispatchCount).toBe(4)
    expect(c.taskIds.sort()).toEqual(['AN-CHWX', 'AN-MP', 'AN-PAYCORE', 'UC-RFD-001'])
    expect(c.morCharsPerTask).toBeGreaterThan(0)
    // AN-* 三任务派发行都带模块锚 → preserved；UC-RFD-001 无模块锚不计保真
    expect(c.intentFidelity.anchoredTasks).toBe(4)
    expect(c.intentFidelity.preserved).toBe(3)
    expect(c.intentFidelity.rate).toBeCloseTo(3 / 4)
    expect(c.deadlockSignals.backfillCount).toBe(2)
    expect(c.deadlockSignals.backfillRatio).toBeCloseTo(2 / 3)
    expect(c.deadlockSignals.receiptMissing).toBe(1)
    expect(c.deadlockSignals.raciMissing).toBe(1)
    expect(c.deadlockSignals.nudgeCount).toBe(1)
  })

  it('维度三（信用）：per-agent 分解与观察口径 criticality', () => {
    const r = readoutFixture()
    const chen = r.credit.agents.find(a => a.agent === 'chen')
    expect(chen?.assignedDispatches).toBe(1)
    expect(chen?.completedAnchors).toBe(1) // AN-PAYCORE 真值✓
    // 任务事实：PAYCORE(chen,✓) MP(xiao,✓) CHWX(hu,✗) UC-RFD-001(qi,✗)
    // chen 参与侧 1/1 − 缺席侧 1/3（缺席侧里 MP 也完成）= +2/3
    expect(chen?.criticalityObserved).toBeCloseTo(1 - 1 / 3)
    const xiao = r.credit.agents.find(a => a.agent === 'xiao')
    expect(xiao?.criticalityObserved).toBeCloseTo(1 - 1 / 3)
    // qi 参与侧 UC 未完成（0/1）− 缺席侧 2/3 = 负贡献读数
    expect(r.credit.agents.find(a => a.agent === 'qi')?.criticalityObserved).toBeCloseTo(0 - 2 / 3)
    expect(r.credit.taskCompletion).toEqual({ done: 2, total: 4 })
  })

  it('维度三（帕累托）：非支配前沿标记正确', () => {
    const pts = markParetoFrontier([
      { agent: 'a', cost: 10, benefit: 2 },
      { agent: 'b', cost: 20, benefit: 2 }, // 被 a 支配（同收益成本更高）
      { agent: 'c', cost: 30, benefit: 5 },
    ])
    expect(pts.map(p => [p.agent, p.onFrontier])).toEqual([['a', true], ['b', false], ['c', true]])
    const r = readoutFixture()
    expect(r.pareto.frontierSize).toBeGreaterThan(0)
    expect(r.pareto.points.every(p => typeof p.cost === 'number')).toBe(true)
  })

  it('维度四（社会动力学）：UAT 通过率 + G5 打回 + 拜占庭如实 no_data', () => {
    const r = readoutFixture()
    expect(r.social.uat).toEqual({ total: 3, pass: 2, conditional: 0, reject: 1 })
    expect(r.social.unconditionalPassRate).toBeCloseTo(2 / 3)
    expect(r.social.gateRejects).toBe(1)
    expect(r.social.gateFailIssues).toBe(1) // fixture 的 g5-ready-fail 行
    expect(r.social.issuesCaught).toBe(3)
    expect(r.social.byzantine.status).toBe('no_data')
  })

  it('输入缺席 → 如实 null/0 不造数', () => {
    const r = swarmCollabOf({ run: 'x', scenarioLog: null, ledgerRows: [], issuesLog: null, uatVerdicts: [], gateDecisions: [] })
    expect(r.communication.dispatchCount).toBe(0)
    expect(r.communication.morCharsPerTask).toBeNull()
    expect(r.communication.intentFidelity.rate).toBeNull()
    expect(r.credit.agents).toEqual([])
    expect(r.social.unconditionalPassRate).toBeNull()
  })
})

describe('聚合层 · 拓扑与派发节拍（2026-10-24）', () => {
  it('派发行带 HH:MM:SS 时间戳', () => {
    const ds = parseScenarioDispatches(RUN22_SCENARIO)
    expect(ds[0].ts).toBe('10:08:40')
  })

  it('派发图：节点/边/自环/出入度中心化（run22 四人各一条）', () => {
    const t = readoutFixture().communication.topology
    expect(t.nodes).toBe(4)
    expect(t.edges).toBe(4)
    expect(t.selfLoopShare).toBe(1) // 四人各自派发给自己的 agent
    expect(t.outCentralization).toBeCloseTo(0) // 出度完全均分
    expect(t.inCentralization).toBeCloseTo(0)
    expect(t.topHubShare).toBeCloseTo(1 / 4)
    expect(t.topHub).toBe('chen') // 均分并列时按节点名排序取首个
  })

  it('派发节拍：排序后跨度/中位间隔/每分钟（日志乱序不影响）', () => {
    const log = [
      '[mux 10:03:00] [b] 派发 ($3): @c-agent:matrix.test 任务 AN-C',
      '[mux 10:00:00] [a] 派发 ($1): @a-agent:matrix.test 任务 AN-A',
      '[mux 10:01:00] [a] 派发 ($2): @b-agent:matrix.test 任务 AN-B',
    ].join('\n')
    const c = cadenceOf(parseScenarioDispatches(log))
    expect(c.spanSeconds).toBe(180)
    expect(c.medianGapSeconds).toBe(90)
    expect(c.dispatchesPerMinute).toBeCloseTo(1)
  })

  it('无派发 → 拓扑/节拍如实 null', () => {
    const r = swarmCollabOf({ run: 'x', scenarioLog: null, ledgerRows: [], issuesLog: null, uatVerdicts: [], gateDecisions: [] })
    expect(r.communication.topology.nodes).toBe(0)
    expect(r.communication.topology.outCentralization).toBeNull()
    expect(r.communication.topology.topHub).toBeNull()
    expect(r.communication.cadence.spanSeconds).toBeNull()
    expect(r.communication.cadence.dispatchesPerMinute).toBeNull()
  })
})

describe('任务锚点时延（D22/D23）', () => {
  const log = [
    '[mux 10:00:00] [a] 派发 ($1): @a-agent:matrix.test 执行任务 AN-A（csw-a 模块）',
    '[mux 10:05:00] [a] 派发 ($2): @b-agent:matrix.test 执行任务 AN-B（csw-b 模块）',
    '[mux 10:10:00] [真值] AN-B 产出入仓 ✗（60s 超时）',
    '[mux 10:30:00] [真值] 仓库出现 AN-A.md ✓',
    '[mux 11:05:00] [真值] 仓库出现 AN-B.md ✓',
  ].join('\n')

  it('派发→之后首个✓真值；✗ 不计；中位/P95/最大', () => {
    const anchors = parseTruthAnchors(log)
    expect(anchors).toHaveLength(2) // ✗ 行被剔除
    const l = taskLatencyOf(parseScenarioDispatches(log), anchors)
    expect(l.samples).toBe(2)
    expect(l.medianSeconds).toBe(2700) // (1800+3600)/2
    expect(l.p95Seconds).toBe(3600)
    expect(l.maxSeconds).toBe(3600)
    expect(l.perTask.find(p => p.taskId === 'AN-A')?.seconds).toBe(1800)
    expect(l.perTask.find(p => p.taskId === 'AN-B')?.seconds).toBe(3600)
    expect(l.basis).toBe('dispatch-to-first-truth')
  })

  it('跨零点按 +24h 修正', () => {
    const cross = [
      '[mux 23:50:00] [a] 派发 ($1): @a-agent:matrix.test 执行任务 AN-X（csw-x 模块）',
      '[mux 00:10:00] [真值] 仓库出现 AN-X.md ✓',
    ].join('\n')
    const l = taskLatencyOf(parseScenarioDispatches(cross), parseTruthAnchors(cross))
    expect(l.samples).toBe(1)
    expect(l.medianSeconds).toBe(1200)
  })

  it('早于派发的旧真值（上一轮/重做）不计', () => {
    const stale = [
      '[mux 09:00:00] [真值] 仓库出现 AN-Y.md ✓',
      '[mux 10:00:00] [a] 派发 ($1): @a-agent:matrix.test 执行任务 AN-Y（csw-y 模块）',
    ].join('\n')
    const l = taskLatencyOf(parseScenarioDispatches(stale), parseTruthAnchors(stale))
    expect(l.samples).toBe(0)
    expect(l.medianSeconds).toBeNull()
    expect(l.perTask).toEqual([])
  })

  it('run22 真实样本：2 个任务有 ✓ 真值', () => {
    const l = readoutFixture().communication.taskLatency
    expect(l.samples).toBe(2)
    expect(l.medianSeconds).not.toBeNull()
    expect(l.perTask.map(p => p.taskId).sort()).toEqual(['AN-MP', 'AN-PAYCORE'])
  })
})

describe('群体协作读数 · 端点（夹具端到端）', () => {
  let dir: string
  let server: ReturnType<typeof createServer>
  let base = ''

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'swarm-collab-'))
    const evidenceDir = join(dir, 'runs', '20261021-fx', 'evidence')
    mkdirSync(evidenceDir, { recursive: true })
    writeFileSync(join(evidenceDir, 'scenario.log'), RUN22_SCENARIO)
    writeFileSync(join(evidenceDir, 'issues.log'), RUN22_ISSUES)
    writeFileSync(join(evidenceDir, 'compensation-ledger.tsv'), RUN22_LEDGER)
    writeFileSync(join(evidenceDir, 'uat-verdicts.jsonl'), RUN22_UAT)
    writeFileSync(join(evidenceDir, 'release-gate.jsonl'), RUN22_GATE)
    writeFileSync(join(evidenceDir, 'r18-steps.json'), JSON.stringify({
      _schema: 1,
      steps: {
        '9': { ops: [{ title: '步 9 需求派发任务书全文（fanfan→fanfan-agent）', dialogs: [{ sender: 'fanfan', body: '支付收银台：支持微信与支付宝双渠道收单，商户多端接入，任务拆分与 RACI 如下' }] }] },
        '11': { ops: [{ title: '步 11 系分拆分与 RACI 派发对话（fanfan-agent）', dialogs: [
          { sender: 'fanfan-agent', body: '执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）：支持微信与支付宝双渠道收单' },
          { sender: 'fanfan-agent', body: '执行任务 AN-MP（csw-cashier-mp 小程序收银台前端）：商户多端接入' },
        ] }] },
      },
    }))
    process.env.SIM_OBSERVER_ROOT = dir
    const app = new Koa()
    app.use(deliveryRouter.routes())
    server = createServer(app.callback())
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    const addr = server.address()
    base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`
  })

  afterAll(() => {
    server?.close()
    delete process.env.SIM_OBSERVER_ROOT
    rmSync(dir, { recursive: true, force: true })
  })

  it('GET /swarm-collab?run=：四维度读数 + sources 溯源', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/swarm-collab?run=20261021-fx`)
    expect(res.status).toBe(200)
    const body = await res.json() as {
      available: boolean; run: string; readout: {
        communication: {
          dispatchCount: number
          intentFidelity: { preserved: number; basis: string; textDispatchCount: number; textSimilarity: number | null }
        }
        social: { gateRejects: number; byzantine: { status: string } }
        sources: string[]
      }
    }
    expect(body.available).toBe(true)
    expect(body.run).toBe('20261021-fx')
    expect(body.readout.communication.dispatchCount).toBe(4)
    expect(body.readout.communication.intentFidelity.preserved).toBe(3)
    expect(body.readout.social.gateRejects).toBe(1)
    expect(body.readout.social.byzantine.status).toBe('no_data')
    expect(body.readout.sources.some((s: string) => s.includes('scenario.log'))).toBe(true)
    // 清账批 D13：r18 dialogs 在场 → 意图保真走全文相似度口径
    expect(body.readout.communication.intentFidelity.basis).toBe('dialog-text')
    expect(body.readout.communication.intentFidelity.textDispatchCount).toBe(2)
    expect(body.readout.communication.intentFidelity.textSimilarity).toBeGreaterThan(0)
    expect(body.readout.sources.some((s: string) => s.includes('r18-steps.json'))).toBe(true)
  })

  it('缺 run 参数 → 取最新 run；非法 run → 400', async () => {
    const res = await fetch(`${base}/api/hermes/delivery/swarm-collab`)
    expect(res.status).toBe(200)
    expect(((await res.json()) as { run: string }).run).toBe('20261021-fx')
    const bad = await fetch(`${base}/api/hermes/delivery/swarm-collab?run=../escape`)
    expect(bad.status).toBe(400)
  })
})


// ── 2026-10-24 清账批：全文保真度 / 拜占庭 / 消融对比 ──
describe('清账批 D13 · 全文意图保真度（dialog-text 口径）', () => {
  it('字符 bigram Dice：恒等=1、全异=0、部分重叠居中', () => {
    expect(textSimilarityOf('支付收银台需求文档', '支付收银台需求文档')).toBe(1)
    expect(textSimilarityOf('完全不同的内容', '毫无交集的文本')).toBeLessThan(0.15)
    const mid = textSimilarityOf('执行任务 AN-PAYCORE 支付核心系分', '执行任务 AN-MP 收银台前端系分')
    expect(mid).toBeGreaterThan(0.2)
    expect(mid).toBeLessThan(1)
  })

  it('dialogs 在场 → basis=dialog-text；缺席 → anchor 回退', () => {
    const withDlg = swarmCollabOf({
      ...readoutFixtureArgs(), intentDialogs: {
        taskBook: '支付收银台：支持微信与支付宝双渠道收单，商户多端接入',
        dispatches: ['执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）：支持微信与支付宝双渠道收单', '执行任务 AN-MP（csw-cashier-mp 小程序收银台前端）：商户多端接入'],
      },
    })
    expect(withDlg.communication.intentFidelity.basis).toBe('dialog-text')
    expect(withDlg.communication.intentFidelity.textDispatchCount).toBe(2)
    expect(withDlg.communication.intentFidelity.textSimilarity).not.toBeNull()
    expect(withDlg.communication.intentFidelity.rate).toBe(withDlg.communication.intentFidelity.textSimilarity)
    const noDlg = swarmCollabOf({ ...readoutFixtureArgs(), intentDialogs: null })
    expect(noDlg.communication.intentFidelity.basis).toBe('anchor')
    expect(noDlg.communication.intentFidelity.rate).toBeCloseTo(3 / 4)
  })
})

describe('清账批 D11 · 拜占庭读数（标记实测三态）', () => {
  const BYZ_LOG = [
    '[mux 10:38:44] [chen] 派发 ($F1): @chen-agent:matrix.test 执行任务 AN-PAYCORE（csw-pay-core 支付核心系分）。',
    '[mux 10:40:01] [BYZANTINE-INJECT mode=corruption target=chen-agent ts=2026-10-21T10:40:01+08:00] 污染指令已附加（评估注入）',
    '[mux 10:41:00] [xiao] 派发 ($F2): @xiao-agent:matrix.test 执行任务 AN-MP（csw-cashier-mp 小程序收银台前端系分）。',
    '[mux 10:42:00] [hu] 派发 ($F3): @hu-agent:matrix.test 执行任务 AN-CHWX（csw-channel-wechat 财付通渠道系分）。',
  ].join('\n')

  it('标记解析：mode/target/ts', () => {
    const inj = parseByzantineInjections(BYZ_LOG)
    expect(inj).toHaveLength(1)
    expect(inj[0]).toMatchObject({ mode: 'corruption', target: 'chen-agent' })
  })

  it('注入在场 → status=injected + BCR + 暴露派发数；无标记 → no_data', () => {
    const injected = swarmCollabOf({ ...readoutFixtureArgs(), scenarioLog: BYZ_LOG + '\n' + RUN22_SCENARIO })
    expect(injected.social.byzantine.status).toBe('injected')
    expect(injected.social.byzantine.injections).toHaveLength(1)
    // chen 名下有 receipt-missing？fixture 无 → BCR 由 issuesOwned 判：chen 无问题单 → 拦截证据缺席
    // 但 RUN22_SCENARIO 部分行也在（含 AN-MP 真值）——只断言字段形态与暴露窗>0
    expect((injected.social.byzantine.exposureDispatches ?? [0])[0]).toBeGreaterThan(0)
    expect(injected.social.byzantine.bcr).not.toBeNull()
    const clean = readoutFixture()
    expect(clean.social.byzantine.status).toBe('no_data')
  })
})

describe('清账批 D10 · 消融对比（实验性 LOO）', () => {
  it('基线/消融完成率差分=criticality；空样本=null', () => {
    const r = ablationCompareOf(
      { run: 'base', taskCompletion: { done: 5, total: 6 } },
      { run: 'abl', taskCompletion: { done: 2, total: 6 } },
      ['chen'],
    )
    expect(r.roles).toEqual(['chen'])
    expect(r.base.rate).toBeCloseTo(5 / 6)
    expect(r.ablated.rate).toBeCloseTo(2 / 6)
    expect(r.criticality).toBeCloseTo(3 / 6)
    expect(r.basis).toBe('experimental-leave-one-out')
    const empty = ablationCompareOf({ run: 'b', taskCompletion: { done: 0, total: 0 } }, { run: 'a', taskCompletion: { done: 1, total: 2 } }, [])
    expect(empty.criticality).toBeNull()
  })
})
