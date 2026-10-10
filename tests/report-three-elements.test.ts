import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

// 报告三要素守门（2026-10-10 改造轮）：①PART1 治理有效性实测统计表实算（旧版空标题根治）
// ②关键技术规范参数卡（spec-params.env 单一事实源）③问题单表频次+级别列
// ④RACI 时序去重（PART1 精简、PART2 全量）⑤双闭合/ guide 双嵌套结构 bug 修复。
// 夹具内嵌自持（run12 形态——jargon 门禁阈值前的轮次，不依赖在架轮次与词表路径）。
const HARNESS = join(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'report-three-elements')
const NOW = Math.floor(Date.now() / 1000)

beforeAll(() => {
  rmSync(FIX, { recursive: true, force: true })
  const run = '20261009-v8-run12'
  const ev = join(FIX, 'runs', run, 'evidence')
  mkdirSync(ev, { recursive: true })
  writeFileSync(join(FIX, 'runs', run, 'state.env'),
    `run_started_at=${NOW - 3600}\ng1_frozen=${NOW - 3500}\ng2_arch_pass=${NOW - 3400}\n` +
    `g3_code_pass=${NOW - 3000}\ng4_pass=${NOW - 2500}\ng5_ready=${NOW - 2000}\nretro_done=${NOW - 100}\n` +
    `smoke_done=1\ndevimpl_done=1\ndefect_done=1\ntestpass_done=1\nready_done=1\nrelease_done=1\nuat_done=1\nreport_done=${NOW}\n`, 'utf8')
  // 频次可断言：同一唯一键 g5-ready-fail·harness 出现 3 次（gate-breaker 类高频键的最小化）
  writeFileSync(join(ev, 'issues.log'), [
    `ISSUE|g5-ready-fail|harness|第一次打回`,
    `ISSUE|g5-ready-fail|harness|第二次打回`,
    `ISSUE|g5-ready-fail|harness|第三次打回`,
    `ISSUE|frame-capture-failed|step22|帧缺失`,
    `ISSUE|capacity-queue-drop|devimpl|丢件`,
    `DISP|g5-ready-fail|harness|已修：修复锚点 abc1234`,
    `DISP|frame-capture-failed|step22|观察`,
    `DISP|capacity-queue-drop|devimpl|已修：并发定标 30`,
  ].join('\n'), 'utf8')
  writeFileSync(join(ev, 'simulation-report.html'),
    '<html><head><style>.x{}</style></head><body>' +
    '<nav class="sidebar"><a href="#step1">1</a></nav>' +
    '<main class="main"><h2 class="section-hd" id="ch8-issues">第 8 章 · 问题单终态</h2>' +
    '<table><tr><th>x</th></tr><tr><td>机器明细</td></tr></table>' +
    '<p class="st-story">步叙事一行。</p></main></body></html>', 'utf8')
})

function runMerge(): string {
  const r = spawnSync('python3', [join(HARNESS, 'mux', 'final-report-merge.py'), '--run', '20261009-v8-run12'], {
    encoding: 'utf8', env: { ...process.env, AIPAY_SIM_ROOT: FIX },
  })
  expect(r.status, `merge 失败:\n${r.stderr}`).toBe(0)
  return readFileSync(join(FIX, 'runs/20261009-v8-run12/evidence/final-report.html'), 'utf8')
}

describe('报告三要素·PART1 实测统计表（空标题根治）', () => {
  it('part1-metrics 节含三列实算表：完成度/六闸/台账/帧全部有数', () => {
    const out = runMerge()
    expect(out).toContain('id="part1-metrics"')
    expect(out).toContain('id="metrics-tbl"')
    expect(out).toContain('治理维度')
    expect(out).toContain('26 步 ')
    expect(out).toContain('一次通过 ')
    expect(out).toContain('证据帧')
    expect(out).toContain('口径来源')
    // 空标题病根断言：metrics h2 与第 0 章 h2 之间必须有表格内容，不允许直接相顶
    const metricsAt = out.indexOf('id="part1-metrics"')
    const ch0At = out.indexOf('id="ch0-collab"')
    expect(ch0At).toBeGreaterThan(metricsAt)
    expect(out.slice(metricsAt, ch0At)).toContain('<table')
  })

  it('六闸打回分布来自闸键实查（fixture 三次 g5 打回 → G5×3）', () => {
    const out = runMerge()
    expect(out).toContain('G5×3')
  })
})

