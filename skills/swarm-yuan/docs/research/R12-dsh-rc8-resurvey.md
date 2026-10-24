# R12 · DeepSeek Harness 0.1.0-rc.8 重调研：从"可逆注入"到"决策审计/增量自成长"的设计完善

- 调研角色：R12-dsh 重调研分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-08-20
- 调研快照：`deepseek-ai/deepseek-harness` @ `141eb6fe`（2026-08-19 23:11 +0800，tag `dsh-v0.1.0-rc.8`），本地浅克隆 `swarm-yuan/research/dsh/`（gitignored，不入 git）
- 上轮基线：2026-08-14 吸收（v1.3，dsh 源码级吸收 + 可逆注入 + 分层 patch，落 `references/cordis-composability-methodology.md`）；论文仍为 2026-08-13 草稿（cordiverse/paper 仅 2 commits，无修订）
- 调研方法：源码克隆 + 主干文档（architecture/defensive-patterns/cordis-primer/invariants/approval/permission-presets）自读 + 三路并行子代理深读 50 个 packages（goal/plan/todo/workflow/schedule、guard/hooks/feedback/runtime-diagnostics/identity、skill/subagent/compaction/context/spill/jobs + agent-team）
- 证据规则：dsh 侧结论附 `包/文件` 路径（本地克隆实测）；本仓库侧结论附 `文件:行号`
- 目的：提取 rc.1→rc.8 与架构文档化后**新增的、可迁移的结构性洞察**，产出尊重复杂度负向预算（决策 26/27）的吸收建议——方法论吸收优先，不新增 `check_*` 门禁，门禁总数保持 54

---

## 0. 一句话结论

上轮吸收的是 Cordis **框架层**（时空可组合性：可逆效应 + 响应式依赖）；本轮的新增量在**产品层**——dsh 把"决策审计、状态韧性、增量感知"做成了三套完整且互相咬合的工程机制，而这三块恰好对应 swarm-yuan 刚落地的 fail-gate 审计（WP-Enforce2/3）、state-machine/trace-log、自成长链（WP-Q3-1/R2-2）的**进阶形态**。论文没有新版本，理念层无需重吸收；要吸收的是工程机制。

## 1. 增量总览（vs 2026-08-14 基线）

| 领域 | 基线时 | rc.8 时 | 增量性质 |
|------|--------|---------|---------|
| 版本 | 无 tag（预览早期） | 0.1.0-rc.8（rc.1→rc.8 在 07-27→08-19 内发完） | 工程化提速 |
| 架构文档 | 无 | `docs/architecture.md` + 42 篇 subsystems + 4 篇 postmortem + Agent Notes 体系 | 理念落成文档 |
| 包规模 | 核心十来个 | ~50 packages（goal/guard/hooks/plan/skill/workflow/compaction/schedule/feedback…） | 产品面铺开 |
| 拦截/审批 | 未调研 | `tools/pre-execute` waterfall + 单调守卫 + `ctx.approval` + hook 双桥接 | **新增** |
| 状态韧性 | 未调研 | goal CAS 事件溯源 / todo 整快照 / workflow 永不 reject 信封 / schedule 持久化屏障 | **新增** |
| 技能系统 | 未调研 | skill catalog/body 分离 + digest 驱动替换 + last-good 保留 | **新增** |

## 2. 四簇可吸收机制（按 swarm-yuan 价值排序）

### 簇 A · 决策审计升级（对应 fail-gate-hook / gate-deny.jsonl / --report）

**A1 配对 invoked/result 审计事件**（`hook-protocol/src/events.ts`）：dsh 不只在 deny 时记一行——每次门禁触发先写 `invoked {turn, point, matcher, handlerId}`，跑完写配对 `result {decision, exitCode?, stderrSummary≤500字符, durationMs}`。三个关键设计：
- `handlerId` 是**稳定的确定性 id**（配置文件派生，非随机 UUID）——重跑可对齐 join
- 决策派生规则统一：`output.decision ?? (continue===false ? 'stop' : 'pass')`——**解析失败也落一行 `pass`**，不丢记录
- 全部 log-only（不进模型上下文，零 token 成本）

