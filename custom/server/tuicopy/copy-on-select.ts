// overlay/tuicopy 域：TUI 选中即复制三档+终端检测矩阵（kimi ab021e9 吸收，矩阵 §1.3 四候选）。
//
// kimi 语义（TUI 选中即复制三档）：
// - **off**：不自动复制（显式按键才复制）；
// - **on-select**：选中即复制（默认）；
// - **foreground**：选中且终端前台聚焦才复制（防后台误触发剪贴板）。
// 终端检测矩阵：环境变量→终端名→能力（osc52 剪贴板/鼠标事件/真彩），
// 能力不足时 on-select 档自动降级 off（不发无效 OSC52）。
export type CopyOnSelectMode = 'off' | 'on-select' | 'foreground'

export type TerminalKind =
  | 'tmux' | 'screen' | 'iterm2' | 'kitty' | 'alacritty'
  | 'wezterm' | 'vscode' | 'apple-terminal' | 'xterm' | 'unknown'

export interface TerminalCaps {
  kind: TerminalKind
  /** OSC52 剪贴板写入支持。 */
  osc52: boolean
  /** 鼠标选中事件。 */
  mouse: boolean
  /** 真彩。 */
  trueColor: boolean
}

/** 环境变量→终端识别（kimi 检测矩阵；多复用键共存取优先序）。 */
export function detectTerminal(env: Record<string, string | undefined>): TerminalKind {
  const tp = env.TERM_PROGRAM ?? ''
  const term = env.TERM ?? ''
  if (env.TMUX !== undefined) return 'tmux'
  if (env.STY !== undefined) return 'screen'
  if (tp === 'iTerm.app' || env.ITERM_SESSION_ID !== undefined) return 'iterm2'
  if (tp === 'vscode') return 'vscode'
  if (env.WEZTERM_EXECUTABLE !== undefined || tp === 'WezTerm') return 'wezterm'
  if (env.KITTY_WINDOW_ID !== undefined) return 'kitty'
  if (env.ALACRITTY_WINDOW_ID !== undefined || tp === 'Alacritty') return 'alacritty'
  if (tp === 'Apple_Terminal') return 'apple-terminal'
  if (term.startsWith('xterm')) return 'xterm'
  return 'unknown'
}

/** 终端能力矩阵（kimi ab021e9）。 */
export function terminalCaps(kind: TerminalKind): TerminalCaps {
  const m: Record<TerminalKind, TerminalCaps> = {
    tmux: { kind, osc52: true, mouse: true, trueColor: true },
    screen: { kind, osc52: false, mouse: true, trueColor: false },
    iterm2: { kind, osc52: true, mouse: true, trueColor: true },
    kitty: { kind, osc52: true, mouse: true, trueColor: true },
    alacritty: { kind, osc52: true, mouse: true, trueColor: true },
    wezterm: { kind, osc52: true, mouse: true, trueColor: true },
    vscode: { kind, osc52: true, mouse: true, trueColor: true },
    'apple-terminal': { kind, osc52: false, mouse: false, trueColor: false },
    xterm: { kind, osc52: false, mouse: true, trueColor: false },
    unknown: { kind, osc52: false, mouse: false, trueColor: false },
  }
  return m[kind]
}

export type CopyAction = 'copy' | 'skip' | 'defer-until-focus'

/** 选中事件→复制动作判定（三档+能力降级）。 */
export function copyOnSelectDecision(
  mode: CopyOnSelectMode,
  caps: TerminalCaps,
  focused: boolean,
): CopyAction {
  if (mode === 'off') return 'skip'
  if (!caps.osc52) return 'skip' // 能力不足自动降级，不发无效 OSC52
  if (mode === 'on-select') return 'copy'
  return focused ? 'copy' : 'defer-until-focus'
}
