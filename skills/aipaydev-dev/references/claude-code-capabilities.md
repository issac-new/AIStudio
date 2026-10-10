> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。

# Claude Code 官方能力全量清单（GitHub releases 发布说明 + `claude --help` CLI 实测调研）

> 口径：GitHub releases 发布说明 + `claude --help` 系列 CLI 实测；当前基线版本与逐版能力见文末「版本基线」及各版本小节。
> 生成目标技能时，AI 须把以下能力编织进 SKILL.md / workflow.md / reference-manual.md / hooks / commands / settings。

## 一、核心工具（Tools）

| 工具 | 能力 | 目标技能落点 |
|------|------|-------------|
| **Read** | 读文件/目录/图片，支持 offset/limit | 探查阶段读源码 + 按需读 references/ |
| **Write** | 创建/覆盖文件 | 落盘 spec/plan/codebase/reference-manual |
| **Edit** | 精确字符串替换（唯一性校验） | 代码修改 + 模板填充 |
| **Glob** | 文件模式匹配 | 探查目录结构 |
| **Grep** | 正则内容搜索（支持 -o/-c/-l 模式） | 稳定单元盘点 + 敏感信息扫描 |
| **Bash** | 执行 shell 命令（cwd 持久，timeout≤600s，run_in_background） | 运行 precheck.sh / state-machine.sh / npm 命令 |
| **Task**（Subagent） | 派发隔离上下文子代理（不继承主会话，可并行，可选模型） | workflow 节点⑤每任务新 subagent + 两阶段审查 |
| **TodoWrite** | 结构化任务清单（一次一个 in_progress） | workflow 节点清单 + 完成检查表 |
| **AskUserQuestion** | 结构化多选问题（默认不再自动继续，需 /config 开启 idle timeout） | 疑虑确认（7 个必须暂停场景） |
| **WebSearch** | 网络搜索 | 4-Phase SOP Phase 2 强制联网检索 |
| **WebFetch** | 抓取 URL → markdown → 回答问题（15min 缓存，auth URL 失败） | 联网检索上游文档/规范 |
| **SendMessage** | 向运行中的子代理发消息 | subagent 编排中的协调通信 |
| **LSP** | 语言服务器协议工具：go-to-definition / find-references / hover 文档（`startupTimeout` 配置） | 代码导航（比 grep 更精确） |
| **Skill** | 发现并调用内置/自定义 skill（可发现 `/init`/`/review`/`/security-review` 等内置命令） | 目标技能间互调 |
| **SendUserMessage** | agent→用户通信（`--brief` 启用，v2.1.198） | subagent 向用户汇报 |

## 二、Slash Commands（`/command`）

| 命令 | 能力 | 来源版本 |
|------|------|---------|
| `/config key=value` | 从 prompt 设置任意配置（如 `/config thinking=false`） | v2.1.181 |
| `/model` | 切换模型 | 早期 |
| `/fast` | 快速模式 | 早期 |
| `/effort` | 努力等级（含 `ultracode` xhigh） | v2.1.160 |
| `/mcp` | MCP server 管理（list/reconnect） | 早期 |
| `/plugin` | 插件管理（list/enable/disable，`--enabled`/`--disabled` 过滤） | v2.1.163 |
| `/branch` | 从当前会话派生分支 | 早期 |
| `/diff` | 查看差异面板（切换分支/commit 后自动刷新） | v2.1.198 |
| `/btw` | 附带"c to copy"快捷键复制原始 markdown | v2.1.163 |
| `/dataviz` | 图表/仪表盘设计指导 + 可运行调色板验证器 | v2.1.198 |
| `/background` | 后台化会话 | v2.1.199 |
| `/loop` | 循环调度 | v2.1.140 |
| `/goal` | 目标导向 | v2.1.140 |
| `/remote-control` | 远程控制 | v2.1.181 |
| `/desktop` | 桌面模式 | v2.1.198 |
| `/clear` | 清除会话 | 早期 |
| `/compact` | 压缩对话 | 早期 |
| `/code-review [effort]` | 代码审查（原 `/simplify`，支持 effort 等级） | v2.1.146 |
| `/recap` | 会话回顾（v2.1.108 引入，可 `/config` 配置或 `CLAUDE_CODE_ENABLE_AWAY_SUMMARY` 强制） | v2.1.108 |
| `/undo` / `/rewind` | 撤销操作（v2.1.108 `/undo` 作为 `/rewind` 别名） | v2.1.108 |
| `/powerup` | 交互式 Claude Code 功能教程 + 动画演示 | v2.1.90 |
| `/context` | 上下文可视化（按来源分组 skills/agents/commands + token 计数） | v2.0.74 |
| `/terminal-setup` | 终端配置（支持 Kitty/Alacritty/Zed/Warp） | v2.0.74 |
| `/theme` | 主题选择器（`Ctrl+T` 切换语法高亮） | v2.0.73 |
| `/doctor` | 健康检查（可在 Claude 响应时打开） | 早期 |
| `/permissions` | 权限管理 | 早期 |
| `/reload-plugins` | 重载插件（自动安装缺失依赖） | v2.1.116 |
| `/sandbox` | 沙箱模式 | 早期 |
| **自定义命令** | `.claude/commands/*.md`（frontmatter: name/description/allowed-tools/argument-hint） | 早期 |

> **目标技能可附带 `commands/` 目录**，暴露 `/my-skill:spec`、`/my-skill:precheck`、`/my-skill:explore` 等入口。支持 `$ARGUMENTS` 参数 + `@path` 文件引用。支持堆叠调用 `/skill-a /skill-b do XYZ`（最多 5 个）。

## 三、Skills（SKILL.md 自动加载）

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| 描述触发 | `description: "Use when [触发词]"` → AI 自动匹配加载 | 早期 |
| 按需加载 | references/ assets/ scripts/ 只在需要时 Read | 早期 |
| `allowed-tools` | frontmatter 限制技能可用工具 | 早期 |
| `\$` 转义 | 命令体中 `\$` 包含字面 `$`（在数字前） | v2.1.163 |
| `effort` frontmatter | skill/command 的 frontmatter 中 `effort` 覆盖模型努力等级 | v2.1.80 |
| `hooks:` frontmatter | agent 定义中 `hooks:` 在 `--agent` 运行时触发 | v2.1.116 |
| `${CLAUDE_SESSION_ID}` | skill 命令体中替换为当前会话 ID | v2.1.9 |
| `plansDirectory` | 设置项自定义 plan 文件存储位置 | v2.1.9 |
| 条件规则 | `.claude/rules/` 条件规则（符号链接路径可加载） | v2.1.198 |
| 堆叠调用 | `/skill-a /skill-b do XYZ` 加载多个 skill（最多 5） | v2.1.199 |
| slash=skill 合并 | v2.1.3 起合并 slash commands 和 skills（统一心智模型） | v2.1.3 |
| 内置命令可被 Skill 调用 | `/init`/`/review`/`/security-review` 等内置命令可通过 Skill 工具发现调用 | v2.1.108 |
| 内置 Skills | `/dataviz`（图表设计）等内置 skill | v2.1.198 |

## 四、Hooks（生命周期钩子）

| Hook 事件 | 触发时机 | 关键特性 | 来源版本 |
|-----------|---------|---------|---------|
| `SessionStart` | startup/clear/compact | 注入上下文（`hookSpecificOutput.additionalContext`） | 早期 |
| `PreToolUse` | 工具调用前（matcher: `Write\|Edit`/`Bash`/`Read`） | 可阻断/修改工具调用；v2.1.9 起可返回 `additionalContext` 注入模型 | v2.1.9 |
| `PostToolUse` | 工具调用后（matcher: `*`） | 观察工具 I/O | 早期 |
| `Stop` | 会话结束 | v2.1.163 起可返回 `additionalContext` 给 Claude 反馈，保持会话继续 | v2.1.163 |
| `SubagentStop` | 子代理结束 | v2.1.163 起可返回 `additionalContext` | v2.1.163 |
| `SubagentStart` | 子代理启动 | stderr 对用户可见 | v2.1.199 |
| `UserPromptSubmit` | 用户提交 prompt | 语义注入 | 早期 |
| `Notification` | 通知事件 | v2.1.198 起 background agent 完成/需输入时触发（`agent_needs_input`/`agent_completed`） | v2.1.198 |
| `FileChanged` | 文件变更 | 文件监控 | 早期 |
| `PreCompact` | 压缩前 | 压缩前注入 | 早期 |
| `WorktreeCreate` | worktree 创建 | 自定义 VCS 设置 | v2.1.50 |
| `WorktreeRemove` | worktree 移除 | 自定义 VCS 清理 | v2.1.50 |
| `DirectoryAdded` | `/add-dir` 或 SDK `register_repo_root` 注册新工作目录 | 会话中途新增工作目录时触发 | v2.1.219 |
| `Setup` | 安装时 | 版本检查 | 早期 |
| `ConfigChange` | 配置变更 | 符号链接不误触 | v2.1.140 |
| `PreModelSwitch` | 模型切换前 | 可 block/confirm/annotate 模型切换 | v2.1.251 |
| `PostModelSwitch` | 模型切换后 | 切换完成通知/记录 | v2.1.251 |

### Hook 关键特性

- **matcher 精确匹配**：连字符标识符（`code-reviewer`/`mcp__brave-search`）不子串误匹配，用 `mcp__brave-search__.*` 匹配 MCP server 全部工具
- **if 条件**：`if: "Bash(...)"` 条件匹配
- **additionalContext 反馈**：Stop/SubagentStop 可返回反馈让 Claude 继续
- **stderr 可见**：SessionStart/Setup/SubagentStart 的 stderr 对用户可见

