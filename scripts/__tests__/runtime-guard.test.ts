// SIM 运行时单一所有权核心守门（P2 Task 1，负例先行）。
//
// 被测对象：scripts/platform/runtime/guard.mjs（owner/driver-lock/resident/clean-lease
// 四因子判活核心）+ guard-cli.mjs（子命令入口）。全部用临时 SIM_ROOT + 假 pid/cmdMatcher
// 注入（MX_GUARD_PROBE 探针脚本），不碰宿主 SIM_ROOT、不杀任何真实进程。
//
// 四因子=pid+cmdMatcher+instance+规范化 simRoot：
//   - pid 死 → 不活；
//   - pid 活但 cmdline 与持锁时登记的 cmdMatcher 不符（PID 被无关进程复用）→ 不活；
//   - instance 是 release 的第二道闸（pid 相同 instance 不同不得删锁）；
//   - 规范化 simRoot 不符（锁目录被搬到另一根下）→ 不活。
import { execFileSync, spawn, spawnSync } from 'child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { afterAll, describe, expect, it } from 'vitest'

const REPO = resolve(__dirname, '../../')
const CLI = join(REPO, 'scripts/platform/runtime/guard-cli.mjs')
const TMP = mkdtempSync(join(tmpdir(), 'runtime-guard-'))
afterAll(() => rmSync(TMP, { recursive: true, force: true }))

// ── 假探针：MX_PROBE_ALIVE 白名单判活；命令行按 pid 取 MX_PROBE_CMD_<pid> ──
// （按 pid 取命令行是夹具正确性前提：持有人 matcher 核验若拿到「别的 pid 的命令行」
//  会被夹具自身污染成假接管）
const PROBE = join(TMP, 'probe.sh')
writeFileSync(PROBE, [
  '#!/bin/bash',
  'case " ${MX_PROBE_ALIVE:-} " in',
  '  *" $1 "*) v="MX_PROBE_CMD_$1"; echo "${!v:-bash aipay-scenario.sh}"; exit 0 ;;',
  '  *) exit 1 ;;',
  'esac',
  '',
].join('\n'))
chmodSync(PROBE, 0o755)

/** 各 kind 的「真身」命令行（与 cmdMatcher 一致） */
const CMD = {
  product: 'node /studio/server/serve.js',
  bashSup: 'bash /simharness/mux/run-driver-supervisor.sh --run r1',
  relay: 'bash /simharness/mux/mx-relay.sh',
  driver: 'bash /simharness/aipay-scenario.sh',
  clean: 'bash /simharness/mux/mx-clean.sh --apply',
}

/** 探针 env：白名单 pid + 按 pid 命令行 */
function probeEnv(alive: number[], cmdByPid: Record<number, string> = {}): Record<string, string> {
  const env: Record<string, string> = { MX_PROBE_ALIVE: alive.join(' ') }
  for (const [pid, cmd] of Object.entries(cmdByPid)) env[`MX_PROBE_CMD_${pid}`] = cmd
  return env
}

/** CLI 调用：返回 {rc, json}（rc=退出码；json 解析 stdout，坏输出=null） */
function cli(args: string[], env: Record<string, string> = {}): { rc: number; json: any | null; out: string } {
  const r = spawnSync(process.execPath, [CLI, ...args], {
    encoding: 'utf8',
    env: { ...process.env, MX_GUARD_PROBE: PROBE, ...env },
  })
  let json: any = null
  try { json = r.stdout.trim() ? JSON.parse(r.stdout) : null } catch { json = null }
  return { rc: r.status ?? -1, json, out: r.stdout + r.stderr }
}

function freshRoot(name: string): string {
  const root = join(TMP, name)
  mkdirSync(join(root, 'var'), { recursive: true })
  return root
}

