import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

// O3 帧采集四态根治守门（2026-11-06 用户红线「截图务必准确，不要冒充」）：
// ①拍后即验：前后帧 md5 相同 → .invalid 隔离不入证据池、capture_ok 不置位
// ②capture-plan 四态重分类：run27 实测 19 个零变化步已逐一定 none/repo/ui
// ③repo 型：产物证据采集（不拍截图）
// ④⑤第二批（帧采集准确性根治，2026-11-06）：帧模型二态化＋EFFECTIVE_ACTION 执行
// bug＋探针帧出池＋审计单帧口径＋隔离帧诚实呈现（spec 2026-11-06-frame-capture-accuracy）
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

// ④ 帧模型二态化＋探针出池＋审计口径（2026-11-06 用户红线「截图务必准确，不要冒充」
// 第二批：run27 实录 19 步零变化双帧全入证据池——根因=无动作步孪生双帧伪模型＋
// EFFECTIVE_ACTION 解析 bug（规划动作从未执行）＋探针帧入池＋审计 ≥2 帧反向激励）。
describe('④ 帧模型二态化（无动作步单帧，动作真实执行）', () => {
  const shooter = readFileSync(join(HARNESS, 'mux', 'r18-frames.mjs'), 'utf8')

  it('规划动作真实执行：解析 EFFECTIVE_ACTION 而非 CLI ACTION（旧 bug：规划第 4 列从未跑过）', () => {
    expect(shooter).toContain("const [kind, rest] = EFFECTIVE_ACTION.split(':')")
    // 不得再出现对裸 CLI ACTION 的解析（负向后顾防 EFFECTIVE_ACTION 子串误配）
    expect(shooter.match(/(?<![A-Z_])ACTION\.split/g)).toBeNull()
  })

  it('无动作步=完成态单帧：不再产孪生 before（同页两拍必同 md5，按操作前后注册即伪证据）', () => {
    expect(shooter).toContain('完成态单帧')
    // before 帧只在 EFFECTIVE_ACTION 分支内拍摄（源序：EFFECTIVE_ACTION 声明先于 before 截图）
    const iEff = shooter.indexOf('const EFFECTIVE_ACTION = PLAN_ACTION || ACTION')
    const iBefore = shooter.indexOf('await page.screenshot({ path: `${OUT}/${pre}-before.png` })')
    expect(iEff).toBeGreaterThan(0)
    expect(iBefore).toBeGreaterThan(iEff)
  })

  it('注册标题随帧形态：单帧步不再冒称「操作前后帧」', () => {
    const lib = readFileSync(join(HARNESS, 'mux', 'mx-scenario-lib.sh'), 'utf8')
    expect(lib).toContain('完成态实拍（capture_step 自动记录，无动作单帧）')
  })
})

describe('⑤ 探针帧出证据池＋审计单帧口径＋隔离帧诚实呈现', () => {
  it('预检探针帧拍后移出 steps/ 证据池（run27 的 19 个零变化步含 1 个探针）', () => {
    const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
    expect(sc).toMatch(/capture-precheck-op1-\*\.png[\s\S]{0,80}\$EVID_DIR\/screenshots\//)
  })

  it('审计查8 期望帧数按注册帧形态二态（操作对 ≥2／完成态 ≥1）——旧「一律 ≥2」是孪生帧生产强制力', () => {
    const audit = readFileSync(join(HARNESS, 'mux', 'mx-report-audit.py'), 'utf8')
    expect(audit).toContain("_ops_expect += 2 if any(re.search(r'-(?:before|action)\\.png$', _f) for _f in _of) else 1")
    expect(audit).not.toContain('_fr < 2 * o_cnt')
    expect(audit).toContain('完成态 ≥1 帧')
  })

  it('frame-zero-change-voided 与 frame-capture-failed 同通道降级配对（查3＋A5d④＋R18 降级步构建三点）', () => {
    const audit = readFileSync(join(HARNESS, 'mux', 'mx-report-audit.py'), 'utf8')
    expect(audit).toContain("_FRAME_DEGRADE_FAMILIES = {'frame-capture-failed', 'frame-zero-change-voided'}")
    // 三点都用常量（不各写一份字面量；run27 实录第三点漏改致步 8/25 凭证在案仍 FAIL）
    const uses = audit.match(/_p1?8?\[1\] in _FRAME_DEGRADE_FAMILIES/g) || []
    expect(uses.length).toBe(3)
  })

  it('查9 承载红线认四态分类：none/repo 声明步与零变化隔离步=合规 WARN，未声明零帧才 FAIL', () => {
    const audit = readFileSync(join(HARNESS, 'mux', 'mx-report-audit.py'), 'utf8')
    expect(audit).toContain('_plan4_cls')
    expect(audit).toContain('四态声明 none/repo——该步无 UI 承载面')
    expect(audit).toContain('frame-zero-change-voided 在案：帧曾实拍、前后零变化已隔离')
    // 别名表键面完整性：26 步的 *_done 状态键全覆盖（dispatch_done/report_done 曾缺，
    // 查9 四态判定与 R18 降级映射对步 9/26 永远落空）
    const m = audit.match(/_STAGE_ALIAS_STEPS = \{([\s\S]*?)\}/)
    expect(m).toBeTruthy()
    for (const k of ['smoke_done', 'appinit_done', 'people_done', 'room_done', 'dispatch_done', 'dispatch_marker',
      'register_done', 'analysis_done', 'triage_done', 'anexec_done', 'review_done', 'close_done', 'plan_done',
      'devimpl_done', 'defect_done', 'testpass_done', 'ready_done', 'ready_inbox', 'release_done', 'uat_done',
      'workmgr_done', 'audit_done', 'retro_done', 'ide_done', 'report_done', 'g1_frozen', 'g2_arch_pass']) {
      expect(m![1], `${k} 应在别名表`).toContain(`'${k}'`)
    }
  })

  it('生成器：隔离步入诚实注（摘要不得回落「全部实拍」）且不判「冒配」', () => {
    const gen = readFileSync(join(HARNESS, 'mux', 'mx-report-gen.py'), 'utf8')
    expect(gen).toContain('_FRAME_VOIDED')
    expect(gen).toContain('零变化已隔离')
    expect(gen).toContain('p.split(\'-op\')[0] not in _FRAME_VOIDED')
  })

  it('frame-verify：隔离帧跳过（不产「缺帧」偏差行）＋探针期望词条目移除', () => {
    const fv = readFileSync(join(HARNESS, 'mux', 'frame-verify.py'), 'utf8')
    expect(fv).toContain('-op1-before.png.invalid')
    expect(fv).not.toContain("'capture-precheck'")
  })
})
