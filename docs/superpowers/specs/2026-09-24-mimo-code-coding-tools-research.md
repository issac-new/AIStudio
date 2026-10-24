# MiMo-Code 编码工具能力补充调研（OpenCode fork 工具层专项）

日期：2026-09-24 ｜ 用途：/ide IDE 工作台"编码工具能力"增强提案依据。

> **实施终态（2026-09-25 Ycode 实现轮）**：P5/P9/P2 已合 main（patch 393-397 重编）；**P6/P7 已落地（patch 405：ngram 文本防循环 + 五节 checkpoint 写手挂预算触顶）**；**P3 经核实原生已有不重造**——delegate_task 现有 background 模式（dispatch 即返+结果轮间回注）+ `action` list/steer/stop 在跑控制 + `_merge_late_steer` 转向合并 + 注册表 kill/pause/status（delegate_tool.py:560-580 工具描述与 _run_single_child 实证），原"交互模型差距"判定过时，且 worktree 隔离仍是 hermes 独有优势；R5-#10 continuation 同此原生覆盖，另以 patch 404 补名册配置层（角色目录/昵称池/护栏）；**P6 的 goal 冷裁判部分经核实原生已有**（goals.py 每轮辅助裁判+GoalGate 门+fail-open+kanban goal_mode，强于 mimo 单次冷裁判），只补了 ngram。**P4 记忆 FTS 化按 spec 原分期留独立轮**（memory_tool_store 为敏感存储层，不与吸收批混跑）。
> **定位修正（2026-09-25 用户裁定）**：IDE 工作台**不是**"兼容/托管更多编码工具"的聚合器；目标是以 zcode 源码为基底，统筹吸收融合各编码工具的优势功能，形成一个全新的编码工具（暂名 Ycode，与 SwarmStudio 驾驶舱"沟通协作"流畅衔接、符合传统研发人员使用习惯）。定位红线见 `overlay/docs/superpowers/specs/2026-09-23-zcode-foundation-design.md` §0。据此 P1 的"接为第 8 个托管 Agent"降级为过渡期对照/调研手段；P2-P7 引擎级吸收提案与 zcode 底座路线才是主线。

> **实施状态（2026-09-24 当日）**：P1 已落地（patch 381/382，mimo 接为第 8 个托管 Agent）；P5 修正落地（patch 383——调研判"未见同机制"有误，hermes 已有更强的路径级读写冲突分段调度 `_plan_tool_batch_segments`，实际缺口仅失败级联，已补）；P9 已落地（patch 384 Exa MCP + runtime/exa 单一事实源）；P2 已落地（patch 385 lsp 工具五只读操作，真 pyright 冒烟全通）；P8 维持缓；P6/P7 已出独立 spec 待批（`2026-09-24-goal-judge-and-ngram-loop-guard.md` / `2026-09-24-session-checkpoint-writer.md`）。P3（子代理后台化）/P4（记忆 FTS 化）未动，留待后续轮。
关系：接续 `2026-09-19-agent-ui-landscape-research.md`（claude code / codex / kimi / minimax 四路）。那次管 UI 功能面（会话/可视化/审批/输入），本次管 **Agent 工具层与运行时能力**，重叠条目（goal、后台任务、agent 地图）以本次源码锚点补充实现细节，不重复立案。
调研方式：本地浅克隆源码盘点 `/tmp/mimo-code-recon` @ `456678b`（2026-09-24 HEAD），主核 `packages/opencode`；本仓现状由 hermes-agent 源码 + overlay patch + `overlay/custom/client/ide/` 实测锚点对照（现状盘点锚点省略前缀：HA=upstream/hermes-agent，HS=upstream/hermes-studio，OV=overlay）。

## 1. 一句话结论

MiMo-Code 对本仓的价值分三层：

1. **最便宜的大补**：把它以 coding-agents 声明式定义接进 /ide（运行时已有同款先例 dsh），其 LSP 工具、FTS 记忆、工作流沙箱、技能互操作全套能力零重写进工作台。
2. **hermes-agent 三个真缺口**值得 patch 吸收：LSP 工具化（agent 可调 9 种代码智能操作）、子代理后台化 + 双向消息、记忆 FTS 索引 + 自动沉淀。
3. **四个工程机制**值得抄设计：工具批 FIFO 栅栏、exec 权限不放大、会话进展 checkpoint 写手、goal 冷裁判。

## 2. MiMo-Code 定位速览

