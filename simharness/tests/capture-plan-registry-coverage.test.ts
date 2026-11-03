// capture-plan-registry-coverage.test.ts — 采集面注册对账守门（run25 收官后补流批，2026-11-03）
// 根因链（spec docs/superpowers/specs/2026-11-03-run25-collection-gaps-backfill.md）：
//   ① 驱动 capture_step 调用集与注册表无对账——dispatch_done/report_done 驱动已调用但
//      未注册，run25 两步零帧（r18-steps.json 步9 无 op、步26 仅 report_view）。
//   ② 小程序 UI 零呈现——方案 §2.5 步18b 已声明 runtime-verify 面、产品端点已就位、
//      技能已强制，但注册表无文件域呈现位语义，报告不消费仓内 runtime-proof 产物。
//   ③ evidence-push 失败只落 issues.log，收尾链自动归桶「观察」埋掉 → 缺件无人补。
// 本守门把三处断言机械化，防复发。
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('..', import.meta.url).pathname
const PLAN = readFileSync(`${ROOT}mux/capture-plan.env`, 'utf-8')
const DRIVER = readFileSync(`${ROOT}aipay-scenario.sh`, 'utf-8')
const FRAME_VERIFY = readFileSync(`${ROOT}mux/frame-verify.py`, 'utf-8')

// 注册键：非注释、非空行，取 | 前段（文件域呈现位 file: 形态同此解析）
function registryKeys(plan: string): Map<string, string> {
  const m = new Map<string, string>()
  for (const ln of plan.split('\n')) {
    const t = ln.trim()
    if (!t || t.startsWith('#')) continue
    const body = t.replace(/\s+#.*$/, '')
    const [k, u] = body.split('|')
    if (k && k.trim() && u && u.trim()) m.set(k.trim(), u.trim())
  }
  return m
}

// 驱动调用键：capture_step "<key>" 全量
function driverCalls(src: string): Set<string> {
  return new Set([...src.matchAll(/capture_step "([^"]+)"/g)].map((x) => x[1]))
}

// frame-verify EXPECT 投影键（'键': {'want': …} 形态；'26' 数字键例外）
function expectKeys(src: string): Set<string> {
  return new Set([...src.matchAll(/^\s+'([A-Za-z0-9_]+)':\s*\{'want'/gm)].map((x) => x[1]))
}

describe('capture-plan 注册表覆盖对账（D1/D2 根治）', () => {
  it('驱动 capture_step 调用集 ⊆ 注册表（含平台位与三态 none 位）', () => {
    const calls = driverCalls(DRIVER)
    const reg = registryKeys(PLAN)
    expect(calls.size).toBeGreaterThan(20) // 驱动在册调用基线（26 步主链）
    const missing = [...calls].filter((k) => !reg.has(k))
    expect(missing, `驱动调用未注册：${missing.join('、')}`).toEqual([])
  })

  it('run25 补流三键在位（dispatch_done / report_done / mp_runtime_proof）', () => {
    const reg = registryKeys(PLAN)
    expect(reg.has('dispatch_done')).toBe(true)
    expect(reg.has('report_done')).toBe(true)
    const mp = reg.get('mp_runtime_proof') ?? ''
    expect(mp.startsWith('file:'), 'mp_runtime_proof 须为 file: 文件域呈现位').toBe(true)
  })

  it('frame-verify EXPECT 与注册表投影同步（改拍摄位须同步期望词）', () => {
    const reg = registryKeys(PLAN)
    const exp = expectKeys(FRAME_VERIFY)
    // 注册表平台位（url 形态）逐键须有 EXPECT 投影；文件域位与 '26' 类特殊键同样要求
    const missing = [...reg.keys()].filter((k) => !exp.has(k))
    expect(missing, `注册键缺 frame-verify EXPECT 投影：${missing.join('、')}`).toEqual([])
  })
})

describe('缺件不埋桶（A2 根治）', () => {
  it('evidence-push 失败分支 5 行内登记 pending-backfill.tsv', () => {
    const lines = DRIVER.split('\n')
    const hits: number[] = []
    lines.forEach((l, i) => {
      if (/ISSUE\|evidence-push\|/.test(l)) hits.push(i)
    })
    expect(hits.length).toBeGreaterThanOrEqual(1)
    for (const i of hits) {
      const window = lines.slice(i, i + 6).join('\n')
      expect(
        /pending-backfill\.tsv/.test(window),
        `第 ${i + 1} 行 evidence-push 失败分支缺 pending-backfill.tsv 登记（自动归桶埋缺件复发）`,
      ).toBe(true)
    }
  })
})

describe('runtime-proof 呈现面（C1/C3 根治）', () => {
  it('注册表文件域呈现位行注释锚定消费方与守门', () => {
    expect(PLAN).toMatch(/mp_runtime_proof\|file:/)
    expect(PLAN).toMatch(/18b/)
  })

  it('技能面 run15 起强制未被洗掉（aipaydev-dev SKILL 前端工程交付须 runtime-proof）', () => {
    const skill = readFileSync(`${ROOT}skills/aipaydev-dev/SKILL.md`, 'utf-8')
    expect(skill).toMatch(/runtime-proof/)
    expect(skill).toMatch(/目标运行时自证/)
  })
})

describe('18b 目标运行时验证面接线（run26 N10）', () => {
  it('驱动 devimpl 段含 runtime-proof fail-soft 核验（缺席登记 runtime-proof-missing 不阻断）', () => {
    expect(DRIVER).toMatch(/runtime-proof-missing/)
    expect(DRIVER).toMatch(/DEV-MP-runtime-proof\.json/)
    // fail-soft 语义：核验失败只落 issues.log，不进 gate_blocked/exit 路径
    const seg = DRIVER.slice(DRIVER.indexOf('18b 目标运行时验证面核验'), DRIVER.indexOf('18b 目标运行时验证面核验') + 900)
    expect(seg).toMatch(/issues\.log/)
    expect(seg).not.toMatch(/gate_blocked|process exit|熔断/)
  })

  it('prelaunch 含 runtime-verify 探针（fail-soft 双通道：CLI 在位+端点可达）', () => {
    const pre = readFileSync(`${ROOT}mux/mx-prelaunch-check.sh`, 'utf-8')
    expect(pre).toMatch(/runtime-verify 探针/)
    expect(pre).toMatch(/wechatwebdevtools/)
    expect(pre).toMatch(/不阻断/)
  })
})
