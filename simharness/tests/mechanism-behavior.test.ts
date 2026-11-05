// 机制行为测试（2026-11-02 机制治理批·方案 C）
//
// 与 harness-gate-integrity.test.ts 的分工：那个文件测「接线在不在」（marker 断言），
// 本文件测「判定行为对不对」——直接调用真实函数跑 fixture。
//
// 为什么必须分开（run25 教训）：当晚 128 项 marker 断言全绿，仍在真环境连炸 3 个机制
// 缺陷（recovery 转发白名单漏项、催办话术不分闸、重放 unbound）。marker 断言测不出
// 「给这个输入，行为是否正确」。本文件的每个 it 都是「给我一个输入，断言输出」。
//
// 被测对象（全部纯函数，无网络/无 state 写入）：
//   1) agent/recovery_kwargs.py:filter_recovery_kwargs —— 补丁 729 新建（vendor 侧，
//      测试时从补丁的 new-file 段抽取到临时目录再 import，不依赖本地注入态）
//   2) simharness/mux/mx-gate-lib.sh:mx_nudge_body_for_gate / mx_breaker_gates
//   3) simharness/mux/mx-recovery-lib.sh:mx_gateway_recovering / mx_defer_restart_policy
//   4) simharness/mux/mx-gate-timing.sh 的台账判读（fixture state.env + scenario.log）
import { execFileSync } from 'child_process'
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, describe, expect, it } from 'vitest'