| 维度 | 事实 | 锚点 |
|---|---|---|
| 本体 | OpenCode 的 fork（monorepo 根 package name 仍为 `opencode`），MIT + 使用限制条款 | /tmp/mimo-code-recon/package.json |
| 发行 | npm `@mimo-ai/cli`，bin `mimo`；Bun + Turbo + effect 架构 | packages/opencode/package.json:4,24-26 |
| 形态 | TUI 为主；`mimo serve` headless + `mimo attach` SSH 远程；Electron 桌面 Beta；完整 ACP agent；VSCode 扩展很薄（只负责开终端 + 向 TUI 推 `@file#L1-L2` 选区引用） | sdks/vscode/src/extension.ts:45-101 |
| 模型 | 任意 provider + MiMo 自家模型；按模型路由工具 ABI 与 system prompt | docs/architecture/codex-microkernel-runtime.md |

工具全集（`packages/opencode/src/tool/`，51 个 .ts）：文件类 read / write / edit / multiedit / apply_patch / notebook-edit / view-image；搜索类 grep / glob / codesearch（Exa Code API）；执行类 bash（持久 shell）/ bash-interactive / bash_token_efficient_*；智能类 **lsp**；协作类 **actor**（子代理）/ task（T1/T1.1 层级工作项）/ question / plan；记忆类 memory / history / checkpoint-description；编排类 **workflow** / skill / skill-search / cron / session；治理类 gate / external-directory / merge-conflict-notice / memory-path-guard / recoverable；组合类 **exec**（QuickJS，见 §4.5）。

## 3. 工具层逐项对照（MiMo ↔ 本仓现状）

### 3.1 文件 / 编辑 / 搜索 —— 基本对等，无需吸收

| 能力 | MiMo | hermes-agent | 判定 |
|---|---|---|---|
| 读 | read（2000 行分页，目录列举二合一） | read_file（100K 字符预算 + next_offset + ipynb/Office/PDF 抽取）HA/tools/file_tools.py:1133 | 对等，hermes 抽取器更多 |
| 写 | write（大文件分步写引导） | write_file（先读后写守卫 + 写后语法检查只报新增错误）:1155 | 对等 |
| 编辑 | edit（精确串替换）/ multiedit / apply_patch（多文件补丁方言）/ notebook-edit | patch（find-replace 9 级模糊匹配 + unified diff + 写后检查；对 OpenAI 家族动态叠加 V4A apply_patch 方言）:1173,1220-1241 | 对等；hermes 缺 notebook-edit（read 已能抽取 ipynb，影响小） |
| 搜索 | grep / glob 分立 | search_files 二合一（target=content 走 ripgrep / target=files 走 glob）:1269，rg 后端 file_operations_search.py:122-208 | 对等 |
| 外部代码检索 | codesearch（Exa Code，SDK/库文档专用，token 1000-50000 可调）tool/codesearch.txt | web_search / web_extract（通用）HA/tools/web_tools.py:475 | MiMo 多一档"代码专用外搜"；可经 MCP 补（成本低，见 P9） |

### 3.2 执行与治理 —— 机制细节值得抄

| 能力 | MiMo | hermes-agent | 判定 |
|---|---|---|---|
| shell | bash 持久会话 + token 高效管道（输出压缩启发式 bash_token_efficient_heuristic.ts 17.5K） | terminal（本地/docker/ssh/modal 四后端 + 审批/危险命令门控）HA/tools/terminal_tool.py:1352 | hermes 后端更广；MiMo 输出压缩工程可参考 |
| 后台进程 | （exec 内并发上限 8） | process_manage（列表/读输出/终止）HA/tools/process_registry.py:2450 | hermes 有 |
| 权限 | permission 模块：allow/deny/ask 三值 + 规则求值 + ask 超时（MIMOCODE_SKIP_ALL_FORCED_ASK_TIMEOUT_MS 遗留兼容）permission/index.ts:27 | terminal 工具内置审批门控；/ide hooks 页签只读 | 模型不同：MiMo 是**全局统一权限层**（含 edit permission），hermes 散在工具内 |
| 外部目录 | external-directory 工具 + 路径 jail | workspace allowlist（OV patch 123/124） | 各自实现，对等 |
| **工具批栅栏** | gate.ts：read/grep/glob 可并行，edit/write 及其余为 barrier 级 FIFO，防止同批 edit 竞态 git commit；前调用失败级联取消同批后续（FAIL_CASCADE）tool/gate.ts:1-16,29 | 未见同机制（工具批执行顺序未显式栅栏化） | **MiMo 独有，值得吸收（P5）** |

