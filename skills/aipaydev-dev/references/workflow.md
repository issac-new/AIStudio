# workflow.md — 九节点全流程（4 要素/节点：入口/参与方/门禁/产出物与调用追踪；⑨调用追踪/⑩方法论引用逐节点机器校验）

> 填充规范：九节点全流程，每节点 4 要素（入口/参与方/门禁/产出物与调用追踪）+ ⑨调用追踪/⑩方法论引用机器校验要素（verify-completeness 逐节点断言），4-Phase SOP。
> 节点的标准结构定义在生成器仓 references/template-spec.md §2（该文件不随技能分发）；⑥测试验证与⑦独立审查是两个独立节点（审查记录落 review-record）；整个流程可按项目实际裁剪。

## 流程总览

（流程图，标注：①→②→③ 串行节点；并行节点用 └──┘ 标注）

> **编号体系消歧**：本 workflow 的 ①-⑨ 是**开发工作流节点**；生成器侧 SKILL.md 的 Step 1-13 是**生成流程步骤**——两套编号独立，不同义。
> **state-machine 六阶段 ↔ 九节点对照**（粗粒度状态桶 ↔ 细粒度执行流，`scripts/state-machine.sh` 按阶段守产出物）：
> open=①需求理解+②探查 ｜ design=③设计 spec+④实施 plan ｜ build=⑤编码实现 ｜ verify=⑥测试验证+⑦独立审查 ｜ archive=⑧合入 main ｜ operate=⑨构建发布

> **回复纪律（全节点通用）**：向用户汇报的每一段话遵守受控语言——结论先行、一词一义、术语首现定义、短句不跳跃、情态不升降级；黑话替代表与报告格式见 `references/controlled-language-methodology.md`。机器账本（trace.jsonl/decisions.jsonl）不受此约束。

> **里程碑上报（全节点通用，进度可感知）**：长耗时开发中驾驶舱按里程碑读进度。每个节点**离开时**执行一次 `bash scripts/trace-log.sh --milestone "<节点名>" --status done --note "<一句话产出>"`（落 `.swarm-yuan/milestones.jsonl`）；节点内关键中间产物（如首个可运行骨架、测试全绿）可加报中间里程碑。里程碑名用九节点标准名（需求理解/探查/设计 spec/实施 plan/编码实现/测试验证/独立审查/合入 main/构建发布），禁自造别名——驾驶舱按标准名词表聚合。

---

## 节点①：需求理解

**① 流程入口（顺序/并行）：** （本节点在流程中的位置：前序节点、后续节点、可并行项）

**② 参与方：** （谁参与，谁是决策方，谁执行）

**③ 前序依赖检查（准入）：**
- （进入本节点前必须满足的条件）
- 信息不足时的处理（提问澄清，不臆测）

**④ 质量门禁：**
- （离开本节点前必须满足的条件，可被 precheck.sh 验证）



**⑥ 产出物与调用追踪：**
- 持久化：（落盘到哪个路径）
- 临时上下文：（仅对话/草稿的产物）





**⑩ 方法论引用：** `references/decision-governance.md`（用户确认五要素留痕）+ `references/agent-skills-methodology.md`（反借口/假设前置）+ `references/ai-process-records.md`（过程留痕口径）

**调用追踪：**
- 公告：进入本节点时 AI 输出一行结构化提示，格式 `→ [节点① 需求理解] 调用 <技能/子代理/工具> · <目的>`
- 落盘：节点级默认——进入/完成本节点时执行 `bash scripts/trace-log.sh --node "需求理解" --actor "<技能/子代理>" --tool "<工具/命令>"`，追加到 `.swarm-yuan/trace.jsonl`

---

## 节点②：探查（设计 spec 前的仓库探查）

**① 流程入口（顺序/并行）：** 前序=节点①；可三路并行（结构/规范/代码组织子代理）

**② 参与方：** controller + 三路子代理（结构/规范/代码组织）

**③ 前序依赖检查（准入）：**
- 节点①需求理解已完成
- 项目路径可访问

**④ 质量门禁：**
- 探查覆盖度（组件库清单全量穷举，非代表性样本）
- 改实体字段/数据模型时：影响面反查须走边集三查（v2.14.3 补）——`bash scripts/relations-query.sh <skill> <proj> --field <字段名>`/`--entity <类名>`（field-mapping/data-mapping 边反查声明式映射引用，grep 源码查不全 XML/SQL 字符串耦合）+ §8 字段级映射清单 + §5 调度任务表（改实体字段必查批处理 job）；边集缺失先跑 `scripts/relations-extract.sh` 重建



