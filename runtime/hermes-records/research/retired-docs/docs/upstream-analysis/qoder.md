# Qoder 功能普查（M1）：docs.qoder.com 测绘与 SwarmStudio /ide 差距清单

2026-09-21 调研。来源：docs.qoder.com 中文站，从 overview 出发沿导航实抓 34 页（每条论断附 URL；未抓到的页面在文末声明）。文档未自述公司归属；内置模型以 Qwen 系为主、兼有 DeepSeek/GLM/Kimi/MiniMax（`/zh/qoder/model-selector`）。

## 一、产品定位与文档站信息架构

一句话：Qoder 是"增强上下文工程 + 智能体无缝结合"的 Agentic 编码平台，核心理念"Define the goal. Review the result."（定义目标，审查结果）（`/zh/desktop/overview`、`/zh/product-series/what-is-qoder`）。

关键时间线事实：**IDE 中的 Quest 视窗 2026-10-15 下线**，官方推荐迁移到独立产品「Qoder 智能工作台」（`/zh/release-notes/quest-retirement-notice`）。即产品重心已从「IDE 内嵌委派视窗」转向「以任务为中心的独立工作台」——与我们 SwarmStudio 同形态。

文档站信息架构（`/zh/product-series/what-is-qoder` 导航 + `/llms.txt` 索引，desktop overview 提及）：

| 子站 | 路径 | 内容 |
|---|---|---|
| Qoder 工作台 | `/zh/qoder/*` | 新独立桌面产品（Quest 继承者）：任务、记忆、Repo Wiki、自动化、扩展、设置 |
| Qoder IDE | `/zh/desktop` + `/zh/user-guide/*` + `/zh/extensions/*` | Editor 视窗、Quest（将下线）、索引/规则/上下文压缩、MCP、Canvas |
| CLI | `/zh/cli/*` | 终端 Agent：7 种工作方式、扩展、参考、排障 |
| 其他 | `/zh/plugins`（JetBrains）、`/zh/cli/sdk`（Agent SDK）、`/zh/cloud-agents`、`/zh/mobile`、`/zh/qoderwake`、`/zh/account`（企业版） | 周边产品 |

## 二、功能特性清单（按域分组，均带来源）

### A. 核心交互模式

- **双模式工作台**：编程模式（按工作区组织任务，多文件夹）与通用模式（按文件夹/不关联）；任务 = 一次对话，5 步创建流程（选模式→关联项目→说明目标→运行设置→发送审查）（`/zh/qoder/overview`、`/zh/qoder/new-task`）
- **任务看板**：My Quests 三列看板 Running/Waiting/Completed，跨工作区汇总、搜索、卡片跳转（`/zh/user-guide/quest/overview`）
- **Experts 多智能体并行**：多专家协同并行执行，适合全栈/调研/疑难修复；自定义专家团队（`/zh/user-guide/quest/overview`）
- **平铺布局**：拖拽任务拆分多窗格并行对比多 Agent 输出，布局跨会话保留（`/zh/user-guide/quest/overview`）
- **自动化**：计划时间+时区+到期日定时启动；独立输出或合并输出（历史带入下次）；无人值守授权（免逐次确认）；执行记录按天/周/月分组、按自动化与状态筛选（`/zh/qoder/automations`）
- **任务管理**：搜索（标题/用户消息/Agent 回复全文）、排序（最近更新/手动拖动/名称/创建时间）、组合筛选（工作区 × 活动时间）、置顶/标记未读/新窗口打开/导出/复制 ID；**从某条 Agent 回复创建分支任务**；侧边任务（临时并行对话）；归档/恢复/永久删除（`/zh/qoder/task-management`）
- **模型档位**：Auto 智能路由（~0.5×）/极致 2.0×/性能 1.1×/高效 0.3×；指定模型列表（Qwen3.8-Max 等 11 个）；自定义模型（自己的 API Key）；上下文窗口 200K/400K/1M 与思考强度 low~max 参数；企业专属模型页（`/zh/qoder/model-selector`）
- **语音**：语音输入、实时语音、录音纪要（`/zh/qoder/new-task`、`/zh/qoder/settings`）

### B. 上下文与记忆

