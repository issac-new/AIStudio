// overlay/custom/server/loop/engine/__tests__/session-resume-round6.test.ts
// R6 会话续接安全分档守门（multica task.go:5210 语义）：
// 黑名单/中毒入黑强制新会话保留 work_dir/首跑新会话/正常续用/测试隔离。
// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import {
  decideResume, isResumeBlacklisted, blacklistResume, clearResumeBlacklistForTests,
  type ResumeContractRow,
} from '../session-resume'

function row(over: Partial<ResumeContractRow>): ResumeContractRow {
  return { id: 'c1', session_id: null, work_dir: '/w/x', ...over }
}

describe('R6 会话续接安全分档（multica task.go:5210 语义）', () => {
  beforeEach(() => {
    clearResumeBlacklistForTests()
  })

  it('首跑无旧会话 → 新会话保留 work_dir', () => {
    const d = decideResume(row({}))
    expect(d.reuseSession).toBe(false)
    expect(d.workDir).toBe('/w/x')
  })

  it('正常续用：有 session_id 且无中毒 → 续用保留 work_dir', () => {
    const d = decideResume(row({ session_id: 'sess-abcdef123456' }))
    expect(d.reuseSession).toBe(true)
    expect(d.workDir).toBe('/w/x')
    expect(d.reason).toContain('续用')
  })

  it('上次续接失败（中毒信号）→ 入黑 + 强制新会话保留 work_dir', () => {
    const d = decideResume(row({ session_id: 'sess-x', last_resume_failed: true }))
    expect(d.reuseSession).toBe(false)
    expect(d.workDir).toBe('/w/x')
    expect(d.reason).toContain('中毒')
    expect(isResumeBlacklisted('c1')).toBe(true)
  })

  it('黑名单契约 → 一律新会话保留 work_dir（multica 中毒不继承）', () => {
    blacklistResume('c1')
    const d = decideResume(row({ session_id: 'sess-x' }))
    expect(d.reuseSession).toBe(false)
    expect(d.workDir).toBe('/w/x')
    expect(d.reason).toContain('黑名单')
  })

  it('黑名单按 contract id 隔离（c2 不受 c1 影响）', () => {
    blacklistResume('c1')
    const d = decideResume(row({ id: 'c2', session_id: 'sess-y' }))
    expect(d.reuseSession).toBe(true)
  })

  it('work_dir 缺失 → 保留 null 不出错', () => {
    const d = decideResume(row({ work_dir: null, session_id: 'sess-x' }))
    expect(d.workDir).toBeNull()
  })
})
