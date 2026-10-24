# R16：运行时全量升级调研（16 运行时，2026-09-01）

- 调研角色：R16 运行时升级分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-09-01
- 触发：user message「更新 research 目录下运行时（包括 claude code、codex、deepseek harness 等工具的版本变化情况）到最新稳定版本……」+「运行时不仅仅指这 4 个，research 下依赖的各种第三方都要包括」——**范围从四件套扩展为全量 16 运行时**
- 上轮基线：2026-08-21 A11 全量重核（13 项）+ R4 CLI 专题（claude-code v2.1.237 / codex v0.148.0 / dsh rc.8 / better-harness 0.6.4）
- 数据来源：npm registry dist-tags（2026-09-01 实测）、GitHub releases/tags、本地 12 克隆 git fetch + tag checkout + diff；四路子代理源码级调研（CLI 四件套 / CLI 接线层 5 项 / 方法论引用层 6 项 / graphify 专项核实）
- 登记口径：本轮为**补核轮**（README §6.6 A14 = 2026-09 篇运行时升级报告，全量），非新方法论轮——不新增 references 文档、不进 FACT_RUNTIMES 13/5、不新增 check_* 门禁（守 54 预算）

---

## 第一部分：CLI 四件套（claude-code / codex / dsh / better-harness）

## 一、版本全景

| 运行时 | 上轮基线 | 最新稳定（2026-09-01） | 跨度 | 备注 |
|---|---|---|---|---|
| claude-code | v2.1.232 调研 / v2.1.237 R4 补核 | **v2.1.252**（npm latest，2026-08-31） | npm 15 版 / CHANGELOG 12 条 | **npm dist-tag 分裂：latest=2.1.252 / stable=2.1.236**（新发布通道） |
| codex-cli | v0.146.0 调研 / v0.148.0 R4 补核 | **v0.152.0**（2026-09-01 stable） | 4 stable，405 commits | v0.153.0-alpha.1 同日已出；docs/skills.md 零 diff |
| dsh | dsh-v0.1.0-rc.8（R12） | **dsh-v0.1.1-rc.2**（b150a551b，2026-08-21） | 207 commits | 功能线非修复线、无 breaking；master 已到 0.1.2-alpha.3（08-31，1430 commits） |
| better-harness | 0.6.4（R14） | 0.6.6（2026-08-31） | 2 patch | 纯方法论源，不入 16 运行时表 |

research/ 本地克隆已全部 checkout 到最新稳定 tag（gitignored 不入 git）。

## 二、Claude Code v2.1.238 → v2.1.252（CHANGELOG 全读）

**功能性新增**（纯修复版 240/241/245/250 不列）：

| 主题 | 版本 | 内容 |
|---|---|---|
| `--restricted` 锁定模式 | 248 | `CLAUDE_CODE_RESTRICTED=1`：移除执行类内置工具+WebFetch、文件工具限工作目录、拒绝 bypassPermissions、忽略 user/project/local settings |
| PreModelSwitch/PostModelSwitch hooks | 251 | 模型切换可 block/confirm/annotate；SessionStart resume hooks 增 staleness + re-cache 成本 |
| Workflow 工具 prompt 外置 | 248 | 工具描述 5.7k→1k token，脚本参考移入 bundled `workflow-authoring` skill |
| 子代理韧性/缓存 | 243/246/247/248/251 | maxTurns 撞限标 partial 可 SendMessage 续跑；404 走 fallback 模型链；frontmatter `experimental.cacheTtl`；settings `promptCacheTtl`/`subagentPromptCacheTtl`/`modelPicker`/`modelPricing`；`CLAUDE_CODE_SUBAGENT_MODEL` 改默认不覆盖；agent teams 队友终答达队长 |
| 沙箱/权限硬化波 | 246-252 | symlink TOCTOU（权限检查后换链读写越界）修复；沙箱 Bash 输出文件防重定向；`Bash(git * x)` 通配符告警；算术赋值/悬空算符畸形命令须批准；服务器托管设置弱化沙箱须批准；project settings `env` 禁设 `CLAUDE_CONFIG_DIR`/`TMPDIR` |
| hooks 错误可见化 | 246/248 | hook stdout 非法 JSON → 显式 hook error；后台会话点名失败 hook 与 schema 错误 |
| 跨会话/CLI 全面化 | 239/251 | Windows 补齐 SendMessage/ListAgents；`attach`/`logs`/`stop`/`respawn`/`rm` 子命令 |
| `/goal` 退避 | 239 | check-in 30min→1h→2h 退避（防检查成为负载） |
| SendFeedback 工具 | 247 | Claude 可起草反馈报告经用户审阅发送 |

