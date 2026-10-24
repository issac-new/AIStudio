# R20：运行时补核调研（claude-code 实质轮 + comet 0.4.0 触发兑现 + 外围五行移动，2026-09-09）

- 调研角色：R20 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-09
- 触发：user message「自动更新 Swarm-yuan 项目 research 目录下运行时（包括 claude code、codex、deepseek harness 等工具的版本变化情况）到最新稳定版本，比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill」
- 上轮基线：2026-09-06 R18 补核（claude-code v2.1.263 / codex rust-v0.153.4 / dsh dsh-v0.1.2-rc.1 / comet 仍 drifted 于 v0.3.9 / 16 行全景）
- 数据来源：GitHub REST API releases 端点（按发布时间排序，Latest 标记为准）+ anthropics/claude-code CHANGELOG raw 抓取 + 13 个本地克隆 git fetch + 移动项 checkout（git describe 验证）
- 执行纪律（2026-09-08 增补，本轮首次执行）：①本轮为一轮收口，细节全部落本档，`upstream-baseline.md` 只记表行与一行口径注；②无同日复核；③patch 级外围移动不写口径注之外的任何文档增量
- 登记口径：**补核轮**（距 R18 三天，用户点名三件套 + 全量快审），不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 55 预算，决策 26/26.2）；patch/minor 级不发版（R17 先例）

---

## 第一部分：点名三件套（claude-code / codex / dsh）

### 一、版本全景

| 运行时 | 上轮基线（R18） | 最新稳定（2026-09-09） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.263 | **v2.1.266**（npm latest，2026-09-08T23:55 发布） | +3 patch | **2.1.265 为实质版本**（功能性条目密集）；266 为 265 的网关回归修复 |
| codex-cli | rust-v0.153.4 | **rust-v0.153.4**（releases Latest 标记实测，2026-09-04） | 零增量 | 0.154.0-alpha.8/9 在 alpha 通道（预发布，不取）；npm 通道维持对齐 |
| dsh | dsh-v0.1.2-rc.1 | **dsh-v0.1.2-rc.1**（rc.1 后全部为 alpha：0.1.3-alpha.1/2、0.1.5-alpha.1） | 零增量 | 主线进入 0.1.3→0.1.5 alpha 段；R17 预告的「0.1.2 rc 兑现调研」已兑现，下一触发点 = 0.1.5 rc 或功能线稳定 tag |

### 二、claude-code v2.1.263 → v2.1.266 深读（CHANGELOG 全量）

#### 2.1.265（实质版本）逐主题评审

| 主题 | 内容 | 吸收三问判定 |
|---|---|---|
| **`--plugin-dir` 目录化加载** | 指向一个插件目录：每个带 manifest 的子目录各自加载，运行中增删子目录即时生效 | **落地**（claude-code-capabilities.md R20 注记）——技能/插件的分发粒度从单目录升为「目录树 + 热装载」，swarm-yuan 生成技能的安装形态多一个宿主侧选项 |
| **工具结果 1 GB 落盘上限** | 超限截断，会话内预览标注「已截断」 | **落地**——与 dsh 簇「quota-circuit 四规则」、261 的 `bashOutputMaxChars` 同族：**输出经济学**成宿主一等配置；截断显式披露 = 「缺失证据不显示为零」同向 |
| **prompt-cache 稳定性修复族** | ①前台子代理 resume 不再改变工具表与系统提示前缀（保缓存复用）②agent teammates/resumed subagents 的 SubagentStart 上下文与预载技能不再移出提示前缀 | **落地**——缓存稳定性成为编排不变量：**任何编排层操作（resume/teammate 合并）不得重排前缀**。对生成技能的直接教益：技能注入内容若位于前缀区，重排即缓存失效，成本骤增 |
| **中断工具调用恢复诚实性** | 进程死于工具运行中：resume 不改写上一条 prompt，中断的工具调用保留并标记 interrupted | **落地**——「完成与中途停不再混淆」的第二次宿主实证（R16 v2.1.243 partial 标记同向）；gate-report 证据态分级（partial/interrupted 语义）方向再验证 |
| **非交互会话 `cd` 跨回合持久** | `-p`/stream-json/SDK 会话不再每条消息重置工作目录 | 对账通过（swarm-yuan 无依赖重置行为的链路），无吸收 |
| **不可信内容标记** | Artifact 工具读取他人产物时，摘要将页面视为 untrusted、标记内嵌指令而非转述 | **候选登记**——prompt-injection 防御进宿主读取层；触发条件：生成技能出现「读取外部产物并执行其中指令」的真实场景时，引用此先例加防护门禁 |
| **MCP http→SSE 规范回退** | 仅支持旧 HTTP+SSE 传输的 http 型 MCP server 现按规范回退连接 | 对账通过，无吸收 |
| 插件安全波 | 反斜杠路径绕过 symlink containment（macOS/Linux）、双点开头目录误拒——两修复 | 对账通过（宿主侧收敛，无生成物暴露面） |

