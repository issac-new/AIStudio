---
name: aipaydev-dev
description: aipaydev 支付中台研发技能（四应用 csw-pay-core/CHWX/CHALI/cashier-mp）。收到 AN-*/DEV-*/TEST-* 任务单、支付/收银/渠道/对账相关开发测试任务时使用；含九节点工作流+56 门禁+里程碑上报。
profile: standard
status: draft
---
# aipaydev-dev — 支付中台研发技能（swarm-yuan standard 骨架+推演纪律合体版）
> 由 swarm-yuan 生成器创建（2026-10-10T12:17:31Z，profile=standard），AI 探查填充后 `--mark-active` 激活。填充规范见 swarm-yuan/references/template-spec.md

**五层导航**（本文按理念→设计→架构→工作流程→使用组织，闭环=执勤→变化→自成长→再执勤）：
- **理念**：拼装式开发（组件库清单=reference-manual §4，禁重复造轮子）；三权分立——特征卡立法（组件库清单载体=reference-manual）/门禁执法（precheck 四族）/审查司法（节点⑦+review-record）；诚实降级——误报走 conf+decisions.jsonl 留痕；回复纪律——面向人的输出用受控语言（references/controlled-language-methodology.md）
- **设计**：改造分类+拼装原则+安全规范→references/dev-guide.md；左移 spec §19-21→assets/spec-template.md；决策纪律（Mechanical/Taste/UserChallenge）→decisions.jsonl
- **架构**：项目认知=下方摘要表；六段式结构+框架规律→references/framework-knowledge.md（按 ACTIVE_FRAMEWORKS 生成）
- **工作流程**：开发工作流九节点（①需求→…→⑨发布）→references/workflow.md；任务配方→references/recipes.md（②探查先查）；守卫链=spec-first hook（无 spec 写码即拦）→状态机阶段守卫→门禁序列→拦截落 gate-deny.jsonl
- **使用**：对 AI 说话——"开始新需求：xxx"（进九节点）/ "跑门禁"（--all-full）/ "项目变了，刷新技能"（自成长段）/ "报了误报"（conf 调整+留痕）

## 项目认知摘要（生成器检测回填——特征卡 #1 项目类型 / #4 技术栈的承接点，AI 填充时在此基础上深化）

| 特征项 | 生成器检测值（AUTO:detected） |
|--------|------------------------------|
| 项目根 | /Volumes/nvme2230/lab/ncwk-sim-mux/central/aipaydev |
| 构建命令 |  |
| 测试命令 | (cd apps/csw-cashier-mp && npm test) && (cd apps/csw-channel-alipay && npm test) && (cd apps/csw-channel-wechat && npm test) && (cd apps/csw-merchant-api && npm test) && (cd apps/csw-pay-core && npm test) && (cd apps/test-integration && npm test) |
| 检测框架 | jest-vitest |

> 项目类型与改造分类（A/B）由 AI 探查判定（§D.0 语义判断）；生成器只做自动嗅探（命令/框架清单）。


## 自成长（项目变了，本技能跟着变）

本技能的组件库清单/编排约束是生成时刻的快照。项目代码演进后按此链更新：

1. **感知**（会话开始时，秒级）：`bash scripts/project-fingerprint.sh <项目根> --diff`；无基线先 `--write`。Claude Code 的 SessionStart hook 已自动感知；其他运行时 AI 主动跑。
2. **判断**：「⚠ 项目源码已变化」→ 走更新链；「无变化」→ 正常开发。
3. **更新链**（检出变化后）：
   - 工具链刷新：生成器（路径见 `.swarm-yuan-version` 的 source_repo）`--refresh` 看 dry-run → `--upgrade` 更新门禁/模板（reference-manual.md 等项目内容文件保留）
   - 内容刷新：`--diff` 的「变化目录 scope」= 重探查范围——只对该 scope 按 swarm-yuan `references/exploration-guide.md` §D 重探查，更新 `references/reference-manual.md` 对应条目；未变条目原样保留
   - 核验：本地 `scripts/inventory-verify.sh` 计数核验（清单 ≥ 枚举 ×0.95 + 路径存在性防幻觉；v2.14.2 起随技能分发自包含，生成器侧亦可）
   - 边集重建：本地 `scripts/relations-extract.sh` 重跑出 `references/relations.jsonl`（断边/项目演进后；v2.14.2 起随技能分发自包含）
