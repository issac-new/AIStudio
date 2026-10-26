// B3（挂账清偿批）守门：泳道事件摄取端——列编排派发落账 lane_handoff+lane_session
// 证据（确定性 evidenceId 幂等）、panorama 泳道时间线面（lane_* 证据→LaneEvent 投影）。
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { dispatchColumnTransition } from '../column-dispatch'
import { listEvidence } from '../../evidence/evidence-store'
import { buildPanorama } from '../../workitem/panorama'
import { resetColumnAutomationsCacheForTests } from '../column-automation'

let home: string
let evidenceDir: string
let columnsFile: string

const COLUMNS_YAML = [
  'columns:',
  '  doing:',
  '    timing: entry',
  '    steps:',
  '      - id: s1',
  '        role: general-engineer',
  '        provider: zcode',
  '',
].join('\n')

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'lane-home-'))
  evidenceDir = mkdtempSync(join(tmpdir(), 'lane-evidence-'))
  columnsFile = join(home, 'columns.yaml')
  require('node:fs').writeFileSync(columnsFile, COLUMNS_YAML, 'utf8')
  process.env.HERMES_HOME = join(home, '.hermes')
  process.env.HERMES_EVIDENCE_DIR = evidenceDir
  process.env.HERMES_COLUMNS_FILE = columnsFile
  process.env.GOVERNANCE_DISPATCH_LEDGER = join(home, 'dispatch-ledger.json')
  delete process.env.EXPERIENCE_INJECT
  delete process.env.FLYWHEEL_FEWSHOT_INJECT
  resetColumnAutomationsCacheForTests()
})

afterEach(() => {
  delete process.env.HERMES_HOME
  delete process.env.HERMES_EVIDENCE_DIR
  delete process.env.HERMES_COLUMNS_FILE
  delete process.env.GOVERNANCE_DISPATCH_LEDGER
  rmSync(home, { recursive: true, force: true })
  rmSync(evidenceDir, { recursive: true, force: true })
})

describe('列编排派发 → 泳道证据', () => {
  it('带 taskId 派发：lane_handoff+lane_session 双写（幂等 evidenceId）；无 taskId 不写', async () => {
    const service = {
      dispatch: async (p: { text: string }) => [{ reason: 'queued', detail: 'ok', sessionId: 'sess-1', commandId: 'cmd-1' }],
    } as never
    const r1 = await dispatchColumnTransition(service, { from: 'todo', to: 'doing', workspacePath: '/tmp/w', taskId: 'T-9' })
    expect(r1.outcomes.length).toBe(1)
    const handoffs = listEvidence('T-9', 'lane_handoff')
    const sessions = listEvidence('T-9', 'lane_session')
    expect(handoffs.length).toBe(1)
    expect(sessions.length).toBe(1)
    expect(handoffs[0].artifactType).toBe('doing')
    expect(handoffs[0].note).toBe('todo → doing')
    expect(handoffs[0].ref).toBe('cmd-1')
    // 重放派发（台账窗口去重会跳过 step）→ 不双写
    await dispatchColumnTransition(service, { from: 'todo', to: 'doing', workspacePath: '/tmp/w', taskId: 'T-9' })
    expect(listEvidence('T-9', 'lane_handoff').length).toBe(1)

    // 无 taskId 派发：证据按 taskId 组织，跳过（边界如实施）
    const r2 = await dispatchColumnTransition(service, { from: null, to: 'doing', workspacePath: '/tmp/w' })
    expect(r2.outcomes.length).toBe(1)
    expect(listEvidence('T-none', 'lane_handoff').length).toBe(0)
  })

  it('panorama 泳道时间线面：lane_* 证据投影为履历行（available + 时间正序）', async () => {
    const service = {
      dispatch: async () => [{ reason: 'queued', sessionId: 'sess-2', commandId: 'cmd-2' }],
    } as never
    await dispatchColumnTransition(service, { from: 'todo', to: 'doing', workspacePath: '/tmp/w', taskId: 'T-10' })
    const p = await buildPanorama('T-10')
    expect(p.laneTimeline.available).toBe(true)
    expect(p.laneTimeline.data!.length).toBe(2)
    const handoffRow = p.laneTimeline.data!.find((r) => r.kind === 'handoff')!
    expect(handoffRow.label).toContain('todo → doing')
    expect(handoffRow.label).toContain('cmd-2')
  })
})