const eventsOf = (root: string): any[] =>
  existsSync(join(root, 'logs/guard-events.jsonl'))
    ? readFileSync(join(root, 'logs/guard-events.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : []

const asProduct = (root: string, pid: number, runId = 'r1'): string[] =>
  ['owner-acquire', '--sim-root', root, '--kind', 'product-supervisor', '--run-id', runId, '--pid', String(pid), '--cmd-matcher', 'node']
const asBashSup = (root: string, pid: number, runId = 'r1'): string[] =>
  ['owner-acquire', '--sim-root', root, '--kind', 'bash-supervisor', '--run-id', runId, '--pid', String(pid), '--cmd-matcher', 'run-driver-supervisor']
const asRelay = (root: string, pid: number, runId = 'r1'): string[] =>
  ['owner-acquire', '--sim-root', root, '--kind', 'relay', '--run-id', runId, '--pid', String(pid), '--cmd-matcher', 'mx-relay']
const asDriver = (root: string, pid: number, runId = 'r1'): string[] =>
  ['driver-acquire', '--sim-root', root, '--run-id', runId, '--pid', String(pid), '--cmd-matcher', 'aipay-scenario']

// ── owner 协议 ─────────────────────────────────────────────
describe('owner 四因子判活与接管', () => {
  it('双活 owner 拒绝：先到者持有，后到者 ok:false 且带 holder', () => {
    const root = freshRoot('dual-owner')
    const a = cli(asProduct(root, 101), probeEnv([101], { 101: CMD.product }))
    expect(a.rc).toBe(0)
    expect(a.json.ok).toBe(true)
    const b = cli(asBashSup(root, 102), probeEnv([101, 102], { 101: CMD.product, 102: CMD.bashSup }))
    expect(b.rc).toBe(1)
    expect(b.json.ok).toBe(false)
    expect(b.json.holder).toMatchObject({ kind: 'product-supervisor', pid: 101 })
  })

  it('陈 owner 原子 mv 接管：持有人死 → 后来者接管成功且陈锁归档留痕', () => {
    const root = freshRoot('stale-owner')
    cli(asBashSup(root, 201), probeEnv([201], { 201: CMD.bashSup }))
    const b = cli(asProduct(root, 202), probeEnv([]))
    expect(b.rc).toBe(0)
    expect(b.json.ok).toBe(true)
    const guardDir = join(root, 'var/guard')
    expect(readdirSync(guardDir).filter((f) => f.startsWith('owner.stale.'))).toHaveLength(1)
    expect(existsSync(join(guardDir, 'owner.json'))).toBe(true)
    expect(eventsOf(root).some((e) => e.kind === 'owner-takeover-stale')).toBe(true)
  })

  it('PID 复用不算活：pid 在但 cmdline 与 cmdMatcher 不符 → 允许接管（负例核心）', () => {
    const root = freshRoot('pid-reuse')
    cli(asProduct(root, 301), probeEnv([301], { 301: CMD.product }))
    const b = cli(asBashSup(root, 302), probeEnv([301], { 301: 'python3 /unrelated/thing.py' }))
    expect(b.rc).toBe(0)
    expect(b.json.ok).toBe(true)
    expect(eventsOf(root).some((e) => e.kind === 'owner-takeover-stale' && /pid-reused|cmd/.test(String(e.detail ?? '')))).toBe(true)
  })

  it('release 匹配 pid+instance：错 instance 拒绝（PID 复用误删防护）', () => {
    const root = freshRoot('release-guard')
    const a = cli(asProduct(root, 401), probeEnv([401], { 401: CMD.product }))
    const instance = a.json.instance as string
    const wrong = cli(['owner-release', '--sim-root', root, '--pid', '401', '--instance', 'not-the-instance'])
    expect(wrong.json.ok).toBe(false)
    expect(existsSync(join(root, 'var/guard/owner.json'))).toBe(true)
    const right = cli(['owner-release', '--sim-root', root, '--pid', '401', '--instance', instance])
    expect(right.json.ok).toBe(true)
    expect(existsSync(join(root, 'var/guard/owner.json'))).toBe(false)
  })

  it('release 防 PID 复用误删：原主死亡后同号 pid 被新主接管，原主迟到 release 不得删新主锁', () => {
    const root = freshRoot('late-release')
    const a = cli(asBashSup(root, 501), probeEnv([501], { 501: CMD.bashSup }))
    const oldInstance = a.json.instance as string
    const b = cli(asProduct(root, 501), probeEnv([501], { 501: CMD.product }))
    expect(b.json.ok).toBe(true)
    const late = cli(['owner-release', '--sim-root', root, '--pid', '501', '--instance', oldInstance])
    expect(late.json.ok).toBe(false)
    expect(existsSync(join(root, 'var/guard/owner.json'))).toBe(true)
  })

  it('规范化 simRoot：经 symlink 路径 acquire 与真身路径看到同一持有人', () => {
    const root = freshRoot('norm-root')
    const link = join(TMP, 'norm-root-link')
    try { symlinkSync(root, link) } catch { /* 已存在 */ }
    cli(asProduct(link, 601), probeEnv([601], { 601: CMD.product }))
    const owner = JSON.parse(readFileSync(join(root, 'var/guard/owner.json'), 'utf8'))
    expect(owner.simRoot).toBe(realpathSync(root)) // 记录的是规范化真身（/var→/private/var 符号链归一）
    const b = cli(asBashSup(root, 602), probeEnv([601], { 601: CMD.product }))
    expect(b.json.ok).toBe(false)
    expect(b.json.holder.pid).toBe(601)
  })
})

// ── driver 锁（兼容 .driver.lock.d/info 读法）──────────────
describe('driver 锁同构 + info 兼容格式', () => {
  it('driver-acquire 互斥；info 首行 pid=<n> 可被旧读法解析', () => {
    const root = freshRoot('driver-lock')
    const a = cli(asDriver(root, 701), probeEnv([701], { 701: CMD.driver }))
    expect(a.rc).toBe(0)
    const info = readFileSync(join(root, '.driver.lock.d/info'), 'utf8')
    expect(/^pid=701\b/m.test(info)).toBe(true)
    // 旧读法（mx_lock_holder_pid / run-watch 同源正则）
    expect(/^pid=(\d+)/m.exec(info)?.[1]).toBe('701')
    const b = cli(asDriver(root, 702), probeEnv([701], { 701: CMD.driver }))
    expect(b.rc).toBe(1)
    // 持锁者死 → 接管（陈锁 mv 归档）
    const c = cli(asDriver(root, 702), probeEnv([]))
    expect(c.rc).toBe(0)
    expect(readdirSync(root).some((f) => f.startsWith('.driver.lock.d.stale.'))).toBe(true)
  })

  it('driver-release 匹配 pid+instance；错 instance 拒绝', () => {
    const root = freshRoot('driver-release')
    const a = cli(asDriver(root, 801), probeEnv([]))
    const inst = a.json.instance
    const wrong = cli(['driver-release', '--sim-root', root, '--pid', '801', '--instance', 'bogus'])
    expect(wrong.json.ok).toBe(false)
    expect(existsSync(join(root, '.driver.lock.d'))).toBe(true)
    const right = cli(['driver-release', '--sim-root', root, '--pid', '801', '--instance', inst])
    expect(right.json.ok).toBe(true)
    expect(existsSync(join(root, '.driver.lock.d'))).toBe(false)
  })
})

// ── 清场租约与常驻角色 ─────────────────────────────────────
describe('clean-lease 与 resident', () => {
  it('clean-begin 后 resident 注册失败；活角色让 clean-assert 在首个 mutation 前拒绝', () => {
    const root = freshRoot('clean-lease')
    const lease = cli(['clean-begin', '--sim-root', root, '--pid', '901', '--cmd-matcher', 'mx-clean'],
      probeEnv([901], { 901: CMD.clean }))
    expect(lease.json.ok).toBe(true)
    const reg = cli(['resident-register', '--sim-root', root, '--role', 'relay', '--run-id', 'r1', '--pid', '902', '--cmd-matcher', 'mx-relay'],
      probeEnv([901, 902], { 901: CMD.clean, 902: CMD.relay }))
    expect(reg.rc).toBe(1)
    expect(reg.json.ok).toBe(false)
    const end = cli(['clean-end', '--sim-root', root, '--pid', '901', '--instance', lease.json.instance])
    expect(end.json.ok).toBe(true)
    const reg2 = cli(['resident-register', '--sim-root', root, '--role', 'relay', '--run-id', 'r1', '--pid', '902', '--cmd-matcher', 'mx-relay'],
      probeEnv([902], { 902: CMD.relay }))
    expect(reg2.json.ok).toBe(true)
    const blocked = cli(['clean-assert', '--sim-root', root], probeEnv([902], { 902: CMD.relay }))
    expect(blocked.rc).toBe(1)
    expect(blocked.json.ok).toBe(false)
    expect(blocked.json.residents.some((x: any) => x.kind === 'resident' && x.role === 'relay' && x.pid === 902)).toBe(true)
    const pass = cli(['clean-assert', '--sim-root', root], probeEnv([]))
    expect(pass.json.ok).toBe(true)
    const un = cli(['resident-unregister', '--sim-root', root, '--role', 'relay', '--run-id', 'r1', '--pid', '902', '--instance', reg2.json.instance],
      probeEnv([902], { 902: CMD.relay }))
    expect(un.json.ok).toBe(true)
    expect(cli(['clean-assert', '--sim-root', root], probeEnv([902], { 902: CMD.relay })).json.ok).toBe(true)
  })

  it('clean-assert 同时看 owner 与 driver：任一活即拒绝', () => {
    const root = freshRoot('clean-assert-owner')
    const oa = cli(asBashSup(root, 1001), probeEnv([1001], { 1001: CMD.bashSup }))
    const o = cli(['clean-assert', '--sim-root', root], probeEnv([1001], { 1001: CMD.bashSup }))
    expect(o.json.ok).toBe(false)
    expect(o.json.residents.some((x: any) => x.kind === 'owner')).toBe(true)
    cli(['owner-release', '--sim-root', root, '--pid', '1001', '--instance', oa.json.instance])
    cli(asDriver(root, 1002), probeEnv([1002], { 1002: CMD.driver }))
    const d = cli(['clean-assert', '--sim-root', root], probeEnv([1002], { 1002: CMD.driver }))
    expect(d.json.ok).toBe(false)
    expect(d.json.residents.some((x: any) => x.kind === 'driver')).toBe(true)
  })

  it('清场租约期间禁止新 owner/driver：clean-begin 后 owner-acquire 拒绝', () => {
    const root = freshRoot('clean-barrier')
    cli(['clean-begin', '--sim-root', root, '--pid', '1101', '--cmd-matcher', 'mx-clean'],
      probeEnv([1101], { 1101: CMD.clean }))
    const o = cli(asBashSup(root, 1102), probeEnv([1101], { 1101: CMD.clean }))
    expect(o.json.ok).toBe(false)
    const d = cli(asDriver(root, 1102), probeEnv([1101], { 1101: CMD.clean }))
    expect(d.json.ok).toBe(false)
  })
})

// ── 三启动顺序：全程恰一 owner 恰一 driver，败方让位有事件 ──
describe('三启动顺序验收（product/bash/relay 竞争 owner）', () => {
  it('顺序 1：product→bash→relay——恰一 owner，后到者 ok:false 且事件流有 refused 留痕', () => {
    const root = freshRoot('order-pbr')
    const env = probeEnv([1201, 1202, 1203], { 1201: CMD.product, 1202: CMD.bashSup, 1203: CMD.relay })
    const r1 = cli(asProduct(root, 1201), env)
    const r2 = cli(asBashSup(root, 1202), env)
    const r3 = cli(asRelay(root, 1203), env)
    expect([r1, r2, r3].filter((r) => r.json?.ok).length).toBe(1)
    expect(r1.json.ok).toBe(true)
    expect([r2, r3].every((r) => r.json.ok === false && r.json.holder)).toBe(true)
    const ev = eventsOf(root)
    expect(ev.filter((e) => e.kind === 'owner-acquired').length).toBe(1)
    expect(ev.filter((e) => e.kind === 'owner-refused').length).toBe(2)
  })

  it('顺序 2：bash→product——bash 持有，product ok:false（让位语义对称）', () => {
    const root = freshRoot('order-bp')
    const env = probeEnv([1201, 1202], { 1201: CMD.product, 1202: CMD.bashSup })
    const r1 = cli(asBashSup(root, 1202), env)
    const r2 = cli(asProduct(root, 1201), env)
    expect(r1.json.ok).toBe(true)
    expect(r2.json.ok).toBe(false)
    expect(r2.json.holder.kind).toBe('bash-supervisor')
  })

  it('并发：8 路 CLI 同时抢 owner——恰一成功（真子进程竞争）', async () => {
    const root = freshRoot('concurrent')
    // 探针=全局真值：8 个竞争者彼此互见为活（真实进程表语义；若只报自己活，
    // 持有人会被竞争者误判死而接管——夹具必须如实）
    const pids = Array.from({ length: 8 }, (_, i) => 1300 + i)
    const truth = probeEnv(pids, Object.fromEntries(pids.map((p) => [p, CMD.product])))
    const codes = await Promise.all(pids.map((pid) =>
      new Promise<number>((res) => {
        const p = spawn(process.execPath, [CLI, ...asProduct(root, pid)], {
          env: { ...process.env, MX_GUARD_PROBE: PROBE, ...truth },
          stdio: 'ignore',
        })
        p.on('exit', (c) => res(c ?? -1))
      }),
    ))
    expect(codes.filter((c) => c === 0).length).toBe(1)
    expect(eventsOf(root).filter((e) => e.kind === 'owner-acquired').length).toBe(1)
  })

  it('恰一 driver：胜方拉起驱动，驱动锁同样互斥', () => {
    const root = freshRoot('single-driver')
    const env = probeEnv([1401], { 1401: CMD.driver })
    const d1 = cli(asDriver(root, 1401), env)
    const d2 = cli(asDriver(root, 1402), env)
    expect([d1, d2].filter((r) => r.json?.ok).length).toBe(1)
  })
})

// ── lock-status 与 bash 兼容包装 ───────────────────────────
describe('lock-status 与 mx_driver_lock_acquire 兼容包装', () => {
  it('lock-status 汇出 owner/driver/lease/residents 四面', () => {
    const root = freshRoot('status')
    const a = cli(asProduct(root, 1501), probeEnv([1501], { 1501: CMD.product }))
    cli(asDriver(root, 1502), probeEnv([1502], { 1502: CMD.driver }))
    const st = cli(['lock-status', '--sim-root', root], probeEnv([1501, 1502], { 1501: CMD.product, 1502: CMD.driver }))
    expect(st.json.ok).toBe(true)
    expect(st.json.owner).toMatchObject({ kind: 'product-supervisor', pid: 1501, alive: true, runId: 'r1' })
    expect(st.json.driver).toMatchObject({ pid: 1502, alive: true })
    expect(st.json.owner.instance).toBe(a.json.instance)
    const st2 = cli(['lock-status', '--sim-root', root], probeEnv([]))
    expect(st2.json.owner.alive).toBe(false)
    expect(st2.json.driver.alive).toBe(false)
  })

  it('mx_driver_lock_acquire 兼容包装：经 CLI 返回 0/1/2 旧契约（活锁拒、陈锁接管）', () => {
    const root = freshRoot('wrapper')
    const evid = join(TMP, 'wrapper-evid')
    mkdirSync(evid, { recursive: true })
    // 夹具须 stub mx-scenario-lib.sh 顶层引用的 env（set -u 下缺一个 source 即断）
    const run = (alive: string, pid2: number, label: string) => execFileSync('bash', ['-c', [
      `SIM_ROOT=${JSON.stringify(root)} RUN_ID=r1`,
      `MX_GUARD_PROBE=${JSON.stringify(PROBE)} MX_PROBE_ALIVE=${JSON.stringify(alive)} MX_PROBE_CMD_1601=${JSON.stringify(CMD.driver)}`,
      `EVID_DIR=${JSON.stringify(evid)} STATE=${JSON.stringify(join(evid, 'state.env'))}`,
      `HERMES_ROOT=${JSON.stringify(evid)} MX_SCRIPT_DIR=${JSON.stringify(join(REPO, 'simharness'))}`,
      'bash -c \'set -u; source ' + JSON.stringify(join(REPO, 'simharness/mux/mx-scenario-lib.sh')) + ' >/dev/null 2>&1;',
      // 驱动库 source 即 set -e——与 aipay-scenario.sh 同款 `|| rc=$?` 调用姿势
      `rc=0; mx_driver_lock_acquire "$SIM_ROOT/.driver.lock.d" ${pid2} || rc=$?; echo "${label}=$rc"'`,
    ].join(' ')], { encoding: 'utf8' })
    // 1601 持锁（活）→ 后来者 1602 被拒（旧契约 rc=1）
    expect(run('1601', 1601, 'rc1')).toContain('rc1=0')
    expect(run('1601', 1602, 'rc2')).toContain('rc2=1')
    // 持锁者死 → CLI 陈锁接管 rc=0
    expect(run('', 1603, 'rc3')).toContain('rc3=0')
  })
})