> **目标技能应附带 `hooks/hooks.json`**：
> - SessionStart → `bash scripts/state-machine.sh get current-phase` 注入当前阶段
> - PreToolUse(Write|Edit) → `bash scripts/precheck.sh --scope --quiet` 检查写入范围
> - WorktreeCreate/Remove → 自定义 VCS 设置/清理

### Hook Runtime Governance（来源：ECC）

ECC 的 hook 系统有 4 层治理——生成的目标技能的 hooks.json 可参考：

| 层 | 机制 | 说明 |
|----|------|------|
| **Stable hook IDs** | `pre:bash:dispatcher` | 每个 hook 有稳定 ID，重装时 dedupe（不重复注册） |
| **Runtime profiles** | `ECC_HOOK_PROFILE=minimal\|standard\|strict` | 按 profile 启用不同 hook 集合 |
| **Env gating** | `ECC_DISABLED_HOOKS` | 环境变量禁用特定 hook，不编辑文件 |
| **Consolidated dispatchers** | 一个 `PreToolUse(Bash)` 入口 fan-out 到多个检查 | 减少 hook 数量，降低开销 |

**目标技能可参考的 hooks.json 结构：**
```json
{
 "hooks": {
 "PreToolUse": [
 {
 "id": "pre:bash:dispatcher",
 "matcher": "Bash",
 "command": "bash scripts/hook-dispatcher.sh",
 "profile": "standard"
 }
 ]
 },
 "profiles": {
 "minimal": ["pre:bash:dispatcher"],
 "standard": ["pre:bash:dispatcher", "pre:write:gateguard"],
 "strict": ["pre:bash:dispatcher", "pre:write:gateguard", "pre:write:config-protection"]
 }
}
```

### 门禁失败捕获门 fail-gate-hook.sh

生成的目标技能附带 `scripts/fail-gate-hook.sh`（PreToolUse + PostToolUse 双挂）——把 precheck fail 从输出红字变为真拦截：

- **默认关闭**：`precheck.conf` 的 `GATE_ENFORCE_DENY=""`（空）时完全静默，行为与既有逐字节一致
- **白名单驱动**：配置 `GATE_ENFORCE_DENY="security,sensitive"`（或 `all`）后，白名单门禁 fail 会被 PostToolUse 捕获（记 `.swarm-yuan/.gate-fail-flag`），此后 Write/Edit/MultiEdit 被 deny JSON 硬拦截，直到 precheck 重跑通过自动解锁
- **两道保险防误伤**：draft 期（骨架期门禁红是常态）自动关闭；改 `.swarm-yuan/` conf 与 precheck.sh 本身豁免（修门禁配置的通道）
- **与 integrity-guard 的分工**：integrity-guard 管「别作弊」（受保护治理资产 deny 清单），fail-gate 管「别绕过」（门禁 fail 未修复禁继续改文件）——两层 hook 正交
- 开启是 UserChallenge 类决策（须决策落痕）
- **审计双层**：deny 行双写 `gate-deny.jsonl`（旧格式保留），同时每个决策点（门禁红期间的拦截域调用）落 `gate-audit.jsonl` 全量审计行 `{ts,handler,tool,decision,reason,target≤500字符,gates}`——pass 也落行（exempt-path / bash-not-whitelisted），`--report` 据此输出拦截率（deny/决策点）与工具决策分布；休眠态（flag 不存在/工具不在域）不写。fail-open：审计写失败不阻塞主流程

### MCP Health Check（来源：ECC）

ECC 的 `mcp-health-check.js` hook 在 MCP 调用前检查 server 健康：
- 阻断：MCP server 不健康（unreachable / error）
- 放行：MCP server 健康

**目标技能可参考：**
- PreToolUse(mcp__*) hook 中加健康检查
- 防止调用不健康的 MCP server（避免超时/错误）

## 五、Subagent / Background Agents

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| **后台 subagent** | v2.1.198 起 subagent 默认后台运行，Claude 继续工作，完成时通知 | v2.1.198 |
| **并行派发** | 一个响应中多个 Task 调用并行执行 | 早期 |
| **模型选择** | 按任务复杂度选模型（Explore agent 继承主会话模型，上限 opus） | v2.1.198 |
| **文件交接** | 子代理通过文件交接（非粘贴） | 早期 |
| **深度限制** | 前台/后台 subagent 均限制 5 层嵌套 | v2.1.181 |
| **部分结果保留** | rate limit 截断时返回部分结果（不静默失败） | v2.1.199 |
| **错误报告** | API 错误向父代理如实报告（不报为成功） | v2.1.199 |
| **extended thinking 继承** | v2.1.198 起 subagent 和 compaction 继承会话的 extended thinking 配置 | v2.1.198 |
| **isolation: worktree** | agent 定义中声明 `isolation: worktree` 在隔离 git worktree 中运行 | v2.1.50 |
| **`claude agents` CLI** | 列出所有配置的 agent + 会话管理 | v2.1.50 |
| **background agent PR** | v2.1.198 起 background agent 完成代码工作后自动 commit/push/开 draft PR | v2.1.198 |
| **agent teams** | 多代理协作（`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`） | v2.1.50 |
| **idle subagent 折叠** | v2.1.199 空闲 subagent 折叠为可展开摘要行 | v2.1.199 |
| **SendMessage** | 重用名称时消息不误路由 | v2.1.199 |
| **subagent forking** | `subagent_type: "fork"` 继承完整对话 + prompt cache（非空上下文启动）；交互会话中非 teammate agent 默认后台运行 | v2.1.232 |
| **--forward-subagent-text** | flag/env 把 subagent 文本 + thinking 纳入 stream-json 输出（headless 编排用） | v2.1.211 |
| **subagent model 受限警告** | workflow agents/forked skills/slash commands 请求的 subagent model 被限制时警告（父模型顶替） | v2.1.223 |
| **worktree isolation 加固** | `isolation: worktree` subagent 不能对主 checkout 跑破坏性 git 命令；隔离扩展到所有会话类型的文件编辑 + Bash | v2.1.210/222 |

## 六、Settings（`settings.json` / `settings.local.json`）

| 配置 | 描述 | 来源版本 |
|------|------|---------|
| `permissions.allow/deny` | 工具调用预授权/禁止 | 早期 |
| `hooks` | 注册生命周期钩子 | 早期 |
| `env` | 环境变量 | 早期 |
| `model` | 默认模型 | 早期 |
| `defaultMode` | 权限模式（v2.1.200 起默认 `manual`） | v2.1.200 |
| `availableModels` | 模型白名单 | v2.1.175 |
| `enforceAvailableModels` | 模型白名单强制约束 Default | v2.1.175 |
| `requiredMinimumVersion` / `requiredMaximumVersion` | 版本范围限制 | v2.1.163 |
| `sandbox.allowAppleEvents` | macOS sandbox 内允许 Apple Events | v2.1.181 |
| `sandbox.filesystem.disabled` | 跳过文件系统隔离但保留网络出口控制 | v2.1.216 |
| `sandbox.network.strictAllowlist` | 对 sandboxed 命令拒绝非白名单主机（不弹权限提示） | v2.1.219 |
| `mode: "mask"`（凭证文件） | Linux/WSL sandbox 命令读哨兵副本，proxy 出口替换真值（macOS 降级 deny） | v2.1.221 |
| `crossSessionInbound` / `dialogExpiry` | 跨会话消息：bypass 权限会话收到的消息 held 待批；dialog 过期控制 | v2.1.224/232 |
| `disabledMcpServers` / `enabledMcpServers` | MCP server 禁用/启用 | v2.1.200 |
| `disableAllHooks` / `allowManagedHooksOnly` | 禁用全部 hook / 仅允许托管 hook | v2.1.140 |
| `extraKnownMarketplaces` | 额外插件市场 | v2.1.140 |
| `CLAUDE_CODE_SIMPLE` | 极简模式（禁用 MCP/附件/hooks/CLAUDE.md） | v2.1.50 |
| `CLAUDE_CODE_DISABLE_MOUSE_CLICKS` | 禁用鼠标点击/拖拽/悬停（保留滚轮） | v2.1.195 |
| `CLAUDE_CODE_TMPDIR` | 覆盖内部临时文件目录 | v2.1.5 |
| `ENABLE_PROMPT_CACHING_1H` | 启用 1 小时 prompt cache TTL（API key/Bedrock/Vertex/Foundry） | v2.1.108 |
| `FORCE_PROMPT_CACHING_5M` | 强制 5 分钟 TTL | v2.1.108 |
| `plansDirectory` | 自定义 plan 文件存储位置 | v2.1.9 |
| `settings.autoMode.hard_deny` | auto mode 无条件阻断规则 | v2.1.136 |
| `source: 'settings'` | 插件市场来源——在 settings.json 内联声明插件 | v2.1.80 |
| `--channels` | MCP server 主动推送消息到会话（research preview） | v2.1.80 |
| `rate_limits` | statusline 脚本可显示 Claude.ai 速率限制用量 | v2.1.80 |
| `CLAUDE_CLIENT_PRESENCE_FILE` | 在场标记文件（抑制移动推送） | v2.1.181 |

### Settings 优先级
enterprise → `~/.claude/settings.json` → project `.claude/settings.json` → `.claude/settings.local.json`（gitignored）

## 七、MCP（Model Context Protocol）

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| stdio transport | 标准输入输出传输 | 早期 |
| HTTP transport | HTTP 传输 | 早期 |
| OAuth 认证 | MCP OAuth 浏览器认证（v2.1.181 改进 UI） | v2.1.181 |
| `CLAUDE_CODE_SESSION_ID` | stdio MCP server 接收会话 ID（`--resume` 时一致） | v2.1.163 |
| `auto:N` 工具搜索阈值 | MCP 工具搜索自动启用阈值（N=上下文窗口百分比 0-100） | v2.1.9 |
| `--channels` | MCP server 主动推送消息到会话（research preview） | v2.1.80 |
| `add-from-claude-desktop` | 从 Claude Desktop 导入 MCP server（Mac/WSL） | CLI |
| `mcp serve` | Claude Code 自身作为 MCP server 启动 | CLI |
| 分页完整 | `resources/list`/`resources/templates/list`/`prompts/list` 分页服务器不再丢项 | v2.1.146 |
| 工具发现 | tool search 启用时自动发现 MCP 工具 | v2.1.50 |
| `claude mcp get/list` | MCP server 状态检查（tools/list 失败不误报已连接） | v2.1.181 |
| `disabledMcpServers` / `enabledMcpServers` | 按 server 禁用/启用 | v2.1.200 |

