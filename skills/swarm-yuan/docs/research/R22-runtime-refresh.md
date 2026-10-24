# R22：运行时补核调研（codex 0.154.0 实质轮 + dsh 0.1.5-rc.1 跨线 + claude-code 267 治理原语，2026-09-10）

- 调研角色：R22 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-10
- 触发：user message「自动更新 Swarm-yuan 项目 research 目录下运行时（包括 claude code、codex、deepseek harness 等工具的版本变化情况）到最新稳定版本，比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill」——与 R20 触发语同型的周期性指令
- 上轮基线：2026-09-09 R20 补核（claude-code v2.1.266 / codex rust-v0.153.4 / dsh dsh-v0.1.2-rc.1 / comet 0.4.0 兑现 drift 归零 / 16 行全景）
- 数据来源：GitHub REST API releases 端点（按发布时间排序，prerelease 标记为准）+ anthropics/claude-code CHANGELOG raw 抓取 + npm dist-tag（claude-code latest=2.1.267 / ruflo latest=3.40.0）+ 本地克隆 git fetch + 移动项 checkout（git describe 验证）
- 执行纪律（2026-09-08 增补，第二轮执行）：①本轮为一轮收口，细节全部落本档，`upstream-baseline.md` 只记表行与一行口径注；②距 R20 收口为次日非同日，无同日复核；③patch 级外围移动不写口径注之外的任何文档增量
- 登记口径：**补核轮**，不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 55 预算，决策 26/26.2）；patch/minor 级不发版（R17/R18/R20 先例）

---

## 第一部分：点名三件套（claude-code / codex / dsh）

### 一、版本全景

| 运行时 | 上轮基线（R20） | 最新稳定（2026-09-10） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.266 | **v2.1.267**（npm latest，2026-09-09 发布） | +1 patch | **实质 patch**（治理原语 maxEffortLevel + prompt-cache 工具动态族大修 + managed fail-closed）；stable 通道仍 2.1.236 分裂持续 |
| codex-cli | rust-v0.153.4 | **rust-v0.154.0**（2026-09-09T22:35 stable，R20 后数小时兑现） | +1 minor | R20 记「0.154 全 alpha」，次日 stable 出——**三件套唯一 minor 实质轮** |
| dsh | dsh-v0.1.2-rc.1 | **dsh-v0.1.5-rc.1**（2026-09-10T03:09，prerelease） | 跨 0.1.3→0.1.5 两功能线 | R20 预告「下一触发点 = 0.1.5 rc」**命中**；rc 作引用基线有 R17 先例（基线即 0.1.2-rc.1） |

### 二、claude-code v2.1.266 → v2.1.267 深读（CHANGELOG 全量）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **`maxEffortLevel` 设置** | top-level 或 per-model `modelSettings` 封顶 effort，低档仍可选 | **落地**（注记级）——effort 治理进宿主原生配置，与 R16 PreModelSwitch hooks、R17 `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` 同族成谱系；adaptive-gating 分档的宿主侧新原语，**登记候选**（触发条件与 R16 同批：弱模型越档真实场景） |
| **prompt-cache 工具动态性大族**（约 12 项 fix） | MCP 重连不重写工具表 / 新 MCP 工具以 deferred definitions 到达（无 ToolSearch 会话）/ resume 重放录制的工具描述而非重渲染 / forked worker 不再注入 EnterWorktree / `-p` 会话 resume 不破缓存 / 工具公告不再提前重写 | **落地**——R20「缓存稳定性成为编排不变量」的**第三波实证**（265 前缀族 → 267 工具集动态族）；教义补充：**工具集动态变更与缓存稳定的冲突由宿主以 deferred/replay 机制消解**——生成技能的注入内容若涉及工具面变更，宿主已处理，本仓无需自防御 |
| **managed allow-list 不可读 → deny-all** | `allowedHttpHookUrls`/`httpHookAllowedEnvVars`/`allowedChannelPlugins` 读取失败时从默认 allow-all 改为拒绝一切 | **落地**——**fail-closed 第四实证**（Codex Guardian 条件性缺席 / claude 260 deny 回退 / gsd 证据纪律 → managed 默认值 fail-closed）；「宿主治理层视为条件性」教义的下沉：连 managed 配置的缺省语义也按最坏情况收敛 |
| `--system-prompt-snapshot off` | 每请求重渲染系统提示而非复用录制版（默认快照=缓存友好） | 注记——上下文经济学新支点：快照（缓存命中）与新鲜度（实时重渲染）成为显式权衡开关 |
| Workflow `agent()` 大 schema | auto mode 下改为安全检查而非直接拒绝 | 注记——结构化输出治理细化（R17 schema 前置校验的延续） |
| 大会话 resume 修复 | 5 MB+ transcripts 恢复不再丟并行工具调用与 hook 输出 | 对账通过（resume 健壮性） |
| 其余 | VS Code/Web/Claude Tag 平台修复族、usage-limit 闪烁等 | 对账通过 |

