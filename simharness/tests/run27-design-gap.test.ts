import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// run27 设计偏离根治批守门（spec 2026-11-06-run27-design-gap-rootfix）：
// ①清偿门 fail-closed（run27 实录：94 笔 open 代偿在案而 prelaunch ⑯ 恒绿——锚文件指向
//   SIM 根 state.env → run id 解析成目录名 → 台账不存在 → 假「零代偿轮」）
// ②问题单去重（343 行→90 键：帧族 234 行重复，掩盖真信号）
// ③报告摘要不虚称「全部实拍」+ 记账完成率/修复率双指标 + 净额双行（方案 §2.6.5）
const HARNESS = resolve(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'design-gap')

function sh(cmd: string, env: Record<string, string> = {}) {
  return spawnSync('bash', ['-c', cmd], {
    cwd: HARNESS, encoding: 'utf8', env: { ...process.env, ...env },
  })
}

beforeAll(() => { rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true }) })
afterAll(() => { rmSync(FIX, { recursive: true, force: true }) })

describe('① 清偿门 fail-closed（mx-compensation-ledger.sh）', () => {
  it('锚指向 SIM 根 state.env（非 runs/<id>）时按最近轮台账判定，不假绿', () => {
    const root = join(FIX, 'sim')
    mkdirSync(join(root, 'var'), { recursive: true })
    mkdirSync(join(root, 'runs', '20261001-v8-run1', 'evidence'), { recursive: true })
    writeFileSync(join(root, 'state.env'), 'x=1\n')
    // 锚像真机一样指向根 state.env
    execSync(`ln -s ${JSON.stringify(join(root, 'state.env'))} ${JSON.stringify(join(root, 'var', 'current-state.env'))}`)
    // 最近轮台账：1 笔 open
    writeFileSync(join(root, 'runs', '20261001-v8-run1', 'evidence', 'compensation-ledger.tsv'),
      'id\tts\ttype\tdefect\tdetail\tstatus\tresolution\nc1\t2026-10-01 00:00:00\tdispatch-preset\tPR-7\tx\topen\t\n')
    const r = sh(`AIPAY_SIM_ROOT=${JSON.stringify(root)} bash mux/mx-compensation-ledger.sh check-clearance`)
    expect(r.status).toBe(1)                      // open 在案 → 非零（旧逻辑此处 exit 0 假绿）
    expect(r.stdout).toContain('1 笔 open 代偿未清偿')
  })

  it('锚可解析但全仓无任何轮台账＝真首轮才放行', () => {
    const root2 = join(FIX, 'sim2')
    mkdirSync(join(root2, 'runs', '20261002-v8-run2'), { recursive: true })
    mkdirSync(join(root2, 'var'), { recursive: true })
    writeFileSync(join(root2, 'runs', '20261002-v8-run2', 'state.env'), 'x=1\n')
    // 锚是符号链（真机形态），指向 runs/<id>/state.env；该轮无台账
    execSync(`ln -s ${JSON.stringify(join(root2, 'runs', '20261002-v8-run2', 'state.env'))} ${JSON.stringify(join(root2, 'var', 'current-state.env'))}`)
    const r2 = sh(`AIPAY_SIM_ROOT=${JSON.stringify(root2)} bash mux/mx-compensation-ledger.sh check-clearance`)
    expect(r2.status).toBe(0)
    expect(r2.stdout).toContain('真首轮')
  })
})

describe('② 问题单去重', () => {
  it('gate_blocked 同 (key,step) 只记一次（旧行为每轮重进各记一条）', () => {
    const ev = join(FIX, 'ev')
    mkdirSync(ev, { recursive: true })
    const st = join(FIX, 'state.env')
    writeFileSync(st, '')
    // EVID_DIR 必须在 source 之后赋值——mx-lib 会按 AIPAY_SIM_ROOT 重算它
    const script = `
      export AIPAY_SIM_ROOT=${JSON.stringify(FIX)} STATE=${JSON.stringify(st)} RUN_ID=t
      source mux/mx-lib.sh 2>/dev/null || true
      source mux/mx-scenario-lib.sh 2>/dev/null || true
      EVID_DIR=${JSON.stringify(ev)}
      gate_blocked g4_pass ready
      gate_blocked g4_pass ready
      gate_blocked g4_pass ready
    `
    sh(script)
    const lines = readFileSync(join(ev, 'issues.log'), 'utf8').split('\n').filter((l) => l.startsWith('ISSUE|gate-bypass-blocked|ready|'))
    expect(lines).toHaveLength(1)
  })

  it('帧族两处发射点均带去重（(key,subject) 已记即跳过）', () => {
    const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
    // content-mismatch 发射点
    expect(sc).toContain("key = ('frame-content-mismatch', f\"step-{r['key']}\")")
    expect(sc).toMatch(/if key in seen:\s*\n\s*continue/)
    // md5 盘点发射点
    expect(sc).toContain("if (k, subj) in seen:")
  })
})

describe('③ 报告诚信面（mx-report-gen.py）', () => {
  const gen = readFileSync(join(HARNESS, 'mux', 'mx-report-gen.py'), 'utf8')
  it('摘要按帧核验态分级，不再裸称「全部实拍」', () => {
    // 2026-11-06 帧采集准确性根治批改分段组装（隔离步入注后 _FRAME_PAIR_SAME 归零，
    // 单一固定串会让摘要回落「全部实拍」）；断言语义不变：三态分段＋隔离态在注。
    expect(gen).toContain("_note_segs.append(f'实拍可核验 {_n_fv_ok} 步')")
    expect(gen).toContain("_note_segs.append(f'内容不符 {_n_fv_bad} 步')")
    expect(gen).toContain("_note_segs.append(f'前后零变化 {_n_same_frame_steps} 步')")
    expect(gen).toContain("_note_segs.append(f'零变化已隔离 {_n_voided} 步（不入证据池·问题单在案）')")
  })
  it('记账完成率 + 修复率双指标（记账≠修复）', () => {
    expect(gen).toContain('记账完成率（DISP 分桶）')
    expect(gen).toContain('修复率（已修 ÷ 唯一键）')
    expect(gen).toContain('{n_fixed}/{n_issue_keys}')
  })
  it('净额双行（含代偿/净额并列，方案 §2.6.5 强制）', () => {
    expect(gen).toContain('def _net_pair_table()')
    expect(gen).toContain('净额</b>（判据满足面）')
    expect(gen).toContain('G5 由 director-proxy 代批，净额不计「过」')
  })
})
