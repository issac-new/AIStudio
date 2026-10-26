# claude-code 功能雷达（M4 深化版）：全量 CHANGELOG、官方文档功能面与差距对照

2026-09-21 二轮深化，基于 upstream/claude-code @ 7974a70（tag v2.1.278）。前序：`docs/upstream-coding-tools.md` 台账、初版雷达（同日本文 v1）、`docs/upstream-analysis/zcode.md` §六（深度参照）。**许可红线：LICENSE.md 为 Anthropic 专有（Commercial Terms），本文只提炼功能概念与工作流设计，禁止将任何该仓代码拷入 overlay。** 本轮方法：CHANGELOG 自 0.2.21（文件最旧条目）逐版本过完全部 401 个版本头；13 插件逐个读 commands/agents/hooks/skills 源文件；examples/ 与 mods/ 逐文件读；官方文档侧抓取 14 页（§三，各条带 URL）；hermes-agent 侧对应物以 grep 实测锚点核验。

## 一、仓库内容地图（深化版）

CLI 本体是二进制，仓内可读资产六块：官方插件（13 个）、hook/网关示例（examples/）、内置 mods（4 个 + 1 个类型声明）、**function-hooks 引擎 API 声明（本轮新发现，见 1.4）**、CHANGELOG（7158 行，401 版本头，0.2.21 → 2.1.278）、仓库治理脚本（scripts/，Bun 写的 GitHub issue 生命周期工具：auto-close-duplicates / sweep / issue-lifecycle 等，属仓库运营非产品功能；`Script/run_devcontainer_claude_code.ps1` 为 devcontainer 辅助）。

**1.1 十三个官方插件**（根 `.claude-plugin/marketplace.json` 即官方市场，13 个 entries；目录结构统一为 `.claude-plugin/plugin.json` + commands/ + agents/ + skills/ + hooks/）：

| 插件 | 形态 | 内容 |
|---|---|---|
| agent-sdk-dev | 命令+2 代理 | `/new-sdk-app` 脚手架；py/ts 双验证代理 |
| claude-opus-4-5-migration | 技能 | 模型串/beta 头迁移，SKILL.md + references/ 两级 |
| code-review | 命令 | 5 并行代理评审 + 逐条验证轮（§四） |
| commit-commands | 3 命令 | `/commit`、`/commit-push-pr`、`/clean_gone` |
| explanatory-output-style | hook | SessionStart 注入教学上下文 |
| feature-dev | 命令+3 代理 | 7 阶段开发工作流（§四） |
| frontend-design | 技能 | 反「AI 通用审美」设计指导 |
| hookify | 命令+代理+python 引擎 | 对话式规则生成（§四） |
| learning-output-style | hook | SessionStart：决策点请用户写 5-10 行 |
| plugin-dev | 命令+3 代理+7 技能 | 插件开发 8 阶段工具箱（§四） |
| pr-review-toolkit | 命令+6 代理 | 按变更裁剪的专项评审（§四） |
| ralph-wiggum | 2 命令+Stop hook | 自循环迭代（§四） |
| security-guidance | python hooks | 编辑时 9 类警告 + commit/push 异步复查（§四） |