**⑥ 产出物与调用追踪：**
- 持久化：特征卡写入 SKILL.md；组件库清单写入 codebase.md
- 临时上下文：探查中间产物





**⑩ 方法论引用：** `references/knowledge-lifecycle-methodology.md`（读法六步：摘要优先/追链/分组注入）+ `references/code-graph-tools.md`（图谱优先）

**调用追踪：**
- 公告：每路子代理启动/完成时输出 `→ [节点② 探查] 调用 结构子代理 · gitnexus context（started/done）`
- 落盘：每路子代理启动前执行 `bash scripts/trace-log.sh --node "探查" --actor "结构子代理" --tool "gitnexus context" --status started`，完成后 `--status done`（规范/代码组织子代理同理）

---

## 节点③：设计 spec

**① 流程入口（顺序/并行）：** 前序=节点②

**② 参与方：** AI + 用户（spec 评审）

**③ 前序依赖检查（准入）：** 节点②探查完成（特征卡+组件库清单就绪；架构设计/演进类变更还须四层架构枚举——探查侧 §D.0.6，生成器侧 exploration-guide）

**④ 质量门禁：** ★测试左移（spec §19 测试设计）+ ★运维左移（spec §21 可观测性约束）+ SPEC_REQUIRED 前置门（fail-gate-hook 拦无 spec 写码）+ 架构类变更须填 spec §24 架构映射（TOGAF BDAT 四层+纵向链验证，非架构变更可豁免）+ 规模与工作量估算（spec §25 功能点法，feature 档推荐选填、无门禁执法——识别规则与因子表查 references/cost-estimation-methodology.md）



**⑥ 产出物与调用追踪：** 持久化：references/spec.md（feature 档推荐含 §25 估算：五类组件计数 → 调整后功能点 → 工作量人月）





**⑩ 方法论引用：** `references/cost-estimation-methodology.md`（§25 功能点估算）+ `references/cognitive-bias.md`（§16 偏差自检）+ `references/togaf-metamodel-methodology.md`（架构类 §24 BDAT）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "设计 spec" --actor "<技能>" --tool "<工具>"`

---

## 节点④：实施 plan

**① 流程入口（顺序/并行）：** 前序=节点③

**③ 前序依赖检查（准入）：** spec 通过评审

**④ 质量门禁：** ★变更左移（plan §20 变更影响范围：消费方反查/回滚预案/灰度策略/迁移兼容窗口）

**⑥ 产出物与调用追踪：** 持久化：references/plan.md（OpenSpec tasks checkbox 格式）

**⑩ 方法论引用：** `references/mea-loop-methodology.md`（长任务拆解/审计证据）+ `references/knowledge-lifecycle-methodology.md`（回归范围分级）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "实施 plan" --actor "<技能>" --tool "<工具>"`

---

## 节点⑤：编码实现

**① 流程入口（顺序/并行）：** 前序=节点④；复杂变更（>3 文件/跨模块）用 Dynamic Workflows 并行扇出；写码前按 `references/lazy-generation-methodology.md` 七层阶梯先查再写（层 2 查 recipes/reference-manual，层 7 才新增）

