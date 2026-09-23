// overlay/custom/client/ide/api/agents.ts
// IDE 侧 coding agent 探测的纯逻辑适配层：把 upstream fetchCodingAgentsStatus
// 的返回整理为 IDE agent 选择器可消费的选项列表。纯函数部分独立导出，
// 便于守门测试（不触网）。
import {
  fetchCodingAgentsStatus,
  type CodingAgentId,
  type CodingAgentToolStatus,
} from '@/api/coding-agents'

export interface IdeAgentOption {
  id: CodingAgentId
  label: string
  installed: boolean
  version: string
}

/** 展示顺序：zcode 置顶（2026-09-23 源码底座切换），其余按 upstream 返回序 */
const ORDER: CodingAgentId[] = ['zcode', 'codex', 'claude-code', 'dsh', 'pi', 'grok', 'opencode']

/** 纯函数：工具状态列表 → IDE 选项（codex 优先，含未安装项以便展示状态） */
export function toAgentOptions(tools: CodingAgentToolStatus[]): IdeAgentOption[] {
  return [...tools]
    .sort((a, b) => {
      const ia = ORDER.indexOf(a.id)
      const ib = ORDER.indexOf(b.id)
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
    .map((tool) => ({
      id: tool.id,
      label: tool.name || tool.id,
      installed: Boolean(tool.installed),
      version: tool.version || '',
    }))
}

/** 网络侧：探测本机 coding agents（失败时返回空列表，调用方回退仅默认项） */
export async function loadAgentOptions(): Promise<IdeAgentOption[]> {
  try {
    const status = await fetchCodingAgentsStatus()
    return toAgentOptions(status.tools ?? [])
  } catch {
    return []
  }
}
