// overlay/eval UI Oracle M3 单测：两阶段管线（fake 浏览器 + fake 判定端）。
// 采集/判定全注入——不依赖 Playwright 浏览器与 clef 存活。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  _useStoreDirForTests, _resetJudgeDefaultsForTests, loadEvalConfig,
  classifyActualChange, domLineDiff, runOracleCase,
  type OracleBrowser, type OracleCase, type OracleElement, type OraclePage,
} from '../index'
import type { EvalConfig } from '../types'

const CONFIG: EvalConfig = { ...loadEvalConfig() }

let storeDir: string
beforeAll(() => {
  storeDir = mkdtempSync(join(tmpdir(), 'eval-oracle-store-'))
  _useStoreDirForTests(storeDir)
})
afterAll(() => {
  rmSync(storeDir, { recursive: true, force: true })
})

// ---------- fake 采集链 ----------

interface FakePageScript {
  beforeLines: string[]
  afterLines: string[]
  beforeShot: Buffer
  afterShot: Buffer
  urlChanges?: boolean
}

function fakeBrowser(script: FakePageScript): OracleBrowser & { clicks: string[] } {
  const clicks: string[] = []
  return {
    clicks,
    async newPage(url: string): Promise<OraclePage> {
      let clicked = false
      const elements: OracleElement[] = [
        { index: 1, tag: 'button', role: '', text: 'Eval Sets', selector: '#tab-sets' },
        { index: 2, tag: 'button', role: '', text: 'Runs', selector: '#tab-runs' },
      ]
      return {
        async url() { return clicked && script.urlChanges ? `${url}?tab=runs` : url },
        async screenshot() { return clicked ? script.afterShot : script.beforeShot },
        async domProjection() {
          return clicked
            ? { lines: script.afterLines, elements }
            : { lines: script.beforeLines, elements }
        },
        async clickSelector(selector: string) { clicks.push(selector); clicked = true },
        async dismissOverlay() { return false },
        async close() { /* no-op */ },
      }
    },
    async close() { /* no-op */ },
  }
}

const SAME_SHOT = Buffer.from('png-bytes-same')
const OTHER_SHOT = Buffer.from('png-bytes-changed')

const BASE_LINES = ['Agent Eval Studio', 'Eval Sets', 'Runs', '走查-回放判分集']

function makeCase(overrides: Partial<OracleCase> = {}): OracleCase {
  return {
    id: 'oracle-t1',
    name: '切到 Runs 页签',
    targetUrl: 'http://localhost:8649/#/app/eval',
    action: { kind: 'click', somIndex: 2 },
    createdAt: Date.now(),
    ...overrides,
  }
}

/** 预测：will_change / change_kind；验证：response_matches_prediction。 */
type FakeAnswers = Record<string, number | string>
function fakeAsk(answers: FakeAnswers, opts: { fail?: boolean } = {}) {
  return async () => {
    if (opts.fail) throw new Error('judge down')
    return answers
  }
}

// ---------- S0 单元 ----------

describe('S0：DOM diff 与响应分类', () => {
  it('domLineDiff 给出增删行集合', () => {
    const d = domLineDiff(['a', 'b'], ['a', 'c'])
    expect(d.added).toEqual(['c'])
    expect(d.removed).toEqual(['b'])
  })

  it('分类：URL 变化=导航；双变化=内容更新；弹层关键词=modal；无变化=none', () => {
    expect(classifyActualChange(true, false, { added: [], removed: [] })).toBe('navigation')
    expect(classifyActualChange(false, false, { added: ['新列表'], removed: ['旧列表'] })).toBe('content_update')
    expect(classifyActualChange(false, false, { added: ['对话框已打开'] })).toBe('modal_open')
    expect(classifyActualChange(false, true, { added: [], removed: [] })).toBe('none')
  })
})

// ---------- 两阶段主线 ----------

