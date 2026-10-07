// overlay/eval · UI Oracle（M3，对齐 KuiTest ICSE 2025 两阶段分解）。
//
// 命题：LLM 当 GUI 测试 Oracle——直接端到端判 bug 不可靠，拆「预测 → 验证」：
//   Stage 1 可供性预测：DOM 投影 + 编号元素清单（SoM 文本形态，v1 不画图上标，
//            如实声明与 KuiTest 图像 SoM 的差异）→ 判定目标组件功能与点击后
//            预期响应类型（will_change noul + change_kind choice）。
//   Stage 2 响应验证：执行动作 → S0 前置（像素字节等同 → 无视觉变化；DOM 结构
//            diff → 实际响应类型分类）→ S1 视觉/语义判定"实际 vs 预测"（clef
//            视觉塔；缺席/离线 → unknown，fail-open）。
//
// 判词：clean / ui_unresponsive（KuiTest"UI 无响应"：预测有响应而像素+DOM 双无变化）
//       / mismatch（S0 分类或 S1 判定与预测不符）/ unknown（判定端离线且 S0 不决）
//       / failed（采集链异常，如实带 error）。
//
// 采集链：Playwright chromium（依赖注入可测）；真实运行需上游 e2e 已装的浏览器。
import { createHash } from 'crypto'
import { clefAskMixed, type MixedJudgeAnswers } from './clef'
import type { Binary, EvalConfig } from './types'

export type OracleChangeKind = 'navigation' | 'content_update' | 'toggle_state' | 'modal_open' | 'error' | 'none'

export interface OracleAction {
  kind: 'click'
  /** 阶段 1 元素清单序号（SoM 文本形态） */
  somIndex?: number
  /** CSS 选择器（优先于 somIndex） */
  selector?: string
}

export interface OracleCase {
  id: string
  name: string
  targetUrl: string
  action: OracleAction
  /** 动作后 DOM 应包含的文本（可选，S0 直判） */
  expectText?: string
  createdAt: number
  createdBy?: string
}

export interface OracleElement {
  index: number
  tag: string
  role: string
  text: string
  selector: string
}

export interface OracleStage1 {
  elementCount: number
  target: { index: number; tag: string; text: string } | null
  willChange: Binary
  changeKind: string | null
  backend: string
  online: boolean
}

export interface OracleStage2 {
  /** 像素字节等同（v1 精确比对；true=无视觉变化） */
  pixelUnchanged: boolean | null
  domDiff: { added: string[]; removed: string[] }
  /** S0 对实际响应的分类 */
  actualChangeKind: OracleChangeKind | null
  /** S1 实际 vs 预测一致性（match/mismatch/unknown） */
  matchVerdict: 'match' | 'mismatch' | 'unknown'
  visionAttempted: boolean
  online: boolean
}

export type OracleVerdict = 'clean' | 'ui_unresponsive' | 'mismatch' | 'unknown' | 'failed'

export interface OracleRunRecord {
  id: string
  caseId: string
  status: 'done' | 'failed'
  error?: string
  stage1?: OracleStage1
  stage2?: OracleStage2
  verdict: OracleVerdict
  frames?: { beforeSha: string; afterSha: string; beforeDomLines: number; afterDomLines: number; urlChanged: boolean }
  createdAt: number
  createdBy?: string
}

// ---------- 采集链（依赖注入面） ----------

export interface OraclePage {
  url(): Promise<string>
  screenshot(): Promise<Buffer>
  /** DOM 投影：可见文本行 + 可交互元素编号清单（SoM 文本形态） */
  domProjection(): Promise<{ lines: string[]; elements: OracleElement[] }>
  clickSelector(selector: string): Promise<void>
  /** 消散弹层（Esc）；返回是否仍存在遮罩。 */
  dismissOverlay(): Promise<boolean>
  close(): Promise<void>
}

export interface OracleBrowser {
  newPage(url: string): Promise<OraclePage>
}

export interface OracleDeps {
  config: EvalConfig
  browser: OracleBrowser
  /** 判定问句（缺省走本地 clef 混合问句：noul 数值 + choice 字符串）。 */
  ask?: (request: unknown, config: EvalConfig) => Promise<MixedJudgeAnswers>
  now?: () => number
}

/** 默认判定器：本地 clef（与 judge.ts 同端点，混合答案解析）。 */
export const defaultOracleAsk = (request: unknown, config: EvalConfig): Promise<MixedJudgeAnswers> =>
  clefAskMixed(request as never, config)

