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
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
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

  it('活跃代码不再引用已归档的方案路径（悬空引用=单一事实源破坏）', () => {
    const files = ['simharness/aipay-scenario.sh', 'simharness/mux/mx-report-gen.py',
                   'simharness/mux/mx-scenario-lib.sh']
    for (const f of files) {
      expect(read(f)).not.toContain('2026-09-25-mux-v3-lifecycle-plan')
      expect(read(f)).toContain('2026-10-05-mux-v8-fullflow-plan')
    }
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
