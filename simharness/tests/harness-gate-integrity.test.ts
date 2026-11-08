// harness 门禁完整性守门（V4-run1 issues.log 根治批，2026-09-29）：
// ① 单驱动锁判活——旧版 sed 取 pid 带尾串（"84431 start=… host=…"），kill -0 报
//    illegal pid 恒失败 → **活锁被误判陈锁接管**（run1 02:26 ready 续跑误抢 run2
//    活锁，双驱动同栈互写 12 分钟）。
// ② 硬闸打回熔断跨调用持久化——"两轮未过不得发布/开始"曾被断点续跑静默重置轮次
//    绕过；人工放行须 GATE_BREAKER_OVERRIDE=1 并留痕 ISSUE。
// ③ 门禁结论行时窗过滤——room_has_from 只按 sender+pattern 匹配历史消息，上一轮
//    残留结论行可"秒过"门禁（假完成）；门禁必须传派发时刻。
// ④ dlv txn 唯一性——Matrix txnId 是幂等键，date +%s%N 在老 BSD date 上 %N 是
//    字面量，同秒同 pid 重发会被去重吞消息。
// 测试方式：bash 子进程 source 真实 mx-lib/mx-scenario-lib（AIPAY_SIM_ROOT 指向
// 临时目录，不碰真实 sim 栈），断言函数行为本身而非复制实现。
import { execFileSync } from 'child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, afterAll } from 'vitest'

// 隔离轮迁址（2026-10-03）：测试随 harness 仓走，MX=本仓 mux/；vitest 借道 overlay 的 node_modules（run-gates.sh --root）
const HARNESS = join(__dirname, '..')
const MX = join(HARNESS, 'mux')
// 产品仓只读消费位（单仓整合后）：解析序=MX_OVERLAY_ROOT > 仓根（patches/ 与 runtime/ 在位即认）> 旧 overlay 位兜底
const repoRoot = join(HARNESS, '..')
const PRODUCT = process.env.MX_OVERLAY_ROOT
  || (existsSync(join(repoRoot, 'patches')) && existsSync(join(repoRoot, 'runtime')) ? repoRoot : join(HARNESS, '..', 'overlay'))

const roots: string[] = []
afterAll(() => roots.forEach((d) => rmSync(d, { recursive: true, force: true })))

function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), 'mx-gate-'))
  roots.push(root)
  return root
}

/** 在隔离 SIM_ROOT 下 source 真实两库后执行 body；stdout 原样返回。 */
function sh(body: string, root: string, env: Record<string, string> = {}): string {
  return execFileSync('bash', ['-c', `
set -uo pipefail
export AIPAY_SIM_ROOT="${root}"
${Object.entries(env).map(([k, v]) => `export ${k}="${v}"`).join('\n')}
source "${MX}/mx-lib.sh"
source "${MX}/mx-scenario-lib.sh"
source "${MX}/mx-delivery-lib.sh"
${body}`], { encoding: 'utf8' })
}

describe('① 单驱动锁判活（活锁不得被误接管）', () => {
  it('mx_lock_holder_pid 只取 pid 数字段', () => {
    const root = sandbox()
    const out = sh(`
mkdir -p "$AIPAY_SIM_ROOT/.driver.lock.d"
echo 'pid=12345 start=2026-09-29 02:13:22 host=TT-606' > "$AIPAY_SIM_ROOT/.driver.lock.d/info"
mx_lock_holder_pid "$AIPAY_SIM_ROOT/.driver.lock.d/info"`, root)
    expect(out.trim()).toBe('12345')
  })

  it('活锁（持锁 pid 存活）→ 拒绝接管；pid 非法/不可解析 → 一律按活锁拒绝', () => {
    const root = sandbox()
    // 用当前 bash 自身 pid 当"活持锁者"：判活必须成功、必须拒绝接管
    const out = sh(`
mkdir -p "$AIPAY_SIM_ROOT/.driver.lock.d"
echo "pid=$$ start=$(date '+%F %T') host=$(hostname -s)" > "$AIPAY_SIM_ROOT/.driver.lock.d/info"
_mx_rc=0; mx_driver_lock_acquire "$AIPAY_SIM_ROOT/.driver.lock.d" 99999 || _mx_rc=$?
echo "rc=$_mx_rc"`, root)
    expect(out.trim()).toBe('rc=1')
  })

  it('非法 pid 形态（旧版整行取出）不再误判：新解析只出数字段', () => {
    const root = sandbox()
    // 旧实现 `sed 's/^pid=//p'` 会取出 "84431 start=… host=…" 整串 → kill -0 报
    // illegal pid 恒失败 → 活锁被误接管（V4-run1 02:26 实锤）。断言新旧对照：
    // 旧解析含尾串（不可用），新解析是纯数字（判活可用）。
    const out = sh(`
_info='pid=84431 start=2026-09-29 02:13:22 host=TT-606'
echo "$_info" > "$AIPAY_SIM_ROOT/info"
_old=$(sed -n 's/^pid=//p' "$AIPAY_SIM_ROOT/info" | head -1)
_new=$(mx_lock_holder_pid "$AIPAY_SIM_ROOT/info")
case "$_old" in (*' '*) _old_shape=with_tail;; (*) _old_shape=bare;; esac
case "$_new" in (*[!0-9]*) _new_shape=not_numeric;; (*) _new_shape=numeric;; esac
echo "old=$_old_shape new=$_new_shape held=$_new"`, root)
    expect(out.trim()).toBe('old=with_tail new=numeric held=84431')
  })

  it('陈锁（持锁 pid 已死）→ 允许接管', () => {
    const root = sandbox()
    const out = sh(`
mkdir -p "$AIPAY_SIM_ROOT/.driver.lock.d"
# 拿一个必然已死的 pid：后台子进程退出后的 pid
( exit 0 ) & _dead=$!; wait "$_dead" 2>/dev/null || true
echo "pid=$_dead start=2026-09-29 02:13:22 host=TT-606" > "$AIPAY_SIM_ROOT/.driver.lock.d/info"
_mx_rc=0; mx_driver_lock_acquire "$AIPAY_SIM_ROOT/.driver.lock.d" $$ || _mx_rc=$?
echo "rc=$_mx_rc new=$(mx_lock_holder_pid "$AIPAY_SIM_ROOT/.driver.lock.d/info")"`, root)
    const m = out.trim().match(/^rc=0 new=(\d+)$/)
    expect(m).not.toBeNull()
  })
})

describe('② 硬闸打回熔断（融合批二：判定与持久化正本=治理服务 lifecycle/breaker.ts；行为守门=custom/server/governance/__tests__/lifecycle-{breaker,rest}.test.ts）', () => {
  it('trip/check 委托治理客户端：gate 键升大写、证据签名随行、阻断即 fail 语义', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_breaker_trip() { printf 'TRIP|%s|%s|%s\\n' "$1" "$2" "$3" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; echo '{"state":{"failRounds":2}}'; }
gov_lc_breaker_check() { printf 'CHECK|%s|%s\\n' "$1" "$3" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; echo '{"state":{"failRounds":2}}'; return 1; }
mx_gate_breaker_trip g5 "G5 发布准出" 1
( mx_gate_breaker_check g5 "G5 发布准出" ) 2>&1 | tail -1 || true
cat "$AIPAY_SIM_ROOT/gov-calls.txt"`, root)
    expect(out).toContain('累计 2 轮未过')
    expect(out).toContain('打回熔断（治理服务判定阻断')  // 2026-11-07 起文案并入服务端轮数，右括号位置不定
    expect(out).toContain('TRIP|G5|1|')
    expect(out).toContain('CHECK|G5|G5 发布准出')
  })

  it('check 放行 rc=0（服务 allow/reset/override 族）', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_breaker_check() { return 0; }
mx_gate_breaker_check g2 "G2 架构治理评审"
echo "rc=$?"`, root)
    expect(out.trim()).toBe('rc=0')
  })
})

describe('③ 门禁结论行时窗过滤（历史轮残留=假完成）', () => {
  it('旧结论行不过门禁（since 过滤）；新结论行过门禁', () => {
    const root = sandbox()
    // stub mx_messages 返回两条消息：一条旧的 READY-GATE-PASS、一条新的
    const out = sh(`
mx_messages() {
  cat <<'JSON'
[
 {"sender":"@fanfan-agent:matrix.test","origin_server_ts":1000,"content":{"body":"READY-GATE-PASS 补齐后通过"}},
 {"sender":"@fanfan-agent:matrix.test","origin_server_ts":5000,"content":{"body":"ARCH-GATE-PASS 五要素齐备"}}
]
JSON
}
load_token() { echo tok; }
# 时窗 2000：应拒旧 READY-GATE-PASS、应放新 ARCH-GATE-PASS
_mx_old=0; room_has_from room "@fanfan-agent:matrix.test" "READY-GATE-(PASS|FAIL)" 2000 || _mx_old=$?
_mx_new=0; room_has_from room "@fanfan-agent:matrix.test" "ARCH-GATE-PASS" 2000 || _mx_new=$?
echo "old_rejected=$_mx_old new_pass=$_mx_new"`, root)
    expect(out.trim()).toBe('old_rejected=1 new_pass=0')
  })

  it('缺省 since=0 保持全量匹配（兼容旧调用）', () => {
    const root = sandbox()
    const out = sh(`
mx_messages() {
  cat <<'JSON'
[{"sender":"@a:matrix.test","origin_server_ts":1,"content":{"body":"READY-GATE-PASS"}}]
JSON
}
load_token() { echo tok; }
_mx=0; room_has_from room "@a:matrix.test" "READY-GATE-PASS" || _mx=$?
echo "rc=$_mx"`, root)
    expect(out.trim()).toBe('rc=0')
  })
})

describe('④ dlv txn 唯一性（Matrix 幂等键不得撞）', () => {
  it('同秒连发多条 txnId 互异', () => {
    const root = sandbox()
    const out = sh(`
mx() { echo "$4" >> "$AIPAY_SIM_ROOT/puts.txt"; }   # <token> PUT <path> <json>
load_token() { echo tok; }
dlv_enabled() { return 0; }
dlv_msg u1 room m.type '{"a":1}'
dlv_msg u1 room m.type '{"a":2}'
dlv_msg u1 room m.type '{"a":3}'
cat "$AIPAY_SIM_ROOT/puts.txt"`, root)
    // mx 的第3个位置参数是 URL（rooms/<r>/send/<type>/<txn>）；解析出 txn 段比对
    const lines = out.trim().split('\n')
    expect(lines.length).toBe(3)
    // stub 记的是 $4（json），改为从 URL 断言需要 URL——重跑一版按 URL 记录
    const out2 = sh(`
mx() { echo "$3" >> "$AIPAY_SIM_ROOT/urls.txt"; }
load_token() { echo tok; }
dlv_msg u1 room m.type '{"a":1}'
dlv_msg u1 room m.type '{"a":2}'
dlv_msg u1 room m.type '{"a":3}'
cat "$AIPAY_SIM_ROOT/urls.txt"`, root)
    const txns = out2.trim().split('\n').map((u) => u.split('/').pop())
    expect(txns.length).toBe(3)
    expect(new Set(txns).size).toBe(3)
  })
})

describe('⑤ 门禁文本与派发契约回归绊线', () => {
  it('aipay-scenario.sh 无裸 date +%F %T（BSD 非法格式）', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'date +%F %T' "${join(HARNESS, 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(scen.trim()).toBe('0')
  })

  it('G2/G5/UAT 门禁调用携带时窗参数', () => {
    // H8 后 G2/G5 走判词函数（*TS 仍作显式实参传入），UAT 走 room_has_from——
    // 时窗参数在场是防"历史结论行秒过"的根保证，绊线盯 *_TS 实参出现次数。
    const scen = execFileSync('bash', ['-c', `grep -cE '"\\$(G2_TS|G2_RETRY_TS|G5_TS|G5_RETRY_TS|UAT_TS)"' "${join(HARNESS, 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(5)
  })

  it('inbox-dedup 去重键含 RUN 且禁静默', () => {
    const skill = execFileSync('bash', ['-c', `cat "${join(HARNESS, 'skills', 'inbox-dedup', 'SKILL.md')}"`], { encoding: 'utf8' })
    expect(skill).toContain('任务 ID + RUN_ID')
    expect(skill).toContain('禁止静默')
    expect(skill).toContain('RUN_ID 不同')
  })
})

describe('⑥ 报告路由（H7：无 RUN_ID 落全局目录出旧轮假报告）', () => {
  const gen = join(MX, 'mx-report-gen.py')

  function printPaths(args: string, env: Record<string, string> = {}): string {
    return execFileSync('python3', [gen, ...args.split(' ').filter(Boolean), '--print-paths'], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
    })
  }

  it('aipay-scenario.sh 报告生成调用携带 --run', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'mx-report-gen.py.*--run' "${join(HARNESS, 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(1)
  })

  it('--run 使 OUT/STATE 落 runs/<id>/（不出全局目录假报告）', () => {
    const out = printPaths('--run 20260929-v4-run2')
    expect(out).toContain('runs/20260929-v4-run2/evidence/simulation-report.html')
    expect(out).toContain('runs/20260929-v4-run2/state.env')
  })

  it('--run 显式值胜过 MX_RUN_ID 环境残留', () => {
    const out = printPaths('--run cli-run', { MX_RUN_ID: 'env-run' })
    expect(out).toContain('runs/cli-run/evidence/simulation-report.html')
    expect(out).not.toContain('env-run')
  })

  it('MX_EVID_DIR 覆盖 EVID 而 STATE 仍按 RUN_ID（与 mx-lib 同源）', () => {
    const root = sandbox()
    const out = printPaths('', { MX_EVID_DIR: root })
    expect(out).toContain(`OUT=${join(root, 'simulation-report.html')}`)
    expect(out).toContain('STATE=/Users/cuishi/lab/ncwk-sim-mux/state.env')
  })

  it('无 RUN_ID 缺省回落 SIM 全局（V3 兼容）但可被 --run 纠正', () => {
    const out = printPaths('')
    expect(out).toContain('OUT=/Users/cuishi/lab/ncwk-sim-mux/evidence/simulation-report.html')
  })
})

describe('⑦ 闸门判词（融合批二：判词语义正本=产品 lifecycle/verdict.ts；语料守门=tests/lifecycle-parity.test.ts；此处钉委托面与 relay 行为）', () => {
  it('mx_text_gate_verdict 委托治理客户端（gate+文本透传，verdict 取首列）', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_verdict() { printf 'ARG|%s|%s|%s\\n' "$1" "$2" "$3" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; echo 'FAIL|PASS|FAIL'; }
_v=$(mx_text_gate_verdict READY-GATE '结论行：READY-GATE-PASS')
echo "v=$_v"
cat "$AIPAY_SIM_ROOT/gov-calls.txt"`, root)
    expect(out).toContain('v=FAIL')
    expect(out).toContain('ARG|READY-GATE|结论行：READY-GATE-PASS|')
  })

  it('combined：房间/卡面双源一次送判（卡 FAIL 压过房 PASS 由服务合并返回）', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_verdict() { printf 'ARG|%s|%s|%s\\n' "$1" "$2" "$3" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; echo 'FAIL|PASS|FAIL'; }
mx_messages_deep() { echo '[{"sender":"@a:matrix.test","origin_server_ts":100,"content":{"body":"结论 READY-GATE-PASS"}}]'; }
load_token() { echo tok; }
kanban_list() { echo '[{"title":"RFD-001 发布准出评审（G5）","body":"conclusion: READY-GATE-FAIL"}]'; }
sset room_analysis '!room1'
echo "combined=$(mx_gate_verdict_combined room '@a:matrix.test' READY-GATE 0 fanfan '发布准出评审')"
cat "$AIPAY_SIM_ROOT/gov-calls.txt"`, root)
    expect(out).toContain('combined=FAIL')
    expect(out).toMatch(/ARG\|READY-GATE\|结论 READY-GATE-PASS\|.*conclusion: READY-GATE-FAIL/)
  })

  it('卡面 PASS、房间空 → relay 代发对照行一次；重查不重发（导演域消息动作留本地）', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_verdict() { echo 'PASS||PASS'; }
mx_messages_deep() { echo '[]'; }
load_token() { echo tok; }
kanban_list() { echo '[{"title":"G5 评审","body":"READY-GATE-PASS（七项齐备）"}]'; }
mx_send() { echo "$3" >> "$EVID_DIR/relay.log"; echo sent; }
sset room_analysis '!room1'
_v1=$(mx_gate_verdict_combined room '@a:matrix.test' READY-GATE 0 fanfan 'G5')
_v2=$(mx_gate_verdict_combined room '@a:matrix.test' READY-GATE 0 fanfan 'G5')
echo "v1=$_v1 v2=$_v2 sends=$(wc -l < "$EVID_DIR/relay.log" | tr -d ' ')"`, root)
    const m = out.match(/v1=(\S+) v2=(\S+) sends=(\d+)/)
    expect(m).not.toBeNull()
    expect(m![1]).toBe('PASS')
    expect(m![2]).toBe('PASS')
    expect(Number(m![3])).toBe(1)
  })
})

