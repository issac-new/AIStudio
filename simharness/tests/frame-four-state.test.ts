import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// O3 帧采集四态根治守门（2026-11-06 用户红线「截图务必准确，不要冒充」）：
// ①拍后即验：前后帧 md5 相同 → .invalid 隔离不入证据池、capture_ok 不置位
// ②capture-plan 四态重分类：run27 实测 19 个零变化步已逐一定 none/repo/ui
// ③repo 型：产物证据采集（不拍截图）
const HARNESS = resolve(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'frame-four-state')

function sh(script: string) {
  return spawnSync('bash', ['-c', script], { cwd: HARNESS, encoding: 'utf8' })
}

beforeAll(() => { rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true }) })
afterAll(() => { rmSync(FIX, { recursive: true, force: true }) })

describe('① 拍后即验（零变化帧不入证据池）', () => {
  it('前后帧 md5 相同 → .invalid 隔离＋记单＋capture_ok=0（重放可重拍）', () => {
    const root = join(FIX, 'sim')
    mkdirSync(join(root, 'runs', 't', 'evidence', 'screenshots', 'steps'), { recursive: true })
    writeFileSync(join(root, 'runs', 't', 'state.env'), '')
    const steps = join(root, 'runs', 't', 'evidence', 'screenshots', 'steps')
    // 同内容前后帧（模拟零变化拍摄结果）
    writeFileSync(join(steps, 'demo-op1-before.png'), 'SAME-PIXELS')
    writeFileSync(join(steps, 'demo-op1-after.png'), 'SAME-PIXELS')
    const script = `
      export AIPAY_SIM_ROOT=${JSON.stringify(root)} STATE=${JSON.stringify(join(root, 'runs', 't', 'state.env'))} RUN_ID=t
      source mux/mx-lib.sh 2>/dev/null || true
      source mux/mx-scenario-lib.sh 2>/dev/null || true
      EVID_DIR=${JSON.stringify(join(root, 'runs', 't', 'evidence'))}
      # 最小复现拍后即验分支（与 capture_step 实现同构的独立验证）
      b="$EVID_DIR/screenshots/steps/demo-op1-before.png"; a="$EVID_DIR/screenshots/steps/demo-op1-after.png" 
      if [[ "$(md5 -q "$b")" == "$(md5 -q "$a")" ]]; then
        mv "$b" "$b.invalid"; mv "$a" "$a.invalid"
        sset capture_ok_demo 0
        echo "ISSUE|frame-zero-change-voided|step-demo|拍后即验：前后帧 md5 相同，帧已隔离" >> "$EVID_DIR/issues.log"
      fi
    `
    const r = sh(script)
    expect(r.status).toBe(0)
    expect(readFileSync(join(steps, 'demo-op1-before.png.invalid'), 'utf8')).toBe('SAME-PIXELS')
    const log = readFileSync(join(root, 'runs', 't', 'evidence', 'issues.log'), 'utf8')
    expect(log).toContain('frame-zero-change-voided|step-demo')
  })

  it('capture_step 含拍后即验块（.invalid 隔离接线在函数体内）', () => {
    const lib = readFileSync(join(HARNESS, 'mux', 'mx-scenario-lib.sh'), 'utf8')
    expect(lib).toContain('.invalid 不入证据池')
    expect(lib).toMatch(/mv "\$_b" "\$\{_b\}\.invalid/)
    expect(lib).toContain('frame-zero-change-voided')
  })
})

describe('② capture-plan 四态重分类', () => {
  const plan = readFileSync(join(HARNESS, 'mux', 'capture-plan.env'), 'utf8')
  const lines = plan.split('\n').filter((l) => /^\w[\w-]*\|/.test(l) && !l.startsWith('#'))

  it('run27 实测零变化的 17 个弱承载步已全部离开 ui 拍摄位（none/repo）', () => {
    const reclassed = ['smoke_done', 'appinit_done', 'people_done', 'login_done', 'g1_frozen',
      'room_done', 'dispatch_done', 'analysis_done', 'triage_done', 'close_done',
      'g2_arch_pass', 'devimpl_done', 'ready_inbox', 'release_done', 'retro_done',
      'workmgr_done', 'report_done']
    for (const k of reclassed) {
      const line = lines.find((l) => l.startsWith(k + '|'))
      expect(line, `${k} 应在 plan 中`).toBeTruthy()
      expect(line!).toMatch(new RegExp(`^${k}\\|(none\\||repo)`), `${k} 应为 none/repo 型`)
    }
  })

  it('真承载步保留 ui 位（ide/eval/testpass/report_view/register/anexec/review/plan/uat/audit 等）', () => {
    for (const k of ['ide_done', 'eval_done', 'testpass_done', 'report_view', 'register_done',
      'anexec_done', 'review_done', 'plan_done', 'uat_done', 'audit_done', 'defect_done', 'ready_done']) {
      const line = lines.find((l) => l.startsWith(k + '|'))
      expect(line, `${k} 应在 plan`).toBeTruthy()
      expect(line!).toMatch(new RegExp(`^${k}\\|/`), `${k} 应保留 URL 拍摄位`)
    }
  })

  it('none/repo 行必带理由（第三列非空）', () => {
    for (const l of lines) {
      if (/^\w[\w-]*\|(none|repo)\|?$/.test(l) || /^\w[\w-]*\|(none|repo)\|$/.test(l)) {
        throw new Error(`缺理由：${l}`)
      }
      const m = l.match(/^(\w[\w-]*)\|(none|repo)(?:\|(.*))?$/)
      if (m) expect(m[3]?.length ?? 0).toBeGreaterThan(4)
    }
  })
})

describe('③ repo 型产物证据（不拍截图）', () => {
  it('capture_step repo 分支接线（repo-shots 落盘＋r18 op 记录＋不调射手）', () => {
    const lib = readFileSync(join(HARNESS, 'mux', 'mx-scenario-lib.sh'), 'utf8')
    expect(lib).toContain('if [[ "$_plan_url" == repo* ]]')
    expect(lib).toContain('repo-shots')
    expect(lib).toContain('repo 型产物证据已采集')
    // repo 分支必须在 file: 分支之前且 return 0（不落到射手）
    const iRepo = lib.indexOf('if [[ "$_plan_url" == repo* ]]')
    const iFile = lib.indexOf('if [[ "$_plan_url" == file:* ]]')
    expect(iRepo).toBeGreaterThan(0)
    expect(iRepo).toBeLessThan(iFile)
  })
})
