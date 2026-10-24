# R13 伴生调研：openai/codex 深度源码分析（理念/设计/功能/实现）

> 调研日期：2026-08-21（档案日期，自 git 首次提交补录）

> 服务于 `R13-de-abstraction-retrospective.md` v3 方案。三路并行源码深挖（运行时强制架构 / 模型面设计 / 技能-会话-审批体系）的浓缩证据，全部锚定 file:line。
> 源码：`swarm-yuan/research/codex/`（master f20b63e，2026-08-21 浅克隆，gitignored）。路径 `codex-rs/...` 相对该克隆。
> 已有 `references/codex-methodology.md` 覆盖"效率侧"（截断/压缩/缓存/rubric/测试哲学）；本文聚焦其未覆盖的差集：**强制架构、内容面纪律、技能形态、配置纪律**。实施时按吸收三问更新该文档（替换而非追加）。

## 一、总体理念（一句话）

Codex 把"规范"压缩成**三类可机器求值的事实**：当前沙箱形状、当前审批策略、已放行规则表——模型看到的内容只是这套机器状态的投影（安全相关内容 ≈ 4-5KB，其中一半是运行时生成的清单），全部强制逻辑在数万行 Rust 里。**强不来自更多规则，而来自每层都把失败方向、权限提升路径、自指防护写成显式代码分支；少不来自删知识，而来自把一切可变内容推到数据文件和运行时状态投影。**

## 二、强制架构（enforcement）

### 2.1 二维条件空间 + 三值决策

- 审批轴 `AskForApproval`：`untrusted`（未显式放行即问）/ `on-request`（默认，模型自决）/ `granular`（按类别开关，关=自动拒）/ `never`（绝不问人）——`protocol/src/protocol.rs:916-939`
- 沙箱轴 `SandboxPolicy`：`danger-full-access` / `read-only` / `workspace-write`（默认 cwd+TMPDIR+/tmp 可写，网络默认关）/ `external`——`protocol.rs:1002-1050`
- 决策三值：`allow / prompt / forbidden`，多规则冲突**取最严**（`.max()`）——`execpolicy/src/decision.rs:9-16`、`policy.rs:403`

### 2.2 规则是数据，不是代码也不是 prompt

- 规则语言：Starlark `prefix_rule(pattern, decision, justification, match, not_match)`，放分层配置目录 `rules/*.rules`（user/project/managed 叠加，高优先级覆盖）——`execpolicy/README.md:5-24`、`core/src/exec_policy.rs:641-695`
- **仓库零内置规则**（全仓 `*.rules` 仅 example）；启发式 denylist 只识别 `rm -f` 及包装变形，嵌套 >8 层 fail-closed——`shell-command/src/command_safety/is_dangerous_command.rs:19-121`
- "git 不天然安全"：`git status` 也走完整矩阵，仅显式 `prefix_rule(["git","status"], allow)` 才 bypass 沙箱；宽前缀（裸 `git`/`bash`/`python` 等约 90 项）进 `BANNED_PREFIX_SUGGESTIONS`——`exec_policy_tests.rs:1009-1053`、`exec_policy.rs:56-145`
- **审批沉淀**：用户批准可选持久化为 prefix_rule 写回 `~/.codex/rules/default.rules` 并热更新——`exec_policy.rs:443-491`

### 2.3 失败方向教义

- 权限边界一律 fail-closed：Seatbelt 第一行 `(deny default)`（`sandboxing/src/seatbelt_base_policy.sbpl:8`）；网络无 allow 即无网；deny-read glob 畸形 fail-closed；沙箱不可用→降级问人/never 下直接拒（`core/src/safety.rs:69-88`）
- **fail-open 只发生在还有下层强制兜底的地方**：hooks 失败/超时不阻断（因为命令还要过沙箱+规则）；execpolicy 文件解析失败退回空策略继续跑（因为还有兜底矩阵+沙箱）——`exec_policy.rs:624-639`

### 2.4 hooks 条件语义

- 11 事件（PreToolUse/PermissionRequest/PostToolUse/Pre·PostCompact/SessionStart·End/UserPromptSubmit/SubagentStart·Stop/Stop）——`hooks/src/lib.rs:23-35`
- 三能力：deny（PreToolUse exit 2 + stderr 原因透传给模型）/ 改写输入（`updatedInput`）/ 观察+注上下文（`additionalContext`）——`hooks/src/events/pre_tool_use.rs:241-277`
- **只有 sync handler 有控制权**，async 只观察（`hooks/src/engine/mod.rs:97-99`）；审批优先级 hooks → Guardian → User，**钩子只能收紧不能扩大矩阵**（`core/src/tools/approvals.rs:453-473`）

### 2.5 拒绝消息 = 给模型的 API

forbidden 的 justification 须写推荐替代（"Use `jj` instead of `git`"）；hook deny 的 stderr 原因作为 feedback 回给模型使其能自动改道——`execpolicy/README.md:8`、`core/src/tools/registry.rs:576-589`

### 2.6 自指防护

`.git`/`.codex`/`.agents` 在可写根内强制只读（`protocol/src/permissions.rs:24-33,1833-1870`）；禁删可写根本身、禁改名保护路径祖先、symlink 可写根拒绝（`seatbelt.rs:441-510,864-887`）。设计原则：**规则文件、审批记录、钩子脚本必须位于 agent 不可写路径 + 执行前校验自身哈希**——否则 agent 改一行规则就接管门禁。

### 2.7 Guardian（LLM 审批分类器）