## 三、Codex v0.149 → v0.152（子代理源码级调研浓缩）

- **Guardian v2 落地形态**：flag 默认 false 迭代；`--approve-for-me`（别名 `--not-so-yolo`）fail-closed 评审（90s 超时、严格 JSON）；**用户显式调用的 skills 受信任**（0.151，#41006）；过期风险分类权限变化后不授权（0.151）；跨 compaction 保留授权（0.152）。
- **skills token 预算**（0.149）：`[skills] max_context_tokens` 默认 2% 上下文、上限 10k（`codex-rs/config/src/skills_config.rs`）——技能目录进 prompt 前有截断 + 实验性路由（recent/character-routed/shadow）。
- **破坏性**：v0.150 untrusted 项目不加载项目级 AGENTS.md（#39837）；v0.152 planning 工具默认禁用需 `tools.update_plan.enabled`（#41744）。
- **Interrupt hook 事件**（0.150，#40511；hooks 共 11 事件，`codex-rs/hooks/src/schema.rs`）；extensions 可拦截/替换 MCP 工具结果（0.151）；安全波（config/sed 解析 fail-closed、Seatbelt/bubblewrap、app 签名校验）；会话资产化续（agents 仪表盘、queue、@mention 任务、per-tool `output_token_limit`）。

## 四、dsh rc.8 → 0.1.1-rc.2（子代理源码级调研浓缩）

