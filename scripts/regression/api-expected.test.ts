// API 判定口径单测（2026-11-04 Windows 离线回归批，spec 2026-11-04-win-regression-p1-fixes）。
// 判定规则与回归报告「九、复测方法」口径对账：expected=角色门/fail-closed/负向 404/
// 离线依赖/输入校验；FAIL=非预期 5xx/4xx；WARN=>5s。纯函数零 mock。
import { describe, expect, it } from 'vitest'
import { judgeApi, summarizeJudgements, normalizeApiPath, EXPECTED_API_RULES } from './api-expected.mjs'

describe('judgeApi 判定口径', () => {
  it('角色门 403/401 判 expected（回归三：locked-ips/ekko/performance）', () => {
    expect(judgeApi({ path: '/api/auth/locked-ips', status: 403 }).verdict).toBe('expected')
    expect(judgeApi({ path: '/api/ekko/config', status: 403 }).expect).toBe('roleGate')
    expect(judgeApi({ path: '/api/studio/performance/runtime', status: 403 }).expect).toBe('roleGate')
    expect(judgeApi({ path: '/api/agents/status', status: 401 }).expect).toBe('roleGate')
  })

  it('fail-closed 503 判 expected（OBS_SIM_ROOT/ORGLOOP_LEDGER_TSV 未配置）', () => {
    expect(judgeApi({ path: '/api/hermes/sim/topology', status: 503 }).expect).toBe('failClosed')
    expect(judgeApi({ path: '/api/hermes/orgloop/ledger', status: 503 }).expect).toBe('failClosed')
  })

  it('负向用例 404 判 expected（占位资源/注册表未建）', () => {
    expect(judgeApi({ path: '/api/loop/loops/__missing__', status: 404 }).expect).toBe('negative404')
    expect(judgeApi({ path: '/api/governance/registry/daily-setup-signals', status: 404 }).expect).toBe('negative404')
  })

  it('离线外部依赖 5xx 判 expected（announcements/petdex/preview-tags）', () => {
    expect(judgeApi({ path: '/api/studio/announcements', status: 502 }).expect).toBe('offline')
    expect(judgeApi({ path: '/api/studio/petdex/manifest', status: 500 }).expect).toBe('offline')
    expect(judgeApi({ path: '/api/studio/update/preview/tags', status: 502 }).expect).toBe('offline')
  })

  it('探测用例缺参/方法错判 expected:validation（films 400 / providers 405）', () => {
    expect(judgeApi({ path: '/api/studio/films/start', status: 400 }).expect).toBe('validation')
    expect(judgeApi({ path: '/api/hermes/config/providers', status: 405 }).expect).toBe('validation')
  })

  it('非预期 5xx/4xx 判 FAIL，expected 类别外的同路径正常状态不受影响', () => {
    expect(judgeApi({ path: '/api/studio/sessions', status: 500 }).verdict).toBe('FAIL')
    expect(judgeApi({ path: '/api/studio/sessions', status: 418 }).verdict).toBe('FAIL')
    // locked-ips 的 503 不是角色门设计态 → FAIL（规则表精确匹配状态码）
    expect(judgeApi({ path: '/api/auth/locked-ips', status: 503 }).verdict).toBe('FAIL')
    expect(judgeApi({ path: '/api/auth/locked-ips', status: 200 }).verdict).toBe('PASS')
  })

  it('>5s 判 WARN、正常判 PASS（SLOW_MS 阈值单一事实源）', () => {
    expect(judgeApi({ path: '/api/hermes/journey', status: 200, ms: 8700 }).verdict).toBe('WARN')
    expect(judgeApi({ path: '/api/hermes/journey', status: 200, ms: 4999 }).verdict).toBe('PASS')
  })

  it('normalizeApiPath 容忍完整 URL 与 query', () => {
    expect(normalizeApiPath('http://127.0.0.1:8647/api/studio/announcements?locale=zh-CN&x=1'))
      .toBe('/api/studio/announcements')
    expect(normalizeApiPath('/api/studio/petdex/manifest?force=1')).toBe('/api/studio/petdex/manifest')
  })

  it('规则表状态码集合无越界值（4xx/5xx 内）且四类+validation 齐备', () => {
    const classes = new Set(EXPECTED_API_RULES.map(r => r.expect))
    expect([...classes].sort()).toEqual(['failClosed', 'negative404', 'offline', 'roleGate', 'validation'])
    for (const rule of EXPECTED_API_RULES) {
      expect(rule.statuses.every(s => s >= 400 && s < 600), `${rule.expect} 状态码越界`).toBe(true)
    }
  })
})

describe('summarizeJudgements 汇总', () => {
  it('ok 仅当无 FAIL；expected 不计入 pass', () => {
    const summary = summarizeJudgements([
      judgeApi({ path: '/api/auth/locked-ips', status: 403 }),
      judgeApi({ path: '/api/studio/sessions', status: 200 }),
      judgeApi({ path: '/api/hermes/journey', status: 200, ms: 9000 }),
    ])
    expect(summary).toEqual({ total: 3, expected: 1, pass: 1, warn: 1, fail: 0, ok: true })
    const bad = summarizeJudgements([judgeApi({ path: '/api/studio/sessions', status: 500 })])
    expect(bad.ok).toBe(false)
  })
})