4. **落新基线**：`bash scripts/project-fingerprint.sh <项目根> --write`。
5. **问题沉淀**（使用中随时，不等项目变化）：解决的新问题（新复用解法/新约束/新坑）三选一沉淀——`inventory-update` 入清单 / recipes.md 加配方或注意事项 / `gate-rules.sh --persist` 入规则——并 `bash scripts/trace-log.sh --decision` 留痕（问题→方案→沉淀物）。

红线：① 指纹只感知结构变化；语义变化（约束失效/接口语义变更）靠 AI 编码中发现即更新清单，不等 refresh。② 清单先完整生成再原子替换，条目骤降 >50% 视为失败保留旧清单（last-good）。
## 按需读取引用索引（自动生成，勿手改——由 generate-skill.sh 依据 profile 档生成）

| 文件 | 用途 |
|------|------|
| assets/spec-template.md | spec 模板 §1-24 |
| assets/plan-template.md | plan 模板 |
| assets/review-record-template.md | 审查留痕模板 |
| assets/branch-setup.sh | 模板/配置资产 |
| assets/env-setup.sh | 模板/配置资产 |
| assets/data-sample-template.md | 模板/配置资产 |
| assets/task-type-gates.conf | 任务→门禁映射 |
| assets/profile-thresholds.conf | 档位阈值 |
| assets/inventory-dimensions.conf | 模板/配置资产 |
| scripts/mine-habits.sh | 生成器工具 |
| scripts/precheck.sh | 门禁执行入口 |
| scripts/gates-strict.sh | strict 门禁 |
| scripts/gates-warn.sh | warn 门禁 |
| scripts/gates-advisory.sh | advisory 门禁 |
| scripts/gate-enforce-level.conf | 模板/配置资产 |
| scripts/precheck.conf | 模板/配置资产 |
| scripts/precheck.arch.conf | 模板/配置资产 |
| scripts/snippets.md | 模板/配置资产 |
| scripts/mcp-tools.md | 模板/配置资产 |
| scripts/state-machine.sh | 六阶段守卫 |
| scripts/trace-log.sh | 调用/决策留痕 |
| scripts/memory-backends.sh | 模板/配置资产 |
| scripts/memory-writeback.sh | 记忆写回 |
| scripts/spec-first-lib.sh | 模板/配置资产 |
| scripts/spec-first-pre-commit.sh | 宿主拦截脚本 |
| scripts/spec-first-bridge.sh | 宿主拦截脚本 |
| scripts/failure-detector.sh | 失败检测 |
| scripts/integrity-guard.sh | 完整性防护 |
| scripts/fail-gate-hook.sh | spec-first 拦截 |
| scripts/install.sh | 模板/配置资产 |
| scripts/generate-skill.sh | 生成器垫片 |
| scripts/codex-gate-wrapper.sh | 宿主拦截脚本 |
| scripts/setup-loop.sh | 宿主拦截脚本 |
| scripts/loop-hook.sh | 宿主拦截脚本 |
| scripts/project-fingerprint.sh | 指纹感知入口 |
| scripts/inventory-update.sh | 生成器工具 |
| scripts/relations-extract.sh | 生成器工具 |
| scripts/inventory-verify.sh | 生成器工具 |
| scripts/relations-query.sh | 生成器工具 |
| scripts/gate-rules.sh | 生成器工具 |
| scripts/gate-plan.sh | 生成器工具 |
| scripts/audit-closure.sh | 生成器工具 |
| scripts/ontology-verify.sh | 生成器工具 |
| references/ontology/objects.md | 本体事实源 |
| references/ontology/links.md | 本体事实源 |
| references/ontology/actions.md | 本体事实源 |
| rules.d/bash-advance.rules | 三值规则数据 |
| rules.d/readonly-safe.rules | 三值规则数据 |
| rules.d/framework-globs.rules | 三值规则数据 |
| scripts/self-check.sh | 生成器工具 |
| scripts/detect-frameworks.sh | 生成器工具 |
| scripts/cost-report.sh | 成本报告 |
| scripts/detect-profile-drift.sh | 生成器工具 |
| scripts/detect-spec-scale.sh | 生成器工具 |
| scripts/task-scale.sh | 生成器工具 |
| references/subagent-orchestration.md | 方法论 reference |
| references/task-methodology-router.md | 方法论 reference |
| references/canary-monitoring.md | 方法论 reference |
| references/review-methodology.md | 方法论 reference |
| references/code-graph-tools.md | 方法论 reference |
| references/gsd-patterns.md | 方法论 reference |
| references/memory-persistence.md | 方法论 reference |
| references/security-spec.md | 方法论 reference |
| references/cognition-framework.md | 方法论 reference |
| references/logic-razor.md | 方法论 reference |
| references/cognitive-bias.md | 方法论 reference |
| references/domain-knowledge.md | 方法论 reference |
| references/cost-estimation-methodology.md | 方法论 reference |
| references/lazy-generation-methodology.md | 方法论 reference |
| references/claude-code-capabilities.md | 方法论 reference |
| references/knowledge-lifecycle-methodology.md | 知识四阶段协议 |
| references/mattpocock-skills-methodology.md | 方法论 reference |
| references/decision-governance.md | 用户决策留痕制度 |
| references/ai-process-records.md | 过程留痕口径 |
| references/agent-skills-methodology.md | 反借口/Prove-It |
| references/codex-methodology.md | 执行纪律方法论 |
| references/mea-loop-methodology.md | 长任务规划审计 |
| references/rsi-evidence-methodology.md | 方法论 reference |
| references/togaf-metamodel-methodology.md | BDAT 架构建模 |
| references/cordis-composability-methodology.md | 时空可组合设计 |
| references/frontend-design-methodology.md | 前端设计方法论 |
| references/codex-security-methodology.md | 威胁建模扫描 |
| references/mcp-governance.md | MCP 接入治理 |
| references/controlled-language-methodology.md | 方法论 reference |