### 3.3 LSP —— 本仓最大单项差距

MiMo 把 LSP 做成 **agent 可调工具**，9 种操作：goToDefinition / findReferences / hover / documentSymbol / workspaceSymbol / goToImplementation / prepareCallHierarchy / incomingCalls / outgoingCalls（tool/lsp.ts 全 91 行；模型侧描述 tool/lsp.txt）。语言服务器目录 19 个：TypeScript、Vue、Svelte、Gopls、Pyright、Ty、Rubocop、RustAnalyzer、Zls、Clangd、SourceKit、C#/F#、ElixirLS、ESLint、Oxlint、Biome、Deno（lsp/server.ts:66-987），带自动安装与 `~/.cache/mimocode` 缓存。

hermes-agent 有 LSP 基建（pyright/gopls 等真实子进程 + per-(server,root) 客户端 + 多根支持，HA/agent/lsp/manager.py:1-18），但**只用于 write_file/patch 写后诊断**（publishDiagnostics 喂 lint-delta 过滤，默认关闭）；没有任何 agent 可调的 LSP 导航工具；git 也没有专用工具（经 terminal 执行）。

### 3.4 子代理 —— 交互模型差距

| 维度 | MiMo actor（tool/actor.ts 911 行 + actor.txt） | hermes delegate_task（HA/tools/delegate_tool.py:635） |
|---|---|---|
| 启动 | **spawn 默认后台**（立即返回 actor_id，主对话保持响应，多代理并行）；run 阻塞式被标注为罕见例外 | 派发批量 tasks，主对话等待 |
| 生命周期 | status / wait / cancel 三操作轮询与取消 | 动态描述反映并发/深度限制 |
| 通信 | **send 双向**：子代理只能 actor send 回 main 汇报进展/发现/阻塞；父可向子发中途指令 | 单向（结果返回） |
| 隔离 | workflow 场景走 worktree | **git worktree 隔离**（`.worktrees/subagent-<id>` + 专属分支，HA/tools/subagent_worktree.py:1-25）——MiMo 没有 |

判定：各有一半。hermes 的 worktree 隔离更强；MiMo 的"后台默认 + 轮询 + 双向消息"交互模型更强，且与 09-19 调研 #1（steer 转向）#6（agent map）#7（后台任务中心）同源。

### 3.5 记忆 / 上下文 —— 存储与沉淀差距

| 维度 | MiMo | hermes |
|---|---|---|
| 记忆存储 | SQLite FTS5 + **BM25 排序**，markdown 为源、索引为视图（reconcile 增量索引 + 剪枝），scope 四层 global/projects/sessions/cc；`~/.claude/projects` 可选导入（config.ts:363 含消费者集扩大的注入风险告警——设计卫生范本）memory/service.ts:17-40 | 文件型 user/memory 双 target 批量原子操作（HA/tools/memory_tool.py:270），无检索排序 |
| 会话轨迹检索 | history 工具：FTS BM25 over 原始轨迹（含 tool 输入/错误/文件名）+ around 定位 | session_search：FTS5 + 血缘去重 + 自适应水合（HA/tools/session_search_tool.py）——**对等，hermes 甚至更深** |
| 压缩 | compaction 27.8K + prune + overflow + tail-digest + budgeted-read（token 预算内截读，session/budgeted-read.ts:10-26） | micro_compact + 按模型阈值压缩（HA/agent/agent_init.py:1985 附近）——对等 |
| 自动沉淀 | **auto-dream / auto-distill**：每 7 天 / 30 天自动 spawn 系统会话整理记忆（session/auto-dream.ts:14-19，含 spawn 间隔防抖） | 无 |
| 进展 checkpoint | **checkpoint 写手**（session/checkpoint.ts 1862 行）：LLM 按模板/分节预算/校验器把任务进展写入 memory scopes，配 boundary 对齐、重试、progress-diff 对账 | 无等价物（ncwk 的续跑教训：START_STEP 位置比较防假完成，见记忆库） |

### 3.6 长任务与编排

