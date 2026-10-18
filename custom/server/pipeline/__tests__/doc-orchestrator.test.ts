// overlay/custom/server/pipeline/__tests__/doc-orchestrator.test.ts
import { describe, expect, it } from 'vitest'
import { docOrchestrator, testReportSections, SECTION_SAFETY } from '../doc-orchestrator'

describe('文档编排器（总分总产品化）', () => {
  it('模板：测试报告双片（BE=qi/FE=fei）+产物路径+回执前缀齐', () => {
    const legs = testReportSections('RFD-001')
    expect(legs.map(l => l.writer)).toEqual(['qi', 'fei'])
    expect(legs[0].artifactPath).toContain('test-report-BE.md')
    expect(legs[1].receiptPrefix).toBe('FE-SECTION-DONE')
  })

  it('start：每片各发一条（互不等待+途中锚条款在文）+汇总篇一条', async () => {
    const sent: Array<{ body: string; mentions: string[] }> = []
    const orch = docOrchestrator({
      home: '/tmp/doc-orch-test',
      room: '!r:matrix.test',
      send: async (body, mentions) => { sent.push({ body, mentions }); return `$e${sent.length}` },
    })
    const o = await orch.start('doc-1', 'qi', 'REPORT-DONE', testReportSections('RFD-001'))
    expect(o.status).toBe('dispatched')
    expect(o.sections).toHaveLength(2)
    expect(sent).toHaveLength(3) // 双片+汇总
    expect(sent[0].mentions[0]).toBe('@qi-agent')
    expect(sent[0].body).toContain(SECTION_SAFETY.slice(1, 20)) // 并行分工条款在派发词
    expect(sent[2].body).toContain('汇总篇')
  })

  it('状态文件可注入（测试隔离面）', () => {
    const orch = docOrchestrator({ stateFile: '/tmp/iso.json' })
    expect(orch.stateFile).toBe('/tmp/iso.json')
  })
})