## 八、Plugin 系统

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| `.claude-plugin/plugin.json` | 插件元数据（name/version/author） | 早期 |
| `marketplace.json` | 插件市场注册 | 早期 |
| `/plugin list` | 列出已安装插件（`--enabled`/`--disabled`） | v2.1.163 |
| `/plugin enable/disable` | 启用/禁用插件 | 早期 |
| 项目级插件 | `.claude/settings.json` 启用的项目插件 | v2.1.195 |
| worktree 插件 | worktree 中项目插件可加载 | v2.1.198 |
| `${CLAUDE_PLUGIN_ROOT}` | 插件根目录环境变量 | 早期 |
| 默认组件目录 | `commands/`/`skills/`/`hooks/` 等（v2.1.140 起 `plugin.json` 覆盖时警告） | v2.1.140 |
| `archive` plugin source | zip over HTTPS 安装插件（不需 git/npm）+ 可选 SHA-256 pinning | v2.1.224 |
| `command` plugin source | 本地命令（如 IDE）打印插件目录，每会话重解析，`mode: link` 原地用 | v2.1.229 |

### Mods（v2.1.287 起可用；来源：官方文档直查）

mod 不是独立格式，是**插件的子集**：官方定义 "A mod is a plugin whose code registers event handlers"——进程内 JS/TS 事件处理器，无需构建步骤；一个插件可同时打包 mod、skills 与 MCP servers。**无独立 mods.json**（二手转述常见失真）：结构仍是 `.claude-plugin/plugin.json` + `hooks/hooks.json`（其中 `modules: ["./register.js"]` 字段使插件成为 mod）+ `register.js` 导出 `register(on)`。

| 面 | 要点 |
|----|------|
| API | `on(event, [matcher], async ($, e, next) => {})`，`next(e)` 放行；事件含 `tool.call`（可拒绝/改参数）、`tool.check`（返回 allow/ask/deny）、`prompt.submit`（改写提示词）、`turn.start/step/complete`（`turn.step` 可换模型或就地代答）、`session.*`、`command.run`、`skill.prompt`、`ui.render`（按组件 matcher 重绘 UI）、`classic.*`（桥接全部旧 settings hook 事件）、`*` 通配 |
| `$` 引擎命名空间 | `$.ui`（status/toast/panes/tabs）、`$.fs`、`$.process`、`$.http`、`$.model`（complete/fork）、`$.prompt.submit`（**可冒充用户提交提示词**）、`$.session`、`$.store/env/settings/mcp`、`$.command`、`$.tool.register`、`$.agent.list` |
| 权限警示 | 官方明言 **"Mods aren't sandboxed"**：以用户权限读写文件/起进程/发网络请求/读环境变量与 API key/预批 tool call；Sandbox 只隔离 Bash 命令，不隔离 mod 自启进程。装前 `claude plugin validate` 可查 `hooks:`/`calls:` 清单；组织侧 `allowManagedModsOnly` 管控，内置 mod `sec-default` 专防组织策略被用户插件篡改 |
| 版本/生命周期 | v2.1.287 起（CHANGELOG "plugins may now modify deeper behavior"，同版内置 "You should know" mod）；市场安装（`/plugin install`），无 `~/.claude/mods` 目录；开发态 `claude --plugin-dir ./dir` **热重载**（文件变更即重跑 register），已安装 mod 按版本缓存无热重载；`--safe-mode`/`disableAllHooks` 禁用 |
| 官方示例 | anthropics/claude-code-playground `claude-code/mods/`：replay-theater（会话回放）/ blast-radius（改动影响面）/ token-weather（token 消耗可视化）；4 个内置 mod 源码公开（sec-default/diff/telemetry/agents-md） |

**与 settings hooks 的关系**：事件面是进程内超集（`classic.*` 桥接保证旧 hooks 可迁移），且能改参数/换模型/绘 UI——旧 hooks 的外部 shell 命令做不到。目标技能的 fail-gate-hook 形态选型（Step 9）在 2.1.287+ 宿主可评估 mod 形态；`$.prompt.submit` 冒充提交与全权限运行是与 mcp-governance 同类的安全面。跨运行时信号：DSH v0.2.1-alpha.1 已建 Mods 兼容桥（`dsh-engineering-methodology.md` §十三，含权限时序差异陷阱）——Mods API 正成为跨运行时插件事件面的参照标准。

## 九、Worktree Isolation

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| `isolation: worktree` | agent 定义中声明 worktree 隔离 | v2.1.50 |
| `WorktreeCreate`/`WorktreeRemove` hooks | worktree 创建/移除时触发自定义 VCS 逻辑 | v2.1.50 |
| `EnterWorktree`/`ExitWorktree` | 原生 worktree 管理 | 早期 |
| worktree PR 自动化 | background agent 在 worktree 中完成后自动 commit/push/开 PR | v2.1.198 |

## 十、Context Management

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| `/compact` | 压缩对话释放上下文 | 早期 |
| `/clear` | 清除会话 | 早期 |
| SessionStart(compact) | 压缩后重新注入 | 早期 |
| extended thinking 继承 | v2.1.198 起 compaction 继承 extended thinking 配置 | v2.1.198 |
| 内存优化 | v2.1.50 起长会话清理内部缓存 + compaction 后清理大工具结果 | v2.1.50 |
| transcript 清理 | 30 天 transcript 自动清理 | v2.1.181 |

## 十一、Memory（CLAUDE.md / `/remember`）

| 能力 | 描述 |
|------|------|
| CLAUDE.md | 项目根 / `~/.claude/` / 子目录自动加载为持久指令 |
| `/remember` / `#` | 追加到 CLAUDE.md |
| 优先级 | 用户指令 > skills > 默认 |
| `CLAUDE_CODE_SIMPLE` | 禁用 CLAUDE.md 加载 | v2.1.50 |

## 十二、其他能力

| 能力 | 描述 | 来源版本 |
|------|------|---------|
| **voice dictation** | 语音输入（macOS/Linux，支持中文/日文等无空格语言） | v2.1.195 |
| **screen reader** | 屏幕阅读器支持（v2.1.200 改进装饰字符隐藏 + 表格读法） | v2.1.200 |
| **plan mode** | 计划模式（只读） | v2.1.198 |
| **background sessions** | `claude --bg` 后台会话 + `claude agents` 管理 | v2.1.198 |
| **Claude in Chrome** | Chrome 浏览器集成（v2.1.198 GA） | v2.1.198 |
| **Remote Control** | 远程控制 | v2.1.181 |
| **LSP 集成** | 语言服务器协议（v2.1.50 `startupTimeout` 配置） | v2.1.50 |
| **auto-retry** | API 连接中断自动重试（v2.1.181 改进 mid-thinking 重试） | v2.1.181 |
| **prompt caching** | 提示缓存（自定义 base URL 亦生效） | v2.1.181 |
| **sandbox** | 沙箱模式（v2.1.181 `allowAppleEvents`） | v2.1.181 |
| **agent teams** | 多代理协作（实验性，`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`） | v2.1.50 |
| **tool search** | 工具搜索（`ENABLE_TOOL_SEARCH=true`） | v2.1.50 |
| **multi-model routing** | 网关多模型路由（anthropicAws/Foundry 等） | v2.1.198 |

---

## 十三、Dynamic Workflows（动态工作流——Claude Code 最强大的编排能力）

> 来源：https://claude.com/blog/introducing-dynamic-workflows-in-claude-code
> 这是 Claude Code v2.1.x 引入的核心编排能力，**让 Claude 自己写 JavaScript 脚本在后台并行调度数十到数百个 subagent**。

### 核心原理

```
用户描述任务 → Claude 生成 JS 编排脚本 → 后台运行时执行 → 并行扇出 N 个 subagent → 交叉验证/自我纠错 → 汇总结果
```

Claude 根据任务描述自动生成一个 JS 脚本，把大任务拆成多个阶段，分配给不同子代理**并行执行**。代理之间可以互相"挑刺"（adversarial review），结果不一致就重新验证。整个过程在后台运行，会话界面保持响应，支持中途暂停和恢复。

### 它能做到但传统方式做不到的 4 件事

| 能力 | 描述 | 传统方式对比 |
|------|------|-------------|
| **并行扇出（Fan Out）** | 一个任务拆成 10-100+ 个子任务同时跑 | 传统 Task 工具只能手动派几个 subagent |
| **自我验证机制** | 代理互相交叉验证，大幅降低幻觉和错误 | 传统方式靠单次 review，无交叉验证 |
| **可恢复（Resumable）** | 长任务（几小时甚至几天）可暂停后继续 | 传统方式 compaction 后状态丢失 |
| **可复用编排** | 优秀 workflow 可保存成 `/your-command`，下次直接调用 | 传统方式每次重新描述 |

### 三种启动方式

| 方式 | 操作 | 适用场景 |
|------|------|---------|
| **手动触发** | prompt 中含 "workflow" / "use a workflow for this" / "create a workflow" | 最灵活，推荐新手 |
| **`/deep-research`** | `/deep-research [研究问题]` | 自动并行搜索+交叉验证+结构化报告 |
| **`/effort ultracode`** | 开启后每个实质性任务自动规划并执行 workflow + xhigh 推理 | 最强大，token 消耗高 |

