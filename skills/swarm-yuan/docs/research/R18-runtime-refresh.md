# R18：运行时补核调研（claude-code 纯修复轮 + 外围四行移动，2026-09-06）

- 调研角色：R18 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-06
- 触发：user message「更新 research 目录下运行时到最新稳定版本，（包括 claude code/codex/dsh）比较和上一版功能差异，然后整合吸收其功能理念，优化 swarm yuan skill……」
- 上轮基线：2026-09-05 R17 补核 + 同日复核（claude-code v2.1.261 / codex rust-v0.153.4 / dsh 0.1.2-rc.1 / 16 行全景）
- 数据来源：npm registry dist-tags（2026-09-06 实测）+ GitHub REST API releases（releases 端点按发布时间排序，规避 /tags 端点乱序）+ anthropics/claude-code CHANGELOG（raw 抓取）；16 克隆 git fetch
- 网络注：github.com git/HTTPS 通道当日大面积间歇 connection reset（origin fetch 超时、16 克隆首批仅 6 个成功），分批重试后 16 克隆全部 fetch 成功、移动项 checkout 完成；**版本真值全程以 npm dist-tags + api.github.com releases 双核为准**（api.github.com 通道正常）
- 登记口径：本轮为**补核轮**（距 R17 一天，用户点名三件套 + 外围全量快审），不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 55 预算，决策 26/26.2）；patch/minor 级不发版（R17 同日复核先例）

---

## 第一部分：点名三件套（claude-code / codex / dsh）

## 一、版本全景

| 运行时 | 上轮基线（R17+同日复核） | 最新稳定（2026-09-06） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.261 | **v2.1.263**（npm latest，2026-09-05 发布） | +2 patch（npm 无 262 版本号，261 后直接 263） | 263 changelog 仅单条 "Bug fixes and reliability improvements"——**纯修复轮，无功能性条目**；latest/stable 分裂持续（stable 仍 2.1.236，落后 27 patch） |
| codex-cli | rust-v0.153.4 | **rust-v0.153.4**（releases 端点实测仍为最新 stable，2026-09-04T23:25） | 零增量 | npm latest 0.153.4 双通道对齐；0.154.0-alpha 线在 alpha 通道（未出 stable） |
| dsh | dsh-v0.1.2-rc.1 | **dsh-v0.1.2-rc.1** | 零增量 | 0.1.2 正式版未出；0.1.3-alpha.1 仍在 alpha 线 |

research/ 本地克隆：codex / dsh 维持原 tag 无需 checkout；claude-code 无克隆（npm 发行闭源，CHANGELOG 调研通道）。

## 二、Claude Code v2.1.261 → v2.1.263（CHANGELOG 全读）

263 是纯修复轮：changelog 仅一条总括（"Bug fixes and reliability improvements"），无任何功能性/机制级条目；npm 版本列表确认不存在 2.1.262（261 直接跳 263）。**结论：无吸收，基线行升级仅记版本真值。** R17 已吸收的 253-261 九项机制（无头执法档/宿主 deny 漂移警示/`/skill-doctor`/提示词外置等）维持不变。

## 三、Codex / dsh 零增量确认

- codex：releases 端点最新 stable 仍 rust-v0.153.4（与 R17 基线一致）；npm latest 0.153.4。R17 吸收（Guardian 条件性/`request_user_input_async`/hooks 三层信任/context_management experimental）维持。
- dsh：最新 tag 仍 dsh-v0.1.2-rc.1；0.1.3-alpha.1 在 alpha 线。R17 §八（跨版本读兼容/删后端纪律/失败词表/孵化围栏）维持；机械落地触发条件未变。

## 第二部分：外围快审（13 行 + 观察项）

| 项目 | 跨度 | 定性 | 结论 |
|---|---|---|---|
| gsd-core | v1.12.0→**v1.13.0**（2026-09-06T02:10，minor） | **证据纪律三连**（复核阻塞须确定性证据 #4085 / no-op 报真实条件与已算值 #4157 / 不可读目录不得报为空 #4163）+ **Review Dispositions Ledger 契约化**（#4345）+ context-drift 前置门（#4147）+ dispatch.maxConcurrency 容量轴（#4162）+ quick-batch 可恢复 manifest（#4190/#4212/#4240）+ bracket-tolerant id 读取（#2867） | **升基线 + 注记落地**（gsd-patterns v1.13 段 + decision-governance R18 补强） |
| graphify | v0.9.54→**v0.9.55**（2026-09-05，patch） | 六项图谱完整性修复：模块 docstring 提取（shebang/编码声明/license 头后不再丢）/ 私有成员 id 盐化防撞（`_get_connection` vs `get_connection`）/ ghost node 保守合并（仅"提到文件"的 source_file 并回真节点）/ **幻影 type-use 边关闭**（无节点符号不得产 `inherits`/`implements`/`references` 边）/ no-cluster 模式同名文件标签消歧 / re-export barrel 正确转发 | 升基线（完整性修复族对账，code-graph-tools 基线行同步——顺带修复该行滞后 0.9.53 的数字裂缝） |
| gstack | v1.77.0.0→**v1.80.0.0**（3 minor，5 commits，08-31~09-05） | 1.78 two-red-lanes 质量波（AUQ 塌陷归零 / OSV 自 105 转绿 / 18 社区 PR）；**1.79 ship 子代理派发不再搁浅整轮运行**（#2772/#2440 类）；1.80 setup 对失败 Chromium 安装存活 + hooks 共享单一状态根 | 升基线（vendor 离线包不动，只升引用基线——A8 决策）+ 韧性族注记（decision-governance R18 补强） |
| impeccable | skill-v4.2.0→**skill-v4.2.1**（2026-09-05；engine-v0.1.2 线起） | Windows 引擎时间戳签名（Renaissance Geek, Inc.）/ 下载失败三态区分（缺失/被移除/校验失败）/ 非交互 Claude 会话技能发现 + 只读建议保持只读 | 候选级维持（R16 裁决沿用），review-methodology R18 观察行 |
| openspec / claude-mem / ocr / ruflo / ECC / superpowers / codex-security | 零增量（npm/GitHub 双核，2026-09-06） | 对账通过 | 维持基线 |
| comet | 0.4.0-rc.5（与同日复核一致） | 正式版仍未出 | drifted 观望维持 |
| GitNexus | v1.6.12-rc.3（与同日复核一致） | license-risk 不追 | 维持 |
| better-harness（不入表） | GitHub releases 端点仅历史 v0.4.1（0.6.x/0.7-alpha 走 npm/tag 线） | 观察项 | 维持 v0.6.6 观望 |

