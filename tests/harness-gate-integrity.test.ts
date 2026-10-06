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
import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it, afterAll } from 'vitest'

// 隔离轮迁址（2026-10-03）：测试随 harness 仓走，MX=本仓 mux/；vitest 借道 overlay 的 node_modules（run-gates.sh --root）
const HARNESS = join(__dirname, '..')
const MX = join(HARNESS, 'mux')
const PRODUCT = process.env.MX_OVERLAY_ROOT || join(HARNESS, '..', 'overlay')  // 产品仓只读消费位（patches/探针；worktree 内相对位失效，用 MX_OVERLAY_ROOT 指向主树 overlay）

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

describe('② 硬闸打回熔断（跨调用持久 + 人工放行留痕）', () => {
  it('两轮未过后新调用拒绝执行；GATE_BREAKER_OVERRIDE=1 放行并记 ISSUE', () => {
    const root = sandbox()
    const out = sh(`
mx_gate_breaker_trip g5 "G5 发布准出" 1
mx_gate_breaker_trip g5 "G5 发布准出" 1
_mx_rc=0; ( mx_gate_breaker_check g5 "G5 发布准出" ) >/dev/null 2>&1 || _mx_rc=$?
echo "blocked=$_mx_rc"
_mx_rc=0; GATE_BREAKER_OVERRIDE=1 mx_gate_breaker_check g5 "G5 发布准出" >/dev/null 2>&1 || _mx_rc=$?
echo "override=$_mx_rc"
grep -c 'gate-breaker-tripped' "$EVID_DIR/issues.log"
grep -c 'gate-breaker-override' "$EVID_DIR/issues.log"`, root)
    expect(out).toContain('blocked=1')
    expect(out).toContain('override=0')
    expect(out).toMatch(/blocked=1[\s\S]*override=0[\s\S]*\n1\n1\s*$/)
  })

  it('未达阈值不拦截（首轮打回仍可走第二轮）', () => {
    const root = sandbox()
    const out = sh(`
mx_gate_breaker_trip g2 "G2 架构治理评审" 1
_mx_rc=0; mx_gate_breaker_check g2 "G2 架构治理评审" >/dev/null 2>&1 || _mx_rc=$?
echo "rc=$_mx_rc"`, root)
    expect(out).toContain('rc=0')
  })

  it('熔断计数按 RUN 的 state.env 持久（跨调用语义：换 bash 进程仍在）', () => {
    const root = sandbox()
    const out = sh(`mx_gate_breaker_trip g5 "G5 发布准出" 2`, root)
    expect(out).toContain('累计 2 轮未过')
    const out2 = sh(`
_mx_rc=0; ( mx_gate_breaker_check g5 "G5 发布准出" ) >/dev/null 2>&1 || _mx_rc=$?
echo "rc=$_mx_rc"`, root)
    expect(out2.trim()).toBe('rc=1')
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
    expect(out).toContain('STATE=/Volumes/nvme2230/lab/ncwk-sim-mux/state.env')
  })

  it('无 RUN_ID 缺省回落 SIM 全局（V3 兼容）但可被 --run 纠正', () => {
    const out = printPaths('')
    expect(out).toContain('OUT=/Volumes/nvme2230/lab/ncwk-sim-mux/evidence/simulation-report.html')
  })
})

