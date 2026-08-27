// 终端工具可用性探测 API。
// 服务端实现见 custom/server/controllers/hermes/terminal-tools.ts（patch 注入路由），
// 扫描服务端 PATH 中是否存在 claude / codex / dsh，与 PTY 实际可执行环境一致。
import { request } from '@/api/client'
import type { TerminalToolId } from '@/custom/cockpit/terminal/terminal-tools'

export interface TerminalToolStatus {
  id: TerminalToolId
  installed: boolean
  /** 安装则返回二进制绝对路径，便于 UI tooltip 展示 */
  path: string | null
}

export async function fetchTerminalTools(): Promise<TerminalToolStatus[]> {
  const res = await request<{ tools: TerminalToolStatus[] }>('/api/hermes/terminal-tools')
  return Array.isArray(res?.tools) ? res.tools : []
}
