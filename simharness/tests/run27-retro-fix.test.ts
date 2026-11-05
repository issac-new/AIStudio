import { describe, it, beforeAll, afterAll, expect } from 'vitest'
import { execSync, spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync, appendFileSync, rmSync, existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { readFileSync } from 'node:fs'

// run27 复盘根治批守门（spec 2026-11-05-run27-retro-root-cause）：四面断言——
// ①失败指纹时间戳归一化（run27 实锤：FAIL 行含时刻→指纹每轮互异→supervisor 同指纹
//   硬停永不触发，G4 楔子 23+ 次秒败监督器无限刷单 1h+）
// ②驱动静默心跳（SEND-FAILED 后 19 分钟 0% CPU 睡死、判词已落卡无人消费）
// ③G5 FAIL 判词重入消费＋探测分型接线（8 秒重派同卡二轮评审空转 40 分钟/轮；
//   36/37 fetch failed 被当能力失效冻结）
// ④补丁 755 可应用（readpool fd 计数降频，两连崩 GIL 热点根治）
const HARNESS = resolve(__dirname, '..')
const FIX = join(HARNESS, 'tests', 'fixtures', 'run27-retro')

function run(cmd: string, envExtra: Record<string, string> = {}) {
  return execSync(cmd, { cwd: HARNESS, encoding: 'utf8', shell: '/bin/bash', env: { ...process.env, ...envExtra } })
}

beforeAll(() => { rmSync(FIX, { recursive: true, force: true }); mkdirSync(FIX, { recursive: true }) })
afterAll(() => { rmSync(FIX, { recursive: true, force: true }) })

describe('① 失败指纹时间戳归一化（mx-recovery-lib.sh）', () => {
  it('同义不同时刻→同指纹；不同语义→异指纹', () => {
    const fp = (t: string) =>
      run(`source mux/mx-recovery-lib.sh && mx_fail_fingerprint ${JSON.stringify(t)}`).trim()
    const a = fp('[mux FAIL 20:29:27] 硬闸未过：ready 前置闸门（g4_pass）未冻结，中止')
    const b = fp('[mux FAIL 21:42:36] 硬闸未过：ready 前置闸门（g4_pass）未冻结，中止')
    const c = fp('[mux FAIL 21:42:36] G5 两轮未过，不得发布（V3 硬闸）')
    const empty = run(`source mux/mx-recovery-lib.sh && mx_fail_fingerprint ''`).trim()
    expect(a).toBe(b)          // 归一化：同因秒败各轮指纹一致 → supervisor 硬停可触发
    expect(a).not.toBe(c)      // 语义不同仍可区分（缺口被修=指纹变化继续自愈）
    expect(a).toMatch(/^[0-9a-f]{12}$/)
    expect(empty).toBe('')     // run25 空指纹语义保持
  })
})

describe('② 驱动静默心跳（mx_run_with_heartbeat）', () => {
  it('日志静默超阈→精确 kill＋ISSUE 记单；正常滚动不触发', () => {
    const log = join(FIX, 'hb-driver.log')
    const iss = join(FIX, 'issues.log')
    writeFileSync(log, '')
    // 楔死形态：子进程写一行后长睡（日志零增长），阈值 2s/间隔 1s
    const r = spawnSync('bash', ['-c', `
      source mux/mx-recovery-lib.sh || exit 9
      MX_ISSUES_LOG=${JSON.stringify(iss)} mx_run_with_heartbeat ${JSON.stringify(log)} 2 1 \
        bash -c 'echo "[mux 00:00:01] banner"; exec sleep 60'
      echo "rc=$?"
    `], { cwd: HARNESS, encoding: 'utf8', timeout: 30_000 })
    expect(r.stdout).toContain('rc=143')                    // SIGTERM 终止（143=128+15）
    expect(readFileSync(iss, 'utf8')).toContain('driver-silent-kill')
    // 健康形态：子进程持续写日志，超过原阈值时长也不被杀
    const log2 = join(FIX, 'hb2-driver.log')
    writeFileSync(log2, '')
    const r2 = spawnSync('bash', ['-c', `
      source mux/mx-recovery-lib.sh || exit 9
      mx_run_with_heartbeat ${JSON.stringify(log2)} 2 1 \
        bash -c 'for i in 1 2 3 4; do echo "tick $i"; sleep 1; done'
      echo "rc=$?"
    `], { cwd: HARNESS, encoding: 'utf8', timeout: 30_000 })
    expect(r2.stdout).toContain('rc=0')                     // 正常跑完未被心跳误杀
  }, 40_000)

  it('supervisor 主循环已接心跳 spawn（非裸同步 wait）', () => {
    const sup = readFileSync(join(HARNESS, 'mux', 'run-driver-supervisor.sh'), 'utf8')
    expect(sup).toContain('mx_run_with_heartbeat "$LOGS/$RUN_ID-driver.log"')
    expect(sup).not.toMatch(/\(\s*cd "\$SCRIPT_DIR\/\.\." && RUN_ID=.*bash aipay-scenario\.sh >>/)
  })
})

describe('③ G5 重入消费＋探测分型接线（aipay-scenario.sh）', () => {
  it('G5 断点重进消费 FAIL 终判：result 谓词＋幂等键＋翻绿分派先行', () => {
    const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
    expect(sc).toContain('g5_redispatched_after_fail')
    expect(sc).toContain('kanban_card_result_contains fanfan')
    // 重入门必须在熔断 check 之前（先消费旧判词再谈新轮）
    expect(sc.indexOf('g5_redispatched_after_fail')).toBeLessThan(sc.indexOf('mx_gate_breaker_check g5'))
    const lib = readFileSync(join(HARNESS, 'mux', 'mx-scenario-lib.sh'), 'utf8')
    expect(lib).toContain('kanban_card_result_contains()')
  })

  it('G4 探测分型：rc=2 环境态不冻结 testpass 段；profile 收编 fanfan', () => {
    const sc = readFileSync(join(HARNESS, 'aipay-scenario.sh'), 'utf8')
    expect(sc).toContain('_cap_rc == 2')
    expect(sc).toContain('g4-probe-unreachable')
    expect(sc).toContain('--profile fanfan')
    expect(sc).not.toContain('--profile default')
  })

  it('mjs 全量 fetch failed → exit 2（真不可达端口）；无失败 → exit 0 语义保持', () => {
    const r = spawnSync('node', [
      join(HARNESS, 'mux', 'mx-capability-probes.mjs'),
      '--base', 'http://127.0.0.1:1', '--out', join(FIX, 'cap-unreach'),
      '--profile', 'fanfan', '--token', 'x',
    ], { encoding: 'utf8', timeout: 60_000 })
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('基座不可达')
  })
})

describe('④ 补丁 755（readpool fd 计数降频）', () => {
  it('git apply --check 干净可应用（vendor/hermes-agent cwd）', () => {
    run(`git apply --check --directory=vendor/hermes-agent ../patches/755-readpool-fd-count-throttle.patch`)
    const series = readFileSync(join(HARNESS, '..', 'patches', 'series'), 'utf8')
    expect(series).toContain('755-readpool-fd-count-throttle.patch')
  })
})
