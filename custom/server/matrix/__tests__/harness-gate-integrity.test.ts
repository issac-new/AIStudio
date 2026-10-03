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

const REPO = join(__dirname, '..', '..', '..', '..')
const MX = join(REPO, 'scripts', 'aipay', 'mux')

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
    const scen = execFileSync('bash', ['-c', `grep -c 'date +%F %T' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(scen.trim()).toBe('0')
  })

  it('G2/G5/UAT 门禁调用携带时窗参数', () => {
    // H8 后 G2/G5 走判词函数（*TS 仍作显式实参传入），UAT 走 room_has_from——
    // 时窗参数在场是防"历史结论行秒过"的根保证，绊线盯 *_TS 实参出现次数。
    const scen = execFileSync('bash', ['-c', `grep -cE '"\\$(G2_TS|G2_RETRY_TS|G5_TS|G5_RETRY_TS|UAT_TS)"' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(5)
  })

  it('inbox-dedup 去重键含 RUN 且禁静默', () => {
    const skill = execFileSync('bash', ['-c', `cat "${join(REPO, 'scripts', 'aipay', 'skills', 'inbox-dedup', 'SKILL.md')}"`], { encoding: 'utf8' })
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
    const scen = execFileSync('bash', ['-c', `grep -c 'mx-report-gen.py.*--run' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
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
    const scen = execFileSync('bash', ['-c', `grep -c 'force-with-lease' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(scen.trim()).toBe('0')
  })

  it('集成块带丢线守卫（旧基线头必须为 HEAD 祖先）', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'merge-base --is-ancestor' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(1)
  })

  it('G3 硬闸落键 g3_code_pass 在场', () => {
    const scen = execFileSync('bash', ['-c', `grep -c 'g3_code_pass' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" "${join(REPO, 'scripts', 'aipay', 'mux', 'mx-scenario-lib.sh')}" | awk -F: '{s+=\$2} END {print s}'`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(2)
  })

  it('patch 505：卡抽屉 body/评论走 KanbanMarkdown（禁回退裸插值）', () => {
    const patch = execFileSync('bash', ['-c', `cat "${join(REPO, 'patches', '505-kanban-drawer-markdown.patch')}"`], { encoding: 'utf8' })
    expect(patch).toContain("import KanbanMarkdown from '@/custom/kanban/components/KanbanMarkdown.vue'")
    expect(patch).toContain('<KanbanMarkdown :source="detail.task.body" />')
    expect(patch).toContain('<KanbanMarkdown :source="comment.body" />')
    expect(patch).not.toMatch(/^\+.*\{\{ detail\.task\.body \}\}/m)
  })

  it('G2/G5 走判词合并、UAT 走逐条判词', () => {
    const scen = execFileSync('bash', ['-c', `cat "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}"`], { encoding: 'utf8' })
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
  "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}",
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
      join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh'),
      join(MX, 'mx-lib.sh'), join(MX, 'mx-scenario-lib.sh'),
    ]) {
      execFileSync('bash', ['-n', f])
    }
  })
})
