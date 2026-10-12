// overlay/custom/client/ia2/__tests__/gov-session-health-compaction.test.ts
// SoL-Pi 效能轮②守门：会话健康表渲染压缩档位列（服务端投影字段直渲染，
// under/soon/now 三档与缺省占位）。档位计算本身在 clusterinspector 域单测覆盖，
// 此处只验 UI 消费面（mock /api/hermes/cluster-inspector/snapshot）。
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import GovSessionHealthSection from '../views/gov/GovSessionHealthSection.vue'

const nowSec = Date.now() / 1000

function snapWith(entries: Array<Record<string, unknown>>) {
  return {
    snapshot: { sessionTelemetry: { entries } },
    anomalies: [],
  }
}

const request = vi.fn()
vi.mock('@/api/client', () => ({ request: (...a: unknown[]) => request(...a) }))

describe('GovSessionHealthSection 压缩档位列', () => {
  it('三档齐全：now/soon/under 各渲染为立即/临近/充裕；缺投影渲染占位', async () => {
    request.mockResolvedValue(snapWith([
      { sessionKey: 's-now', tsMs: Date.now() - 5_000, platform: 'matrix', model: 'm1', watermarkPct: 95,
        cumApiCalls: 10, turns: 3, emptyStreak: 0,
        compaction: { level: 'now', triggerTokens: 163_627, headroomTokens: -26_373, reserveTokens: 18_192 } },
      { sessionKey: 's-soon', tsMs: Date.now() - 5_000, platform: 'telegram', model: 'm2', watermarkPct: 82,
        cumApiCalls: 8, turns: 2, emptyStreak: 0,
        compaction: { level: 'soon', triggerTokens: 100_000, headroomTokens: 0, reserveTokens: 12_000 } },
      { sessionKey: 's-under', tsMs: Date.now() - 5_000, platform: 'cli', model: 'm3', watermarkPct: 40,
        cumApiCalls: 4, turns: 1, emptyStreak: 0,
        compaction: { level: 'under', triggerTokens: 100_000, headroomTokens: 60_000, reserveTokens: 12_000 } },
      { sessionKey: 's-none', tsMs: Date.now() - 5_000, platform: 'slack', model: 'm4', watermarkPct: 50,
        cumApiCalls: 2, turns: 1, emptyStreak: 0 },
    ]))
    const w = mount(GovSessionHealthSection)
    await flushPromises()

    const html = w.html()
    expect(html).toContain('压缩档位')
    expect(html).toContain('立即')
    expect(html).toContain('临近')
    expect(html).toContain('充裕')
    // 缺投影（旧 sidecar 无绝对值）：占位不出假档
    expect(w.findAll('.lvl--na').length).toBe(1)
    expect(w.findAll('.lvl--now').length).toBe(1)
    expect(w.findAll('.lvl--soon').length).toBe(1)
    expect(w.findAll('.lvl--under').length).toBe(1)
    // 档位 tooltip 披露触发线与 8K 缺省输出预算口径
    expect(html).toContain('输出预留按 8K 缺省估')
  })

  it('空遥测=诚实空态（不渲染档位列表、引导语保留）', async () => {
    request.mockResolvedValue(snapWith([]))
    const w = mount(GovSessionHealthSection)
    await flushPromises()
    expect(w.text()).toContain('暂无会话遥测')
    expect(w.text()).toContain('90% 线公式')
  })
})
