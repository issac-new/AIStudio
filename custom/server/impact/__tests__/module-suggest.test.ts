// B1（挂账清偿批）守门：LLM 拆模块——判定端不可用回落词表（fail-open 不装成功）、
// 应答解析（词面约束过滤/围栏容忍/空回落）、模块 id 词表校验。
import { afterEach, describe, expect, it } from 'vitest'
import { suggestModules } from '../module-suggest'

// 判定端默认 127.0.0.1:8000——本机无服务时 clef 抛 JudgeUnavailableError（fail-open 路径）
afterEach(() => { delete process.env.EVAL_JUDGE_BASE_URL })

describe('suggestModules（fail-open 回落）', () => {
  it('判定端不可用 → 词表推导（modulesSource=fallback，如实带原因）', async () => {
    process.env.EVAL_JUDGE_BASE_URL = 'http://127.0.0.1:59999'
    const r = await suggestModules('收银台改版', '微信支付收银台支持退款')
    expect(r.online).toBe(false)
    expect(r.modulesSource).toBe('fallback')
    expect(r.reason).toContain('回落词表')
    expect(r.modules).toContain('pay-core')
    expect(r.modules.length).toBeGreaterThan(0)
  })
})