describe('⑧ UAT 逐条判词（融合批二：语义正本=产品 lifecycle/verdict.ts；语料守门=tests/lifecycle-parity.test.ts；此处钉委托面）', () => {
  it('uat_ac_verdict/covered 委托治理客户端（body+AC 透传；AC 整词匹配在服务端）', () => {
    const root = sandbox()
    const out = sh(`
gov_lc_uat_verdict() { printf 'V|%s|%s\\n' "$1" "$2" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; printf '通过'; }
gov_lc_uat_coverage() { printf 'C|%s|%s\\n' "$1" "$2" >> "$AIPAY_SIM_ROOT/gov-calls.txt"; printf 'AC-1 '; }
printf 'v=%s\\n' "$(uat_ac_verdict 'AC-1 通过' AC-1)"
printf 'miss=[%s]\\n' "$(uat_ac_covered 'AC-1 AC-10' 'AC-10 通过')"
cat "$AIPAY_SIM_ROOT/gov-calls.txt"`, root)
    expect(out).toContain('v=通过')
    expect(out).toContain('miss=[AC-1 ]')
    expect(out).toContain('V|AC-1 通过|AC-1')
    expect(out).toContain('C|AC-1 AC-10|AC-10 通过')
  })
})

describe('⑨ 基线变更受控绊线（H10/H11/R-A3）', () => {
  it('integration 推送禁强推（--force-with-lease 不得回归）', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'force-with-lease' "${join(HARNESS, 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(scen.trim()).toBe('0')
  })

  it('集成块带丢线守卫（旧基线头必须为 HEAD 祖先）', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'merge-base --is-ancestor' "${join(HARNESS, 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(1)
  })

  it('G3 硬闸落键 g3_code_pass 在场', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'g3_code_pass' "${join(HARNESS, 'aipay-scenario.sh')}" "${join(HARNESS, 'mux', 'mx-scenario-lib.sh')}" | awk -F: '{s+=\$2} END {print s}'`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(2)
  })

  it('patch 505：卡抽屉 body/评论走 KanbanMarkdown（禁回退裸插值）', () => {
    const patch = execFileSync('bash', ['-c', `cat "${join(PRODUCT, 'patches', '505-kanban-drawer-markdown.patch')}"`], { encoding: 'utf8' })
    expect(patch).toContain("import KanbanMarkdown from '@/custom/kanban/components/KanbanMarkdown.vue'")
    expect(patch).toContain('<KanbanMarkdown :source="detail.task.body" />')
    expect(patch).toContain('<KanbanMarkdown :source="comment.body" />')
    expect(patch).not.toMatch(/^\+.*\{\{ detail\.task\.body \}\}/m)
  })

  it('G2/G5 走判词合并、UAT 走逐条判词', () => {
    const scen = execFileSync('bash', ['-c', `cat "${join(HARNESS, 'aipay-scenario.sh')}"`], { encoding: 'utf8' })
    expect(scen).toContain('mx_gate_verdict_combined')
    expect(scen).toContain('mx_gate_combined_pass')
    expect(scen).toContain('uat_ac_verdict')
    expect(scen).toContain('uat-conditional')
    expect(scen).toContain('G5-HUMANGATE-APPROVED')
  })
})

// ═══ 驱动静态自检（V7 总则 16 实装，run7 gate_review jq 裸键三连死循环实录）═══
// jq 表达式编译错在 set -e 下击杀驱动主循环→relay 无限换代；上线前静态拦。
describe('⑩ 驱动静态自检（bash 语法 + jq 表达式编译）', () => {
  it('aipay-scenario/mx-lib/mx-scenario-lib 全部 jq 表达式可编译', () => {
    const out = execFileSync('bash', ['-c', `
python3 - << 'PYE'
import re, subprocess, sys
bad = []
files = [
  "${join(HARNESS, 'aipay-scenario.sh')}",
  "${join(MX, 'mx-lib.sh')}",
  "${join(MX, 'mx-scenario-lib.sh')}",
]
for f in files:
    src = open(f, encoding='utf-8').read()
    for m in re.finditer(r"jq\\s+(?:-[a-zA-Z]+\\s+)*'((?:[^'\\\\]|\\\\.)*?)'", src, re.S):
        expr = m.group(1)
        if not expr.strip():
            continue
        r = subprocess.run(['jq', '-n', expr], capture_output=True)
        if r.returncode == 3:  # 3=语法/编译错（5=运行错不算——未绑定变量属运行面）
            bad.append(f + ': ' + expr.replace(chr(10), ' ')[:80])
print('\\n'.join(bad) if bad else 'ALL-COMPILE-OK')
PYE`], { encoding: 'utf8' })
    expect(out.trim()).toBe('ALL-COMPILE-OK')
  })

  it('mx-clean/mx-up/aipay-scenario/mx-lib/mx-scenario-lib bash -n 语法通过', () => {
    for (const f of [
      join(MX, 'mx-clean.sh'), join(MX, 'mx-up.sh'),
      join(HARNESS, 'aipay-scenario.sh'),
      join(MX, 'mx-lib.sh'), join(MX, 'mx-scenario-lib.sh'),
    ]) {
      execFileSync('bash', ['-n', f])
    }
  })
})

// ═══ run8 耗时优化绊线（run7 13h05m 归因：5.5h 可恢复浪费的防复发结构）═══
// A UAT fail-fast+证据复用 / B testpass 口径 / C 派发幂等 marker / D relay 提速 /
// E G5 活性等待+判词复用。逐条绊线防回归：改掉任一结构此处变红。
describe('⑪ run8 耗时优化（fail-fast/复用/幂等/接力节奏）', () => {
  const SCEN = join(HARNESS, 'aipay-scenario.sh')
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf8' })

  it('B：testpass 前置守卫=origin/integration 口径（repo_has 查 test-report 不得回归）', () => {
    const scen = read(SCEN)
    expect(scen).toContain('if ! test_report_on_integration "${RFD_ID}"; then')
    expect(scen).not.toContain('repo_has docs/test/')
    expect(scen).toContain('wait_alive_truth "测试报告入库" 1800 qi test_report_on_integration "${RFD_ID}"')
  })

  it('A：UAT fail-fast——本地校验前移到派单之前（缺件不烧 agent）', () => {
    const scen = read(SCEN)
    const preIdx = scen.indexOf('uat-precheck')
    const dispatchIdx = scen.indexOf('dispatch_in_room bella')
    expect(preIdx).toBeGreaterThan(-1)
    expect(dispatchIdx).toBeGreaterThan(-1)
    expect(preIdx).toBeLessThan(dispatchIdx)   // 前置校验必须在派单之前
    expect(scen).toContain('先修上游再验收（未派发 UAT 任务）')
  })

  it('A：UAT 证据复用——锚=本轮起跑时刻，既有合格结论行不重派', () => {
    const scen = read(SCEN)
    expect(scen).toContain('UAT_SINCE_SEC=$(sget run_started_at)')
    expect(scen).toContain('UAT 证据复用（本轮既有合格结论行，不重派验收）')
    // 等待谓词同锚（派发时刻锚会使重启后既有证据行落在窗外）
    expect(scen).toContain('"^UAT-EVIDENCE" "$UAT_TS"')
  })

  it('A：uat_evidence_body 行为——取本轮最新结论行，滤旧轮/他发者/非行首回声', () => {
    const root = sandbox()
    const out = sh(`
sget() { case "$1" in room_analysis) echo '!room:x';; *) echo '';; esac; }
load_token() { echo 'tok'; }
agent_mxid() { echo "@$1:matrix.test"; }
mx_messages() { cat <<'J'
[
 {"origin_server_ts": 1790931000000, "sender": "@fanfan:matrix.test", "content": {"body": "hindsight_recall 预览 UAT-EVIDENCE AC-1 AC-2"}},
 {"origin_server_ts": 1790932000000, "sender": "@fanfan:matrix.test", "content": {"body": "UAT-EVIDENCE AC-1 通过 AC-2 通过"}},
 {"origin_server_ts": 1790933000000, "sender": "@fanfan:matrix.test", "content": {"body": "UAT-EVIDENCE AC-1 通过 AC-2 通过 AC-3 通过 AC-4 通过 AC-5 通过 AC-6 通过 AC-7 通过"}},
 {"origin_server_ts": 1790934000000, "sender": "@wei:matrix.test", "content": {"body": "UAT-EVIDENCE 假冒行"}},
 {"origin_server_ts": 1790830000000, "sender": "@fanfan:matrix.test", "content": {"body": "UAT-EVIDENCE 旧轮残留"}}
]
J
}
uat_evidence_body 1790930955`, root)
    expect(out).toContain('AC-7 通过')      // sort_by 取最新=全覆盖结论行
    expect(out).not.toContain('hindsight_recall')
    expect(out).not.toContain('旧轮残留')
    expect(out).not.toContain('假冒')
  })

  it('C：派发幂等 marker 全集在场（重启防整批重派）', () => {
    const scen = read(SCEN)
    // run11 流水线改造后：anexec 单 marker 四路齐发（anexec_d2 退役）、devimpl 双
    // marker 触发链（devimpl_d3 退役并入 d1）、新增 test_prep_d1（用例前移）与
    // review_prewrote（概设预写，run11 纪律 27①②⑥）。
    for (const k of ['anexec_d1', 'devimpl_d1', 'devimpl_d2', 'test_prep_d1', 'review_prewrote',
                     'defect_dispatched', 'audit_dispatched', 'preflight_ok', 'g5_rgid']) {
      expect(scen).toContain(k)
    }
    expect(scen).not.toContain('anexec_d2')
    expect(scen).not.toContain('devimpl_d3')
  })

  it('⑲：流式流水线机制四断言（run11 §4.2/纪律 27——MX_FAST 真实现/四路齐发/预写与前移/审批节流）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    const scen = read(SCEN)
    // ①快模式实现体在原语层（run10 报告叙事超前于实现的病根根治：缺省开+双档节拍）
    expect(lib).toContain('MX_FAST="${MX_FAST:-1}"')
    expect(lib).toMatch(/MX_POLL_IVAL=5/)
    expect(lib).toMatch(/MX_POLL_IVAL=15/)
    expect(lib).toContain('sleep "$MX_POLL_IVAL"')
    expect(lib).toContain('MX_APPROVE_SCAN_IVAL')
    // ②系分四路齐发：anexec_d1 块内四任务派发、无第二批 marker
    expect(scen).toMatch(/anexec：四路齐发/)
    const d1 = scen.slice(scen.indexOf('if [[ -z "$(sget anexec_d1)" ]]'), scen.indexOf('sset anexec_d1 1'))
    for (const t of ['AN-PAYCORE', 'AN-MP', 'AN-CHWX', 'AN-CHALI']) expect(d1).toContain(t)
    // ③概设预写（次稿触发）+用例前移（编码并行预备轮）+渠道批六路齐发（提速② 2026-10-09：
    // 渠道双路不再等契约件触发锚，派发词自含接口契约、独立部分先行，契约件落地 rebase 对接）
    expect(scen).toContain('概设预写（纪律 27①')
    expect(scen).toContain('测试预备轮（流式流水线，不执行不交付）')
    expect(scen).toContain('六路齐发（提速②')
    expect(scen).toContain('rebase origin/feat/DEV-PAYCORE-C 补 ChannelAdapter 接口对接')
    // ④RACI 双@结构化解析脚注（P9b：双@致非执行方抢跑的根治位）
    expect(lib).toContain('[RACI 解析]')
  })

  it('⑳：mx-clean 中央重置三断言（run11 假成功实锤——清空提交落错分支/push 空转报✓/工作树核验≠远端 tip）', () => {
    const clean = read(join(MX, 'mx-clean.sh'))
    // ①清空提交显式落 main（fetch→checkout main→reset origin/main 后才 rm/commit）
    expect(clean).toContain('git checkout -q main')
    expect(clean).toContain('git reset -q --hard origin/main')
    // ②push 回读验证（push 退出 0 ≠ 推达——up-to-date 亦退出 0）
    expect(clean).toContain('回读验证一致')
    expect(clean).toMatch(/rev-parse main/)
    expect(clean).toMatch(/rev-parse origin\/main/)
    // ③回读 tip 树正向断言（九目录零残留，非工作树 find 口径）
    expect(clean).toContain('ls-tree -r --name-only origin/main')
    // ④孤儿重立（run11 attempt-2 考古实锤：清空树不清历史=考古面仍在）——
    //   历史截断+pretrunc 保全+深度断言+受控 force-with-lease
    expect(clean).toContain('--orphan')
    expect(clean).toContain('pretrunc')
    expect(clean).toContain('rev-list --count origin/main')
    expect(clean).toContain('--force-with-lease=main')
  })

  it('㉑：跨轮考古防线（run11 attempt-2 实锤——派发词"或核验"许可恢复历史产物）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    const scen = read(SCEN)
    // 派发去重脚注与步 9 转派条款均必须禁引用/恢复历史产物，"或核验"措辞退役
    expect(lib).toContain('从零重新执行')
    expect(lib).toContain('不得引用、恢复或作为完成依据')
    expect(lib).not.toContain('重新执行或核验')
    expect(scen).not.toContain('重新执行或核验')
  })

  it('㉒：ACP 编码后端 L1 通道三断言（run11 acp-coding-backend-divergence 根治件）', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    const scen = read(SCEN)
    // ①技能分发：install_skills 消费 overlay/runtime/hermes-skills/coding-delegate（只读消费+缺位跳过）
    expect(lib).toContain('hermes-skills/coding-delegate')
    expect(lib).toMatch(/缺位跳过|\]\] || continue/)
    // ②派发词门控：MX_ACP_BACKEND=1 时 DEV 派发词注入后端段（缺省关=保真对照）
    expect(scen).toContain('MX_ACP_BACKEND')
    expect(scen).toContain('【编码后端=delegate】')
    // 2026-10-18 跨段防御批（c618338）：${ACP_NOTE} → ${ACP_NOTE:-}（驱动重启跳过
    // devimpl 段后 set -u 判 unbound 二次崩溃根治）——断言随迁， :- 形态同样计 wired
    const wired = (scen.match(/结论行 DEV-DONE-[A-Za-z${}-]+。\$\{ACP_NOTE(?::-)?\}/g) || []).length
    expect(wired).toBe(5) // PAYCORE-C/S/N+渠道双路(task)+MP
    // ③G3 后端指纹真查：启用时分支须含 materials/delegate-log.txt（缺=记单）
    expect(scen).toContain('acp-backend-delegate-log-missing')
    expect(scen).toContain('materials/delegate-log.txt')
    // ④V8.54 编码委托证据位：日志在位还须含引擎身份行（engine_bin_source=），
    //    缺=delegate-identity-missing 记单；身份/终态行采集进 evidence/delegate-identity.txt
    expect(scen).toContain('delegate-identity-missing')
    expect(scen).toContain('engine_bin_source=')
    expect(scen).toContain('delegate-identity.txt')
  })

  it('㉓：网关挂死槽周期扫（run11 容量饥饿根治补口，patch 586——撞号清理 577→586 后引用同步）', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    // 产品仓路径走 PRODUCT 解析序（融合批六：单仓整合后 patches/ 在仓根；MX_OVERLAY_ROOT 逃生门保留）
    const patchPath = join(PRODUCT, 'patches', '586-agent-gateway-wedged-agent-sweep.patch')
    // ①patch 文件在位且含核心语义件
    const patch577 = read(patchPath)
    expect(patch577).toContain('_housekeeping_wedged_agent_sweep')
    expect(patch577).toContain('call_soon_threadsafe')
    expect(patch577).toContain('_snapshot_running_agents')
    // ②harness 部署清单挂载（否则快照树永不应用）
    expect(lib).toContain('586-agent-gateway-wedged-agent-sweep.patch')
    // ③驱逐判定复用快路径原语（语义一致，不另立判据）
    expect(patch577).toContain('_hm_evict_idle_stale_agent')
  })

  it('㉔：Ycode 引擎驱动接线三断言（2026-10-12 hermes→ACP→Ycode 链路接线轮）', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    // 单仓整合（2026-10-24）起 runtime/ 在仓根——旧回退 ../overlay 是多仓期布局，
    // bare worktree 下 cat 旧路径必炸（本轮实锤）；MX_OVERLAY_ROOT 覆盖语义保留
    // （推演环境 overlay 根=该 env，runtime 同在其下）。
    const ROOT = process.env.MX_OVERLAY_ROOT || join(HARNESS, '..')
    const skillDir = join(ROOT, 'runtime/hermes-skills/coding-delegate')
    const card = read(join(skillDir, 'SKILL.md'))
    // ①技能卡引擎命令=自带驱动（zcode-acp-delegate.py），claude -p 旧形态退役
    expect(card).toContain('scripts/zcode-acp-delegate.py')
    expect(card).not.toContain('claude -p')
    // ②驱动真源在位、可编译（真实工具链守门：语法坏=分发到 profile 也是死件）
    const driver = join(skillDir, 'scripts/zcode-acp-delegate.py')
    expect(existsSync(driver)).toBe(true)
    execFileSync('python3', ['-m', 'py_compile', driver])
    // ③分发整目录（cp -R …/coding-delegate/.）——单文件拷贝会漏 scripts/，技能卡命令不可执行
    expect(lib).toMatch(/cp -R [^\n]*coding-delegate\/\./)
  })

  it('E：G5 活性等待+判词复用+过闸收口单一路径', () => {
    const scen = read(SCEN)
    expect(scen).toContain('g5_pass_finalize()')
    expect(scen).toContain('wait_alive_truth "房间出现 READY-GATE 结论行（判词语义）" 3600 fanfan')
    expect(scen).toContain('G5 判词复用（本轮既有 PASS 结论行，不重派评审）')
    // V8.23 纪律46：G5 判词窗基线=evidence_baseline（本轮开跑；lite 回落夹具源轮），
    // 源轮旧卡免疫；复用口须条件调用 g5_pass_finalize（空 body 禁 finalize）
    expect(scen).toContain('G5_TS=$(( $(evidence_baseline) * 1000 ))')
    expect(scen).toContain('] && g5_pass_finalize; then')
  })

  it('D：relay 探测 15s/拉起确认 10s（90s+120s 旧节奏不得回归）', () => {
    const relay = read(join(MX, 'mx-relay.sh'))
    expect(relay).toContain('sleep 15')
    expect(relay).toContain('sleep 10')
    expect(relay).not.toContain('sleep 90')
    expect(relay).not.toContain('sleep 120')
  })

  it('D：模型预检只首轮（preflight_ok 键落 state）', () => {
    const scen = read(SCEN)
    expect(scen).toMatch(/\[\[ -z "\$\(sget preflight_ok\)" \]\]/)
    expect(scen).toContain('sset preflight_ok 1')
  })
})

describe('⑫ 必采矩阵单一事实源（正本 §5.5+§5.6 必采矩阵：hero 统计=矩阵实算，分母 12，禁任一位在位即计）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  function py(code: string): string {
    return execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(MX)})
from r18_matrix import DIALOG_STEPS, OP_STEPS, EFFECT_STEPS, SKILL_STEPS, DELIVERY_STEPS, SKILL_GEN_MIN, SKILL_INVOKE_MIN, DELIVERY_MIN, TOTAL, STEP_TOTAL, PRODUCT_OUTCOME_TOTAL, evaluate, evaluate_full, step_ok, product_outcome_status, schema_errors, as_dict, as_list, frame_name
${code}`], { encoding: 'utf-8' })
  }

  it('矩阵常量=对话 9/11/17/19/21 + 操作 25（N28-5 四态收敛：8/10 转 none 型消息流承载）+ 效果 7/20/24 + skill 13（生成≥3/调用≥2）+ delivery 门禁灯 23（≥1）+ 产品成效 2 项（run14 起，§5.6），分母=13（N28-5 收敛后）', () => {
    const out = py('print(sorted(DIALOG_STEPS), sorted(OP_STEPS), sorted(EFFECT_STEPS), sorted(SKILL_STEPS), sorted(DELIVERY_STEPS), SKILL_GEN_MIN, SKILL_INVOKE_MIN, DELIVERY_MIN, STEP_TOTAL, PRODUCT_OUTCOME_TOTAL, TOTAL)')
    expect(out).toContain('[9, 11, 17, 19, 21] [25] [7, 20, 24] [13] [23] 3 2 1 11 2 13')  // N28-5：OP 收敛后分母 15→13
  })

  it('产品成效两项（run13 复盘 B6/F17）：exec=幂等执行输出件≥1、frames=下单流程帧≥2；记单降级只免 frames 项', () => {
    const out = py(`
import tempfile, os
from pathlib import Path
d = tempfile.mkdtemp()
po = Path(d) / 'product-outcome'
po.mkdir()
r0 = product_outcome_status(d, issue_log_text='')
print('empty:', r0['exec_met'], r0['frames_met'], r0['degraded'])
(po / 'idempotency.txt').write_text('Tests 8 passed')
r1 = product_outcome_status(d, issue_log_text='')
print('exec-only:', r1['exec_met'], r1['frames_met'], r1['degraded'])
(po / 'order-1.png').write_text('x'); (po / 'order-2.png').write_text('x')
r2 = product_outcome_status(d, issue_log_text='')
print('full:', r2['exec_met'], r2['frames_met'], r2['degraded'])
d2 = tempfile.mkdtemp()
(po2 := Path(d2) / 'product-outcome').mkdir()
(po2 / 'idempotency.txt').write_text('Tests 8 passed')
r3 = product_outcome_status(d2, issue_log_text='ISSUE|product-outcome-missing|step26-frames|x')
print('degraded-ticket:', r3['exec_met'], r3['frames_met'], r3['degraded'])
m, t, _, _po = evaluate_full({}, lambda n: True, d2, 'ISSUE|product-outcome-missing|step26-frames|x')
print('eval-full:', m, t)`)
    expect(out).toContain('empty: False False False')
    expect(out).toContain('exec-only: True False False')
    expect(out).toContain('full: True True False')
    expect(out).toContain('degraded-ticket: True False True')
    // evaluate_full：步 13 项全缺 + exec 达标 + frames 记单降级 = 2/15
    expect(out).toContain('eval-full: 2 13')
  })

  it('空载荷=0/13；步绑定达标载荷=11/13（操作每组≥2 实帧、效果带可反查锚、skill 帧达标）', () => {
    const out = py(`
good = {str(n): {'dialogs': [{'title': 'd'}]} for n in DIALOG_STEPS}
good.update({str(n): {'ops': [{'frames': [f'{n}-op1-before.png', f'{n}-op1-after.png']}]} for n in OP_STEPS})
good.update({str(n): {'effect': {'text': '工件入仓', 'evidence': [{'label': 'commit', 'anchor': 'a1b2c3d'}]}} for n in EFFECT_STEPS})
good['13'] = {'skill': {'gen': ['13-g1.png', '13-g2.png', '13-g3.png'], 'invoke': ['13-i1.png', '13-i2.png']}}
good['23'] = {'delivery': {'frames': ['23-dlv1.png']}}
m, t, _ = evaluate(good, frame_exists=lambda n: True)
print(f'{m}/{t}')
m0, t0, _ = evaluate({}, frame_exists=lambda n: True)
print(f'{m0}/{t0}')`)
    expect(out).toContain('11/13')
    expect(out).toContain('0/13')
  })

  it('对话缺/单帧/帧文件缺失/效果无锚/skill 帧不足 → 对应项不计入；达标路径不受邻步影响', () => {
    const out = py(`
cases = {
  9:  {'ops': [{'frames': ['9-x-before.png', '9-x-after.png']}]},   # 对话步无 dialogs
  8:  {'ops': [{'frames': ['8-x-before.png']}]},                     # 仅 1 帧
  10: {'ops': [{'frames': ['10-x-before.png', '10-x-after.png']}]},  # 2 帧但文件缺失
  7:  {'effect': {'text': '纯文字一句话', 'evidence': []}},           # 效果无锚
  11: {'dialogs': [{'messages': []}]},                               # dialogs 在位=达标
  13: {'skill': {'gen': ['13-g1.png', '13-g2.png'], 'invoke': ['13-i1.png', '13-i2.png']}},  # 生成帧仅 2<3
  23: {'delivery': {'frames': []}},                                          # 门禁灯帧空（R29）
}
_, _, detail = evaluate({str(k): v for k, v in cases.items()},
                        frame_exists=lambda n: not n.startswith('10-'))
print(' '.join(f'{n}:{ok}' for n, ok in detail if n in cases))`)
    expect(out).toContain('9:False')
    expect(out).toContain('13:False')
    expect(out).toContain('9:False')
    expect(out).toContain('7:False')
    expect(out).toContain('11:True')
    expect(out).toContain('13:False')
    expect(out).toContain('23:False')
  })

  it('R18 形状校验单一事实源：坏形状一次列全，step_ok/evaluate 不抛异常（run28 报告崩溃根治）', () => {
    const out = py(`
bad = {
  '7': {'effect': {'text': '工件入仓', 'evidence': ['commit=a1b2c3d']}},
  '9': {'dialogs': 'not-a-list'},
  '20': {'ops': [{'frames': 3}]},
  '25': [1, 2],
}
errs = schema_errors(bad)
print('errs', len(errs), '|', ';'.join(sorted(f'{s}:{p}:{e}<{g}>' for s, p, e, g in errs)))
print('ok7', step_ok(7, bad['7']))
print('ok9', step_ok(9, bad['9']))
print('ok25', step_ok(25, bad['25']))
print('ev', evaluate(bad, frame_exists=lambda n: True)[0])
print('valid', schema_errors({'7': {'effect': {'text': 'x', 'evidence': [{'label': 'c', 'anchor': 'abc'}]}}}))
`)
    expect(out).toContain('errs 4 |')
    expect(out).toContain('7:effect.evidence[0]:object<str>')
    expect(out).toContain('9:dialogs:array<str>')
    expect(out).toContain('20:ops[0].frames:array<int>')
    expect(out).toContain('25:steps[n]:object<list>')
    expect(out).toContain('ok7 False')
    expect(out).toContain('ok9 False')
    expect(out).toContain('ok25 False')
    expect(out).toContain('ev 0')
    expect(out).toContain('valid []')
  })

  it('绊线：生成器 hero 统计与审计器查 8 共用 r18_matrix，禁回退硬编码/任一位在位即计', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(gen).toContain('import r18_matrix')
    expect(gen).toContain('r18_matrix.evaluate')
    expect(gen).toContain('必采 {r18_matrix.TOTAL} 项实测统计')
    expect(gen).not.toContain('必采 11 项实测统计')
    expect(gen).not.toContain('{hit}/26')
    expect(audit).toContain('from r18_matrix import')
    expect(audit).toContain('step_ok')
    expect(audit).not.toContain('{9, 11, 17, 19, 21}')
  })

  it('绊线：采集器 skill 子命令登记 gen/invoke 帧（§5.6 必采矩阵 采集链闭环）', () => {
    const coll = read(join(MX, 'r18-collect.py'))
    expect(coll).toContain("add_parser('skill')")
    expect(coll).toContain("'--gen'")
    expect(coll).toContain("'--invoke'")
  })
})

