// overlay/bashcontract 域：Turn 级动态 Bash 工具契约（minimax 61c4c31 吸收，矩阵 §1.3 两候选）。
//
// minimax 语义（Turn 级动态 Bash 工具契约）：
// - **schema 随运行时裁剪**：参数 schema 按运行时能力出字段——
//   cwd 仅在有 workspace 时出现；timeout 仅在支持的环境出现；platform 专属
//   提示（win junction 等）按平台注入；不发送无意义的死参数；
// - **shell 感知提示**：描述带当前 shell 差异提示（zsh 通配/array 语法、fish 不兼容
//   POSIX 管道等），按 runtime.shell 动态拼装。
export interface BashRuntime {
  platform: 'darwin' | 'linux' | 'win32'
  shell: 'bash' | 'zsh' | 'fish' | 'posix'
  hasWorkspace: boolean
  supportsTimeout: boolean
}

export interface ToolSchema {
  name: 'bash'
  description: string
  params: Array<{ name: string; type: string; required: boolean }>
}

const SHELL_HINTS: Record<BashRuntime['shell'], string> = {
  bash: '',
  zsh: 'Shell is zsh: glob qualifiers and bare `foo=bar cmd` env prefixes behave POSIX-compliantly.',
  fish: 'Shell is fish: NOT POSIX — use `env VAR=val cmd` prefix, no `VAR=val cmd`; pipes and `&&` OK.',
  posix: '',
}

const PLATFORM_NOTES: Record<BashRuntime['platform'], string> = {
  darwin: 'macOS: BSD userland (sed -i needs suffix arg; no GNU long opts).',
  linux: 'Linux: GNU userland.',
  win32: 'Windows: prefer cmd.exe channel; junctions over symlinks without developer mode.',
}

/** Turn 级 schema 构造（运行时裁剪——不发送死参数）。 */
export function buildBashSchema(rt: BashRuntime): ToolSchema {
  const params: ToolSchema['params'] = [
    { name: 'command', type: 'string', required: true },
  ]
  if (rt.hasWorkspace) params.push({ name: 'cwd', type: 'string', required: false })
  if (rt.supportsTimeout) params.push({ name: 'timeout_ms', type: 'number', required: false })
  const hints = [SHELL_HINTS[rt.shell], PLATFORM_NOTES[rt.platform]].filter(Boolean)
  const suffix = hints.length ? ' ' + hints.join(' ') : ''
  return {
    name: 'bash',
    description: 'Run a shell command.' + suffix,
    params,
  }
}

/** 裁剪判定（守门用）：无 workspace 无 cwd、无 timeout 支持无 timeout_ms。 */
export function schemaFieldNames(rt: BashRuntime): string[] {
  return buildBashSchema(rt).params.map((p) => p.name)
}
