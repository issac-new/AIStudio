// R5-#5 守门：四恢复选项组合契约（claude-code 概念级，zcode v4 原语组合）。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { CHECKPOINT_RECOVERY_MODES, buildRecoveryEnvelopes, isCheckpointRecoveryMode } from '../checkpoint-options'

const OVERLAY_ROOT = resolve(__dirname, '../../../..')
const T = { workspacePath: '/w', sessionId: 's1', rowId: 42, entityId: 'e1', clientId: 'c1', originalQueryText: '原问题' }

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

describe('接线守门', () => {
  it('engine-controller 挂 POST /checkpoint/recover 且校验四档', () => {
    const src = readFileSync(resolve(OVERLAY_ROOT, 'custom/server/zcode/engine-controller.ts'), 'utf8')
    expect(src).toContain("router.post('/checkpoint/recover'")
    expect(src).toContain('isCheckpointRecoveryMode(mode)')
    expect(src).toContain('CHECKPOINT_MODES_JOIN')
  })
})