### 实时监控与保存复用

| 操作 | 快捷键/命令 | 描述 |
|------|------------|------|
| 打开进度面板 | `/workflows` | 查看阶段/代理数/token 消耗/已用时间 |
| 暂停/恢复 | `p` | 暂停或恢复 workflow |
| 停止 | `x` | 停止选中代理或整个 workflow |
| 重启代理 | `r` | 重启某个代理 |
| **保存为命令** | `s` | **保存当前脚本为可复用 `/saved-workflow-name` 命令** |
| 深入查看 | `Enter` | 查看某代理的 prompt/工具调用/结果 |

### 与 Skills / MCP 的本质区别

| 概念 | 定位 | 类比 |
|------|------|------|
| **Skills** | 教 Claude「怎么做」它已经会的事（SOP 化） | 个人技能 |
| **MCP / Connectors** | 给 Claude 接入外部工具和实时数据 | 工具箱 |
| **Dynamic Workflows** | **协调整个团队**去完成单次对话搞不定的大规模复杂任务 | 团队编排 |

### 目标技能如何使用 Dynamic Workflows

生成目标技能时，须在以下位置集成 Dynamic Workflows：

1. **workflow.md 节点⑤（编码实现）**：复杂变更（>3 文件/跨模块/架构变更）时，AI 优先用 Dynamic Workflow 并行执行：
 - prompt 含 "workflow" 关键词触发
 - 拆分任务 → 并行 subagent → 交叉验证
 - 降级策略：简单变更（≤3 文件）用传统 Task(subagent) 单任务派发

2. **workflow.md 节点⑥（测试审查）**：大规模代码审计/安全扫描用 Dynamic Workflow：
 - 多代理并行扫描不同模块 → 交叉验证发现
 - 降级策略：小范围用 `ocr review` / 手动 5 维度清单

3. **spec 模板**：spec §4 tasks 拆分时，如任务数 >5，标注"建议用 Dynamic Workflow 并行执行"

4. **reference-manual.md**：含"Dynamic Workflows 使用指引"段，记录项目适用的 workflow 场景

5. **保存复用**：项目重复的高价值 workflow（如"全量安全审计""跨模块重构验证"）用 `s` 保存为 `/project-workflow-name` 命令

### 降级策略（不可联网/云端时）

| 能力 | 降级方案 |
|------|---------|
| `/deep-research`（需联网搜索） | 降级为本地代码图谱分析（gitnexus query / graphify explain）+ claude-mem search 历史决策 |
| Dynamic Workflow（需后台运行时） | 降级为 Task(subagent) 手动并行派发 + state-machine.sh 管理阶段 |
| 交叉验证（需多代理） | 降级为 superpowers 两阶段审查（spec 合规 + 代码质量） |
| 可恢复（需后台持久化） | 降级为 state-machine.sh `.swarm-yuan/state.yaml` + progress ledger |
| 保存复用（需 `/workflows` 面板） | 降级为手动将 workflow prompt 保存到 `commands/` 目录为 slash command |

---

## 目标技能集成清单

生成目标技能时，AI 须在以下位置集成 Claude Code 能力：

### 1. SKILL.md frontmatter
```yaml
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebSearch, WebFetch, Task, TodoWrite, AskUserQuestion
```

### 2. hooks/hooks.json
- SessionStart → 注入 state-machine 状态 + 项目最新知识
- PreToolUse(Write|Edit) → precheck --scope 范围检查
- WorktreeCreate/Remove → 自定义 VCS 设置

### 3. commands/ 目录
- `/my-skill:spec` → 复制 spec-template + 注入 codebase 上下文
- `/my-skill:precheck` → 运行 precheck.sh $ARGUMENTS
- `/my-skill:explore` → 用 gitnexus/graphify 探查项目

### 4. settings.local.json 推荐
- `permissions.allow`: `Bash(bash scripts/*)`, `Bash(npm test)`, `Bash(gitnexus *)`, `Bash(graphify *)`, `Bash(ocr *)`
- `permissions.deny`: `Bash(rm -rf upstream/*)`, `Bash(git push --force)`

### 5. .mcp.json 推荐
- gitnexus MCP server（`gitnexus mcp`）
- claude-mem MCP server（`npx claude-mem mcp`）
- graphify MCP server（`python -m graphify.serve graph.json`）

### 6. workflow.md 每节点标注
- Claude Code 能力（Task/Read/Write/Edit/Bash/TodoWrite/AskUserQuestion/WebSearch）
- 运行时工具（gitnexus context/graphify path/ocr review/claude-mem search）

### 7. reference-manual.md 含"Claude Code 能力清单"段
- MCP 工具（gitnexus 17 / graphify 7 / claude-mem 3 / 项目自定义）
- Slash 命令（目标技能自带 + 全局已安装）
- Hooks（目标技能注册 + 全局已安装）
- 权限配置（allow/deny）

### 8. 运行时工具贯穿特征卡和开发过程

| 阶段 | 运行时使用 | Claude Code 能力 |
|------|----------|-----------------|
| 特征卡·稳定单元 | gitnexus `context` + graphify `query` | Read/Grep/Glob |
| 特征卡·领域知识 | gitnexus `query` + claude-mem `search` | Read + WebSearch |
| 开发·需求理解 | claude-mem `search` | AskUserQuestion |
| 开发·设计 spec | gitnexus `impact` | Write + WebSearch |
| 开发·编码 | gitnexus `context` + graphify `path` | Task(subagent) + Read/Write/Edit |
| 开发·测试审查 | ocr `review` + gitnexus `detect_changes` | Bash(npm test) |
| 开发·合入发布 | graphify `prs --triage` | Bash(git merge) |
| 门禁·全链路 | 见 precheck.sh 降级链路 | Bash(precheck.sh) |

---

## 十四、CLI 命令全量（`claude --help`）

> 以下来自 `claude --help` 实际输出，是 releases 中未详述的 CLI 级能力。

### 启动选项

| 选项 | 描述 | 目标技能落点 |
|------|------|-------------|
| `--agent <agent>` | 指定当前会话的 agent | 目标技能可定义自定义 agent |
| `--agents <json>` | JSON 定义自定义 agent | 运行时动态注入 agent |
| `--allowedTools <tools...>` | 允许的工具列表 | 限制目标技能可用工具 |
| `--disallowedTools <tools...>` | 禁止的工具列表 | 禁止危险工具 |
| `--append-system-prompt <prompt>` | 追加系统 prompt | 注入项目特定指令 |
| `--system-prompt <prompt>` | 替换系统 prompt | 完全自定义行为 |
| `--bare` | 极简模式：跳过 hooks/LSP/plugin/CLAUDE.md/auto-memory | 纯净环境排查 |
| `--bg` / `--background` | 后台启动会话 | 长任务后台运行 |
| `--brief` | 启用 SendUserMessage 工具（agent→用户通信） | subagent 向用户汇报 |
| `--chrome` / `--no-chrome` | Claude in Chrome 集成开关 | 浏览器集成 |
| `--effort <level>` | 努力等级（low/medium/high/xhigh/max） | 按任务复杂度调整 |
| `--fallback-model <model>` | 主模型过载时降级模型 | 可靠性保障 |
| `--fork-session` | 恢复时创建新 session ID | 分叉实验 |
| `--from-pr [value]` | 从 PR 恢复会话 | PR 关联会话 |
| `--include-hook-events` | 输出流包含 hook 生命周期事件 | 调试 hooks |
| `--include-partial-messages` | 包含部分消息块 | 实时流式 |
| `--input-format <format>` | 输入格式（text/stream-json） | 管道集成 |
| `--json-schema <schema>` | 结构化输出 JSON Schema 校验 | 确保输出格式 |
| `--max-budget-usd <amount>` | API 花费上限 | 成本控制 |
| `--mcp-config <configs...>` | 从 JSON 文件/字符串加载 MCP server | 运行时 MCP 注入 |
| `--model <model>` | 指定模型（别名如 fable/opus/sonnet 或全名） | 模型选择 |
| `--name <name>` | 会话显示名称 | 会话管理 |
| `--output-format <format>` | 输出格式（text/json/stream-json） | 管道集成 |
| `--permission-mode <mode>` | 权限模式（acceptEdits/auto/bypassPermissions/default/dontAsk/plan） | 自动化场景 |
| `--plugin-dir <path>` | 从目录/zip 加载插件 | 临时插件测试 |
| `--plugin-url <url>` | 从 URL 获取插件 zip | 远程插件 |
| `--safe-mode` | 禁用所有自定义（CLAUDE.md/skills/plugins/hooks/MCP/commands/agents） | 排查 |
| `--setting-sources <sources>` | 设置来源（user/project/local） | 配置控制 |
| `--settings <file-or-json>` | 额外设置文件/JSON | 运行时配置注入 |
| `--strict-mcp-config` | 仅用 --mcp-config 的 MCP server | MCP 严格模式 |
| `--tools <tools...>` | 指定内置工具列表 | 工具粒度控制 |
| `--worktree [name]` | 创建 git worktree | 隔离工作空间 |
| `--tmux` | 为 worktree 创建 tmux 会话 | 终端复用 |
| `--add-dir <dirs...>` | 额外允许工具访问的目录 | 跨目录访问 |

### 子命令