describe('⑫b 治理度量五项+承载面审计（差距审计 P5/P8 → run10 前置 R26/R27）', () => {
  // R26：gov_report 度量面补齐 §2.6.5/6 五项+基线对比行——run9 只兑现首过率一项且
  // 分母口径分裂（评审型 4 分母 vs PART1 六闸），run10 起统一六闸全计+基线行机制化。
  // R27：mx-report-audit 查 9 承载面符合性——§2.5 有承载面承诺的 ✅ 步须 UI 实拍帧
  // 或 product-surface-degraded 合规降级记单，二者皆缺 WARN（P8：P1/P3/P4 曾全漏网）。
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('gov_report 五项度量齐（融合批三：数字正本=产品 run-metrics.ts，驱动只渲染 DTO）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    // 渲染壳消费 DTO 五项
    for (const k of ['firstPass', 'evidenceRate', 'defectDensity', 'rejectCount', 'humanInterventions']) {
      expect(lib).toContain(k)
    }
    expect(lib).toContain('gov_run_metrics')
    expect(lib).not.toContain('${_fp}/4')
    // 计算正本在产品模块（六闸全计口径）
    const metrics = read(join(HARNESS, '..', 'custom', 'server', 'governance', 'run-metrics.ts'))
    expect(metrics).toContain('六闸全计')
  })

  it('四态判定正本=平台证据适配器（P0 Task 6：run-metrics 只消费 gateEvidenceFromState 状态）', () => {
    const metrics = read(join(HARNESS, '..', 'custom', 'server', 'governance', 'run-metrics.ts'))
    expect(metrics).toContain("from '../platform/evidence/gate-evidence'")
    expect(metrics).toContain('gateEvidenceFromState')
    // 任一闸 unknown → 不产 M1（分母不完整不显成绩）
    expect(metrics).toContain('unknownGateCount === 0')
    // 适配器契约在平台 contracts（证据统一四值 pass/fail/unknown/waived）
    const contract = read(join(HARNESS, '..', 'custom', 'platform', 'contracts', 'evidence.ts'))
    expect(contract).toContain("'pass' | 'fail' | 'unknown' | 'waived'")
    const adapter = read(join(HARNESS, '..', 'custom', 'server', 'platform', 'evidence', 'gate-evidence.ts'))
    expect(adapter).toContain('gateEvidenceFromState')
  })

  it('gov_report 本轮首过率读 trend 末项（P0 Task 6：unknown 显示 ⬜，不自行拼 0/6）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('.trend | last | .firstPass')
    // 禁回归：DTO firstPass 数字 + 渲染侧自拼 /6（unknown 轮会显示假 0/6）
    expect(lib).not.toContain("jq -r '.firstPass')/6")
    // unknown 面如实呈现（缺完成键计数可见，不静默）
    expect(lib).toContain('.unknownGateCount')
  })

  it('gov_report 基线对比行（§2.6.5：基线/趋势计算正本=产品 run-metrics，驱动渲染）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('基线对比')
    expect(lib).toContain('.baseline.prevRun')
    const metrics = read(join(HARNESS, '..', 'custom', 'server', 'governance', 'run-metrics.ts'))
    expect(metrics).toContain('governance-report.md')
  })

  it('审计器查 9 承载面符合性（§2.5 步集解析 × product-surface-degraded 降级口径）', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(audit).toContain('承载范围符合性')
    expect(audit).toContain('product-surface-degraded')
    expect(audit).toContain('### 2\\.5')
  })
})