**267 判定：实质版本**（治理原语 + 缓存大族 + fail-closed），全部为宿主侧行为，吸收面 = `references/claude-code-capabilities.md` R22 注记段；maxEffortLevel 入候选登记（与 R16 PreModelSwitch 同批触发条件）。

### 三、codex v0.153.4 → v0.154.0 深读（release notes + commit 清单）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **实验性 worktree 支持** | `--worktree` / `/worktree` 为新会话或 fork 创建隔离检出，可浏览与恢复 | **落地**（注记级）——**会话与工作区隔离原语进宿主**，与 claude v2.1.257 `permissions.blockReadsOutsideWorkingDirectories` 构成双宿主对偶；生成技能并行门禁（多 worktree 验证）的宿主原语**登记候选**（触发 = 并行 gate 执行真实需求） |
| **inline 追问** | Codex 继续工作期间用建议选项或自定义文本回答问题，不丢主草稿 | **落地**——v0.153 `request_user_input_async` 的交互面强化；Interrupt 守护点候选的第 2 号正式参照（打断→问答→续跑且用户草稿不丢） |
| **plugin/skill 热刷新** | 外部 plugin 升级/回滚后，已有会话刷新 skills 与 hooks（#42284） | **落地**——与 claude v2.1.265 `--plugin-dir` 热装载构成**双宿主同向：技能热装载成标配**；swarm-yuan 生成技能 `--upgrade` 后宿主侧不再要求重启会话 |
| **Guardian 授权治理强化** | 审批上下文跨 compaction 保持；新用户指令或答案作废既有审批（#42844/#43442） | **落地**——授权的**时效性与上下文完整性**成为审批系统一等语义（与 0.151「过期分类不授权」「用户显式调用受信任」连续）；对本仓：门禁产出的 PASS/FAIL 证据若被宿主审批引用，其有效期与作废条件须显式声明 |
| **信任建立前不运行 workspace 控制的 helpers** | 启动路径安全；macOS 沙箱防终端输入注入（#42324） | 注记——双宿主沙箱收紧波延续（与 claude 246-252 硬化波同向） |
| **`codex mcp-server` 入口移除**（破坏项） | deprecated 入口在 0.154.0 删除（#42993） | **对账通过**——本仓 `install.sh`/`scripts/self-check.sh`/`SKILL.md` grep 零引用，无暴露面 |
| GPT-6-Astra 进 model picker / Windows 共享后台 server + daemon 生命周期 / Vim `R` replace 模式 / `/copy` 富文本 | 模型目录与运维便利 | 对账通过 |

**0.154.0 判定：实质 minor**。落地面 = `references/codex-methodology.md` R22 注记段；worktree 隔离与 inline 追问入候选登记。

