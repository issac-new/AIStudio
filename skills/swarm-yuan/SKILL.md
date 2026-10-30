---
name: swarm-yuan
description: "元技能生成器：为任意代码仓库生成项目专属开发技能（六段目录：SKILL.md + workflow + references + assets + 门禁配置 + scripts）。生成流程 Step 1-13：探查（组件库清单 + 调用链 + 关系边集 + 任务配方）→ 特征卡 → 骨架 → 填充 → 门禁与 hooks → 验证审查 → 激活；目标技能按开发工作流九节点运行（需求 → 探查 → spec → plan → 编码 → 测试 → 审查 → 合入 → 发布；研发四阶段＝分支开发→分支测试→主干合并→主干回归——⑤-⑦ 在分支、⑨ 发布前主干全量回归）；项目变化由指纹感知并局部更新技能。何时用：用户说'为某项目生成开发技能'、'create a dev skill'。数字口径以 assets/facts.conf 为准。"
---

# swarm-yuan — 项目开发技能生成器

swarm-yuan 是一个生成器。对任意代码仓库跑一次生成流程，产出一个项目专属的开发技能（下称**目标技能**）。此后该项目的 AI 编码都受目标技能约束。本文件是生成器的操作手册：何时用、生成流程怎么跑、目标技能怎么用、技能怎么随项目更新。设计论证见同目录 [README.md](README.md)（唯一设计文档）；命令与术语表见 docs/usage-manual.md。

**生命周期**：生成目标技能 → 目标技能进入日常使用 → 项目演进 → 指纹感知变化 → 技能局部更新 → 继续使用。两条流程各自成文：

- **生成流程**：Step 1-13，逐步详解见 [references/generation-flow.md](references/generation-flow.md)。
- **开发工作流**：目标技能侧九节点，逐节点要素由目标技能 references/workflow.md 承载。

## 何时使用

- 用户说"为某项目生成开发技能"/"create a dev skill"，或给了仓库要为其研发技能。
- 为「关节编排」类汇报准备自动检查证据（案例映射见 references/case-studies/articulation-orchestration.md）。

**不适用**：

- 个人脚本、一次性原型——AI 裸写即可。
- typo 级小改。
- 纯人工开发——本范式为 AI 驱动。
- 只是要在某项目里做开发任务——那用该项目的目标技能，不是本生成器。

轻量替代：单文件门禁脚本或传统 lint/test 链；边界详表见 README.md 五章。

## 工作原则（生成与使用共用）

- **拼装式开发**：新功能 = 既有稳定单元拼装 + 最小新增胶水，禁止重复造轮子、侵入式重构。探查产出的组件库清单就是拼装零件的总目录。
- **先能工作再做对**：最小改动跑通 → 指标达标 → 留痕提交；测试断言行为不绑实现；新增前先减复杂度。
- **特征卡立法、门禁执法、验证器司法**：特征卡定义项目应然。门禁核验代码实然。独立验证器证明门禁有效。
- **诚实降级**：运行时未安装不阻塞，但显式披露。权限边界一律 fail-closed。
- **AI 全自动、零手动配置**：生成由 AI 一键完成。使用时用户对 AI 说话。
- **左移**：测试设计、变更影响、可观测性在 spec/plan 阶段就写入约束（spec 模板相应节），编码先测试后实现。
- **决策留痕**：决策三级分类（Mechanical 直接做 / Taste 给方案+推荐 / UserChallenge 必停问用户），用 `assets/trace-log.sh --decision` 落盘 decisions.jsonl。
- **三条铁律**：
  1. 版本锁定，不随意升级核心依赖（`--deps` 检测）。
  2. 安全遵守 OWASP Top 10 / STRIDE / CWE（`--security`，依据 references/security-spec.md）。
  3. 三平台兼容，bash 硬前置（Windows 走 Git Bash/WSL）。脚本不用 `declare -A`，`sed -i.bak` 后 `rm`，`${var}` 防多字节截断，`$(cd … && pwd)` 替代 `readlink -f`。