> swarm-yuan 现状：`fail-gate-hook.sh` 的 `_deny_log()` 只在 deny 时写 `gate-deny.jsonl`（ts/tool/target/gates 四字段），`--report` 只能数 deny。升级后 `--report` 能算**拦截率**（deny/invoked）而非只看 deny 清单。

**A2 按秩折叠的最严合并**（`hook-protocol/src/merge.ts`）：多规则命中同一拦截点，串行执行后按 `deny > ask > allow` 定秩折叠；`reasonsByRank` 分桶——**只有获胜秩的理由浮出水面**（deny 赢了就不混入 warn 的噪音理由）；空输出折叠为中性 `none`。决策与注册顺序无关，审计可复现。

> swarm-yuan 现状：hooks.json 的 PreToolUse 挂了 3 个 hook（precheck --scope / integrity-guard / fail-gate-hook），合并语义依赖 Claude Code 侧实现，本仓无文档约定。

**A3 双通道决策解码 + 事件鉴别器**（`hook-protocol/src/codec.ts`）：exit 2+stderr 是"硬拦截"通道；exit 0 的结构化 JSON（`hookSpecificOutput.permissionDecision`）覆盖顶层 legacy 字段；JSON 块声称的 `hookEventName` 与当前触发事件不符时**只丢弃事件作用域字段、保留顶层字段**——抄错模板的 hook 不会串决策。解析器是 total function：JSON 畸形当纯 stdout，永不向 agent 循环抛异常。

> swarm-yuan 现状：fail-gate-hook.sh 输出 deny JSON 单通道；stdin 解析用 sed/grep，fail-open 已有但"鉴别器"原则未文档化。

**A4 审计追加失败 → 整体拒绝**（`user-approval`）：审批的审计事件写不进去时，**宁可拒绝也不返回未记录的决策**。

> 与 swarm-yuan 的 fail-open 纪律存在张力（`_deny_log` 是 best-effort）。取舍建议：审计失败时 deny 决策仍生效（安全侧），但记一条 fallback 告警到 stderr——不占主流程。此条只吸收原则，不改行为。

**A5 单调守卫**（`ctx.tools.guard()`）：注册在 pre-execute 之后的守卫**只能 deny 或弃权，永远不能 force-allow**——监听器顺序无法复活已被禁的操作。

### 簇 B · 状态韧性（对应 state-machine.sh / trace-log.sh / decisions.jsonl）

**B1 整快照事件溯源 + CAS revision + 追加前独立校验**（`packages/goal`）：每次状态迁移追加携带**完整事后快照**的事件（含单调递增 revision），fold = last-wins；变更携 `{id, revision}` 做 CAS，stale 修订直接拒绝；独立 `./invariant` 伴生校验器在事件**入日志前**校验形状/revision 连续性/合法迁移表/时间戳单调性，第一条损坏事件即停游标。

**B2 持久态与进程本地"激活权"分离**（`goal` 的 activation + goal-round-driver）：durable phase 与"本进程是否有权自动继续"（armed/disarmed）是两个维度；激活权**永不写盘**——重启/fork/恢复后一律 disarmed，必须显式 resume 重新授权。驱动侧：推进前先 flush → await 之后**复核 revision 未变且无竞争输入** → CAS 预订 `round+1`（stale 预订不消耗序号）；flush 失败降级 disarm，不自动重试。

> swarm-yuan 映射：`state.json` 存阶段（durable），锁/PID 文件存"本轮执行权"（不持久化）；崩溃后锁可清但阶段不自动推进。这回答"bash 里追加了日志但不确定落盘/被并发改"的经典竞态。

**B3 永不 reject 的结果信封 + 封闭错误码 + 观测失败降级为合法前缀**（`workflow` + `schedule`）：
- 所有执行结果以**值**形式返回 `{value, stopReason: completed|cancelled|error}`——失败走数据通道不走异常通道
- 错误码是封闭稳定集（如 `persistence_uncertain`），分 fatal/普通——fatal 穿透聚合，普通失败由上层策略决定
- **观测记录写入失败时：要么无记录、要么是合法的连续前缀，绝不改变主流程结果**（tool-workflow 首次 append 失败即禁用该 run 后续记录并告警一次）