**1.2 examples/**：`hooks/bash_command_validator_example.py`（PreToolUse 改写 grep→rg 的教学例）；`settings/` 三档企业策略——lax（仅禁 bypass+锁市场）/ strict（`allowManagedPermissionRulesOnly` + `allowManagedHooksOnly` + Bash 全 ask + 禁 WebSearch/WebFetch + 空 `strictKnownMarketplaces`）/ bash-sandbox（Bash 必须进沙箱）；`mdm/`（macOS plist/mobileconfig + Windows admx/adml/ps1 + 通用 managed-settings.json， Jamf/Intune/GPO 部署模板）；`gateway/aws` 与 `gateway/gcp`（Claude apps gateway 参考部署：Dockerfile + gateway.yaml + Terraform 全套，上游接 Bedrock/Vertex，`setup.sh` 端到端脚本）。

**1.3 mods/——四个随二进制内置的插件**（`mods/README.md`）：`diff`（`/diff` 会话旁未提交变更面板，2.1.260 的实现体）、`telemetry`（`$.telemetry` 一等分析通道：log/mark 批量上报，拒绝非内置插件使用，分析关闭时零发送）、`agents-md`（AGENTS.md 支持，2.1.277，四档加载策略 claude-md-or-agents-md/and/-only/managed-only）、`sec-default`（组织策略隔离层：把企业 hooks/prompt/managed settings/工具策略放在个人插件够不着的最外层 tier）。每个都是完整插件 + `claude plugin test` 可跑的测试。架构信号：引擎只留事件总线与 `register(on)` 约定，连 `/diff`、遥测、AGENTS.md 这类「本体功能」都以可拔插形态实现。

**1.4 function-hooks API（`mods/types/claude-code.d.ts`，12,990 行，2.1.277 生成）——本轮最大架构发现。** 这是插件 API 的完整 TypeScript 声明：插件入口为 `register(on, options)`，事件按名词分域约 90 个——`engine.create`、`session.*`（start/end/attach/compact/messages/turns/usage/model/surface）、`turn.*`、`tool.*`（register/call/check/describe）、`prompt.*`（read/submit/edit/fill/suggest/attachment/context/section）、`agent.*`（spawn/register/offer/list）、`command.*`、`skill.prompt`、`mcp.call`、`model.complete/classify/fork`、`fs.*`、`process.run`、`http.fetch`、`env.*`、`settings.read`、`store.*`（插件 KV）、`clock.*`、`ui.*`（render/open/panes/toast/status，JSX 组件树）、`audio.play/speak`、`chart.png` 等。引擎接口 `$` 按名词暴露能力（mod 可在 `engine.create` 折里新增名词，如 `$.telemetry`）；四 surface（terminal/desktop/vscode/mobile）同一套声明；配套 `claude-code/testing` 测试套件（mock.clock/store/env + `$.ui.mount` 多表面用例）与 `/plugin-types` 命令按版本再生声明。**对我们「custom 组件 + hermes 插件」体系的启示：一份带类型的事件契约 + 引擎名词表，是插件生态的单一事实源形态**（概念参考，不拷贝）。

## 二、CHANGELOG 功能雷达（全量 0.2.21 → 2.1.278，401 版本头）

主线判断（五幕）：0.2.x 终端工具奠基（命令/MCP/vim/auto-compact）→ 1.0.x 平台化（hooks、子代理、statusline、output styles、TS/Py SDK、GA）→ 2.0.x 生态起步（插件系统、Skills、沙箱、rewind、Desktop）→ 2.1.0-2.1.139 编排期（任务系统、agents 总视图、goal、动态工作流、teleport）→ 2.1.140+ 上下文经济学与企业治理（缓存归因/成本面板/auto 模式分类器/gateway/runner）。按域摘录（仅产品级功能，锚点为版本号）：

**起源期（0.2.x-1.0.x，摘产品级）**：

- 配置面：自定义 slash 命令 0.2.31；vim 模式 0.2.34；auto-compact 0.2.47；`/permissions` 前身 /approved-tools 0.2.26、更名 1.0.7（allowTools 迁 settings.json）。
- MCP 起步：wizard 0.2.32；add-json/import-from-desktop 0.2.36；project scope `.mcp.json` 0.2.50；SSE 0.2.54；OAuth+Streamable HTTP 1.0.27；MCP_TIMEOUT 0.2.41。
- 输入与上下文：@-mention 文件 0.2.75、图片粘贴 0.2.59、@agent 1.0.62；ultrathink 关键词 0.2.44；CLAUDE.md `@import` 0.2.107；WebFetch 0.2.53、WebSearch 0.2.105；PDF 读取 1.0.58；流式中途转向 0.2.108。
- 会话：`--continue/--resume` 0.2.93；Todo 列表 0.2.93；statusline `/statusline` 1.0.71；后台 Bash Ctrl+B 1.0.71；output styles 1.0.81（含 Explanatory/Learning 教学风格，后废弃、又被官方插件以 SessionStart hook 复活，见 §四）。
- 平台化：**hooks 发布 1.0.38**（SessionStart 1.0.62、SessionEnd 1.0.85、PreCompact 1.0.48、Stop/SubagentStop 拆分 1.0.41）；**自定义子代理 `/agents` 1.0.60**（模型指定 1.0.64）；TS/Python SDK 1.0.23；GA + Sonnet 4/Opus 4 1.0.0。

**2.0.x（生态起步）**：

- /rewind checkpoint、/usage、Ctrl-R 历史搜索、SDK 更名 Agent SDK、`--agents` 动态子代理 2.0.0；**插件系统 2.0.12**；**Skills 2.0.20**；Bash 沙箱（Linux/macOS）2.0.24。
- 子代理深化：Plan 子代理、可恢复、动态选模型 2.0.28；permissionMode 字段 + skills 预载 + SubagentStart 2.0.43；Explore 子代理（Haiku 提速）2.0.17；prompt 型 Stop hooks 与 agent disallowedTools 2.0.30。
- 桌面与浏览器：Opus 4.5 + **Desktop 应用** 2.0.51；Claude in Chrome 2.0.72；PermissionRequest hook + `&` 发后台任务到 web 2.0.45。
- 杂项关键项：`.claude/rules/` + `/stats`（最爱模型/连用天数）+ TaskOutputTool 统一 2.0.64；后台代理 2.0.60；命名会话 2.0.64；`mcp__server__*` 通配权限 2.0.70；会话 fork 2.0.73；**LSP 工具** 2.0.74；`/context` 按源分组 2.0.74；PreToolUse 可改工具输入 + Ctrl+G 外部编辑器 2.0.10；长 Bash 自动转后台 2.0.19。

**会话与后台（2.1.x）**：

- 总视图：`claude agents`（Needs input/Working/Completed 分区）2.1.139、`--json` 2.1.145、后台会话入 /resume 2.1.144、`--cwd` 2.1.141。
- 派生与恢复：`/fork` 派生+自带 worktree 2.1.212/221、`/branch` 原地分支；`/rewind` 恢复到 /clear 之前 2.1.191；recap 回笼摘要（`/recap` 手动）2.1.108；`--from-pr` 按 PR 恢复 2.1.27。
- 持续工作：`/goal` 目标驱动 + elapsed/turns/tokens 浮层 2.1.139；`/loop`+CronCreate 2.1.71；`/schedule` 云端 routines（GitHub 触发）。
- 跨会话：SendMessage/ListAgents 2.1.224；notify_when_idle 2.1.236；crossSessionInbound 收发策略 2.1.232。
- 输入体验：发送队列灰显 + ctrl+enter 打断全发 2.1.275；`/btw` 侧问（c 复制 markdown）2.1.163；退出提示 resume 2.1.31；75 分钟空闲提示 /clear 2.1.84。
- 跨设备：`--teleport` 2.1.0；Remote Control 2.1.51；self-hosted runner 2.1.224；AGENTS.md 2.1.277。

**上下文经济学**：`/context` 可操作建议（过重工具/记忆膨胀）2.1.74；1 小时 prompt cache 与主/子代理差异化 TTL 2.1.108/243/248（agent `experimental.cacheTtl` 2.1.248）；**prompt-cache miss 归因**进 /cost 与状态栏 2.1.260 + 会话级缓存行 2.1.251；auto-compact 收紧 2.1.223；1M 窗口默认化 2.1.75/219；`/skill-doctor` 未用技能成本 2.1.261；插件市场页预估每轮 token 成本 2.1.121/139/143；大工具输出落盘 2.1.2（上限 1GB 2.1.265）；`/autocompact` 阈值命令化；「Summarize from here」部分压缩 2.1.32。

**工具面**：Monitor 流式监视 2.1.98（插件 `monitors` 清单自动布防 2.1.105）；PowerShell 2.1.84；Read PDF 页区间 2.1.30；Bash 附文件变更 diff 2.1.269；Edit 对 sed/cat 看过文件免重读 2.1.89；WebSearch 每会话 200 次上限 2.1.212；Ctrl+B 统一后台化 2.1.0；技能热重载 2.1.0、`/reload-skills` 2.1.152、`/reload-plugins` 2.1.69；**Artifact 工具**（发布共享网页/图表/文件到 claude.ai，版本化、可协作编辑）2.1.265-278 持续打磨；EndConversation（拒绝滥用/越狱）2.1.214。

**子代理与编排**：任务系统依赖跟踪 2.1.16；并发上限 20 2.1.217、每会话 spawn 上限 200 2.1.212、**嵌套深度默认 3 层**（`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`，文档口径）；`isolation: worktree` 2.1.50 与 `omitClaudeMd` 2.1.271；Task 结果带 token/工具数/时长 2.1.30；完成通知带耗时 2.1.144；后台子代理权限提示浮到主会话 2.1.186；`/tasks` 显示各子代理模型与 effort 2.1.243；**结果来源标头防冒充 2.1.277**（2.1.210 起输出扫描插反注入标记）；`/code-review` 后台子代理化 2.1.218；代理团队 2.1.32（TeammateIdle/TaskCompleted hooks）；动态工作流规模三档 2.1.202/219（并发上限可调 2.1.269）、用量限额自动暂停续跑 2.1.271；`/batch` worktree 子代理分治 2.1.63。

**hooks 事件面**（全表见 §三）：Setup 2.1.10、SubagentStart 2.0.43、PermissionRequest 2.0.45、CwdChanged/FileChanged 2.1.83、TaskCreated 2.1.84、WorktreeCreate/Remove 2.1.50、PreCompact/PostCompact 2.1.105/76、Elicitation(+Result) 2.1.76、MessageDisplay 2.1.152、DirectoryAdded 2.1.219、PreModelSwitch/PostModelSwitch 2.1.251、PermissionDenied 2.1.89、StopFailure 2.1.78、InstructionsLoaded 2.1.69、ConfigChange 2.1.49、UserPromptExpansion/PostToolUseFailure/PostToolBatch（文档表收载）。机制升级：HTTP hooks 2.1.63；`if:` 条件过滤 2.1.85；`defer` 暂停决策 2.1.89；exec 形式 args 2.1.139；`asyncRewake`/`rewakeMessage`（security-guidance 实例）；`continueOnBlock` 2.1.139；`terminalSequence` 2.1.141；prompt 型 hooks 带 model 2.0.41。

**MCP**：claude.ai 连接器复用 2.1.46；预配置 OAuth client credentials 2.1.30；elicitation 2.1.76；`--channels` 服务器推消息 2.1.80（权限中继 2.1.81）；`claude mcp login/logout` 2.1.186；`_meta` 结果上限 500K 2.1.91；`alwaysLoad` 2.1.121；`auto:N` 工具搜索阈值 2.1.9；v2 MCP 客户端 + 2026-07-28 协议协商全平台默认 2.1.274；managedMcpServers 2.1.259；断线通知+重连放弃 2.1.273。

**权限与沙箱**：auto 模式（后台安全分类器审批）——denial 原因进 transcript 2.1.193、`classifyAllShell` 2.1.193、hard_deny 2.1.136、Auto mode tab 2.1.246、子代理 hand-back 过分类器 2.1.271、**服务端分类器默认 2.1.278**。沙箱——Bash 网络域允许表 2.1.113/219；凭据屏蔽 2.1.187/224（extract/jwt/mask）；cgroup 内存限 2.1.233；per-command `allowed_domains` 2.1.271。模式开关——`--restricted` 2.1.248；`--safe-mode` 2.1.169；`/cd` 不破缓存迁目录 2.1.169。hermes 侧 smart approvals 为 auto 模式同类物（§五）。

**模型计费**：Opus 5 2.1.219、Fable 5.1 2.1.257；effort 档 low→xhigh 2.1.111（max/ultracode/auto 见文档）、`/effort` 2.1.76 且按模型记忆 2.1.251；fast mode（`/fast`）2.1.41+；`/advisor` 第二模型顾问；modelPicker 2.1.243、modelOverrides 2.1.73、fallbackModel 三级 2.1.166；/cost 按模型+缓存命中分解 2.1.92、modelPricing 组织费率 2.1.243、Loops 分解 2.1.243、spend limit 2.1.251。

**UX 渲染**：`/tui` 全屏渲染 2.1.110（新装默认 2.1.239）；focus 视图 2.1.97；`/diff` 面板 2.1.260；Concise 风格 + `/output-style` 2.1.237/269；折叠工具行实时计时 2.1.210 + 心跳 2.1.214；transcript 搜索 2.1.83；vim 可视模式 2.1.118；`/keybindings` 2.1.18；读屏模式 2.1.208；拼写检查 2.1.235；emoji 补全 2.1.217；PR 脚标 2.1.20 / GitLab MR 脚标 2.1.234；`/color` 2.1.75；`/insights`、`/powerup` 教学 2.1.90、`/team-onboarding` 2.1.101。

**生态同步**：claude.ai 账号 skills/plugins 同步进终端会话 2.1.275（`syncClaudeAiSkills/Plugins`）；插件 npm 源 `npm pack --ignore-scripts` + 完整性校验 2.1.275；`claude plugin eval` 评测套件（JSON+HTML 报告）2.1.269；`claude plugin test`/`tag`/`init`/`prune` 2.1.118/157/121；`${CLAUDE_PLUGIN_DATA}` 插件持久状态 2.1.78。

**企业治理**（对我方多为 ×，仅列方向）：apps gateway（examples/gateway + 2.1.259 起配置体系）；MDM（examples/mdm）；`managed-settings.d/` 多团队策略拼装 2.1.83；组织策略插件下发；Claude Tag（Slack 侧产品，CHANGELOG 大量条目）。

## 三、官方文档功能面清单（本轮抓取 14 页，URL 即锚点）

**概览**（https://code.claude.com/docs/en/overview）：

- 六 surface：Terminal CLI / VS Code+Cursor / Desktop（macOS/Win/Linux beta）/ Web（claude.ai/code）/ JetBrains / Chrome 扩展。
- 能力清单：自动化琐事、多文件特性开发、git 工作流+CI（GitHub Actions/GitLab CI）、MCP、CLAUDE.md/AGENTS.md/auto memory、Skills、Hooks、子代理+后台代理总视图、Agent SDK、headless CLI、定时三件套（Routines/Desktop scheduled/`/loop`）、跨设备（Remote Control/Dispatch/teleport）、Channels（Telegram/Discord/iMessage/webhooks）、GitHub Code Review。

**hooks 全表**（https://code.claude.com/docs/en/hooks，34 事件）：

- 会话域：SessionStart / Setup / UserPromptSubmit / UserPromptExpansion / SessionEnd。
- 工具域：PreToolUse / PermissionRequest / PermissionDenied / PostToolUse / PostToolUseFailure / PostToolBatch。
- 消息域：Notification / MessageDisplay。
- 子代理域：SubagentStart / SubagentStop / TaskCreated / TaskCompleted / TeammateIdle。
- 终止域：Stop / StopFailure；环境域：InstructionsLoaded / ConfigChange / CwdChanged / DirectoryAdded / FileChanged / WorktreeCreate / WorktreeRemove。
- 压缩域：PreCompact / PostCompact；模型域：PreModelSwitch / PostModelSwitch；MCP 域：Elicitation / ElicitationResult。
- 配置字段：matcher / type（command、http、mcp_tool、prompt、agent 五种）/ timeout（默认 600s，prompt 30s，agent 60s）/ `if:` / async+asyncRewake / statusMessage / once。
- 输出控制：permissionDecision(+Reason)、updatedInput、systemMessage、additionalContext、hookSpecificOutput 包装、Stop 域 decision:block+reason、retry:true（PermissionDenied）。

**子代理配置面**（https://code.claude.com/docs/en/sub-agents）：

- frontmatter 全集 20 字段：name / description / tools / disallowedTools / model（sonnet/opus/haiku/fable/inherit）/ permissionMode / maxTurns / skills / mcpServers / hooks / memory（user/project/local 三档持久记忆）/ background / omitClaudeMd / effort / isolation:worktree / color / initialPrompt / experimental.cacheTtl。
- 作用域优先级：managed > `--agents` > 项目 > 用户 > 插件；调用四途径：描述自动委派 / 自然语言 / @-mention / `claude --agent` 会话级换人格。
- 内置：Explore（只读、跳过 CLAUDE.md/git status 提速）/ Plan / General-purpose；可恢复（agent_id + SendMessage 续聊）。
- 护栏：并发 20、嵌套深度默认 3、描述总量 15k token 告警、背景子代理工具集更小、输出扫描反注入（2.1.210+）。

**技能体系**（https://code.claude.com/docs/en/skills）：

- **自定义命令已合并进 skills**（Agent Skills 开放标准 agentskills.io）；六作用域：企业 / 个人 `~/.claude/skills/` / 项目 `.claude/skills/` / 子目录嵌套 / 插件 / claude.ai 账号同步。
- frontmatter：name / description / when_to_use / disable-model-invocation / user-invocable:false / allowed-tools / disallowed-tools / **context:fork** + agent + background / model / effort / paths（glob 限定自动激活）/ argument-hint / hooks / shell。
- 渐进披露：描述常驻、正文调用才载、引用文件按需（SKILL.md ≤500 行建议）；动态上下文 `` !`cmd` `` 注入；多技能叠加 ≤6。
- 内置技能：/doctor /code-review /batch /debug /loop /claude-api /run /verify /run-skill-generator（记录项目构建/启动配方）/deep-research /dataviz /design /fewer-permission-prompts。

**权限系统**（https://code.claude.com/docs/en/permissions）：

- **7 模式**：default(=manual) / acceptEdits / plan / auto（后台安全分类器）/ dontAsk / bypassPermissions。
- 规则求值固定序 deny→ask→allow 首配即止；窄 allow 不能从宽 deny 里豁免。
- 语法：工具名；`Bash(npm run build)` 精确；`Bash(git *)` 通配（`*` 须在子命令后）；`Tool(param:value)` 参数匹配（2.1.178）；gitignore 风格文件规则（`//` 绝对、`~/` 家、bare 相对）；`mcp__server__*`（2.0.70）。
- 「Yes, and don't ask again」落 `.claude/settings.local.json`（worktree 感知 2.1.211）；PreToolUse hook 可扩展运行时权限（exit 2 压过 allow）；`--add-dir`/additionalDirectories 扩读写域。

**记忆**（https://code.claude.com/docs/en/memory）：

- 四层 CLAUDE.md（managed > user > project > CLAUDE.local.md），父子目录全链拼接；`@import` 递归 ≤4 跳，外部 import 需审批。
- `.claude/rules/` 模块化规则 + `paths:` glob 按文件激活；AGENTS.md 四档加载策略（2.1.277）。
- **auto memory**：Claude 自写笔记（user/feedback/project/reference 四类型），`~/.claude/projects/<项目>/memory/` 带 MEMORY.md 索引，200 行/25KB 上限，子代理可独立记忆；压缩后项目根 CLAUDE.md 重注入。

**MCP**（https://code.claude.com/docs/en/mcp）：三作用域 local/project(.mcp.json)/user；优先级 local>project>user>插件>claude.ai 连接器，managed 超一切；四传输 stdio/HTTP/SSE(deprecated)/WebSocket；工具搜索（ToolSearch 按需发现 + 发现缓存）；2 分钟以上工具调用自动转后台；`claude mcp` 子命令族 add/add-json/add-from-claude-desktop/list/get/remove/login/logout/**serve**（自身当 stdio MCP 服务器）/reset-project-choices。

**checkpoint/rewind**（https://code.claude.com/docs/en/checkpointing）：每轮 prompt 前自动快照，**每会话保留 100 个**，随会话保存（resume 后可用），保留期 ~30 天（cleanupPeriodDays）；入口 /rewind 或双击 Esc；**恢复三选项 + 部分摘要**：恢复代码+对话 / 仅对话 / 仅代码 / Summarize from here；限制：Bash 造成的文件变更与多数子代理编辑不追踪（前台 forked 技能例外）。

**statusline**（https://code.claude.com/docs/en/statusline）：stdin JSON 字段面——model / workspace（added_dirs/git_worktree/repo）/ cost（USD/时长/行数）/ context_window（used_percentage 等）/ rate_limits（5h/7d/spend 窗口）/ prompt_cache（warm/hit_ratio/misses/TTL）/ vim.mode / pr.* / output_style；事件驱动刷新 + 300ms 防抖 + refreshInterval 定时；多行/ANSI/OSC 8 链接；独立 `subagentStatusLine` 定制子代理行。

**监控**（https://code.claude.com/docs/en/monitoring-usage）：OTel 8 指标（session.count / lines_of_code.count / pull_request.count / commit.count / cost.usage / token.usage / code_edit_tool.decision / active_time.total）+ 事件（user_prompt / assistant_response / tool_result / tool_decision / api_request / api_error）+ beta 追踪（interaction→llm_request/hook/tool 层级，W3C TRACEPARENT 贯通子进程）；内容脱敏分级开关（OTEL_LOG_*）；mTLS/动态 headers/仓库标签。

**Agent SDK**（https://code.claude.com/docs/en/agent-sdk/overview）：Python/TS 双语言，复用 Claude Code 的工具循环与上下文管理；能力面 hooks/子代理/MCP/权限(canUseTool)/会话 resume+fork/skills+commands+memory 同源加载/插件本地加载；其他语言走 `claude -p --output-format json`。

**IDE 集成**（https://code.claude.com/docs/en/vs-code）：

- 扩展=隐藏 MCP 服务器 `ide`（127.0.0.1 随机端口 + lock 文件 token 鉴权）；模型可见工具仅 `mcp__ide__getDiagnostics`（Problems 面板）与 `mcp__ide__executeCode`（Jupyter，每次人工确认）。
- inline diff 逐处 accept/reject/edit；plan 全文 markdown 评审加行内评论；@-mention 文件/行区间（`@file.ts#5-10`）/`@terminal:name`/`@browser`；编辑器选区自动入上下文（⧉ 提示，Read deny 可屏蔽 .env 类）。
- 多会话 tab 状态点（蓝=待审批，橙=完成未读）；Remote Control。

**交互与命令**（https://code.claude.com/docs/en/interactive-mode + /commands）：权限模式 Shift+Tab 循环；快捷键族（Ctrl+O transcript / Ctrl+R 历史 / Ctrl+B 后台 / Ctrl+T 任务单 / Ctrl+S 暂存 prompt / Ctrl+G 外编 / Esc Esc rewind / Alt+P 换模型 / Alt+T 思考 / Alt+O fast）；vim 全套（text objects、visual、`vimInsertModeRemaps`）；内建命令目录 ~60 条（add-dir / batch / branch / btw / cd / clear / color / compact / context / copy / cost / debug / deep-research / diff / doctor / effort / export / fast / focus / fork / goal / help / hooks / import / init / insights / list-agents / login / logout / loop / mcp / memory / model / output-style / permissions / plan / pr-comments / remote-control / resume / rewind / security-review / status / teleport / tasks / terminal-setup / usage / verify 等）。

**未抓取页**（如实标注）：output-styles、plan-mode、agent-view（后台代理视图）、routines、github-actions、costs、sandboxing、plugins 各专题页本轮未单独抓（部分内容已由 CHANGELOG/其他页覆盖）。

## 四、官方插件工作流设计深读

**code-review（`plugins/code-review/commands/code-review.md`）——两级流水线 + 验证轮。**

- 9 步：haiku 资格预检（关/草稿/无必要/Claude 已评过即止）→ haiku 找相关 CLAUDE.md → sonnet 摘要变更 → 4 代理并行发现（2×CLAUDE.md 合规 sonnet + 2×bug opus）→ **每个问题再派独立子代理验证**（bug 用 opus、合规用 sonnet）→ 过滤未验证项 → 汇总 → （--comment 时）逐条 inline 评论。
- 三个可搬的设计：模型分层（廉价模型做门禁与枚举、贵模型做判断）；「高信号纪律」写进提示词（不确定不报，误报侵蚀信任，附 6 条豁免清单）；验证轮作为独立编排阶段。
- 2.1.218 起整体跑在后台子代理；2.1.274 起对无专门调优的模型改用精简 inline 提示词少起子代理。

**feature-dev（`plugins/feature-dev/commands/feature-dev.md` + agents/）——7 阶段每段 Goal + 用户门禁。**

- 流程：Discovery → 探索（2-3 个 code-explorer 并行，各自不同视角）→ **澄清问题（CRITICAL: DO NOT SKIP）** → 架构（2-3 个 architect 各出一案，主代理给倾向推荐，用户选）→ 实现（DO NOT START WITHOUT USER APPROVAL）→ 质量评审（3 个 reviewer 查简洁/正确/规范，分级后问用户现在修/以后修/放着）→ 总结。
- 三个 agent 定义（`agents/code-explorer.md` 等）是 frontmatter 范本：tools 白名单**只读系**（Glob/Grep/LS/Read/WebFetch/TodoWrite…无 Edit/Write）、model:sonnet、color 分色（黄/绿/红）。
- explorer 提示词硬性要求「返回绝对必要的 5-10 个关键文件清单」，主代理随后亲读建上下文。这就是计划浮窗该有的「计划模板」形态：阶段即检查点，门禁即审批。

**pr-review-toolkit（`plugins/pr-review-toolkit/`）——按变更裁剪 + 四档汇总 + few-shot 路由。**

- `/review-pr` 先 `git diff --name-only` 判断哪些评审代理适用（改测试文件才起 pr-test-analyzer、加类型才起 type-design-analyzer）；汇总固定四档 Critical/Important/Suggestions/**Strengths**（正向观察也列）。
- 6 个 agent 的 description 全部用 `<example>` few-shot 写「何时该被主动调用」（`agents/silent-failure-hunter.md`），让主模型能自动路由——这是子代理 description 的工程化写法。
- 模型分档：code-reviewer 用 opus，其余 `model: inherit`；code-reviewer 提示词带 0-100 置信度评分制（≥80 才报）。

**security-guidance（`plugins/security-guidance/hooks/hooks.json` + patterns.py）——同步拦紧急、异步查深度。**

- 四事件布防：SessionStart 装运行时（timeout 180）；UserPromptSubmit + PostToolUse（matcher `Edit|Write|MultiEdit|NotebookEdit`）跑 9 类正则模式警告（模式库在 patterns.py 是数据不是硬编码）。
- 对 `Bash(git commit:*)`/`Bash(git push:*)` 用 `if:` 条件 + `asyncRewake: true` + `rewakeMessage`/`rewakeSummary` 后台跑 LLM diff 复查，不阻塞当轮、出发现再唤醒；Stop 事件同样异步复查兜底。

**ralph-wiggum（`plugins/ralph-wiggum/hooks/stop-hook.sh`）——Stop hook 自循环。**

- `/ralph-loop` 写状态文件 frontmatter（iteration/max_iterations/completion_promise）；Stop hook 读 transcript 尾条 assistant 消息，输出 `{"decision":"block","reason":<原提示>}` 续跑。
- 完成承诺用 `<promise>` 标签匹配且提示「不许撒谎退出」。防失控三件套：迭代上限、承诺校验、状态损坏熔断。

**hookify（`plugins/hookify/`）——对话式规则生成 + 通用规则引擎。**

- 命令先加载 writing-rules 技能；无参数时起 conversation-analyzer 代理扫最近 10-15 条用户消息找挫败信号，生成带 frontmatter（event/conditions[field/operator/pattern]/action: block|warn）的 `.local.md` 规则。
- 规则由常驻 python 引擎执行（hooks.json 挂 PreToolUse/PostToolUse/Stop/UserPromptSubmit 四事件，timeout 10s）：`core/rule_engine.py` 用 lru_cache 编译正则、block 优先于 warn、多规则消息合并、按事件类型选 block 格式。
- **规则=数据文件 + 引擎=通用执行器**，与 kimi `/mcp-config` 同为「对话式生成配置」范式。

**plugin-dev（`plugins/plugin-dev/`）——8 阶段创建 + 7 专家技能 + 3 代理。**

- `/plugin-dev:create-plugin`：Discovery → 组件规划（强制先 Skill 加载 plugin-structure，产出组件清单表）→ 细化设计+澄清 → 实现（按需加载各专家技能）→ 校验（plugin-validator 代理）→ 测试 → 交付。
- 7 技能（skill/agent/command/hook/mcp-integration/plugin-settings/plugin-structure）各带 references/examples 二级文件，是渐进披露的组织范例。3 代理：agent-creator / plugin-validator / skill-reviewer。

**agent-sdk-dev（`plugins/agent-sdk-dev/`）——文档先行的脚手架。**

- `/new-sdk-app` 先 WebFetch 官方 SDK 文档再动手；需求采集**一次只问一个问题**（语言→项目名→agent 类型→起点→工具链，逐个等待）。
- 两个 verifier 代理（py/ts）按官方文档清单核查（SDK 版本/ESM/tsconfig/部署就绪）。评审即对照最新文档，不靠记忆。

**commit-commands（`plugins/commit-commands/`）——命令的两种极简范式。**

- `/commit`：frontmatter `allowed-tools` 锁死三条 git 命令 + 正文用 `` !`git status` `` 等**动态上下文注入**（执行结果进 prompt）+「单条消息完成全部工具调用」纪律。
- `/clean_gone` 则是纯脚本说明书（列出要跑的命令与预期行为）。allowed-tools + 动态注入是自定义命令的两个关键机制。

**输出风格对（explanatory / learning-output-style）——废弃能力的插件复活法。**

- 两者都是 SessionStart hook 输出 `hookSpecificOutput.additionalContext` 注入风格提示词（`hooks-handlers/session-start.sh` 单 cat 一个 JSON）。
- explanatory 要求写码前后插「★ Insight」教育块；learning 进一步在决策点**请用户亲手写 5-10 行**（先搭文件+签名+TODO 占位，再解释权衡点）。
- 证明 output style 本质 = SessionStart 注入提示词，可用 hook 重建。

**claude-opus-4-5-migration——技能的渐进披露实例。** SKILL.md 只放迁移流程与模型串对照表，`references/effort.md`、`references/prompt-snippets.md` 按需加载，控制常驻上下文成本。

## 五、与我方 IDE 差距对照（含 hermes-agent 侧核验）

hermes-agent 侧已实测锚点（本轮 grep 验证，非自报）：

- **审批/权限系**：`tools/approval.py`（gateway 审批队列、pattern 级 approve、yolo 会话开关、denial 熔断器）；`tools/approval_floors.py`（deny glob 预门禁）；`tools/approval_smart.py`（**辅助 LLM 风险评估自动审批**，Codex Smart Approvals 同源，含注入防御）；`agent/file_safety.py`（写路径 denied/approval 域）。
- **hooks**：`agent/shell_hooks.py` 是 **Claude-Code/Cursor 兼容桥**——stdin JSON `{hook_event_name, tool_name, tool_input, session_id, cwd}`，stdout JSON decision/action block/modify，exit 2 阻断 pre_tool_call，matcher 支持，fail open/closed 可选。
- **子代理**：`agent/subagent_lifecycle.py`（插件安全契约：goal/context/result 上限 16k/32k/32k 字符、终态保留 1h）；`tools/async_delegation.py`（durable 派发记录、崩溃恢复、完成重投递）；每轮 delegate_task 受 `delegation.max_concurrent_children` 限制（默认 10，`cli-config.yaml.example:1649`，`run_agent.py:1153`）。
- **流式 hook**：`agent/plugin_stream_hooks.py`（每消费者独立队列，不占 token 路径）。

| claude-code 能力（锚点） | 我方现状 | 裁决 |
|---|---|---|
| 流式会话+审批门 | IdeChatPane；后端 hermes approval 系完整（上表） | ≈ |
| 权限模式 7 档（§三） | hermes 有 yolo/pattern/deny/smart；无 plan/auto/dontAsk 模式语义 | ≈（smart≈auto 的局部对应；模式切换 UI 无） |
| hooks 事件面 34 种 + if/async/defer | **hermes shell_hooks 桥已有**（CC 兼容 wire） | ≈ 后端 / → IDE 无 hooks 管理界面（与 zcode G 系 P1-15 合流） |
| 子代理并发 20 + 会话 spawn 200 + 嵌套深度 3（§三） | hermes 每轮 delegate ≤10 已有；**会话总量与嵌套深度上限无** | → 补两会话级护栏（hermes 侧配置项） |
| 子代理结果来源标头防注入（2.1.277） | 子代理浮窗展示流，无防冒充框架 | → 输出进主对话加来源框架 |
| 子代理 @-mention/描述自动路由（§三） | 无提及系统（zcode M4 已列 →） | → 并入 zcode P1-9 @提及项 |
| 会话 recap（2.1.108） | 恢复即续聊，无回笼摘要 | → 恢复时生成「离开后发生了什么」 |
| `/goal` 目标驱动 + 进度浮层（2.1.139） | 无；zcode G5 同源 | → 与 G5 合并 |
| 任务依赖跟踪（2.1.16） | 任务侧栏无依赖关系 | → dependsOn + 阻塞态 |
| checkpoint/rewind（§三：100/会话、三恢复选项） | 无（zcode P0-4 git-checkpoint 已立项） | → 并入；CC 的「仅对话/仅代码/部分摘要」四选项值得照搬语义 |
| prompt-cache miss 归因（2.1.260/251） | 遥测簇有命中率无归因 | → 后端需原因字段 |
| `/context` 建议 + `/skill-doctor`（2.1.74/261） | 有水位条无建议 | → 与 G4 合并 |
| skills=commands 合并体系（§三） | /hermes/skills 有；IDE 入口无；ChatInput slash 静态 | → zcode P0-3 落地时按合并口径设计（命令即技能） |
| auto memory 四类型（§三） | IdeMemoryPane 简版 | ≈ → 补类型/新鲜度展示（hermes 侧记忆机制待核细节） |
| 通知带耗时/模型（2.1.144/243）+ 更新等待提示（2.1.277） | 遥测簇有 TPS/缓存，通知无耗时 | → 复用 usage 时间戳 |
| code-review 验证轮 / feature-dev 阶段门禁 / pr-review few-shot 路由（§四） | 子代理浮窗无阶段语义；计划浮窗自由文本 | → 两套编排模板（P1） |
| security-guidance 同步拦+异步复查（§四） | 审批门只同步批准/拒绝 | → 异步复查作扩展点 |
| 发送队列灰显+打断全发（2.1.275） | 无队列视觉 | → ChatInput 小改 |
| 输出风格 Concise（2.1.237） | 无 | → 提示词资产即可（explanatory 插件证明 hook 注入法） |
| `/btw` 侧问（2.1.163） | 无 | → P2 候选：不污染主对话的旁路问答 |
| statusline JSON 字段面（§三） | 状态栏遥测簇原生实现（M2） | ≈（形态不同；字段清单可当遥测簇演进菜单） |
| Artifact 共享产物页（2.1.265+） | wiki/白板已有各自定位 | ×（云协作面，暂不适用） |
| TUI 渲染/vim/拼写/emoji | web 工作台形态不同 | × |
| 企业网关/MDM/runner/Claude Tag/计费/模型族 | 产品域不同 | × |

## 六、建议对齐项排序（P0-P2）

| 级 | 项 | 价值 | 成本 |
|---|---|---|---|
| P0 | 会话 recap | 恢复会话成本骤降，长任务日常刚需（2.1.108 产品验证） | 低：hermes 摘要一回合 + 前端面板 |
| P0 | 子代理结果来源标头 | 一行框架堵掉冒充指令注入面（2.1.277；hermes subagent_lifecycle 已有 result 契约可挂标记） | 低：chatStore 渲染层 |
| P0 | 通知补耗时 + 更新等待提示 | 后台任务可感，遥测簇自然延伸 | 低：复用 usage 时间戳 |
| P1 | `/goal` + 进度浮层 | 与 zcode G5 合流，任务侧栏从记录升级为驱动 | 中：hermes 跨轮判定 + 浮层 |
| P1 | 计划模板（feature-dev 范式） | 阶段+完成条件+门禁让计划浮窗可执行可验收 | 中：模板结构 + 审批门挂钩 |
| P1 | 评审/验证轮编排模板（code-review 范式） | 高信号工作流复用到任意检查型任务 | 中：子代理浮窗加阶段语义 |
| P1 | 子代理会话级 spawn/嵌套上限 | 每轮 10 已有，补会话总量与深度（CC：200/3）防失控 | 中：hermes 配置项 + 透出 |
| P1 | hooks 管理入口 | hermes shell_hooks 桥已具备后端，IDE 只缺配置 UI；与 zcode P1-15 合流 | 中：表单 + 信任提示 |
| P1 | 技能入口（skills=commands 合并口径） | zcode P0-3；CC 已证命令并入技能是终态，一步到位 | 中：IdeSidePane 加 tab + 成本列 |
| P1 | checkpoint 四恢复选项 | zcode P0-4 落地时照搬「码+对话/仅对话/仅码/部分摘要」语义 | 中：后端 checkpoint 通道为主 |
| P2 | 缓存 miss 归因 + /context 建议 | 遥测簇从显示到诊断（依赖 G4） | 高 |
| P2 | `/btw` 侧问 / 输出风格 / 发送队列视觉 / ralph 循环 | 体验补强 | 低-中 |
| P2 | @提及六源（file/session 起步） | zcode P1-9 同项 | 中 |

红线重申：以上全部为功能概念对齐，实现一律走 overlay 自研或 MIT/Apache 上游（zcode/dsh-TUI 等），不拷贝本仓任何代码、提示词文本或配置结构。upstream/claude-code 保持只读。
