import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// 采集程序修订守门（2026-11-06 用户令「检查报告中所有截图与章节内容，修订采集程序」）：
// run27 全量核查结论＝33 机检帧 26ok/7bad；7bad 三类根因——
// ①环境性失败被「一败永禁」（testpass/eval 网关停摆窗失败，恢复后三轮重放全跳过）
// ②期望-采集契约缺口（report_view/mp_runtime_proof 期望表有键、无拍摄调用→恒缺帧）
// ③预检裸拍冷启动空态（capture-precheck「未开始/还没有」）
// 另 17 步零变化已由 O3 四态重分类根治（见 frame-four-state.test.ts）。
const HARNESS = resolve(__dirname, '..')

describe('修① 降级守卫有限重试（环境性失败不永禁）', () => {
  const lib = readFileSync(join(HARNESS, 'mux', 'mx-scenario-lib.sh'), 'utf8')
  it('降级分支含三要素：frame-retried 幂等键＋网关健康探测＋每步至多一次', () => {
    expect(lib).toContain('frame-retried-${step}')
    expect(lib).toMatch(/curl -sf -m 2 .*\$\{GW_PORT:-8801\}\/health/)
    expect(lib).toContain('清降级标记重拍一次')
    // 已重试过（键=1）或网关不健康 → 维持跳过（防循环）
    expect(lib).toMatch(/else\s*\n\s*return 0/)
  })
})

describe('修② 收尾补拍 report_view（期望-采集契约缺口）', () => {
  const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
  it('report_view 在 report_done 之后拍摄（深链定位本轮 run）', () => {
    const iDone = sc.indexOf('capture_step "report_done"')
    const iView = sc.indexOf('capture_step "report_view"')
    expect(iDone).toBeGreaterThan(0)
    expect(iView).toBeGreaterThan(iDone)
    expect(sc).toMatch(/capture_step "report_view" "\/app\/sim\?run=\$\{RUN_ID\}"/)
  })
})

describe('修③ 18b 文件域帧条件补拍', () => {
  const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
  it('runtime-proof 在位分支内调用 mp_runtime_proof 文件域帧', () => {
    const i18b = sc.indexOf('runtime-proof 在位且 launchOk=true')
    const iShot = sc.indexOf('capture_step "mp_runtime_proof"')
    expect(i18b).toBeGreaterThan(0)
    expect(iShot).toBeGreaterThan(i18b)
    expect(sc).toMatch(/capture_step "mp_runtime_proof" "file:docs\/evidence\/DEV-MP-runtime-proof\.png"/)
  })
})

describe('修④ 预检拍内容等待', () => {
  const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
  it('capture-precheck 试拍带 --expect（不再裸拍冷启动空态）', () => {
    expect(sc).toMatch(/--step capture-precheck[^\n]*--expect "流程总览"/)
  })
})

describe('期望-采集契约一致性（根治「无主期望」缺口）', () => {
  it('frame-verify 期望表每个键都有采集方（plan 注册/场景调用/file:域）', () => {
    const fv = readFileSync(join(HARNESS, 'mux', 'frame-verify.py'), 'utf8')
    const plan = readFileSync(join(HARNESS, 'mux', 'capture-plan.env'), 'utf8')
    const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
    // 期望键 = EXPECT 步表（'key': {'want'...} 形态）
    const expectKeys = [...fv.matchAll(/^\s+'([\w-]+)':\s*\{'want'/gm)].map((m) => m[1])
    expect(expectKeys.length).toBeGreaterThan(10)  // none/repo 18 键已同步移除，仅真 UI 步留核验
    const orphans: string[] = []
    for (const k of expectKeys) {
      const inPlan = new RegExp(`^${k}\\|`, 'm').test(plan)
      const inScenario = sc.includes(`capture_step "${k}"`) || sc.includes(`--step ${k} `)
      const noneOk = new RegExp(`^${k}\\|none\\|`, 'm').test(plan) // none 步=有意无帧，期望表应同步移除或保留核验？保留（none 不产帧，verify 只核盘上帧）
      if (!inPlan && !inScenario && !noneOk) orphans.push(k)
    }
    // none 步若仍在期望表：帧不在盘时 verify 会记缺——但 plan=none 已声明无帧，
    // 期望表应移除该键（否则永缺）。放宽：none 步允许在期望表（verify 对无帧不核
    // 键级缺帧？实际会核）——严格化：none 步不得留在期望表。
    const noneSteps = [...plan.matchAll(/^([\w-]+)\|none\|/gm)].map((m) => m[1])
    const noneInExpect = noneSteps.filter((k) => expectKeys.includes(k))
    expect(orphans, `无主期望键（无 plan 注册且无场景调用）: ${orphans.join(',')}`).toEqual([])
    expect(noneInExpect, `none 步仍在期望表（将恒缺帧）: ${noneInExpect.join(',')}`).toEqual([])
  })
})