| 能力 | MiMo | hermes / ncwk | 判定 |
|---|---|---|---|
| goal 停止条件 | /goal 设条件后主循环**拒绝停止**，直到独立冷裁判模型只读轨迹判"达成/真不可能"（session/goal.ts:9-27，MAX_GOAL_REACT 限次） | loop-engineering（docs plans 2026-07-11/12）有自己的循环治理 | 机制互补：冷裁判思路可并入 loop 治理 |
| max-mode | N 并行候选（默认 5）只提案不执行，择优执行 + **text ngram 重复检测**防循环（session/max-mode.ts:22-28） | cockpit 失控信号检测（记忆库 2026-09-23 稳定轮） | ngram 检测是具体可抄的防循环原语 |
| workflow | QuickJS 沙箱编排：内置 compose / deep-research / fact-check / research-experiment；12h deadline、生命周期 1000 agent 上限、默认并发 16、持久 journal 可断点续跑、结构错误 vs 运行时错误分级（workflow/runtime.ts:22-36） | loop 引擎 + kanban 编排 | 与 loop-engineering 定位重叠，**缓吸**（P8） |
| 工作项 | task 工具：T1/T1.1 层级 ID、状态机、归档（tool/task.txt） | todo_list 平面清单 + kanban 15 件套 | kanban 已覆盖，平面 todo 升级优先级低 |
| 定时 | cron 工具：会话级/持久两级，仅在 REPL 空闲触发、later 优先级不抢用户输入，loop 自续 keepalive 60-3600s（tool/cron.txt） | cronjob_manage + ncwk CronCreate | 对等，"空闲才触发 + 不抢占"语义值得对齐 |
| 技能 | 发现 `.claude`/`.codex`/`.opencode`/`.agents` 四品牌目录 SKILL.md（skill/index.ts:19-38）+ 内置 bundle（含 superpowers、karpatha 技能，带 LICENSE）+ 别名 + "模型可达 ≠ 已授权"分离 | skills_list/skill_view/skill_manage + optional-skills | **互操作价值**：hermes 若认 `.agents` 开放标准目录，三方技能直接复用 |
| 会话迁移 | claude-import / codex-import / opencode-import（session/） | 无 | 低优先 |

## 4. 编号吸收提案（多方案待批，未获批不动手）

按"价值/代价"排序。落点标注：IDE-RT=coding-agents 运行时（upstream 经 patch）、HA=hermes-agent（经 patch）、IDE-SRV=overlay server 路由、IDE-UI=overlay client。

**P1 把 MiMo-Code 接为第 8 个可托管编码 Agent**（落点 IDE-RT + IDE-UI，预估 1-2 天）
运行时定义是声明式条目（HS services/index.ts:382-386 opencode 先例：`{id, command:'mimo', packageName:'@mimo-ai/cli'}` + CONFIG_FILE_DEFINITIONS 映射 `~/.config/mimocode/`），客户端 ide.ts:26-41 加映射。MiMo 另有完整 ACP agent（acp/agent.ts 56.7K，Initialize/Prompt/Permission/Fork/SetMode/MCP 全集）与 headless serve，dsh 已有 ACP 适配器先例（services/dsh/acp-adapter.ts）可择一走。收益：/ide 会话选 mimo 即获得其全套工具面（LSP 工具/FTS 记忆/工作流/技能互操作），零重写。代价：安装更新管理、配置文件映射、走查；与 09-19 无重叠。

**P2 hermes LSP 工具化**（落点 HA，预估 3-5 天）
在既有 agent/lsp 基建上补一个 `lsp` model tool：先做只读五操作（goToDefinition/findReferences/hover/documentSymbol/workspaceSymbol），服务器从已有的 pyright/gopls 扩到 typescript（本仓主战场是 TS monorepo）。MiMo 实现仅 91 行（tool/lsp.ts）+ 服务器目录定义（lsp/server.ts），MIT 可直接参照。收益：大代码库精确导航，补 ripgrep 语义盲区；IDE 侧 Monaco 有同源语言能力可后续打通（IDE-UI 二期）。代价：服务器安装发现、生命周期管理、Windows 兼容（有先例教训）。

**P3 delegate_task 后台化 + 双向消息**（落点 HA，预估 3-4 天）
按 actor 交互模型改造：spawn 默认后台立即返回 ID → status/wait/cancel 轮询 → send 双向消息（子回父汇报、父给子中途指令）。保留 hermes 独有 worktree 隔离。同时为 /ide 的 subagents 浮窗（IdeSubagentsFloat）与 09-19 #6 agent map、#7 后台任务中心供数据面。代价：delegate_tool 协议变更涉及存量调用方。