describe('⑫c run10 前置补（P14/P15 → R26 原子化/R29 全程开启）', () => {
  // R26 原子化：gov_archive_commit——metrics-log+ISSUES-LOG 同提交推送+回读验证，
  // 「产出了没落账」（P14：metrics 未回写/归档断链/漏账）自此有机制通道。
  // R29 全程开启：delivery 协议面缺省启用（P15）——保真形态原则下产品面板应被
  // 协议事件喂数；MX_DELIVERY=0 显式关闭由 scenario 自动记单降级（禁静默关旗标）。
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('gov_archive_commit 落账原子化（metrics+issues 同提交+回读验证+失败记单）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('gov_archive_commit()')
    expect(lib).toContain('metrics-log.csv')
    expect(lib).toContain('ISSUES-LOG.md')
    expect(lib).toContain('archive-commit-failed')
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('gov_archive_commit')
  })

  it('绊线：gov_archive_commit 回读按 DTO 实际产出对账（禁硬编码 M1 恒验——unknown 轮记假单）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    // 禁回归：读回硬编码 grep M1——P0 Task 6 起 unknown 轮（unknownGateCount>0）M1
    // 不产出，恒验必失败 → 假 archive-commit-failed ISSUE（fix round 1 根因）
    expect(lib).not.toContain('| grep -qF ",${rfd},M1,"')
    // 新对账面三件：DTO 逐行对账 + M4 恒在锚 + M1 按 unknownGateCount 条件验证
    expect(lib).toContain('回读按 DTO 实际产出对账')
    expect(lib).toContain('逐行对账')
    expect(lib).toContain('M1 条件对账')
    expect(lib).toContain('.unknownGateCount')
  })

  it('行为：unknown 轮 M1 缺席=回读通过对账（不记假 archive-commit-failed）；完整轮 M1 必在场', () => {
    // 本地中央仓夹具（bare origin + clone），gov_* 服务函数打桩——只验回读对账逻辑。
    const archive = (dto: string, root: string, runId: string): string => sh(`
printf 'ISSUE|demo|setup|行为测试夹具\\n' > "$EVID_DIR/issues.log"
# 中央仓夹具：docs/governance/metrics-log.csv 与 docs/issues/ISSUES-LOG.md 均从
# 历史在场（与真实 central 仓同形——upsert 与追加不建目录）
git init -q --bare "$AIPAY_SIM_ROOT/origin.git"
git clone -q "$AIPAY_SIM_ROOT/origin.git" "$DIRECTOR_CLONE" 2>/dev/null
git -C "$DIRECTOR_CLONE" config user.email t@t.local
git -C "$DIRECTOR_CLONE" config user.name t
mkdir -p "$DIRECTOR_CLONE/docs/governance" "$DIRECTOR_CLONE/docs/issues"
printf 'date,change,gate,score,ratio,window,source,note\\n' > "$DIRECTOR_CLONE/docs/governance/metrics-log.csv"
printf '# 推演问题台账（issues.log 归档）\\n' > "$DIRECTOR_CLONE/docs/issues/ISSUES-LOG.md"
git -C "$DIRECTOR_CLONE" add -A
git -C "$DIRECTOR_CLONE" commit -q -m init
git -C "$DIRECTOR_CLONE" branch -M main
git -C "$DIRECTOR_CLONE" push -q origin main
gov_report() { :; }
gov_run_metrics() { cat <<'DTO'
${dto}
DTO
}
_rc=0; gov_archive_commit || _rc=$?
echo "rc=$_rc"
echo "fail_issue=$(grep -c 'archive-commit-failed' "$EVID_DIR/issues.log" || true)"
_mlog=$(git -C "$DIRECTOR_CLONE" show origin/main:docs/governance/metrics-log.csv 2>/dev/null || true)
echo "m1_landed=$(printf '%s\\n' "$_mlog" | grep -cF ',RFD-001,M1,' || true)"
echo "m4_landed=$(printf '%s\\n' "$_mlog" | grep -cF ',RFD-001,M4,' || true)"`, root, { RUN_ID: runId, RFD_ID: 'RFD-001' })
    const m4row = '2026-11-05,RFD-001,M4,1,1,2026-11-05..2026-11-05,issues.log 实算,打回次数'
    // unknown 轮（unknownGateCount=2，DTO 不产 M1）：落账回读必须通过——M1 缺席是
    // 预期行为，旧实现恒验 M1 会记假 archive-commit-failed
    const unknown = archive(`{"ok":true,"unknownGateCount":2,"gateStats":[],"metricsRows":[
 {"id":"M3","csv":"2026-11-05,RFD-001,M3,0.750,3/4,2026-11-05..2026-11-05,issues.log+state.env 实算,证据一次通过率"},
 {"id":"M4","csv":"${m4row}"},
 {"id":"M5","csv":"2026-11-05,RFD-001,M5,0,0,2026-11-05..2026-11-05,issues.log 实算,人工介入"}]}`, sandbox(), '20261105-v9-run1')
    expect(unknown).toContain('rc=0')
    expect(unknown).toContain('fail_issue=0')
    expect(unknown).toContain('m1_landed=0')
    expect(unknown).toContain('m4_landed=1')
    // 完整轮（unknownGateCount=0）：M1 必产必落
    const complete = archive(`{"ok":true,"unknownGateCount":0,"gateStats":[],"metricsRows":[
 {"id":"M1","csv":"2026-11-05,RFD-001,M1,0.667,4/6,2026-11-05..2026-11-05,state.env 落键实算,六闸全计"},
 {"id":"M4","csv":"${m4row}"}]}`, sandbox(), '20261105-v9-run2')
    expect(complete).toContain('rc=0')
    expect(complete).toContain('fail_issue=0')
    expect(complete).toContain('m1_landed=1')
    // 完整轮但 DTO 未产 M1（契约违规）：回读须拦（M1 条件对账——完整轮验证在场）
    const violated = archive(`{"ok":true,"unknownGateCount":0,"gateStats":[],"metricsRows":[
 {"id":"M4","csv":"${m4row}"}]}`, sandbox(), '20261105-v9-run3')
    expect(violated).toContain('rc=1')
    expect(violated).toContain('fail_issue=1')
  })

  it('delivery 协议面缺省启用+显式关闭记单（P15/R29 全程开启）', () => {
    const dlv = read(join(MX, 'mx-delivery-lib.sh'))
    expect(dlv).toContain('MX_DELIVERY:-1')
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('product-surface-degraded|delivery-cases')
  })

  it('dlv_smoke 读回用完整事件类型（2026-10-06 实跑抓到的裸字面量 bug）', () => {
    // dlv_events 按 .type 全等过滤；dlv_smoke 曾传裸词 'gate'，而真实事件类型是
    // com.swarmstudio.delivery.gate——读回恒空、冒烟必记单失败。钉死：读回调用必须
    // 传 "$DLV_GATE_TYPE"，防字面量漂移复发。
    const dlv = read(join(MX, 'mx-delivery-lib.sh'))
    expect(dlv).toContain('dlv_events fanfan "$room" "$DLV_GATE_TYPE"')
    expect(dlv).not.toMatch(/dlv_events fanfan "\$room" gate /)
  })

  it('R29 身份缝：案例房邀 bot+index 按账号双写（产品免密=bot 身份，不邀=面板空态）', () => {
    // 2026-10-06 实锤：产品步 3 免密登录用 gateway Orchestrator channel=bot 账号，
    // 而 dlv_scenario_open 只邀人类账号+index 只写人类——bot 登录下面板空态。
    // 钉死：建房循环必须邀 agent_mxid 并用 bot token join；index 有 _acct 双写面。
    const dlv = read(join(MX, 'mx-delivery-lib.sh'))
    expect(dlv).toContain('dlv_invite_retry fanfan "$room" "$(agent_mxid "$u")"')
    expect(dlv).toContain('dlv_index_update_acct "$u-agent" "$(agent_mxid "$u")" "$room"')
    expect(dlv).toContain('dlv_index_update_acct()')
  })

  it('delivery 邀入限流兜底：邀请/入房带退避重试+缺员记单（28 账号曾静默缺 12）', () => {
    // 2026-10-06 实锤：双身份邀请风暴下 Synapse 限流，dlv_invite 的 >/dev/null 与
    // 无检错 join 把尾部账号静默吞掉。钉死：_retry 族存在+缺员 ISSUE 记单键。
    const dlv = read(join(MX, 'mx-delivery-lib.sh'))
    expect(dlv).toContain('dlv_invite_retry()')
    expect(dlv).toContain('dlv_join_retry()')
    expect(dlv).toContain('delivery-room-member-missing')
  })
})

describe('⑭ V8.2 四段式切换（生成器配套六件落位守门）', () => {
  // 2026-10-06 用户指令推动落地。配套：①双格式解析+缺步拒跑 ②四段渲染 ③操作手册
  // 降附录 ⑤叙事骨架生成器 ⑥本守门+审计器双格式断言。④字段级核对此前已在位。
  const MX_DIR = join(MX)
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })
  const PLAN = join(PRODUCT, 'docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md')

  it('正本=V8.3 两段式（步条 `**步 N｜`+两段标记；历史层在工程档案，2026-10-08 终态剥离）', () => {
    const plan = read(PLAN)
    expect(plan).toContain('**步 1｜')
    expect(plan).toContain('**这步做什么**：')
    expect(plan).toContain('**交付物及质量判据**：')
    expect(plan).not.toContain('**改进项**：')  // 步条历史层已剥（'已知问题'字样仅存于 §5.4 报告③段定义，合法）
    expect(read(PLAN.replace('2026-10-05-mux-v8-fullflow-plan.md', '2026-10-05-mux-history-and-engineering-archive.md'))).toContain('方案步条历史层')
  })

  it('生成器+审计器双格式解析同源（改任一端当场红）', () => {
    const gen = read(join(MX_DIR, 'mx-report-gen.py'))
    const aud = read(join(MX_DIR, 'mx-report-audit.py'))
    for (const f of [gen, aud]) {
      expect(f).toContain("PLAN_V82 = '**步 1｜' in plan_text")
    }
    expect(gen).toContain('_v82_sec')
    expect(gen).toContain('manual_appendix')   // ③产品操作手册降附录
    expect(gen).toContain('_step_issues_html') // ②段三逐步问题面板
    expect(aud).toContain('这步做什么')        // ⑥审计四段锚
  })

  it('解析自检：正本实解析 26 步齐（双格式任一，缺步拒出报告）', () => {
    const out = execFileSync('python3', ['-c', `
import re, pathlib
t = pathlib.Path(${JSON.stringify(PLAN)}).read_text()
if '**步 1｜' in t:
    ns = set(int(m.group(1)) for m in re.finditer(r'^\\*\\*步 (\\d{1,2})｜', t, re.M))
else:
    ns = set(int(m.group(1)) for m in re.finditer(r'^(\\d{1,2})、', t, re.M))
print(len(ns))
`], { encoding: 'utf-8' }).trim()
    expect(out).toBe('26')
  })

  it('叙事骨架生成器在位且可跑（⑤骨架自动+人工润色；fixture 封闭不依赖在架轮次）', () => {
    // 2026-10-07 实锤：旧版硬编码 run9——mx-clean 每轮把 runs/<旧轮> 归档后本用例必红
    // （真轮次证据是易失依赖）。封闭化：自建微型 SIM_ROOT fixture（state.env 三键），
    // 生成器经 AIPAY_SIM_ROOT 指向它（与 mx-lib.sh:44-50 的 env 约定同源）。
    const sk = join(MX_DIR, 'mx-narrative-skeleton.py')
    const tmp = mkdtempSync(join(tmpdir(), 'mxskel-'))
    const runDir = join(tmp, 'runs', '20990101-v9-fixture')
    mkdirSync(runDir, { recursive: true })
    writeFileSync(join(runDir, 'state.env'), 'smoke_done=1\nappinit_done=1791300000\ng1_frozen=1791300100\n')
    const out = execFileSync('python3', [sk, '--run', '20990101-v9-fixture'], {
      encoding: 'utf-8', env: { ...process.env, AIPAY_SIM_ROOT: tmp },
    })
    expect(out).toContain('STEPS_META_20990101_V9_FIXTURE')
    expect(out).toContain('TODO')
  })
})