| 命令 | 描述 | 目标技能落点 |
|------|------|-------------|
| `claude agents` | 管理后台 agent（`--json` 输出、`--model`/`--effort`/`--permission-mode` 设置） | 多 agent 编排 |
| `claude auth` | 管理认证 | — |
| `claude auto-mode` | 查看 auto mode 分类器配置 | — |
| `claude doctor` | 检查 auto-updater 健康 | 安装排查 |
| `claude gateway` | 运行企业认证/遥测网关 | 企业部署 |
| `claude install [target]` | 安装原生构建（stable/latest/版本号） | 版本管理 |
| `claude mcp` | 配置管理 MCP server | MCP 生命周期 |
| `claude plugin` | 管理插件 | 插件生命周期 |
| `claude project` | 管理项目状态 | 项目状态清理 |
| `claude setup-token` | 设置长期认证 token | 订阅认证 |
| `claude ultrareview [target]` | 云端多 agent 代码审查（当前分支/PR 号/基线分支） | **高级审查能力** |
| `claude update` | 检查+安装更新 | 版本升级 |

### `claude mcp` 子命令

| 子命令 | 描述 | 目标技能落点 |
|--------|------|-------------|
| `mcp add <name> <cmd> [args]` | 添加 MCP server（`--transport http/stdio`、`-e ENV=val`、`--header`） | 注册 gitnexus/graphify/claude-mem |
| `mcp add-from-claude-desktop` | 从 Claude Desktop 导入 MCP server | 迁移 |
| `mcp add-json <name> <json>` | JSON 字符串添加 MCP server | 脚本化注册 |
| `mcp get <name>` | 查看 MCP server 详情（含 pending approval 状态） | 排查 |
| `mcp list` | 列出 MCP server（含健康检查） | 审计 |
| `mcp login <name>` | MCP server OAuth 认证 | 认证 |
| `mcp logout <name>` | 清除 OAuth 凭证 | 清理 |
| `mcp remove <name>` | 移除 MCP server | 清理 |
| `mcp reset-project-choices` | 重置项目级 MCP server 审批 | 重新审批 |
| `mcp serve` | 启动 Claude Code 自身作为 MCP server | **Claude Code 自身可被其他工具调用** |

### `claude plugin` 子命令

| 子命令 | 描述 | 目标技能落点 |
|--------|------|-------------|
| `plugin init\|new <name>` | 脚手架新插件到 `~/.claude/skills/<name>/` | **创建目标技能插件** |
| `plugin install <plugin>` | 从市场安装插件 | 安装依赖技能 |
| `plugin list` | 列出已安装插件（`--enabled`/`--disabled`） | 审计 |
| `plugin enable\|disable` | 启用/禁用插件 | 管理 |
| `plugin details <name>` | 查看插件组件清单 + 预估 token 成本 | **评估插件开销** |
| `plugin eval [target]` | 对插件运行 eval 测试 | **插件质量验证** |
| `plugin tag [path]` | 创建插件发布 git tag | 发布 |
| `plugin uninstall <plugin>` | 卸载插件 | 清理 |
| `plugin update <plugin>` | 更新插件到最新版 | 升级 |
| `plugin validate <path>` | 验证插件/市场清单 | 发布前检查 |
| `plugin prune` | 移除不再需要的自动安装依赖 | 清理 |
| `plugin marketplace` | 管理插件市场 | 市场管理 |

### `claude agents` 选项

| 选项 | 描述 | 目标技能落点 |
|------|------|-------------|
| `--json` | 输出 JSON 数组（含 `--all` 含已完成会话） | 脚本化 agent 管理 |
| `--agent <agent>` | 默认 agent | 指定编排 agent |
| `--model <model>` | 默认模型 | 模型选择 |
| `--effort <level>` | 默认努力等级 | 按需调整 |
| `--permission-mode <mode>` | 默认权限模式 | 自动化 |
| `--cwd <path>` | 按目录过滤会话 | 项目隔离 |
| `--add-dir <dir>` | 额外目录访问 | 跨目录 |
| `--mcp-config <config>` | MCP 配置 | agent 专属 MCP |
| `--settings <file>` | 设置文件 | agent 专属配置 |
| `--plugin-dir <path>` | 插件目录 | agent 专属插件 |

### `claude ultrareview` — 云端多 agent 审查

| 能力 | 描述 | 目标技能落点 |
|------|------|-------------|
| 云端多 agent 审查 | 审查当前分支/PR 号/基线分支 | **`--review` 门禁的增强版** |
| `--json` | 输出原始 bugs.json | 结构化审查结果 |
| `--timeout <minutes>` | 最大等待时间（默认 30 分钟） | 长审查控制 |

> **目标技能的 `--review` 门禁可在 ultrareview 可用时调用它**：`claude ultrareview --json` 获取云端多 agent 审查结果，比本地 ocr review 更全面。

### `claude project purge` — 项目状态清理

| 能力 | 描述 | 目标技能落点 |
|------|------|-------------|
| 清理项目状态 | 删除 transcript/tasks/file history/config entry | 卸载目标技能时清理 |

---

## 十五、目标技能可用的全部能力速查（按开发阶段）

| 阶段 | Claude Code 原生 | CLI 命令 | 运行时工具 | MCP 工具 |
|------|-----------------|---------|-----------|---------|
| **探查** | Read/Glob/Grep/WebSearch | `claude mcp list`（查 MCP） | gitnexus analyze / graphify . | gitnexus query/context |
| **特征卡** | Read/Write | — | gitnexus context / graphify explain / claude-mem search | gitnexus context |
| **spec 设计** | Write/WebSearch/AskUserQuestion | — | gitnexus impact / ocr scan | gitnexus impact |
| **编码** | Task(subagent)/Read/Write/Edit/Bash | — | gitnexus context / graphify path | gitnexus context |
| **审查** | Bash/Read | `claude ultrareview` | ocr review / ocr scan | — |
| **测试** | Bash | — | gitnexus detect_changes | — |
| **门禁** | Bash | — | 见 precheck.sh 降级链路 | — |
| **发布** | Bash | `claude agents`（后台 PR） | graphify prs --triage | — |
| **记忆** | Write/Read | — | claude-mem search/timeline/get_observations | claude-mem search |
| **状态管理** | Bash/Read/Write | — | state-machine.sh init/get/set/transition | — |
| **调用追踪（贯穿全程）** | 每步 stdout 公告 `→ [节点X] 调用 …` | — | trace-log.sh --node/--actor/--tool（落盘 `.swarm-yuan/trace.jsonl`） | — |
| **插件管理** | — | `claude plugin init/list/eval` | — | — |
| **MCP 管理** | — | `claude mcp add/list/get/serve` | — | — |

---

## 版本基线

能力清单以 npm `latest` 基线版本为准核验（当前 2.1.294）。供应链登记（许可证 / 版本 / drift 状态）见仓库 `docs/upstream-baseline.md`（仓库档案，不随技能分发）。逐版能力变化如下各节。

## v2.1.233-237 能力

- **Todo/Task 工具默认移除**（v2.1.233，破坏性）：进度跟踪走自有 trace-log.sh。`notify_when_idle` 空闲通知原语（v2.1.236，多会话场景）；"Concise" 风格（v2.1.237）；`claude-api` 上下文 200k→25k（v2.1.234，按需加载）。沙箱硬化（通配符 read-deny 防重命名绕过/密钥 `${VAR}` 化）。env：`ANTHROPIC_DEFAULT_MODEL`/`CLAUDE_CODE_TOOL_MEMORY_LIMIT` 等。

## v2.1.238-252 能力

- **`--restricted` 锁定模式**（v2.1.248）：**restricted 会话=门禁失能会话**（全链依赖 Bash），交付断言不可作数。
- **PreModelSwitch/PostModelSwitch hooks**（v2.1.251）：模型切换成为可治理点（adaptive-gating 可挂点）；Workflow prompt 外置 5.7k→1k（外置为 skill）。
- **子代理韧性/缓存**（v2.1.243-251）：maxTurns 撞限标记 **partial**；`cacheTtl`/`promptCacheTtl`/`subagentPromptCacheTtl`。
- **沙箱/权限硬化**（v2.1.246-252）：symlink TOCTOU、输出防重定向、`env` 禁设 `CLAUDE_CONFIG_DIR`/`TMPDIR`——模板保持最保守形态；hooks 非法 JSON→显式 error。

## v2.1.253-261 能力

- **无头执法档 `--permission-prompts none`**（v2.1.259）：与 Codex 的 exit-2-deny 在 Claude Code 与 Codex 两类宿主上互为对照；无人值守时 prompt 档坍缩为 deny（allow/prompt/forbid 三值边界）。
- **宿主 deny 语义版本间不稳定，不得为执法主体**（v2.1.259-260）：Read deny 不作用于 Bash 参数（v2.1.259 一度应用、v2.1.260 移除）；与 Guardian 条件性跳过一致。
- **`/skill-doctor`**（v2.1.261）：未使用技能的上下文成本审计（门禁预算的宿主侧证据源）；`--append-subagent-system-prompt-file` + 输出预算 `bashOutputMaxChars`（上下文外置）。
- **治理**（v2.1.257-260）：`CLAUDE_CODE_SUBAGENT_MODEL_FORCE` / `blockReadsOutsideWorkingDirectories` / Containment Escape / Workflow schema 前置校验（与 gate-report 一致）。

## v2.1.265-266 能力

- **`--plugin-dir` 目录化加载**（v2.1.265）：插件目录的子目录各自加载、运行中热增删——技能分发粒度为「目录树 + 热装载」。
- **工具结果 1 GB 落盘上限**（v2.1.265）：超限截断且预览显式标注（与 `bashOutputMaxChars`/dsh quota 同类设计）。
- **prompt-cache 稳定性修复**（v2.1.265）：resume/teammates 不再改子代理工具表与提示前缀——**缓存稳定性成为编排不变量：编排层不得重排提示前缀**。
- **中断工具调用恢复诚实性**（v2.1.265）：死于工具运行中，resume 保留中断调用并标记 interrupted——partial（部分结果）保留为证据态。
- **不可信内容标记**（v2.1.265）：Artifact 读他人产物时按 untrusted 标记内嵌指令。
- **`CLAUDE_CODE_USE_GATEWAY` 语义漂移回滚**（v2.1.265-266）：v2.1.265 语义漂移致网关配置报错，v2.1.266 回滚——**宿主行为细节版本间不保证稳定**。