1. **Authorization seam 三件套**（簇 A 补充）：键空间按所有者插件划界（`CredentialKey`=<scope>/<id>）/ flow 拥有写入（seam 校验提交而非存在性）/ 交互随请求走（headless 传 decline）/ 每 key 单飞（`ALREADY_IN_FLIGHT`）；`authorization/settled` 覆盖终态（`.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.md`）。
2. **二版本模式**（簇 B 补充）：统一图片管线——历史存 provider 无关规范化附件（内容寻址），传输派生瞬态投影；批量"先全部验证再发布"（PR #2676）。
3. **投影态 schema 校验 + 坏态整 log 重建**（簇 B 升级论据）：`SessionProjectionStateMap` 带 `stateSchema`；persist opt-in 取消一律 checkpoint（#2702/#2730）。
4. **#2608 合而复撤**（簇 D 新样本）：permission PR 合入后 rc.2 整体回退+快照同步——"回退优先于带病修复"。
5. **0.1.2-alpha 方向**（alpha.1-3）：persistence per-record 布局 + 一对一迁移 + prepared sessions + **删 SQLite 后端（breaking）**；Agent Teams；api/*-controller + Remote 拆分；inspector。**裁定：等 0.1.2 rc 后另立一轮调研（R12 先例：rc 档才做产品层吸收）。**

## 五、better-harness 0.6.4 → 0.6.6（CHANGELOG 直读）

0.6.5/0.6.6 主体是 Harness Studio（双语工作台：Sessions/artifacts/Git 历史/Agent runs）与 Inspector 深化（Usage/Context 报告：模型调用数、cache reuse、上下文演进、compaction 边界）。可对账点：**"缺失证据不显示为零"**（unavailable evidence 不伪装成 0）——与本仓 gate-report missing_evidence 态"不插值不算分"（`scripts/gate-report.sh:118`）同语义，**对账通过，无新增落地单元**（R14 四单元已覆盖其审计面；Canvas/Studio 可视化维持不吸收裁定）。

## 六、吸收三问评审与落地

| # | 候选 | ①落到运行时条件？ | ②替换/叠加？ | ③六个月后谁引用？ | 裁定 |
|---|---|---|---|---|---|
| 1 | `--restricted` 环境前置诚实化 | 是——restricted 会话门禁全链失效，AI 须知交付断言不可作数 | 叠加（capabilities 文档补核段） | 生成技能时按环境前置引用 | 落地（文档层） |
| 2 | PreModelSwitch 挂点 | 条件未熟——无"弱模型越档"真实事故 | 候选登记 | adaptive-gating 升级轮 | 登记（触发条件写明） |
| 3 | Workflow 外置 skill 化 | 无实现——本仓 WP-P5 已同构 | 方向验证记录 | 引用层演进论证 | 落地（文档层注记） |
| 4 | Guardian 信任显式 skills | 是——结构化 PASS/FAIL 是宿主审批通用货币，gate-report 已产出 | 叠加（codex-methodology 补核段） | Codex hooks 接线轮 | 落地（文档层） |
| 5 | Codex 破坏性三处对账 | 是——逐条核实本仓无暴露面 | 对账结论 | install.sh/生成器维护者 | 落地（对账注记） |
| 6 | dsh 四项机制 | 三项为文档化原则、一项升级论据；二版本模式无独立渲染层可落 | 叠加（dsh-methodology §七） | 状态韧性/凭据治理演进轮 | 落地（文档层 + 1 候选） |
| 7 | bh missing≠zero | 已同构（missing_evidence 不插值） | 对账结论 | 证据态纪律引用 | 对账通过，零改动 |

**不吸收清单**：Harness Studio/Inspector 可视化（R14 裁定维持）；Codex Guardian 自动审批接线（flag 未默认开，等稳定）；dsh 0.1.2-alpha 全部（等 rc）；Claude Code Remote Control/ultrareview/自托管 runner（云端协作面，与本仓 bash+JSONL 链路正交）。

## 七、落地载体清单（本轮全部改动）

1. `references/claude-code-capabilities.md`：头部基线 v2.1.232→v2.1.252（口径精确化：npm 223 版/CHANGELOG 175 条 + stable 通道注记）+ §四 hooks 表 2 行（PreModelSwitch/PostModelSwitch）+ R16 补核段（8 小节）。
2. `references/codex-methodology.md`：R16 补核段（Guardian/skills 预算/破坏性两处/Interrupt/extensions/安全波/会话资产化）。
3. `references/dsh-engineering-methodology.md`：来源行升级（rc.8→补核至 0.1.1-rc.2）+ §七 0.1.1 增量（5 小节）+ §五候选表 +1 行（二版本模式）。
4. `README.md`：§6.7 17 份调研报告（R1-R16）；§6.4 表头日期口径化 + 重核口径注 + 三行（claude-code/codex-cli/dsh）升基线；§6.4 §三新增 3.4 R16 表；§6.6 档案 A1-A13→A1-A14 + A11 表加 R16 指针（原文不动）+ 新增 A14 报告。
5. `docs/research/R16-runtime-refresh.md`：本档。

## 八、验证

- `bash scripts/self-check.sh --check-only`：16 个 baseline_status 标记齐全、无新增 drift warn（R16 三行仍 synced）
- 吸收三问全过（§六）；门禁 54 不增；FACT_RUNTIMES 13/5、FACT_REFERENCES 41 均不变（补核轮不加新载体）
- research/ 三克隆 checkout 验证：`git describe` = rust-v0.152.0 / dsh-v0.1.1-rc.2 / v0.6.6

---

## 第二部分：research/ 下全部第三方运行时（扩展段，2026-09-01）

> 用户指正"运行时不仅仅指这 4 个"后的全量重核。数据：npm dist-tags + GitHub tags + 本地 12 克隆 fetch/checkout/diff（2026-09-01 实测）。两路子代理源码级调研（CLI 接线层 5 项 / 方法论引用层 6 项）。

### 九、版本全景（12 项 + GitNexus 补核）

| 运行时 | 上轮基线 | 最新稳定（2026-09-01） | 跨度 | 裁决 |
|---|---|---|---|---|
| openspec | v1.10.0 | **v1.11.0** | 13 commits | 升基线，对账通过（CLI 人体工学） |
| comet | v0.3.9 | 0.4.0-rc.1（正式版未出） | 20 beta + 1 rc | **仍 drifted 观望** |
| GitNexus | npm 1.6.9 | v1.6.11-rc.23（GitHub 恢复活跃，全 rc） | — | 仍 license-risk 不追 |
| gsd-core | v1.11.0 | **v1.12.0**（next） | 182 commits，**1 破坏性** | 升基线 + 吸收 |
| claude-mem | v13.15.3 | **v13.21.2**（GitHub；npm latest 回钉 12.4.7） | 31 tags | 升基线 + 吸收 |
| ocr | v1.9.8 | **v1.11.1** | 45 commits | 升基线 + 吸收 |
| graphify | v0.9.47 | **v0.9.53**（GitHub v8 线） | 123 commits | 升引用基线 |
| superpowers | v6.3.0 | v6.3.0（无新版） | — | 对账通过 |
| gstack | v1.68.2.0 | **v1.77.0.0**（vendor 快照不动） | 9 minor | 升基线 + 吸收 |
| ruflo | v3.38.12 | **v3.38.20** | 31 commits | 升基线（dream cycle 候选） |
| ECC | v2.1.0 | **v2.2.0** | 108 commits/530 文件 | 升基线 + 吸收 |
| impeccable | v4.1.1 | skill-v4.1.2 | 1 patch | 候选级暂不升基线 |
| codex-security | v0.1.16 | **v0.1.24** | 133 commits | 升基线 + 吸收（assess-patch-risk 候选） |

### 十、关键裁决与异常澄清

1. **comet 不升基线（维持 drifted）**：0.4.0-rc.1 正式版未出；rc 阶段仍落地 117k 行新子系统（Personal Memory/Project Knowledge/Agent Learning Loop，#353 squash 575 文件），rc→stable 大概率继续 churn；升级破坏性大（`references/subagent-orchestration.md:116-118` 的 7 个 `.sh` 清单全失效变 `.mjs`+Hook Router），等 stable 一次做对。Supervisor Change v2/Portable State/Agent Learning Loop 登记候选。
2. **claude-mem npm 通道异常澄清**：13.x 各版均发布到 npm，但 `latest` dist-tag 被人为回钉 12.4.7（2026-04-26，npm 不允许重发同版本故系人为）——官方分发主通道已切 Claude Code 插件市场（`/plugin install claude-mem@thedotmack`）+ cmem.ai，npm 为遗留/SDK 通道。**版本 oracle 一律以 GitHub tag 为准；npm 引用须显式钉 `claude-mem@13.21.1`，勿信 dist-tags。**
3. **graphify 跟踪线确认**：npm `graphifyy` 0.10.0 与 GitHub v1.0.0 都是 2026-06 异源旧分支（与 v0.9.47 diverged）；**跟踪线=GitHub v8 分支 v0.9.53（0.9.47→53 有 123 commits 持续活跃）**。
4. **gsd-core v1.12.0 有一个破坏性变更**：`<fails_when>` 强制——每个 automated 验收命令必须声明可观察失败信号（旧 phase re-check 报 blocker）。

### 十一、机制级增量摘要（按运行时）

**gsd-core v1.12.0**（182 commits）：`.planning/state.json` 机器可读状态契约（versioned contract，best-effort 写永不失败 + `planning inspect` schema-v1 只读快照）；`<fails_when>` 强制；多评审并行+共识门（孤立 HIGH 按证据加权，存在性断言须 source-grounded）；缺失≠VERIFIED 证据纪律；供应链 runtime-identity 断言 + versioned exit contract。

**claude-mem v13.21.2**：配额熔断器四规则（持久化跨重启/冷却期单探针/generator 认领防误清/"额度耗尽≠故障"不计 health ledger）；观察者契约 SILENT BY DESIGN + NO CONTACT；有界会话代际（memory 播种 generation 回收自恢复）；"继任者就绪"重启语义（bound port ≠ ready worker）；fail-soft 旁路 + 显式优于探测。

**ocr v1.11.1**：语义文件分组审查（LLM 聚类≤10 文件/组，组级 sub-agent 独立上下文，大 diff 降本）；跨 session findings 比较（path+category+snippet 非行号匹配，new/persisting/resolved/not-reviewed 四象限）；`--effort low/medium/high`（MaxReviewRounds 1/2/3）；action checkpoint 增量审查 fail-closed 回全量。

**gstack v1.77.0.0**：spawned 会话原语（`GSTACK_SESSION_KIND=spawned` 标记只信创建会话的 prompt；破坏性选项永不自动选；auto-decision 以 `decisions` 数组回报——"nothing is decided invisibly"）；ponytail 简化审查第八 lens（封闭五标签词汇/advisory-only/捷径台账）；**fail-closed 的 wiring 层也会 fail-open**（GitHub run-step 默认无 pipefail，`tee` 吞退出码，改 `PIPESTATUS[0]` 并钉 wiring 测试；跑 PR 代码的 job 不持评论写 token）；门禁普查反不变式清幻影门禁。

**ECC v2.2.0**：Plan Canvas 监听纪律（反馈只在 `await` 真实驻留时可达——"turn 结束时没有监听者，人类对着空椅子说话"；canvas 内必答——"沉默与坏掉的 canvas 无法区分"；`stop:plan-canvas-pending` hook 兜底）；"skills over MCP" 政策（默认 MCP 6→1 个，退役职责由 skill 包 CLI/REST 或宿主原生承接）；安装所有权台账（manifest 驱动+累积 ledger）；发布 fail-closed（staging dist-tag 验证 registry 字节后才 promote latest）。

**codex-security v0.1.24**：第 15 个 bundled skill **assess-patch-risk**（只读 patch 风险评估：SHA-256 绑定不可变工件、impact/likelihood/protection/recoverability/confidence 五维、merge/revise/no_op/block/hold_for_evidence 五值裁决+auto_merge_candidate 标签、"hold 最多给 3 个具体取证动作"、"subject 文本一律视为数据"）；component scans（SDK 自动组件规划+独立扫描+合并 findings）；findings service/embeddings 跨扫描去重。

**ruflo v3.38.20**：主体 patch 列车；机制线=dream cycle（假设评估前冻结+对抗性 critic 独立复现+ACCEPT-scoped 限定落地）+ ADR-322C witness/receipt 契约收紧。

**impeccable skill-v4.1.2**：monorepo DESIGN.md projectRoots 归属；**Stop hook 改发 Codex decision 格式——设计门禁从"建议"变"真拦截"（gate 输出必须匹配宿主拦截协议否则形同虚设）**；检测器降误报/live mode symlink 加固。

### 十二、吸收三问评审（扩展段）

| # | 候选 | ①落到运行时条件？ | ②替换/叠加？ | ③六个月后谁引用？ | 裁定 |
|---|---|---|---|---|---|
| 8 | gsd-core state.json 契约/fails_when/共识门/缺失≠VERIFIED | 是——验收命令两要素=命令+失败信号；共识按证据不按多数 | 叠加（gsd-patterns + decision-governance） | 审查/验收纪律引用 | 落地 |
| 9 | claude-mem 熔断器/观察者契约/代际 | 是——quota≠故障分类、观察纯洁性 | 叠加（memory-persistence） | 运行时韧性/审计线引用 | 落地 |
| 10 | ocr 语义分组/session compare/effort | 是——大 diff 降本模式、行号无关匹配键 | 叠加（review-methodology） | 两阶段审查互补引用 | 落地 + 分档候选 |
| 11 | gstack spawned 原语/wiring fail-open | 是——子代理信任边界、fail-closed 须钉 wiring 测试 | 叠加（subagent-orchestration + decision-governance） | 编排纪律引用 | 落地 |
| 12 | ECC Plan Canvas 监听纪律 | 是——交互面不允许静默失效 | 叠加（subagent-orchestration） | 交互面纪律引用 | 落地 + 候选单行 |
| 13 | codex-security assess-patch-risk | 条件未熟——五值裁决体系引入需评估与本仓 verdict 白名单关系 | 候选（review-methodology 登记） | patch 风险门禁轮 | 候选登记 |
| 14 | ruflo dream cycle | 条件未熟 | 候选（review-methodology 登记） | 对抗性验证轮 | 候选登记 |
| 15 | impeccable gate 协议合规 | 条件未熟——R12 fail-gate 已双宿主合规，属同向印证 | 候选（review-methodology 登记） | 门禁协议演进轮 | 候选登记 |
| 16 | comet 0.4 三机制 | 条件未熟——等 stable | 候选（subagent-orchestration 登记） | comet 升级轮 | 候选登记 |
| 17 | openspec/superpowers | 无新机制/无变化 | 对账结论 | — | 对账通过 |

### 十三、落地载体清单（扩展段）

6. `references/gsd-patterns.md`、`references/decision-governance.md`、`references/review-methodology.md`、`references/memory-persistence.md`、`references/subagent-orchestration.md`：各加 R16 补核段。
7. `README.md`：16 行表 13 行更新（11 升基线 + comet/GitNexus 状态注记）+ §二 关键结论重写 + 表头口径注改全量 + A14 扩展为全量报告。
8. research/ 12 个克隆 checkout 到最新稳定 tag（openspec v1.11.0/comet 0.4.0-rc.1/claude-mem v13.21.2/graphify v0.9.53/ruflo v3.38.20/ECC v2.2.0/gsd-core v1.12.0/ocr v1.11.1/codex-security npm-v0.1.24/gstack e76f65a/superpowers v6.3.0/gitnexus v1.6.11-rc.23）。