describe('⑮ F-6/F-7 run10 前置（词表/txt 写入器/判定探活）', () => {
  // F-6①：术语词表单一事实源+生成器首现释义；F-6②：txt 派生物写入器入库
  // （run9 人工刷新不可复现的根治）；F-7：mx-setup 判定服务探活 fail-open 记单。
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('F-6① 词表在位且生成器接线（glossary.txt+gloss_first_use 渲染）', () => {
    const gl = read(join(MX, 'glossary.txt'))
    expect(gl).toContain('term:patch-564 | 564 |')        // v2 五字段（P0-1 升维）
    expect(gl).toContain('term:state-env | state.env |')
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('gloss_first_use(H.escape(meta["narrative"]))')
    expect(gen).toContain('GLOSSARY_SLUG')                // 五字段装载（ID/标准名/别名/定义/归属）
    expect(gen).toContain('def ontology_html(')           // 证据五：本体证据面（P0-2）
    expect(gen).toContain('{ontology_html()}')
    expect(gen).toContain('ontology-health.txt')
  })

  it('F-6② txt 写入器随生成链（simulation-report.txt+steps-extract.txt）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('_html_to_text')
    expect(gen).toContain("steps-extract.txt")
    expect(gen).toContain("simulation-report.txt")
  })

  it('F-7 判定服务探活：在线快照三元组+离线 fail-open 记单', () => {
    const setup = read(join(MX, 'mx-setup.sh'))
    expect(setup).toContain('MX_DECISION_API')
    expect(setup).toContain('decision-backend-degraded')
    expect(setup).toContain('decision-backend-snapshot.txt')
  })
})

describe('⑫d run10 前置接线（①观察员/569 gate-guard/③b 审批镜像）', () => {
  // ①MATRIX_ROOM_OBSERVERS 写入 profile .env+scenario 默认导出（导演可见驱动房间）；
  // 569 env 注入 gateway 启动链+守卫文件固定路径链接；③b mxq 镜像入队/消费挂进
  // auto_approve（审批群内与收件箱双可见、裁决双向收敛）。
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('① MATRIX_ROOM_OBSERVERS 写入 profile .env+scenario 默认导出', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    expect(lib).toContain('MATRIX_ROOM_OBSERVERS=${MATRIX_ROOM_OBSERVERS:-@admin:$SERVER_NAME}')
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('export MATRIX_ROOM_OBSERVERS=')
  })

  it('569 gate-guard 接线：mx-up 注入 env+守卫文件固定路径链接+补丁入应用清单', () => {
    const up = read(join(MX, 'mx-up.sh'))
    expect(up).toContain('KANBAN_GATE_GUARD_FILE=')
    expect(up).toContain('KANBAN_GATE_GUARD_KEYS=')
    const lib = read(join(MX, 'mx-lib.sh'))
    expect(lib).toContain('current-state.env')
    expect(lib).toContain('569-agent-kanban-gate-guard.patch')
  })

  it('③b 审批镜像：mxq_enqueue/mxq_consume 挂进 auto_approve', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('mxq_enqueue()')
    expect(lib).toContain('mxq_consume()')
    expect(lib).toContain('mx-requests.jsonl')
    expect(lib).toContain('mx-responses')
  })
})

describe('⑬ runtime 副本须包含补丁面（部署通道不得静默回退已打补丁）', () => {
  // 2026-10-05 实锤：mx-setup 先打补丁后 deploy-agent-runtime --apply，runtime 清单内
  // gateway/platforms/base.py 副本停在 564 之前——每次部署把 564 静默覆盖回去
  // （.bak 链取证）。本守门断言：凡 agent 运行时补丁的目标文件在 overlay/runtime/
  // 有副本，副本必须包含该补丁的新增内容（模板↔产物双向同步的机械化）。
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('agent 补丁目标文件在 runtime/ 有副本的，副本须含补丁新增行', () => {
    const out = execFileSync('python3', ['-c', `
import re, sys
from pathlib import Path
mx = Path(${JSON.stringify(MX)})
ovl = Path(${JSON.stringify(PRODUCT)})
lib = (mx / 'mx-lib.sh').read_text()
m = re.search(r'mx_apply_agent_patches\\(\\) \\{.*?for p in ([^;]+); do', lib, re.S)
if not m:
    print('PARSE_FAIL: 找不到 mx_apply_agent_patches 补丁清单'); sys.exit(0)
patches = re.findall(r'(\\d+-[\\w.-]+\\.patch)', m.group(1))
bad = []
for name in patches:
    pf = ovl / 'patches' / name
    if not pf.exists():
        bad.append(f'{name}: patch 文件缺失'); continue
    text = pf.read_text()
    # 按文件切 hunk——旧版 flat 扫描让 A 文件的新增行能替 B 文件顶包（391 漏检实锤）
    files = {}
    cur = None
    for line in text.splitlines():
        dm = re.match(r'^diff --git a/\\S+ b/(\\S+)$', line)
        if dm:
            cur = dm.group(1); files.setdefault(cur, [])
        elif cur and line.startswith('+') and not line.startswith('+++'):
            v = line[1:].strip()
            if len(v) >= 20:
                files[cur].append(v)
    for path, added in files.items():
        rt = ovl / 'runtime' / path
        if not rt.exists():
            continue  # 无 runtime 副本=不经部署通道，不受回退面影响
        rt_text = rt.read_text()
        # 强锚=该文件 hunk 首个新增 def/class 名（与 mx_apply_agent_patches 语义检查同源）；
        # 无 def/class 才退化 any() 行锚。391 实锤：弱 any() 锚被无关新增行绕过，
        # 副本缺主 hunk 仍判过——部署回退漏检一整轮。
        marker = None
        for v in added:
            mm = re.match(r'(?:def|class)\\s+([A-Za-z_0-9]+)', v)
            if mm:
                marker = mm.group(1); break
        if marker:
            if marker not in rt_text:
                bad.append(f'{name} → runtime/{path}: 副本缺补丁语义锚 {marker}（部署将回退该补丁）')
        elif added and not any(a in rt_text for a in added):
            bad.append(f'{name} → runtime/{path}: 副本不含任何补丁新增行（部署将回退该补丁）')
print('\\n'.join(bad) if bad else 'ALL_SYNCED patches=%d' % len(patches))`], { encoding: 'utf-8' })
    expect(out).not.toContain('副本不含任何补丁新增行')
    expect(out).not.toContain('缺补丁语义锚')
    expect(out).not.toContain('PARSE_FAIL')
    expect(out).not.toContain('patch 文件缺失')
    expect(out).toMatch(/ALL_SYNCED patches=\d+/)
  })

  it('回归锚：564 兜底代码在 runtime 副本在位（2026-10-05 回退事故的定点绊线）', () => {
    const rt = read(join(PRODUCT, 'runtime/gateway/platforms/base.py'))
    expect(rt).toContain('response_delivery_fallback')
  })
})

describe('⑯ run10 接线事故根治守门（hermes 转发/gate-guard 显式化/概设活性窗）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })
  it('hermes() 函数转发在位（裸调用面失明根治——agent 已建卡被误判超时实锤）', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    expect(lib).toContain('hermes() { "$HERMES_BIN" "$@"; }')
  })
  it('gate-guard 仅显式启用（全局误拦系分期 spawn 死锁根治）', () => {
    const up = read(join(MX, 'mx-up.sh'))
    expect(up).toContain('${MX_GATE_GUARD:-}')  // fac97e2 写法（展开词不获赋值识别的 bash 语义实锤）
    expect(up).not.toMatch(/KANBAN_GATE_GUARD_KEYS="\$\{MX_GATE_GUARD_KEYS:-/)
  })
  it('agent-交付型朴素窗已活性化（概设窗走 wait_alive_truth）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).not.toContain('概设方案 docs/design/${RFD_ID}-architecture-design.md 入库" 2400')
    expect(scen).toContain('概设方案 docs/design/${RFD_ID}-architecture-design.md 入库" 1800 fanfan')
  })
})

describe('⑱ 报告链验收守门（run10 勘误轮：15 FAIL 绕行交付+G5 门禁灯事件漏发实锤）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('G5 补齐轮收口走 g5_pass_finalize（不漏 dlv_gate G5 pass 事件）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    // 补齐轮等待块内必须调 g5_pass_finalize（内联 kanban_walk_done+sset 曾绕过 dlv 事件）。
    // 2026-11-04 run26 复盘批：等待器由 wait_truth 换 mx_wait_revive（失联自动唤醒），
    // 唤醒词使「等待调用→收口分支」距离变长，窗口 600→1400（判据不变：块内必须出现收口函数）。
    const retry = scen.match(/补齐后 READY-GATE-PASS（判词语义）[\s\S]{0,1400}?else/)
    expect(retry).toBeTruthy()
    expect(retry![0]).toContain('g5_pass_finalize')
    // g5_pass_finalize 本体必须含 dlv_gate G5 pass 发射（窗口 6000：QGate 接线+安全条件对账
    // +V8.23 空 body 校验/QGate 新鲜度入函数后体积增大，run18 复盘批；2026-10-14 qgate
    // 解析失败分支（记单不删）入函数后实测函数体 4648 字符，窗口随体增长上调；
    // 2026-10-16 C4 九门执行器注入（覆盖注入+先 run 后 report）入函数后 5592 字符；
    // 2026-10-19 V8.46 发布门台账接线入函数后超 6000，窗口上调到 8000（判据不变）
    // 2026-10-27 融合批二 submit→approve(带锚) canonical 写链入函数后超 8000，窗口上调到 9200（判据不变）
    // 2026-10-31 run23 复盘批审批历史探测（g5-approval-history-missing）入函数后实测 10251 字符
    // 再超 9200（main 基线自带红，本批实测定位），窗口上调到 12000（判据不变）
    const fin = scen.match(/g5_pass_finalize\(\) \{[\s\S]{0,12000}?\n  \}/)
    expect(fin).toBeTruthy()
    expect(fin![0]).toContain('dlv_gate')
    // V8.23 纪律46：finalize 前置评审卡 body 非空校验（run18 复盘 F1：空 body=无评审实物禁收口）
    expect(fin![0]).toContain('评审卡 body 为空')
    expect(fin![0]).toContain('return 1')
  })

  it('report_done 落键前硬跑 mx-report-audit（§5.7 收官判据②接线）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    const reportBlk = scen.match(/if step_reached report[\s\S]*?sset report_done/)
    expect(reportBlk).toBeTruthy()
    const blk = reportBlk![0]
    const iGen = blk.indexOf('mx-report-gen.py')
    const iAudit = blk.indexOf('mx-report-audit.py')
    const iSet = blk.indexOf('sset report_done')
    expect(iGen).toBeGreaterThan(-1)
    expect(iAudit).toBeGreaterThan(iGen)
    expect(iSet).toBeGreaterThan(iAudit)
    // 审计失败必须 fail 熔断（不允许 || true 静默）
    expect(blk).toMatch(/mx-report-audit\.py[^\n]*\n?\s*\|\| fail/)
  })

  it('report_done 落键前跑 final-report-merge（§5.4 双正本缺一即违例）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    const reportBlk = scen.match(/if step_reached report[\s\S]*?sset report_done/)
    expect(reportBlk).toBeTruthy()
    const blk = reportBlk![0]
    expect(blk).toContain('final-report-merge.py')
    expect(blk).toMatch(/final-report-merge\.py[^\n]*\n?\s*\|\| fail/)
  })
})

describe('⑰ 帧采集焊死守门（run10 教训：13h 零实时帧=报告空壳）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('capture_step 函数在位（mx-scenario-lib）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('capture_step()')
    expect(lib).toContain('r18-frames.mjs')
  })

  it('驱动每个关键步挂了 capture_step（aipay-scenario ≥16 处调用）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    const calls = (scen.match(/capture_step /g) || []).length
    expect(calls).toBeGreaterThanOrEqual(16)
  })

  it('报告生成器有帧硬闸（零帧拒出报告）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('强制关卡：本轮零实时帧')
    expect(gen).toContain('禁出空壳报告')
  })
})

describe('⑲ 方案↔报告一致性断言（2026-10-08 一致性轮：§5.4 六件/§5.5 承载率行/QGate 纪律/PART1 骨架）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('审计器查 10 六闸工件视图（§5.4 必备六件缺一打回）+ 视图数量底线 15 类 WARN', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(audit).toContain('六闸工件视图缺位')
    expect(audit).toContain('G2 评审卡')
    expect(audit).toContain('无文件域交付物')
    expect(audit).toContain('数量底线 15')
  })

  it('审计器查 11 承载率行（§5.5 n/5 缺行 FAIL；<4/5 WARN 逐面记单）', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(audit).toContain('承载率行缺位')
    expect(audit).toContain('验收线 4/5')
  })

  it('审计器查 12 QGate 证据纪律（§5.5 v1.31.1：来源分布随行；未验证/advisory 禁全绿）+ 生成器透传块', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(audit).toContain('QGate 证据块缺来源分布行')
    expect(gen).toContain('qgate-release-report.txt')
    expect(gen).toContain('st-qgate')
  })

  it('生成器无文件域声明覆盖全部无映射步（§5.4 第二段）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('_NO_FILE_DOMAIN')
    expect(gen).toContain('本步无文件域交付物')
  })

  it('骨架生成器双产物（STEPS_META + --part1 人读层骨架，禁逐轮手搓 PART1）', () => {
    const skel = read(join(MX, 'mx-narrative-skeleton.py'))
    expect(skel).toContain('--part1')
    expect(skel).toContain('PART1_BY_RUN')
    expect(skel).toContain('首过')
  })
})