## 第三部分：吸收三问评审

| # | 候选 | ①落到运行时条件？ | ②替换/叠加？ | ③六个月后谁引用？ | 裁决 |
|---|---|---|---|---|---|
| 1 | gsd 1.13 复核阻塞须确定性证据（#4085） | 是——gate-report/verifier 证据态同构 | 叠加（"缺失≠VERIFIED"族） | 证据态分级/复核门引用 | 落地注记 |
| 2 | gsd 1.13 no-op 报真实条件与已算值（#4157） | 是——"缺失证据不显示为零"同族第三样本 | 叠加 | missing_evidence 谱系引用 | 落地注记 |
| 3 | gsd 1.13 不可读目录不得报为空（#4163） | 是——枚举面同族 | 叠加 | inventory-verify 谱系引用 | 落地注记 |
| 4 | gsd 1.13 Review Dispositions Ledger 契约化（#4345） | 是——评审处置台账与 gate-audit.jsonl/deny 审计同构 | 叠加 | 审计台账设计引用 | 落地注记 |
| 5 | gsd 1.13 context-drift 前置门（#4147） | 是——与 project-fingerprint --diff 同向印证 | 叠加（印证行） | 演化链指纹引用 | 一行印证 |
| 6 | gsd 1.13 dispatch.maxConcurrency + quick-batch 可恢复 manifest | 条件未熟——本仓无多 reviewer lane 并发派发场景 | 候选 | 并行评审轮 | 候选登记 |
| 7 | gstack 1.79 派发不搁浅（#2772/#2440 族） | 是——子代理失败面爆炸半径收敛，failure-detector SPINNING 同向 | 叠加（韧性族） | 失败检测谱系引用 | 落地注记 |
| 8 | gstack 1.80 hooks 单一状态根 + 安装韧性 | 是——hooks 状态同构 | 一行 | wiring 层引用 | 一行印证 |
| 9 | graphify 0.9.55 幻影 type-use 边关闭 | 是——代码图谱完整性（防幻觉族同向） | 对账 | code-graph-tools 引用 | 对账注记 |
| 10 | claude-code 263 | 无功能性条目 | — | — | 无吸收 |
| 11 | impeccable 4.2.1 | 候选级 | 观察 | 行为钉死轮 | 观察行 |

## 第四部分：落地载体清单

1. `docs/upstream-baseline.md`：R18 口径注 + 五行更新（claude-code 263 / gsd-core 1.13.0 / graphify 0.9.55 / gstack 1.80.0.0 / impeccable 4.2.1）+ §二关键结论 R18 句。
2. `references/claude-code-capabilities.md`：头部口径三处 261→263 + 文末新增「版本注记：v2.1.263（2026-09-06 核）——纯修复轮」。
3. `references/gsd-patterns.md`：文末新增「gsd-core v1.13.0 要点（2026-09-06 R18 补核）」段。
4. `references/decision-governance.md`：「证据共识与 fail-closed 的 wiring 层」来源行扩展 + 两条 R18 补强 bullet（证据纪律三连 / 派发不搁浅）。
5. `references/code-graph-tools.md`：graphify 基线行 0.9.53（滞后）→ 0.9.55 同步 + 完整性修复一行。
6. `references/review-methodology.md`：文末新增「R18 补核（2026-09-06）」段（外围零增量对账 + impeccable 4.2.1 观察行）。
7. research/ 克隆：gsd-core→v1.13.0、graphify→v0.9.55、gstack→main c241216（v1.80.0.0）；其余 13 个维持原 tag。
8. 本报告即 §13 历史档案 A16（`docs/design-evolution.md`）。

## 第五部分：验证清单

- [x] 16 运行时版本真值 npm + GitHub API 双核（github.com git 通道间歇 reset，fetch 分批重试后全成功）
- [x] 三件套差异全读：claude-code 263 纯修复（CHANGELOG）/ codex、dsh 零增量（releases 端点）
- [x] 移动项克隆 checkout 完成（gsd-core v1.13.0 / graphify v0.9.55 / gstack c241216 v1.80.0.0）
- [x] 吸收三问 11 项评审：落地注记 5 + 一行印证 2 + 候选 1 + 观察行 1 + 无吸收 1 + 对账 1；零新 references 文档、门禁 55 守恒、FACT_RUNTIMES 13/FACT_REFERENCES 41 不变
- [x] 规范层数字裂缝：code-graph-tools graphify 基线行滞后 0.9.53 → 0.9.55 就地修复
- [x] 税制预算：R18 追加一度使认知面 264,086B 超标（预算 262,144B），按 v2.7.0"版本注记段瘦身"先例压缩 claude-code-capabilities v2.1.233-237 老注记段 + 收紧 R18 新增段，回落 261,833B（余量 311B）
- [x] `bash scripts/self-check.sh --check-only` 无新 drift（认知面断言 261,833B 通过）
