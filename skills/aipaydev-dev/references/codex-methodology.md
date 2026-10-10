> **何时读我**：优化执行纪律（截断/压缩/缓存/rubric/测试哲学）时。OpenAI Codex CLI——省 token 生成期必读文件/review rubric/测试哲学。

# Codex 执行纪律方法论（OpenAI Codex CLI——省 token / 高效 / 质量三线）

> 来源：[openai/codex](https://github.com/openai/codex)（Rust 实现的本地编码 agent，Apache-2.0，2026-08 调研，基于官方文档 + `codex-rs` 源码核对：`compact.rs`/`compact_token_budget.rs`/`truncation.rs`/`prompts/templates/compact/*`/`review/rubric.md`/`protocol/src/prompts/base_instructions`）；版本口径见文末「版本基线」，各版本能力见其后各节。
> 纪律：**非运行时整合**——Codex 虽是 swarm-yuan 的 7 个安装目标之一（install.sh 检测），本文不调用 codex CLI，只吸收其「为什么省 token、效率高、质量高」的执行纪律，供生成目标技能的 AI 遵守 + 编织进目标技能的 workflow/执行 prompt。对齐决策 27 吸收模式（cordis/context-engineering-layering 先例），不新增门禁（守决策 26）。

## 一、省 token 生成期必读文件（截断—压缩—缓存，全部是硬机制非玄学）

Codex 官方 `--json` 实测：`input_tokens: 24763, cached_input_tokens: 24448`——**98.7% 缓存命中**。三条机制叠加达成：

### 1.1 工具输出 head+tail 双端截断（只截一次）

- 每条 shell/工具输出设 **token 预算**（等价 Codex `tool_output_token_limit`），超限**保留首尾、截中间**，插入 `…N tokens truncated…` 标记（形如 `1..19 [截断标记] 129..150`——头部尾部都留，因为开头通常是错误信息、结尾通常是汇总）。
- **只截断一次**：对已截断内容不二次截断（防截断叠加膨胀）。
- 每条 shell 输出带结构化头：`Exit code / Wall time / Total output lines`——让 AI 用最少 token 判断成败，不必重读输出正文。
- **禁止绕过**：不用 python 脚本输出大段文件内容（防借道绕过截断）。

> **目标技能落地**：workflow 的执行 prompt 写明「跑测试/lint 输出超 ~500 行时只留头尾各 30 行 + 截断标记 + Exit code 行」；swarm-yuan 的 `trace-log.sh` 已带结构化字段（ts/gate/status/ids/duration），生成技能沿用此纪律。

### 1.2 CONTEXT CHECKPOINT 压缩（四段交接模板）

Codex 的 compaction prompt 原文结构（`prompts/templates/compact/prompt.md`）——为「另一个将接手的 LLM」写交接摘要：

1. **Current progress and key decisions made**（进度 + 已做决策）
2. **Important context, constraints, or user preferences**（约束 + 用户偏好）
3. **What remains to be done (clear next steps)**（剩余步骤）
4. **Any critical data, examples, or references needed to continue**（续跑必需的数据）

压缩后重注入前缀的关键句："Use this to **avoid duplicating work**"（防重复劳动）。多次压缩的摘要**按序重注入**（不丢早期摘要）。两条压缩路径：模型摘要式（零 token 换不来时用）与 **token-budget 式**（跳过摘要直接换新上下文窗口，零摘要成本）。

> **目标技能落地**：swarm-yuan 已有 builder-journal compaction 续传；生成技能的长任务中断恢复按四段模板写 journal，恢复时先读 journal 防重做。

### 1.3 稳定前缀换缓存命中（AGENTS.md 固定注入）

- 项目规范文件（AGENTS.md，从 CWD 到根聚合）**固定注入 developer message**——不重复读取、位置稳定 → prompt 缓存前缀稳定（实测 98%+ 命中）。
- **字节预算**：`project_doc_max_bytes` 默认 **32KiB**，超限截断。
- 反例（要避免）：每轮动态拼装规则文本 → 缓存全失效。规则应**静态分层**（常驻的固定、按需的按需）。

> **目标技能落地**：生成技能时，特征卡/铁律等常驻内容放 SKILL.md 头部（稳定前缀），方法论文档放 references/ 按需读——这正是 swarm-yuan 决策 32（上下文压缩折叠）的设计，Codex 的数据（98.7% 命中）印证其有效性。

### 1.4 渐进披露（frontmatter-only 常驻）

Codex Skills 只常载 frontmatter（name/description），正文按触发注入（`skills.frontmatter_max_bytes`）。

> **目标技能落地**：同决策 32——SKILL.md 只常驻「做什么 + 何时用」，Step 详解折叠到 generation-flow.md 按需读。门禁清单一行一 flag（`--list-gates`），不常驻 55 条正文。

## 二、Review rubric 工程化（什么算 bug 的 8 条判定 + 结构化输出）

来源：`review/rubric.md`（95 行）。swarm-yuan 的门禁输出（fail id + 修复建议）可沿用其判定纪律：

### 2.1 什么算 bug（8 条判定，直接可抄）

1. **bug 必须是本次变更引入的**——已存在的旧 bug 不报（`The bug was introduced in the commit`）。
2. **必须可定位**——"可能影响其他部分"不算，必须指出**可证明受影响**的其他部分（`provably affected`）。
3. **修复代价与本仓 rigor 水平相称**——不要求全仓没有的严谨度（`not demand a level of rigor not present in the rest of the codebase`）。
4. 修复它须是**可行的**（不是"重写整个模块"级）。
5. 有**具体触发路径**（输入/状态），不是理论存在。
6. 违反的是**明确的规则**（须引用项目规则文件，见 2.2）。
7. 不是 speculation/猜测性发现。
8. 不报与本次变更无关的问题（`unrelated bugs`）。

### 2.2 结构化 finding + 规则溯源

- 每条 finding：**title ≤80 字符 + P0-P3 优先级 + confidence_score + 引用规则文件**（`verify the applicable project instruction file (AGENTS.md) that supplies the rule`——防幻觉引用，Codex 原文 "Do not fabricate citations"）。
- 末尾**强制二值结论**：`overall_correctness: "patch is correct" | "patch is incorrect"`——不许和稀泥。

> **目标技能落地**：生成技能的 review 节点（workflow 节点⑥/审查）输出格式带 P0-P3 + 规则引用（指向目标技能自己的 spec/铁律文件）+ 二值结论。swarm-yuan 门禁的 fail 输出已带 id + 建议，增量是优先级分级 + 规则溯源指针。

### 2.3 Auto-review 二级审批

越权/沙箱外请求 → 独立 reviewer 按 **POLICY.md**（Markdown 策略文件）判定 → 拿不准才升级问人。审批也自动化，但策略是显式文件可审计。

> **目标技能落地**：目标技能的防作弊门（integrity-guard）已是确定性 deny/advisory 两档；增量思路是「advisory 档的裁决依据写成显式 POLICY 段落，让 AI 复核时引用」。

## 三、测试哲学（写进执行 prompt 的纪律）

来源：Codex base instructions：

1. **narrow → broad 顺序**：先跑「与本次改动最相关的窄测试」快速捕获问题，建立信心后逐步扩大范围（`start as specific as possible... then make your way to broader tests`）。
2. **格式化最多迭代 3 次**：格式化工具反复改不干净就停下查根因，不无限循环。
3. **不往无测试的仓库塞测试**（`do not add tests to codebases with no tests`）——尊重项目现状。
4. **按审批模式调激进度**：无人值守模式（`never`）主动跑测试/lint；交互模式（`untrusted`）等用户就绪再跑。
5. **修根因不打补丁**（`Fix the problem at the root cause rather than applying surface-level patches`）。
6. **改完不回读**：`apply_patch` 成功的文件不重读验证（补丁式编辑失败即报错，成功即成功）——省一轮读文件。

> **目标技能落地**：这些直接进生成技能 workflow 节点⑤（编码实现）的执行 prompt；第 6 条依赖 AI 运行时的补丁式 Edit 语义（Claude Code Edit/Codex apply_patch 均满足）。

## 四、引入边界（诚实排除——不适合 skill 层的机制）

以下机制是 **agent harness 的职责**（Claude Code/Codex CLI 这类运行时自己实现），swarm-yuan 作为 skill 层不重复造：

- **OS 级沙箱**（Seatbelt/bwrap）：运行时职责；swarm-yuan 的 precheck 门禁跑在用户自己的 shell。
- **模型路由**（mini 干杂活/旗舰主审）：运行时控制模型调用。
- **Hooks 确定性裁决**：swarm-yuan 已有等价物（55 门禁本来就是确定性 bash 检查 + integrity-guard/failure-detector hooks）。
- **并行子代理调度**（spawn_agent/max_threads=6）：运行时的编排原语；swarm-yuan 的 subagent-orchestration.md 已引用方法论。

## 五、与其他 references 的关系

- **印证决策 32**（上下文压缩折叠）：§1.3/§1.4 的缓存数据（98.7% 命中）是决策 32 设计的外部证据。
- **补强 `review-methodology.md`**：§2 的 rubric 判定与五维度审查互补——五维度定「查什么」，rubric 定「什么算 finding」。
- **补强 `memory-persistence.md`**：§1.2 的 checkpoint 模板与 builder-journal 互补——journal 记「状态」，checkpoint 模板定「交接摘要的结构」。
- **补强 `subagent-orchestration.md`**：§3 的测试哲学进节点⑤执行纪律。

---

## Codex 宿主能力速览

> 版本口径与逐版变化见 `docs/upstream-baseline.md`；本节为当前宿主形态速览。

### hooks 异步命令 + MCP 工具调用

Codex hooks 支持**异步执行命令**并**调用 MCP 工具**——precheck 门禁可注册为 Codex hook 而非仅靠 prompt 约定，门禁"执法"在 Codex 侧有官方强制点（本仓 fail-gate-hook.sh 在 Claude Code 侧已有 PreToolUse/PostToolUse 强制点，Codex 侧经 hooks 事件面对齐）。

### Agent Plugins 四类目录

可移植插件安装，跨 local/personal/workspace/remote 四类目录搜索。生成技能的分发备选通道：打包为 Codex 插件而非仅放 `~/.codex`。

### 会话资产化

- `codex exec fork` 派生会话 + TUI resume 选择器归档/恢复
- `/export` 会话完整导出 Markdown——门禁验收记录可随会话导出留档
- 排队消息（向既有会话排队消息 + 跨进程分发）
- `codex agents` 仪表盘 + 异步用户消息工具——多代理管理界面

### Guardian 审批体系

`--approve-for-me` CLI flag 是自动审批正式入口；Guardian v2：风险分类、transcript 图像纳入审查、默认跳沙箱命令、风险评分错误 fail-closed、可代替必需模型审查。生成技能中的高危门禁命令（删除/依赖升级）可标注给自动审批分类器。

### skill-creator validation 拒绝 TODO 占位符

未完成的 TODO 占位符不能通过 Codex 内置技能验证。本仓 `--verify-completeness`（无占位符检测，P0/P1 分级）同构，方向验证。

### 兼容性下限

1. 用 `--sandbox workspace-write`（`codex exec --full-auto` 不可用）。本仓生成脚本无 `--full-auto` 引用；install.sh 对 Codex 目标的检测按下限 0.147 处理。
2. skills 不支持指定委托模型（技能模型委托不可用）。本仓无按子任务指定模型的设计。


## Codex hooks 事件面与信任机制

> 来源：《Harness实践》实测（`docs/research/R37-harness-practice-absorption.md`）。

- **hooks 事件切面**：文档口径 11 类（SessionStart/SessionEnd/UserPromptSubmit/AgentTurnStart/AgentTurnEnd/Interrupt/PreToolUse/PostToolUse/PreCompact/Stop/Notification；CLI 界面另列 12——多出项即 Interrupt 的界面呈现差异）。与 Claude Code hooks 的对照面（Claude Code 与 Codex 两类宿主）：swarm-yuan 两宿主 hooks.json 覆盖 Write/Edit/Bash 面，Interrupt/PreCompact 面在 Codex 侧未接入。
- **matcher 按工具名正则**：`matcher = "Edit|Write"` 可拦 apply_patch 类写操作（Codex 的文件修改原语）；hook 经 stdin 收 JSON、stdout 回 JSON 协议，`permissionDecision: "deny"` 即拦截——与 Claude Code hook 协议同构，两宿主适配按此对齐。
- **trusted_hash 信任门禁**：hooks 配置带内容哈希，改动未复审即失效——与 Ponytail"装完≠激活"（lazy-generation-methodology §三）同类设计：**信任锚定内容而非位置**。
- **多来源全加载**：全局/项目/插件 hooks 全量加载并发执行（不互斥）——生成技能向 Codex 宿主注入 hooks 时须幂等（重复注册去重，同 self-check MCP 重复注册检测口径）。
- **timeout 语义**：默认 600s；SessionEnd 硬预算 1s（上限 3s）——短事件面挂重检查会静默丢失，Stop/SessionEnd 只放轻断言。
- **`[features] hooks = false`**：会话级一键关停——诚实披露面：宿主可整体禁 hooks，门禁证据在 hooks-off 会话不可作数（与 restricted 会话同口径）。
- **`$` 执行 / `@` 引用**：AGENTS.md 里 `$cmd` 把命令输出注入上下文、`@file` 引用文件——项目指令的动态上下文原语，目标技能 AGENTS.md 可用此原语（慎用：动态注入破坏缓存前缀稳定性，见 §1.3）。

## 版本基线

方法论以 npm/GitHub stable 基线版本为准核验（当前 rust-v0.160.0）。供应链登记（许可证 / 版本 / drift 状态）见仓库 `docs/upstream-baseline.md`（仓库档案，不随技能分发）。各版本能力见以下各节。

## v0.149-0.152 能力

- **Guardian v2**（v0.149-152）：`--approve-for-me`（别名 `--not-so-yolo`，默认关闭）fail-closed 评审（90s 超时严格 JSON）；**用户显式调用的 skills 受信任**（v0.151）；过期风险分类不授权（v0.151）；跨 compaction 保留授权（v0.152）。**门禁产出的结构化 PASS/FAIL 结论可被 Guardian 引用为 trusted context——证据态输出与宿主审批体系衔接。**
- **skills token 预算**（v0.149）：`[skills] max_context_tokens`（默认 2% 上下文、上限 10k）——技能目录进 prompt 前有预算截断 + 实验性路由。本仓生成技能 frontmatter 三行制紧凑已满足；多技能项目须知目录 token 成本。
- **破坏性变更两处**：①v0.150 untrusted 项目不加载项目级 AGENTS.md——install.sh 走用户级 `~/.codex/skills` 无暴露面；②v0.152 planning 工具默认禁用——目标技能自备 spec/plan 文件不依赖宿主 plan 工具。
- **Interrupt hook 事件**（v0.150；hooks 共 11 事件）；**extensions 可拦截/替换 MCP 工具结果**（v0.151）。
- **安全加固**（v0.150）：config/sed 解析 fail-closed、Seatbelt/bubblewrap 加固、app 签名校验（与 Claude Code v2.1.246-252 的加固一致）。
- **会话资产化**（v0.149-152）：agents 仪表盘、queue、`@` mention 任务、per-tool `output_token_limit`（v0.152）、thread/shellCommand 超时 >1h 可配置。

## v0.153.0-0.153.4 能力

- **Guardian 条件性兜底**（v0.153.0，#42147/#42256）：Full Access 与 User approval 模式跳过 Guardian 评分/评审（含活动中途切换）；computer-use 评分尊重模型要求（v0.153.1，#42424）。**执法确定性落在自持门禁：Guardian 复核是条件性兜底，宿主审批层不保证在场**——与 Claude Code v2.1.260（Read deny 不作用于 Bash 参数）一致：「hooks fail-open 须下层门禁兜底」，宿主治理层整体视为条件性。
- **回合中结构化问答原语**（v0.153.0，#42178）：`request_user_input_async`（旧名 `send_user_message_async`）带建议答案的结构化问题、回合继续执行、按模型可用性限定——人机协作点进入协议层 schema。Interrupt hook 可按「打断→问答→续跑」实现守护点；本仓交互面走宿主审批通道，不另引入交互原语。
- **hooks 内置白名单三层信任**（v0.153.0，#42110）：allowlisted bundled cleanup hooks 标记 `builtin: true`，信任态直接 Trusted 且无视 per-hook enabled——hook 信任模型分三层（builtin/managed/user）。本仓用户级 PreToolUse 三能力整合不受影响（上游仅测试结构体加字段）。
- **实验性 context management**（v0.153.0，#42385）：`features.context_management.experimental_mode`——token 预算上下文 + history notes + `new_context` 工具；仅 ChatGPT Plus/Pro/Pro Lite 且 Codex 后端，自定义 provider 禁用（experimental、后端限定，未 GA）。与 v0.149 `[skills] max_context_tokens` 预算机制相邻。
- 其他能力：插件 CLI 远程 marketplace（#42150/#42149，含源策略约束）；network requirements 增 `header_injections`（企业托管向）；权限变换感知 executor 路径上下文（`sandboxing/policy_transforms.rs`）。
- 版本构成与兼容性：0.153.1-0.153.4 为 GPT-6-Astra 模型目录热修；`disable_paste_burst` 移入 `[tui]`，旧键走 legacy fallback。

## v0.154 能力

- **worktree 隔离**（v0.154.0，#42652/#43069）：`--worktree` / `/worktree` 为新会话或 fork 创建隔离检出、可浏览恢复——**会话与工作区隔离进宿主**，与 Claude Code v2.1.257 `permissions.blockReadsOutsideWorkingDirectories` 互为对照。生成技能并行门禁（多 worktree 验证）可引用此宿主原语。
- **inline 追问**（v0.154.0，#42891）：工作继续中用建议选项或自定义文本回答问题、不丢主草稿——`request_user_input_async`（0.153）的交互面扩展，可用于 Interrupt 守护点（打断→问答→续跑且用户草稿不丢）。
- **plugin/skill 热刷新**（v0.154.0，#42284）：外部 plugin 升级/回滚后已有会话刷新 skills 与 hooks——与 Claude Code `--plugin-dir` 热装载（265）一致，技能热装载是两类宿主的共同能力；生成技能 `--upgrade` 后宿主侧不再要求重启会话。
- **Guardian 授权治理**（v0.154.0，#42844/#43442）：审批上下文跨 compaction 保持、新用户指令或答案作废既有审批——**授权的时效性与上下文完整性是审批系统的一等语义**（同 0.151「过期分类不授权」）。对本仓：门禁产出的 PASS/FAIL 证据若被宿主审批引用，其有效期与作废条件须显式声明。
- **信任边界与硬化**：信任建立前不运行 workspace 控制的 helpers（#42324）+ macOS 沙箱防终端输入注入。
- **`codex mcp-server` 入口移除**（v0.154.0，#42993，破坏项）：deprecated 入口不可用。本仓 `install.sh`/`self-check.sh`/`SKILL.md` 无该入口引用，无暴露面。
- 其他能力：GPT-6-Astra 进 model picker / Windows 共享后台 server + daemon 生命周期 / Vim `R` replace 模式 / `/copy` 富文本（运维便利）。

## rust-v0.155.0 能力

- **Guardian 授权治理深化**：审批评审绑定发起执行（网络审批不得脱离原上下文裁决）+ 评审消费捕获时的 action settings（评审所见=执行所用）+ 授权证据保全至请求预算化 + 完整动作保全于评审记录——**审批的完整性、归属、时效三轴**在单一治理对象内闭环。
- **遥测最小化**：skill analytics 不携带 repo_url、Guardian 评审分析不携带路径字段——分析事件不得携带仓库身份与文件路径；**可观测性与隐私的边界画在字段级**。
- **认证属主绑定**：认证属主变更即重置 WebSocket 缓存态 + 远程控制会话绑定认证属主——凭证换手后旧派生态必须失效。
- **压缩失败保全输入**：pre-turn compaction 失败不丢 incoming prompts——压缩是优化不是门槛，fail-safe 方向为保用户输入。
- **错误语义分化**：HTTP 配额错误与限流分开报告 + MCP status 快照披露 OAuth 失败——错误分类驱动不同处置，不许合并糊报。
- **分域有界化**：MCP 描述与 Guardian action JSON 分别限界（一处超界不拖垮另一域）+ app-server stdio 有界关闭 + SIGTERM 优雅退出。
- 其他能力：会话隔离与子代理归属解耦（#44521，单机场景无对应）；Windows 沙箱修复；voice 功能 alpha 排练。

## rust-v0.155.1 能力

- **TUI reasoning summary 默认 none**（0.155.1）：默认值变更与行为变更同等纳入回归测试（默认值回归同类先例：claude 270/276）。

## rust-v0.156.0/0.156.1 能力

- **`/tui` 全屏交互 transcript**（#46732/#46849）：搜索/鼠标选择进 TUI——会话记录是可检索的一等产物，与本仓 trace.jsonl 一致。
- **Agent message boards 持久化**（#46959/#47029/#47042）：根线程删除连带删板 + **删除中损坏存储可恢复**——**消息持久化原语**（对应 dsh 的消息归属机制）：多代理消息先持久化再消费，删除=事务（连带、可恢复、失败不损既有）。
- **失败/中断/子代理完成事件保留流式答案与计划**（#45549/#46867）——中途产物不因失败而丢弃（与本仓「完成 ≠ 中途停」分级、gate-report partial 态同构）。
- **worktree 支持默认启用**（#46839）+ 会话复用既有 daemon（#46498）。
- **opt-in compaction after final responses**（#46541）——压缩时点显式：应答完成后才压（不在轮中），上下文操作不打断用户可见流。
- **reasoning effort 以模型显式支持为闸**（#46530）——能力未声明不启用；默认值变更与行为变更同等纳入回归测试（涉及新线程 reasoning summary 默认值）。
- **Guardian 策略解析集中化**（#45957）：策略判定在 config+protocol 单点——**规则单一事实源**，与本仓「特征卡立法」同构。
- 网络与沙箱：系统代理回落登录；沙箱修复（Windows 入站/特权 socket/只读句柄写入）；Unix socket 与受限命令隔离（与本仓门禁面无对应原语）。

## rust-v0.157.0 能力

- **可撤销许可门禁**：redirect/响应体/WebSocket 都持 permit，策略收紧即取消在途，**deny 不可重试且不记成功**，策略加载失败即断网——工具调用持带生命周期的许可，策略变更作废在途。
- **检查点自带恢复元数据**：`resume_metadata` 记版本/起始 turn/设置，与压缩检查点同写——`state.yaml` 与 compact 绑定写恢复状态。
- **派发原子性 + 孤儿清理**：子代理取消即拆存储态、关 spawn edge，**驱逐与排队消息互斥**——provisional 任务失败即回收。
- **产出带来源归属且跨状态持久**：provenance 跨 compaction/resume 存续——产物打 actor 标记进 `trace.jsonl`。

## rust-v0.157.0→0.158.0 能力

- **中断错误结构化**：Guardian circuit-breaker 中断为 opt-in 结构化错误（错误带类型，非字符串匹配）。对本仓：rules.d 的 forbid 条款已带替代方案，错误面同样可机读可分支。
- **Guardian 历史跨压缩独立保留**：评审证据不因父会话 compaction 而丢失——治理证据的生命周期与会话压缩解耦（同 0.157「provenance 跨 compaction 存续」纪律）。
- **MCP 单服发现 + 线程级连接复用**：status discovery 按单服按需进行 + 连接复用——大型 MCP 编排下的探测经济学。
- **历史感知预热**：空闲线程按使用历史预热（预热是有依据的预测，不是全量常驻）。
- **Windows 沙箱加固**：ETXTBSY 竞态集中创建可执行 fixture、受限启动器回退 embedded 模式、pip 子进程无控制台窗——Windows 的「进程卫生」清单可并入 cross-platform 纪律。

## rust-v0.158.0 能力

> 以下条目与上一节的五项主题（Guardian 结构化中断/MCP 单服发现/历史感知预热/Windows 沙箱加固/Mermaid 扩展）同属 rust-v0.158.0。

- **治理证据完整性**：Guardian 评审保留助手上下文与消息序（`#47582/#47584/#47585`）、评审绑定动作的目标环境（`#47630`）、`user_message` 工具进授权上下文（`#47624`）——授权判定依据完整证据链 + 环境绑定。对本仓：审批门禁的证据摘要应带目标环境维度。
- **exec-server WebSocket 承载令牌鉴权**（`#47601/#47648`，独立 crate `codex-websocket-auth`）+ MCP OAuth client secret 预注册（`#47891`）——本机进程间连接与生态准入的凭据面为显式凭据（非默认信任）。
- **子进程启动器归一**：共享 child launcher 统一接管 shell 快照/管道/PTY/钩子（`#47605/#47610/#47611/#47617`）+ reap-only 回收策略（`#47603`）——进程卫生由统一设施承担。
- **审批重试语义**（`#47819`）：新用户输入到来时在途审批重试而非自动中止。对本仓：打回环里打回与在途动作的互斥语义可对照。
- **审批分级降噪**（`#47799/#48073`）：提权命令终端输入审批默认开启，runtime-only 授权不触发多余评审。
- **限流协作**（`#47641`）：尊重 `Retry-After` 并保留服务端重试期限——重试纪律是与服务端协商（非纯本地退避）。
- **TUI 交互面**：`tui.prompt_suggestions` 后续提问 + Tab 改写（`#47911/#47929`）、copy-on-select/右键粘贴保 Markdown 结构（`#47639/#47896/#48118`）、turn tips 与欢迎屏刷新——轮次结束后的「下一步引导」是默认体验件。
- **沙箱修复**：Windows 10 普通路径/存储凭据拒绝/大权限策略（`#47672/#47695/#47919`）、嵌套可写根只读元数据挂载序（`#47623`）、Git 元数据保护跨可写根保留（`#47974`）、macOS 系统路径别名识别免多余审批（`#47879`）。

## rust-v0.159.0 能力

> 版本锚定口径：codex 稳定 tag 经 release 分支切流产生，内容与 main 同源，非 main tip 直接打 tag。

- **Guardian 治理**：熔断中断的结构化错误 opt-in（`#48796`）、**评审历史跨父压缩独立保留**（`#48779`）、Code Mode 确认消息保留供评审（`#48725`）——压缩不吞治理证据链，与 0.158 的「评审保留助手上下文」同属证据完整性设计。对本仓：compaction/续传机制必须把审批与评审留痕列为不可丢弃位。
- **历史感知预热**（`#48812`）：idle 线程按历史预热（非盲热）；上下文计量显式直方图桶（`#48819`）——计量含分布口径，预算治理有数据面支撑。
- **MCP 状态发现与连接复用**（`#48783`）：单服务器状态发现 + 线程级连接复用——连接按发现+复用建立（非每会话新建）。
- **沙箱加固五项**（`#48829/#48491/#48483/#48568/#48565`）：Windows provisioning 服务启动等待、限制性 launcher 嵌入式回退、piped 子进程不弹控制台窗、exec-server 许可私网上游代理、macOS 网络化 Seatbelt 档 TLS 信任评估。
- **渲染保真**：Mermaid 语法扩展+标签标点保留（`#48895/#48814/#48489`）、TUI 复制保 Markdown 表格与空白（`#48549/#48548`）、空列表标记保留（`#48623`）——「复制即所得」。
- **会话语义**：首回合前可归档（`#48828`）、切换保空会话且不显示上一会话摘要（`#48628/#48626`）——会话生命周期边界（空态/切换态）显式。
- **技能目录跨执行器可用性稳定**（`#48353`）+ 移除 bundled plugin-creator（`#48604`）+ follow-up 建议默认关闭、opt-in 启用（`#48621`）——与 claude-code 0.157 移除默认 follow-up 一致。

## rust-v0.159.1-0.159.2 能力

- **Windows 控制台窗抑制**（`#49385`，0.159.2）：启动后台进程与沙箱命令不弹控制台窗——覆盖 0.157「piped 子进程不弹控制台窗」（`#48483`）之外的后台启动路径。
- **模型目录 backport**（`#49342`，0.159.1）：GPT-6.1 Sol Bedrock catalogs 进入 0.159 稳定线——provider catalog 与功能面解耦发布，patch 版本也可承载目录更新。

## rust-v0.159.3 能力

- **账户安全设置提醒**（`#49744`，`#49715` 的 exact backport）：本地 ChatGPT 会话可选展示账户安全设置提醒——**服务端持有资格与灰度、通知不可用不出横幅**（服务端权威 + 不可用静默，与 0.159.2 一致）；patch 版本的质量纪律：exact-backport、稳定 patch ID。

## rust-v0.160.0 能力

- **技能预算先去重再计量**（#49127）：cloud 与 executor 双源技能清单先并集去重、后计预算（否则同一技能双源列出会使预算翻倍）——**计量前先定义被计量集合的同一性**，去重是计量的前置步骤，不是事后修正。
- **子代理派发保留 pending 环境**（#49075）：spawn 子代理时挂起中的环境不丢——派发保持上下文保真，子代理起步视图 = 父会话挂起视图。
- **遥测只采已用字段**（#49076）：技能分析只采集被消费的字段，未使用的 Git 元数据不采集——遥测最小化在「字段是否被消费」粒度执行（同 0.155 的 repo_url 字段最小化）。
- **显式 provider 模型目录权威**（#49135）：显式配置的目录覆盖内置目录——显式配置优先于隐式内置（同 ocr 的「显式 llm_protocol 尊重」）。
- **断线重连恢复未发送输入**（#49105）：重连后未发出的输入回到输入区——用户输入不丢（与 claude Ctrl+C 草稿恢复互为对照：一个防误清空，一个防断线丢失）。

## rust-v0.161.0 能力

- **`/mcp login <name>` 会话内 MCP 登录**（#49290）：活跃终端会话直接完成 MCP server 鉴权，不退出会话——鉴权动作的生命周期边界从「进程级」缩到「会话级」，与 0.159 MCP 单服状态发现（#48783）衔接成链。
- **文件系统提权保留拒绝面**（#49353/#49880）：已批准的文件系统提权可授予更宽写权限，但**同时保留既有的 denied reads 与网络限制**；后台任务保留 originating turn 的权限——提权是「加法不是重置」，权限格收敛只放宽被批准的轴。
- **显式启动权限跨重连存活**（#49809）：显式 launch permissions 跨终端重连与新会话存续，而隐式客户端设置不再覆写 server 或已存线程的 web-search 设置——**显式授权的生命周期长于连接，隐式配置不得反向覆盖服务端持久态**。
- **线程 resume 含最新已提交历史**（#49599）+ **SQLite 损坏早期检测保全备份**（#49701）：启动更早识别可恢复的 SQLite 损坏、损坏库保全为备份——持久层破坏性场景的「先保全再修复」纪律（与 gsd-core 归档原子认领同族）。
- **重试遵循服务端指引**（#49441）：Responses 重试与 WebSocket→HTTP 回退遵循 server retry guidance——过载期减少过早失败；客户端重试预算服从服务端信号（有界重试族的「界由对端声明」形态）。
- 其余（0.161）：GPT-6.1 Sol 进 bundled/Bedrock 双目录默认+Bedrock 多代理 V2/Ultra reasoning+语音会话输入/输出设备选择本地持久+Daybreak 显式 opt-in 门（`features.cli_daybreak`，saved 偏好不足以启用——**特性开关的显式性：偏好与启用分离**）+`codex exec --cyber-access-program` 每轮访问程序选择（exec 覆盖不落盘）。
