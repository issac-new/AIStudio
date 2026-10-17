import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

// 评测门禁三方同步守门（2026-10-13 腾讯评测体系轮，方案 V8.22 §2.6.3）：
// test-report 模板评测节 / spec-params.env 阈值组 / mx-report-gen.py 步 19 核对正则 /
// prelaunch ⑭——四处同步位只修一处=下次生成复发（步 20 模板↔产物双向同步纪律的评测面）。
const HARNESS = join(__dirname, '..')

function read(rel: string): string {
  return readFileSync(join(HARNESS, rel), 'utf8')
}

describe('评测门禁四方同步（模板/参数/生成器/预检）', () => {
  it('test-report 模板：评测节在场且判定三态与未发起语义齐备', () => {
    const tpl = read('mux/templates-pending/test-report.md')
    expect(tpl).toContain('## 8. 评测与运行时指标')
    expect(tpl).toContain('本轮未发起评测')
    expect(tpl).toContain('工具调用成功率')
    expect(tpl).toContain('P99/均值耗时比')
    expect(tpl).toContain('降级率')
    expect(tpl).toContain('证据缺口')
    expect(tpl).toContain('工具选择正确率')
    expect(tpl).toContain('轨迹绕路比')
    expect(tpl).toContain('六环节分段通过率')
    expect(tpl).toContain('异常场景分桶')
    // 机械判据节顺延为 §9 且含评测三判据
    expect(tpl).toContain('## 9. 机械核对判据')
    expect(tpl).toMatch(/8 \| 评测节在场/)
    expect(tpl).toMatch(/9 \| 评测门禁行判定三态合法/)
    expect(tpl).toMatch(/10 \| 评测数字带源/)
  })

  it('spec-params.env：EVAL_GATE 阈值组四行在位（照抄腾讯 ADP 公开清单口径）', () => {
    const env = read('mux/spec-params.env')
    for (const key of ['EVAL_GATE_TOOL_SUCCESS_MIN', 'EVAL_GATE_P99_RATIO_MAX', 'EVAL_GATE_DEGRADE_RATE_MAX', 'EVAL_GATE_TTFT_MS']) {
      expect(env).toContain(key)
    }
    expect(env).toContain('≥ 99%')
    expect(env).toContain('≤ 2×')
    expect(env).toContain('< 0.5%')
    expect(env).toContain('≤ 1.5s')
    for (const line of env.split('\n').filter(l => l.trim() && !l.startsWith('#'))) {
      expect(line.split('|')).toHaveLength(4)
    }
  })

  it('mx-report-gen.py：步 19 核对正则含评测三增项且可编译', () => {
    const gen = read('mux/mx-report-gen.py')
    expect(gen).toContain("('评测节在场（未发起须写明）', r'评测与运行时指标|本轮未发起评测')")
    expect(gen).toContain("('评测门禁判定三态', r'证据缺口|不过')")
    expect(gen).toContain("('过程双指标行', r'工具选择正确率|轨迹绕路')")
    expect(gen).toContain('V8.22 增项')
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-report-gen.py')])
  })

  it('mx-prelaunch-check.sh：⑭ 评测门禁三方同步项在位且语法可过', () => {
    const sh = read('mux/mx-prelaunch-check.sh')
    expect(sh).toContain('⑭ 评测门禁三方同步')
    expect(sh).toContain('评测与运行时指标')
    expect(sh).toContain('EVAL_GATE_TOOL_SUCCESS_MIN')
    expect(sh).toContain('eval-metrics')
    expect(sh).toContain('十九项')  // V8.29 治理轮加 ⑯ 代偿清偿门——十五→十六；十六→十九=⑰ 监督器健康+⑱ 报告真值三件套（run20 复盘）+⑲ 产品 IA 版本（V8.37 产品功能同步批 2026-10-17，纪律 75 挂钩）
    execFileSync('bash', ['-n', join(HARNESS, 'mux', 'mx-prelaunch-check.sh')])
  })

  it('mx-load-probe 压测探针在库可编译且判据三件齐', () => {
    const probe = read('mux/mx-load-probe.py')
    expect(probe).toContain('error_rate_lt_1pct')
    expect(probe).toContain('achieved_qps_ge_90pct')
    expect(probe).toContain('p99_le_2x_p50')
    execFileSync('python3', ['-m', 'py_compile', join(HARNESS, 'mux', 'mx-load-probe.py')])
    const env = read('mux/spec-params.env')
    expect(env).toContain('mx-load-probe')
    const tpl = read('mux/templates-pending/test-report.md')
    expect(tpl).toContain('mx-load-probe 结论行原文')
  })

  it('templates-pending README：评测指标节同步位说明在位', () => {
    const readme = read('mux/templates-pending/README.md')
    expect(readme).toContain('评测指标节（2026-10-13')
    expect(readme).toContain('eval-metrics-template-sync.test.ts')
  })
})
