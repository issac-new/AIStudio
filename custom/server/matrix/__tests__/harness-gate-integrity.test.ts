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
    const scen = execFileSync('bash', ['-c', `grep -c 'room_has_from.*\\"\\$G[25]_TS\\"\\|room_has_from.*\\"\\$UAT_TS\\"' "${join(REPO, 'scripts', 'aipay', 'aipay-scenario.sh')}" || true`], { encoding: 'utf8' })
    expect(Number(scen.trim())).toBeGreaterThanOrEqual(5)
  })

  it('inbox-dedup 去重键含 RUN 且禁静默', () => {
    const skill = execFileSync('bash', ['-c', `cat "${join(REPO, 'scripts', 'aipay', 'skills', 'inbox-dedup', 'SKILL.md')}"`], { encoding: 'utf8' })
    expect(skill).toContain('任务 ID + RUN_ID')
    expect(skill).toContain('禁止静默')
    expect(skill).toContain('RUN_ID 不同')
  })
})
