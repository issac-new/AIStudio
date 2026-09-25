// overlay/notify 域：turn 完成外部命令钩子（codex §四 P1 吸收，矩阵 §3.8 codex P2）。
//
// codex 语义（turn 完成 notify 外部命令钩子）：会话轮结束时外呼一条命令（桌面
// 通知/IM 推送/自定义脚本）——Ycode 形状：**钩子判定面**（何时触发/触发什么命令），
// 执行面由调用方跑（spawn 命令归调度层，判定纯函数先行）。
// 配置：HERMES_TURN_NOTIFY_CMD（命令模板；{turn}/{status} 占位替换）；
// HERMES_TURN_NOTIFY=off 关；触发条件=轮终态（completed|failed|interrupted）。
import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { homedir } from 'os'
import { join, resolve } from 'path'

export type TurnStatus = 'completed' | 'failed' | 'interrupted'

export interface TurnEvent {
  turnId: string
  status: TurnStatus
  workspacePath: string
  at: number
}

export interface NotifyPlan {
  /** 应触发的命令（占位已替换）；null=不触发（未配/关闭/状态不达）。 */
  command: string | null
  detail: string
}

function enabled(): boolean {
  return (process.env.HERMES_TURN_NOTIFY ?? 'on').trim().toLowerCase() !== 'off'
}

function commandTemplate(): string | null {
  return process.env.HERMES_TURN_NOTIFY_CMD?.trim() || null
}

/** 轮事件→通知计划（判定纯函数；命令占位 {turn}/{status}/{workspace}）。 */
export function planTurnNotify(event: TurnEvent): NotifyPlan {
  if (!enabled()) return { command: null, detail: '钩子关闭（HERMES_TURN_NOTIFY=off）' }
  const tmpl = commandTemplate()
  if (!tmpl) return { command: null, detail: '未配置命令（HERMES_TURN_NOTIFY_CMD）' }
  const command = tmpl
    .replaceAll('{turn}', event.turnId)
    .replaceAll('{status}', event.status)
    .replaceAll('{workspace}', event.workspacePath)
  return { command, detail: `turn ${event.status}：触发通知` }
}

// ── 触发台账（审计：外呼留痕）──
export interface NotifyRecord {
  turnId: string
  command: string
  at: number
}

function notifyDir(): string {
  return join(homedir(), '.hermes-web-ui', 'turn-notify')
}

export function recordNotify(rec: NotifyRecord): void {
  try {
    const dir = notifyDir()
    mkdirSync(dir, { recursive: true })
    const f = join(dir, 'log.json')
    const log: NotifyRecord[] = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : []
    log.push(rec)
    if (log.length > 200) log.shift()
    writeFileSync(f, JSON.stringify(log, null, 2))
  } catch { /* 台账失败不影响通知本身 */ }
}

export function listNotifies(limit = 20): NotifyRecord[] {
  try {
    const f = join(join(homedir(), '.hermes-web-ui', 'turn-notify'), 'log.json')
    const log: NotifyRecord[] = JSON.parse(readFileSync(f, 'utf8'))
    return log.slice(-limit).reverse()
  } catch {
    return []
  }
}