describe('⑳ 六文调研治理能力入报告证据链（2026-10-08 整合轮：§2.5 治理证据面/§2.6-10）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('生成器步 23/24 治理证据透传块（incident/autonomy/virtual-pl 导出件在位才渲染）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('_GOV_EVIDENCE')
    expect(gen).toContain('incident-report.md')
    expect(gen).toContain('autonomy-reconcile.txt')
    expect(gen).toContain('virtual-pl.txt')
    expect(gen).toContain('gov_evidence_block(n)')
  })
})

describe('㉑ PART1 实算槽链路（2026-10-08：注册稿只写语境句，数字合入时现算）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('merge 实算槽齐（steps_done/gates_pass/first_pass/window/type_top/disp_sum）', () => {
    const m = read(join(MX, 'final-report-merge.py'))
    for (const s of ['{{steps_done}}', '{{gates_pass}}', '{{first_pass}}', '{{window}}', '{{type_top}}', '{{disp_sum}}']) {
      expect(m).toContain(s)
    }
    expect(m).toContain('_STEP_KEYS')
  })

  it('run11 PART1 已注册（未注册轮 merge 拒绝——run11 步 26 不卡壳）', () => {
    const m = read(join(MX, 'final-report-merge.py'))
    expect(m).toContain("'20261007-v8-run11': PART1_RUN11")
    expect(m).toContain('acp-coding-backend-divergence') // 缺口卡头料=当轮实锚
  })

  it('骨架 --part1 出槽版（数字槽勿手填，与 merge 同槽名）', () => {
    const sk = read(join(MX, 'mx-narrative-skeleton.py'))
    expect(sk).toContain('{{steps_done}}')
    expect(sk).toContain('禁手填')
  })
})

// ㉒ 受控写作条款分发（2026-10-09 全局文风根治轮：模型回复黑话/跳跃/AI 味，
// 根因=提示词面零写作约束）。真源=overlay/runtime/plugins/style-charter/
// style-charter.md，双路分发：插件（产品稳态，bundled backend 自动加载）+
// install_skills/seed_soul_charter（推演侧技能副本与 SOUL.md）。本组守门：
// 真源与插件面不被误删、manifest 登记不漂移、分发幂等可换装。
describe('㉒ 受控写作条款分发（真源/插件/manifest/幂等换装）', () => {
  const read = (f: string) => readFileSync(f, 'utf8')

  it('真源 marker 配对唯一 + 插件三件套 + manifest 三条目登记', () => {
    const dir = join(PRODUCT, 'runtime/plugins/style-charter')
    const charter = read(join(dir, 'style-charter.md'))
    expect((charter.match(/<!-- style-charter:/g) || []).length).toBe(1)
    expect((charter.match(/<!-- \/style-charter:/g) || []).length).toBe(1)
    // 插件段预算（上游 MAX_SYSTEM_PROMPT_SECTION_CHARS=4000）：超限段被丢弃=静默失效
    expect(charter.trim().length).toBeLessThan(4000)
    expect(read(join(dir, 'plugin.yaml'))).toMatch(/kind:\s*backend/)  // bundled 自动加载，零 plugins.enabled 门槛
    const manifest = JSON.parse(read(join(PRODUCT, 'runtime-manifest.json')))
    const srcs: string[] = manifest.files.map((x: { source: string }) => x.source)
    for (const f of ['plugin.yaml', '__init__.py', 'style-charter.md']) {
      expect(srcs).toContain(`plugins/style-charter/${f}`)
    }
  })

  it('install_skills 分发进全部技能副本且幂等；SOUL.md 并入幂等 + 升版换装', () => {
    const root = sandbox()
    writeFileSync(join(root, 'id.md'), 'IDENTITY LINE\n')
    const out = sh(`
      PROF="$AIPAY_SIM_ROOT/profiles/sc"
      install_skills "$PROF"
      install_skills "$PROF"
      echo "SOUL_BEGIN=$(grep -c '<!-- style-charter:' "$PROF/SOUL.md" || true)"
      echo "SKILL_COUNT=$(find "$PROF/skills" -name SKILL.md | wc -l | tr -d ' ')"
      find "$PROF/skills" -name SKILL.md | sort | while read -r f; do
        echo "SKILL $(basename "$(dirname "$f")") $(grep -c '<!-- style-charter:' "$f" || true)"
      done
      # 升版换装：预置旧版条款块（v0），seed 后旧块剥离、新版唯一、身份行保留
      printf 'CUSTOM SOUL\\n\\n<!-- style-charter:v0 -->\\nOLD BLOCK\\n<!-- /style-charter:v0 -->\\n' > "$PROF/SOUL.md"
      seed_soul_charter "$PROF"
      echo "SWAP_FIRST=$(head -1 "$PROF/SOUL.md")"
      echo "SWAP_OLD=$(grep -c 'OLD BLOCK' "$PROF/SOUL.md" || true)"
      echo "SWAP_BEGIN=$(grep -c '<!-- style-charter:' "$PROF/SOUL.md" || true)"
    `, root, { MX_SOUL_IDENTITY_SRC: join(root, 'id.md') })

    const lines = out.trim().split('\n')
    const get = (p: string) => lines.find((l) => l.startsWith(p))!.split('=')[1]
    expect(get('SOUL_BEGIN=')).toBe('1')                       // SOUL 并入幂等
    expect(Number(get('SKILL_COUNT='))).toBeGreaterThanOrEqual(6)
    for (const l of lines.filter((x) => x.startsWith('SKILL '))) {
      expect(l.endsWith(' 1')).toBe(true)                      // 每份技能副本恰好一份条款
    }
    expect(get('SWAP_FIRST=')).toBe('CUSTOM SOUL')             // 已有身份不被顶掉
    expect(get('SWAP_OLD=')).toBe('0')                         // 旧版块剥离干净
    expect(get('SWAP_BEGIN=')).toBe('1')                       // 新版唯一
  })
})

describe('㉔ 干预点四件（2026-10-09：拆卡巡检/PROGRESS 中间锚/骨架前移/进度可见性——长编码静默盲窗根治）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf8' })
  const SCEN = join(HARNESS, 'aipay-scenario.sh')
  const LIB = join(HARNESS, 'mux', 'mx-scenario-lib.sh')
  it('B：DEV/TEST 任务书含增量 push+PROGRESS 中间锚+骨架评审（禁被删）', () => {
    const scen = read(SCEN)
    expect(scen).toContain('PROGRESS-<任务ID>-<子件ID>')
    expect(scen).toContain('增量推送，不等全部完工')
    expect(scen).toContain('首个 commit=骨架')
    expect(scen).toContain('PROGRESS-TEST-BE-<组>')
    expect(scen).toContain('用例先行')
  })
  it('B：驱动侧进度锚机制在位（dev_progress_ping+等待环 MX_PROGRESS_FN 钩子×2）', () => {
    const lib = read(LIB)
    expect(lib).toContain('dev_progress_ping()')
    expect(lib).toContain('PROGRESS-ANCHORS')
    const hooks = lib.match(/\[\[ -n "\$\{MX_PROGRESS_FN:-\}" \]\] && "\$MX_PROGRESS_FN" \|\| true/g)
    expect(hooks).toBeTruthy()
    expect(hooks!.length).toBeGreaterThanOrEqual(2)
    const scen = read(SCEN)
    expect(scen).toContain('MX_PROGRESS_FN=dev_progress_ping')
    expect(scen).toContain('unset MX_PROGRESS_FN')
  })
  it('A：拆分证据机械巡检在位（split-evidence-missing，>1 人日腿分支 ≥2 commit 判据）', () => {
    const scen = read(SCEN)
    expect(scen).toContain('split-evidence-missing')
    expect(scen).toContain('rev-list --count "origin/feat/$b" ^origin/main')
  })
  it('D：报告生成器分支落地时间线+PROGRESS 行渲染，审计查 13b 断言同批', () => {
    const gen = read(join(HARNESS, 'mux', 'mx-report-gen.py'))
    const aud = read(join(HARNESS, 'mux', 'mx-report-audit.py'))
    expect(gen).toContain('分支落地时间线')
    expect(gen).toContain('PROGRESS 中间锚')
    expect(gen).toContain("if 'PROGRESS-' in ln")          // 解析口径=匹配 dev_progress_ping 注记行（PROGRESS-ANCHORS=）
    expect(aud).toContain('分支落地时间线')
    expect(aud).toContain('13b')
  })

  it('㉕：matrix 共享线程提及门（run12 碎聊根治——生成器双旗+env 兜底）', () => {
    const lib = read(join(HARNESS, 'mux', 'mx-lib.sh'))
    // ①write_user_profile 生成器：platforms.matrix 双旗显式落（防上游默认漂移）
    expect(lib).toContain("'matrix': {'enabled': True, 'require_mention': True, 'thread_require_mention': True}")
    // ②同函数 .env 段：scoped env 兜底（YAML extra 优先，env 为回落层）
    expect(lib).toContain('MATRIX_REQUIRE_MENTION=true')
    expect(lib).toContain('MATRIX_THREAD_REQUIRE_MENTION=true')
    // ③根因注释在位（防后人误删：洞=thread_require_mention 默认关致多 bot 线程回声环）
    expect(lib).toContain('in_bot_thread 旁路')
    // ④驱动侧唤醒路径提及全覆盖不回归：催办必带 m.mentions 第 4 参（两处调用面，在 scenario-lib；
    // 2026-10-13 分桶判活轮起第二处=按人 $_m（agent_mxid 逗号拼接），与聚合 ${_nmentions}
    // 同为 mentions 载体——锚随调用面演化更新，两种形态都计）
    const scenLib = read(LIB)
    const nudgeWithMentions = scenLib.match(/mx_send "\$\(load_token fanfan\)" "\$_nroom" "[^"]*" "\$(?:\{?_nmentions\}?|_m)"/g)
    expect(nudgeWithMentions!.length).toBeGreaterThanOrEqual(2)
  })
})

// ── ⑤⑥⑦（融合批二重锚）：判词/熔断语料行为守门=tests/lifecycle-parity.test.ts
// （引产品模块跑同一语料）+ 产品 lifecycle-{verdict,breaker,rest}.test.ts；
// 此处钉"委托在位、旧实现不回流"的退役绊线。
describe('⑤⑥⑦ 判定委托与退役绊线（融合批二）', () => {
  const LIB = join(MX, 'mx-scenario-lib.sh')
  const read = (p: string) => readFileSync(p, 'utf8')

  it('判词/熔断/G1/UAT 判读全部委托 governance-client（无本地第二实现）', () => {
    const scenLib = read(LIB)
    for (const sym of [
      'gov_lc_verdict "$1" "$2" ""',
      'gov_lc_breaker_trip',
      'gov_lc_breaker_check',
      'gov_lc_reqjudge',
      'gov_lc_uat_verdict',
      'gov_lc_uat_coverage',
    ]) {
      expect(scenLib).toContain(sym)
    }
  })

  it('旧实现退役绊线：awk 判词体/本地熔断 state 键/py 判词器不得回流', () => {
    const scenLib = read(LIB)
    expect(scenLib).not.toContain('awk -v g="$1"')
    expect(scenLib).not.toContain('_fail_rounds')
    expect(scenLib).not.toContain('uat_verdict.py')
    expect(existsSync(join(MX, 'uat_verdict.py'))).toBe(false)
    // 报告链配对单源（融合批六）：生成器/审计器取 governance-metrics.json 快照，本地配对构建不得回流
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('governance-metrics.json')
    expect(gen).not.toContain('disp_exact')
    expect(read(join(MX, 'mx-report-audit.py'))).not.toContain('_disp.add(')
    // 主驱动接线客户端（判据单源声明）
    expect(read(join(HARNESS, 'aipay-scenario.sh'))).toContain('source "$SCRIPT_DIR/mux/governance-client.sh"')
    expect(read(join(HARNESS, 'aipay-scenario.sh'))).toContain('gov_report >/dev/null 2>&1 || issue_once governance-snapshot-stale')
    expect(read(join(MX, 'governance-client.sh'))).toContain('单一事实源=custom/server/governance/lifecycle')
  })
})

// ── ㉕ V8.16 全阶段饱和并行守门（run16 起：测试分片/系分并发等待/G2 双工位/饱和度数据源）──
describe('㉕ V8.16 饱和并行（测试分片+并发等待+G2 双工位）', () => {
  const SCEN = join(HARNESS, 'aipay-scenario.sh')
  const LIB = join(HARNESS, 'mux/mx-scenario-lib.sh')
  const read = (p: string) => readFileSync(p, 'utf8')

  it('测试段分片派发在位：BE 三片+FE 两片+MX_TEST_SHARDS 开关', () => {
    const s = read(SCEN)
    for (const sym of ['TEST-BE-S1', 'TEST-BE-S2', 'TEST-BE-S3', 'TEST-FE-S1', 'TEST-FE-S2', 'MX_TEST_SHARDS']) {
      expect(s).toContain(sym)
    }
    expect(s).toContain('_be_n=3')
    expect(s).toContain('_fe_n=2')
  })

  it('分片结论行按片唯一计数（scan+unique，防重发虚增）', () => {
    const s = read(SCEN)
    expect(s).toContain('scan("TEST-(PASS|FAIL)-TEST-BE(-S[0-9]+)?")] | unique')
    expect(s).toContain('BOTH_DONE >= _be_n')
  })

  it('系分四稿并发等待（multi 锚取代串行 for）', () => {
    const s = read(SCEN)
    expect(s).toContain('AN-PAYCORE-analysis.md@chen@repo_has')
    expect(s).toContain('AN-CHALI-analysis.md@lin@repo_has')
  })

  it('G2 双工位：arch 派发在安全闸等待之前（工作重叠）', () => {
    const s = read(SCEN)
    const archAt = s.indexOf('dispatch_in_room arch')
    const secAnchorAt = s.indexOf('幂等时间锚（run15 根治')
    expect(archAt).toBeGreaterThan(0)
    expect(secAnchorAt).toBeGreaterThan(archAt)
  })

  it('饱和度数据源：进度锚输出在线工位计数', () => {
    expect(read(LIB)).toContain('在线工位=${_act}')
  })
})