#### 2.1.266（回归修复）

`CLAUDE_CODE_USE_GATEWAY`（未文档化变量）在 265 被误改为单独即强制 Cloud 网关登录，LLM 网关/代理配置全线报错；266 恢复「仅与 `ANTHROPIC_BASE_URL`+`ANTHROPIC_AUTH_TOKEN` 同设时生效」。**教训吸收（注记级）**：未文档化开关的语义漂移会在 patch 版本间发生——与 R17「宿主 deny 语义漂移」同族，**宿主行为细节版本间不保证稳定**的教义第三次实证。

#### 三问汇总

- ①落到运行时条件？→ 落地项均绑定 claude-code ≥2.1.265 宿主行为；
- ②替换/叠加？→ 全部叠加（版本注记段落，不替换既有段落）；
- ③六个月后谁引用？→ `references/claude-code-capabilities.md`（生成技能在 claude-code 宿主下执勤时的上下文/缓存/输出预算治理依据；R16/R17/R18 注记链的延续）。

### 三、codex 零增量确认 + dsh 零增量确认

- codex：releases Latest 标记仍为 rust-v0.153.4（2026-09-04）；0.154 线全部为 alpha（至 alpha.9）。R17 吸收（Guardian 条件性兜底 / request_user_input_async / hooks 三层信任）维持不变。
- dsh：rc.1（2026-09-03）后主线 0.1.3-alpha.1（09-04）→ 0.1.3-alpha.2（09-07）→ 0.1.5-alpha.1（09-08），**全部预发布**。R17 §八吸收（跨版本读兼容三件套 / 删 SQLite 迁移纪律 / `<domain>/<reason>` 失败词表 / Agent Teams 孵化围栏）维持不变；alpha 线观察（0.1.5 跳过 0.1.4 段，暗示功能线合流）。

## 第二部分：comet 0.4.0 触发兑现（§四预登记条件命中）

R16 预登记复审触发条件「npm dist-tag latest 出现 0.4.0 正式版（非 beta/rc）」于 2026-09-08T14:37 **命中**（GitHub releases Latest = 0.4.0）。按预登记处置执行：

1. 引用基线 v0.3.9 → **v0.4.0**，状态 drifted → **synced**（16 行登记表）。
2. `references/subagent-orchestration.md` 能力清单按 0.4.0 架构重写（.sh 脚本族 → `.mjs` launcher + 稳定 CLI `comet state|guard|handoff|archive` + `.comet/run-state.json` / `state-events.jsonl` + isolation 绑定漂移检测）。
3. 0.4.0 相对 rc.5 的收尾 diff（rc.5→0.4.0：release blockers 修复 + Native/Classic workflow recovery 加固 + native supervisor 子任务验收统一设计）快审对账：**无新增方法论机制**（全部为 rc 线稳定性收敛，R16 已登记的 Supervisor Change v2 / Portable State / Agent Learning Loop 候选维持）。
4. WP-Y drift 门禁：comet 行退出 drifted 集合（warn 清零）。

## 第三部分：外围快审（11 行）