- **AI 判断边界**：质量类门禁中 cognition/pr_quality/consistency/link_depth 是 AI 判断引导模式；diagram 采用两层——单文件安全/可访问 SVG/远程资源/脚本策略/viewBox 等客观契约机械查（违约阻断），选型/密度/可读性等主观质量由 AI 按检查单自查并留痕 notes/。
- **回复纪律（受控语言）**：面向人的输出遵守受控语言——结论先行、一词一义、术语首现定义、短句不跳跃、情态不升降级。适用面：会话回复、进度汇报、回归报告、审查意见、提问。黑话替代表与回归轮报告格式见 [references/controlled-language-methodology.md](references/controlled-language-methodology.md)。写给机器的账本（trace.jsonl/decisions.jsonl/conf）不在此列。
- **并行优先**：相关任务能并行的一律并行，不为省事串行——独立探查/调研、互不依赖的多文件实施用子代理并行分派（按文件归属不重叠切分，禁止两个执行者写同一文件）；构建/测试/全量回归/安装等长命令起后台任务跑，主会话同时推进其他工作；并行提交走 worktree 隔离。例外仅限资源共享会破坏正确性时（单实例锁资源、共享夹具、同文件并行写）。并行只加速执行、不降低验证强度——子代理报告须主会话独立复跑核验后方可采信。

## 外部运行时整合（调用不重实现）

外部运行时按整合深度分三层，每层自带降级载体，未装不阻塞但披露：

- 深度层：GitNexus/graphify/claude-mem/ocr，门禁内真实子进程。记忆类插件经 assets/memory-backends.sh 适配层接入，绑定的是后端契约而非具体工具，可替换。
- CLI 层：OpenSpec/comet/gsd-core/codex-security/mattpocock-skills/diagram-design，按需调用。mattpocock-skills 与 diagram-design 为仓内物化运行时（runtime/mattpocock-skills/ 27 技能、runtime/diagram-design/ 45 图表类型整镜像），消费方式是读技能原文执行；物化随 install.sh 装 8 宿主恒可达，目标技能侧不随技能分发（mattpocock 走方法论层改写降级；diagram 由随技能分发的 scripts/diagram-check.sh 做结构自检）。
- 方法论层：superpowers/gstack/ECC/Ruflo/impeccable，AI 按节点引用。

清单与降级链见 references/subagent-orchestration.md。代码图谱备选选型见 references/code-graph-tools.md。mattpocock 双层关系（方法论改写 ↔ 运行时原语）见 references/mattpocock-skills-methodology.md；图表能力双层关系见 references/diagram-production-methodology.md。

## 生成流程总览（Step 1-13）

三份主干文档按步按需读取：

- 逐步详解：[references/generation-flow.md](references/generation-flow.md)
- 探查方法论：references/exploration-guide.md
- 填充规范：references/template-spec.md

| Step | 动作 | 调用 |
|------|------|------|
| 1 | 自检 | `bash scripts/self-check.sh --check-only`（运行时检测 + 文档一致性） |
| 2 | 读项目知识 | AGENTS.md/CLAUDE.md/claude-mem 提取规则；`scripts/mine-habits.sh` 行为统计初稿（AI 审读：铁律引用 / 开发偏好节 / 注意事项三去向） |
| 3 | 探查仓库 | 三路并行子代理（结构/规范/代码组织，方法论见 exploration-guide），每路启动前 `assets/trace-log.sh` 公告并落盘 |
| 4 | 形态判定 + 组件库清单 + 调用链 + 框架深化与门禁注入 | 按 exploration-guide §D 穷举（组件/接口/数据/对外契约面等维度按形态选）+ 计数核验（≥ 枚举 × 0.95）；gitnexus/graphify 图谱；`scripts/relations-extract.sh` 提取声明式映射边（XML↔接口/实体/bean 装配等字符串耦合，编译不校验）；框架深化：`scripts/framework-evidence.sh` 取证 + AI 实例化规律（每条须项目代码证据，无证据剔除并记录反例）→ `bash scripts/generate-skill.sh --inject-frameworks <skill-dir>` 门禁片段挂入 precheck 标记区块 |
| 5 | 特征卡 | 特征项写入认知缓冲（P0 强制项落具体值不用占位符；映射表见 template-spec §3） |
| 6 | 创建骨架 | `bash scripts/generate-skill.sh <name> <project-dir>`（auto/lite/standard/compliance 四档，默认 auto 按项目自适应） |
| 7 | AI 填充全部文件 | 按 template-spec 逐节填真实探查内容；recipes 任务配方五要素（提取源见 exploration-guide §D.6/§D.7）；多文件并行时按 gsd Wave 分批 + worktree 隔离（每 Wave 独立验收，前批全绿再进下批） |
| 8 | 配置 precheck.conf 与审查口径 | conf-render 已出初稿；AI 补 `# TODO:model` 语义项 + 从编排约束推导 rules.d/project.rules；审查口径 Mutation Check（变异门禁函数后重跑 fixture，变异后仍检出才证明断言有效） |
| 9 | 集成宿主 | 定制 hooks.json + commands + settings + .mcp.json；workflow.md 节点标注 |
| 10 | 编码验证 | `bash scripts/precheck.sh --all`，fail 修复重跑 |
| 11 | 独立审查 | AI 第三方视角审查 + `bash scripts/precheck.sh --review` 核验留痕 + review-record 落盘（ocr 可用用 5 维审查点，否则 AI 清单诚实降级；`--review` 是 precheck.sh 的旗标，不要对 generate-skill.sh 调用） |
| 12 | 写回记忆 | `bash assets/memory-writeback.sh`（记忆后端适配层派发：本地 / .zcode / claude-mem 等可替换后端，见 assets/memory-backends.sh） |
| 13 | 终检激活 | `--verify-completeness --strict` 确认无占位符残留 → `--mark-active`（路径验真 + 决策留痕） |

