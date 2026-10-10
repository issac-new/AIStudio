import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// V8.4 证据纪律守门（2026-10-10 接线轮）：审计器帧四断言（①图注=画面描述 A5g /
// ②同源帧单用途 A5d / ④b 补拍标记禁入 A5g；③窗口+④占位配对=A5e/f，正夹具覆盖不误杀）+
// 合并器折叠附录 / 人读层 jargon 体检。夹具内嵌自持，不依赖在架轮次。
// 负向验收基准=run12 真数据（g1_frozen 双嵌 / "freeze 在仓"图注 / 38 处补拍标记——
// 已手工实跑逮住，本文件为其可回归的最小化固化）。
const HARNESS = join(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'v84-gates')
const NOW = Math.floor(Date.now() / 1000)

function buildRun(run: string, rep: string, issues: string, r18: unknown) {
  const ev = join(FIX, 'runs', run, 'evidence')
  const steps = join(ev, 'screenshots', 'steps')
  mkdirSync(steps, { recursive: true })
  writeFileSync(join(FIX, 'runs', run, 'state.env'),
    `run_started_at=${NOW - 3600}\nreport_done=${NOW}\n`, 'utf8')
  writeFileSync(join(ev, 'issues.log'), issues, 'utf8')
  writeFileSync(join(ev, 'r18-steps.json'), JSON.stringify({ _schema: 1, steps: r18 }), 'utf8')
  writeFileSync(join(ev, 'simulation-report.html'), rep, 'utf8')
  return steps
}

function fakePng(dir: string, name: string, salt: string) {
  // >10KB（审计器查 4 空图下限）且内容互异（md5 假重复）
  writeFileSync(join(dir, name), Buffer.from(salt).subarray(0, 8).toString('hex').padEnd(11000, salt[0]))
}

function runAudit(run: string) {
  return spawnSync('python3', [join(HARNESS, 'mux', 'mx-report-audit.py'), '--run', run], {
    encoding: 'utf8', env: { ...process.env, AIPAY_SIM_ROOT: FIX },
  })
}

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true })

  // 负向：步结果式图注 + 同源双嵌 + 补拍标记，三病同炉（run12 病灶最小化）
  const negSteps = buildRun(
    '20261010-v8-run13neg',
    `<body><main class="main"><article class="step" id="step20">
<span class="st-num">20</span><div class="st-title"><h3>发布准出</h3></div><span class="ok">✅</span>
<figure><img src="screenshots/steps/20-op1-before.png" alt=""><figcaption><span class="shot-kind">界面实拍</span>发布面板·前</figcaption></figure>
<figure><img src="screenshots/steps/20-op1-after.png" alt=""><figcaption><span class="shot-kind">界面实拍</span>G6 落键</figcaption></figure>
<figure><img src="screenshots/steps/20-op1-after.png" alt="收官后补拍"><figcaption><span class="shot-kind">界面实拍</span>发布面板·后</figcaption></figure>
</article></main></body>`,
    `ISSUE|frame-capture-failed|step-20-op2|fixture\nDISP|frame-capture-failed|x|已修\n`,
    { 20: { ops: [{ title: '发布面板', entry: '/app', frames: ['20-op1-before.png', '20-op1-after.png'], ts: NOW - 1800 }] } },
  )
  fakePng(negSteps, '20-op1-before.png', 'before-frame-aaaaaaaa')
  fakePng(negSteps, '20-op1-after.png', 'after-frame-bbbbbbbb')

  // 正向：画面描述图注 + 单一用途 + 带记录带 ts + 无补拍标记——V8.4 断言零误杀
  const posSteps = buildRun(
    '20261010-v8-run13pos',
    `<body><main class="main"><article class="step" id="step20">
<span class="st-num">20</span><div class="st-title"><h3>发布准出</h3></div><span class="ok">✅</span>
<figure><img src="screenshots/steps/20-op1-before.png" alt=""><figcaption><span class="shot-kind">界面实拍</span>发布面板·前</figcaption></figure>
<figure><img src="screenshots/steps/20-op1-after.png" alt=""><figcaption><span class="shot-kind">界面实拍</span>发布面板·后</figcaption></figure>
</article></main></body>`,
    `ISSUE|fixture-none|x|fixture\nDISP|fixture-none|x|已修\n`,
    { 20: { ops: [{ title: '发布面板', entry: '/app', frames: ['20-op1-before.png', '20-op1-after.png'], ts: NOW - 1800 }] } },
  )
  fakePng(posSteps, '20-op1-before.png', 'good-before-cccccc')
  fakePng(posSteps, '20-op1-after.png', 'good-after-dddddd')
})

describe('V8.4 帧四断言（审计器）', () => {
  it('负向：①步结果式图注 / ②同源双嵌 / ④b 补拍标记，三断言齐咬', () => {
    const r = runAudit('20261010-v8-run13neg')
    const out = r.stdout + r.stderr
    expect(r.status, out.slice(0, 400)).toBe(1)
    expect(out).toContain('V8.4① 图注非画面描述')
    expect(out).toContain('「G6 落键」步结果式')
    expect(out).toContain('V8.4② 同源帧多用途')
    expect(out).toContain('V8.4④ 补拍禁入')
  })

  it('正向：画面描述图注+单一用途+记录在案 → V8.4 断言零误杀', () => {
    const r = runAudit('20261010-v8-run13pos')
    const out = r.stdout + r.stderr
    expect(out, out.slice(0, 400)).not.toMatch(/V8\.4[①②③④]/)
  })
})

describe('V8.4 合并器（折叠附录 + jargon 体检）', () => {
  const drive = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('frm', ${JSON.stringify(join(HARNESS, 'mux', 'final-report-merge.py'))})
frm = importlib.util.module_from_spec(spec); spec.loader.exec_module(frm)
fold_out, fold_n = frm.fold_machine_appendix(
    '<h2 id="ch8-issues">第 8 章</h2><p>汇总</p>'
    '<table class="iss"><tr><td>ISSUE|a|b|c</td></tr></table><h2 id="ch9">第 9 章</h2>', 1)
print(json.dumps({
  'gate_bad': frm.jargon_gate('这一步先守门再齐发把台账灌满。'),
  'gate_ok': frm.jargon_gate('把需求冻结件合入主干，测试全数通过后发布。'),
  'gate_gloss': frm.jargon_gate('收到回执（消息送达确认标识）一枚。'),
  'fold_n': fold_n,
  'fold_kept': 'ISSUE|a|b|c' in fold_out and '<h2 id="ch9">' in fold_out,
  'fold_collapsed': 'machine-appendix' in fold_out,
}, ensure_ascii=False))
`
  let res: Record<string, unknown>
  beforeAll(() => {
    res = JSON.parse(execFileSync('python3', ['-c', drive], { encoding: 'utf8' }))
  })

  it('jargon 体检：HARD 词命中，合规句与括注豁免句零误报', () => {
    expect((res.gate_bad as unknown[]).length).toBeGreaterThan(0)
    expect(res.gate_ok).toEqual([])
    expect(res.gate_gloss).toEqual([]) // 括注=gloss 释义位，豁免
  })

  it('折叠附录：台账全量在位且默认收起（折叠≠裁剪）', () => {
    expect(res.fold_n).toBe(1)
    expect(res.fold_kept).toBe(true)
    expect(res.fold_collapsed).toBe(true)
  })
})