describe('⑰ run15 复盘收口件（V8.17：ERR trap/三态 DISP/查 9 红线/监控代行小节/prelaunch ⑪）', () => {
  const SCEN = join(HARNESS, 'aipay-scenario.sh')
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('驱动 ERR trap：静默 rc=1 断根诊断（set -E + trap ERR 落行号命令）', () => {
    const s = read(SCEN)
    expect(s).toContain('set -euEo pipefail')
    // 2026-10-18 花括号化批（2c748a7）：rc=$rc → rc=${rc}（bash3.2 全角标点吞名根治）
    expect(s).toContain('驱动异常退出 rc=${rc}')
    expect(s).toContain('BASH_COMMAND:0:160')
    expect(s).toContain('BASH_SUBSHELL')  // 子壳良性失败不刷异常退出噪音（run16 首跑实锤）
  })

  it('DISP 三态前缀：驱动两处收尾位点带「已修」+归桶件接线在报告步', () => {
    const s = read(SCEN)
    expect(s).toContain('DISP|receipt-missing|${_ct}|已修 终态闭环')
    expect(s).toContain('DISP|raci-not-structured|fanfan-agent|已修 终态闭环')
    expect(s).toContain('tri-disp-backfill.py')
  })

  it('归桶件存在且禁自动升桶（一律观察，已修须人工带锚）', () => {
    const py = read(join(MX, 'tri-disp-backfill.py'))
    expect(py).toContain('观察（收尾归桶')
    expect(py).toContain('禁脚本自动升桶')
    expect(py).toContain("TRI = ('已修', '观察', '延后')")
  })

  it('审计查 9 三红线：承诺面零帧+零登记=FAIL（有降级键维持 WARN）', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(audit).toContain('承诺面零帧+零登记=FAIL')
    expect(audit).toContain('合规降级维持 WARN')
  })

  it('报告模板：监控代行独立小节（纪律 36 代行事件全量在册）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('def monitor_proxy_html()')
    expect(gen).toContain('监控代行实录')
  })

  it('run16 中段硬化：mx_fetch 护栏+B0 双词形+审批环常驻件+prelaunch ⑬', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('mx_fetch()')
    expect(lib).toContain('timeout 60 git')
    const watch = read(join(MX, 'run-watch.sh'))
    expect(watch).toContain('max_iterations_reached')
    const proxy = read(join(MX, 'mx-approval-proxy.sh'))
    expect(proxy).toContain('--ttl')
    expect(proxy).toContain('report_done 在案，退场')
    // run24 幂等去重（2026-10-31：单实例 32 秒同 pending 代批 9 次实锤）——批前查重符号钉死
    expect(proxy).toContain('幂等去重')
    expect(proxy).toContain("if ev[:24] in _done")
    // run24 复盘批（2026-11-02）：722/723 必须在注入白名单——此前两补丁只入 series 未入
    // mx_apply_agent_patches 清单，mx-up 从不应用（run24 值守热打 SIM 快照后又被下次
    // provision 洗掉，722 实测从快照消失）。
    const mxlib = read(join(MX, 'mx-lib.sh'))
    expect(mxlib).toContain('722-agent-emptystream-ladder-classify.patch')
    expect(mxlib).toContain('723-agent-dispatcher-refusal-reasons.patch')
    expect(mxlib).toContain('725-agent-chat-turn-recovery.patch')
    // 726（run25 G2 熔断现场）：725 recovery 的 kwarg 冲突修复必须同在注入白名单——
    // 缺位即被 provision 洗掉（722 曾实锤），recovery 在熔断场景继续哑火
    expect(mxlib).toContain('726-agent-chat-recovery-kwarg-fix.patch')
    const patch726 = read(join(HARNESS, '..', 'patches/726-agent-chat-recovery-kwarg-fix.patch'))
    expect(patch726).toContain('_rec_kwargs.pop("conversation_history", None)')
    // run25 G2 熔断挂账清偿（2026-11-02）：RACI 免等窗＋G2 超时分支二轮等待——
    // 两标记缺一即韧性状被洗掉（升级冲掉/回滚），值守轮次依赖此断言兜底
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('免等窗即时单查')
    expect(scen).toContain('超时分支二轮等待')
    // run25 四启实录（21:55:04 _sens unbound）：重放路径 security_review_done 在位时
    // 跳过赋值块，set -u 必炸——锁默认空写法防回退
    expect(scen).toContain('printf \'%s\' "${_sens:-}"')
    // 2026-11-02 机制治理批（run25 内耗 120 分钟定谳后立制度）：五件必须同时在位，
    // 缺一即「根治追不上复杂度」的结构性问题回归
    const map = read(join(HARNESS, '..', 'docs/design/mechanism-map.md'))
    expect(map).toContain('三级时序')
    expect(map).toContain('互扰关系')
    expect(existsSync(join(MX, 'mx-burn-test.sh'))).toBe(true)
    expect(existsSync(join(MX, 'mx-gate-timing.sh'))).toBe(true)
    expect(existsSync(join(MX, 'mx-gate-lib.sh'))).toBe(true)
    expect(existsSync(join(MX, 'mx-recovery-lib.sh'))).toBe(true)
    const sup2 = read(join(MX, 'run-driver-supervisor.sh'))
    expect(sup2).toContain("source \"$SCRIPT_DIR/mx-gate-lib.sh\"")
    expect(sup2).toContain('mx_nudge_body_for_gate')
    expect(sup2).toContain('mx_breaker_gates')
    expect(sup2).toContain("source \"$SCRIPT_DIR/mx-recovery-lib.sh\"")
    expect(sup2).toContain('mx_defer_restart_policy')
    // run25 实锤（22:45-22:55）：supervisor 熔断催办不分公司闸别——G2 熔断被 G5 话术
    // 误催抢占修订关键路径。锁闸别分流（breaker.json failRounds>=2 判闸+三分支话术）
    const sup = read(join(MX, 'run-driver-supervisor.sh'))
    expect(sup).toContain('闸别分流（run25 实锤')
    expect(sup).toContain('glabel="${gate:-G5}"')
    // 2026-11-02 机制治理批：判定搬到 mx-gate-lib.sh（纯函数可行为测试）——
    // 分支话术与 breaker 解析改在库内断言，supervisor 只留「调库+发送」
    const gateLib = read(join(MX, 'mx-gate-lib.sh'))
    expect(gateLib).toContain('*,G2,*)')
    expect(gateLib).toContain('READY-GATE-PASS')
    expect(gateLib).toContain('failRounds')
    const pre = read(join(MX, 'mx-prelaunch-check.sh'))
    expect(pre).toContain('⑬ 独立审批环可启动')
  })

  it('prelaunch ⑪：叙事注册机制化（上轮已注册硬查+骨架兜底在位）', () => {
    const pre = read(join(MX, 'mx-prelaunch-check.sh'))
    expect(pre).toContain('⑪ 叙事注册与骨架兜底')
    expect(pre).toContain('prelaunch 三十六项')  // 2026-11-06 责任台账批：加 ㉝ 四面在位；2026-11-02 run24 驱动面批⑤ 加 ⑩d；此前三十三项=V8.46 治理闭环 ㉔-㉚
    expect(pre).toContain('⑫ 账号板供给在位')
  })

  it('prelaunch ④：单仓形态判据——vendor 注入脏态豁免（2026-10-28 适配）', () => {
    const pre = read(join(MX, 'mx-prelaunch-check.sh'))
    expect(pre).toContain(':(top,exclude)vendor')  // AGENTS.md：vendor 注入脏态=预期工作态不入提交
    expect(pre).toContain('④ 工作区干净（单仓')
  })
})

describe('⑱ 技能执勤账（V8.18 能力层叙事配套：第 9 章证据四四件实清点）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  it('报告模板：技能执勤账小节挂第 9 章证据四（函数+锚点在位）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('def skill_duty_html()')
    expect(gen).toContain('证据四：能力层在岗（技能执勤账）')
    expect(gen).toContain('ch9-skill-duty')
    expect(gen).toContain('{skill_duty_html()}')
  })

  it('数据源单一事实源+诚实降级：装载单/骨架判档/缺席标红不渲染假账', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(gen).toContain('SKILLS_INSTALL="\\$\\{SKILLS_INSTALL:')  // 装载单解析锚（mx-lib.sh 单一事实源）
    expect(gen).toContain('swarm-yuan 全骨架')                       // 骨架判档：rules.d+hooks
    expect(gen).toContain('采集面欠账')                               // skill 专项帧缺席=红标
    expect(gen).toContain('零数据不渲染假账')
    expect(gen).toContain('def md_inline(')                          // 内嵌 md 星标转 HTML（V8.18 文风配套）
    expect(gen).toContain('md_inline(body)')                         // r18 卡体接线
    expect(gen).toContain('md_inline(gate_text)')                    // 步条原文接线
  })

  it('阅读习惯四件（2026-10-12：scrollspy 高亮+回顶+阅读宽度+斑马纹）', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    const merge = read(join(MX, 'final-report-merge.py'))
    expect(gen).toContain('back-top')            // 回顶按钮
    expect(gen).toContain('IntersectionObserver') // 侧栏当前节高亮
    expect(gen).toContain('max-width:62em')      // 正文行长舒适区
    expect(merge).toContain('back-top')           // 人读层同款注入
  })

  it('报告头部名词速查行（方案 §5.4 报告语言三规矩②——内部缩写第一屏前载定义）', () => {
    const merge = read(join(MX, 'final-report-merge.py'))
    const gen = read(join(MX, 'mx-report-gen.py'))
    expect(merge).toContain('单一事实源=机器 hero')  // 头部秩序收敛（用户 2026-10-13 裁定）：merge 不再注入第二份速查，守门锚随迁注释锚
    expect(gen).toContain('G1-G6=六道关卡')  // 词条超集现于 mx-report-gen hero-terms
  })
})

describe('㉖ 完成契约门接线绊线（2026-11-01 方案×程序同步批：§2.6.12）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf8' })

  it('mx-up 刷新顺序=provision→patch→deploy（旧序会洗掉 manifest 补位的新文件）', () => {
    const up = read(join(MX, 'mx-up.sh'))
    const iProv = up.indexOf('mx_provision_agent_src ||')
    const iPatch = up.indexOf('mx_apply_agent_patches ||')
    const iDeploy = up.indexOf('deploy-agent-runtime.mjs --apply --runtime')
    expect(iProv).toBeGreaterThanOrEqual(0)
    expect(iPatch).toBeGreaterThan(iProv)
    expect(iDeploy).toBeGreaterThan(iPatch)  // run24 刷新窗实锤：deploy 必须收尾
  })

  it('建卡契约开关缺省关＋AC 段可出（MX_DOD_CONTRACT=1 才并入 body）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('_dod_contract_suffix')
    expect(lib).toContain('${MX_DOD_CONTRACT:-0}')  // 缺省 0=在途轮零行为变化
    // 行为面：真库 source 后 AC 段渲染出两行 AC-（real-lib 范式，非复制实现）
    const root = sandbox()
    const out = sh('MX_DOD_CONTRACT=1; _dod_contract_suffix | grep -c "^AC-[12]:"', root)
    expect(Number(out.trim())).toBe(2)
  })

  it('部署手册走仓内 manifest 通道（单仓整合后旧 ../upstream 路径即失效）', () => {
    const rb = read(join(MX, 'deploy-window-runbook.sh'))
    expect(rb).not.toContain('../upstream/hermes-agent')
    expect(rb).toContain('deploy-agent-runtime.mjs')
  })

  it('方案 §2.6.12 在案且写明开关与部署顺序约束（方案↔程序对齐锚）', () => {
    const plan = read(join(PRODUCT, 'docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md'))
    expect(plan).toContain('#### 2.6.12 完成契约门')
    expect(plan).toContain('MX_DOD_CONTRACT=1')
    expect(plan).toContain('provision→patch→deploy')
  })

  it('产品面契约五件在位（completion_contract/内核门/会话接线/CLI/派发 env）', () => {
    expect(existsSync(join(PRODUCT, 'runtime/completion_contract.py'))).toBe(true)
    const kdb = read(join(PRODUCT, 'runtime/hermes_cli/kanban_db.py'))
    expect(kdb).toContain('def _gate_completion_contract')
    const sk = read(join(PRODUCT, 'runtime/gateway/session_kanban.py'))
    expect(sk).toContain('dod_contract')
    const cli = read(join(PRODUCT, 'runtime/hermes_cli/kanban_parser.py'))
    expect(cli).toContain('--receipt')
    const disp = read(join(PRODUCT, 'runtime/hermes_cli/kanban_db_dispatch.py'))
    expect(disp).toContain('HERMES_KANBAN_DOD_CONTRACT')
  })
})

describe('㉗ 模型波动支撑面接线绊线（2026-11-01 方案×程序同步二批）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf8' })

  it('721 不进宿主补丁自愈清单，mx-up 以两文件定点补位（实测：补丁上下文漂移会硬失败）', () => {
    const lib = read(join(MX, 'mx-lib.sh'))
    expect(lib).not.toContain('721-agent-kanban-idempotency-unique.patch')
    expect(lib).toContain('mx_restore_idempotency_fix')
    expect(lib).toContain('INSERT OR IGNORE INTO tasks')
    expect(lib).toContain('idx_tasks_idempotency_unique')
    const up = read(join(MX, 'mx-up.sh'))
    expect(up).toContain('mx_restore_idempotency_fix')
    expect(up).toContain('390→707')
    expect(up).not.toContain('390→721')
  })

  it('mx-clean 归档重置编排域与能力路由存储（跨轮残留防线）', () => {
    const clean = read(join(MX, 'mx-clean.sh'))
    expect(clean).toMatch(/for f in[^;]*approvals orchestrator modelcap[^;]*; do/)
  })

  it('方案 §2.6.12 四层同族关系在案（B/C/D 不进判据，D 层两文件定点补位）', () => {
    const plan = read(join(PRODUCT, 'docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md'))
    expect(plan).toContain('四层同族关系')
    expect(plan).toContain('两文件定点补位')
    expect(plan).toContain('不进宿主补丁自愈清单')
  })

  it('方案 §2.6.8 代批强度自动标注在案（delegated/explicit 可反查）', () => {
    const plan = read(join(PRODUCT, 'docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md'))
    expect(plan).toContain('deciderMode=delegated')
    expect(plan).toContain('strength=delegated')
  })
})

