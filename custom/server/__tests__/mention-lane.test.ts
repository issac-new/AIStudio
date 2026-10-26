// C3（挂账清偿批二）守门：@mention 通道泳道摄取——queued 新建会话/coalesced 送达
// 均落 lane_session 证据（确定性 evidenceId 幂等）；无 taskId 不落（边界如实施）；
// command_rejected 不落（会话未投入使用）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MentionDispatchService, type DispatchEnginePort, type MentionOutcome } from '../zcode/mention-dispatch'
import { listEvidence } from '../evidence/evidence-store'

let evidenceDir: string

function fakeEngine(): DispatchEnginePort & { sent: Array<Record<string, unknown>>; sessions: number } {
  const engine = {
    online: true,
    sessions: 0,
    sent: [] as Array<Record<string, unknown>>,
    async probe() { return engine.online },
    async createSession() { engine.sessions += 1; return { session: { sessionId: `sess-${engine.sessions}` } } },
    async sendCommand(p: { workspacePath: string; envelope: Record<string, unknown> }) {
      engine.sent.push(p.envelope)
      return { status: 'accepted' }
    },
  } as never
  return engine
}

beforeEach(() => {
  evidenceDir = mkdtempSync(join(tmpdir(), 'mention-lane-'))
  process.env.HERMES_EVIDENCE_DIR = evidenceDir
})

afterEach(() => {
  delete process.env.HERMES_EVIDENCE_DIR
  rmSync(evidenceDir, { recursive: true, force: true })
})

describe('@mention 通道 lane_session 摄取', () => {
  it('queued 新建会话落账（taskId+sessionId）；同会话重复派发幂等不双写', async () => {
    const engine = fakeEngine()
    const outcomes: MentionOutcome[] = []
    const svc = new MentionDispatchService({ engine, clientId: 'cli-c3', onOutcome: (o) => outcomes.push(o) })
    const r = await svc.dispatch({ workspacePath: '/ws/c3', text: '@zcode 修登录页', taskId: 'T-c3' })
    expect(r[0].reason).toBe('queued')
    const sess = listEvidence('T-c3', 'lane_session')
    expect(sess.length).toBe(1)
    expect(sess[0].artifactType).toBe('mention')
    expect(sess[0].ref).toBe(r[0].commandId)
    // 同 taskId+sessionId 再派发（coalesced 并入）——确定性 evidenceId 不双写
    const r2 = await svc.dispatch({ workspacePath: '/ws/c3', text: '@zcode 继续', taskId: 'T-c3' })
    expect(r2[0].reason).toBe('coalesced')
    expect(listEvidence('T-c3', 'lane_session').length).toBe(1)
  })

  it('无 taskId 不落账（证据按 taskId 组织的边界）；拒绝态不落', async () => {
    const engine = fakeEngine()
    const svc = new MentionDispatchService({ engine, clientId: 'cli-c3b', onOutcome: () => {} })
    await svc.dispatch({ workspacePath: '/ws/x', text: '@zcode 干活' })
    expect(listEvidence('any', 'lane_session').length).toBe(0)
    // 拒绝态：sendCommand 返回拒绝 → command_rejected，会话未投入使用不落
    const engine2 = {
      ...fakeEngine(),
      async sendCommand() { return { status: 'rejected', reasonCode: 'sandbox_denied' } },
    } as never as DispatchEnginePort
    const svc2 = new MentionDispatchService({ engine: engine2, clientId: 'cli-c3c', onOutcome: () => {} })
    const r3 = await svc2.dispatch({ workspacePath: '/ws/y', text: '@zcode 再来', taskId: 'T-rej' })
    expect(r3[0].reason).toBe('command_rejected')
    expect(listEvidence('T-rej', 'lane_session').length).toBe(0)
  })
})