describe('报告三要素·技术规范参数卡', () => {
  it('spec-params.env 单一事实源：≥18 行四段、关键值在位', () => {
    const env = readFileSync(join(HARNESS, 'mux', 'spec-params.env'), 'utf8')
    const rows = env.split('\n').filter(l => l.trim() && !l.startsWith('#'))
    expect(rows.length).toBeGreaterThanOrEqual(18)
    for (const r of rows) expect(r.split('|')).toHaveLength(4)
    expect(env).toContain(':8801')
    expect(env).toContain(':8802')
    expect(env).toContain('5400s')
    expect(env).toContain('≥8')
  })

  it('PART1 与机器报告侧都挂参数卡（spec_params_html 双消费）', () => {
    const out = runMerge()
    expect(out).toContain('id="spec-params"')
    expect(out).toContain(':8801')
    const genSrc = readFileSync(join(HARNESS, 'mux', 'mx-report-gen.py'), 'utf8')
    expect(genSrc).toContain('spec_params_html()')
  })
})

describe('报告三要素·问题单频次与级别列', () => {
  it('生成器表头五列（频次/级别在位）与级别派生函数在源在位', () => {
    const genSrc = readFileSync(join(HARNESS, 'mux', 'mx-report-gen.py'), 'utf8')
    expect(genSrc).toContain('<th>类型·主体</th><th>频次</th><th>级别</th>')
    expect(genSrc).toContain("def _issue_level(t):")
    expect(genSrc).toContain('colspan="5"')
    // 级别派生与审计闸键正则同源（防两处判定漂移）
    expect(genSrc).toContain("re.match(r'^(g[1-6])[-_]', t)")
  })
})

describe('RACI 时序去重（PART1 精简 / PART2 全量）', () => {
  it('PART1 侧时序=精简视图+指针，不再发全量折叠表', () => {
    const out = runMerge()
    const part1 = out.slice(0, out.indexOf('id="part2"'))
    const part2 = out.slice(out.indexOf('id="part2"'))
    // 本夹具无 scenario.log 且机器报告为手写最小件（无第 0 章）：
    // PART1 侧如实缺位、绝不渲染全量折叠表；PART2 侧不出现精简指针
    expect(part1).toContain('无可解析协作事件')
    expect(part1).not.toContain('展开协作时序全表')
    expect(part2).not.toContain('人读层精简视图')
  })

  it('render_chapter0 compact 参数双向可用（python 直调·带时序数据）', () => {
    const py = [
      'import sys, json, tempfile, pathlib',
      `sys.path.insert(0, ${JSON.stringify(join(HARNESS, 'mux'))})`,
      'from report_narrative import render_chapter0',
      'd = pathlib.Path(tempfile.mkdtemp())',
      "(d / 'scenario.log').write_text(",
      "  '\\n'.join(f'[mux 09:{i:02d}:00] [fanfan] 派发事件锚 $ev{i}' for i in range(50)),",
      "  encoding='utf-8')",
      "full = render_chapter0({}, d, steps_dir=None, compact=False)",
      "slim = render_chapter0({}, d, steps_dir=None, compact=True)",
      "print(json.dumps({'full_tbl': '展开协作时序全表' in full,",
      "  'full_rows': full.count('$ev'), 'slim_pointer': '人读层精简视图' in slim,",
      "  'slim_no_full_tbl': '展开协作时序全表' not in slim, 'slim_rows': slim.count('$ev')}))",
    ].join('\n')
    const r = execFileSync('python3', ['-c', py], { encoding: 'utf8' })
    const parsed = JSON.parse(r.trim().split('\n').pop())
    expect(parsed.full_tbl).toBe(true)          // 全量分支：折叠全表 + 50 行
    expect(parsed.full_rows).toBe(50)
    expect(parsed.slim_pointer).toBe(true)      // 精简分支：指针 + 只保留前 40 行
    expect(parsed.slim_no_full_tbl).toBe(true)
    expect(parsed.slim_rows).toBe(40)
  })
})

describe('合并器结构 bug 修复', () => {
  it('文档单一闭合（双闭合残缺根治）', () => {
    const out = runMerge()
    expect(out.match(/<\/body>/g)?.length).toBe(1)
    expect(out.match(/<\/html>/g)?.length).toBe(1)
    expect(out).not.toContain('</html\n')
  })

  it('part1-top id 唯一（guide 双层嵌套根治）', () => {
    const out = runMerge()
    expect(out.match(/id="part1-top"/g)?.length).toBe(1)
  })
})