**路径约定**：账本/状态/记忆四脚本生成器侧在 assets/、目标技能侧在 scripts/。

**铁律**：draft 骨架不可交付。状态门三关（占位符清零、清单路径零幻觉、计数核验达标）全过才激活。每步公告 `→ [Step N] 调用 …` 并落盘 trace.jsonl。门禁误报调 conf 重跑，不绕过。编排约束每条须有代码证据。任务路由避免全任务全量（references/task-methodology-router.md）。

## 目标技能使用（开发工作流九节点）

需求理解 → 探查 → spec → plan → 编码 → 测试 → 独立审查 → 合入 → 发布。**研发过程四阶段顺序＝分支开发（⑤编码，feature 分支自 origin/main 起，禁主干直开发）→ 分支测试（⑥测试+⑦审查，均在分支完成、全绿才合入）→ 主干合并（⑧）→ 主干回归（⑨发布前在 main 复跑全量回归，全绿才构建发布）**。六阶段状态机逐段守卫前序产出物：design 需 proposal、build 需批准的 spec、verify 需 tasks 全勾、archive 需 verify pass 与证据。

守卫实物：

- spec-first 四层拦截"无 spec 写源码"，判据单一事实源 spec-first-lib.sh：
  - L1 写时：宿主 hooks 经 spec-first-bridge 统一判据后阻断（exit 2）。已实测：Claude Code（deny JSON）/ Codex（exit 2）/ ZCode（插件嵌套 hooks）三家。已生成配置、尚未实测：Cursor / Gemini / OpenCode / Kimi-Code / Windsurf（Devin CLI）五家。
  - L2 提交时：git pre-commit（core.hooksPath，宿主无关）。
  - L3 门禁时：check_spec_first，入核心序列。
  - L4 流程准入：状态机 build 阶段。

  强制面以 L2-L4 为准，能力状态三态明示。
- rules.d 三值规则（allow/prompt/forbid 取最严，forbid 必带替代方案）在每次 Bash/Edit 实时匹配。
- 门禁按序列执行，分核心/架构/合规/advisory 四族（执行序列与口径数字见 facts.conf）。拦截落 gate-deny.jsonl 可复盘。

## 反馈回路（技能随项目生长）

SessionStart hook（lite 档由 AI 主动）跑 `scripts/project-fingerprint.sh <proj> --diff` 得变化范围。按 exploration-guide §D 局部重探查，清单单条更新。条目骤降超 50% 拒写保留旧版。过期条目三态处置见 references/knowledge-lifecycle-methodology.md §五。之后 `generate-skill.sh --upgrade`（项目内容文件保留），落新基线。结构变化走指纹 --diff，**内容演化走 git diff/--stable-diff**——指纹只看结构。

## 用户使用

**首次部署（一次）**：`bash install.sh`（自动检测 Agents 通用 ~/.agents/skills/Claude Code/Codex/Cursor/Windsurf/OpenCode/Gemini/Kimi/ZCode，`--list` 查看；未检测到宿主默认装 `~/.agents/skills/`，显式 `--agents` 可强制）→ 对 AI 说"为 /path/to/project 生成开发技能"（默认落项目内 `.agents/skills/`；项目内已有其他 skills 目录则复用）→ 终检后激活。

**之后每个需求**（AI 与用户协作，门禁全程把关）：

