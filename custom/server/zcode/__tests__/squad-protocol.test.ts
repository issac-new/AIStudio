// squad leader 协调协议守门（multica squad_briefing.go 语义吸收，矩阵 §3.5 P0）。
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  SQUAD_EVALUATION_VERDICTS, buildSquadBriefing, isSelfTrigger, isSquadEvaluationVerdict,
  listEvaluations, loadSquads, recordEvaluation, resetSquadsCacheForTests, resolveSquad,
} from '../squad-protocol'
import { MentionDispatchService } from '../mention-dispatch'

describe('名册与解析（squads.yaml 单一事实源）', () => {
  beforeEach(() => resetSquadsCacheForTests())

  it('仓内名册可加载：core/review 两 squad 带 leader+members', () => {
    const squads = loadSquads()
    expect(squads.core).toEqual({ leader: 'zcode', members: ['zcode', 'codex', 'mimo'] })
    expect(squads.review?.leader).toBe('codex')
    expect(resolveSquad('nope')).toBeNull()
  })

  it('env 覆盖 + 坏文件回空名册（fail-soft）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'squads-'))
    const f = join(dir, 's.yaml')
    writeFileSync(f, '{{broken', 'utf8')
    process.env.HERMES_SQUADS_FILE = f
    resetSquadsCacheForTests()
    expect(Object.keys(loadSquads())).toHaveLength(0)
    delete process.env.HERMES_SQUADS_FILE
    rmSync(dir, { recursive: true, force: true })
    resetSquadsCacheForTests()  // 不把空名册缓存留给后续用例（隔离纪律）
  })
})

describe('四件语义', () => {
  it('自触发抑制：leader @ 自己 squad 判 self（multica shouldSuppress 语义 v1）', () => {
    const core = { leader: 'zcode', members: ['zcode'] }
    expect(isSelfTrigger(core, 'zcode')).toBe(true)
    expect(isSelfTrigger(core, 'codex')).toBe(false)
    expect(isSelfTrigger(core, '')).toBe(false)
  })

  it('简报四要素：leader 身份/选人职责/必录评估/交付边界（in_review 非 done）', () => {
    const b = buildSquadBriefing('core', { leader: 'zcode', members: ['zcode', 'codex'] }, '修登录页')
    expect(b.prompt).toContain('[squad:core]')
    expect(b.prompt).toContain('选人与分派是你的职责')
    expect(b.prompt).toContain('verdict=action|no_action|failed')
    expect(b.prompt).toContain('in_review')
    expect(b.prompt).toContain('修登录页')
  })

  it('评估三档冻结 + 留痕环（no_action 也必录；200 条上限）', () => {
    expect([...SQUAD_EVALUATION_VERDICTS]).toEqual(['action', 'no_action', 'failed'])
    expect(isSquadEvaluationVerdict('action')).toBe(true)
    expect(isSquadEvaluationVerdict('deferred')).toBe(false)
    for (let i = 0; i < 205; i++) {
      recordEvaluation({ squad: 'core', leader: 'zcode', verdict: 'no_action', reason: `r${i}`, at: i })
    }
    expect(listEvaluations().length).toBeLessThanOrEqual(200)
    expect(listEvaluations('core').length).toBe(listEvaluations().length)
  })
})

describe('派单链集成（squad→leader 复用 agent 围栏）', () => {
  it('@squad/未知 → target_unavailable；@squad/core → 派给 leader（createSession 收到简报）；leader 自触发 → self_trigger_suppressed', async () => {
    const created: string[] = []
    const engine = {
      probe: async () => true,
      createSession: async (p: { workspacePath: string }) => { created.push(p.workspacePath); return { session: { sessionId: 'sess-squad-1' } } },
      sendCommand: async (p: { workspacePath: string; envelope: Record<string, unknown> }) => {
        created.push(String((p.envelope.payload as { text: string }).text.slice(0, 20)))
        return { status: 'accepted' }
      },
    }
    const outcomes: Array<{ reason: string; target: string }> = []
    const svc = new MentionDispatchService({ engine: engine as never, clientId: 'c', onOutcome: (o) => outcomes.push({ reason: o.reason, target: o.target }) })

    const unknown = await svc.dispatch({ workspacePath: '/w', text: '@squad/nope 干活' })
    expect(unknown[0].reason).toBe('target_unavailable')

    const ok = await svc.dispatch({ workspacePath: '/w', text: '@squad/core 修登录页' })
    expect(ok[0].reason).toBe('queued')
    expect(ok[0].target).toContain('leader:zcode')
    expect(created[1]).toContain('[squad:core]')
    // 派单即录占位评估（每轮必录从派单侧就有账）。
    expect(listEvaluations('core').length).toBeGreaterThanOrEqual(1)

    const self = await new MentionDispatchService({ engine: engine as never, clientId: 'c', mentionAuthor: 'zcode' })
      .dispatch({ workspacePath: '/w', text: '@squad/core 自己的活' })
    expect(self[0].reason).toBe('self_trigger_suppressed')
  })
})