> swarm-yuan 映射：trace-log.sh 的自我约束——追踪系统的故障不得污染被追踪的任务（当前 trace-log 已是永不 fail 阻塞主流程，B3 给的是更精确的"合法前缀"语义）。

**B4 校验策略可变、回放规则不可变**（`todo`）：日志 invariant **故意不跟随**当前策略——策略收紧后旧日志必须仍能 replay。

> swarm-yuan 映射：`--upgrade` 升级生成器后，旧 `.swarm-yuan/*.jsonl` 必须仍能被新版校验器回放。这是日志格式版本化的第一原则，应写进决策治理/记忆持久化文档。

### 簇 C · 增量自成长（对应 WP-Q3-1/R2-2 自成长链）

**C1 catalog/body 生命周期分离 + digest 驱动整体替换**（`skill` 包）：catalog 只有 name+description 索引，body 按需重读；每次 pre-step 对已渲染条目算 digest，变了就追加**完整替换目录**而不是 diff——"上次发布的清单"自己就是对比基线。

**C2 工具结果驱动的局部重探查，替代文件 watcher**（`agent-instructions`）：不靠 inotify，而是观察 read/write/edit 工具的 durable result——touch 到某 scope 才做该 scope 的重探查；`{path, version, sha1 digest}` 缓存跳过未变文件。

> swarm-yuan 映射：自成长链从"整仓结构指纹"升级为"路径级 digest 缓存 + 增量重探查"——hook 到 AI 自身的写操作（或 git diff 文件清单）触发**局部**重探查，SHA 未变即跳过，增量且幂等。这是对 WP-R2-2 自成长段的直接进阶。

**C3 分层 rank + fail-closed 解析 + last-good 保留**（`skill-filesystem`）：同名条目按固定 rank 表（项目 > 自定义 > 用户 > bundled）决胜；frontmatter 解析失败**整个条目带警告剔除**（坏数据不出现在禁用面）；发现过程 I/O 失败时快照标 `complete: false`、不缓存、消费者继续用 last-good。

> swarm-yuan 映射：组件清单更新时——新清单**先完整生成再原子替换**，探查中途失败绝不覆盖上一份好清单。

### 簇 D · 工程纪律（对应 review-methodology / self-check / 决策治理）

**D1 defensive-patterns.md**：6 条 bug-class 规则，每条都是真实 shipped/差点 shipped 的缺陷类。与 swarm-yuan 直接相关的：
- "Report orthogonal outcomes independently"——正交结果独立报告，绝不在一个 flag 的分支里嵌套另一个的报告（门禁输出设计原则）
- "Contain callback exceptions in the dispatcher"——一个坏 listener 不破坏核心生命周期（= swarm-yuan hooks 的 fail-open，dsh 给了理论表述）
- "Never hand untrusted output the ambient environment or predictable paths"——env 清洗（drop `*KEY*`/`*SECRET*`/`*TOKEN*`）+ 0700 私有目录 + 随机名 + `wx` 独占创建（spill 包同款）
- "Dispose must reach quiescence, not just request it"——清理是 async 且要等子进程真正退出
- "Async state is not synchronous state"——`whenIdle()` 不是单条消息的完成信号

**D2 不变量伴生 + "No runtime invariant:" 解释性空实现契约**（`runtime-diagnostics/invariants`）：每个包必须发布 `./invariant` 伴生模块；没有可检查关系的包必须写**以 `No runtime invariant:` 开头的注释解释为什么**；`verify-package-invariants` 机械拒绝无解释的空实现。断言只针对"可观察的事件关系/可变数据关系"，**绝不断言服务/方法存在性**（那是类型系统的事）。

> swarm-yuan 映射：与 Q2-heavy 的"机械只在信号可信处"同构；反形式主义的"解释性空实现"可引入 self-check/gates 的 SKIP 语义强化。

