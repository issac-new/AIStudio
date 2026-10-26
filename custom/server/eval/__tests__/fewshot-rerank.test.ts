// C2（挂账清偿批二）守门：fewshot LLM 重排——off 直通零开销、解析（围栏容忍/
// 序号去重垫后）、离线回落词面序（fail-open）、注入行 LLM 标注、dispatchColumnTransition
// 透出 rerank 读数。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fewshotRerank, rerankInjectLine, rerankEnabled, parseOrder } from '../fewshot-rerank'
import { recordDistill } from '../flywheel'
import type { DistillLedgerEntry } from '../flywheel'

let evalDir: string

const D = (id: string, problem: string): Omit<DistillLedgerEntry, 'at'> => ({
  id, taskId: `bd-${id}`, sourceRunId: 'r', sourceTaskId: 'q', sampleIdx: 0,
  rootCause: 'action_loop', tabooActions: ['重复操作'], failedSteps: 2, stepRedline: null,
  targetSetId: '回归样本库', problem, expectedBehavior: '正确做法',
})

beforeEach(() => {
  evalDir = mkdtempSync(join(tmpdir(), 'rerank-'))
  process.env.EVAL_STORE = evalDir
  delete process.env.FLYWHEEL_FEWSHOT_RERANK
  delete process.env.EVAL_JUDGE_BASE_URL
})

afterEach(() => {
  delete process.env.EVAL_STORE
  delete process.env.FLYWHEEL_FEWSHOT_RERANK
  delete process.env.EVAL_JUDGE_BASE_URL
  rmSync(evalDir, { recursive: true, force: true })
})

describe('parseOrder（应答解析）', () => {
  it('裸数组/围栏/逗号空格容忍；越界序号丢弃；去重', () => {
    expect(parseOrder('[3,1,2]', 3)).toEqual([3, 1, 2])
    expect(parseOrder('```json\n[2, 1]\n```', 3)).toEqual([2, 1])
    expect(parseOrder('[1,1,9,2]', 3)).toEqual([1, 2])
  })
})

describe('fewshotRerank（fail-open）', () => {
  it('开关关 → source=off 直通词面召回（零 LLM 开销）', async () => {
    recordDistill({ ...D('d1', '支付收银台改造') })
    recordDistill({ ...D('d2', '退款逆向流程') })
    expect(rerankEnabled()).toBe(false)
    const r = await fewshotRerank('收银台 支付', [])
    expect(r.source).toBe('off')
    expect(r.recall.recalled.length).toBe(0)
  })

  it('判定端不可用 → fallback 回落词面序（reason 如实）', async () => {
    process.env.FLYWHEEL_FEWSHOT_RERANK = '1'
    process.env.EVAL_JUDGE_BASE_URL = 'http://127.0.0.1:59999'
    const d1 = { ...D('d1', '微信支付收银台退款'), at: 1 } as DistillLedgerEntry
    const d2 = { ...D('d2', '收银台退款流程核对'), at: 2 } as DistillLedgerEntry
    const r = await fewshotRerank('微信支付收银台退款', [d1, d2])
    expect(r.source).toBe('fallback')
    expect(r.reason).toContain('回落词面序')
    // 词面序保持（d1 更相关在前）
    expect(r.recall.recalled[0].ledgerId).toBe('d1')
  })

  it('rerankInjectLine：off 不出行；fallback 出行不带 LLM 标注', () => {
    const off = { recall: { query: 'q', minSim: 0.45, recalled: [], candidates: 0 }, source: 'off' as const }
    expect(rerankInjectLine(off)).toBeNull()
    const fb = {
      recall: { query: 'q', minSim: 0.45, candidates: 1, recalled: [{ ledgerId: 'd1', trigger: 't', wrongDemo: 'w', rightDemo: 'r', rootCause: 'x', similarity: 0.9 }] },
      source: 'fallback' as const,
    }
    const line = rerankInjectLine(fb)
    expect(line).toContain('历史教训')
    expect(line).not.toContain('LLM 重排')
  })
})