describe('⑦ 闸门判词语义（H8/R-A2：转述 stub 不得当结论行）', () => {
  it('协议转述行（判词成对出现）整行不作判词——既不假过也不自毒（f1979781）', () => {
    const root = sandbox()
    const out = sh(`mx_text_gate_verdict READY-GATE 'False alarm — the stub itself says "结论行 READY-GATE-PASS 或 READY-GATE-FAIL", tripping my check.'`, root)
    // 成对判词=协议转述（如卡面引用本判词契约原文）：按判词处理必自毒（f1979781 G2 根治）。
    // 代价面：真结论行若回引前次判词（"前次 FAIL 已解决，结论 PASS"）也会被整行丢弃，
    // 表现为门禁未结、等待复审重发单判词结论行——保守方向，不产生假过。
    expect(out.trim()).toBe('')
  })

  it('真实结论行（判词居中/居末）正确取判词', () => {
    const root = sandbox()
    const out = sh(`
echo "$(mx_text_gate_verdict ARCH-GATE '技能已修补。评审卡 t_11e182b3 落卡复核通过，结论 **ARCH-GATE-PASS**，缺项清单已指名到人。')"
echo "$(mx_text_gate_verdict READY-GATE 'conclusion: READY-GATE-FAIL')"
echo "[$(mx_text_gate_verdict READY-GATE '无判词消息')]"`, root)
    const lines = out.trim().split('\n')
    expect(lines[0]).toBe('PASS')
    expect(lines[1]).toBe('FAIL')
    expect(lines[2]).toBe('[]')
  })

  it('房间判词取时间最新一条（打回后复审 PASS 盖过前次 FAIL）', () => {
    const root = sandbox()
    const out = sh(`
mx_messages() {
  cat <<'JSON'
[
 {"sender":"@a:matrix.test","origin_server_ts":100,"content":{"body":"结论 READY-GATE-FAIL（缺项）"}},
 {"sender":"@a:matrix.test","origin_server_ts":200,"content":{"body":"复审完成，结论 READY-GATE-PASS"}}
]
JSON
}
load_token() { echo tok; }
mx_room_gate_verdict room "@a:matrix.test" READY-GATE 0`, root)
    expect(out.trim()).toBe('PASS')
  })

  it('卡面 FAIL 优先于房间 PASS（双源合并保守不放行）', () => {
    const root = sandbox()
    const out = sh(`
mx_messages() {
  cat <<'JSON'
[{"sender":"@a:matrix.test","origin_server_ts":100,"content":{"body":"结论 READY-GATE-PASS"}}]
JSON
}
load_token() { echo tok; }
kanban_list() { echo '{"tasks":[{"title":"RFD-001 发布准出评审（G5）","body":"七项检查单见派单。结论行 READY-GATE-PASS 或 READY-GATE-FAIL。\\n\\nconclusion: READY-GATE-FAIL"}]}'; }
mx_gate_verdict_combined room "@a:matrix.test" READY-GATE 0 fanfan "发布准出评审"`, root)
    expect(out.trim()).toBe('FAIL')
  })

  it('run2 实锤消息原文不构成 PASS 结论', () => {
    const root = sandbox()
    const out = sh(`
mx_messages() {
  cat <<'JSON'
[{"sender":"@fanfan-agent:matrix.test","origin_server_ts":100,"content":{"body":"False alarm — the stub itself says \\"结论行 READY-GATE-PASS 或 READY-GATE-FAIL\\", tripping my check. Refining the collision test."}}]
JSON
}
load_token() { echo tok; }
_v=$(mx_room_gate_verdict room "@fanfan-agent:matrix.test" READY-GATE 0)
echo "verdict=$_v"
_mx=0; mx_gate_verdict_pass room "@fanfan-agent:matrix.test" READY-GATE 0 || _mx=$?
echo "pass_rc=$_mx"`, root)
    expect(out).toContain('verdict=FAIL')
    expect(out).toContain('pass_rc=1')
  })
})

