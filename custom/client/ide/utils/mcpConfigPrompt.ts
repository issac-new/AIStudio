// overlay/custom/client/ide/utils/mcpConfigPrompt.ts
// 对话式 MCP 配置提示词资产（M3）。
//
// 范式移植自 kimi-code /mcp-config（builtin skill mcp-config.md）：配置对话
// 不是专用工具，而是一段受控的引导提示词 + 普通代理回合——agent 用既有
// 文件工具读写各 coding agent 的 MCP 配置文件，文件编辑审批门就是确认门。
// 完整分析见 docs/upstream-analysis/（kimi /mcp-config 报告）。
//
// 与 kimi 原版的差异（按我方现实裁剪）：
//   - 我们是多底座（codex/claude/dsh…），配置文件位置按 agent 分述；
//   - 工作台自身的 MCP（/hermes/mcp，REST 管理）不经文件——引导用户去
//     管理页，不许 agent 用 curl 直改服务端；
//   - 无 OAuth 合成工具（needs-auth 通道后端暂无），认证一律走 env 引用。

export interface McpConfigTarget {
  agentId: string
}

/** 生成注入当前会话的引导提示词（kimi <skill-loaded> 的对应物） */
export function buildMcpConfigPrompt(target: McpConfigTarget): string {
  const agent = target.agentId || 'zcode'
  return [
    `[mcp-config 对话式配置]（底座：${agent}；范式移植自 kimi-code /mcp-config）`,
    '',
    '我要配置 MCP 服务器，请你以对话方式引导我完成，遵守以下规则：',
    '',
    '## 目标与范围',
    '1. 先弄清我的意图：新增 / 修改 / 删除 / 查看。没说清就先问我，不要猜。',
    '2. 配置文件按底座落位：',
    '   - codex：~/.codex/config.toml 的 [mcp_servers.*]（TOML）',
    '   - claude：~/.claude.json 的 mcpServers，或项目根 .mcp.json（JSON）',
    '   - dsh：~/.dsh/ 下的插件与配置',
    `   - 本次默认目标是 ${agent} 的全局配置；我要改别的底座时会明说。`,
    '   - SwarmStudio 工作台自身的 MCP（/hermes/mcp 管理页）不经文件管理：',
    '     需要改它时，引导我打开管理页操作，不要尝试用 curl/HTTP 直改服务端。',
    '',
    '## 编辑纪律',
    '3. 动手前先读目标文件，向我展示三样东西：目标路径、现有相关条目、',
    '   你准备写入或删除的条目。展示为了透明；真正的确认是文件编辑审批。',
    '4. 只改目标条目，保留文件其余内容与格式。TOML/JSON 解析失败时，原样',
    '   报告错误并停止——绝不在解析失败的文件上继续写。',
    '5. 密钥与令牌优先走环境变量引用，不把明文密钥写进配置；我坚持内联时，',
    '   先一句提醒风险再照做。',
    '6. stdio 服务器会在会话启动时执行 command——新增前先向我复述将要执行',
    '   的完整命令行，确认我信任其来源。',
    '',
    '## 完成后',
    '7. 告诉我新配置只对新会话生效（工具注册按会话基线），建议我在 IDE 右侧',
    '   「MCP」页签或 /hermes/mcp 管理页确认连接状态。',
    '',
    '现在从第 1 步开始：问我意图。',
  ].join('\n')
}
