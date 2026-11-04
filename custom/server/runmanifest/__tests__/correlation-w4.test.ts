// W4：run-manifest 落账置 ambient 关联（traceId=sessionId/runId/promptVersion=promptHash）。
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

describe('recordRunManifest × call-correlation（W4 生产者）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'rm-corr-'))
    process.env.RUN_MANIFEST_DIR = dir
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    delete process.env.RUN_MANIFEST_DIR
  })

  it('落账后 ambient 带 traceId/runId/promptVersion（动态 import 已 resolve）', async () => {
    const { recordRunManifest } = await import('../run-manifest')
    const { getToolCallCorrelation, clearToolCallCorrelation } = await import('../../toolpipeline/call-correlation')
    clearToolCallCorrelation()
    recordRunManifest({ runId: 'run-w4', sessionId: 'sess-w4', promptHash: 'ph-9', userId: 'u' })
    await new Promise((r) => setTimeout(r, 20)) // 动态 import 微任务窗
    const c = getToolCallCorrelation()
    expect(c.traceId).toBe('sess-w4')
    expect(c.runId).toBe('run-w4')
    expect(c.promptVersion).toBe('ph-9')
    clearToolCallCorrelation()
  })
})
