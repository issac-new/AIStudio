// 失败分档守门（multica：resume-unsafe 黑名单/平台错重试/指数退避封顶）。
import { describe, it, expect } from 'vitest'
import { classifyResume } from '../resume-safety'

describe('续接失败分档（multica 三档）', () => {
  it('resume-unsafe 黑名单优先→new_session（续接安全性优先于错误类别）', () => {
    expect(classifyResume({ category: 'transport', resumeUnsafe: true }).cls).toBe('new_session')
  })

  it('transport→safe_retry；session→new_session', () => {
    expect(classifyResume({ category: 'transport' })).toMatchObject({ cls: 'safe_retry', backoffMs: null })
    expect(classifyResume({ category: 'session' }).cls).toBe('new_session')
  })

  it('model/tool 错→指数退避（2^attempts 秒封顶 60s）', () => {
    expect(classifyResume({ category: 'model', attempts: 0 })).toMatchObject({ cls: 'backoff', backoffMs: 1000 })
    expect(classifyResume({ category: 'tool', attempts: 3 }).backoffMs).toBe(8000)
    expect(classifyResume({ category: 'model', attempts: 20 }).backoffMs).toBe(60_000)  // 封顶
  })
})
