// overlay/custom/server/loop/engine/__tests__/git-sos.test.ts
// Git 冲突 SOS 降级（aipaydev 缺口 4 决策层）直测：冲突分类、重试升级、
// Leader 模式回滚、执行分支的可观测副作用（日志/不抛）。
import { describe, it, expect, vi } from 'vitest'
import { detectConflictType, evaluateSos, executeSosAction, SosLevel, porcelainConflictType, sosAdvisoryForConflicts } from '../git-sos'

describe('git-sos 冲突降级', () => {
  it('按冲突标记分类：内容 / 结构 / 语义（真实 git 冲突标记分行形态）', () => {
    expect(detectConflictType(['file.ts:3:<<<<<<< HEAD'])).toBe('content')
    expect(detectConflictType(['file.ts:3:=======', 'file.ts:5:>>>>>>> main'])).toBe('structural')
    expect(detectConflictType(['file.ts: semantic drift'])).toBe('semantic')
  })

  it('语义冲突直接 CRITICAL/ESCALATE（无法自动解决）', () => {
    const d = evaluateSos('semantic', 0, false)
    expect(d.level).toBe(SosLevel.CRITICAL)
    expect(d.action).toBe('ESCALATE')
    expect(d.message).toContain('语义冲突')
  })

  it('重试达 3 次且非语义 → 升级 Leader', () => {
    const d = evaluateSos('content', 3, false)
    expect(d.level).toBe(SosLevel.WARNING)
    expect(d.action).toBe('ESCALATE')
    expect(d.message).toContain('3')
  })

  it('Leader 模式且未达重试上限 → ROLLBACK', () => {
    const d = evaluateSos('content', 1, true)
    expect(d.action).toBe('ROLLBACK')
    expect(d.level).toBe(SosLevel.INFO)
  })

  it('默认内容冲突 → 中止合并', () => {
    const d = evaluateSos('content', 0, false)
    expect(d.action).toBe('ABORT_MERGE')
    expect(d.details).toContain('git merge --abort')
  })

  it('executeSosAction 各分支不抛异常（降级决策安全执行）', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    await executeSosAction(evaluateSos('content', 0, false))
    await executeSosAction(evaluateSos('content', 1, true))
    await executeSosAction(evaluateSos('semantic', 0, false))
    await executeSosAction({ level: SosLevel.INFO, action: 'CONTINUE', message: 'noop' })
    expect(logSpy).toHaveBeenCalledTimes(3) // ABORT/ROLLBACK/ESCALATE 各有日志，CONTINUE 无
    logSpy.mockRestore()
  })
})

describe('git-sos 生产接线：/status 冲突态建议（porcelain 码 → advisory）', () => {
  it('porcelain 冲突码分类：UU/AA=content，DD/AU/UD=structural，普通码 null', () => {
    expect(porcelainConflictType('U', 'U')).toBe('content')
    expect(porcelainConflictType('A', 'A')).toBe('content')
    expect(porcelainConflictType('D', 'D')).toBe('structural')
    expect(porcelainConflictType('A', 'U')).toBe('structural')
    expect(porcelainConflictType('U', 'D')).toBe('structural')
    expect(porcelainConflictType('M', 'M')).toBeNull()
    expect(porcelainConflictType('?', '?')).toBeNull()
  })
  it('无冲突项 → 无建议（status 响应不带 sos 字段）', () => {
    expect(sosAdvisoryForConflicts([{ indexStatus: 'M', worktreeStatus: 'M' }])).toBeNull()
    expect(sosAdvisoryForConflicts([])).toBeNull()
  })
  it('UU 冲突 → ABORT_MERGE 建议（structural 优先于 content 上报）', () => {
    const d = sosAdvisoryForConflicts([
      { indexStatus: 'U', worktreeStatus: 'U' },
      { indexStatus: 'D', worktreeStatus: 'D' },
    ])
    expect(d?.action).toBe('ABORT_MERGE')
    expect(d?.level).toBe(SosLevel.WARNING)
  })
})
