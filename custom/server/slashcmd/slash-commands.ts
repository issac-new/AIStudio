// overlay/slashcmd 域：自定义斜杠命令（B7，zcode settings/CommandsSection 对照）。
// 语义：name（/ 后触发的命令名）+ prompt 模板；ChatInput 选中后把 prompt 模板
// 写入输入框（用户可编辑再发送），不走引擎新命令注册（零协议改动）。
// 存储：runtime/ide-slash-commands.json（原子写），REST 见 native-routes.ts。

export interface SlashCommand {
  name: string
  description: string
  prompt: string
}

export const SLASH_COMMAND_NAME_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/

/** 校验整表：命令名格式/唯一性、prompt 非空。返回 problems 空=通过。 */
export function validateSlashCommands(list: readonly SlashCommand[]): string[] {
  const problems: string[] = []
  const seen = new Set<string>()
  list.forEach((c, i) => {
    if (!SLASH_COMMAND_NAME_RE.test(c.name)) problems.push(`#${i} 命令名非法（小写字母/数字/-/_，字母或数字开头，≤32）：${c.name || '(空)'}`)
    if (seen.has(c.name)) problems.push(`#${i} 命令名重复：${c.name}`)
    seen.add(c.name)
    if (!c.prompt.trim()) problems.push(`#${i}（${c.name || '未命名'}）prompt 不能为空`)
  })
  return problems
}

/** 归一化：trim、剔空名项（配合校验使用；校验先行，本函数不吞错）。 */
export function normalizeSlashCommands(raw: unknown): SlashCommand[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is SlashCommand => Boolean(c) && typeof c === 'object' && typeof (c as SlashCommand).name === 'string')
    .map((c) => ({
      name: c.name.trim(),
      description: typeof c.description === 'string' ? c.description.trim() : '',
      prompt: typeof c.prompt === 'string' ? c.prompt : '',
    }))
}