/** 真 Playwright 采集链（懒加载；未安装/无浏览器时抛错由运行记录如实承载）。
 *  启动回退链：默认构建 → 系统 Chrome（channel）。本仓 playwright 依赖版本与
 *  ~/Library/Caches/ms-playwright 里已装构建号可能错位（实测 1223 欲装 vs 1243
 *  已装），缺构建时回落系统 Chrome，不静默假装成功。 */
export async function playwrightBrowser(): Promise<OracleBrowser> {
  const { chromium } = await import('playwright')
  let browserInstance
  try {
    browserInstance = await chromium.launch({ headless: true })
  } catch (e) {
    const message = (e as Error).message ?? ''
    if (!/Executable doesn't exist|browserType\.launch/.test(message)) throw e
    browserInstance = await chromium.launch({ headless: true, channel: 'chrome' })
  }
  return {
    async newPage(url: string): Promise<OraclePage> {
      const page = await browserInstance.newPage()
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 })
      await page.waitForTimeout(800)
      return {
        async url() { return page.url() },
        async screenshot() { return (await page.screenshot({ fullPage: false })) as Buffer },
        async domProjection() {
          return page.evaluate(`(() => {
            const lines = [];
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while ((node = walker.nextNode())) {
              const t = node.textContent.trim();
              if (t) lines.push(t.slice(0, 120));
            }
            const interactive = [...document.querySelectorAll('button, a[href], [role="button"], [role="tab"], [role="switch"], input, select')];
            const elements = interactive.slice(0, 60).map((el, i) => ({
              index: i + 1,
              tag: el.tagName.toLowerCase(),
              role: el.getAttribute('role') || '',
              text: (el.innerText || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().slice(0, 60),
              selector: el.id ? '#' + el.id : (el.dataset && el.dataset.testid) ? '[data-testid="' + el.dataset.testid + '"]' : el.tagName.toLowerCase() + ':nth-of-type(' + (Math.max(1, [...el.parentElement.children].indexOf(el) + 1)) + ')',
            }));
            return { lines: lines.slice(0, 400), elements };
          })()`)
        },
        async clickSelector(selector: string) { await page.click(selector, { timeout: 8000 }) },
        async dismissOverlay() {
          const hasOverlay = async (): Promise<boolean> => Boolean(await page.evaluate(`!!document.querySelector('.n-modal-mask, .n-drawer-mask, [role="dialog"][aria-modal="true"]')`))
          if (!(await hasOverlay())) return false
          await page.keyboard.press('Escape')
          await page.waitForTimeout(500)
          return hasOverlay()
        },
        async close() { await page.close() },
      }
    },
  }
}

function sha(buffer: Buffer): string {
  return createHash('sha1').update(buffer).digest('hex')
}

// ---------- Stage 1：可供性预测 ----------

const CHANGE_KINDS: Record<string, string> = {
  navigation: '跳转到其他页面/路由',
  content_update: '主区域内容更新（列表刷新/文本变化）',
  toggle_state: '开关/选中态切换（视觉小改）',
  modal_open: '弹出层/对话框/下拉展开',
  error: '报错/异常提示',
  none: '无明显变化',
}

export interface Stage1Result {
  willChange: Binary
  changeKind: string | null
  online: boolean
}

/**
 * Stage 1：预测点击后的响应。问句只依据 DOM 投影与目标元素描述（反偏置：
 * 不告知"我们希望什么"）。判定端离线 → unknown（fail-open，不阻塞 Stage 2 采集）。
 */
export async function oraclePredict(
  targetUrl: string,
  elements: OracleElement[],
  target: OracleElement | null,
  domLines: string[],
  deps: Pick<OracleDeps, 'config' | 'ask'>,
): Promise<Stage1Result> {
  if (!target) return { willChange: 'unknown', changeKind: null, online: false }
  const state = {
    page_url: targetUrl,
    target_element: `#${target.index} <${target.tag}> "${target.text}"`,
    interactive_elements: elements.slice(0, 30).map((e) => `#${e.index} <${e.tag}> ${e.text}`),
    visible_text_excerpt: domLines.slice(0, 60),
    plan: '用户将点击该目标元素',
  }
  const questions = {
    will_change: { type: 'noul', instructions: '点击该元素后，页面主区域是否会发生变化（导航/内容更新/弹层/开关态任一）？' },
    change_kind: { type: 'choice', instructions: '点击该元素后最可能的响应类型是？', criteria: CHANGE_KINDS },
  }
  const ask = deps.ask
  if (!ask) return { willChange: 'unknown', changeKind: null, online: false }
  try {
    const answers = await ask({ model: deps.config.judgeModel, state, questions }, deps.config)
    const will = answers.will_change
    const kind = answers.change_kind
    const willChange: Binary = typeof will === 'number'
      ? (will >= deps.config.tauYes ? 'yes' : will <= deps.config.tauNo ? 'no' : 'unknown')
      : 'unknown'
    return { willChange, changeKind: typeof kind === 'string' ? kind : null, online: typeof will === 'number' }
  } catch {
    return { willChange: 'unknown', changeKind: null, online: false }
  }
}