### 四、dsh v0.1.2-rc.1 → v0.1.5-rc.1 深读（跨 0.1.3-alpha.1/2 + 0.1.5-alpha.1/2，release notes 全量）

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **动态修改系统提示不破 KV Cache** | 模型显式声明支持即可运行中改系统提示且保持 KV 命中 | **落地**——**缓存友好编排第三实证**（claude 265 前缀族 → 267 工具动态族 → dsh 系统提示族）：系统提示从「不可变前缀」变为「可变但保持命中的受控更新」——技能动态注入（运行中更新 frontmatter/规则）的可行性上游样本 |
| **子代理消息队列与 steer 语义统一** | 可继续对话的子代理支持消息排队/编辑/删除/单条或全部 Steer/停止；Agent Team `send_message` 统一采用 steer 语义，跨 Agent 与冷恢复投递**保留发送者归属与顺序** | **落地**——编排操作的「保持不变量」清单再添一项：**消息归属与顺序在跨代理/冷恢复路径上不丢**（与 265 前缀保持、本版 KV cache 保持同族） |
| **暂停即终止模型轮次** | Web 暂停目标立即终止当前轮次，模型不能自行恢复；恢复必须由用户触发（未激活目标也显示恢复入口） | **落地**——**用户控制权 fail-closed**：暂停语义 = 立即终止 + 用户独占恢复权（与 gsd「复核阻塞须确定性证据」的用户主权面向同族） |
| Web 通用文件上传混排 | 任意类型文件+图片同预览、后台上传进度/取消/切换续显、模型按已保存路径用文件工具**按需读取** | 注记——「按需读取」与 claude-api 200k→25k 同族（输入经济学）；长会话引用「按需读取预览未展示内容」同向 |
| Sidebar 多标签产物预览 | Markdown/代码/HTML/PDF/图片多标签/分栏/全屏；子代理与未激活会话的文件可预览；模型可显式交付文件 | 注记——产物交付一等化（与 codex `/export` 会话资产化同向） |
| DeepSeek-V41-Flash 默认模型 | 文本+图片+会话历史中系统提示更新；配置显式指定优先 | 对账通过（模型目录） |
| 代理环境变量遵循 | 所有出站网络请求遵循 `HTTP_PROXY`/`HTTPS_PROXY`/`ALL_PROXY`/`NO_PROXY` | 对账通过（企业环境适配） |
| 修复族 | 流式工具调用续传分片空值覆盖调用 ID/名称（避免写坏会话记录）/ 断线自动恢复 / 空消息拒绝 / 查找项目根遇权限错误不再误用上级指令 | 对账通过；「上级项目指令误用」修复与 codex「信任前不跑 workspace helpers」同族（信任边界） |

**0.1.5-rc.1 判定：实质跨线**，rc 作基线（R17 先例）。落地面 = `references/dsh-engineering-methodology.md` §九。

## 第二部分：外围快审（13 行）

| 运行时 | 上轮 → 本轮 | 判定 |
|---|---|---|
| openspec | v1.12.0 → **v1.13.0**（2026-09-09 minor） | 升基线。快审：**delta parser 不再静默改写/丢弃所写内容**（fence-aware 空行整理 + `*`/`+` bullet 识别 + 重复 `## ADDED Requirements` 段全应用 + 换行 wrap 的 capability 可 retire）+ **apply 对无 delta specs 的变更警告**（双出路：写 specs 或声明 `skip_specs: true`）+ explore 列出 specs 清单先读现状 + propose 先读项目上下文无根即停。「解析器不得静默改写所写内容」为**诚实性族新样本**（与 gsd「no-op 报真实条件」同族）；「validate 拒绝的状态 apply 却放行」的口径统一值得本仓门禁对账参照 |
| comet | 0.4.0 → 零增量 | 对账通过（synced 维持） |
| GitNexus | rc.13 → rc.21（rc 线继续，2026-09-09 单日 8 个 rc） | license-risk 不追（决策 18 维持），rc churn 登记不入表 |
| gsd-core | v1.13.0 → 零增量 | 对账通过 |
| claude-mem | v13.24.1 → **v13.24.5**（2026-09-09） | watch 行升级。快审：**npm 通道恢复可安装**（"Fleet can install from npm again"，latest=13.24.5——R20 登记的 npm 回钉 12.4.7 异常缓解，oracle 仍以 GitHub tag 为准）+ CCS Align phases 0-3（middle cache/exclude marks/rules walker/sign-off）+ OpenRouter 每日牌价历史。watch 维持 |
| ocr | v1.11.6 → **v1.11.7**（2026-09-09） | 升基线。快审：报告**原子写入** + MCP shutdown 阶段限界 + 第二次信号立即退出 + `timeout_sec` 进 config set——稳定性修复族对账通过 |
| graphify | v0.9.56 → **v0.9.57**（2026-09-09） | 升基线。快审：**增量重建不再擦除跨文件项目 AST 节点**（重提取 `.csproj` 曾连带丢被引用项目的 package/framework 节点）+ 重复节点合并保**更富节点**为幸存者 + C# 泛型调用点解析 + `this.X` 成员全形态捕获——图谱完整性修复族对账通过 |
| superpowers | v6.3.0 → 零增量 | 对账通过 |
| gstack | v1.83.0.0（caba78f）→ **v1.84.1.0**（71f6048，2026-09-10 checkout） | 引用基线升（vendor 快照不动，A8 决策）。快审：**impeccable interop**（四个设计技能 detector 前置 + DOM 模式扫描 + 开放 DESIGN.md 格式 + typed slop catalog）+ Codex/Claude 默认前沿模型。方法论引用层内部首次跨对象联动（gstack×impeccable），登记观察 |
| ruflo | v3.38.23 → **v3.40.0**（GitHub release + npm latest 双通道一致） | 升基线。快审（含 3.39.2/3.39.3 修复预演）：**Cross-Host Federation + Claims**——跨机协调用 **Ed25519 签名可验证消息 + work claims**；双协调器（本地 mesh agentbbs HTTP pull 固定公钥 / Slack 结构化消息零基建）；3.39.3 修复 federation 工具 unconditional degraded 误报 + probe shell 注入（POSIX 免 shell）。「签名可验证消息 + 工作认领」为跨机编排信任原语，**方法论级登记候选**（本仓单机场景无即时落地） |
| ECC | v2.2.1 → 零增量 | 对账通过 |
| impeccable | skill-v4.3.1 → 零增量（R20 当日已观察） | 候选级维持（引用基线不升，R16 裁决沿用） |
| codex-security | npm-v0.1.26 → 零增量 | 对账通过 |

