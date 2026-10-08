/**
 * PART1 人读导读层骨架（方案 §5.4 公文五段式模板——正本自 simharness
 * mx-narrative-skeleton.py --part1 移植，2026-10-08 落地产品侧）。
 *
 * 纪律：数字一律实算（调用方从本轮 state/issues.log/帧清单算出 RunFacts 传入），
 * 人工只写语境句——骨架里全部留【TODO】标记并附三问自检（判断句？带锚？人话？）。
 * {{run_id}}/{{n_frames}}/{{uniq_note}}/{{ch0}} 为合并层实时替换槽，保持原样。
 */

export interface RunFacts {
  runId: string
  rfd: string
  /** 起止窗口文案，如 "10-07 01:21 → 10-07 14:29（约 13.1 小时）" */
  windowText: string
  /** 特性旗标实抽文案（如 "MX_FAST=1, MX_DELIVERY=1"），无则 "无特殊旗标" */
  featureFlags: string
  stepsDone: number
  gatesPassed: number
  /** 首过数（issues.log 无该闸 gN- 前缀记单且闸已落键） */
  firstPass: number
  issuesTotal: number
  disp: { 已修: number; 观察: number; 延后: number }
  /** 问题类型分布 TOP 文案（如 "raci×4、anexec×3"），零问题单则 "零问题单" */
  typeTop: string
}

export function part1Skeleton(f: RunFacts): string {
  const dispSum = `已修 ${f.disp['已修']}，观察 ${f.disp['观察']}，延后 ${f.disp['延后']}`
  return `<div class="guide" style="background:#fbfbfa;padding:6px 0 20px">

<h1 style="font-size:24px"> PART 1 · 一页读懂（说人话版）Swarm Studio 多智能体研发推演 · 最终报告<br><span class="sub">RUN={{run_id}} ｜ 任务：${f.rfd} ｜ ${f.windowText}</span></h1>

<div class="card info"><b>这场推演在验证什么：</b>【TODO 一句】（特性旗标实抽：${f.featureFlags}）</div>

<div class="card ok"><b>本轮的诚实结论：</b>26 步 ${f.stepsDone}/26 落键；六闸 ${f.gatesPassed}/6 过，首过 ${f.firstPass}/6（实算自 issues.log 闸键记单）；问题单 ${f.issuesTotal} 项（DISP：${dispSum}）。【TODO 两句：UAT 逐条判词汇总一句+最大的非粉饰事实一句】</div>

<div class="card warn"><b>真实发生的缺口（全部记单在案）：</b>【TODO 3-6 条，每条带问题单键】（类型分布实抽：${f.typeTop}）</div>

<div class="card info"><b>怎么读这份报告：</b>PART 2 是 26 步逐步档案（{{n_frames}} 张实拍界面帧 {{uniq_note}}）；每步四段=本轮实录/交付物真容+模板核对/已知问题/处置与改进；全部计数自 issues.log 与 state.env 实算，取不到显式 ⬜。</div>

<h2>研发全流程治理有效性（实算）</h2>
{{ch0}}
`
}