---

## 推演环境适配（aipaydev 推演轮专属，与上方通用骨架并用）

### 研发资产地图
- 仓库：aipaydev（monorepo，apps/ 下五应用+test-integration）
- 四应用：csw-pay-core（支付核心：契约件/状态机+幂等/回调+证据三分支）、csw-channel-wechat（微信渠道）、csw-channel-alipay（支付宝渠道）、csw-cashier-mp（收银台小程序）
- 技术栈：Node/TypeScript/vitest/jest 兼容；构建命令见上方认知表

### 工作纪律（七条，推演轮强制）
1. **worktree 并行**：`git worktree add ../wt-<taskId> -b feat/<taskId> origin/main`——同任务多工作区并发是设计形态，禁在仓根直接改码。
2. **依赖隔离**：npm 安装一律在各应用目录内跑，禁在 monorepo 根（会破坏共享 node_modules 布局）。
3. **及时推送**：交付前 push origin；复审返工同样逐笔推。
4. **materials/ 归集**：任务过程材料放 `docs/materials/<taskId>/`。
5. **Conventional Commits**：feat/fix/docs/test 前缀+作用域。
6. **渠道本地 mock**：微信/支付宝渠道联调用本地 mock，禁外呼真实渠道。
7. **测试报告是独立交付物**：testlog 原文入仓 `docs/evidence/<taskId>-testlog.txt`（完整运行输出，禁摘要改写）。

### 结论行格式（驱动门禁只认此格式，无凭证=未完成）
- 开发：`DEV-DONE-<taskId> commit=<origin 上提交 id>` / `DEV-FAIL-<taskId> reason=<原因>`
- 测试：`TEST-PASS-<taskId> tests=<用例数>` / `TEST-FAIL-<taskId> failed=<清单>`
- 系分：`AN-DONE-<taskId> commit=<id> done=<一句话摘要>`

### 门禁的推演跑法（效率适配）
- **单回合跑全门禁**：用 `execute_code` 一次调用跑 `bash <本技能>/scripts/precheck.sh --all-full`（工作区内执行，多步流水不占多回合）——比逐工具调用快数倍且留完整输出凭证。
- **工作区定向**：在 wt-* 工作区内跑门禁时以工作区为项目根（precheck 读本技能安装副本 precheck.conf 的 PROJECT_DIR——工作区内跑时将其改为 `.`，随当前目录定位）。
- **证据召回**：查"这个结论之前验证过没有"用 `session_search`（历史会话全文检索）再下结论，禁凭记忆断言。

### 提交拦截（L2 规格先行，默认关——按需启用）
交付工作区内启用：`mkdir -p .githooks && ln -sf "$PWD/../<技能路径>/scripts/spec-first-pre-commit.sh" .githooks/pre-commit && git config core.hooksPath .githooks`，并在本技能 `scripts/precheck.conf` 设 `SPEC_REQUIRED=1`（判定库/WRITABLE_DIRS 同 conf）。关闭=删链接或恢复 hooksPath。判据与四层拦截同源（scripts/spec-first-lib.sh）；`--no-verify` 逃生门由门禁与状态机兜底，拦截落 gate-deny.jsonl 可审计。

### 里程碑上报（进度可感知）
每个九节点离开时：`bash <本技能>/scripts/trace-log.sh --milestone "<节点标准名>" --status done --note "<一句话产出>"`（详况见 references/workflow.md 全节点通用纪律）。