**D3 Agent Notes 生命周期**（`.agents/notes/{proposed,implemented,rejected,archived}/<date>-<slug>.md`）：决策笔记有四态生命周期，日期前缀。比 swarm-yuan 的 decisions.jsonl 多了"proposed/rejected"的**未采纳决策留痕**——ISO/IEC 42001 审计视角下，被拒绝的方案同样是治理证据。

**D4 postmortem 编号文档**（`docs/postmortem/NNNN-<slug>.md`）：4 篇编号事后分析。swarm-yuan 的复盘轮（R1-R12）口头化，可借鉴编号制但不强求。

## 3. 不适用项（显式标注）

| dsh 机制 | 不吸收原因 |
|---------|-----------|
| Profiles/bundles 组合（patch-by-id 分层） | swarm-yuan 已有 profile 档 + precheck.patch.conf（F3）——方向已被 dsh 验证，无新动作 |
| Capability seams 三角色 | 框架层理念，上轮已吸收可逆效应/依赖通知；seam 是 TS 服务注册表概念，bash 无对应物 |
| Agent Teams（roster/task board/mailbox） | 实验性私有包；swarm-yuan 的 subagent-orchestration.md 已覆盖编排模式；等其毕业再评 |
| Turn flow / session log 事件溯源全量模型 | dsh 是长驻进程产品，swarm-yuan 是"生成器 + 目标技能脚本集"——无长驻进程可承载 |
| compaction token 经济学 | 属宿主运行时（Claude Code 自有压缩），非生成器职责 |

## 4. 吸收方案（守决策 26/27：不新增 check_*，门禁总数 54 不变；方法论吸收优先）

| WP | 内容 | 对应簇 | 规模 |
|----|------|--------|------|
| **WP-R12-A** | fail-gate-hook 审计升级：deny-only → invoked/result 配对落盘（稳定 handlerId=hook 脚本名、派生决策规则、stderr≤500 截断）；`--report` 增拦截率统计（deny/invoked）。守 fail-open：审计写失败不阻塞，stderr 告警一次（A4 原则的 fail-open 变体） | A1/A2/A4 | 中 |
| **WP-R12-B** | references 方法论吸收：`cordis-composability-methodology.md` 扩写为 dsh 工程机制章（B1/B2/B3/B4 + C1/C2/C3 的 bash 映射 + D1 六条 bash 化表述 + D2 解释性空实现契约）；`memory-persistence.md` 补"回放规则不可变"原则（B4） | B/C/D | 中 |
| **WP-R12-C** | 自成长链增量升级（C1/C2/C3）：`project-fingerprint.sh` 增路径级 digest 缓存（`.swarm-yuan/fp-cache/`，SHA 未变跳过）；SKILL.md 自成长段补"清单先完整生成再原子替换，失败保留 last-good"红线 | C | 中 |
| **WP-R12-D** | 决策治理补"未采纳决策留痕"（D3）：`decision-governance.md` 增 proposed/rejected 状态说明（decisions.jsonl 加 `outcome` 字段文档化，不加机器执法） | D3 | 小 |

**明确不做**：不引入 Agent Teams；不改 profile 体系；不给 state-machine.sh 加 CAS（B1/B2 先以方法论落地，待真实竞态事故再机械化——守"机械只在信号可信处"）；hooks.json 合并语义（A2/A5）只文档化，不改变现有多 hook 行为（宿主合并语义属 Claude Code 实现侧）。

## 5. 可信度声明

- dsh 侧结论均基于本地克隆 @141eb6fe 实测（包路径可复核）；三个子代理报告的关键断言已抽查源码确认（如 `hook-protocol/src/merge.ts` 的秩折叠、`goal` 的 CAS revision）
- 论文无新版（cordiverse/paper 仅 2 commits，仍为 2026-08-13 草稿），理念层与上轮吸收无差异
- dsh 处于 developer preview，官方明示有破坏性变更——本报告吸收的均为**机制设计模式**（不依赖其 API 稳定性），无运行时依赖引入
