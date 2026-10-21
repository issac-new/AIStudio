// overlay/custom/client/ia2/__tests__/stage-path.test.ts
// 阶段路径单一投影守门（2026-10-21 IA 收口）：
//   1) stage-path.stageKeyForPath 的归属矩阵（含段边界反例）；
//   2) routes.areaForPath 与 nav-centers.centerForPath 必须与唯一实现逐路径一致——
//      任何一侧再复制规则都会在此断言失败。
import { describe, it, expect } from 'vitest'
import { stageKeyForPath, type StageKey } from '../stage-path'
import { areaForPath } from '../routes'
import { centerForPath } from '../nav-centers'

const CASES: ReadonlyArray<readonly [string, StageKey | null]> = [
  ['/app', 'stage1'],
  ['/app/', 'stage1'],
  ['/app/teams', 'stage1'],
  ['/app/teams/t1', 'stage1'],
  ['/app/agents', 'stage1'],
  ['/app/agents/a1', 'stage1'],
  ['/app/stage/setup', 'stage1'],
  ['/app/stage/reqs', 'stage2'],
  ['/app/stage/design', 'stage3'],
  ['/app/stage/build', 'stage4'],
  ['/app/stage/accept', 'stage5'],
  ['/app/stage/govern', 'stage6'],
  ['/app/gov', 'stage6'],
  ['/app/gov/audit', 'stage6'],
  ['/app/sim', null],
  ['/app/sim/ops', null],
  ['/app/board', 'stage4'],
  ['/app/collab', 'stage4'],
  ['/app/unknown', 'stage4'],
  ['/hermes/logs', null],
  ['/ide', null],
  // 段边界反例：不能被前缀误判
  ['/app/teamship', 'stage4'],
  ['/app/simulation', 'stage4'],
  ['/app/stage/reqs-extra', 'stage4'],
]

describe('stageKeyForPath（唯一投影）', () => {
  it.each(CASES)('%s → %s', (path, expected) => {
    expect(stageKeyForPath(path)).toBe(expected)
  })

  it('areaForPath 与 centerForPath 逐路径同值（防双实现漂移）', () => {
    for (const [path] of CASES) {
      expect(areaForPath(path), `areaForPath(${path})`).toBe(stageKeyForPath(path))
      expect(centerForPath(path), `centerForPath(${path})`).toBe(stageKeyForPath(path))
    }
  })
})