describe('两阶段判词', () => {
  it('KuiTest"UI 无响应"缺陷：预测有响应，像素+DOM 双无变化', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: BASE_LINES, beforeShot: SAME_SHOT, afterShot: SAME_SHOT })
    const result = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.93, change_kind: 'content_update' }),
    })
    expect(result.stage1.willChange).toBe('yes')
    expect(result.stage2.pixelUnchanged).toBe(true)
    expect(result.verdict).toBe('ui_unresponsive')
  })

  it('clean：预测有响应 + 实际变化 + S1 判定一致', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: [...BASE_LINES, 'Replay scoring: offline judging'], beforeShot: SAME_SHOT, afterShot: OTHER_SHOT })
    const result = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.93, change_kind: 'content_update', response_matches_prediction: 0.9 }),
    })
    expect(result.stage2.actualChangeKind).toBe('content_update')
    expect(result.stage2.matchVerdict).toBe('match')
    expect(result.verdict).toBe('clean')
  })

  it('mismatch：实际响应与预测不符（S1 判不一致）', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: [...BASE_LINES, '报错：无法连接'], beforeShot: SAME_SHOT, afterShot: OTHER_SHOT })
    const result = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.93, change_kind: 'navigation', response_matches_prediction: 0.03 }),
    })
    expect(result.stage2.matchVerdict).toBe('mismatch')
    expect(result.verdict).toBe('mismatch')
  })

  it('判定端全程离线：预测 unknown → S1 不比对（未知预测无从不符），判词 unknown 且不阻塞采集', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: [...BASE_LINES, '新内容'], beforeShot: SAME_SHOT, afterShot: OTHER_SHOT })
    const result = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({}, { fail: true }),
    })
    expect(result.stage1.online).toBe(false)
    expect(result.stage1.willChange).toBe('unknown')
    expect(result.stage2.visionAttempted).toBe(false)
    expect(result.stage2.online).toBe(false)
    expect(result.verdict).toBe('unknown')
  })

  it('预测已定 + 验证端离线：S1 已尝试但不在线，判词回退 S0 分类对照', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: [...BASE_LINES, '新列表'], beforeShot: SAME_SHOT, afterShot: OTHER_SHOT })
    // 两问两答：预测阶段成功（will_change 0.9），验证阶段失败——用调用计数切换
    let call = 0
    const result = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: async () => {
        call += 1
        if (call === 1) return { will_change: 0.9, change_kind: 'content_update' }
        throw new Error('judge down mid-run')
      },
    })
    expect(result.stage1.online).toBe(true)
    expect(result.stage2.visionAttempted).toBe(true)
    expect(result.stage2.online).toBe(false)
    expect(result.stage2.actualChangeKind).toBe('content_update')
    // S1 离线但 S0 分类与预测一致 → clean（判定不冒充：若分类不符则为 unknown 而非 mismatch）
    expect(result.verdict).toBe('clean')
  })

  it('预测无响应 + 实际无变化 → clean；预测 unknown + 无变化 → unknown', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: BASE_LINES, beforeShot: SAME_SHOT, afterShot: SAME_SHOT })
    const clean = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.03, change_kind: 'none', response_matches_prediction: 0.9 }),
    })
    expect(clean.verdict).toBe('clean')

    const unknownPrediction = await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.5, change_kind: 'none' }),
    })
    expect(unknownPrediction.verdict).toBe('unknown')
  })

  it('selector 定位优先于 somIndex；点击被记录', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: [...BASE_LINES, '新内容'], beforeShot: SAME_SHOT, afterShot: OTHER_SHOT })
    const result = await runOracleCase(makeCase({ action: { kind: 'click', selector: '#tab-runs' } }), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.93, change_kind: 'content_update', response_matches_prediction: 0.9 }),
    })
    expect(browser.clicks).toEqual(['#tab-runs'])
    expect(result.stage1.target?.text).toBe('Runs')
    expect(result.verdict).toBe('clean')
  })

  it('somIndex 越界 → 采集链抛错（由调用方落 failed 记录）', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: BASE_LINES, beforeShot: SAME_SHOT, afterShot: SAME_SHOT })
    await expect(runOracleCase(makeCase({ action: { kind: 'click', somIndex: 99 } }), {
      config: CONFIG,
      browser,
      ask: fakeAsk({ will_change: 0.9, change_kind: 'none' }),
    })).rejects.toThrow('SoM')
  })
})

// ---------- 反偏置 ----------

describe('问句反偏置', () => {
  it('Stage 1 预测问句不包含期望答案线索', async () => {
    const browser = fakeBrowser({ beforeLines: BASE_LINES, afterLines: BASE_LINES, beforeShot: SAME_SHOT, afterShot: SAME_SHOT })
    const requests: unknown[] = []
    await runOracleCase(makeCase(), {
      config: CONFIG,
      browser,
      ask: async (req) => { requests.push(req); return { will_change: 0.9, change_kind: 'none' } },
    })
    const serialized = JSON.stringify(requests)
    expect(serialized).not.toContain('期望')
    expect(serialized).not.toContain('expect_')
  })
})

_resetJudgeDefaultsForTests()