```
用户："开始新需求：给订单列表加导出按钮"
  ① 需求理解  AI 复述需求 + 列影响面，用户确认或纠正
  ② 探查      先查 recipes 配方与 §A 同类功能，再按 reference-manual 组件库清单定位既有组件
              （"谁依赖 X"用 relations-query.sh 查 relations.jsonl 边集反查）
  ③ spec      AI 写 spec（决策记录 + 影响范围 + 测试设计 + 设计文档影响声明——DESIGN_SYNC_REQUIRED=1 时 touched/none）→ 用户评审批准
  ④ plan      AI 拆 tasks（.swarm-yuan/tasks.md）
  ⑤ 编码      分支开发：feature 分支（自 origin/main 起）上先查再写：七层下探找可复用件，都落空才新增
              【无 spec 写源码】四层拦截：有 hook 宿主写时拒；其余提交时/门禁时拦；【违反 forbid 规则】hook deny + 替代方案
  ⑥ 测试      分支测试：门禁序列在分支上执行，全绿进下一步（主干不做"合后再测"）
  ⑦ 独立审查  review 门禁 + review-record 落盘；核设计文档影响声明合理性（none 声明）；发现问题回 ⑤
  ⑧ 合入      主干合并：前序分支测试全绿；状态机核验 verify pass + 证据引用；设计文档随批（touched 兑现，L2 核验）；
              合入序列=fetch → 本地 main ff-only 快进 → worktree rebase → merge --no-ff → push（防本地 main 滞后远端）
  ⑨ 发布      主干回归（main 上复跑全量回归，全绿才构建；失败回退 merge 或分支重入 ⑤）+ 构建 + 发布门禁
任一步被拦：提示给出原因与解除路径（补 spec / 调 conf / 留痕豁免），修复后重跑该步。
```

**入口对照**：

- "生成技能" = 生成流程。
- "开始新需求" = 开发工作流。
- "项目变了/升级技能" = 反馈回路。
- "跑门禁/报误报" = 调 conf 消误报 + 决策留痕。

## 参考文档路由

全部参考文档带"何时读我"路由头，按下表按需读取。逐档来源/证据/消费节点登记见 references/capability-map.md（self-check 双向校验未登记文档）：

| 族 | 文档 |
|----|------|
| 生成主干（Step 1-13 消费） | exploration-guide、generation-flow、template-spec、agent-skills-methodology、context-engineering-layering、task-methodology-router、cost-estimation-methodology、domain-knowledge、code-graph-tools、togaf-metamodel-methodology、frontend-design-methodology、diagram-production-methodology |
| 拼装与知识消费（探查与编码节点） | clean-code-metrics-methodology、lazy-generation-methodology、cordis-composability-methodology、knowledge-lifecycle-methodology、mattpocock-skills-methodology、memory-persistence、cognition-framework、cognitive-bias、logic-razor、four-theories-methodology、mea-loop-methodology |
| 编排与治理（全程纪律） | governance-agents、subagent-orchestration、gsd-patterns、decision-governance、dsh-engineering-methodology、codex-methodology、claude-code-capabilities、mcp-governance、codex-security-methodology、controlled-language-methodology（人面输出纪律） |
| 验证与过程资产 | review-methodology、canary-monitoring、ai-process-records、quality-management-standards、rsi-evidence-methodology、bugfix-runbook（fix 任务连研发环境排障六步流水线）、remote-debug-jvm（JDWP 经堡垒机隧道远程调试） |
| 安全合规与行业 | security-spec、crypto-spec、cwe-database、security-certification-profiles、standards-compliance、compliance-checkpoints（监管执法检查点库：五步判断法/罚则库/智能体安全/采购 AI/机检映射）、regulatory-checkpoint-table（执法检查主表 173 条）、行业 profile 八档（`--industry` 加载：finance/gov/medical/telecom/automotive/energy/industrial/payment） |
| 业务与领域本体 | business-ontology-methodology（业务本体工程方法论：五步流程、术语纪律、七个语义模式、十四项校验）、fibo-financial-ontology（FIBO `master_2026Q3` 源码级术语与 IRI 参考） |

frameworks/ 规则库随 ACTIVE_FRAMEWORKS 注入，不按名路由。runtime/mattpocock-skills/ 物化层同理不按名路由——上游 ask-matt 是全族路由器（idea→ship 主流程图），需要任一 mattpocock 技能时先读其 SKILL.md 原文再执行（MANIFEST 登记来源与刷新方法）。runtime/diagram-design/ 同样按需读原文：先读 SKILL.md，再读所选 `references/type-*.md`，不按类型名建索引跳读。

## 文档与档案边界

- 设计论证：README.md（唯一设计文档，回答为什么这样设计、凭什么有效）。
- 数字口径：assets/facts.conf（单一事实源。文档不手抄计数，self-check 机器对账）。
- 决策史与上游基线：仓库 docs/design-evolution.md、docs/upstream-baseline.md（仓库档案，不随技能分发）。
