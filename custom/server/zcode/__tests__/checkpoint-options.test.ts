// R5-#5 守门：四恢复选项组合契约（claude-code 概念级，zcode v4 原语组合）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CHECKPOINT_RECOVERY_MODES, buildRecoveryEnvelopes, isCheckpointRecoveryMode } from '../checkpoint-options'
import { loadEngineCommandValidator, REPO_ROOT } from '../../__tests__/helpers/engine-command-validator'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
// baseRevision/baseLogEpoch＝会话当前的比对基线（N34-1：引擎对按行定位的命令强制要求）
const T = { workspacePath: '/w', sessionId: 's1', rowId: 42, entityId: 'e1', clientId: 'c1', originalQueryText: '原问题', baseRevision: 7, baseLogEpoch: 'epoch-1' }

describe('checkpoint 四恢复选项（组合单一事实源）', () => {
  it('四档枚举冻结', () => {
    expect([...CHECKPOINT_RECOVERY_MODES]).toEqual(['code-and-conversation', 'conversation-only', 'code-only', 'summarize-from-here'])
    expect(isCheckpointRecoveryMode('code-only')).toBe(true)
    expect(isCheckpointRecoveryMode('everything')).toBe(false)
  })

  it('code-and-conversation → editUserQuery rewind（先恢复文件再切分支）', () => {
    const [env] = buildRecoveryEnvelopes('code-and-conversation', T, 1000)
    expect(env.type).toBe('editUserQuery')
    expect(env.payload).toMatchObject({ target: { rowId: 42, entityId: 'e1' }, newText: '原问题', workspaceMode: 'rewind' })
    expect(env.clientId).toBe('c1')
    expect(env.commandId).toMatch(/^[0-9a-f]{8}-/)
  })

  it('conversation-only → preserve（工作区不动）', () => {
    expect(buildRecoveryEnvelopes('conversation-only', T, 1000)[0].payload).toMatchObject({ workspaceMode: 'preserve' })
  })

  it('code-only → applyFileRewind（不截断聊天历史）', () => {
    const [env] = buildRecoveryEnvelopes('code-only', T, 1000)
    expect(env.type).toBe('applyFileRewind')
    expect(env.payload).toEqual({ target: { rowId: 42, entityId: 'e1' } })
  })

  it('summarize-from-here → preserve 切分支 + sendText 摘要指令（两信封）', () => {
    const envs = buildRecoveryEnvelopes('summarize-from-here', T, 1000)
    expect(envs).toHaveLength(2)
    expect(envs[0].payload).toMatchObject({ workspaceMode: 'preserve' })
    expect(envs[1].type).toBe('sendText')
    expect((envs[1].payload as { text: string }).text).toContain('交接摘要')
    expect(envs[0].commandId).not.toBe(envs[1].commandId)
  })
})

describe('引擎命令入口校验（N34-1）', () => {
  it('四档构造出的每个信封都通过引擎的 parseCommandEnvelope', async () => {
    const validate = await loadEngineCommandValidator()
    for (const mode of CHECKPOINT_RECOVERY_MODES) {
      const envs = buildRecoveryEnvelopes(mode, T, 1000)
      for (const env of envs) {
        const v = validate(env)
        expect(v.ok, `${mode} / ${env.type} 被引擎拒绝：${v.issues.join('；')}`).toBe(true)
      }
    }
  })

  it('按行定位的两类命令带 baseRevision 与 baseLogEpoch；摘要指令不带', () => {
    const rewind = buildRecoveryEnvelopes('code-and-conversation', T, 1000)[0]
    expect(rewind).toMatchObject({ type: 'editUserQuery', baseRevision: 7, baseLogEpoch: 'epoch-1', issuedAt: 1000 })
    const fileOnly = buildRecoveryEnvelopes('code-only', T, 1000)[0]
    expect(fileOnly).toMatchObject({ type: 'applyFileRewind', baseRevision: 7, baseLogEpoch: 'epoch-1' })
    const summarize = buildRecoveryEnvelopes('summarize-from-here', T, 1000)[1]
    expect(summarize.type).toBe('sendText')
    expect(summarize.baseRevision).toBeUndefined()
  })

  it('验收反例：去掉基线字段，引擎即拒绝（缺 baseRevision → 按行定位的另判 baseLogEpoch）', async () => {
    const validate = await loadEngineCommandValidator()
    const { baseRevision: _r, baseLogEpoch: _e, ...rest } = buildRecoveryEnvelopes('code-only', T, 1000)[0] as Record<string, unknown>
    const v = validate(rest)
    expect(v.ok).toBe(false)
    expect(v.issues.join('；')).toMatch(/baseRevision|baseLogEpoch/)
    const [summarize, send] = buildRecoveryEnvelopes('summarize-from-here', T, 1000)
    expect(validate({ ...send, issuedAt: new Date(0).toISOString() }).ok).toBe(false) // 时间戳须是毫秒数
    expect(validate(summarize).ok).toBe(true)
  })

  it('引擎协议源文件在位（守门不是空跑）', () => {
    expect(REPO_ROOT.endsWith('AIStudio') || REPO_ROOT.includes('/.claude/worktrees/')).toBe(true)
  })
})

describe('接线守门', () => {
  it('engine-controller 挂 POST /checkpoint/recover 且校验四档', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-controller.ts'), 'utf8')
    expect(src).toContain("router.post('/checkpoint/recover'")
    expect(src).toContain('isCheckpointRecoveryMode(mode)')
    expect(src).toContain('CHECKPOINT_MODES_JOIN')
  })
})