## v2.1.267 能力

- **`maxEffortLevel` 设置**（v2.1.267）：top-level 或 per-model `modelSettings` 封顶 effort、低档仍可选——**effort 治理进宿主原生配置**，与 PreModelSwitch hooks（v2.1.251）、`CLAUDE_CODE_SUBAGENT_MODEL_FORCE`（v2.1.257）同类设计；是 adaptive-gating 分档的宿主侧原语。
- **prompt-cache 工具动态性修复**（v2.1.267，约 12 项修复）：MCP 重连不重写工具表、新 MCP 工具以 deferred definitions 到达（无 ToolSearch 会话）、resume 重放录制的工具描述而非重渲染、forked worker 不再注入 EnterWorktree、`-p` 会话 resume 不破缓存——**缓存稳定性编排不变量**（v2.1.265 提示前缀、v2.1.267 工具集动态均适用）。工具面动态变更与缓存稳定的冲突由宿主 deferred/replay 机制消解，生成技能无需自防御。
- **managed allow-list 不可读 → deny-all**（v2.1.267）：`allowedHttpHookUrls`/`httpHookAllowedEnvVars`/`allowedChannelPlugins` 读取失败时拒绝一切（不再默认 allow-all）——fail-closed：连 managed 配置的缺省语义也按最坏情况设计。
- `--system-prompt-snapshot off`（v2.1.267）：每请求重渲染系统提示（默认快照=缓存友好）——快照与新鲜度成为显式权衡开关。
- Workflow `agent()` 大 schema 改安全检查而非拒绝（v2.1.267）；5 MB+ 大会话 resume 丟并行工具调用修复（v2.1.267）。

## v2.1.268 能力

- **符号链接目录 deny/ask 规则真实路径绕过修复**（v2.1.268）：macOS `/etc` `/tmp` `/var`、Linux `/bin` 等符号链接拼写目录上的规则，以 realpath 给出路径时失效；Bash 对写在符号链接拼写上的 deny 规则同样忽略——**路径检查必须在规范化空间双向比对**（权限路径语义）。目标技能对照：check_scope 按字面前缀匹配；符号链接别名是已登记边界（单机生成场景低暴露，不升门禁）。
- **同行不可分析命令 deny 失效修复**（v2.1.268）：`env -C`/`eval` 等检查器无法分析的命令与 deny 规则同行时规则被跳过（v2.1.268 修复，不可分析命令按最坏情况处理）；v2.1.273 起定为**不可分析命令走 ask**（人工确认），不按 deny（deny 误伤 `time -p make build` 等合法形态），fail-closed（deny-all）保留给无交互兜底场景（managed 配置不可读）。
- **WebFetch 300 秒宿主死线**（v2.1.268）：服务端不结束的响应挂死改为 300s 后失败，`CLAUDE_CODE_WEBFETCH_DEADLINE_MS` 可覆盖（0 关闭）——联网验证类工具的死线成为宿主默认，生成技能**无须自设超时兜底**。
- **机密不落展示面**（v2.1.268）：plugin/marketplace git 源 URL 中的 token/password、MCP 配置 `${VAR}` 解析值不再出现在错误与列表输出——与符号链接修复同为安全硬化重点。
- 其余修复（v2.1.268）：第三方兼容端点 Artifact regex 400（v2.1.265 引入的回归）、长空闲会话 CPU busy-loop、SDK `excludeDynamicSections` 缓存中途破断（缓存稳定性）、respawned teammate 拾取未信任目录同名 agent 文件（信任边界）、compact `$` 序列与 resume 顺序稳定性；网关定价透传、`gatewayInternalNetworks`、self-hosted-runner `--remove-session-state`、plugin `--json`（与单机生成场景无交集）。

## v2.1.269 能力

- **`claude plugin eval`**（v2.1.269）：跑插件评估套件，评分 + 可复现 JSON/HTML 报告——**评估可复现**：能力声明须有可复现评估载体（与判别器断言「旧实现必挂」一致）。
- **`Bash(tee:*)` 绕过写路径检查修复**（v2.1.269）：无害外观工具被用作写通道即可旁路写路径检查——**权限检查通道完备性**：检查挂在「命令外观」而非「效果语义」即可被中间工具旁路（与 v2.1.268 符号链接修复同类设计）。`!` 前缀规则过应用修复（规则作用域收窄）。目标技能对照：scope 门按字面前缀匹配是已登记边界，维持。
- **`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`（1-256）**（v2.1.269）：并发代理数上限进宿主 env——**并发有界**（与死线类设计一致）。
- **attribution 不覆写 CLAUDE.md**（v2.1.269）：归因规则不得凌驾项目显式指令——配置优先级契约。
- **CJK 无空格语言建议丢失修复**（v2.1.269，中/日/泰）：分词空格假设修复（与 claude-mem CJK substring 检索一致）。
- 其余（v2.1.269）：kitty/st/rxvt/WezTerm 终端键处理、prompt-cache 部分失效、`/btw` 捏造工具调用修复、gateway model discovery 超时 env、synced skills 改名 `anthropic-skills:<name>`（命名空间隔离）。

## v2.1.270 能力

- **只读 git 命令误要权限修复**（v2.1.270，修复 v2.1.269 引入的回归）：长会话中 read-only git 命令意外触发权限询问——v2.1.269 的写路径检查收紧（tee 旁路修复）误伤了只读路径的免询问。**权限通道变更须带回归面**：同域收紧须成对验证「堵住旁路」与「不误伤正路」，二者缺一即为回归源。与「宿主行为版本间不保证稳定」一致——**修复轮自身即回归源**（graphify 0.9.60→0.9.61 连环修复，Python 3.12/3.13 断裂，同类）。

## v2.1.271-273 能力

- **不可分析命令走 ask**（v2.1.273）：`eval`/`env -C` 等无法静态分析的命令按人工确认（ask）处理，不按 deny（deny 误伤 `time -p make build` 等合法形态）；fail-closed（deny-all）保留给无交互兜底（managed 配置不可读）。
- **每命令 allowed_domains 网络出口白名单 + --accept-command 哈希钉定 + omitClaudeMd 子代理上下文卫生 + managed-mcp 保留独占 fail-closed + Bash 权限检查修复**（v2.1.271）：权限通道完备性——出口按命令粒度白名单是「作用域最小化」从文件面到网络面的延伸。
- **网关提示头**（v2.1.273）：`x-claude-code-request-class`/`agent-type`/`prev-tool-durations`/`compaction`/`context-compacted` 请求头（`CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` opt-in）——上下文经济状态向 LLM 网关显式化。
- **MCP 断连放弃通知指向 /mcp**（v2.1.273）：自动重连放弃成为显式可观测事件——降级可见性设计（与 MCP 降级信号/DegradationLadder 一致）。
- **上下文计量与自动压缩双倍计数修复**（v2.1.273）：advisor 工具轮按约两倍真实上下文计重、自动压缩在约半窗口误触发——**度量精度即行为触发器**：计量偏差直接改变压缩行为（与 ruflo v3.42.1 token savings 基线修正同类）。
- 其余修复（v2.1.271-273）：remote-control 会话分叉为后台会话、`blockReadsOutsideWorkingDirectories` 下记忆目录隔离、子代理缺 token-usage 结果投递修复、定时任务会话绑定、SDK 后台化消息完整性。

## v2.1.274 能力

- **损坏 transcript 自愈替代无界重试**（v2.1.274）：会话卡死在 "unexpected tool_use_id" 400 无限重试——能自愈则自愈，否则明确错误 + `/rewind` 指引终止循环——「**无界重试 → 有界 + 明确错误**」（重试是等待的另一种形态，等待必须有界）。
- **MCP 启动等待有界化**（v2.1.274）：`CLAUDE_CODE_MCP_STARTUP_WAIT_MS`（0 = 不等）——首个非交互 turn 对 MCP 连接的等待成为显式预算；**Streamable HTTP 按 server timeout 生效**（~5 分钟硬顶修复）——死线语义以配置为准。
- **/goal 稳定性两项修复**（v2.1.274）：compact 后 resume 不丢活动 goal + hook-driven goal 上下文再溢出改 compact 而非报错——goal_id/closure 闭环的宿主侧补强（goal 是长跑承诺，compaction 不得吞承诺）。
- **错误语义诚实化两例**（v2.1.274）：403 insufficient_scope 不再谎报为过期登录（指向 /mcp 重认证）；`claude agents` 自动更新重启不再丢 CLI flags。
- **恢复原子性**（v2.1.274）：resume 的后台代理不再保留被中断 tool batch 的一半——半态不是可运行态。
- **输出经济学**（v2.1.274）：Stop hook 重复 block 以 500 字符条件标签替代全量重发。
- **供应链细节**（v2.1.274）：无自身 git 仓的 plugin/marketplace 目录不再误取外层 git 仓版本——版本归属。
- 目标技能对照：gates-strict/precheck 无无限循环重试点位，无门禁增量；「无界重试→有界」供生成技能的死线设计参照。

## v2.1.275-276 能力

