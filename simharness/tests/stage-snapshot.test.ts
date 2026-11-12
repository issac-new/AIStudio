// stage-snapshot.test.ts — mx-stage-snapshot.sh 阶段快照与恢复守门（2026-11-12 P2-13 第一段）
// 形态与 kanban-junk-runid.test.ts 同族：spawnSync 直调 bash 夹具、临时目录造 run_dir；
// 不真跑推演、不碰 SIM_ROOT 活体（MX_SIM_ROOT 指向测试临时目录）。
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const ROOT = resolve(__dirname, '../..')
const SNAP = join(ROOT, 'simharness/mux/mx-stage-snapshot.sh')
const SCENARIO = join(ROOT, 'simharness/aipay-scenario.sh')
const SCEN_LIB = join(ROOT, 'simharness/mux/mx-scenario-lib.sh')

function bash(args: string[], opts: { env?: Record<string, string> } = {}) {
  return spawnSync('bash', args, {
    encoding: 'utf8',
    env: { ...process.env, ...opts.env },
    timeout: 60_000,
  })
}

let T = ''
const runDir = () => join(T, 'simroot/runs/r29')

// 现场造物：state.env（g2 已过+前序 done 键）、evidence 关键件、看板库
function makeRunDir() {
  mkdirSync(join(runDir(), 'evidence'), { recursive: true })
  mkdirSync(join(T, 'simroot/hermes/kanban/boards/fanfan/fanfan-review'), { recursive: true })
  writeFileSync(
    join(runDir(), 'state.env'),
    [
      'run_started_at=2026-11-12T01:00:00Z',
      'smoke_done=1',
      'reqgate_done=1731400000',
      'g1_frozen=1731400000',
      'g2_arch_pass=1731400500',
      '',
    ].join('\n'),
  )
  writeFileSync(join(runDir(), 'evidence/governance-metrics.json'), '{"ok":3,"failed":1}\n')
  writeFileSync(join(runDir(), 'evidence/release-gate.jsonl'), '{"run":"r29","action":"submit"}\n')
  writeFileSync(join(runDir(), 'evidence/issues.log'), 'ISSUE|x|y|z\n')
  writeFileSync(join(runDir(), 'evidence/scenario.log'), '[mux 01:00] line\n')
  writeFileSync(join(runDir(), 'evidence/approved.events'), 'humangate:RG1 G5-HUMANGATE-APPROVED director-proxy 1731400600\n')
  const db = join(T, 'simroot/hermes/kanban/boards/fanfan/fanfan-review/kanban.db')
  const r = spawnSync('sqlite3', [db, 'CREATE TABLE tasks(id TEXT, body TEXT); INSERT INTO tasks VALUES(\'t1\',\'hello\');'], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`sqlite3 夹具建库失败: ${r.stderr}`)
}

const SNAP_ENV = { MX_SIM_ROOT: '' } // 每用例注入绝对路径

beforeAll(() => {
  T = mkdtempSync(join(tmpdir(), 'mx-stage-snap-test.XXXXXX'))
  SNAP_ENV.MX_SIM_ROOT = join(T, 'simroot')
  makeRunDir()
})
afterAll(() => rmSync(T, { recursive: true, force: true }))

describe('语法与源层挂钩', () => {
  it('bash -n 三脚本全过', () => {
    for (const s of [SNAP, SCENARIO, SCEN_LIB]) {
      const r = bash(['-n', s])
      expect(r.status, `${s}: ${r.stderr}`).toBe(0)
    }
  })

  it('驱动 9 处挂钩齐全（g1..g6+uat+report 各就位）', () => {
    const src = readFileSync(SCENARIO, 'utf8')
    for (const g of ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'uat', 'report']) {
      expect(src, `挂钩 ${g} 缺席`).toMatch(new RegExp(`^\\s*mx_stage_snapshot_maybe ${g}\\b`, 'm'))
    }
    const n = src.match(/^.*mx_stage_snapshot_maybe /gm) ?? []
    expect(n.length, 'g2 双分支共 9 处').toBe(9)
  })

  it('开关默认关：mx_stage_snapshot_maybe 缺省零调用（MX_STAGE_SNAPSHOT 默认 0）', () => {
    const lib = readFileSync(SCEN_LIB, 'utf8')
    expect(lib).toContain('[[ "${MX_STAGE_SNAPSHOT:-0}" == "1" ]] || return 0')
    expect(lib).toContain('mx_stage_snapshot_maybe()')
  })
})