// ---------- Stage 2：S0 响应分类 ----------

/** S0 DOM diff → 实际响应分类（启发式；预测一致性以 S1 兜底）。 */
export function classifyActualChange(
  urlChanged: boolean,
  pixelUnchanged: boolean | null,
  diff: { added: string[]; removed: string[] },
): OracleChangeKind | null {
  const changed = urlChanged || (pixelUnchanged === false) || diff.added.length > 0 || diff.removed.length > 0
  if (!changed) return 'none'
  if (urlChanged) return 'navigation'
  const modalish = diff.added.some((l) => /dialog|modal|弹窗|对话框/i.test(l))
  if (modalish) return 'modal_open'
  const errorish = diff.added.some((l) => /error|失败|报错|异常/i.test(l))
  if (errorish) return 'error'
  if (diff.added.length > 0 && diff.removed.length > 0) return 'content_update'
  if (diff.added.length > 0) return 'content_update'
  return 'toggle_state'
}

export function domLineDiff(before: string[], after: string[]): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  return {
    added: after.filter((l) => !beforeSet.has(l)).slice(0, 40),
    removed: before.filter((l) => !afterSet.has(l)).slice(0, 40),
  }
}

/** S1 实际 vs 预测一致性（语义判词；判定端不可用 → unknown）。 */
export async function oracleVerifyMatch(
  predicted: { willChange: Binary; changeKind: string | null },
  actual: { urlChanged: boolean; pixelUnchanged: boolean | null; diff: { added: string[]; removed: string[] } },
  deps: Pick<OracleDeps, 'config' | 'ask'>,
): Promise<{ matchVerdict: 'match' | 'mismatch' | 'unknown'; visionAttempted: boolean; online: boolean }> {
  // 预测未知 → 无从判"不符"，S1 不比对（判 mismatch 需要一个明确的预测作靶子）
  if (predicted.willChange === 'unknown') {
    return { matchVerdict: 'unknown', visionAttempted: false, online: false }
  }
  const ask = deps.ask
  if (!ask) return { matchVerdict: 'unknown', visionAttempted: false, online: false }
  const state = {
    predicted_change: predicted.willChange === 'yes' ? `有响应（类型：${predicted.changeKind ?? '未判'}）` : predicted.willChange === 'no' ? '无响应' : '未知',
    actual_url_changed: actual.urlChanged,
    actual_pixel_unchanged: actual.pixelUnchanged,
    dom_added: actual.diff.added.slice(0, 20),
    dom_removed: actual.diff.removed.slice(0, 20),
  }
  const questions = {
    response_matches_prediction: { type: 'noul', instructions: '实际页面响应是否与预测一致（响应发生与否及类型大体相符即算一致）？' },
  }
  try {
    const answers = await ask({ model: deps.config.judgeModel, state, questions }, deps.config)
    const p = answers.response_matches_prediction
    if (typeof p !== 'number') return { matchVerdict: 'unknown', visionAttempted: true, online: false }
    const verdict = p >= deps.config.tauYes ? 'match' : p <= deps.config.tauNo ? 'mismatch' : 'unknown'
    return { matchVerdict: verdict, visionAttempted: true, online: true }
  } catch {
    return { matchVerdict: 'unknown', visionAttempted: true, online: false }
  }
}

// ---------- 主流程 ----------

export interface RunOracleOutput {
  verdict: OracleVerdict
  stage1: OracleStage1
  stage2: OracleStage2
  frames: NonNullable<OracleRunRecord['frames']>
}

/**
 * 执行一条 UI Oracle 用例（两阶段）。
 * 失败语义：采集链异常 → 抛错（调用方落 status=failed 记录）；判定端异常 →
 * 全部降级 unknown，不阻塞采集与 S0。
 */