（better-harness：非表内方法论源，watch 维持——GitHub release Latest 仍 v0.4.1（2026-08-04），无 0.7.0 stable 信号。）

## 第三部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R22-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R22 口径注一行 + 9 行表行升级（claude-code/codex/dsh/openspec/claude-mem/ocr/graphify/gstack/ruflo）+ §二.2 关键结论 R22 句 |
| 3 | `swarm-yuan/references/claude-code-capabilities.md` | 新增「版本注记：v2.1.267（2026-09-10 核）」段（maxEffortLevel + 缓存工具动态族 + managed fail-closed） |
| 4 | `swarm-yuan/references/codex-methodology.md` | 新增「版本注记：v0.154（2026-09-10 核）」段（worktree 原语 + inline 追问 + 热刷新 + Guardian 授权治理 + mcp-server 移除对账） |
| 5 | `swarm-yuan/references/dsh-engineering-methodology.md` | 新增 §九 0.1.5 版本注记（KV cache 系统提示 + steer 语义统一 + 暂停即终止） |
| 6 | `swarm-yuan/references/subagent-orchestration.md` | R22 行（ruflo 3.40.0 Federation + gstack 1.84.1.0 interop + claude-mem npm 恢复） |
| 7 | `swarm-yuan/references/review-methodology.md` | R22 行（openspec 1.13.0 解析器诚实性 + ocr 1.11.7 原子写） |
| 8 | `swarm-yuan/references/code-graph-tools.md` | graphify v0.9.57 注记一行 |
| 9 | `docs/design-evolution.md` | §13 档案索引 A18 行 + 附录小结段 |
| 10 | `swarm-yuan/README.md` | 调研报告计数 23→24、档案区间 A1-A17→A1-A18 |

**预算纪律**：FACT_RUNTIMES=13（+DEEP/CLI/METHOD 分层）不动；FACT_REFERENCES=42 不动；check_* 门禁 55 预算不动；认知面预算 ≤262,144B——本轮增量全部为注记级（约 3KB），写入后以 self-check 实测为准，超限则按 R18 先例裁早期版本注记段。

**跨档主题（三件套汇总）**：本轮三件套给出同一条信号的三个面——**「保持不变量」清单在扩展**：claude 267 保缓存（工具集动态性）、codex 0.154 保授权（审批上下文跨 compaction）、dsh 0.1.5 保归属（消息发送者与顺序跨冷恢复）。编排层任何操作（resume/fork/steer/compaction）不得静默丢失：缓存命中、授权语境、消息归属——三者对生成技能的教义：**证据链的上下文完整性（谁批的、按什么批的）与证据本身同等重要**。

## 第四部分：验证

- `bash scripts/self-check.sh --check-only`：全绿 + drift warn 保持零 + 预算断言通过（收口前实测）。
- 移动项克隆 checkout 验证：codex `git describe` = rust-v0.154.0、dsh = dsh-v0.1.5-rc.1、openspec = @fission-ai/openspec@1.13.0（v1.13.0）、claude-mem = v13.24.5、ocr = v1.11.7、graphify = v0.9.57、ruflo = v3.40.0、gstack = 71f6048（VERSION 1.84.1.0）。
- 零增量项（comet/gsd-core/superpowers/ECC/codex-security/impeccable/better-harness）不 checkout；claude-code 无本地克隆（npm/CHANGELOG 通道，R4 既定）。
- 破坏项对账：`codex mcp-server` 入口移除——本仓三载体 grep 零引用。