describe('save/list', () => {
  it('save g2 落 tar.gz+manifest（含 state.env 哈希与看板摘要）', () => {
    const r = bash([SNAP, 'save', runDir(), 'g2'], { env: SNAP_ENV })
    expect(r.status, r.stderr).toBe(0)
    const snapPath = join(runDir(), 'snapshots/g2.tar.gz')
    expect(existsSync(snapPath)).toBe(true)
    const m = bash([
      '-c',
      `tar -xzf ${JSON.stringify(snapPath)} -O manifest.json`,
    ])
    const manifest = JSON.parse(m.stdout)
    expect(manifest.schema).toBe('mx-stage-snapshot/1')
    expect(manifest.gate).toBe('g2')
    expect(manifest.gateKeyHit).toBe('g2_arch_pass')
    expect(manifest.gateValue).toBe('1731400500')
    expect(manifest.nextStep).toBe('close')
    expect(manifest.boardsSummary).toBe('boards-summary.json')
    const paths = manifest.files.map((f: { path: string }) => f.path)
    expect(paths).toContain('state.env')
    expect(paths).toContain('evidence/governance-metrics.json')
    expect(paths).toContain('evidence/issues.log')
    const boards = bash(['-c', `tar -xzf ${JSON.stringify(snapPath)} -O boards-summary.json`])
    const boardRows = JSON.parse(boards.stdout)
    expect(boardRows.length).toBe(1)
    expect(boardRows[0].tasks).toBe(1)
    expect(boardRows[0].sha256).toMatch(/^[0-9a-f]{64}$/)
  })

  it('save 幂等：同闸再 save 走 skip 且退出 0', () => {
    const r = bash([SNAP, 'save', runDir(), 'g2'], { env: SNAP_ENV })
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toContain('skip')
  })

  it('闸未过 save=退出码 3（G4 GAP 轮合法态静默跳过）', () => {
    const r = bash([SNAP, 'save', runDir(), 'g5'], { env: SNAP_ENV })
    expect(r.status).toBe(3)
    expect(r.stdout).toContain('闸键未落')
  })

  it('未知 gate 与缺席快照响亮失败', () => {
    expect(bash([SNAP, 'save', runDir(), 'gx']).status).toBe(1)
    expect(bash([SNAP, 'restore', runDir(), 'g5']).status).toBe(1)
  })

  it('list 输出快照摘要行', () => {
    const r = bash([SNAP, 'list', runDir()])
    expect(r.status, r.stderr).toBe(0)
    expect(r.stdout).toMatch(/g2\s+created=\d+\s+files=\d+\s+gate=g2_arch_pass=1731400500\s+next=close/)
  })
})

describe('restore 完整性与恢复面', () => {
  it('事故现场（键回退+evidence 删失）restore 后全量恢复并提示下一步', () => {
    writeFileSync(join(runDir(), 'state.env'), 'g2_arch_pass=ROLLBACK\n')
    rmSync(join(runDir(), 'evidence/governance-metrics.json'))
    rmSync(join(runDir(), 'evidence/issues.log'))
    const r = bash([SNAP, 'restore', runDir(), 'g2'])
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(join(runDir(), 'state.env'), 'utf8')).toContain('g2_arch_pass=1731400500')
    expect(readFileSync(join(runDir(), 'evidence/governance-metrics.json'), 'utf8')).toBe('{"ok":3,"failed":1}\n')
    expect(readFileSync(join(runDir(), 'evidence/issues.log'), 'utf8')).toBe('ISSUE|x|y|z\n')
    expect(r.stdout).toContain('下一步：close')
    expect(r.stdout).toContain('幂等跳过')
  })

  it('篡改快照（tar 内 state.env 换内容）被 sha256 校验拦截且不写现场', () => {
    const snapPath = join(runDir(), 'snapshots/g2.tar.gz')
    const before = readFileSync(join(runDir(), 'state.env'), 'utf8')
    const w = join(T, 'tamper')
    mkdirSync(w)
    bash(['-c', `tar -xzf ${JSON.stringify(snapPath)} -C ${JSON.stringify(w)}`])
    writeFileSync(join(w, 'state.env'), 'g2_arch_pass=EVIL\n')
    bash([
      '-c',
      `cd ${JSON.stringify(w)} && tar -czf ${JSON.stringify(snapPath)} manifest.json state.env boards-summary.json evidence`,
    ])
    const r = bash([SNAP, 'restore', runDir(), 'g2'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('完整性校验未过')
    expect(r.stderr).toContain('state.env 哈希不符')
    expect(readFileSync(join(runDir(), 'state.env'), 'utf8')).toBe(before)
    // 收尾重建干净快照：篡改态不可留给后续用例（完整性校验会正确拦住它们）
    const rebuild = bash([SNAP, 'save', runDir(), 'g2', '--force'], { env: SNAP_ENV })
    expect(rebuild.status, rebuild.stderr).toBe(0)
  })

  it('restore 保留清单外既有文件（append-only 审计纪律，禁删）', () => {
    writeFileSync(join(runDir(), 'evidence/after-snapshot-event.log'), 'LATER\n')
    const r = bash([SNAP, 'restore', runDir(), 'g2'])
    expect(r.status, r.stderr).toBe(0)
    expect(readFileSync(join(runDir(), 'evidence/after-snapshot-event.log'), 'utf8')).toBe('LATER\n')
  })
})