- **claude.ai 技能/插件同步进终端会话**（`syncClaudeAiSkills/Plugins: false` 可关，v2.1.275-276）——技能启用态单一事实源：云端与终端不维护两份启用态。
- **排队消息 send-now 语义**（v2.1.275-276）：ctrl+enter 打断当前轮并立即冲刷全部排队消息；已发送与排队中在模型接收前以灰色区分——排队是可撤回的暂存态，冲刷是显式动作。
- **静默失效可观测**（v2.1.275-276）：otelHeadersHelper 配置失败启动即告警（静默零遥测导出已修）——导不出≠导出了。
- **缓存稳定性**（v2.1.275-276）：resume/compaction 后 memory 文件 age 注记漂移致 prompt cache miss 已修——缓存前缀内不得有时间性易变文案。
- **子代理消息传播完整性**（v2.1.275-276）：`--forward-subagent-text` 对 context: fork 技能及其嵌套 fork 丢消息已修——与 codex 0.155「fork 会话 hook 可区分」同类：派生会话的消息归属与传播是一等语义。
- **机密脱敏**（v2.1.275-276）：plugin/marketplace 消息、日志与 list 输出不再回显 git/ssh/marketplace URL 内嵌的密码与 token。
- **损坏 transcript 容错**（v2.1.275-276）：resume/选择器预览/后台代理/转录视图对 malformed 条目容错，损坏不再炸全会话。
- **有界设计两例**（v2.1.275-276）：Read 大文件解码失败报错而非挂死；Grep/Glob/@建议 20MB 输出上限。
- **沙箱退出码语义**（v2.1.275-276）：Linux 沙箱 zsh 下失败命令误报 exit 0 已修——退出码是门禁的输入，语义不许漂。
- **自定义网关每请求 400 回归**（v2.1.275 引入，v2.1.276 修复）：修复轮自身即回归源（与 v2.1.270 同类）——权限/网关变更须带回归面。

## v2.1.277-278 能力

- **AGENTS.md 进宿主**（v2.1.277）：无 CLAUDE.md 的项目改读 AGENTS.md（/config Project instructions 可切；Bedrock/Vertex/Foundry 暂缺）——项目指令文件向 codex 惯例收敛，多宿主部署的指令面可单一事实源。
- **子代理输出防伪**（v2.1.277）：子代理结果以 header 标记为 subagent output 并缩进——子代理文本不得冒充会话自身指令（prompt injection 防线）；workflow 脚本计算的 agent() prompt 以 script-authored 框架呈现给安全分类器（Bedrock/Vertex/Foundry）。
- **TaskOutput 工具移除**（v2.1.277-278）：deprecated 工具删除，后台任务输出改 Read 输出文件；taskOutputMaxChars/TASK_MAX_OUTPUT_LENGTH 失效——淘汰即移除，不留长期并存面。
- **诚实错误三例**（v2.1.277-278）：Grep/Glob 资源耗尽（进程/内存/句柄）报错而非「无匹配」——「没找到」≠「没能力找」；claude -p/SDK 内部错误报错 exit 1 而非无果挂死；Write 目标为已存在目录报清晰错误（此前静默按 declined permission 收场）。
- **沙箱豁免复合命令全匹配**（v2.1.277）：sandbox.excludedCommands 部分匹配不再豁免整条复合命令——豁免判定 fail-closed（与 v2.1.268 realpath 同类）。
- **auto mode 服务端分类器默认**（v2.1.278）：API/Enterprise/Bedrock/Vertex/Foundry/gateway 默认 server-side classifier（不收分类器开销费，CLAUDE_CODE_AUTO_MODE_SERVER=0 退出）+ /status 增 Auto mode server 行——effort 治理的成本面收敛（与 maxEffortLevel 同类）。
- **网关面两例**（v2.1.277-278）：CLAUDE_GATEWAY_PROXY_IS_EGRESS_BOUNDARY（出口域名交代理解析，本机不解析）+ gateway upstream 静态 headers map。
- 其余修复（v2.1.277-278）：`~/.claude.json` 各字段 malformed state 容错、plugin 稳定性修复、PDF Windows 长路径、VSCode 面更新。

## v2.1.279-280 能力

- **Claude Opus 5.5（`claude-opus-5-5`）成默认 Opus**（v2.1.279-280）：1M 上下文，$4/$20 per Mtok，缓存读 $0.20——顶档模型的上下文与价格坐标（adaptive-gating 分档事实源；effort/能力档判定以模型目录为准，不硬编码）。
- **符号链接写路径按真实落点判权限**（v2.1.279-280）：经 symlinked path 的写入按实际落点判读，prompt 明示落点；`acceptEdits`/allow 规则/auto mode 不再批准落在树外的写入——**权限路径语义**：v2.1.268「规范化空间比对」从读路径延到写路径。目标技能权限面（settings 模板）结论不变：deny 规则按规范化路径书写。
- **auto mode 重试治理两项**（v2.1.279-280）：安全检查拒绝评审的动作**一次拒绝并明示重试无用**（不再反复重试同一动作）；安全检查无应答时**退避重试，连拒十次终止本轮**——「无界重试→有界+明确错误」（与 v2.1.274 损坏 transcript 自愈替代无界重试同类）。
- Write 工具参数宽容化（v2.1.279-280）：模型发 `path`/`file_text`/`file_content`/杂散 `description` 时映射到 `file_path`/`content` 而非校验失败——输入宽容化（与 codex-security「产出收敛」互为对照的输入侧）。
- `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`（v2.1.279-280）：MCP 描述 2048 字符上限可调；hook 输出尺寸入 otel 事件——配置与可观测面。
- 其余修复（v2.1.279-280）：TUI 对话框交互批、skills/.trash 误移、插件 commit 追踪。

## v2.1.281-282 能力

> 证据分级：v2.1.281-282 为 patch 版本（npm 实测 2.1.282）；闭源二进制，**仅发布说明级证据，内部实现未验证**。

- **权限堵旁路**（v2.1.281-282）：命令替换里的递归 `rm` 不再绕过 Bash 允许规则、强制提示；NUL 字节规则误展开为通配已修；**managed 布尔锁键打错值不再被忽略**、嵌套非法值使整块失效；`allowed-tools` 自我预授权被封堵——**坏配置宁可停机报错，不静默按宽松缺省运行**。
- **等待与重试有界化**（v2.1.281-282）：危险 `rm` 提示 2 分钟后自动 deny；无限重试无视 `--max-turns` 已修；compaction 摘要被拒转 fallback 模型；磁盘配额错误不再伪装「Exit code 1」。
- **静默失效可观测**（v2.1.281-282）：启动与 `/status`/`claude doctor` **显式列出被忽略的遥测变量**。

## v2.1.283 能力

- **模型治理三原语**（v2.1.283）：`availableModelsMatch: "exact"`（白名单精确匹配，新型号默认封锁直到显式列出）+ `deniedModels`（独立黑名单，白名单允许也可拒）→ 管理面为「允许语义 + 拒绝清单」双层。
- **`/doctor prompt-audit`**（v2.1.283）：审计 CLAUDE.md/skills/agents/commands 中「为旧模型写的提示模式」→ 提示资产纳入版本健康检查（提示语也有过时一说）。
- **网关归因头**（v2.1.283）：`x-claude-code-prompt-id`（`CLAUDE_CODE_GATEWAY_HINT_HEADERS=1`）让网关按用户 prompt 分组请求→多代理共享网关的计费/归因面。
- **OTel `tool.output` span**（v2.1.283，`OTEL_LOG_TOOL_CONTENT=1`）：MCP/WebFetch/WebSearch 产出进遥测——可观测与内容审计的边界（对照 codex「遥测最小化」：开的是通道，边界由 env 把守）。
- **插件校验硬化**（v2.1.283）：validate 拒绝不可安装名/逃逸路径；`installed_plugins.json` 坏记录不再静默丢档（点名 + 恢复路径）→ 生态资产的可恢复性纪律。

## v2.1.284-285 能力

- **fork 子代理权限模式继承封闭**（v2.1.284-285）：fork 子代理运行在父会话权限模式下且**不能退出 plan mode**（会话 plan/dontAsk 模式随 fork 继承）——「委托不提权」：子代理的权限边界继承自会话，无权自行升格。目标技能对照：`references/subagent-orchestration.md` 分派规范——分派产生的子任务权限边界应显式声明继承来源，不留自行提权口子。
- **managed settings 分级 fail-open**（v2.1.284-285）：OS 拒读 managed settings 文件时**warn-and-start**（无策略启动），其余读错误与不可解析文件才全停——治理面按「权限性拒绝降级 / 内容性损坏停止」分级，一刀切 fail-closed 会把权限配置问题放大成不可用。目标技能对照：降级载体「未装不阻塞」同类设计——降级与致命的边界按失败原因分级，不是按失败发生。
- **安装面 id 归一化混淆拒绝**（v2.1.284-285）：`plugin install` 对仅差 `.`/`-`/`@`/大小写（macOS/Windows）的 id 拒绝装入他者缓存目录——身份比较先归一化，混淆 id 视为不同实体处置。目标技能对照：技能名/框架 id 的匹配边界（`_fw_<id>_check` 分发键的精确匹配是既有防线）。
- **沙箱 auto-allow 误报修复**（v2.1.284-285）：内联脚本（`python3 -c`/`node -e`）含 `=` 即逐次询问的误报修复——保守判定的误报也要修（门禁误报训练用户橡皮图章，与漏报同罪）。
- 其余能力与修复（v2.1.284-285，约 30 项）：`CLAUDE_CODE_DISABLE_WEB_FETCH` 工具开关、`claude --desktop`、`plugin configure`/`--config` 安装时配置、`allowedProviders` 供应商白名单、URL 密码脱敏、MCP 名称注入终端转义序列清洗、`-p` 后台子代理权限请求直达 prompt tool 等。

## v2.1.285-286 能力