describe('⑧ UAT 逐条判词（H9：有条件通过不得写成全部通过）', () => {
  it('判词按证据行取：通过/有条件通过/不通过/未见', () => {
    const root = sandbox()
    const out = sh(`
BODY='逐条证据已按冻结清单核出。结论先行：**AC-1/AC-2/AC-3/AC-5/AC-6 通过；AC-4、AC-7 有条件通过**（历史缺陷修复未合入 integration 基线，放行权归 bella）。'
for ac in AC-1 AC-4 AC-7 AC-9; do echo "$ac=$(uat_ac_verdict "$BODY" "$ac")"; done
echo "AC-2x=$(uat_ac_verdict 'AC-2 未通过：断言不成立' AC-2)"`, root)
    const lines = out.trim().split('\n')
    expect(lines[0]).toBe('AC-1=通过')
    expect(lines[1]).toBe('AC-4=有条件通过')
    expect(lines[2]).toBe('AC-7=有条件通过')
    expect(lines[3]).toBe('AC-9=未见')
    expect(lines[4]).toBe('AC-2x=不通过')
  })

  it('判词耐受括号注（run6 实锤：AC 编号与判词隔全角注不得判"未见"）', () => {
    const root = sandbox()
    const out = sh(`
BODY='UAT-EVIDENCE RUN=20261001-v5-run6（G1 冻结清单逐条证据；派单 AC 编号=冻结 RFD-001.freeze.md AC-1/4/5/6/7，冻结条款与首冻逐字一致）
UAT-EVIDENCE AC-1（统一下单幂等=冻结AC-1 L5）通过 — 分支 origin/integration/RFD-001 @ 8dbf5bf（被测 8ec13c3）：①用例 L38
UAT-EVIDENCE AC-2（双渠道调起参数=冻结AC-4 L8 渠道适配）通过 — 同基线：①微信 5 文件
UAT-EVIDENCE AC-3（回调验签拒绝+重复回调幂等=冻结AC-5 L9）通过 — 同基线
UAT-EVIDENCE AC-4（超时关单=冻结AC-6 L10）通过 — 同基线
UAT-EVIDENCE AC-5（收银台双端结果三态=冻结AC-7 L11 前半）通过 — 同基线
UAT-EVIDENCE AC-6（失败重试不重复下单=冻结AC-7 L11 后半）通过 — 同基线
UAT-EVIDENCE AC-7（测试报告全绿）通过 — ①报告 194/194
依据链：G1 冻结 origin/main 3191c11；派单 AC 编号映射——派单AC-1=冻结AC-1、派单AC-2/AC-3=冻结AC-4 双渠道四方法、派单AC-7=报告全绿总检。
[导演代投注记 RUN=20261001-v5-run6] 本结论行原文由 @fanfan-agent 于 DM 线程发出。'
for ac in AC-1 AC-2 AC-3 AC-4 AC-5 AC-6 AC-7; do echo "$ac=$(uat_ac_verdict "$BODY" "$ac")"; done`, root)
    const lines = out.trim().split('\n')
    expect(lines).toHaveLength(7)
    for (const l of lines) expect(l).toMatch(/^AC-[1-7]=通过$/)
  })

  it('判词含映射归属（run6 实锤：括注冻结AC-M 映射时判词同时归属映射目标）', () => {
    const root = sandbox()
    const out = sh(`
BODY='UAT-EVIDENCE AC-2（双渠道调起参数=冻结AC-4 L8 渠道适配）不通过 — 断言不成立'
for ac in AC-2 AC-4 AC-5; do echo "$ac=$(uat_ac_verdict "$BODY" "$ac")"; done`, root)
    const lines = out.trim().split('\n')
    expect(lines[0]).toBe('AC-2=不通过')
    expect(lines[1]).toBe('AC-4=不通过')
    expect(lines[2]).toBe('AC-5=未见')
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
    for (const k of ['anexec_d1', 'anexec_d2', 'devimpl_d1', 'devimpl_d2', 'devimpl_d3',
                     'defect_dispatched', 'audit_dispatched', 'preflight_ok', 'g5_rgid']) {
      expect(scen).toContain(k)
    }
  })

  it('E：G5 活性等待+判词复用+过闸收口单一路径', () => {
    const scen = read(SCEN)
    expect(scen).toContain('g5_pass_finalize()')
    expect(scen).toContain('wait_alive_truth "房间出现 READY-GATE 结论行（判词语义）" 1800 fanfan')
    expect(scen).toContain('G5 判词复用（本轮既有 PASS 结论行，不重派评审）')
    expect(scen).toContain('G5_TS=$(( $(sget run_started_at) * 1000 ))')
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

describe('⑫ 必采矩阵单一事实源（正本 §5.5+§5.7 F-4：hero 统计=矩阵实算，分母 12，禁任一位在位即计）', () => {
  const read = (f: string) => execFileSync('bash', ['-c', `cat "${f}"`], { encoding: 'utf-8' })

  function py(code: string): string {
    return execFileSync('python3', ['-c', `
import sys; sys.path.insert(0, ${JSON.stringify(MX)})
from r18_matrix import DIALOG_STEPS, OP_STEPS, EFFECT_STEPS, SKILL_STEPS, DELIVERY_STEPS, SKILL_GEN_MIN, SKILL_INVOKE_MIN, DELIVERY_MIN, TOTAL, evaluate, step_ok
${code}`], { encoding: 'utf-8' })
  }

  it('矩阵常量=对话 9/11/17/19/21 + 操作 8/10/25 + 效果 7/20/24 + skill 13（生成≥3/调用≥2）+ delivery 门禁灯 23（≥1），分母=13', () => {
    const out = py('print(sorted(DIALOG_STEPS), sorted(OP_STEPS), sorted(EFFECT_STEPS), sorted(SKILL_STEPS), sorted(DELIVERY_STEPS), SKILL_GEN_MIN, SKILL_INVOKE_MIN, DELIVERY_MIN, TOTAL)')
    expect(out).toContain('[9, 11, 17, 19, 21] [8, 10, 25] [7, 20, 24] [13] [23] 3 2 1 13')
  })

  it('空载荷=0/12；达标载荷=12/12（操作每组≥2 实帧、效果带可反查锚、skill 帧达标）', () => {
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
    expect(out).toContain('13/13')
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
    expect(out).toContain('8:False')
    expect(out).toContain('10:False')
    expect(out).toContain('7:False')
    expect(out).toContain('11:True')
    expect(out).toContain('13:False')
    expect(out).toContain('23:False')
  })

  it('绊线：生成器 hero 统计与审计器查 8 共用 r18_matrix，禁回退硬编码/任一位在位即计', () => {
    const gen = read(join(MX, 'mx-report-gen.py'))
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(gen).toContain('import r18_matrix')
    expect(gen).toContain('r18_matrix.evaluate')
    expect(gen).toContain('必采 {r18_matrix.TOTAL} 项实算')
    expect(gen).not.toContain('必采 11 项实算')
    expect(gen).not.toContain('{hit}/26')
    expect(audit).toContain('from r18_matrix import')
    expect(audit).toContain('step_ok')
    expect(audit).not.toContain('{9, 11, 17, 19, 21}')
  })

  it('绊线：采集器 skill 子命令登记 gen/invoke 帧（§5.7 F-4 采集链闭环）', () => {
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

  it('gov_report 五项度量齐（首过率/证据一次通过率/缺陷密度/打回次数/人工介入）+首过率六闸全计', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    for (const k of ['首过率', '证据一次通过率', '缺陷密度', '打回次数', '人工介入']) {
      expect(lib).toContain(k)
    }
    expect(lib).toContain('六闸全计')
    expect(lib).not.toContain('${_fp}/4')
  })

  it('gov_report 基线对比行（§2.6.5 上次基线+1：读上轮治理报告首过率）', () => {
    const lib = read(join(MX, 'mx-scenario-lib.sh'))
    expect(lib).toContain('基线对比')
    expect(lib).toContain('governance-report.md')
  })

  it('审计器查 9 承载面符合性（§2.5 步集解析 × product-surface-degraded 降级口径）', () => {
    const audit = read(join(MX, 'mx-report-audit.py'))
    expect(audit).toContain('承载面符合性')
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
    for target in re.findall(r'^diff --git a/(\\S+) b/(\\S+)$', text, re.M):
        path = target[1]
        rt = ovl / 'runtime' / path
        if not rt.exists():
            continue  # 无 runtime 副本=不经部署通道，不受回退面影响
        rt_text = rt.read_text()
        added = [l[1:].strip() for l in text.splitlines()
                 if l.startswith('+') and not l.startswith('+++') and len(l[1:].strip()) >= 20]
        if added and not any(a in rt_text for a in added):
            bad.append(f'{name} → runtime/{path}: 副本不含任何补丁新增行（部署将回退该补丁）')
print('\\n'.join(bad) if bad else 'ALL_SYNCED patches=%d' % len(patches))`], { encoding: 'utf-8' })
    expect(out).not.toContain('副本不含任何补丁新增行')
    expect(out).not.toContain('PARSE_FAIL')
    expect(out).not.toContain('patch 文件缺失')
    expect(out).toMatch(/ALL_SYNCED patches=\d+/)
  })

  it('回归锚：564 兜底代码在 runtime 副本在位（2026-10-05 回退事故的定点绊线）', () => {
    const rt = read(join(PRODUCT, 'runtime/gateway/platforms/base.py'))
    expect(rt).toContain('response_delivery_fallback')
  })
})
