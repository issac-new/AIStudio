// 批三 D2 守门：squad 委托链 fewshot 重排注入——开关开且台账命中时 leader 简报尾部
// 带「历史教训（LLM 重排」或词面召回行；off/离线/无 taskId 零负担（简报原样）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { MentionDispatchService, type DispatchEnginePort } from '../zcode/mention-dispatch'

let home: string
let evalDir: string

function makeEngine() {
  const engine = {
    online: true,
    sessions: 0,
    sent: [] as Array<Record<string, unknown>>,
    async probe() { return engine.online },
    async createSession() { engine.sessions += 1; return { session: { sessionId: `sess-${engine.sessions}` } } },
    async sendCommand(p: { workspacePath: string; envelope: Record<string, unknown> }) {
      engine.sent.push(p.envelope)
      return { status: 'accepted' }
    },
  } as never
  return engine as DispatchEnginePort & { sent: Array<Record<string, unknown>> }
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'squad-rerank-home-'))
  evalDir = mkdtempSync(join(tmpdir(), 'squad-rerank-eval-'))
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.EVAL_STORE = evalDir
  delete process.env.FLYWHEEL_FEWSHOT_RERANK
  delete process.env.EVAL_JUDGE_BASE_URL
  // 看板任务 fixture（squad 重排语境源=任务标题）
  const dbDir = join(home, '.hermes')
  require('node:fs').mkdirSync(dbDir, { recursive: true })
  const db = new DatabaseSync(join(dbDir, 'kanban.db'))
  db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, title TEXT, assignee TEXT, status TEXT)')
  db.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?)').run('T-sq', '支付收银台改造任务', 'hu', 'doing')
  db.close()
  // 台账 fixture：一条带文本快照的教训（词面召回可命中）
  writeFileSync(join(evalDir, 'flywheel-ledger.json'), JSON.stringify({
    distills: [{
      id: 'd1', taskId: 'bd-1', sourceRunId: 'r', sourceTaskId: 'q', sampleIdx: 0,
      rootCause: 'action_loop', tabooActions: ['重复操作'], failedSteps: 2, stepRedline: null,
      targetSetId: '回归样本库', at: 1,
      problem: '支付收银台改造曾翻车', expectedBehavior: '先列计划',
    }],
    variantBatches: [], nextSeq: 2,
  }), 'utf8')
})
afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.EVAL_STORE
  delete process.env.FLYWHEEL_FEWSHOT_RERANK
  delete process.env.EVAL_JUDGE_BASE_URL
  rmSync(home, { recursive: true, force: true })
  rmSync(evalDir, { recursive: true, force: true })
})

describe('squad 委托链重排注入', () => {
  it('开关开+台账命中 → leader 简报尾部带历史教训行（判定端离线回落词面召回）', async () => {
    process.env.FLYWHEEL_FEWSHOT_RERANK = '1'
    process.env.EVAL_JUDGE_BASE_URL = 'http://127.0.0.1:59999'
    const engine = makeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'cli-d2', onOutcome: () => {} })
    const r = await svc.dispatch({ workspacePath: '/ws/sq', text: '@squad/core 处理支付收银台', taskId: 'T-sq' })
    expect(r[0].reason).toBe('queued')
    const sent = (engine as unknown as { sent: Array<Record<string, unknown>> }).sent[0]
    const text = String((sent.payload as { text: string }).text)
    expect(text).toContain('squad') // 简报形态在
    expect(text).toContain('历史教训') // 重排/召回行注入在（离线回落=fallback 词面召回行）
  })

  it('开关关 → 简报原样零负担（无历史教训行）；agent 单人派发不受影响', async () => {
    const engine = makeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'cli-d2b', onOutcome: () => {} })
    const r = await svc.dispatch({ workspacePath: '/ws/sq2', text: '@squad/core 处理支付收银台', taskId: 'T-sq' })
    expect(r[0].reason).toBe('queued')
    const sent = (engine as unknown as { sent: Array<Record<string, unknown>> }).sent[0]
    const text = String((sent.payload as { text: string }).text)
    expect(text).not.toContain('历史教训')
    // agent 形态（非 squad）不注入
    const r2 = await svc.dispatch({ workspacePath: '/ws/sq3', text: '@zcode 修一下', taskId: 'T-sq' })
    expect(r2[0].reason).toBe('queued')
    const sent2 = (engine as unknown as { sent: Array<Record<string, unknown>> }).sent[1]
    expect(String((sent2.payload as { text: string }).text)).not.toContain('历史教训')
  })
})