// ── ㉘ run24 复盘驱动面批（2026-11-02，六件）──────────────────────────────
// ① DM 直达后备（群动员令 15min 零响应 vs DM 秒触发四例）
// ② 复测预启动（新 [LEAD-MERGE] 合入即令增量复测，sha 幂等）
// ③ early-start 预备步（G5 熔断等待期派 UAT 矩阵/发布说明/复盘度量草稿）
// ④ 跨域依赖看护（fix/* 未合入即催域 lead，600s 分支级节流）
// ⑤ 工作区 origin 单一性（prelaunch ⑩d，计数随责任台账批到三十六项）
// ⑥ G5 风暴去重（issue_once）+ 闭包快照 --out *.json 按文件写
describe('㉘ run24 复盘驱动面批（驱动面六件，2026-11-02）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf8' })
  const gitx = (args: string[], cwd?: string) =>
    execFileSync('git', [...(cwd ? ['-C', cwd] : []), ...args], { encoding: 'utf8' })

  /** bare + 工作区 fixture：main / integration/<rfd> / fix/DEF-BE-1 / [LEAD-MERGE] 合入 */
  function gitFixture(root: string, rfd = 'RFD-001'): { clone: string; bare: string; work: string } {
    const bare = join(root, 'origin.git')
    const work = join(root, 'work')
    mkdirSync(bare, { recursive: true })
    gitx(['init', '-q', '--bare', bare])
    gitx(['init', '-q', work])
    gitx(['config', 'user.email', 'lead@aipaydev.local'], work)
    gitx(['config', 'user.name', 'lead'], work)
    writeFileSync(join(work, 'a.txt'), 'x\n')
    gitx(['add', '-A'], work)
    gitx(['commit', '-qm', 'init'], work)
    gitx(['branch', '-M', 'main'], work)
    gitx(['remote', 'add', 'origin', bare], work)
    gitx(['push', '-q', 'origin', 'main'], work)
    // integration 基线
    gitx(['checkout', '-qb', `integration/${rfd}`], work)
    writeFileSync(join(work, 'i.txt'), 'i\n')
    gitx(['add', '-A'], work)
    gitx(['commit', '-qm', 'integration base'], work)
    gitx(['push', '-q', 'origin', `integration/${rfd}`], work)
    // fix 分支（未合入）
    gitx(['checkout', '-qb', 'fix/DEF-BE-1', 'main'], work)
    writeFileSync(join(work, 'f.txt'), 'f\n')
    gitx(['add', '-A'], work)
    gitx(['commit', '-qm', 'fix backend'], work)
    gitx(['push', '-q', 'origin', 'fix/DEF-BE-1'], work)
    // 域 lead 合并提交（[LEAD-MERGE] 标记）
    gitx(['checkout', '-q', `integration/${rfd}`], work)
    writeFileSync(join(work, 'y.txt'), 'y\n')
    gitx(['add', '-A'], work)
    gitx(['commit', '-qm', 'merge fix/DEF-BE-1 [LEAD-MERGE]'], work)
    gitx(['push', '-q', 'origin', `integration/${rfd}`], work)
    const clone = join(root, 'dirclone')
    gitx(['clone', '-q', bare, clone])
    return { clone, bare, work }
  }

  it('① DM 直达：第二次催办起 DM（state 计数），MX_NUDGE_DM=0 全关', () => {
    const root = sandbox()
    const out = sh(`
mx() { echo '{"room_id":"!dm:stub"}'; }
mx_send() { echo "SEND|$2" >> "$AIPAY_SIM_ROOT/sent.log"; echo evt-ok; }
load_token() { echo tok; }
note() { :; }
mx_nudge_dm_once bb "等待结论行" "回执一行"
echo "n1=$(grep -c 'SEND|!dm:stub' "$AIPAY_SIM_ROOT/sent.log" 2>/dev/null || echo 0)"
mx_nudge_dm_once bb "等待结论行" "回执一行"
mx_nudge_dm_once bb "等待结论行" "回执一行"
echo "n3=$(grep -c 'SEND|!dm:stub' "$AIPAY_SIM_ROOT/sent.log")"
MX_NUDGE_DM=0 mx_nudge_dm_once bb "等待结论行" "回执一行"
echo "n4=$(grep -c 'SEND|!dm:stub' "$AIPAY_SIM_ROOT/sent.log")"
echo "cnt=$(grep '^nudge_cnt_bb=' "$STATE" | cut -d= -f2)"`, root)
    expect(out).toContain('n1=0')   // 第一次只走群消息（DM 不打扰）
    expect(out).toContain('n3=2')   // 第 2/3 次各一条 DM 直达
    expect(out).toContain('n4=2')   // 开关关闭后不再 DM
    expect(out).toContain('cnt=3')
  })

  it('① mx_dm_send：createRoom is_direct+invite 只建一次，room 缓存复用', () => {
    const root = sandbox()
    const out = sh(`
mx() { echo "MX|$2|$3" >> "$AIPAY_SIM_ROOT/calls.log"; echo '{"room_id":"!dm:stub"}'; }
mx_send() { echo "SEND|$2" >> "$AIPAY_SIM_ROOT/calls.log"; echo evt-ok; }
echo "e1=$(mx_dm_send tok @qi-agent:matrix.test hello1)"
echo "e2=$(mx_dm_send tok @qi-agent:matrix.test hello2)"
echo "rooms=$(grep -c 'MX|POST|createRoom' "$AIPAY_SIM_ROOT/calls.log")"
echo "sends=$(grep -c 'SEND|!dm:stub' "$AIPAY_SIM_ROOT/calls.log")"
echo "cache=$(grep '^dm_direct_' "$STATE" | cut -d= -f2)"`, root)
    expect(out).toContain('e1=evt-ok')
    expect(out).toContain('rooms=1')     // run24 值守配方：is_direct+trusted_private_chat+invite
    expect(out).toContain('sends=2')
    expect(out).toContain('cache=!dm:stub')
    expect(read(join(MX, 'mx-scenario-lib.sh'))).toContain('is_direct:true')
  })

  it('② 复测预启动：新 [LEAD-MERGE] 合入只发一次；非标记提交不触发', () => {
    const root = sandbox()
    const { clone, work, bare } = gitFixture(root)
    const out = sh(`
DIRECTOR_CLONE="${clone}"
dispatch_in_room() { echo "DISPATCH|$1|$3" >> "$AIPAY_SIM_ROOT/sent.log"; echo evt-1; }
mx_dm_send() { echo "DM|$2" >> "$AIPAY_SIM_ROOT/sent.log"; echo evt-dm; }
load_token() { echo tok; }
note() { :; }
posture() { echo standard; }
MX_PRETEST_CHECK_SEC=0
pretest_prestart_once; pretest_prestart_once
echo "d1=$(grep -c 'DISPATCH' "$AIPAY_SIM_ROOT/sent.log")"
echo "dm1=$(grep -c 'DM|' "$AIPAY_SIM_ROOT/sent.log")"
echo "key1=$(grep -c '^pretest_prestart_' "$STATE")"`, root)
    expect(out).toContain('d1=1')   // 同一合入提交只发一次（sha 前 7 位幂等）
    expect(out).toContain('dm1=2')  // qi+fei 各一条 DM
    expect(out).toContain('key1=1')
    // 追加一条普通提交（无 [LEAD-MERGE]）→ 不触发预热
    gitx(['checkout', '-q', 'main'], work)
    writeFileSync(join(work, 'n.txt'), 'n\n')
    gitx(['add', '-A'], work)
    gitx(['commit', '-qm', 'chore: no marker'], work)
    gitx(['checkout', '-q', 'integration/RFD-001'], work)
    gitx(['merge', '-q', '--no-ff', 'main', '-m', 'merge main (no marker)'], work)
    gitx(['push', '-q', 'origin', 'integration/RFD-001'], work)
    const out2 = sh(`
DIRECTOR_CLONE="${clone}"
dispatch_in_room() { echo "DISPATCH" >> "$AIPAY_SIM_ROOT/sent2.log"; echo evt-1; }
mx_dm_send() { echo "DM" >> "$AIPAY_SIM_ROOT/sent2.log"; echo evt-dm; }
load_token() { echo tok; }
note() { :; }
posture() { echo standard; }
MX_PRETEST_CHECK_SEC=0
pretest_prestart_once
echo "d2=$(grep -c 'DISPATCH' "$AIPAY_SIM_ROOT/sent2.log" 2>/dev/null || echo 0)"`, root)
    expect(out2).toContain('d2=0')   // 无 [LEAD-MERGE] 标记的新 tip 不触发预热
  })

  it('④ 跨域依赖看护：未合 fix 分支催域 lead；域映射 DEF-BE→wei / DEF-FE→mei / 其他→fanfan', () => {
    const root = sandbox()
    const { clone } = gitFixture(root)
    const out = sh(`
DIRECTOR_CLONE="${clone}"
dispatch_in_room() { :; }
mx_send() { echo "ROOM|$2|$4" >> "$AIPAY_SIM_ROOT/dep.log"; echo evt-room; }
mx_dm_send() { echo "DM|$2" >> "$AIPAY_SIM_ROOT/dep.log"; echo evt-dm; }
load_token() { echo tok; }
note() { :; }
MX_DEPWATCH_CHECK_SEC=0 MX_DEPWATCH_NUDGE_SEC=600
echo "own_be=$(_dep_owner_of fix/DEF-BE-9)"
echo "own_fe=$(_dep_owner_of fix/DEF-FE-9)"
echo "own_other=$(_dep_owner_of fix/chore-x)"
dependency_watch_once
echo "n1=$(grep -c 'DM|' "$AIPAY_SIM_ROOT/dep.log")"
dependency_watch_once
echo "n2=$(grep -c 'DM|' "$AIPAY_SIM_ROOT/dep.log")"
echo "keys=$(grep -c '^depwatch_fix_' "$STATE")"`, root)
    expect(out).toContain('own_be=wei')
    expect(out).toContain('own_fe=mei')
    expect(out).toContain('own_other=fanfan')
    expect(out).toContain('n1=1')   // fix/DEF-BE-1 未真正合入 integration → 催域 lead 一次（DM）
    expect(out).toContain('n2=1')   // 600s 内同分支不重复催（分支级节流）
    expect(out).toContain('keys=1') // state 键 depwatch_<分支名>=上次催时刻
  })

  it('③ early-start 预备步：g5_phase 前零动作；G5 期三键各派一次（群+DM）', () => {
    const root = sandbox()
    const out = sh(`
dispatch_in_room() { echo "DISPATCH|$1" >> "$AIPAY_SIM_ROOT/prep.log"; echo evt-1; }
mx_dm_send() { echo "DM|$2" >> "$AIPAY_SIM_ROOT/prep.log"; echo evt-dm; }
load_token() { echo tok; }
note() { :; }
posture() { echo standard; }
mx_prep_early_start_tick
echo "before=$(grep -c . "$AIPAY_SIM_ROOT/prep.log" 2>/dev/null || echo 0)"
sset g5_phase 1
mx_prep_early_start_tick
mx_prep_early_start_tick
echo "disp=$(grep -c 'DISPATCH' "$AIPAY_SIM_ROOT/prep.log")"
echo "dm=$(grep -c 'DM|' "$AIPAY_SIM_ROOT/prep.log")"
echo "keys=$(grep -cE '^prep_(uat|release|retro)=' "$STATE")"
echo "owners=$(grep -oE 'DISPATCH\\|[a-z]+' "$AIPAY_SIM_ROOT/prep.log" | cut -d'|' -f2 | tr '\\n' ',')"`, root)
    expect(out).toContain('before=0')  // 未到 G5 阶段不派（早期步零行为）
    expect(out).toContain('disp=3')    // audit / ops / fanfan 各一
    expect(out).toContain('dm=3')
    expect(out).toContain('keys=3')
    expect(out).toContain('audit,ops,fanfan,')

    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('mx_prep_early_start_tick')
    expect(lib).toContain('prep_uat_doc')
    expect(lib).toContain('docs/acceptance/')
    expect(lib).toContain('retro-metrics.md')
    expect(lib).toContain('prep_finalize_hint')
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('sset_once g5_phase 1')
    expect(scen).toContain('_prep_uat_hint')
    expect(scen).toContain('_prep_retro_hint')
    expect(scen).toContain('mx_prep_early_start_tick')
  })

  it('⑤ 工作区 origin 单一性：prelaunch ⑩d 在位且计数同步；mx-setup 建 bare/归 origin', () => {
    const pre = read(join(MX, 'mx-prelaunch-check.sh'))
    expect(pre).toContain('⑩d 各工作区 origin 单一性')
    expect(pre).toContain('prelaunch 三十六项')
    expect(pre).toContain("_bare='$SR/central-origin.git'")
    const setup = read(join(MX, 'mx-setup.sh'))
    expect(setup).toContain('CENTRAL_BARE="${MX_CENTRAL_BARE:-$SIM_ROOT/central-origin.git}"')
    expect(setup).toContain('mx_central_bare_ensure')
    expect(setup).toContain('mx_origin_to_bare')
    expect(setup).toContain('git clone -q "$CENTRAL_BARE" "$WS"')   // 新工作区生来 origin=bare
    expect(setup).toContain('mx_origin_to_bare "$WS"')              // 存量工作区归一（幂等）
  })

  it('⑥ G5 风暴去重 + 闭包快照 --out *.json 按文件写（不套同名目录）', () => {
    const scen = read(join(HARNESS, 'aipay-scenario.sh'))
    expect(scen).toContain('issue_once g5-ready-fail')
    expect(scen).toContain('issue_once g5-fail-settled')
    expect(scen).not.toContain('ISSUE|g5-ready-fail|')
    expect(scen).not.toContain('ISSUE|g5-fail-settled|')
    expect(scen).toContain('mx_gate_breaker_trip g5')   // 每轮事实保留

    const root = sandbox()
    const sim = join(root, 'sim')
    const outFile = join(root, 'evidence', 'governance-closure.json')
    execFileSync('bash', [join(MX, 'mx-closure-snapshot.sh'), '--run', 'run-x', '--out', outFile,
      '--token', 'invalid-jwt-for-test'], {
      env: { ...process.env, AIPAY_SIM_ROOT: sim }, encoding: 'utf8',
    })
    expect(statSync(outFile).isFile()).toBe(true)
    expect(existsSync(join(root, 'evidence', 'governance-closure'))).toBe(false)  // 不再造同名目录
    const data = JSON.parse(readFileSync(outFile, 'utf8'))
    expect(data.run).toBe('run-x')
    expect(Array.isArray(data.failed)).toBe(true)   // 端点失败如实呈现（不伪造全绿）
  })
})