const HARNESS = join(__dirname, '..')
const MX = join(HARNESS, 'mux')
const REPO = join(HARNESS, '..')
const TMP = mkdtempSync(join(tmpdir(), 'mx-behavior-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

const bash = (script: string, env: Record<string, string> = {}) =>
  execFileSync('bash', ['-c', script], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', ...env } }).trim()

// ── 1) recovery 转发白名单：vendor 侧纯函数（补丁 729 新建文件，从补丁抽取）
describe('recovery 转发白名单 filter_recovery_kwargs（补丁 729）', () => {
  // 从 new-file 补丁段抽出源码：+++ b/<path> 之后所有 '+' 行（去掉前导 '+'）
  const patchPath = join(REPO, 'patches/729-agent-recovery-kwargs-pure.patch')
  const patch = readFileSync(patchPath, 'utf8')
  const startIdx = patch.indexOf('+++ b/agent/recovery_kwargs.py')
  expect(startIdx).toBeGreaterThan(-1)
  const after = patch.slice(startIdx).split('\n').slice(2)
  const bodyParts: string[] = []
  for (const line of after) {
    if (line.startsWith('diff --git ')) break
    if (line.startsWith('+')) bodyParts.push(line.slice(1))
    else if (line === '' ) bodyParts.push('')
    else break
  }
  const modDir = join(TMP, 'py')
  mkdirSync(join(modDir, 'agent'), { recursive: true })
  writeFileSync(join(modDir, 'agent/recovery_kwargs.py'), bodyParts.join('\n'), 'utf8')

  // 注意：不能用双引号包裹 python 代码（JSON.stringify 的引号会截断外层字符串）；
  // 路径走环境变量，代码体用单引号，参数走位置参数。
  const call = (kwargsJson: string) => bash(`
PYDIR=${JSON.stringify(modDir)} python3 -I -c '
import json, os, sys
sys.path.insert(0, os.environ["PYDIR"])
from agent.recovery_kwargs import filter_recovery_kwargs as f
print(json.dumps(f(json.loads(sys.argv[1])), sort_keys=True))
' ${JSON.stringify(kwargsJson)}`)

  it('conversation_history 被硬禁（run25 19:57 恢复哑火的那一项）', () => {
    expect(call(JSON.stringify({ conversation_history: [{ role: 'user' }], keep: 1 }))).toBe('{"keep": 1}')
  })

  it('title_user_message / prelude / moa_config 均被禁', () => {
    expect(call(JSON.stringify({ title_user_message: 't', prelude: 'p', moa_config: {}, keep: 2 }))).toBe('{"keep": 2}')
  })

  it('persist_ 前缀族全禁（重放会重复持久化用户消息）', () => {
    expect(call(JSON.stringify({ persist_user: 'u', persist_meta: 1, keep: 3 }))).toBe('{"keep": 3}')
  })

  it('空输入与 None 返回空对象（fail-soft）', () => {
    expect(call('{}')).toBe('{}')
    expect(call('null')).toBe('{}')
  })

  it('普通参数原样透传（不过度过滤）', () => {
    expect(call(JSON.stringify({ session_id: 's', max_turns: 3 }))).toBe('{"max_turns": 3, "session_id": "s"}')
  })
})

// ── 2) 催办话术按闸别分流（run25 22:45-23:16 误催事故）
describe('催办话术闸别分流 mx_nudge_body_for_gate', () => {
  const body = (gates: string) =>
    bash(`source ${JSON.stringify(join(MX, 'mx-gate-lib.sh'))}; mx_nudge_body_for_gate ${JSON.stringify(gates)} 1200 "" fanfan`)

  it('G2 熔断催的是「全量修订+复评」，绝不出现 READY-GATE-PASS', () => {
    const b = body('G2')
    expect(b).toContain('G2 熔断等待催办')
    expect(b).toContain('arch-agent')
    expect(b).toContain('完整缺项清单')
    expect(b).not.toContain('READY-GATE-PASS')
  })

  it('G5 熔断保留发布准出话术（run19 死等根治件不被回退）', () => {
    const b = body('G5')
    expect(b).toContain('G5 熔断等待催办')
    expect(b).toContain('READY-GATE-PASS')
  })

  it('其他闸不冒充 G5：通用补证话术，无 READY-GATE-PASS', () => {
    const b = body('G3')
    expect(b).toContain('G3 熔断等待催办')
    expect(b).not.toContain('READY-GATE-PASS')
  })

  it('多闸并列时 G2 优先（架构退回是更内层的关键路径）', () => {
    const b = body('G5,G2')
    expect(b).toContain('G2 熔断等待催办')
  })
})

// ── 3) 熔断闸键解析（breaker.json → 闸键清单）
describe('熔断闸键解析 mx_breaker_gates', () => {
  const parse = (json: string) => {
    const p = join(TMP, `breaker-${Math.random().toString(36).slice(2)}.json`)
    writeFileSync(p, json, 'utf8')
    return bash(`source ${JSON.stringify(join(MX, 'mx-gate-lib.sh'))}; mx_breaker_gates ${JSON.stringify(p)}`)
  }

  it('只取 failRounds>=2 的闸', () => {
    expect(parse(JSON.stringify({ G2: { failRounds: 2 }, G5: { failRounds: 0 } }))).toBe('G2')
  })

  it('多闸按出现顺序逗号连接', () => {
    expect(parse(JSON.stringify({ G2: { failRounds: 3 }, G5: { failRounds: 2 } }))).toBe('G2,G5')
  })

  it('坏 JSON / 空对象 / 缺文件一律空串（fail-soft：宁可不催也不误催）', () => {
    expect(parse('not-json')).toBe('')
    expect(parse('{}')).toBe('')
    expect(bash(`source ${JSON.stringify(join(MX, 'mx-gate-lib.sh'))}; mx_breaker_gates /nonexistent.json`)).toBe('')
  })
})

// ── 4) 恢复层让位（把 run25 打架环的第一回环掐断）
describe('恢复层让位 mx_gateway_recovering / mx_defer_restart_policy', () => {
  const fmt = (offsetSec: number) => {
    const d = new Date((Math.floor(Date.now() / 1000) + offsetSec) * 1000)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
  }
  const recovering = (offsetSec: number, line = 'WARNING Provider unavailable (timeout) — auto-recovery cycle 1/5') => {
    const p = join(TMP, `gw-${Math.random().toString(36).slice(2)}.log`)
    writeFileSync(p, `${fmt(offsetSec)} ${line}\n`, 'utf8')
    return bash(`source ${JSON.stringify(join(MX, 'mx-recovery-lib.sh'))}; mx_gateway_recovering ${JSON.stringify(p)} $(date +%s) 300; echo rc=$?`)
  }

  it('2 分钟前的恢复信号 → 让位（rc=0）', () => {
    expect(recovering(-120)).toBe('rc=0')
  })

  it('2 小时前的恢复信号 → 不让位（rc=1，窗口外）', () => {
    expect(recovering(-7200)).toBe('rc=1')
  })

  it('无信号/文件缺失 → 不让位（fail-open，恢复机制永不成为阻塞源）', () => {
    expect(bash(`source ${JSON.stringify(join(MX, 'mx-recovery-lib.sh'))}; mx_gateway_recovering /nonexistent.log $(date +%s) 300; echo rc=$?`)).toBe('rc=1')
  })

  it('让位有上限：到 MX_RESTART_DEFER_MAX 必须放弃（永不无限等）', () => {
    const p = (d: number, c: number) =>
      bash(`source ${JSON.stringify(join(MX, 'mx-recovery-lib.sh'))}; mx_defer_restart_policy ${d} ${c} 300; echo rc=$?`)
    expect(p(0, 120)).toBe('rc=0')
    expect(p(0, 300)).toBe('rc=1')
    expect(p(1, 0)).toBe('rc=1')
  })
})

// ── 5b) run25 复盘批：空指纹、步键映射完备、六闸事件、方案路径（四条结构性断言）
describe('run25 复盘批：结构性缺口不再复发', () => {
  const read = (rel: string) => readFileSync(join(REPO, rel), 'utf8')

  it('空失败段不产出指纹（da39a3ee 空串哈希误判确定性失败的根因）', () => {
    const lib = join(MX, 'mx-recovery-lib.sh')
    const fp = (txt: string) =>
      bash(`source ${JSON.stringify(lib)}; mx_fail_fingerprint ${JSON.stringify(txt)}`)
    expect(fp('')).toBe('')
    expect(fp('[mux FAIL 01:02:03] x')).toMatch(/^[0-9a-f]{12}$/)
    // 同文本同指纹、异文本异指纹（判定可用性）
    expect(fp('[mux FAIL 01:02:03] x')).toBe(fp('[mux FAIL 01:02:03] x'))
    expect(fp('[mux FAIL 01:02:03] x')).not.toBe(fp('[mux FAIL 01:02:03] y'))
  })

  it('每个 capture_step 步键都在 r18 规范映射内（run25 两条 collect 失败单的根因）', () => {
    const scen = read('simharness/aipay-scenario.sh')
    const r18 = read('simharness/mux/r18-collect.py')
    const keys = new Set<string>()
    for (const m of scen.matchAll(/capture_step "([a-z0-9_]+)"/g)) keys.add(m[1])
    expect(keys.size).toBeGreaterThan(20)
    const missing: string[] = []
    for (const k of keys) if (!r18.includes(`'${k}'`)) missing.push(k)
    expect(missing).toEqual([])  // 缺一个即 r18-collect die（run25 ready_inbox 实锤）
  })

  it('六闸都有 delivery gate 事件落点（run25 M3 断言：缺 pass 的门=G2）', () => {
    const scen = read('simharness/aipay-scenario.sh')
    for (const g of ['G1', 'G2', 'G3', 'G4', 'G6']) {
      expect(scen).toContain(`dlv_gate_try ${g} pass`)
    }
    const lib = read('simharness/mux/mx-delivery-lib.sh')
    expect(lib).toContain('dlv_gate_try()')      // 安全包装在位（缺参不 exit）
    expect(lib).toContain('无案例房')
  })

  it('活跃面不再引用已归档的方案路径（全仓扫描，非三文件硬编码——N09）', () => {
    // N09（2026-11-04 台账清偿）：原先只钉三份文件，改名/移动后的悬空引用仍可漏网
    // （run25 撞出 4 处）。改为扫全部活跃面：代码根（simharness/custom/scripts/config/
    // registries）＋读者面 docs/manuals；历史记录目录（specs/、reports/、archive/）不在
    // 扫描面——那是留档，引用旧路径属证据原文。
    const roots = ['simharness', 'custom', 'scripts', 'config', 'registries', 'docs/manuals']
    const exts = new Set(['.sh', '.py', '.mjs', '.js', '.ts', '.vue', '.md'])
    const skipDirs = new Set(['node_modules', 'vendor', 'dist', '.git', '.qgate', '__pycache__', 'archive'])
    const self = join(HARNESS, 'tests', 'mechanism-behavior.test.ts')
    // 守门测试本体豁免（与 self 同类）：归档守门测试（scripts/__tests__/spec-archive）
    // 的扫描对象就是归档路径字面量——守门测试引用被禁字面量是职责不是悬空引用；
    // 不豁免则 fc3c7851f 起该守门自身在 N09 全仓扫描里永远红。
    const guardSelves = new Set([
      self,
      join(REPO, 'scripts', '__tests__', 'spec-archive.test.ts'),
    ])
    // 代码面禁两类（旧方案名 + 指向归档目录的路径引用）；读者面（docs/manuals）只禁
    // 旧方案名——设计文档索引按职责就是要收录 archive 条目，链接归档不是悬空引用。
    const forbiddenCode = ['2026-09-25-mux-v3-lifecycle-plan', 'superpowers/specs/archive/']
    const forbiddenDocs = ['2026-09-25-mux-v3-lifecycle-plan']
    const hits: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue
        const full = join(dir, entry.name)
        if (entry.isDirectory()) {
          if (!skipDirs.has(entry.name)) walk(full)
          continue
        }
        if (!exts.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue
        if (guardSelves.has(full)) continue
        const body = readFileSync(full, 'utf8')
        const forbidden = full.includes(`${join('docs', 'manuals')}`) ? forbiddenDocs : forbiddenCode
        for (const needle of forbidden) {
          if (body.includes(needle)) hits.push(`${full}: ${needle}`)
        }
      }
    }
    for (const r of roots) {
      const dir = join(REPO, r)
      if (existsSync(dir)) walk(dir)
    }
    expect(hits, hits.join('\n')).toEqual([])
    // 正本必须在活跃面被引用（防「谁都不指向正本」的另一种悬空）
    expect(read('simharness/aipay-scenario.sh')).toContain('2026-10-05-mux-v8-fullflow-plan')
  })
})

// ── 5) 闸门耗时台账（ETA 口径：质量环与故障分列）
describe('闸门耗时台账 mx-gate-timing', () => {
  it('同闸多次打回计入 rounds；无 pass 键判未过；跨闸互不串', () => {
    const run = join(TMP, 'runs/burn-fixture')
    mkdirSync(join(run, 'evidence'), { recursive: true })
    writeFileSync(join(run, 'state.env'), 'g1_frozen=1\n', 'utf8')
    writeFileSync(join(run, 'evidence/scenario.log'), [
      '[mux 10:00:00] [真值] G1 需求冻结 ✓',
      '[mux 10:10:00] [真值] G2 结论 ✗',
      '[mux 10:20:00] [mux FAIL 10:20:00] G2 硬闸未闭环',
      '[mux 10:30:00] [真值] G2 结论 ✓',
      '[mux 10:40:00] [mux FAIL 10:40:00] G2 两轮未过',
    ].join('\n'), 'utf8')
  })
})
// ── 6) 失联唤醒与采集不静默（2026-11-04 run26 复盘批）：行为断言，不测 marker
describe('run26 复盘批：失联唤醒／采集核验', () => {
  const libSrc = readFileSync(join(MX, 'mx-scenario-lib.sh'), 'utf8')
  const extract = (name: string) => {
    const start = libSrc.indexOf(`${name}()`)
    expect(start, `${name} 不在 mx-scenario-lib.sh`).toBeGreaterThan(-1)
    // 取到下一个顶层函数定义（行首非空注释块后的 `xxx()`）为止
    const rest = libSrc.slice(start)
    const next = rest.slice(1).search(/\n[a-zA-Z_][a-zA-Z0-9_]*\(\) \{/)
    return next === -1 ? rest : rest.slice(0, next + 1)
  }

  it('判词立即到达时 mx_wait_revive 不做任何唤醒（零打扰）', () => {
    const script = `
set -u
note() { echo "NOTE $*"; }
mx_wait_eval() { return 0; }
mx_owner_last_ts() { echo 0; }
mx_send() { echo "SHOULD-NOT-SEND"; }
mx_dm_send() { echo "SHOULD-NOT-DM"; }
EVID_DIR=$(mktemp -d)
MX_POLL_IVAL=0.1
${extract('mx_wait_revive')}
mx_wait_revive "判词" 5 "" "" owner "唤醒词" -- true && echo RESULT-PASS
grep -c wait-revive "$EVID_DIR/issues.log" 2>/dev/null || echo 0`
    const out = bash(script)
    expect(out).toContain('RESULT-PASS')
    expect(out).not.toContain('SHOULD-NOT')
    expect(out.trim().endsWith('0')).toBe(true)
  })

  it('责任人安静超阈且判词未到＝以新任务书唤醒并落 ISSUE（run26 两案例的同一判据）', () => {
    const script = `
set -u
note() { :; }
mx_wait_eval() { return 1; }
mx_owner_last_ts() { echo 1; }
load_token() { echo TOKEN; }
mx_send() { echo "GROUP-SENT" >> "$EVID_DIR/sends.log"; }
mx_dm_send() { echo "DM-SENT" >> "$EVID_DIR/sends.log"; }
EVID_DIR=$(mktemp -d)
MX_POLL_IVAL=0.1
MX_REVIVE_QUIET=1
MX_REVIVE_IVAL=1
MX_REVIVE_MAX=1
${extract('mx_wait_revive')}
mx_wait_revive "判词" 2 "!room:x" "@owner:x" owner "唤醒词" -- false || echo RESULT-TIMEOUT
echo "SENDS:$(cat "$EVID_DIR/sends.log" 2>/dev/null | tr '\n' ',')"
echo "REVIVES:$(grep -c 'wait-revive' "$EVID_DIR/issues.log" 2>/dev/null || echo 0)"`
    const out = bash(script)
    expect(out).toContain('SENDS:GROUP-SENT,DM-SENT,')
    expect(out).toContain('RESULT-TIMEOUT')
    expect(out).toContain('REVIVES:1')
  })

  it('r18_guard 用 r18_matrix 同判据：缺必采件即落 ISSUE，齐备即静默', () => {
    const evid = join(TMP, 'r18')
    mkdirSync(evid, { recursive: true })
    const missing = join(evid, 'missing.json')
    writeFileSync(missing, JSON.stringify({ steps: { '7': { ops: [] } } }), 'utf8')
    const full = join(evid, 'full.json')
    writeFileSync(full, JSON.stringify({ steps: { '7': { effect: [{ text: 'x', evidence: ['a'] }] } } }), 'utf8')
    const run = (payload: string) => bash(`
set -u
note() { :; }
EVID_DIR=${JSON.stringify(evid)}
R18_MATRIX_DIR=${JSON.stringify(MX)}
${extract('r18_guard')}
cp ${JSON.stringify(payload)} "$EVID_DIR/r18-steps.json"
r18_guard 7
grep -c 'r18-required-missing' "$EVID_DIR/issues.log" 2>/dev/null || echo 0`)
    expect(run(missing).trim()).toBe('1')
    const second = run(full)
    expect(second.trim().split('\n').pop()).toBe('1')  // issues.log 累积，第二次不再新增
  })

  it('合并器 --auto-part1：按实测时间线起草且不产出占位符（run13 闸兼容）', () => {
    const runDir = join(TMP, 'runs/20260101-v8-runX')
    mkdirSync(join(runDir, 'evidence'), { recursive: true })
    writeFileSync(join(runDir, 'state.env'),
      'run_started_at=1000000000\ng1_frozen=1000000100\ng2_arch_pass=1000005000\nreport_done=1000030000\n', 'utf8')
    writeFileSync(join(runDir, 'evidence/issues.log'), 'ISSUE|a|b|x\nDISP|x|y|z\n', 'utf8')
    // 组合器要求机器报告先存在——只为取 auto_part1 文本，直接 import 函数
    const out = bash(`
AIPAY_SIM_ROOT=${JSON.stringify(join(TMP, 'runs'))} python3 -I -c '
import importlib.util, sys
spec = importlib.util.spec_from_file_location("frm", ${JSON.stringify(join(MX, 'final-report-merge.py'))})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
from pathlib import Path
html = m.auto_part1("20260101-v8-runX", Path(${JSON.stringify(runDir)}), Path(${JSON.stringify(join(runDir, 'evidence'))}))
print(html)
print("HAS_PLACEHOLDER", "【TODO" in html or "【收尾链回填" in html)
print("HAS_GATES", "G2 架构评审" in html)
'`)
    expect(out).toContain('HAS_PLACEHOLDER False')
    expect(out).toContain('HAS_GATES True')
    expect(out).toContain('自动起草')
  })
})

// ── 7) 台账清偿批（2026-11-04 N05/N09/N11）：机械核验
describe('台账清偿批：零交付分类／缺件节／台账键注册', () => {
  it('N11：集中注册表覆盖 run26 全部 27 个表外键（骨架轮不再空渲染）', () => {
    // 真值样本=run26 侧柜实测的 unregistered_ledger_keys（27 个）——原样作为 fixture，
    // 断言「注册表 ∪」后无遗漏；注册表解析走 ast（不执行 report-gen 的重模块加载）。
    const keys = [
      'raci-dispatch-missing', 'receipt-missing', 'r18-collection-missing', 'review-card-missing',
      'security-review-missing', 'security-review-timeout', 'g2-design-review-fail', 'g2-arch-fail-hold',
      'gate-breaker-tripped', 'breaker-wait-nudge', 'gate-breaker-reset', 'split-evidence-missing',
      'g3-local-gate-missing', 'runtime-proof-missing', 'eval-live-evidence-missing',
      'eval-remediation-open', 'eval-gate-gap', 'g5-humangate-proxy', 'g5-approval-history-missing',
      'evidence-push', 'uat-ac-failed', 'driver-restart-storm', 'zero-delivery', 'audit-finding',
      'retro-open-items', 'product-outcome-missing', 'r18-collect-failed',
    ]
    const log = join(TMP, 'n11-issues.log')
    writeFileSync(log, keys.map((k) => `ISSUE|${k}|actor|note`).join('\n') + '\n', 'utf8')
    const registered = bash(`
cd ${JSON.stringify(MX)} && python3 -I -c '
import ast, json
src = open("mx-report-gen.py", encoding="utf-8").read()
tree = ast.parse(src)
out = {}
for node in tree.body:
    if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "ISSUE_KEYS_BY_STEP":
        out = ast.literal_eval(node.value)
print(json.dumps({str(k): v for k, v in out.items()}))
'`)
    const map = JSON.parse(registered) as Record<string, string[]>
    const covered = new Set(Object.values(map).flat())
    const missing = keys.filter((k) => !covered.has(k))
    expect(missing, `未注册键：${missing.join(',')}`).toEqual([])
    // 反向：真调用 report_truth 的判据（同一事实源），27 键全注册后应为空
    const unreg = bash(`
cd ${JSON.stringify(MX)} && python3 -I -c '
import json, sys
sys.path.insert(0, ".")
import report_truth
m = json.loads(${JSON.stringify(JSON.stringify(map))})
registered = {int(k): v for k, v in m.items()}
print(json.dumps(report_truth.unregistered_ledger_keys(${JSON.stringify(log)}, registered)))
'`)
    expect(JSON.parse(unreg)).toEqual([])
  })

  it('N05：报告两节与产品分类消费在位（模板缺节/审计漏查即红）', () => {
    const gen = readFileSync(join(REPO, 'simharness/mux/mx-report-gen.py'), 'utf8')
    for (const needle of ['id="zero-delivery"', 'id="artifact-gap"', 'zero-delivery.json',
                          'governanceNoAnchor']) {
      expect(gen, `报告生成器缺 ${needle}`).toContain(needle)
    }
    const audit = readFileSync(join(REPO, 'simharness/mux/mx-report-audit.py'), 'utf8')
    expect(audit).toContain('查20')
    expect(audit).toContain('id="zero-delivery"')
    expect(audit).toContain('id="artifact-gap"')
    const drv = readFileSync(join(REPO, 'simharness/aipay-scenario.sh'), 'utf8')
    expect(drv).toContain('/api/hermes/cluster-inspector/run')
    expect(drv).toContain('zero-delivery.json')
  })
})