**P4 记忆 FTS5 化 + 自动沉淀**（落点 HA，预估 3-5 天）
memory 工具底层换 SQLite FTS5（hermes 已有 sqlite 基建与 session_search FTS 经验，坑已踩过：node:sqlite 无 transaction）；markdown 源不变，索引为视图 + reconcile。二期再上 auto-dream/distill（7d/30d 系统会话整理）。/ide memory 页签顺势从只读升级检索（衔接 09-19 #16）。代价：存量记忆文件迁移 reconcile。

**P5 工具批 FIFO 栅栏**（落点 HA，预估 1-2 天）
照 gate.ts 设计：读类（read_file/search_files）并行，写类（write_file/patch/terminal 变更命令）barrier 级串行；批内前序失败级联取消。小而硬的正确性机制。代价：低；需补并发回归测试（vi.mock 双模块 ID 坑见记忆库）。

**P6 goal 冷裁判 + ngram 防循环**（落点 HA/loop 治理，预估 2-3 天，先出小 spec 再动）
两件小事：a) 独立裁判模型只读轨迹判停止条件（goal.py 冷裁判语义）；b) text ngram 重复检测作失控信号原语并入 cockpit 已有失控检测。与 09-19 #8（Goal 模式）合并立案，MiMo 提供的是实现锚点。

**P7 会话进展 checkpoint 写手**（落点 HA，预估 5 天+，建议独立 spec）
按 MiMo checkpoint.ts 模式：LLM 按模板 + 分节预算 + 校验器写"任务进展 checkpoint"入记忆，配 progress-diff 对账与边界对齐。直击 ncwk 推演暴露的"续跑假完成"痛点（记忆库 2026-09-22 教训：START_STEP 须位置比较）。代价最高，收益也最贴本项目长任务主线；建议在 P4 记忆索引之上做。

**P8 workflow 沙箱编排 —— 缓**（暂不动手）
与 loop-engineering 定位重叠，且 MiMo 方案深度绑定 effect/QuickJS。观察 /ide 实际长任务形态后再定是否引入"会话内可编排子代理 DAG"。

**P9 codesearch 外搜 —— 低成本替代**（落点 MCP，预估 0.5 天）
不为一个工具引依赖：给 hermes 挂 Exa Code MCP（或等价代码检索 MCP）即可，optional-mcps 目录有先例（OV patch 375 semantica）。

## 5. 明确不吸收清单

- **VSCode 扩展 SDK**：我们本身就是 GUI 宿主，其扩展只做"开终端 + 推文件引用"，无增量。
- **TUI 域**（45 斜杠命令、statusline、vim 模式、语音 /voice + ASR）：GUI 侧已由 09-19 调研覆盖或不适用。
- **OAuth 迁移/登录管理**（ChatGPT/Codex OAuth、CC 认证迁移）：cc-switch 已承担本仓同职能。
- **pascalcase 工具调用风格**：上游自己已用 flag 禁用（compose/spec/disable-pascalcase-and-flooding.md），实验失败品。

## 6. 锚点速查

- MiMo-Code 浅克隆：`/tmp/mimo-code-recon` @ 456678b6a5afb0eef3fe2754575637218cfb3c84（2026-09-24）
- LSP 工具：packages/opencode/src/tool/lsp.ts（91 行）；服务器目录 lsp/server.ts:66-987
- actor：tool/actor.ts（911 行）；操作语义 tool/actor.txt
- gate：tool/gate.ts:1-16,29
- memory：memory/service.ts:17-40；cc 导入风险告警 config/config.ts:363；auto-dream session/auto-dream.ts:14-19
- checkpoint 写手：session/checkpoint.ts（1862 行）+ checkpoint-templates/-validator/-progress-reconcile
- goal / max-mode：session/goal.ts:9-27；session/max-mode.ts:22-28
- workflow：workflow/runtime.ts:22-36（deadline/上限）；builtin/*.js
- exec 微内核与 GPT 工具 ABI：docs/architecture/codex-microkernel-runtime.md（中文，含资源上限表与权限不放大论证）
- ACP：acp/agent.ts（56.7K，@agentclientprotocol/sdk）
- 技能互操作：skill/index.ts:19-38
- 本仓 opencode 托管先例：HS packages/server/src/modules/coding-agents/services/index.ts:382-386,427-434；ACP 适配先例 services/dsh/acp-adapter.ts；客户端映射 OV custom/client/ide/store/ide.ts:17-41
- hermes LSP 现状（仅写后诊断）：HA agent/lsp/manager.py:1-18；HA agent/lsp/__init__.py:1-10
- hermes checkpoint（影子 git，对等）：HA tools/checkpoint_manager.py:1-5