| 运行时 | 上轮 → 本轮 | 判定 |
|---|---|---|
| openspec | v1.12.0 → 零增量 | 对账通过 |
| GitNexus | v1.6.11 → v1.6.12-rc.13（rc 线继续，2026-09-08 stable 未出） | license-risk 不追（决策 18 维持），rc churn 登记不入表 |
| gsd-core | v1.13.0 → 零增量 | 对账通过 |
| claude-mem | v13.24.1 → tag 零增量（main 前进 b6e05382→e03cf5f7，无新 release） | watch 维持 |
| ocr | v1.11.5 → **v1.11.6** | 升基线。快审：一等评审控制（effort / max_tokens_budget / llm_reasoning_effort）+ 实时进度 + OCaml/ReasonML 语言支持 + SIGINT/SIGTERM 转发 + viewer Existing Code 行号 + Kotlin script 路由 + timeout_sec 修复。**评审控制参数化 + live progress 落 review-methodology.md R20 注记**（评审成本/深度可配置化的上游实证） |
| graphify | v0.9.55 → **v0.9.56** | 升基线。快审：Rust trait 方法提取 + Windows 临时路径边界 + hook-skip 子壳 + Node subpath imports 解析 + 无向 MCP 查询 + TS normalizer 去二次方扫描（性能）+ Dart source_location。完整性/覆盖面修复族，对账通过；**克隆 origin 已重指向 Graphify-Labs/graphify**（§二.4 org 迁移的本地落实）。code-graph-tools.md R20 注记 |
| superpowers | v6.3.0 → 零增量 | 对账通过 |
| gstack | v1.80.0.0（c241216）→ **v1.83.0.0**（caba78f，2026-09-09 checkout） | 引用基线升（vendor 快照不动，A8 决策）。1.83：Memorable recall bridge（opt-in + 回执）。subagent-orchestration.md R20 注记一行 |
| ruflo | v3.38.21 → **v3.38.23**（npm Latest；v3.39.0 tag 存在但无 release，按 release oracle 不取） | 升基线。快审：tier 匹配门控模型路由转发 + embedding-cosine 进 SmartRetrieval MMR + **真实冷启动测量替换虚构基准**（诚实性同向：fabricated benchmark 移除）+ ReDoS 边界。subagent-orchestration.md R20 注记一行 |
| ECC | v2.2.0 → **v2.2.1** | 升基线。快审：verified 维护补丁整合 + Windows 所有权路径/安装竞态 fixtures + CodeQL-clean fixtures。维护性发布，对账通过，无新增机制 |
| impeccable | skill-v4.2.1 → skill-v4.3.1（2026-09-09 发布） | 候选级观察维持（R16 裁决：引用基线不升）。review-methodology.md R20 注记一行 |
| codex-security | npm-v0.1.25 → **npm-v0.1.26** | 升基线。快审：GitLab MR 验证补丁通道 + 安全修复验证须显式请求 + Daybreak 访问 advisory + confirmed finding 匹配提速。codex-security-methodology.md R20 注记 |

（better-harness：非表内方法论源，watch 维持——gh release Latest 仍 v0.4.1（2026-08-04），主线 32099ca 前进但无 0.7.0 stable 信号。）

## 第四部分：落地载体清单

| # | 文件 | 变更 |
|---|---|---|
| 1 | `docs/research/R20-runtime-refresh.md` | 本档 |
| 2 | `docs/upstream-baseline.md` | R20 口径注一行 + 7 行表行升级（claude-code/comet/ocr/graphify/ruflo/ECC/codex-security）+ gstack 行升级 + GitNexus/claude-mem/impeccable 行内观察 + §二.2 版本漂移结论（drifted 归零）+ §四 R20 兑现行 |
| 3 | `swarm-yuan/references/claude-code-capabilities.md` | 新增「版本注记：v2.1.266（2026-09-09 核）」段（265 实质五项 + 266 教训） |
| 4 | `swarm-yuan/references/subagent-orchestration.md` | comet 0.3.9 能力清单重写为 0.4.0 架构 + ruflo v3.38.23/gstack v1.83.0.0/ECC v2.2.1 各一行注记 |
| 5 | `swarm-yuan/references/review-methodology.md` | ocr v1.11.6 评审控制参数化注记 + impeccable 4.3.1 观察一行 |
| 6 | `swarm-yuan/references/code-graph-tools.md` | graphify v0.9.56 注记一行 |
| 7 | `swarm-yuan/references/codex-security-methodology.md` | v0.1.26 注记一行 |
| 8 | `docs/design-evolution.md` | §13 档案索引 A17 行 + 附录小结段 |
| 9 | `swarm-yuan/README.md` | 调研报告计数 22→23、档案区间 A1-A16→A1-A17 |

**预算纪律**：FACT_RUNTIMES=13（+DEEP/CLI/METHOD 分层）不动；FACT_REFERENCES=42 不动；check_* 门禁 55 预算不动；认知面预算 ≤262,144B——本轮增量全部为注记级（约 2.5KB），写入后以 self-check 实测为准，超限则按 R18 先例裁早期版本注记段。

## 第五部分：验证

- `bash scripts/self-check.sh --check-only`：全绿 + comet drift warn 归零 + 预算断言通过（收口前实测）。
- 移动项克隆 checkout 验证：comet `git describe` = 0.4.0、ocr = v1.11.6、graphify = v0.9.56、ruflo = v3.38.23、ECC = v2.2.1、codex-security = npm-v0.1.26、gstack = caba78f（v1.83.0.0）。
- 三件套：codex/dsh 零增量（不 checkout）；claude-code 无本地克隆（npm/CHANGELOG 通道，R4 既定）。
