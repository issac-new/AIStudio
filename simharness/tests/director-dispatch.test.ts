/**
 * O7 派发权移交总监守门（spec 2026-11-06-director-dispatch）。
 * 源码级（分支结构/降级链/台账/开关缺省零行为）＋行为级（bash 干跑三路径）。
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const LIB = join(ROOT, 'mux', 'mx-scenario-lib.sh')
const SRC = readFileSync(LIB, 'utf8')

describe('源码级', () => {
  it('director 分支结构在位（开关/唯一 mention/wait/台账 mode 字段）', () => {
    expect(SRC).toContain('MX_DISPATCH_MODE:-}" = "director"')
    expect(SRC).toContain('agent_mxid wei')
    expect(SRC).toContain('mx_wait_sender "$_d_tok" "$rid" "$_d_lead" "$_d_marker" "${MX_DIRECTOR_TIMEOUT:-480}"')
    expect(SRC).toContain('"mode":"director"')
  })
  it('降级链 director→strict 不回 preset（D4）＋两降级点置旗标', () => {
    expect(SRC).toMatch(/\[ "\$\(posture\)" = "strict" \] \|\| \[\[ "\$_d_degraded" = "1" \]\]/)
    const hits = SRC.match(/_d_degraded=1/g) ?? []
    expect(hits.length).toBe(2)   // 超时 + SEND-FAILED 两降级点
  })
  it('缺省零行为：开关未设时不进 director 分支（缺省短路在 posture 判定之前成立）', () => {
    expect(SRC.indexOf('MX_DISPATCH_MODE:-} = "director"')).toBeLessThan(SRC.indexOf('posture)" = "strict"'))
  })
})

describe('行为级（bash 干跑三路径）', () => {
  let temp = ''
  beforeEach(() => {
    temp = mkdtempSync(join(tmpdir(), 'dir-dispatch-'))
    mkdirSync(join(temp, 'evidence'))
  })
  afterEach(() => rmSync(temp, { recursive: true, force: true }))

  /** 干跑：提取 dispatch_in_room 函数体（整库依赖链 mx-lib/ledger/hb 不进测试），
   * stub 其全部外部依赖后执行——行为级验证三路径。 */
  const run = (mode: string, waitResult: '' | 'TASK', sendOk = true) => {
    const fn = execFileSync('bash', ['-c', `sed -n '/^dispatch_in_room()/,/^}/p' "${LIB}"`], { encoding: 'utf8' })
    expect(fn).toContain('MX_DISPATCH_MODE')   // 提取完整（含 director 头）自检
    const stub = `
      SIM_ROOT="${temp}"; EVID_DIR="${temp}/evidence"; RUN_ID="t-run"; RFD_ID="RFD-1"
      SERVER_NAME="sim"; USERS=(fanfan wei)
      note() { echo "[note] $*"; }
      compensate() { echo "COMPENSATE|$1|$2"; }
      posture() { echo "preset"; }                       # preset 姿态打底：证明 director 不依赖 posture
      sget() { echo "!room:analysis"; }
      load_token() { echo "tok-$1"; }
      agent_mxid() { echo "@$1-agent:sim"; }
      human_mxid() { echo "@$1:sim"; }
      mx_send() { ${sendOk ? 'echo "$EV_MARKER"; EV_MARKER=""' : 'return 1'}; }
      EV_MARKER="EVID_MARKER_EVENT_ID"
      mx_wait_sender() { ${waitResult ? `echo "${waitResult}"; return 0` : 'return 1'}; }
      mx_room_members() { echo ""; }
      mx() { echo "{}"; }
      mx_join() { return 0; }
      _verify_dispatch_delivery() { echo "$2"; }
      mx_messages() { echo "[]"; }
    `
    const script = `${stub}
set +e
${fn}
dispatch_in_room fanfan "完成支付模块回归测试" "@qi-agent:sim"
echo "RC=$?"
`
    const env = { ...process.env, MX_DISPATCH_MODE: mode }
    const out = execFileSync('bash', ['-c', script], { env, encoding: 'utf8', timeout: 30_000 })
    return out
  }

  it('director 成功：总监产出任务书 → self-dispatch.jsonl 落 director 行、无 compensate', () => {
    const out = run('director', '任务书 @chen-agent:sim 执行回归')
    expect(out).toContain('[PR-7] 总监派发 ✓')
    expect(out).not.toContain('COMPENSATE|director-dispatch-timeout')
    const ledger = readFileSync(join(temp, 'evidence', 'self-dispatch.jsonl'), 'utf8')
    expect(ledger).toContain('"from":"wei-agent"')
    expect(ledger).toContain('"mode":"director"')
  })

  it('director 超时：降级 strict（preset 姿态下仍走 strict 分支=不回 preset）＋compensate 在案', () => {
    const out = run('director', '')
    expect(out).toContain('COMPENSATE|director-dispatch-timeout')
    expect(out).toContain('降级 strict 自主组织消息')
    // strict 分支特征：自主组织消息正文（降级后仍发出）
    expect(out).toContain('【自主组织】')
  })

  it('移交 SEND-FAILED：降级 strict 不卡死（RC 可继续）', () => {
    const out = run('director', 'TASK', false)
    expect(out).toContain('COMPENSATE|director-dispatch-timeout')
    expect(out).toContain('【自主组织】')
  })

  it('缺省（未设 mode）：零新行为（无 PR-7 note、无 director 台账）', () => {
    const out = run('', 'TASK')
    expect(out).not.toContain('[PR-7]')
    expect(existsSync(join(temp, 'evidence', 'self-dispatch.jsonl'))).toBe(false)
    // preset 姿态走代偿分支
    expect(out).toContain('COMPENSATE|dispatch-preset')
  })
})
