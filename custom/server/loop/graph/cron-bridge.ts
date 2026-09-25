// overlay/custom/server/loop/graph/cron-bridge.ts
// T3b（边界设计 §6-T3b，spec：docs/superpowers/specs/2026-09-25-loop-cron-bridge-design.md）
// —— loop 调度降级为 hermes cron provider 的桥接件：
//
// 动机：调度负载唯一登记（一负载一登记处）。GRAPH_ENGINE=on 时 RunSpawner 的
// 30s 内部轮询是 studio 侧第二套 timer，与 gateway cron（60s tick）构成双调度面。
// 桥接模式下（LOOP_SCHEDULER=cron）：
//   1. 本进程不再起 RunSpawner 内部 interval（webhook/手动 tick 保留）；
//   2. 注册一个 hermes cron no-agent 脚本任务（每分钟 curl 本进程公开段
//      POST /api/loop/cron-bridge/tick），到期判定由 spawner.poll() 执行——
//      hermes cron 成为唯一 timer，粒度从 30s 粗化到 60s（cron 最小粒度）。
//
// 安全：路由仅在 LOOP_SCHEDULER=cron 时非 404；请求须带 x-loop-bridge-token 与
// env LOOP_CRON_BRIDGE_TOKEN 相等（未设 token 即 fail-closed 401），且来源限
// 本机回环。脚本落 <HERMES_HOME>/scripts/（600），token 只进脚本不进日志。
//
// 约束：本模块不 import 上游代码（custom 树规则）；hermes 进程执行经注入的
// exec（缺省 child_process.execFile('hermes', ...)），测试注入 mock。
import { execFile } from 'child_process'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

/** 桥接开关：LOOP_SCHEDULER=cron 时启用（缺省关闭，行为不变）。 */
export function isCronBridgeEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.LOOP_SCHEDULER === 'cron'
}

export const CRON_BRIDGE_TICK_PATH = '/api/loop/cron-bridge/tick'
export const CRON_BRIDGE_JOB_NAME = 'loop-cron-bridge'

/** 当前 tick 执行体（graph-assembly 启动时注入 spawner.poll；stop 时置 null）。 */
let tickFn: (() => Promise<void>) | null = null
export function setCronBridgeTick(fn: (() => Promise<void>) | null): void {
  tickFn = fn
}

function isLoopback(ip: string | undefined): boolean {
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip === undefined
}

/** 生成 no-agent 脚本内容（curl 回本进程 tick 端点；失败静默，下个 tick 自愈）。 */
export function buildTickScript(port: number, token: string): string {
  return [
    '#!/bin/sh',
    '# loop-cron-bridge：hermes cron 唯一 timer 的到期回调（T3b，自动生成勿手改）',
    `curl -fsS -X POST "http://127.0.0.1:${port}${CRON_BRIDGE_TICK_PATH}" \\`,
    `  -H "x-loop-bridge-token: ${token}" >/dev/null 2>&1 || true`,
    '',
  ].join('\n')
}

/** 公开段路由（patch 挂载；未启用桥接 → 404，token 校验 fail-closed）。 */
export function registerLoopCronBridgeRoutes(app: {
  use: (mw: (ctx: any, next: () => Promise<void>) => Promise<void>) => void
}, env: Record<string, string | undefined> = process.env): void {
  app.use(async (ctx, next) => {
    if (ctx.method !== 'POST' || ctx.path !== CRON_BRIDGE_TICK_PATH) return next()
    if (!isCronBridgeEnabled(env)) { ctx.status = 404; ctx.body = { error: 'cron bridge disabled' }; return }
    if (!isLoopback(ctx.ip)) { ctx.status = 403; ctx.body = { error: 'loopback only' }; return }
    const expected = env.LOOP_CRON_BRIDGE_TOKEN?.trim()
    if (!expected) { ctx.status = 401; ctx.body = { error: 'LOOP_CRON_BRIDGE_TOKEN unset (fail-closed)' }; return }
    const got = (ctx.request?.headers?.['x-loop-bridge-token'] ?? '') as string
    if (got !== expected) { ctx.status = 401; ctx.body = { error: 'bad token' }; return }
    if (!tickFn) { ctx.status = 503; ctx.body = { error: 'tick not ready' }; return }
    await tickFn()
    ctx.status = 204
  })
}

export interface CronBridgeOpts {
  port: number
  token: string
  hermesHome?: string
  exec?: (args: string[]) => Promise<{ stdout: string; stderr: string }>
  log?: (msg: string) => void
}

/**
 * 幂等注册 cron 任务：同名任务已存在即跳过。返回是否新建。
 * 调用前提：LOOP_SCHEDULER=cron 且端口/token 已知；任何失败大声记日志不抛出
 * （桥接未注册 = 无 timer 驱动，属可观测故障而非静默降级）。
 */
export async function ensureLoopTickCronJob(opts: CronBridgeOpts): Promise<boolean> {
  const log = opts.log ?? (() => {})
  const home = opts.hermesHome ?? join(homedir(), '.hermes')
  // 真 CLI 合同（冒烟实测，issue #18594）：不显式钉 HERMES_HOME 时 CLI 会落到
  // "活动 profile" 的 home 找 scripts/，脚本写错家即失败——与写脚本的家保持一致。
  const exec = opts.exec ?? ((args) => new Promise((resolve, reject) => {
    execFile('hermes', args, {
      timeout: 30_000, maxBuffer: 1024 * 1024,
      env: { ...process.env, HERMES_HOME: home },
    }, (err, stdout, stderr) => {
      if (err) { Object.assign(err, { stdout: String(stdout ?? ''), stderr: String(stderr ?? '') }); reject(err); return }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') })
    })
  }))
  const { stdout } = await exec(['cron', 'list'])
  if (stdout.includes(CRON_BRIDGE_JOB_NAME)) {
    log(`[cron-bridge] job "${CRON_BRIDGE_JOB_NAME}" 已注册，跳过`)
    return false
  }
  const scriptsDir = join(home, 'scripts')
  mkdirSync(scriptsDir, { recursive: true })
  // 真 CLI 合同（冒烟实测）：--script 只收相对 <HERMES_HOME>/scripts/ 的文件名，
  // 绝对/home 相对路径会被 `hermes cron create` 直接拒绝。
  const scriptName = 'loop-cron-bridge.sh'
  const scriptPath = join(scriptsDir, scriptName)
  writeFileSync(scriptPath, buildTickScript(opts.port, opts.token), { mode: 0o600 })
  chmodSync(scriptPath, 0o600)
  await exec([
    'cron', 'create', '1m',
    '--name', CRON_BRIDGE_JOB_NAME,
    '--no-agent', '--script', scriptName,
    '--deliver', 'local',
  ])
  log(`[cron-bridge] 已注册 hermes cron 任务 "${CRON_BRIDGE_JOB_NAME}"（1m no-agent → :${opts.port}${CRON_BRIDGE_TICK_PATH}）`)
  return true
}