export async function runOracleCase(
  testCase: OracleCase,
  deps: OracleDeps,
): Promise<RunOracleOutput> {
  const now = deps.now ?? Date.now
  const runtimeDeps: OracleDeps = { ...deps, ask: deps.ask ?? defaultOracleAsk }
  const page = await runtimeDeps.browser.newPage(testCase.targetUrl)
  try {
    // ── 消散弹层（更新提示/公告等瞬态蒙版会拦截点击，Esc 两轮仍不散则如实继续） ──
    for (let i = 0; i < 2; i += 1) {
      if (!(await page.dismissOverlay())) break
    }

    // ── 采集 before ──
    const beforeShot = await page.screenshot()
    const beforeProjection = await page.domProjection()
    const beforeUrl = await page.url()
    const beforeSha = sha(beforeShot)

    // ── 定位目标元素（selector 归一化比较——引号形态差异不构成未命中；
    //    未命中 → target=null，预测如实降级 unknown，不拿首元素冒充目标） ──
    const normalizeSelector = (s: string): string => s.replace(/["']/g, '').replace(/\s+/g, '')
    let target: OracleElement | null = null
    let clickSelector: string
    if (testCase.action.selector) {
      clickSelector = testCase.action.selector
      const wanted = normalizeSelector(testCase.action.selector)
      target = beforeProjection.elements.find((e) => normalizeSelector(e.selector) === wanted) ?? null
    } else {
      const idx = testCase.action.somIndex ?? 1
      target = beforeProjection.elements.find((e) => e.index === idx) ?? null
      if (!target) throw new Error(`SoM 序号 ${idx} 不在元素清单内（清单 ${beforeProjection.elements.length} 项）`)
      clickSelector = target.selector
    }

    // ── Stage 1：预测 ──
    const prediction = await oraclePredict(testCase.targetUrl, beforeProjection.elements, target, beforeProjection.lines, runtimeDeps)
    const stage1: OracleStage1 = {
      elementCount: beforeProjection.elements.length,
      target: target ? { index: target.index, tag: target.tag, text: target.text } : null,
      willChange: prediction.willChange,
      changeKind: prediction.changeKind,
      backend: runtimeDeps.config.judgeBaseUrl,
      online: prediction.online,
    }

    // ── 执行动作 ──
    await page.clickSelector(clickSelector)
    await new Promise((resolve) => setTimeout(resolve, 900))

    // ── 采集 after ──
    const afterShot = await page.screenshot()
    const afterProjection = await page.domProjection()
    const afterUrl = await page.url()
    const afterSha = sha(afterShot)

    // ── S0：像素 diff 前置 + DOM diff ──
    const pixelUnchanged = beforeSha === afterSha
    const diff = domLineDiff(beforeProjection.lines, afterProjection.lines)
    const urlChanged = beforeUrl !== afterUrl
    const actualChangeKind = classifyActualChange(urlChanged, pixelUnchanged, diff)

    // ── S1：实际 vs 预测 ──
    const match = await oracleVerifyMatch({ willChange: prediction.willChange, changeKind: prediction.changeKind }, { urlChanged, pixelUnchanged, diff }, runtimeDeps)
    const stage2: OracleStage2 = {
      pixelUnchanged,
      domDiff: diff,
      actualChangeKind,
      matchVerdict: match.matchVerdict,
      visionAttempted: match.visionAttempted,
      online: match.online,
    }

    // ── 判词 ──
    let verdict: OracleVerdict = 'unknown'
    const noActualChange = pixelUnchanged && diff.added.length === 0 && diff.removed.length === 0 && !urlChanged
    if (noActualChange) {
      verdict = prediction.willChange === 'yes' ? 'ui_unresponsive' : prediction.willChange === 'no' ? 'clean' : 'unknown'
    } else if (prediction.willChange === 'no') {
      // 预测无响应而实际有变化（不可预期的副作用）
      verdict = 'mismatch'
    } else if (match.matchVerdict === 'mismatch') {
      verdict = 'mismatch'
    } else if (match.matchVerdict === 'match') {
      verdict = 'clean'
    } else if (actualChangeKind && prediction.changeKind && actualChangeKind === prediction.changeKind) {
      // S1 离线但 S0 分类与预测一致
      verdict = 'clean'
    } else {
      verdict = 'unknown'
    }

    return {
      verdict,
      stage1,
      stage2,
      frames: {
        beforeSha,
        afterSha,
        beforeDomLines: beforeProjection.lines.length,
        afterDomLines: afterProjection.lines.length,
        urlChanged,
      },
    }
  } finally {
    await page.close().catch(() => undefined)
    void now
  }
}