**④ 质量门禁：** ★测试左移（每个 task 先写/更新测试再实现，TDD/BDD；precheck \`--shift-left\` 校验 test 与 impl 同分支提交）

**⑥ 产出物与调用追踪：** 代码提交 + 测试提交

**⑩ 方法论引用：** `references/lazy-generation-methodology.md`（七层下探先查再写）+ `references/subagent-orchestration.md`（复杂变更扇出）

**⑨ 调用追踪：** 子代理派发时 `bash scripts/trace-log.sh --node "编码实现" --actor "implementer" --tool "<task>" --status started`

---

## 节点⑥：测试验证

**① 流程入口（顺序/并行）：** 前序=节点⑤

**④ 质量门禁：** gstack/OCR 5 审查维度 + AUTO-FIX/ASK；★运维左移（验证 metrics/日志/trace 已埋点）；独立跑单元/集成测试 + `check_test` 门禁（0 用例检测 / 断言密度 / Mutation Check 测试有效性）。

**★质量门禁序列（参考 quality:full 十步模式，fail-fast 串行——任一步 fail 即停不跑后续；项目按形态裁剪，门禁映射到 precheck 既有 flag，不新增 check_*）**：`--build` 构建过 → `check_test` 测试过（0 用例检出/断言密度）→ `--contract` 契约 → `--reuse` 复用合规（新增单元不与稳定单元重名）→ `--consistency` 业务/数据勾稽 → `--layer`/`--link-depth` 架构边界 → `--docs-pack` 文档齐备 → `--security` 安全 → `--deps` 版本锁定。串行顺序有讲究：构建/测试先行（跑不了代码谈什么都白搭），契约/一致性次之（逻辑对但破坏契约也不行），架构/文档/安全/版本殿后。执行入口：`bash scripts/precheck.sh --all-full`（标准 28 门禁已含上述全部）或按需单跑。

**⑥ 产出物与调用追踪：** 测试报告 + 测试有效性证据（mutation score）+ 门禁序列各步 pass/fail 留痕（gate-runs.jsonl）

**⑩ 方法论引用：** `references/review-methodology.md`（5 维审查/测试有效性）+ `references/gsd-patterns.md`（goal-backward 对抗验证）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "测试验证" --actor "tester" --tool "<测试命令>"`

---

## 节点⑦：独立审查

**① 流程入口（顺序/并行）：** 前序=节点⑥

**④ 质量门禁：** 独立 code review（第三方 reviewer 视角，非 Step 7 自检）+ `check_review` 门禁（核验 `references/review-record.md` 留痕非空：5 维审查点 + findings 表）。审查范围含质量门禁序列运行证据——确认节点⑥的序列真实跑过而非声称跑过（gate-runs.jsonl 有当次 run 记录，"配置≠使用≠有效"）。

**⑥ 产出物与调用追踪：** `references/review-record.md` 审查证据产物（从 review-record-template.md 填充）

**⑩ 方法论引用：** `references/review-methodology.md`（rubric/P0-P3）+ `references/agent-skills-methodology.md`（Prove-It 自证）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "独立审查" --actor "reviewer" --tool "review-record"`

---

## 节点⑧：合入 main

**① 流程入口（顺序/并行）：** 前序=节点⑦

**④ 质量门禁：** ★变更左移（回滚预案存在 + 数据库变更兼容：向前兼容/双写期）

**⑥ 产出物与调用追踪：** merge commit

**⑩ 方法论引用：** `references/decision-governance.md`（合入确认决策留痕）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "合入 main" --actor "<技能>" --tool "git merge"`

---

## 节点⑨：构建发布

**① 流程入口（顺序/并行）：** 前序=节点⑧（合入 main 后方可发布）

**④ 质量门禁：** ★运维左移（灰度/金丝雀策略 + 监控告警阈值 + 运维 runbook）

**⑥ 产出物与调用追踪：** 发布产物 + release notes——发布规则/构建命令/产物位置填入并消费 \`references/release.md\`（六段式正式成员，本节点消费方）

**⑩ 方法论引用：** `references/canary-monitoring.md`（发布后基线对比）+ `references/ai-process-records.md`（过程信息项）

**⑨ 调用追踪：** `bash scripts/trace-log.sh --node "构建发布" --actor "<技能>" --tool "<构建命令>"`

---

## 终检：流程完成检查表（⑨）

（全流程完成前的 checkbox 清单，汇总所有节点的门禁）
- [ ] 节点①需求理解：特征卡 17 项齐备
- [ ] 节点②探查：组件库清单全量 + 调用链
- [ ] 节点③设计 spec：§19 测试设计 + §21 可观测性
- [ ] 节点④实施 plan：§20 变更影响范围
- [ ] 节点⑤编码实现：测试与实现同分支提交
- [ ] 节点⑥测试验证：check_test 门禁通过（5 维度审查属节点⑦）
- [ ] 节点⑦独立审查：review-record.md 留痕 + check_review 门禁
- [ ] 节点⑧合入 main：回滚预案 + 迁移兼容
- [ ] 节点⑨构建发布：灰度 + 告警 + runbook
- [ ] 里程碑上报：九节点各离场一次 milestones.jsonl（缺项=进度不可感知，回补）
