// Cockpit 终端多工具支持：Claude Code / Codex / DeepSeek Harness(dsh)。
//
// TERMINAL_TOOLS 数组顺序即优先顺序（claude-code > codex > deepseek-harness），
// pickDefaultTool 按该顺序自动选择本机已安装的工具；用户手动选择持久化到
// localStorage，仅在所选工具仍安装时生效。
//
// 启动命令沿用"经 PTY 注入 shell 命令"的既有方案（见 CockpitTerminalPane）：
// session created 后发送 cd + env + 工具命令，由服务端 shell 负责解析执行。
// 各工具的免审批/自主运行 flag 与 cockpit 既有 Claude Code 启动行为对齐。

export type TerminalToolId = 'claude-code' | 'codex' | 'deepseek-harness'

export interface TerminalToolDef {
  id: TerminalToolId
  /** 展示名（品牌名，不进 i18n） */
  label: string
  /** Unix 二进制名（服务端 PATH 探测 + 文档用途） */
  bin: string
}

/** 按优先顺序排列（index 0 优先级最高） */
export const TERMINAL_TOOLS: readonly TerminalToolDef[] = [
  { id: 'claude-code', label: 'Claude Code', bin: 'claude' },
  { id: 'codex', label: 'Codex', bin: 'codex' },
  { id: 'deepseek-harness', label: 'DeepSeek Harness', bin: 'dsh' },
] as const

export const TERMINAL_TOOL_STORAGE_KEY = 'hermes_cockpit_terminal_tool'

export function isTerminalToolId(v: unknown): v is TerminalToolId {
  return typeof v === 'string' && TERMINAL_TOOLS.some((t) => t.id === v)
}

/**
 * 构建工具启动命令（含 cd 到任务 workspace）。
 * @param isWindows 服务端 shell 是否为 PowerShell（依据 created 消息的 shell 名判断）
 */
export function buildToolInitCommand(
  id: TerminalToolId,
  workspacePath: string,
  isWindows: boolean,
): string {
  const p = (workspacePath || '~').replace(/"/g, '\\"')
  const presets: Record<TerminalToolId, { unix: string; win: string }> = {
    // 既有行为保持不变：agent teams 实验 flag + 免审批 + effort max
    'claude-code': {
      unix: `(cd "${p}" && CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude agents --dangerously-skip-permissions --effort max)`,
      win: `Set-Location "${p}"; $env:CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1; claude agents --dangerously-skip-permissions --effort max`,
    },
    // 与 claude 免审批对齐的 codex 等价 flag（--yolo 长形式）
    codex: {
      unix: `(cd "${p}" && codex --dangerously-bypass-approvals-and-sandbox)`,
      win: `Set-Location "${p}"; codex --dangerously-bypass-approvals-and-sandbox`,
    },
    // dsh 以调用目录为默认 workspace root；TUI profile 需本机已安装（dsh plugin）
    'deepseek-harness': {
      unix: `(cd "${p}" && dsh --profile tui)`,
      win: `Set-Location "${p}"; dsh --profile tui`,
    },
  }
  const preset = presets[id]
  return isWindows ? preset.win : preset.unix
}

/**
 * 默认工具选择：已保存且仍安装 → 保存值；否则按优先顺序取第一个已安装的；
 * 全部未安装/列表为空（探测失败）→ 回退 claude-code（原行为）。
 */
export function pickDefaultTool(
  installedIds: readonly TerminalToolId[],
  saved?: string | null,
): TerminalToolId {
  if (saved && isTerminalToolId(saved) && installedIds.includes(saved)) {
    return saved
  }
  for (const t of TERMINAL_TOOLS) {
    if (installedIds.includes(t.id)) return t.id
  }
  return 'claude-code'
}