- **代码库索引**：Workspace 级跨工程索引；上限 10 万文件；<1 万文件默认自动增量更新；`.gitignore`/`.qoderignore`/自定义忽略模式（通配符、取反）；仅上传必要代码文件生成向量，云端不留源码（`/zh/user-guide/indexing`）
- **Repo Wiki**：本地启动多个 Agent 做任务规划→代码检索→文档结构规划，为仓库生成 Wiki；语言可选中英；**自动增量更新 + 自动导出 Markdown + 「引用」选项允许任务中自动作为上下文**；本地生成不上传全量代码，默认关闭（`/zh/qoder/repo-wiki`）
- **知识库（Knowledge Base）**：集中管理参考文件，任务中作为上下文使用（`/zh/qoder/repo-wiki` 相邻页摘要，详情页未抓取）
- **记忆**：全局记忆 + 项目记忆两级，分别开关、查看文件数与更新时间、打开目录、清空；定位为"跨任务复用的偏好、背景、经验"，与 Repo Wiki（代码库生成）、知识库（团队维护）三分（`/zh/qoder/memory`）
- **CLI 记忆机制**：三层——对话上下文（会话内，/clear、/compact）/项目说明（AGENTS.md 三级：`~/.qoder/AGENTS.md`、`<project>/AGENTS.md`、`AGENTS.local.md`；`.qoder/rules/` 按主题拆分）/长期记忆（auto-memory 自动保存为 Markdown，/memory 面板管理）（`/zh/cli/how-memory-works`）
- **上下文压缩**：会话上下文用量实时查看；「压缩当前会话」智能总结（保留关键代码逻辑）；新建会话切换话题；对话早期与生成中禁用压缩（`/zh/user-guide/chat/smart-context-control`）

### C. 规范与规则

- **规则体系**：存于 `.qoder/rules/`，随 Git 共享；四种作用域——手动引入（@rule）/模型决策（按场景描述自动应用）/始终生效/glob 指定文件生效；与 AGENTS.md 兼容且冲突时规则优先；合计上限 10 万字符（`/zh/user-guide/rules`）
- **自定义指令**：用户级 `~/.qoder/commands/` + 项目级 `<project>/.qoder/commands/`，输入 `/` 浏览筛选调用；示例模板 /code-inspect、/security-check、/create-pr、/gen-agents-md（`/zh/user-guide/commands`）
- **Better Harness（知识引擎）**：内置"工程专家"Agent，审视项目的 Rules/Skills/Hooks/MCP/Custom Agents 资产；三只读子 Agent 独立解读（自定义资产/任务会话记录/工程基础）再汇总避免污染；**五维报告**（任务理解/可控执行/改动验证/可靠交付/经验沉淀）+ 优化点卡片（优先级、可忽略）+ 以 Quest 任务形式一键修复（不自动改代码）；用量热力图、长会话（>45min）待复核（`/zh/user-guide/knowledge-engine/better-harness`）

### D. MCP 与集成（扩展体系）

- **MCP**：设置→MCP，JSON 配置 STDIO/SSE/Streamable HTTP 三种传输；MCP 广场一键安装；服务超时时长设置；依赖缺失一键修复；工具调用前确认（可勾选后续自动）（`/zh/user-guide/chat/model-context-protocol`）
- **连接器**：市场按类浏览（项目管理/数据库/文档/自动化）；自定义 MCP 属用户级 `~/.qoder/settings.json` mcpServers 字段，表单或 JSON 两种添加方式（`/zh/qoder/connectors`）
- **技能 Skills**：市场（分类/热门/最新/搜索）；自动匹配或 `/` 手动指定；用 Qoder 引导式创建或上传 ZIP/SKILL.md；技能=单一能力封装（`/zh/qoder/skills`）
- **插件 Plugins**：技能+连接器+智能体+命令+规则+Hooks 的组合扩展包；市场安装/引导创建/ZIP 导入（`/zh/qoder/plugins`）
- **子智能体**：专门角色的独立指令/上下文/工具集；由插件提供，`/` 选择或自动匹配；最小权限原则（`/zh/qoder/subagents`）
- **Hooks**：20+ 生命周期事件（SessionStart/End、UserPromptSubmit、Pre/PostToolUse、PermissionRequest、Stop、SubagentStart/Stop、Pre/PostCompact、ConfigChange、WorktreeCreate 等）；4 种 handler（command/http/prompt/agent）；用户级 `~/.qoder/settings.json` + 项目级 `.qoder/settings.json`（共享）与 `settings.local.json`（本机）；matcher 限定范围（`/zh/qoder/hooks`）
- **内置浏览器**：Agent 可导航/读取/交互/截图/注释；多标签页、localhost 本地服务访问；页面指令视为不可信内容（`/zh/qoder/browser`）