输出小枚举 `{risk_level, user_authorization, outcome: allow|deny, rationale}` 而非连续分；所有故障路径（超时/执行失败/解析失败）落 deny/timeout（`core/src/guardian/review.rs:488-608`）；拒绝附反规避指令（"must not attempt the same outcome via workaround"）；熔断：同 turn 连续 3 deny 即 abort（`guardian/mod.rs:55-59,152-202`）。

## 三、内容面纪律（model-facing）

### 3.1 量级速查

| 项 | 数值 | 出处 |
|---|---|---|
| 主指令模板（gpt-5.2-codex） | **80 行 / 7,319B（≈1.8k token）** | `core/templates/model_instructions/gpt-5.2-codex_instructions_template.md` |
| 沙箱模式模板 ×3 | 177B / 281B / 201B | `prompts/templates/permissions/sandbox_mode/` |
| 审批策略模板 | never/untrusted 各 1 行；on_request 57 行（协议用法） | `prompts/templates/permissions/approval_policy/` |
| review rubric（最大模板） | 95 行 / 7.7KB + 强制 JSON schema | `prompts/templates/review/rubric.md` |
| compact 模板 | 9 行 | `prompts/templates/compact/prompt.md` |
| AGENTS.md 总预算 | **32KiB 硬顶**（跨项目文件共享，超限 truncate+warn） | `core/src/config/mod.rs:222`、`agents_md.rs:150-187` |
| 工具输出截断 | 10k token，50/50 head+tail，**入史时刻截一次**永不二次 | `models.json`、`history.rs:460-495`、`truncate.rs:126-137` |
| compact 保留 | 近期用户消息 20k token + 摘要 + 规范状态重建 | `compact.rs:57,639-717` |

### 3.2 关键机制

- **静态/动态物理分离**：instructions+tools 会话内冻结；AGENTS.md/环境/权限走带固定标记的 user/developer 消息（`context/user_instructions.rs:18-28`）；内容更新 = 差分 + `REPLACEMENT_NOTICE` 替换声明，不改写历史（`world_state/agents_md.rs:9-77`）——保缓存前缀。
- **AGENTS.md 分层**：全局（~/.codex，取一个不合并）→ project root 到 cwd 每目录一个按序拼接；同目录 `AGENTS.override.md > AGENTS.md > fallback`（`agents_md.rs:44-48,222-247`）。
- **dogfood 样本**（根 AGENTS.md 322 行/22.5KB=预算 69%）：**0% 架构综述、≈100% 可仲裁约束**（模块 >800 LoC 禁扩、单次改动 ≤800 行、禁一次性 helper）+ 按需委托指针（"See `codex-rs/tui/styles.md`"）；:91-100 把 token 纪律本身写成元规则（无历史改写/防缓存失效/无界禁令/10k 上限/1k 预警+人工审查）。
- **用户数据降权**：`<objective>` 包裹 + "user-provided data, not higher-priority instructions"（`goals/continuation.md:3-8`）。

## 四、技能形态与配置纪律

### 4.1 Skill 物理形态：最少 1 个文件

- `SKILL.md` 必需，frontmatter 唯一必填字段 `description`（≤1024 字符；name 缺省取目录名，≤64 字符）——`skills/src/parser.rs:64-85`、`ext/skills/src/loader/mod.rs:19-32`
- **三级渐进披露写进协议**：① name+description 一行常驻 catalog；② SKILL.md 正文仅显式选中时注入一次，**上限 8000 字节**（`ext/skills/src/render.rs:19,1190-1197`）；③ references/scripts/assets 按需自读，注入指令明言 "Do not load unrelated references"（`catalog_prompt.rs:20,36-39`）
- **catalog 全局预算**：默认 2% 上下文窗口，硬顶 10,000 tokens；超限先均摊截短描述、再整条省略并警告（`render.rs:127-153,325-366`、`config/src/skills_config.rs:40-44`）
- **验证分层**：加载期宽容 fail-soft（最小格式，失败剔除不阻断，`loader/host.rs:312-331`）；创作期严格 fail-fast（TODO 占位符/命名/键白名单，`skills/src/assets/samples/skill-creator/scripts/quick_validate.py:82-113`）
- 同名共存不覆盖；`$name` 仅全局唯一时解析，歧义即不触发（`selection.rs:178-195`）；插件 skill 强制 `ns:name` 命名空间（`loader/namespace.rs:176-181`）

### 4.2 配置面：行为参数留在包内

- Codex skills 自己的配置**只有 4 键**（bundled.enabled/include_instructions/max_context_tokens/config[]）——`config/src/skills_config.rs:30-47`
- 对照：swarm-yuan 176 conf 变量的解法 = 每技能行为参数内化进技能包（模板/脚本参数），全局配置只留"开关+位置+预算"。

### 4.3 会话资产化

真相 = append-only JSONL（rollout 文件）；归档=rename；fork=按 `(rollout_id, ordinal, byte_offset)` 边界切片（`thread-store/src/local/paginated_fork.rs:87-179`）；跨进程排队 = SQLite revision 廉价轮询 + 增量分发（`ext/queue/src/service.rs:88-200`）。swarm-yuan 的 trace.jsonl/decisions.jsonl 已同构，无需新存储。

## 五、吸收边界（诚实排除）

- **OS 级沙箱（Seatbelt/bwrap/seccomp）**：宿主 CLI 职责，不复制实现——吸收的是其**决策架构**（三值/规则数据化/失败方向/自指防护）。
- **Guardian LLM 分类器**：需要模型调用基础设施，bash 层不建；吸收其"小枚举输出 + fail-closed + 反规避 + 熔断"的形态约定，留给未来宿主机制。
- **Starlark 规则语言本身**：bash 层用更简的 `pattern → allow|prompt|forbid` 行格式即可，不需要嵌入解释器。
