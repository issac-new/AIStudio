// overlay/slashcmd 内置命令（P11，2026-10-04 九源轮）：
// 「让 Agent 创建技能」入口——对照 DeepSeek Harness v0.2.1-alpha.1 的
// "Let Agent create a plugin"（保留草稿进入创造模式，发送需求后才开始执行）。
// 本仓等价物：/skill-draft 斜杠命令把技能草稿协议预填进输入框（人写需求、
// agent 走 skill_manage 建草稿、skill_view 自校验、标注待人工采纳——
// 与 RSI 内核"R2 激活人审"同纪律，agent 不自行声明上线）。
import type { SlashCommand } from './slash-commands'

export interface BuiltinSlashCommand extends SlashCommand {
  builtin: true
  /** 面板提示用：内置命令不可删改（随版本演进） */
  builtinNote: string
}

export const BUILTIN_SLASH_COMMANDS: BuiltinSlashCommand[] = [
  {
    name: 'skill-draft',
    description: '让 Agent 把一个做法沉淀为技能草稿（人审后生效）',
    builtin: true,
    builtinNote: '内置（P11）：草稿协议见 prompt；采纳走人审',
    prompt: `请把下面这个需求沉淀为一个可复用技能（skill）：

1. 先用 skill_list 查看现有技能，确认没有重名或近似技能；有近似的先建议「改进现有」还是「新建」，等我确认。
2. 新建时用 skill_manage 创建草稿：frontmatter 必须含 name / description / triggers；正文写清适用场景、操作步骤、已知坑位与验收标准。
3. 创建后立即用 skill_view 回读，确认 frontmatter 能过校验；不过就当场修好。
4. 最后输出三行：技能名、一句话摘要、适用与不适用场景各一条，并明确标注「草稿待人工采纳」——不要自行声明已上线。

我的需求：`,
  },
]

/** GET 合并：内置在前（用户命令按字母序不动）；同名时用户版本优先（可覆盖内置语义）。 */
export function mergeBuiltins(userList: readonly SlashCommand[]): Array<SlashCommand & { builtin?: true }> {
  const userNames = new Set(userList.map((c) => c.name))
  return [...BUILTIN_SLASH_COMMANDS.filter((b) => !userNames.has(b.name)), ...userList.map((c) => ({ ...c }))]
}

/** save 剥离：客户端回传里的内置条目不落用户存储（内置随版本演进，用户存储只存自己的）。 */
export function stripBuiltins(list: readonly (SlashCommand & { builtin?: boolean })[]): SlashCommand[] {
  return list.filter((c) => !c.builtin).map(({ name, description, prompt }) => ({ name, description, prompt }))
}