### E. 协作与分享

- **Canvas 画布**：基于 `.canvas.tsx` 文件，Agent 生成/修改、预览实时渲染；统计卡片/表格/图表/结构图节点；**画布上标注圈选反馈给 Agent**；企业内发布分享；封装为 Skill（`/zh/extensions/canvas`）
- **移动端/网页版远程控制**：同账号登录接管桌面任务；任务总览（运行中/已就绪/已归档）；**移动端审批关键操作与审核 Plan**；7×24 持续运行（`/zh/mobile/app/remote-control`）
- **企业版**：采购/成员/身份/策略/审计（`/zh/product-series/what-is-qoder`）

### F. CLI 与执行环境

- **CLI 7 种工作方式**：交互 TUI / Plan（只读出方案）/ Goal（自主到底，如"测试全修绿"）/ 定时任务 / /loop 固定间隔 / Workflow（多 Subagent 分解并行）/ Headless（`--print` 输出 Text/JSON/StreamJSON，预配权限进 CI）（`/zh/cli/working-modes`、`/zh/cli/overview`）
- **执行环境四种**：本地工作区 / Git Worktree（隔离并行，设置中管理保留与备份）/ SSH 远程工作区（读 ~/.ssh/config，命令与文件操作在远端）/ 不指定工作区（纯问答）；任务创建时选定不可中途切换（`/zh/qoder/execution-environments`）
- **Cloud Agents**：API 定义 Agent（模型/system prompt/工具集）+ 环境（容器/依赖/启动脚本）；Session + SSE 流式事件；多 Agent 编排、并行多 Session、自然语言管理定时；PAT/SAT 认证；沙箱销毁即清数据（`/zh/cloud-agents/overview`）
- **QoderWake（Waker 数字员工）**：持续职责的岗位化 Agent；任务看板、@Waker IM 路由、Group 多角色团队（Leader 分工）、WakerFlow 流程编排、自我进化 Skills（`/zh/qoderwake/overview`）

### G. 安全

- **代码安全三档扫描**：静态检查（免费，危险调用/凭证泄露）→ 轻量扫描（~5 Credits/500 行，语义风险如 SQL 注入）→ 深度扫描（~20 Credits/500 行，跨文件数据流）；问题审查流程（严重程度/文件/行号→Agent 修复→复扫）（`/zh/qoder/code-security`）
- **安全实践页**：账号/SSH 主机/MCP 配置核对、凭证不入任务、可疑时停任务断服务轮换凭证（`/zh/qoder/security-and-authorization`）

## 三、与 SwarmStudio IDE 工作台差距对照（overlay/custom/client/ide/）

| Qoder 能力 | 我方现状（组件） | 裁决 | 理由 |
|---|---|---|---|
| 任务=对话、5 步创建、审批门 | IdeChatPane（流式+审批门）+ IdeTaskSidebar | ≈ | 平手 |
| 任务看板/搜索/排序/筛选/归档/分支任务 | IdeTaskSidebar（分组/置顶/归档/时间线） | ≈（缺分支任务） | 从某条回复 fork 任务可低成本补 |
| Plan/Goal 模式 | IdePlanFloat 计划浮窗 | ≈ | 缺 Goal"自主到底"档，语义可后补 |
| 子代理 | IdeSubagentsFloat（subagentStreams） | ≈ | 无 / 前缀选择与角色库 |
| 终端 | IdeTerminalDock/Panel | ≈ | 平手 |
| Git 面板+提交历史 | IdeGitPane/IdeGitLog | ≈ | 平手（Qoder 审查提交在任务功能区，形态不同） |
| MCP 管理 | IdeMcpPane（表单+对话式配置） | ≈（我方对话式领先） | Qoder 仅 JSON+广场；补超时设置即可 |
| 记忆面板 | IdeMemoryPane | ≈（缺两级开关/目录/清空语义） | Qoder 全局+项目分治值得借 |
| Wiki | IdeWikiPane | → | 面板已有，缺 Repo Wiki 式"Agent 生成+增量+引用注入"闭环 |
| 规则体系（四型作用域） | 无（AGENTS.md 由用户级纪律约定） | → | 落点 IdeMemoryPane 扩展或新 pane + hermes 注入 |
| 上下文水位+压缩 | IdeStatusBar 遥测簇（水位/TPS/命中率） | ≈（缺手动压缩入口） | 补"压缩当前会话"按钮+禁用时机判断 |
| 命令 / 触发 | IdeCommandPalette | → | 输入框 / 触发指令/技能/子代理，统一扩展入口 |
| 扩展市场（Skills/插件） | 无工作台入口（hermes 侧有技能） | → | 落点 IdeSidePane 或设置页 + / 联动 |
| Hooks 配置界面 | 无 | → | 生命周期事件表可映射 hermes-agent 事件 |
| 自动化（定时+无人值守+执行记录） | 无 | → | 落点 IdeTaskSidebar 扩展 + 后端调度 |
| Worktree/SSH 执行环境 | 无（用户级 AGENTS.md 纪律要求 worktree，产品未支持） | → | 任务发起处加执行环境选择，与既有纪律天然吻合 |
| 模型档位/Auto 路由/思考强度 | upstream 模型选择（基础） | → | Auto 档与 low~max 思考强度参数 |
| 代码安全三档扫描 | 无 | →（依赖后端） | 静态检查可用 lint 近似，语义/数据流需 agent |
| Better Harness 体检 | 无 | → | 概念可移植：扫描规则/技能/记忆资产产五维报告 |
| 内置浏览器 | IdeSidePane browser tab | ≈ | 平手 |
| Canvas 标注反馈 | IdeWhiteboardPane | →（形态不同） | 白板补"Agent 生成+标注回传"即接近 |
| 移动端审批 | 无移动端 | × | 需整条移动产品线，远期 |
| CLI/SDK/Cloud Agents/QoderWake/企业版 | 无 | × | 不同产品线/商业化范畴 |
| Credits 计费、桌面宠物、QQQ 游乐场、PPT/站点 | 无 | × | 商业化与外围玩具 |