- **同档回退重试**（v2.1.285-286）：默认模型/别名解析被 API 拒绝（400）时，按**上一模型同档**重试一次——降级阶梯保档位，不是跨档乱降。目标技能对照：降级链设计（模型/工具双通道）——降级目标按档位对齐而非就近可得，保住能力下界。
- **关停排队不丢**（v2.1.285-286）：Claude Code 退出中到达的 Remote Control 消息不再被误标已送达，保持排队待下次运行应答——**关停窗口内的消息不得丢也不得假确认**。目标技能对照：trace-log/事件账本的退出路径——冲刷窗口内的事件落盘语义（fs.watch 尾随冲刷修复同类）。
- **凭证脱敏边界**（v2.1.285-286）：键名含不可见字符（零宽空格）的 secret、URL 密码含 `)`/引号/`]`/`&`/第二个 `@`/`[::1]` 括号主机、百分号编码 Bearer 的部分掩蔽——脱敏实现必须对抗**边界形态**（不可见字符/编码/标点闭合），朴素正则会漏。目标技能对照：memory-writeback/trace-log 落盘前的脱敏同类核对。
- **权限队列计数**（v2.1.285-286）：权限请求堆叠时提示加 "2 of 5" 计数——排队中的请求给位置感。目标技能对照：审批队列/门禁打回堆积时的用户面（可见的队列位置优于不可见的黑盒等待）。
- 其余修复（v2.1.285-286，约 15 项）：云会话大历史容器加载中停止致永不唤醒、apps gateway 缓存写 1h/5min 计价纠偏、MCP 握手降级后工具列表陈旧一天、`/feedback` zip 内 transcript redaction 后 JSON 行损坏、Remote Control 策略关闭即断连等。

## v2.1.286-287 能力

- **安全闸回归锁**（v2.1.286-287）：危险 `rm` 命令失去 always-ask 保护（v2.1.286-287 修复）——防护语义会被后续改动静默卸除。目标技能对照：规则闸（rules.d deny 类）与审批闸每个 deny/ask 语义至少一条 Mutation Check（变异测试）防复发断言在位；演化触碰命令分类面时先跑闸的负例。
- **恢复路径幂等**（v2.1.286-287）：恢复会话后 CLAUDE.md 重复附加（v2.1.286-287 修复）——恢复/前情注入必须是幂等重放，重放 N 次与一次等价。目标技能对照：前情注入重启、memory-writeback 恢复面的幂等性核对（追加前查重/以清单驱动而非裸 append）。
- **有界重试与钩子自激抑制**（v2.1.286-287）：Remote Control 重连 30 秒上限后放弃；asyncRewake 钩子反复唤醒修复——重试与钩子都要有上界与防自激，与「活性等待有界」判据一致。
- 其余能力（v2.1.286-287）：Claude Mods 深层行为修改插件、agents 视图 `n:` 过滤、OTel prompt_text 字段（遥测加正文=隐私面扩大，反向警示）、alwaysLoad:false MCP 工具延后至工具搜索、Windows Bash/PowerShell 双拒警告、自托管 runner 内置 gh api（仅 REST）等。

## v2.1.287-288 能力

- **中断恢复续跑**（v2.1.287-288）：mid-response API 超时不再判整轮失败——非交互会话与子代理从部分响应继续，仅思考（无正文）的响应才整段重试。部分响应是资产不是废轮（恢复语义按内容存续划分，不按进程边界）。
- **零用量自动压缩触发口径**（v2.1.287-288）：长会话最后回复报 0 token 用量时触发自动压缩（不再抛 "Prompt is too long" 硬失败）——上下文压力信号（用量计量）与压缩动作之间的因果链路修复；计量缺失不得变成硬拒绝。
- **结构化输出可关**（`CLAUDE_CODE_DISABLE_STRUCTURED_OUTPUTS`，v2.1.287-288）：Mantle/网关拒结构化输出时标题、记忆召回、提示钩子回退到非结构化通道——对外部中间件的能力面须有降级路径（fail-open 兼容设计，与 v2.1.274 网关提示头同类）。
- 其余（v2.1.287-288）：$.ui.selection() 选中回传（mods 通道）、Ctrl+C 清空后 Up 恢复草稿（草稿=持久资产）、MCP OAuth 增权中途重认证、--max-findings 可调评审发现数。

## v2.1.288-289 能力

- **权限通道完备性三项**（v2.1.288-289）：①复合 shell 命令嵌套段上的 deny/ask 规则不再被用户所装 mod 的批准压过（受管机器——**管理侧否决优先于用户侧授权**，fail-closed 层级执法）；②Read deny 规则经符号链接作用于 IDE @提及/变更/选中通道（v2.1.268 路径规范化延到 IDE 通道——**同一文件的每一条进入路径都过同一权限检查**）；③Bash deny/ask 在沙箱 auto-allow 下不再漏检环境变量前缀展开值（`TZ="$HOME" rm -rf build`）与裸赋值后的命令——**auto-allow 是通道捷径不是豁免面**。
- **插件元数据越权修复**（v2.1.288-289）：用户安装的插件不得改写组织管理的 MCP server 登录工具描述——元数据（描述=模型所见）也是权限面，越权描述可诱导模型走错端点。
- 其余（v2.1.288-289）：agent.spawn teammates + $.agent.list() idle/waiting 态（多代理状态面）、mods 渲染失败单区隔离（ui.fault——一个 mod 的 Client 失败只废它自己，不带崩全局渲染）。

## v2.1.293-294 能力

- **指令式钩子的执行力**（v2.1.294，方法层主条）：`prompt`/`agent` hooks 以自然语言指令写就时（如「拦截××命令」），宿主现在真正**判定并执行**其阻断意图——此前这类指令式守门「写着拦截却拦不住」；Stop/SubagentStop 上的指令钩子判定同步收紧（模型更不会提前停）。**指令即门禁需要裁决路径，不依赖模型自觉**——自然语言守门从 prompt 层沉淀到宿主层。
- **工具 schema 可见性经济学**（v2.1.293）：`$.tool.register` 的 `isDeferred`——`false` 时工具 schema 从首轮 prompt 即列出（默认走 deferred definitions，需要时再展开）。mod 注册的工具可显式选择「一开始就可见」——schema 体积与发现性的显式权衡。
- **压缩边界不动已完成态**（v2.1.293）：修 Claude 把自己压缩前最后的动作当「未做完」而回撤重做——**compaction 是上下文手术，不是任务状态重置**（压缩必须保持已完成/未完成的判定连续性）。
- **HTTP MCP 连接内存泄漏修复**（v2.1.293）：连接此前保留其发过的每个请求直到关闭——**长连通道必须对历史请求有回收策略**（资源核算面）。
- **诚实指令面**（v2.1.293）：被 host/权限规则/`--tools` 移除的工具不再写进「继续用 SendMessage」类指令；子代理不再被告知全局禁用了只有自己缺的工具——**指令不得引用不存在的通道**。
- **排队消息保全**（v2.1.293）：`←` 后台化时排队消息不可迁则原地不动并说明（此前静默丢失）；Esc/No 在权限提示上如刚按过 `←` 也能停轮。
- **`claude plugin test` 的 `mock.session`**（v2.1.293）：测试可回读 `$.session.append` 追加的行——**插件测试面补齐到可断言副作用**（与 mock.session 之外的只读 mock 相对）。
- 其余（v2.1.293）：`subagentStatusLine` 载荷带 `agentType`（状态行脚本可辨自定义子代理类型）、Claude Haiku 5.5 成默认（1M 上下文）、`claude plugin eval` 在 Mac Docker Desktop 下不再误拒（拒绝时点名凭据来源）、path-scoped 规则在单文件 cat/head/tail/sed/grep 下也加载、粘贴文本不再被误判为键入、`/model` effort ←/→ 不再越界回绕。

## v2.1.290-292 能力

- **`serverToolUses` 进 mod `turn.step` 结果**（v2.1.290）：turn 结算把 API 自跑的工具调用（advisor）连同 id/名称/输入/起止暴露给 mod——**服务端代跑的动作也进审计面**（谁执行了什么不再因「不是客户端工具」而不可见）。
- **`tool.check` 带 agentId 与 ceiling**（v2.1.290）：权限检查事件可辨子代理 vs 主会话，且带组织要求的审批等级——**权限事件的归属（谁）与阈值（要多高的批准）都成一等字段**。
- **WebFetch 截断显式化 + offset 续读**（v2.1.290）：页面文本超 100,000 字符不再静默丢弃，显式报告未读量并接受 offset——「没读到」必须可见（与 Grep/Glob 不可读如实报错同族）。
- **计划任务恢复两族**（v2.1.290/292）：`/loop` 间隔与提醒在 compaction 后可恢复（覆盖本版起的压缩）、后台交接（←/`/background`）后前台设定的定时任务不再永不触发、resume/respawn/fork 不再重复跑——**持久化任务与对话压缩/交接解耦**；292 补：`/resume`/`/branch`/`/clear` 后创建的任务不再永不触发、任务文件毫秒级双写不吞后续增删。
- **UNC 网络路径读审批旁路修复**（v2.1.292，安全）：PreToolUse hook 批准与 auto mode 此前可绕过网络（UNC）路径读的权限提示——**网络路径与本地路径同一权限面**。
- **Agent 工具 effort 参数**（v2.1.292）：子代理按指定 effort 档运行（与 maxEffortLevel 封顶、PreModelSwitch 挂点同族的派发面补全）。
- **`$.model.complete` prompt 缓存块**（v2.1.292）：`prompt`/`system` 接受文本块、`cache: true` 缓存到该块为止——mod 侧可声明缓存边界（缓存友好编排的 API 化）。
- 其余（v2.1.290-292）：`claude attach/logs` 会话名子串定位、`/claude-api managed-agents-onboard`（URL/quickstart 两形态）、`claude plugin install --marketplace`（装即挂源同策略检查）、`prompt.autocomplete` mod 事件、MCP >128 字符工具名单点剔除+点名（不再全请求失败）、Grep/Glob 资源不可读重试一次或报错、`CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS`（529 退避基值可调）、291 双回归修（云会话权限应答丢失+退出丢末消息——修复轮即回归源的连续实证）、managed settings 外链与沙箱忽略项 /status·doctor 警告、resumed subagent/teammate 保留 thinking 与 prompt cache。
