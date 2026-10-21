// 导演台 Matrix 事件通知（2026-10-21 挂账实施轮，用户裁定）。
// 语义：导演 run 启动 / 人工闸批准·打回时，向配置的观察房间发一条真实系统消息
// （走 humansim 人类账号通道 + 审计），未配置/未登录态一律 fail-soft 跳过——
// 不发假消息、不阻断主流程。这是真实通知，不是“模拟员工聊天”（导演台仍不代演）。
import { sendHumansimMessage } from '../../humansim/humansim-controller'

export type DirectorNotifyKind = 'started' | 'gate-approved' | 'gate-rejected'

export interface DirectorNotifyResult {
  sent: boolean
  reason?: string
}

const KIND_LABEL: Record<DirectorNotifyKind, string> = {
  started: '推演启动',
  'gate-approved': '人工闸批准',
  'gate-rejected': '人工闸打回',
}

function clip(text: unknown, max = 160): string {
  const s = text instanceof Error ? text.message : String(text ?? '')
  return s.length <= max ? s : `${s.slice(0, max)}…`
}

export async function notifyDirectorEvent(
  kind: DirectorNotifyKind,
  opts: { runId: string; title?: string; detail?: string; actor?: string },
): Promise<DirectorNotifyResult> {
  const room = process.env.SIM_DIRECTOR_NOTIFY_ROOM?.trim()
  if (!room) return { sent: false, reason: '未配置 SIM_DIRECTOR_NOTIFY_ROOM（通知关闭）' }
  const as = process.env.SIM_DIRECTOR_NOTIFY_AS?.trim() || 'admin'
  const lines = [
    `[${KIND_LABEL[kind]}] ${opts.runId}${opts.title ? ` · ${opts.title}` : ''}`,
    opts.actor ? `操作人：${opts.actor}` : '',
    opts.detail ?? '',
  ].filter(Boolean)
  try {
    await sendHumansimMessage({ as, room, body: lines.join('\n'), kind: 'notice' })
    return { sent: true }
  } catch (err) {
    return { sent: false, reason: clip(err) }
  }
}