## 四、建议对齐项排序

**P0（高价值低成本，纯前端或轻后端）**
1. **Repo Wiki 生成闭环**：价值——上下文质量是 agent 输出上限，Wiki 面板已有只差生成管线；成本——一个 hermes 任务模板（多子代理：检索→结构→成文）+ IdeWikiPane 加进度与"引用"开关。
2. **规则体系四型作用域**：价值——把用户级 AGENTS.md 纪律产品化（always/模型决策/@手动/glob 四型 + 全局/项目分治）；成本——IdeMemoryPane 扩展 + 规则文件注入 prompt，纯面板+注入层。
3. **输入框 / 触发体系**：价值——指令/技能/子代理统一入口，Qoder 扩展体系的交互骨架；成本——ChatInput 补前缀建议列表 + 指令库（用户级/项目级两目录）。

**P1（结构性增量，需后端配合）**
4. **任务级 Worktree 执行环境**：价值——与本仓既定 worktree 纪律完全同构，产品内化后普通用户也能获得隔离；成本——任务发起 UI 选项 + git worktree 生命周期管理（创建/回收/合并）。
5. **自动化定时任务**：价值——工作台从"被动应答"变"持续运转"（巡检/日报）；成本——后端调度器 + 执行记录视图 + 无人值守授权模式。
6. **Better Harness 式工作台体检**：价值——Qoder 独有概念中对自建工作台最可移植的：扫描自身规则/技能/记忆资产产五维报告，呼应我方"质量靠门禁不靠自觉"；成本——一个只读分析任务 + 报告面板。
7. **会话手动压缩入口**：价值——水位已有，缺泄压阀；成本——ChatInput/状态栏按钮 + 禁用时机（生成中/早期）。

**P2（差异化方向，择机）**
8. 代码安全三档扫描（静态可先 lint 近似）；9. 白板升级为 Agent 生成+标注回传（Canvas 概念）；10. Auto 模型路由与思考强度档位；11. Hooks 生命周期配置界面；12. 任务分支（从回复 fork）。

## 附：未抓取页面声明

以下页面在导航中出现但未深入抓取（多为外围或支持页），本文不对其功能下论断：`/zh/qoder/quickstart`、`/zh/qoder/data-import`、`/zh/qoder/sites`、`/zh/qoder/presentations`、`/zh/qoder/desktop-pet`、`/zh/qoder/indexing`（IDE 版索引已抓）、`/zh/qoder/network-proxy`、`/zh/qoder/faq`、`/zh/qoder/better-harness`（工作台版，IDE 版已抓）、`/zh/cli/sdk/*`、`/zh/plugins/*`（JetBrains）、`/zh/account/*` 详情、Cloud Agents/CLI 的参考与排障子页。知识库（Knowledge Base）仅有相邻页摘要级信息。
