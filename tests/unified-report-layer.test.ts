import { describe, it, beforeAll, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdirSync, writeFileSync, existsSync, readFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// 二合一报告层守门（2026-10-09 提速轮）：生成器对最小 fixture 可跑、三产物结构完整。
// fixture 在 beforeAll 内嵌生成（不依赖在架轮次）；生成器=subprocess（Python3 标准库实现）。
// 2026-10-18 隔离根治：夹具落临时目录——此前在 tests/fixtures/ 就地重建，每次跑
// 套件都改写已提交基线（unified-report.html/roadshow-outline.md 再生），工作树常脏。
const HARNESS = join(__dirname, '..')
const FIX = mkdtempSync(join(tmpdir(), 'unified-mini-'))
const RUN = 'fixture-run'

beforeAll(() => {
  const ev = join(FIX, 'runs', RUN, 'evidence')
  mkdirSync(ev, { recursive: true })
  // state.env：门禁键部分在位（覆盖"六闸落键 N 道"实算路径）
  writeFileSync(join(FIX, 'runs', RUN, 'state.env'), [
    'run_started_at=1791400000', 'report_done=1791430000', 'g1_frozen=1', 'g2_arch_pass=1791410000',
    'g3_code_pass=1791420000', 'anexec_done=1', 'devimpl_done=1',
  ].join('\n'), 'utf8')
  // issues.log：三类问题单+一条 DISP（覆盖分类计数与受众归属路径）
  writeFileSync(join(ev, 'issues.log'), [
    'ISSUE|receipt-missing|AN-X|完成回执未见（fixture）',
    'ISSUE|g3-local-gate-missing|DEV-X|分支缺 testlog（fixture）',
    'ISSUE|frame-capture-failed|step-x|采集失败（fixture）',
    'DISP|design-push-gap|fanfan|已修（fixture）',
  ].join('\n'), 'utf8')
  // r18-steps.json：两个呈现步（覆盖 steps 解析与计数路径）
  writeFileSync(join(ev, 'r18-steps.json'), JSON.stringify({
    _schema: 1,
    steps: {
      '11': { dialogs: [{ title: '步11 fixture 对话', room: '!x:matrix.test', anchor: '$a', messages: [] }] },
      '18': { frames: ['a.png', 'b.png'] },
    },
  }), 'utf8')
  // scenario.log：计数代理指标
  writeFileSync(join(ev, 'scenario.log'), [
    '[mux] [chen] 线程内回复 !approve（fixture）', '[mux] [xiao] 派发（fixture）', '[mux] 【缺陷】fixture 缺陷行',
  ].join('\n'), 'utf8')
  execFileSync('python3', [join(HARNESS, 'mux', 'unified-report-layer.py'), '--run', RUN, '--sim-root', FIX], { encoding: 'utf8' })
})

describe('二合一报告层（unified-report-layer）', () => {
  const out = join(FIX, 'runs', RUN, 'unified')

  it('三产物落盘：audience-cards / roadshow-outline / unified-report', () => {
    for (const n of ['audience-cards.html', 'roadshow-outline.md', 'unified-report.html']) {
      expect(existsSync(join(out, n)), n).toBe(true)
    }
  })

  it('受众卡：8 视角齐且每卡含问题标题+判断句+数据锚+证据指针', () => {
    const s = readFileSync(join(out, 'audience-cards.html'), 'utf8')
    for (const label of ['产品视角', '需求分析视角', '架构设计视角', '研发设计视角', '代码开发视角', '测试视角', '研发管理视角', '平台视角']) {
      expect(s).toContain(label)
    }
    expect(s).toContain('数据锚：')
    expect(s).toContain('证据：')
    expect(s).toContain('六闸落键') // 判断句实算路径在场
  })

  it('路演大纲：≥10 块且每块 headline/points/anchor 三字段', () => {
    const s = readFileSync(join(out, 'roadshow-outline.md'), 'utf8')
    const blocks = s.split(/^## /m).slice(1)
    expect(blocks.length).toBeGreaterThanOrEqual(10)
    for (const b of blocks) {
      expect(b, b.slice(0, 20)).toContain('headline:')
      expect(b).toContain('points:')
      expect(b).toContain('anchor:')
    }
  })

  it('主报告：受众导航+完整审阅层+路演素材层+问题台账在场', () => {
    const s = readFileSync(join(out, 'unified-report.html'), 'utf8')
    expect(s).toContain('受众速览')
    expect(s).toContain('完整审阅层')
    expect(s).toContain('路演素材层')
    expect(s).toContain('问题台账')
    expect(s).toContain('receipt-missing') // 台账实算含 fixture 问题单
  })
})
