/**
 * 机械交接锚点（C2，DSH dsh-smart-compact「跨窗交接三行」落地）。
 *
 * 换窗时刻的交接信息不靠模型生成——纯机械派生（字符串拼接），零模型/零网络调用，
 * 杜绝「摘要幻觉」从交接行渗入新窗。本文件纯函数：守门测试断言源码无任何
 * IO（fs/http/net/child_process/fetch），违者在测试面即红。
 */

/** 锚点入参：窗号 + 会话标题 + 窗内消息（messages 表行；只读拼接，不改写）。 */
export interface HandoffAnchorInput {
  windowNumber: number
  sessionTitle: string | null | undefined
  messages: ReadonlyArray<{
    role: string
    content: string
    display_role?: string | null
    tool_name?: string | null
  }>
}

/** 截断工具：只截锚点行（消息正文红线禁止截断，本函数不接触消息归档面）。 */
function head(text: string, n: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : t.slice(0, n)
}

/** 任务行来源：会话标题优先；无标题回退窗内第一条 user 消息；都没有→诚实占位。 */
function taskLine(input: HandoffAnchorInput): string {
  const title = input.sessionTitle?.trim()
  if (title) return `任务：${head(title, 80)}`
  const firstUser = input.messages.find((m) => m.role === 'user')
  if (firstUser) return `任务：${head(firstUser.content, 80)}`
  return '任务：（无标题且窗内无 user 消息）'
}

/** 最近动作行：最后一条带 tool_name 的消息（工具名+content 头 60 字符）；
 * 无工具消息回退最后一条 assistant（display_role+内容头 60 字符）；
 * 仍无→诚实占位（空窗理论上不会建窗，防御性兜底）。 */
function lastActionLine(input: HandoffAnchorInput): string {
  const msgs = input.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!
    if (m.tool_name?.trim()) {
      return `最近动作：${head(`${m.tool_name} ${m.content}`, 60)}`
    }
  }
  for (let i = msgs.length - 1; i >= 0; i--) {
    const m = msgs[i]!
    if (m.role === 'assistant') {
      return `最近动作：${head(`${m.display_role ?? 'assistant'} ${m.content}`, 60)}`
    }
  }
  return '最近动作：（窗内无工具/assistant 消息）'
}

/** 三行机械交接锚点：
 *   Context window #N opened
 *   任务：<标题或首条 user 消息头 80 字符>
 *   最近动作：<最后工具消息 tool_name+content 头 60 字符，无则最后 assistant>
 * 纯机械拼接——禁止任何模型/网络调用（守门测试见 __tests__/anchor.test.ts）。 */
export function buildHandoffAnchor(input: HandoffAnchorInput): string[] {
  return [
    `Context window #${input.windowNumber} opened`,
    taskLine(input),
    lastActionLine(input),
  ]
}
