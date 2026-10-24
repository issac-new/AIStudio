> **何时读我**：任务命中本文档主题时按需读取（路由表见 SKILL.md）。首行：# 六段式模板填充规范 (Six-Section Template Spec)

# 六段式模板填充规范 (Six-Section Template Spec)

目标技能必须包含六段，覆盖材料模板的全部要素。每段的内容要求与填充规则如下。**生成后用本文件逐项核对，确保无遗漏。**

> **口径权威源**：`../assets/facts.conf`（catchphrase 数字单一事实源，self-check 机器执法）。

---

## 1. meta 段（SKILL.md）

**文件：** `<target-skill>/SKILL.md`

**结构：**
```markdown
---
name: <target-skill-name>
description: <项目名> 的需求交付全流程技能。当用户...都应使用本技能。涵盖...全流程。
---

# <skill-name> — <项目名> 需求交付全流程技能

## 核心理念
（项目最核心的铁律，来自 AGENTS.md/CONTRIBUTING/记忆，不超过 7 条）

## 改造分类（决定你怎么写代码）
（项目特有的改动分类表，如 A类/B类、core/plugin、src/lib）

## 全流程总览（N 节点）
（节点流程图 + 一句话说明每节点；标注流程入口顺序与并行关系）

## 六段式结构导航
（段 → 文件 → 用途 的映射表）

## 快速入口（按任务类型）
（任务类型 → 起始节点 → 关键参考 的表）

> **任务类型维度**：7 类任务（feature/fix/refactor/chore/docs/test/exp）各有门禁集与豁免，
> 映射单一事实源：`assets/task-type-gates.conf`（bash 可 source）。AI 在 `/spec` 命令时：
> ①从分支名或用户意图判任务类型 → ②取 `TASK_TYPE_<type>` 门禁集 → ③按 spec 规模判档位
> （detect-spec-scale.sh）→ ④两者取并集（更重档，质量优先）。
>
> | 任务类型 | 起始节点 | 门禁集（基础） | 豁免 |
> |---------|---------|--------------|------|
> | feature | spec §1 | `--all-full`（标准）/ `+--shift-left`（完整） | 无 |
> | fix | spec §1（简化） | `--all` + `--reuse` | §14-§18 认知段可免 |
> | refactor | spec §1 | `--all-full --reuse --stable-diff` | §14-§18 可免 |
> | chore | plan 直接 | `--all` | spec 全段可免 |
> | docs | plan 直接 | `--docs-pack` | 其他门禁免 |
> | test | spec §19 | `--all --shift-left` | §14-§18 可免；§19 必填 |
> | exp | spec §1（标注实验） | `--all` | 合入前须转 feature/fix |

## 常用命令速查
（真实命令 + 端口约定）

## 质量门禁
（核心门禁清单，对应 check 段；含自动/AI 审边界一句：strict 档信号可信自动执行，
warn/advisory 输出由 AI 判断采纳不必全修；GATE_AI_JUDGMENT=1 时 advisory 档 5 个质量门禁
转 AI 自觉判断，见 scripts/precheck.conf）

## 常见借口与纠正
（Rationalizations 两列表：第一人称借口 + 量化反驳，5-8 条，从门禁步骤逐条反推——见 §1.5）

## 假设清单（开工前）
（写 spec 前显式列假设：需求/架构/范围三维度 + "现在纠正我，否则我按这些假设继续"——见 §1.5）

## 状态保存与恢复
（流程状态载体说明）

## 自成长（项目变了，本技能跟着变）
（骨架已内置固定指引段，填充时保留并按项目实际调整命令路径：①感知 `project-fingerprint.sh --diff`
②变化判断 ③更新链=生成器 --upgrade 刷工具链 + AI 按「变化目录 scope」局部重探查更新
reference-manual.md 清单（未变 scope 条目不重写）+ inventory-verify 核验 ④落新基线。
红线：语义变化发现即更新不等 refresh；清单先完整生成再原子替换，探查失败保留 last-good）

## 完成检查表
（任务完成前的 checkbox 清单）
```

**填充规则：**
- `description` 必须包含项目特有关键词（模块名、命令名、技术栈），写得"pushy"以提高触发率
- 核心理念只放最高优先级的铁律，不超过 7 条
- 改造分类必须反映项目实际（探查得出），不要套用通用模板
- 全流程总览的流程图要标注**入口顺序**（谁先做、谁后做、谁并行）——对应材料 workflow 要素 1
- 常用命令必须真实可执行
- **自成长段不删**：骨架自带的「自成长」段是固定操作指引（非占位符），填充时保留——它是组件库清单交付后防腐的唯一感知链
- **引用规则而非写死**：来自项目规则文件的约束，写"见 AGENTS.md / 项目记忆"，不重复具体值

### 1.1 Must-Always / Must-Never 规则（ECC v2.0.0, RULES.md）

ECC 的 RULES.md 将铁律分为两类——swarm-yuan 的 SKILL.md 核心理念可参考此格式：

**Must-Always（必须总是做）：**
- 委派任务给 subagent（不直接编码）
- TDD：先写测试后写代码
- 验证：实现后须验证（不只是"以为修了"）
- 不可变性：不修改已有文件除非必要
- 无 secret：代码中无硬编码密钥
- 无未测试变更：所有变更须有测试覆盖
- 无静默重复：不重复创建已有文件（须检测并复用）

**Must-Never（必须绝不做）：**
- 绝不替用户做决定（须用户确认）
- 绝无大小例外（不因为"小改动"而跳过流程）
- 绝不因历史偏好而忽略当前确认
- 绝不因未反对而视为同意
- 绝不因未验证而视为通过

**在目标技能中的落地：**
- SKILL.md 的核心理念可引用此格式（Must-Always / Must-Never 两列表）
- 不超过 7 条（合并相关项）

### 1.2 `origin` 溯源字段（ECC v2.0.0, agent.yaml）

ECC 的 agent.yaml 用 `origin: ECC|community` 标注 agent 的来源：

| 值 | 含义 |
|----|------|
| `ECC` | 官方 ECC 提供的 agent |
| `community` | 社区贡献的 agent |

**在目标技能中的落地：**
- 生成的目标技能的 frontmatter 可增加 `origin: swarm-yuan` 字段，标注来源
- 若项目有多个 skill 来源（swarm-yuan 生成 + 手写），用 `origin` 区分

### 1.3 Manifest-Driven Packaging（ECC v2.0.0, manifests/）

ECC 的安装系统用**三层模型**管理组件：

| 层 | 文件 | 内容 |
|----|------|------|
| **Profile** | `install-profiles.json` | 安装配置（minimal/core/developer/security/opencode） |
| **Module** | `install-modules.json` | 模块定义（targets/cost/stability/defaultInstall/dependencies） |
| **Component** | `install-components.json` | 组件定义（files/hooks/commands） |

**Plan/Apply 分离：**
- `install-plan.js`：生成安装计划（预览，不 mutate）
- `install-apply.js`：应用安装计划（mutate）

**Parity tests**：
- `tests/ci/agent-yaml-surface.test.js`：强制 `agent.yaml` 的 `commands:` 与真实 `commands/` 目录完全匹配
- 防止 surface drift（文档与实际不一致）

**在目标技能中的落地：**
- 若目标技能需要按 profile 安装（如 minimal vs full），可参考 ECC 的 profile/module/component 三层模型
- 生成的目标技能可附带 `manifests/install-profiles.json`，定义安装配置
- 用 plan/apply 分离模式：先预览后应用

### 1.4 Export Surface vs Authoritative Source（ECC v2.0.0, agent.yaml）

ECC 的 `agent.yaml` 是**导出 surface**（portability layer），不是**authoritative source**：

- `agent.yaml` 的 `commands:` 列表是导出的便携格式
- 真正的 authoritative source 是 `commands/` 目录下的 `.md` 文件
- 修改 `agent.yaml` 不会修改 `commands/` 目录

**在目标技能中的落地：**
- 若目标技能需要导出为便携格式（如 `agent.yaml`），须明确标注"导出 surface，非 authoritative source"
- 修改导出文件不会修改源文件

### 1.5 反借口表与假设前置（Addy Osmani agent-skills 吸收）

> 来源与一手素材：`references/agent-skills-methodology.md`（22/24 技能携带反借口表、153 条条目实测）。

**在目标技能中的落地（SKILL.md meta 段新增两个标准节）：**

**① 常见借口与纠正（Rationalizations）**——两列表格，第一人称借口引语 + 量化反驳，置于「质量门禁」与「完成检查表」之间。**生成配方：逐条配对**——对该技能每个门禁/precheck 步骤问"agent 会想什么借口跳过它"，每个值得跳过的步骤配一条反驳（不是自由发挥）。选 5-8 条，从下表按类型选用后项目特化：

| 类型 | 条目示例（完整素材见 agent-skills-methodology §2.2） |
|------|-----------------------------------------------------|
| 跳过验证 | "I tested it manually" → Manual testing doesn't persist. Tomorrow's change might break it with no way to know. |
| 推迟工作 | "I'll write the spec after I code it" → That's documentation, not specification. |
| 表演性勤奋 | "Let me run the tests again just to be extra sure" → Repeating the same command adds nothing unless the code has changed since.（反证据注水，与 verify_evidence 铁律共振） |
| LLM 特有 | "It's just LLM output, it's only text" → Treat it like any untrusted input. |

**② 假设清单（开工前）**——写 spec 前显式列出全部假设（**假设是最危险的需求误解形式，因为它无声**），三维度固定 + 结尾箭头句是固定交互协议：

```text
我正在做的假设：
1. （需求假设，如：这是 Web 应用而非原生移动端）
2. （架构假设，如：认证用 session 而非 JWT）
3. （范围假设，如：只支持现代浏览器）
→ 现在纠正我，否则我按这些假设继续。
```

**文档冲突声明（以代码为准）**——参考了设计文档/需求文档时，若文档与代码不一致（架构/外部交互/数据模型/接口契约），必须在此显式声明冲突：

```text
文档与代码冲突声明：
- 文档 <X>（§3）说：架构为 A；代码实现为 B（file:line）→ 以代码为准，文档待更新
- 需求文档 <Y> 要求 C，当前实现为 D（file:line）→ 需求未落地/已演进，以代码为准
→ 冲突未消除前，按代码行为继续；文档更新走单独任务。
```

**description 补充纪律**：第三人称动词开头 + 2-4 个"Use when"触发短句；**description 禁含流程步骤**（agent 会照摘要跳过正文——上游一手踩坑教训）；完成检查表每项须可举证（能挂 gate-run#N / 测试输出 / 截图）。

---

## 2. workflow 段（references/workflow.md）— 9 节点 × 4 要素（详写 11 字段）

**文件：** `<target-skill>/references/workflow.md`

**结构：** 节点化流程。**顶部**先画流程图（标注入口顺序与并行关系），然后每个节点含 **4 核心要素**（入口/参与方/门禁/产出物与调用追踪——generate-skill 骨架与 SKILL.md 同口径；简化决策：⑤-⑧ 并入产出物说明，80 槽→32 槽）。下为展开写法（11 字段；节点总数恒为 9——11 是字段数，勿读作节点数；⑨⑩ 为机器校验要素），详写可按项目裁剪回 4 要素：

```markdown
## 流程总览

（流程图，标注：①→②→③ 串行节点；并行节点用 └──┘ 标注）

---

## 节点①：需求理解

**① 流程入口（顺序/并行）：** （本节点在流程中的位置：前序节点、后续节点、可并行项）

**② 参与方：** （谁参与，谁是决策方，谁执行）

**③ 前序依赖检查（准入）：**
- （进入本节点前必须满足的条件）
- 信息不足时的处理（提问澄清，不臆测）

**④ 质量门禁：**
- （离开本节点前必须满足的条件，可被 precheck.sh 验证）

**⑤ 分支处理：**
- 成功：（对分支的处理）
- 失败/错误：（如何回退、重试）
- 信息不足：（暂停澄清还是降级处理）

**⑥ 产出物归档：**
- 持久化：（落盘到哪个路径）
- 临时上下文：（仅对话/草稿的产物）

**⑦ 流程控制：** （可否暂停/恢复/重启；恢复方式）

**⑧ 状态控制：** （状态保存在哪，如何恢复）

**⑨ 调用追踪（全链路提示，无需用户确认）：**
- 公告：进入本节点时 AI 输出一行结构化提示，格式 `→ [节点X <节点名>] 调用 <技能/子代理/工具> · <目的>`
- 落盘：节点级默认——进入/完成本节点时执行 `bash scripts/trace-log.sh --node <节点> --actor <技能/子代理> --tool <工具/命令>`，追加到 `.swarm-yuan/trace.jsonl`；调用级细节（每次具体调用）仅在 `SWARM_YUAN_TRACE=verbose` 时落盘

**⑩ 方法论引用（机器校验）：**
- 本节点消费的 references 档（互为反查 task-methodology-router 路由表消费节点序，可裁剪增删）

（其他节点同结构）

---

## ⑪ 流程完成检查表
（全流程完成前的 checkbox 清单，汇总所有节点的门禁）
```

**标准节点（权威 9 节点命名表，对齐 facts.conf FACT_FLOW_NODES=9；可按项目裁剪）：**

| 节点 | 名称 | 左移要求 |
|------|------|----------|
| ① | 需求理解 | — |
| ② | 设计 spec | ★测试左移（§19）+ ★运维左移（§21） |
| ③ | 实施 plan | ★变更左移（§20） |
| ④ | 分支准备 | — |
| ⑤ | 编码实现 | ★测试左移（TDD/BDD，test 与 impl 同分支提交） |
| ⑥ | 测试验证 | ★运维左移（metrics/日志/trace 埋点验证）+ check_test 第二层（覆盖率/断言/负向/可选变异）+ --api 接口测试覆盖 + **质量门禁序列**（fail-fast 串行：build→test→api→contract→reuse→consistency→layer/link-depth→docs-pack→security→deps，映射 precheck 既有 flag 不新增门禁） |
| ⑦ | 独立审查 | check_review 门禁（review-record 留痕核验，独立 code review 非自检） |
| ⑧ | 合入 main | ★变更左移（回滚预案 + 迁移兼容） |
| ⑨ | 构建发布 | ★运维左移（灰度 + 告警 + runbook） |

> 第 10 项"发布后运营"是可选运行态验证（`--operate`，advisory），非 9 节点之一。
> generate-skill.sh 的 workflow.md emit 按 9 节点骨架生成。

**详细节点说明：**
1. 需求理解（模糊需求走结构化访谈协议：设计树+前沿轮次+事实自查决策问人，见 `mattpocock-skills-methodology.md` §一）
2. 设计 spec（采用 OpenSpec proposal 模式：proposal.md + delta spec + design.md + tasks.md）—— **★测试左移**：spec 须含"测试设计"段（测试策略/用例骨架/边界值/回归范围——分级推导协议见下方左移要求；测试缝先行：优先既有缝/用最高缝/缝越少越好，见 `mattpocock-skills-methodology.md` §二）；**★运维左移**：spec 须含"可观测性约束"段（日志结构/metrics 埋点/trace 透传/告警阈值/健康检查）；spec 正文不写文件路径与代码片段（防腐），原型决策片段除外
3. 实施 plan（采用 OpenSpec tasks checkbox 格式 + superpowers writing-plans bite-sized 步骤；任务拆分走纵切纪律：每票纵切全层可独立验证+声明阻塞边+宽改造 expand-contract 例外，见 `mattpocock-skills-methodology.md` §三）—— **★变更左移**：plan 须含"变更影响范围"段（消费方反查/回滚预案/灰度策略/数据库迁移兼容窗口）
4. 分支准备
5. 编码实现（采用 superpowers subagent-driven：orchestrator + 每任务新 subagent + 两阶段审查；**复杂变更（>3 文件/跨模块）用 Dynamic Workflows 并行扇出 + 交叉验证**；互不依赖的文件可并行实施——子代理按文件归属切分，禁止两个执行者写同一文件）—— **★测试左移**：每个 task 须先写/更新测试再实现（TDD/BDD），precheck `--shift-left` 核验本次变更集同时含 test 与 impl 文件（跨栈测试命名均识别；严格时序靠任务纪律）
6. 测试验证（含 gstack/OCR 5 审查维度 + AUTO-FIX/ASK + 可选 `claude ultrareview` 云端多 agent 审查；长测试/全量回归起后台任务跑，主会话同时推进其他工作）—— **★运维左移**：验证阶段须确认 metrics/日志/trace 已埋点且可通过健康检查端点访问；独立跑单元/接口/集成测试：`check_test` 第二层核验覆盖率阈值（COVERAGE_MIN）、零断言/断言密度、负向用例与聚焦测试，配置 `MUTATION_CMD` 时追加变异分数；`--api` 核验端点×测试映射与状态码断言。**★质量门禁序列（quality:full 十步模式）**：多门禁按序执行、fail-fast（任一步 fail 即停不跑后续）、每步耗时留痕；序列=build→check_test（--test）→api→contract→reuse→consistency→layer/link-depth→docs-pack→security→deps，全部映射 precheck 既有 flag，不新增 check_*；执行入口 `--all-full`（标准 29 已含全部）或按需单跑。生成骨架 emit 该序列指引（workflow.md 节点⑥）。
7. 独立审查 —— **独立 code review（非自检）**：以第三方 reviewer 视角找 Step 7 填充后仍残留的逻辑错误/占位符遗漏/门禁误配/清单错漏等低级错误；`check_review` 门禁核验 `references/review-record.md` 留痕非空（5 维审查点 + findings 表），缺则 fail；**审查范围含质量门禁序列运行证据**（确认节点⑥序列真实跑过——gate-runs.jsonl 有当次 run 记录）
8. 合入 main —— **★变更左移**：合入前须确认回滚预案存在 + 数据库变更兼容（向前兼容/双写期）
9. 构建发布 —— **★运维左移**：发布须含灰度/金丝雀策略 + 监控告警阈值已设 + 运维 runbook 已更新
10. 发布后运营 —— **★运维左移运行态验证**：发布后验证健康检查端点可访问 + 告警阈值已设 + runbook 已更新 + 灰度观察期无异常（precheck `--operate`，warn 级 advisory）

> 项目可能有额外节点（如"代码审查"、"部署验证"），或无发布环节。按项目实际裁剪。
> **方法论整合：** 节点②③用 OpenSpec 的 proposal→spec(delta)→design→tasks 模式（specs as source of truth）；节点⑤用 superpowers 的 subagent 编排（见 subagent-orchestration.md）；节点间状态用 comet 风格脚本背书（state-machine.sh，非 prompt-only）；节点⑥含 gstack/OCR 审查维度（见 review-methodology.md）。**方法论分派（任务类型→档）单源见 task-methodology-router.md §文档路由表**。
> **★调用追踪（设计理念 2 落地）：** 每个节点必须含第 ⑨ 要素——进入节点先公告（`→ [节点X] 调用 …`），节点级落盘 `.swarm-yuan/trace.jsonl`（`SWARM_YUAN_TRACE=verbose` 含每次具体调用）。机器执法：`generate-skill.sh --verify-completeness` 校验每节点段含「调用追踪」字样，缺则 exit 1。
> **★左移原则（Shift-Left）：测试、变更影响、运维监控不等到节点⑥⑦⑧才考虑，须在节点②③⑤就嵌入约束**——spec 阶段写测试设计+可观测性约束，plan 阶段写变更影响+回滚预案，编码阶段先测试后实现，合入前确认回滚+迁移兼容，发布前确认灰度+告警+runbook。precheck `--shift-left` 门禁校验各阶段左移产出物存在。

**填充规则（11 要素逐项）：**
1. **流程入口** — 每节点标注其在流程中的位置（前序/后续/并行），顶部流程图体现全局入口顺序
2. **参与方** — 明确每个节点的参与者与角色（执行/决策/确认）
3. **准入检查** — 具体可验证（如"git rev-parse HEAD == git rev-parse main"）
4. **质量门禁** — 可被 precheck.sh 验证的检查项；**任务级自适应（质量优先偏置）**：简单任务 → `--all`（核心 11）；标准任务 → `--all-full`（标准 29）；完整任务（架构变更/跨服务/公共接口/数据模型/权限）→ `--all-full` + `--shift-left`，compliance 档项目追加 `--compliance-suite`。规模判断不确定时按更大规模处理（升档不降级）
5. **分支处理** — 必须覆盖成功/失败/信息不足三种情况
6. **产出物归档** — 区分持久化（落盘）vs 临时上下文（对话/草稿）
7. **流程控制** — 标注可否暂停/恢复/重启及恢复方式
8. **状态控制** — 状态载体（git 分支/文件/对话上下文）与恢复方式
9. **调用追踪** — 每节点写清：进入节点时的公告格式（`→ [节点X] 调用 <技能/工具> · <目的>`）+ 本节点会调用哪些技能/工具（须与节点工具表一致）+ trace-log.sh 落盘命令
10. **方法论引用** — 每节点写明消费的 references 档（互为反查路由表）；机器执法：`generate-skill.sh --verify-completeness` 逐节点校验「方法论引用」，缺则列 file:line 并 exit 1
11. **完成检查表** — workflow.md 末尾，汇总所有节点门禁

**标注需要用户确认的节点**（通常是合入 main、发布）。

---

## 3. reference 段（references/*.md）— 8 项 + 特征卡 17 项完整承接

> **铁律：特征卡 17 项必须全部承接进目标技能的文件中，不得遗漏。** 下表是 17 项特征卡 → 目标技能文件的完整映射。
> **P0/P1 分级**：P0 六项（1/4/5/11/15/16，表中加粗行）= 生成完成强制门槛 + 计数核验仅 P0 维度强制；P1 十一项 draft 期可「（P1 待补）」占位，`--mark-active` 前清零。
> **前端页面表**：前端形态项目的 reference-manual 须含**页面三角表**（`| 页面 | 操作 | 调用+真实入参 | 权限与降级 |`）——每路由级页面一行，真实入参在调用点反推；来源是 exploration-guide 前端探查要点的产出落点，页面数入 §4 计数核验口径。

| 特征卡项 | 承接的目标技能文件 | 承接章节 |
|---------|-------------------|---------|
| **1. 项目类型** | **SKILL.md + codebase.md** | **概述 + 工作区布局** |
| 2. 可改范围 | SKILL.md（铁律）+ dev-guide.md（改造分类）+ precheck.sh --scope | 铁律 + 决策树 + 门禁 |
| 3. 改造分类 | SKILL.md（改造分类表）+ dev-guide.md（详解） | 改造分类 + 开发指南 |
| **4. 技术栈摘要** | **codebase.md（技术栈版本表）** | **技术栈** |
| **5. 构建发布命令** | **SKILL.md（命令速查）+ release.md（编译规则）+ codebase.md（端口）** | **命令速查 + 编译规则 + 端口** |
| 6. 分支规范 | SKILL.md（铁律）+ branch-setup.sh + precheck.sh --branch | 铁律 + 脚本 + 门禁 |
| 7. 安全规则 | reference-manual.md §2 + precheck.sh --sensitive | 安全检查清单 + 门禁 |
| 8. 文档约定 | workflow.md 节点②③ + spec-template.md + plan-template.md | spec/plan 命名格式 |
| 9. 测试体系 | reference-manual.md check §1 + spec §19 + precheck.sh --test/--api/--shift-left | 测试目录/框架/命令/覆盖率报告 + 单测/接口/集成/回归案例 + 接口端点→测试映射 + 门禁 |
| 10. 环境与外部资源 | env-setup.sh + codebase.md（DB/资源）+ mcp-tools.md | 环境检测 + 资源 + MCP |
| 11. **可复用稳定单元** | reference-manual.md §4/5/6/9 + dev-guide.md §7（拼装式开发）+ **recipes.md §A/§B（业务功能编目+任务配方）** + spec-template.md（复用约束段）+ precheck.sh --reuse | 组件库 + 依赖链路 + 接口 + 拼装原则 + 配方路线 + 复用标注 + 门禁 |
| 12. 数据规范 | reference-manual.md §8 + data-sample-template.md + precheck.sh --consistency | 数据字典 + 库表样例 + 勾稽门禁 |
| 13. 五层认知基底 | reference-manual.md（认知映射表+六维动力学基线+逻辑谬误图谱+辩证映射表）+ spec-template.md（§14交付衰减/§15蓝图/§16偏差自检/§17辩证映射）+ precheck.sh --cognition | 认知映射 + 动力学基线 + 辩证映射 + 五层体检门禁 |
| 14. 领域知识 | reference-manual.md（领域知识段：技术+业务领域规则）+ spec-template.md（§18领域知识约束）+ precheck.sh --domain | 领域识别 + 客观规律约束 + 违规检测门禁 |
| **15. 编排调用关系及约束** | **dev-guide.md §8（编排约束）+ reference-manual.md §5（链路图含约束注释）+ SKILL.md（改造分类表标注约束）+ precheck.sh --layer/--frontend** | **导入方向 + 注册顺序 + 路由挂载 + 改造分类 + 状态所有权 + 测试边界** |
| **16. 详尽构件库清单（全量）** | **reference-manual.md §4（全量构件表）+ §6（全量接口端点表）+ §9（全量 store/类型/模型/mapper XML 表）+ exploration-guide §D.0-D.5（全量穷举+计数核验；数据映射四维度 DIM_DATA_MODEL/DIM_MAPPER_XML/DIM_SCHEDULE_JOB/DIM_ORM_SCHEMA 机器执法）** | **按 §D.0 形态判定 + §D.1 按维度全量穷举，清单计数 ≥ 枚举计数 × 0.95** |

**文件：** 多个，按主题拆分。

| 文件 | 覆盖材料项 | 内容 |
|------|-----------|------|
| `codebase.md` | §1 代码目录结构及配置信息 | 目录树、技术栈版本表、端口、配置、构建机制 |
| `dev-guide.md` | §7 组件库代码填充说明（部分）+ **§8 编排约束** | 改造分类详解 + 开发指南 + **拼装式开发原则（优先复用既有稳定单元）** + **编排调用关系及约束（导入方向/注册顺序/路由挂载/状态所有权/测试边界）** + **开发偏好（固定节：提交/分支/工作流/工具偏好，来源 mine-habits+已写规则+口述，无来源写「暂无已记录偏好」）** + 领域/实体对象域填充 + 接口参数填充 + 任务流程填充（一般流程指引；拼装序列归 recipes.md §B，不重复） |
| `release.md` | §3 项目编译规则清单 | 编译规则表 + 构建命令 + 产物位置 + 失败排查 |
| `reference-manual.md` | §2/4/5/6/7/8/9 + check §1/2/3/4 | 见下方 |
| `recipes.md`（standard/compliance 档；lite 不生成） | exploration-guide §D.6/§D.7 | §A 业务功能清单（功能→入口→复用组件→接口→数据→测试编目）+ §B 任务配方（每配方五要素：触发场景/前置查询/复用件/胶水/门禁与验证） |
| `relations.jsonl`（关系边集，可选产物；探查期生成） | exploration-guide §D.2.5 | 机器可读依赖边 `{"from","to","kind","evidence"}`：自动 import 边（relations-extract.sh）+ AI 语义边（call/route/message/ipc/export）；--stable-diff 传播与开发工作流 探查消费 |

**reference-manual.md 必须包含的章节（按项目形态动态适配）：**

> **★通用性铁律：以下章节按 exploration-guide §D.0 项目形态判定结果动态填充。** 只填项目实际存在的维度——纯后端项目不填"UI组件清单"，纯前端项目不填"请求处理管道"。不存在的维度标注"本项目无此维度"而非留空。

| 章节 | 材料项 | 内容 | 适用形态 |
|------|--------|------|---------|
| §安全检查规则清单 | §2 | 脱敏、密钥、网络白名单、框架安全基线 | 通用 |
| §构件库清单（全量） | §4 | **按探查维度全量**：前端(UI组件/store/composable) + 后端(controller/service/repository/middleware/model) + 异步(生产者/消费者/队列) + 桌面(主/preload/IPC) + 库(公共API)。清单计数 ≥ find 计数 × 0.95 | 按形态动态 |
| §调用链路说明 | §5 | **按形态选链路模型**：前端(注册装配+模块矩阵+挂载树+store依赖) / 后端(请求处理管道+分层矩阵+数据流+外部依赖+**数据映射链路**) / 异步(消息流转) / 微服务(跨服务调用链) + §5.1 编排约束注释；**含定时/批处理信号时加调度任务表**（§D.2-J 产物：任务/入口路径/触发方式/读数据资产/写数据资产/幂等策略；DIM_SCHEDULE_JOB 计数核验，路径进 --path-check） | 按形态动态 |
| §应用接口清单（全量） | §6 | **按接口形态全量**：REST(每路由文件端点表) / GraphQL(Query/Mutation) / gRPC(service.method) / MQ(queue+handler) / 库(导出函数)。无通配符占位 | 按形态动态 |
| §UI/UX设计资源清单 | §7 | 设计文档、主题、样式、品牌资源、i18n；含前端时按 `references/frontend-design-methodology.md` 三层权威分层（PRODUCT.md 产品真相 > DESIGN.md 视觉决策 > surface brief 单面策略）组织设计决策，含 design token（colors/typography/rounded/spacing/components）+ 品牌资源 + i18n | 仅含前端 |
| §数据字典及数据规范 | §8 | schema 位置、数据流、业务规则、勾稽关系；**字段级映射清单（有数据访问层时必含，§D.2-B Layer 5 产物）：核心实体字段 ↔ 表列 ↔ resultMap property ↔ SQL 列清单 ↔ 批处理 reader 列——改字段的影响面以此清单为唯一依据；**纯 REST JSON 项目（无数据访问层）用 JSON 契约面列族：JSON 字段 ↔ 前端调用点 ↔ 测试锚点**（同四查①语义）；JPQL @Query 内嵌实体/字段名须入清单**；**schema/迁移资产表（DIM_ORM_SCHEMA 计数核验）：prisma/migrations/alembic/flyway/liquibase/orm.xml/hbm/schema.sql 全枚举——改模型必核"迁移是否已生成"（模型↔迁移漂移 = 漏改字段的姊妹缺陷）** | 通用（有数据层时） |
| §store/类型/模型全量清单 | §9 | 前端(store+类型) / 后端(ORM model+entity+DTO+**mapper XML 文件表：路径/namespace↔接口/resultMap 实体引用**——DIM_MAPPER_XML 计数核验，与实体同节共表) / 通用(类型定义) | 按形态动态 |
| §消息拓扑配对表 | §5 | **含异步时必含（§D.2-A 产物）**：每行=端点名/生产侧 file:line/消费侧 file:line/序列化格式/幂等策略；单边端点显式标"外部系统"或"孤儿端点"——端点名是双边字符串，改名前必查 | 按形态动态 |
| §测试案例（check §1） | check §1 | 测试目录/框架/运行命令/覆盖率报告路径（必须可被 check_test 解析）；单测/接口/集成/回归/安全测试案例及数据；**接口端点→测试文件映射表（端点 × 正常/鉴权失败/参数校验/不存在/冲突/幂等）**；断言密度与负向用例证据 | 通用 |
| §业务规则案例（check §2） | check §2 | 业务规则 + 案例数据 | 通用 |
| §数据勾稽核对（check §3） | check §3 | 无多漏错重核对项 | 通用（有数据层时） |
| §UI展示核对（check §4） | check §4 | UI正确/脱敏/日志 | 仅含前端 |

**填充规则：**
- 全部用探查到的**真实路径、版本号、命令名、连接串格式**
- **★构件库清单（reference-manual.md §4 必须全量，按 exploration-guide §D.1 方法论）**：
 - 先做 §D.0 项目形态判定，按判定结果选择的维度做全量枚举
 - 每个维度独立计数核验：清单计数 ≥ 枚举计数 × 0.95（偏差须注明原因）
 - 按模块/层分组，每个构件含：名称/路径/签名/用途/复用方式/稳定性标注
 - 严禁"代表性样本"填充——必须穷举
 - 严禁"维度错配"——纯后端项目不填 UI 组件表；纯前端项目不填 controller 表
 - 通用维度（类型/工具函数/配置）所有项目都填
- **★调用链路（reference-manual.md §5 按形态选模型，按 exploration-guide §D.2 方法论）**：
 - 按 §D.0 判定结果选择链路模型（前端/后端/异步/微服务/桌面/库）
 - 前端含：注册装配链路 + 模块依赖矩阵 + 组件挂载树 + store 依赖
 - 后端含：请求处理管道 + 分层依赖矩阵 + 数据流图 + 外部依赖链路
 - 异步含：消息流转链路 + 幂等/DLQ/重试策略
 - 微服务含：跨服务调用链 + 共享DB检测 + trace透传
 - §5.1 编排约束注释：按 §D.3 推导的约束类别
 - **§5.2 文档证据注记**：docs/ 设计文档/ADR 中的架构决策意图与外部交互设计，探查期提取后在此标注（"设计文档 X §Y 设计为 A，代码实装为 B（file:line）"）——以代码为准，文档为辅；不一致即声明冲突（详见 exploration-guide §文档证据源优先级）
- **★接口清单（reference-manual.md §6 必须全量，按 exploration-guide §D.4 方法论）**：
 - 按探查到的接口形态枚举：REST(逐端点) / GraphQL(逐resolver) / gRPC(逐method) / MQ(逐queue+handler) / 库(逐导出)
 - 每个接口文件一张表，每行含：方法/类型 + 完整路径/名称 + handler + 认证 + 用途 + 复用方式
 - 严禁通配符占位（"GET/POST /api/xxx/*"）
 - **外部交互契约**：docs/ 设计文档中的外部交互设计（API 契约/MQ topic 拓扑/数据库交互/第三方服务调用）提取后与代码实装核对，进 §6 接口清单 + §5.2 文档证据注记——以代码为准，文档设计与实装不一致即声明冲突
- 数据字典含 schema 定义位置、数据流、**勾稽核对项**（无多漏错重：无遗漏、无多余、记录正确、勾稽正确、一致性、幂等性）
- 业务规则案例：列出关键业务规则 + 对应的测试案例数据
- **★拼装式开发原则（dev-guide.md §7 必须含）**：
 - 优先复用特征卡第 11 项盘点的**既有稳定单元**（接口/组件/类/函数/方法/store/类型）
 - 新功能 = 既有稳定单元的拼装 + 最小新增胶水代码
 - **禁止重复造轮子**：新增函数/组件前，先查特征卡第 11 项是否已有同等功能的稳定单元
 - **禁止侵入式重构**：不修改既有稳定单元的签名/行为，只通过组合/扩展复用
 - **禁止破坏性改造**：不改只读骨架/第三方依赖/框架核心，只通过项目允许的机制（patch/overlay/插件）接入
 - 每个新增文件须标注：复用了哪些既有单元（引用特征卡第 11 项的路径/签名）
- **★编排约束（dev-guide.md §8 必须含，从 exploration-guide §D.3 + 特征卡第 15 项承接）**：
 - **按 §D.0 项目形态选择约束类别**——只推导项目实际存在的约束
 - 前端约束：导入方向/跨模块边界/注册顺序/feature-gate/路由挂载/状态所有权/测试边界
 - 后端约束：分层依赖方向/事务边界/DTO转换边界/中间件顺序/认证层/外部副作用隔离/测试边界
 - 异步约束：消费幂等/消息时序/重试DLQ/生产消费解耦
 - 微服务约束：服务调用方向/共享DB禁止/trace透传/熔断降级/Saga补偿
 - 通用约束：改造分类与文件落位/版本锁定/可改vs只读边界
 - 每条约束须标注代码证据（文件:行 或 grep 命令）
- **★任务配方（recipes.md 必须含，standard/compliance 档；从 exploration-guide §D.6/§D.7 承接）**：
 - §A 业务功能清单：从 §D.1 枚举产物 + §D.2 链路**归纳**（不是重新探查），每功能一行 `| 功能 | 入口路径 | 复用组件 | 接口 | 数据 | 测试 |`；组件路径反引号包裹（`--path-check` 校验）；无测试的功能显式标"无"
 - §B 任务配方：三源提取（既有实现 / git 同类任务历史 / 开发者文档），每配方五要素齐全——触发场景/前置查询/复用件/胶水/门禁与验证（`--verify-completeness` 机器执法，缺要素即列 file:line）
 - **数据模型变更配方（有数据访问层时必须建**，漏改字段高发任务）：触发场景=改/加/删实体字段或表列；**前置查询必须含四查**——①查 relations.jsonl `data-mapping`/`mapper-binding` 边反查该实体的全部 mapper XML；②查 §8 字段级映射清单定位 property/SQL 列；③查 §5 调度任务表定位读写该数据资产的 job（reader SQL 内嵌列名不在 import 边里）；④查**对外契约面**——字段若暴露于 API JSON（响应体/请求体 DTO），反查前端调用点与契约测试，前端 fixtures/mock 同名字段一并改（对应回归②接口命中路）；胶水=同步点清单（resultMap property/SQL 列/reader SQL/@TableField/DDL 迁移/JSON 契约字段）；门禁与验证=`fw_mybatis_field_sync` + job 回归 + 契约消费方测试
 - 复用件清单表格化（`| 复用件路径 | 用途 |`，反引号路径）——散文行的命令反引号不进 path-check（防误报）
 - **★待确认事项清单（生成承载）**：探查中拿不准的业务语义**集中**落 `.swarm-yuan/notes/cognition.md` 待确认事项清单段（每项：问题/两源证据锚点/需谁回填），回填后按裁决序转正销项——不许散落各文档的"待验证"字样里自然蒸发（互为反查 exploration-guide 待确认事项清单回填协议）
 - 配方只建高频形态（≥2 个起步，不凑数）；低频任务走九节点流；lite 档不生成 recipes.md（档位差异化）
- **★版本锁定原则（dev-guide.md 必须含 + codebase.md 版本表必须记录基线）**：
 - 功能性开发过程中，**不允许随意升级或更换核心技术及基础组件及依赖的版本**
 - 例外条件（须满足之一）：(1) 用户主动要求；(2) 严重安全漏洞；(3) 严重性能隐患；(4) 功能缺失（当前版本无法实现需求且无替代方案）
 - 探查时记录当前版本基线（特征卡第 4 项 → codebase.md 技术栈版本表）。**版本语义单一约定：版本表一律记 manifest 声明值——range 原样保留（如 `^12.0.0`），lock 实装/实测安装版本写说明列**。check_deps（--deps）的基线与 manifest 两侧同语义比较；记成实装版本（如 lock 的 12.11.1）会在 range 声明 `^12.0.0` 的项目上吃假阳性 fail（NestJS 项目实证）
 - 任何版本变更须在 spec-template.md 版本约束声明段中显式声明理由 + 经用户确认
 - precheck.sh `--deps` 检测 package.json/pyproject.toml/go.mod 等依赖版本是否被变更
- **★可复用稳定单元清单（reference-manual.md §4/5/6/9 必须含，全量）**：从特征卡第 11 项整理，列出全部稳定单元的签名/路径/用途/复用方式/稳定性标注。**不允许样本化——清单计数须通过 §D.1 计数核验**
- **★安全规范（reference-manual.md §2 必须含 + dev-guide.md 必须含安全编码规范）**：引用 `references/security-spec.md`，覆盖 OWASP Top 10（注入/XSS/CSRF/访问控制/身份认证/敏感数据/依赖安全）、代码安全（路径穿越/反序列化/SSRF/安全配置/日志安全）、网络安全（接口安全/传输安全/端口安全）、LLM 信任边界。precheck.sh `--security` 检测常见安全模式
- **★三平台兼容（swarm-yuan 自身的 .sh 脚本必须遵守，非目标技能强制）**：不用 declare -A / sed -i.bak+rm / grep -E / date -u / cd+pwd 替代 readlink -f / wc|xargs / ${var} 防 C-locale。详见 `references/security-spec.md` §六

**★左移要求（Shift-Left，dev-guide.md §9 必须含 + spec-template.md §19/§20/§21 + precheck.sh `--shift-left`）：**
- **测试左移**：spec 阶段（节点②）写测试设计段（测试策略/用例骨架/边界值/回归范围/契约测试）；编码阶段（节点⑤）每个 task 先写/更新测试再实现（TDD/BDD），test 与 impl 同分支提交，禁止"先实现后补测试"。precheck `--shift-left` 校验：spec 含测试设计段 + git diff 中 test 文件先于或同时于 impl 文件提交。**回归范围分级推导协议**（AI 判断引导不新增 check_*）：以 relations.jsonl 边集为反查底座，四路由窄到宽——①直接命中（diff 文件即测试文件或其被测锚点）→必跑；②接口命中（改动暴露为接口/导出——**实体字段改名若暴露于 API JSON 即属之**，反查引用方测试含前端调用点/fixtures）→应跑；③数据面命中（改实体字段/表列，沿 data-mapping/mapper-binding 边把 mapper/消费方测试拉进）→应跑；④链路扩散（命中构件可归入某业务链/配方，整链测试）→建议跑。分级写进回归范围字段（`必跑:/应跑:/建议跑:` 三行），防"全量回归"与"漏隐蔽影响面"两头
- **变更左移**：plan 阶段（节点③）写变更影响范围段（消费方反查/回归范围/回滚预案/灰度策略/数据库迁移兼容窗口）；合入 main 前（节点⑦）确认回滚预案存在 + 迁移向前兼容。precheck `--shift-left` 校验：plan 含变更影响段 + spec 含回滚预案声明
- **运维监控左移**：spec 阶段（节点②）写可观测性约束段（日志结构化规范/metrics 埋点清单/trace 透传链/告警阈值/健康检查端点）；验证阶段（节点⑥）确认 metrics/日志/trace 已埋点且可通过健康检查端点访问；发布阶段（节点⑧）确认灰度策略 + 告警阈值已设 + runbook 已更新。precheck `--shift-left` 校验：spec 含可观测性段 + 代码中 metrics/日志/trace 埋点存在 + 健康检查端点可访问
- **左移三项的关系**：测试左移防缺陷流入后段；变更左移防变更爆炸半径失控；运维左移防线上故障不可观测。三者配套——不可只做一项

**★框架适配（由 exploration-guide §D.0.5 探查结果激活 + dev-guide.md §10 框架约束 + precheck.conf ACTIVE_FRAMEWORKS + framework-knowledge.md 框架规则集）：**
- **框架探查**：探查阶段（§D.0.5）从依赖清单+注解+配置文件识别具体框架（Spring/MyBatis/Lombok/Sharding/Dubbo/RocketMQ/Kafka/RabbitMQ/Redis/Quartz/MySQL/SQLServer/PostgreSQL/Element/AntDesign/Vue/React/NaiveUI 等 20+ 框架），产出 ACTIVE_FRAMEWORKS 列表
- **框架规则集激活**：只激活探查到的框架的领域规则集（位于 `references/frameworks/<fw>.md`，六段式结构；`framework-knowledge.md` 是其项目实例化产物）+ 枚举模式（§D.1-FW 框架特定构件）+ 约束模板 + precheck 配置
- **框架特定约束**：dev-guide.md §10 须含按激活框架推导的约束（如 MyBatis ${} 白名单规则 / Lombok @Data+JPA 冲突 / Spring @Transactional 代理自调用 / Sharding 分片键必含 / Dubbo 超时重试幂等等），每框架 ≥ 3 条
- **precheck 框架感知**：`--security` 区分 MyBatis #{} vs ${}（#{} 安全跳过，${} 须白名单）；`--deps` 支持 pom.xml/build.gradle 版本锁定；`--shift-left` 日志埋点感知 @Slf4j；`--layer` 领域层禁止 import Java 框架；`--framework <id>` 实跑 `_fw_<id>_check` 动态分发器（模板内置，`declare -f` 派发到 `assets/framework-gates/<fw>.sh` 中的 `_fw_<id>_<rule>`，缺失则 fail）
- **门禁片段注入**：`scripts/generate-skill.sh --inject-frameworks` 将 `assets/framework-gates/<fw>.sh` 注入到 `scripts/precheck.sh` 的 `# >>> swarm-yuan:framework-gates >>>` ... `# <<< swarm-yuan:framework-gates <<<` 标记区块；`--upgrade` 触发自动重注入（幂等）
- **范式通用性**：框架规则集是"探查到才激活"，非探查到的框架不产生约束/门禁。用户可自行扩展新框架规则集（`references/frameworks/<fw>.md` 加六段式规则文件 + `assets/framework-gates/<fw>.sh` 加门禁片段 + `precheck.conf` 加配置变量）

### framework-knowledge.md 填充规范（按激活框架实例化的规律与门禁依据）

**文件：** `<target-skill>/references/framework-knowledge.md`

**骨架生成**：由 AI 在生成流程 **Step 4 框架深化与门禁注入**子阶段依据 `references/frameworks/<fw>.md` §3（领域规律）+ §4（门禁清单）构建骨架——对 ACTIVE_FRAMEWORKS 中每个 `<fw>`，将该规则文件的 §3 规律段与 §4 门禁清单按项目实际激活情况拷贝/拼接到 `framework-knowledge.md` 形成骨架（保留 frontmatter 与六段结构标记），未激活的框架不出现。**脚本不自动生成骨架**（`generate-skill.sh --inject-frameworks` 只负责门禁片段注入 precheck.sh 标记区块，不读写 `framework-knowledge.md`）——避免未经验证的规律种子直接落产物，违反"残留未实例化种子零容忍"（设计文档 §5.1 框架深化段明确规定 AI 实例化后填充）。

**AI 实例化铁律（逐条规律处理）：**
- **成立 → 附证据**：用项目代码验证该规律确实成立（按 §3 每条规律的"验证方法"给出的 `grep`/`read` 命令实跑），在规律行末附"证据: `<file>:<line>` 或 `<grep 命令输出摘要>`"。证据须可自动复现，不允许"应当""想必"等臆测语
- **不成立 → 剔除并记录原因**：项目代码反例该规律（如规律要求"@Transactional 不可自调用"而项目存在自调用且业务上无法避免），将该规律从 `framework-knowledge.md` 剔除，在文件末尾"剔除记录"段标注：剔除规律标题 + 原因 + 反例代码位置 + 是否需 spec 声明豁免
- **版本区间外 → 标"待验证"**：规律适用版本与项目探查到的版本不匹配（如规律适用 `Spring Boot 2.x`，项目实际为 `3.x`），保留该规律但行首标"⚠ 待验证（项目版本 X，规律适用区间 Y，需人工复核或升/降级规则集）"
- **无占位符容忍**：骨架中的 `<规律标题>`/`<验证方法>`/`<对应门禁>` 等种子字段必须全部被实例化或剔除——残留种子 = 占位符 = 未完成。**填充指引而非占位符**：允许写"逐条按 §3 验证方法 grep 项目代码后填写证据字段"作为引导语，但不允许 `<...>` 形式的占位符残留到最终产物

**核对（每规律五要素齐全）：**
- 适用版本区间（与 §1 探查信号匹配的版本号）
- 规律陈述（具体化到项目实际场景，非通用模板原文）
- 违反后果（含 CWE / 官方 issue / CVE 依据任一）
- 验证方法（具体 `grep`/`read` 命令，非"人工检查"泛词）
- 对应门禁（`fw_<id>_<rule>` fail/warn 或"人工检查"显式标注）

**四要素核验前置**：本文件填充完成后才能运行 Step 13 的"框架适配四要素核验"② 项（规律数 ≥ 门槛且 100% 含证据字段）——见本文件末"生成后核对清单 · 框架适配四要素"。

---

## 4. assets 段（assets/*）— 7 项

**文件：** 模板、环境脚本、数据模版。

| 文件 | 材料项 | 内容 |
|------|--------|------|
| `spec-template.md` | §2 决策记录选型三问 + §4 任务配置模版 + §5 静态资源 + **★复用约束段** | 设计文档模板（含技术选型三问——被什么击穿/不用 X 的最强做法/决策变量；含静态资源/页面元素段 + 复用约束：标注复用了哪些既有稳定单元） |
| `plan-template.md` | §4 实施计划模版 | Task 拆分 + 起点核验 + 检查表 |
| `branch-setup.sh` | §3 拉取代码仓库分支 | 核验起点 + 建分支 + 记录基线 |
| `env-setup.sh` | §1 加载环境 + §2 检测资源连接/工具权限 | 环境加载 + 资源连通性 + 工具权限检测 |
| `data-sample-template.md` | §6 库表及数据结构、样例数据 | 库表 schema 模版 + 样例数据格式 |
| `state-machine.sh` | ★comet 风格阶段状态机 | 阶段状态持久化（init/get/set/transition/guard），survive compaction |

**规模与工作量估算（spec §25，NESMA 功能点法）**：feature 档推荐选填、其余任务类型豁免；无门禁执法（守门禁 56 预算），AI 按 `references/cost-estimation-methodology.md` 识别五类组件（ILF/EIF 数据功能从 relations 边集确认维护方；EI/EO/EQ 事务从 recipes §A 业务功能清单取操作）→ 估算法公式 UFP=10×ILF+7×EIF+4×EI+5×EO+4×EQ → 重用（高⅓/中⅔/低1，拼装式开发的度量表达）×修改系数调整 → 因子乘积 → 工作量人月（2024 基准 13.62 人时/FP ÷174）；基准数据跨年须更新、人月费率项目自填；估算与 plan 任务拆分偏离 2 倍以上须回查计数或任务粒度。

**填充规则：**
- `env-setup.sh` 必须检测：开发环境（node/python/go 版本）、外部资源连通性（DB/缓存/MQ，按项目实际）、工具权限（git/gh/docker）。检测项按项目探查结果定制，无对应资源的项跳过
- spec/plan 模板采用 OpenSpec 格式：spec-template = proposal.md（Why/What/Capabilities/Impact）+ delta spec（ADDED/MODIFIED/REMOVED/RENAMED + SHALL/MUST + Scenario WHEN/THEN）；plan-template = tasks.md（`- [ ] X.Y` checkbox，apply 阶段解析进度）
- branch-setup.sh 包含起点核验 + 保护分支检查
- data-sample-template.md 提供库表 schema + 样例数据的填写框架
- state-machine.sh 实现 comet 风格阶段状态机：`init <change>` / `get <field>` / `set <field> <val>` / `transition <phase>` / `guard <phase>` / `next`。状态存 `.swarm-yuan/state.yaml`（survive context compaction）。阶段转换有硬门禁（guard 验证产出物存在）

**★EARS 句式对照与 ISO/IEC 29148 对齐声明（需求章节）：**

spec §4 的 Requirement/Scenario 写法须按 EARS（Easy Approach to Requirements Syntax，Mavin et al. 2009）句式族书写，对照表如下：

| EARS 句式 | 句式模板 | 本模板（assets/spec-template.md §4）对应写法 |
|-----------|---------|--------------------------------------------|
| 普遍式（Ubiquitous） | The <system> shall <response> | Requirement 描述用"系统 SHALL …"（无触发条件的恒真需求） |
| 事件驱动（Event-driven） | WHEN <trigger>, the <system> shall <response> | Scenario 的 `WHEN <条件>` + `THEN <预期>` |
| 异常式（Unwanted behavior） | IF <unwanted condition>, THEN the <system> shall <response> | Scenario 异常路径；spec §19.2 用例骨架"异常路径"行 |
| 状态式（State-driven） | WHILE <state>, the <system> shall <response> | Scenario 的 WHEN 条件中显式标注系统状态（如"WHEN 已登录态下…"） |
| 可选式（Optional） | WHERE <feature is present>, the <system> shall <response> | 按形态动态填充段（"本项目无此维度"标注 + feature-gate 条件） |
| 复合式（Complex） | WHILE/WHERE + WHEN 组合 | Scenario 组合条件（多条件并列时拆分为多条 Scenario，禁止单条 Scenario 语义混杂） |

**对齐声明**：本模板的 Requirement（SHALL/MUST + 唯一命名 `### Requirement: <需求名>`）+ Scenario（WHEN/THEN）写法经 EARS 句式族与 **ISO/IEC/IEEE 29148:2018** 的需求质量特性对齐——无歧义（单一句式）、可验证（每 Requirement 至少 1 条 Scenario）、唯一标识（需求名唯一）、完整（ADDED/MODIFIED/REMOVED 显式枚举）。机器执法现状与方向见 references/standards-compliance.md §C 补充映射（无占位符机器执法 P0；需求 lint——TBD/唯一 ID/glossary 一致性——P1 门禁化；RTM 留 P2）。

---

## 5. check 段（scripts/precheck.sh + reference-manual.md 检查段）— 4 项

**文件：** `scripts/precheck.sh` + `references/reference-manual.md` 的检查章节。

**precheck.sh 子命令：**
```bash
bash precheck.sh # 全部门禁
bash precheck.sh --branch # 分支规范
bash precheck.sh --scope # 改动范围（可改 vs 只读）
bash precheck.sh --build # 构建状态
bash precheck.sh --test # 测试（check §1）
bash precheck.sh --sensitive # 敏感信息脱敏（check §4）
bash precheck.sh --consistency # 业务规则 + 数据勾稽核对（check §2/§3）
bash precheck.sh --review # ★代码审查（gstack/OCR 5 维度，调用 ocr review 若可用）
bash precheck.sh --reuse # ★复用合规检查（拼装式开发：禁止重复造轮子）
bash precheck.sh --deps # ★依赖版本锁定：对比基线检测依赖版本变更（未经确认=违规）
bash precheck.sh --security # ★安全规范：OWASP Top 10 模式扫描（注入/XSS/eval/硬编码密钥/TLS）
bash precheck.sh --layer # ★DDD 分层边界：层穿透/依赖倒置/循环依赖/领域层污染框架/聚合跨引用
bash precheck.sh --stable-diff # ★稳定单元篡改：稳定层文件改动必须先立 spec（MODIFIED 声明）
bash precheck.sh --link-depth # ★调用链深度：链路膨胀/纯转发函数堆叠检测（graphify/madge 优先，降级启发式）
bash precheck.sh --adr # ★TOGAF 架构决策：ADR 目录 + 新依赖须有 ADR + 技术债登记
bash precheck.sh --contract # ★TOGAF 接口契约：契约 version 字段 + 跨上下文 import 必须经 ACL 防腐层
bash precheck.sh --consistency-cross # ★TOGAF BDAT 一致性：业务术语表 vs 代码标识符 + 数据所有权 SoR
bash precheck.sh --impact # ★TOGAF 变更影响：spec 须含"影响范围"段 + 变更文件消费方反查
bash precheck.sh --service # ★微服务架构：共享DB/同步链/共享模型/网关/trace透传
bash precheck.sh --api # ★API 契约与幂等：版本化/幂等键/跨服务事务/Outbox
bash precheck.sh --state # ★前端状态管理：巨型store/prop drilling/派生状态useState
bash precheck.sh --frontend # ★前端组件架构：层级深/容器展示分离/props多/循环依赖/CSS污染
bash precheck.sh --cognition # ★认知递进体检：六阶认知链完整性 + 六维动力学（速度/聚散/趋势/强度/能耗/累积量）
bash precheck.sh --domain # ★领域知识：技术+业务领域识别 + 客观规律违规检测（密码明文/SQL拼接/XSS/并发竞态）
bash precheck.sh --knowledge # ★项目知识复用：AGENTS.md/CLAUDE.md/记忆 → 生成 skill 是否复用
bash precheck.sh --diagram # ★图表生产：客观契约机械查（可访问 SVG/单文件安全/远程资源/脚本/viewBox）+ 主观质量 AI 检查单；产物默认 docs/diagrams/ 或 .swarm-yuan/diagrams/（--mermaid 为别名）
bash precheck.sh --shift-left # ★左移检查：测试设计段+变更影响段+可观测性段+测试先于impl+回滚预案+健康检查端点
```

**图表产物约定（`--diagram`）**：需要进 spec/设计文档/审查报告/发布说明的可发布图，按 `references/diagram-production-methodology.md` 先定语义模式与视觉类型，再读生成器 `runtime/diagram-design/` 的原文与所选 `type-*.md`；产物放 `docs/diagrams/` 或 `.swarm-yuan/diagrams/`，用随技能分发的 `scripts/diagram-check.sh` 自检。每个 sprint 都变的活文档用 Mermaid 等文本源格式，不按本门禁走。目标技能不携带运行时全文，但结构自检脚本随技能分发；运行时可达时自动追加上游 `self_check.py` 深检。

**reference-manual.md 检查段包含（对应 check 4 项 + 审查 + 复用）：**

| check 项 | 内容 | precheck 子命令 |
|----------|------|----------------|
| 分支规范 | 分支命名（feat/fix/refactor）+ 保护分支禁止直接开发 | `--branch` |
| 改动范围 | 可改 vs 只读目录边界，只读区改动=违规 | `--scope` |
| 构建状态 | 构建命令执行成功，产物存在 | `--build` |
| §1 单测/接口/集成/回归/安全测试案例 | 测试框架、目录、案例数据、运行命令 | `--test` `--sensitive` |
| §2 业务规则案例及数据 | 关键业务规则 + 案例数据 + 预期结果 | `--consistency` |
| §3 数据勾稽核对（无多漏错重） | 无遗漏、无多余、记录正确、勾稽正确、一致性、幂等性 | `--consistency` |
| §4 UI展示核对 | 展示正确、敏感信息脱敏、请求响应日志已记录 | `--sensitive` |
| ★代码审查 | 5 维度（正确性/安全/性能/可维护/测试覆盖）+ 两遍清单 + AUTO-FIX/ASK + 严重度分级 | `--review` |
| ★复用合规 | 拼装式开发（**硬门禁**）：校验 spec §5.5 复用约束段 + 4 checkbox 全勾；新增单元名 vs reference-manual §4/5/6 稳定单元名重名检测（重复造轮子→fail）；导出单元数异常 warn | `--reuse` |
| ★版本锁定 | 检测 package.json/pyproject.toml/go.mod 等依赖版本是否被变更（对比基线），未经用户确认的版本升级 = 违规 | `--deps` |
| ★安全检查 | 检测 OWASP Top 10 常见安全模式：SQL 拼接/命令注入/eval/v-html/路径穿越/硬编码密钥/弱哈希/禁用 TLS/CORS */调试模式 | `--security` |
| ★DDD 分层边界 | **硬门禁**：层依赖方向断言（仅允许上层→下层，LAYER_ORDER）；领域层不得 import 框架/ORM/Web/IO（DOMAIN_FORBIDDEN_IMPORTS）；循环依赖（madge）；聚合跨边界对象引用（聚合间只引用 ID，不引用对象） | `--layer` |
| ★稳定单元篡改 | **硬门禁**：git diff 检测 STABLE_GLOBS 内文件改动，必须在 spec MODIFIED 段声明 + 理由 + 迁移，否则 fail | `--stable-diff` |
| ★调用链深度 | 硬门禁+warn：graphify 最长路径 / madge 依赖树深度 > MAX_LINK_DEPTH → warn；降级为纯转发函数统计（>5 提示） | `--link-depth` |
| ★TOGAF 架构决策 | **硬门禁**：ADR_DIR 必须存在；git diff 新增第三方依赖须在 ADR 中说明选型理由（warn）；TECH_DEBT_FILE 存在时校验代码 TODO/FIXME 是否登记（warn） | `--adr` |
| ★TOGAF 接口契约 | **硬门禁**：CONTRACT_DIR 内契约文件必须含 version 字段；ACL_DIR + CONTEXT_DIRS 配置时，跨上下文 import 必须经 ACL 防腐层中转（绕过=fail） | `--contract` |
| ★TOGAF BDAT 一致性 | warn：GLOSSARY_FILE 中代码标识符须在代码中可查（漂移→warn）；SOR_FILE 数据所有权表存在性校验 | `--consistency-cross` |
| ★TOGAF 变更影响 | **硬门禁**：spec 必须含"影响范围/impact/消费方/stakeholder"段；git diff 改动文件若消费方 >3 则 warn 提示回归 | `--impact` |
| ★微服务-共享DB | **硬门禁**：DB_CONFIG_FILES 中多服务指向同一 host+database = 共享数据库反模式 → fail | `--service` |
| ★微服务-架构 | warn：共享库被多服务依赖；无 API_GATEWAY；同步调用 >MAX_SYNC_CHAIN；无 traceId 透传；无 Outbox 模式 | `--service` |
| ★API 契约与接口测试 | **硬门禁**：API_SPEC_DIR 内定义文件缺 version → fail；接口测试按 HTTP 方法 × 路径模板覆盖 < API_TEST_MIN_RATIO → fail（API_TEST_STRICT=1）；warn：写 handler 无幂等键；warn：检测到分布式事务/2PC；已覆盖端点的测试调用附近缺自身状态码/错误路径断言 → warn/fail | `--api` |
| ★前端状态 | warn：store 文件行数 >MAX_STORE_LINES；props 透传(...props)>5；useState 内派生计算(.map/.filter) | `--state` |
| ★前端组件 | warn：组件嵌套深度 >MAX_COMPONENT_DEPTH；容器+展示混合；props >MAX_PROPS_COUNT；非 scoped CSS；**硬门禁**：循环依赖(madge) | `--frontend` |
| ★认知递进体检 | **不判违规**（不 fail），呈现"认知体检报告"：(1) 第一层六阶认知链逐阶评分（①概念②结构③空间④映射⑤规律⑥处理，满分 14 + ≥4 条规律编码）(2) 五层认知基底总分（第一层 14 + 第二层 3 + 第三层 2 + 第四层 2 + 第五层 1 = 满分 22）。第一层 ≥8+≥4 规律=完整；五层总分 ≥15/22=完整，10-14=部分建立，<10=不足 | `--cognition` |
| ★测试左移 | **硬门禁**：spec 含"测试设计"段（§19）；warn：本次变更集有 impl 文件但无任何 test 文件（跨栈命名识别；严格时序/逐文件映射靠任务纪律与人工审查） | `--shift-left` |
| ★变更左移 | **硬门禁**：plan 含"变更影响范围"段（§20）+ spec 含回滚预案声明 + 数据库迁移须向前兼容（无破坏性 DDL） | `--shift-left` |
| ★运维监控左移 | warn+硬门禁：spec 含"可观测性约束"段（§21：日志结构/metrics 埋点/trace 透传/告警阈值/健康检查端点）+ 代码中 metrics/日志/trace 埋点存在 + 健康检查端点可访问（HTTP 200） | `--shift-left` |

**填充规则：**
- scope 检查反映项目的可改/只读边界
- sensitive 扫描涵盖项目用到的密钥格式
- `--consistency` 检查业务规则完整性 + 数据勾稽（无多漏错重）
- `--review` 调用 `ocr review`（若已安装），否则提示手动审查清单（5 维度 + 两遍清单）。引用 `references/review-methodology.md`
- `--reuse` 是**硬门禁**（违反则 `FAIL=1`，exit 1），做三件事：(1) 校验当前 spec 文档含 §5.5 复用约束段且 4 个拼装合规声明 checkbox 全部勾选；(2) 从 spec §5.5 "新增胶水代码" 表提取新增单元名，与 reference-manual.md §4/5/6 稳定单元名做重名检测，重名 = 重复造轮子 → fail；(3) 启发式 warn：可改目录新增导出单元数 >30 提示人工核对
- `--deps` 是**硬门禁**：对比探查时记录的版本基线（codebase.md 版本表），检测 package.json/pyproject.toml/go.mod 中依赖版本是否被变更。变更且 spec 中无版本约束声明段 = 违规。引用 `references/security-spec.md` §2.3
- `--security` 是**硬门禁**：扫描可改目录中的常见安全模式（见 `references/security-spec.md` §五安全检查清单），检测到 High 级 = fail
- `--layer` 是**硬门禁**：配置 LAYER_DEFS（层名=目录glob）+ LAYER_ORDER（依赖顺序，上层→下层）+ DOMAIN_LAYER + DOMAIN_FORBIDDEN_IMPORTS + AGGREGATE_DIR。做四件事：(1) 解析相对 import，断言仅允许上层依赖下层，倒置/穿透 fail；(2) 领域层不得 import 框架/ORM/IO（react/express/sequelize/prisma 等），违反 fail；(3) 循环依赖检测（madge，未装则 warn）；(4) 聚合间不得直接 import 其他聚合目录的对象（只引用 ID），违反 fail。防范 DDD 层穿透/领域污染/贫血模型被框架绑死/聚合边界破坏
- `--stable-diff` 是**硬门禁**：配置 STABLE_GLOBS（稳定层文件 glob，如 src/domain/** src/repositories/**）。git diff（vs main）检测稳定层文件改动，必须在 spec MODIFIED 段声明该文件 + 理由 + 迁移路径，否则 fail。防范"顺手改稳定单元签名/破坏聚合根/改 Repository 接口"
- `--link-depth` 配置 MAX_LINK_DEPTH（建议 6-8）。优先用 graphify 最长路径，降级 madge 依赖树深度，再降级为纯转发函数统计（>5 warn）。超阈值 warn（不 fail，因深度可能是合理的）。防范"适配层堆叠/调用链膨胀/Repository 查询泄漏"
- `--adr` 配置 ADR_DIR（架构决策记录目录）+ TECH_DEBT_FILE（技术债登记）。做三件事：(1) ADR_DIR 不存在 fail；(2) git diff 新增第三方依赖若未在 ADR 文件中出现则 warn（技术选型应有决策记录）；(3) 代码中 TODO/FIXME/HACK 数量提示在技术债文件登记。防范 TOGAF "架构决策无文档/技术债无登记"
- `--contract` 配置 CONTRACT_DIR（接口契约目录）+ ACL_DIR（防腐层目录）+ CONTEXT_DIRS（限界上下文目录列表）。做两件事：(1) 契约文件必须含 version 字段（缺则 fail）；(2) 跨上下文 import 解析到其他上下文目录 = 绕过 ACL → fail。防范 TOGAF "接口无版本/遗留系统无防腐层"
- `--consistency-cross` 配置 GLOSSARY_FILE（业务术语表）+ SOR_FILE（数据所有权表）。warn 级：(1) 术语表代码标识符在代码中 grep 不到 → 命名漂移 warn；(2) SoR 表存在性校验。防范 TOGAF "BDAT 命名不一致/数据所有权模糊"
- `--impact` 硬门禁：spec 必须含"影响范围/impact/消费方/stakeholder"任一关键字段（缺则 fail）；git diff 改动文件用 grep 反查消费方，>3 则 warn 提示回归范围。防范 TOGAF "变更无影响分析/评审后不遵从"
- `--service` 配置 SERVICE_DIRS/DB_CONFIG_FILES/SHARED_LIBS_DIR/API_GATEWAY/MAX_SYNC_CHAIN。**硬门禁**：多服务 DB_CONFIG_FILES 指向同一 host+database = 共享数据库 → fail。warn：共享库被多服务依赖；无网关；同步调用 >阈值；无 traceId/spanId 透传（建议 OpenTelemetry）；无 Outbox 模式。防范"分布式单体/共享DB/同步链雪崩/无追踪"
- `--api` 配置 API_SPEC_DIR/WRITE_HANDLER_DIRS。**硬门禁**：API 定义文件缺 version → fail。warn：写 handler（POST/PUT/DELETE）无 idempotency-key/request-id → 重复扣款风险；检测到分布式事务/2PC（seata/@GlobalTransactional/XAResource）→ 应改 Saga/Outbox；无 Outbox → 库消息不一致风险。防范"契约无版本/无幂等/跨服务事务"
- `--state` 配置 STORE_DIR/MAX_STORE_LINES/COMPONENT_DIR。warn：store 文件行数 >MAX_STORE_LINES（巨型 store）；...props 透传 >5 处（prop drilling）；useState 内 .map/.filter/.reduce（派生状态应 useMemo）。防范"状态散落/prop drilling/派生不同步"
- `--frontend` 配置 COMPONENT_DIR/MAX_COMPONENT_DEPTH/MAX_PROPS_COUNT/STYLE_DIR/BUNDLE_REPORT。**硬门禁**：循环依赖（madge）→ fail。warn：组件嵌套深度（python 扫描 JSX 标签峰值）>阈值；容器+展示混合（同时含数据获取+大量渲染）；props 数量 >阈值；非 .module.css 全局样式；bundle 重复依赖。防范"组件树失控/CSS污染/循环依赖"
- `--cognition` 配置 COGNITION_BASELINE/COG_SPEED_FILES/COG_CUMULATIVE_TODO/COG_STRENGTH_FANIN。**不判违规**，输出认知体检报告：(1) 第一层六阶认知链逐阶评分——①概念（glossary+稳定单元清单）②结构（LAYER_DEFS+AGGREGATE_DIR+CONTEXT_DIRS）③空间（SERVICE_DIRS+COMPONENT_DIR+STORE_DIR）④映射（术语↔代码一致性+分层↔目录+SoR↔服务）⑤规律（每条门禁对应一条规律）⑥处理（spec/ADR/技术债），满分 14 + ≥4 条规律编码；(2) 五层认知基底总分——第一层 14 + 第二层 3 + 第三层 2 + 第四层 2 + 第五层 1 = 满分 22。第一层 ≥8+≥4 规律=完整；五层总分 ≥15/22=完整，10-14=部分，<10=不足。**理念：呈现递进的关系而非仅计数**，每个计数背后指向一条关系规律
- `--shift-left` 配置 TEST_DESIGN_FILE/CHANGE_IMPACT_FILE/OBSERVABILITY_FILE/METRIC_ENDPOINTS/HEALTH_CHECK_URLS/LOG_FORMAT_REGEX/TRACE_HEADER。**硬门禁+warn**：(1) **测试左移**——spec（TEST_DESIGN_FILE）含"测试设计"段（测试策略/用例骨架/边界值/回归范围）→ 缺则 fail；git diff 中 test 文件先于或同时于 impl 文件提交 → warn（无 test 提交）→ impl 无对应 test → warn（覆盖率 gap）；(2) **变更左移**——plan（CHANGE_IMPACT_FILE）含"变更影响范围"段（消费方反查/回滚预案/灰度策略/迁移兼容窗口）→ 缺则 fail；spec 含回滚预案声明 → 缺则 fail；数据库迁移脚本（若有）无破坏性 DDL（DROP TABLE/DROP COLUMN）→ 有则 warn； (3) **运维监控左移**——spec（OBSERVABILITY_FILE）含"可观测性约束"段（日志结构/metrics 埋点清单/trace 透传/告警阈值/健康检查端点）→ 缺则 warn；代码中 grep metrics/日志/trace 埋点存在（METRIC_ENDPOINTS 指定的埋点）→ 缺则 warn；健康检查端点（HEALTH_CHECK_URLS）可访问（HTTP 200）→ 不可访问 warn。防范"缺陷流入后段/变更爆炸半径失控/线上故障不可观测"
- 测试检查调用项目真实的测试命令
- **★swarm-yuan 自身的 .sh 脚本须兼容三平台**（macOS BSD bash 3.2 + Linux GNU bash 4+）：不用 declare -A / sed -i.bak+rm / grep -E（非 -P）/ date -u（非 -d）/ $(cd+pwd) 替代 readlink -f / wc|xargs / ${var} 防 C-locale。详见 `references/security-spec.md` §六

---

## 6. scripts 段（scripts/*）— 3 项

**文件：** 工具箱脚本与文档。

| 文件 | 材料项 | 内容 |
|------|--------|------|
| `precheck.sh` | §1 执行命令脚本 | 质量门禁检查（见 check 段，含 --review --reuse --deps --security --layer --stable-diff --link-depth --adr --contract --consistency-cross --impact --service --api --state --frontend --cognition） |
| `state-machine.sh` | ★comet 风格状态机 | 阶段状态持久化（init/get/set/transition/guard/next），survive compaction |
| `trace-log.sh` | ★全链路调用追踪（设计理念 2） | 节点级默认落盘 `.swarm-yuan/trace.jsonl`（--node/--actor/--tool/--status/--note；调用级细节设 `SWARM_YUAN_TRACE=verbose`；永不交互、落盘失败仅 warn 不阻塞） |
| `snippets.md` | §1 代码示例片段 + §3 组件详细参数配置说明 | 常用代码片段、命令示例、组件参数配置 |
| `code-graph-tools.md` | ★GitNexus+graphify 引用 | 代码图谱工具安装与命令（只引用，不复制源码） |
| `mcp-tools.md` | §2 MCP工具：DB/ELK/Redis/MQ/dubbo/union/CMDB | MCP 工具接入说明（按项目实际有的才填） |

**填充规则：**
- precheck.sh 是必选，含 `--review` + `--reuse` 子命令（引用 review-methodology.md + 拼装式开发原则）
- state-machine.sh 实现 comet 风格阶段状态机（init/get/set/transition/guard/next），状态存 `.swarm-yuan/state.yaml`
- trace-log.sh 是必选（模板内置，无需修改）：workflow 每节点第 ⑨ 要素引用它做调用公告 + trace.jsonl 落盘；`--verify-completeness` 机器校验每节点含「调用追踪」要素
- snippets.md 收录：高频命令组合、代码模板、组件参数配置表
- **code-graph-tools.md 引用 GitNexus/graphify**（见 `references/code-graph-tools.md`）：按项目语言生态选择，只写安装+命令+集成模式，**不复制工具源码**
- **mcp-tools.md 按项目实际填充**：项目有 DB/ELK/Redis/MQ → 填访问方式；无 → 写"本项目无外部 MCP 资源"
- 脚本必须 `chmod +x` 且 `bash -n` 语法检查通过
- 路径用绝对路径或基于脚本位置的相对路径，确保可移植

---

## 生成后核对清单

**机器验证四件套（跑命令即核，代替人工逐项）：**
- [ ] 1. 无占位符：`bash generate-skill.sh --verify-completeness <skill-dir> --strict`
- [ ] 2. 清单可信：`bash inventory-verify.sh <项目根> --skill-dir <skill-dir> --tsv --path-check --stability-audit`（HALLUCINATION=0）
- [ ] 3. 计数覆盖：同上命令中各维度 ratio ≥ 0.95 或有 FAIL 告警已处理
- [ ] 4. 状态门：`bash generate-skill.sh --mark-active <skill-dir>`（三关全过激活）

**P0 核心映射九项（人工目检，每项一行判断）：**
- [ ] 5. SKILL.md description 任务触发式（做什么+何时用）
- [ ] 6. 地图（reference-manual）条目含路径列且 stability 标注词在说明列
- [ ] 7. precheck.conf 核心变量已填（PROJECT_DIR/WRITABLE/TEST_CMD/BUILD_CMD）
- [ ] 8. hooks.json 两宿主整合（Claude Code 与 Codex，fail-gate/integrity-guard）
- [ ] 9. 编排约束含代码证据（dev-guide §8 或地图说明列）
- [ ] 10. 测试/构建命令真跑过一次
- [ ] 11. 特征卡 P0 六项承接（项目类型/可改范围/技术栈/构建命令/分支规范/安全规则）
- [ ] 12. AI 生成声明与决策记录（decisions.jsonl ≥1 条）
- [ ] 13. 任务配方结构齐全（recipes.md §A 功能编目 + §B 每配方五要素；lite 档豁免）

<details>
<summary>历史 96 项细目（按需展开自查——方法论参考，非 mark-active 前置）</summary>



生成目标技能后，用本清单逐项核对材料要素覆盖 + **特征卡 17 项承接（P0 强制 / P1 可增量）** + **拼装式开发 + 编排约束** + 方法论整合：

**★特征卡 P0 六项全覆盖（逐项核对，任何一项遗漏 = 未完成；P1 十一项 draft 期可「（P1 待补）」，--mark-active 前清零）：**
· 1.项目类型 → SKILL.md + codebase.md
· 2.可改范围 → SKILL.md（铁律）+ dev-guide.md + precheck.sh --scope
· 3.改造分类 → SKILL.md + dev-guide.md
· 4.技术栈摘要 → codebase.md
· 5.构建发布命令 → SKILL.md（命令速查）+ release.md + codebase.md（端口）
· 6.分支规范 → SKILL.md（铁律）+ branch-setup.sh + precheck.sh --branch
· 7.安全规则 → reference-manual.md §2 + precheck.sh --sensitive
· 8.文档约定 → workflow.md 节点②③ + spec-template.md + plan-template.md
· 9.测试体系 → reference-manual.md check §1 + precheck.sh --test
· 10.环境与外部资源 → env-setup.sh + codebase.md + mcp-tools.md
· 11.**可复用稳定单元** → reference-manual.md §4/5/6/9（签名/路径/用途/复用方式/稳定性标注）+ dev-guide.md §7（拼装式开发原则）+ spec-template.md（复用约束段）+ precheck.sh --reuse
· 12.数据规范 → reference-manual.md §8 + data-sample-template.md + precheck.sh --consistency
· 13.**五层认知基底** → reference-manual.md（认知映射表+六维动力学基线+逻辑谬误图谱+辩证映射表）+ spec-template.md（§14交付衰减/§15蓝图/§16偏差自检/§17辩证映射）+ precheck.sh --cognition（五层总分≥15/22）
· 14.**领域知识** → reference-manual.md（领域知识段：技术领域+业务领域+客观规律）+ spec-template.md（§18领域知识约束：领域识别+客观规律表+声明）+ precheck.sh --domain（spec §18存在性+reference-manual领域知识段+客观规律违规检测）
· 15.**编排调用关系及约束** → dev-guide.md §8（编排约束：导入方向/注册顺序/路由挂载/改造分类/状态所有权/测试边界，每条含代码证据）+ reference-manual.md §5.1（链路图约束注释）+ precheck.sh --layer/--frontend
· 16.**详尽组件库清单（全量）** → reference-manual.md §4（全量组件表，清单计数 ≥ find 计数 × 0.95）+ §6（全量端点表，每路由文件一张）+ §9（全量 store/类型表）

**★拼装式开发核对：**
· dev-guide.md §7 含拼装式开发原则（优先复用既有稳定单元；禁止重复造轮子/侵入式重构/破坏性改造）
· reference-manual.md §4/5/6/9 含可复用稳定单元清单（API接口/组件/类/函数/方法/store/类型定义，每个含签名/路径/用途/复用方式/稳定性标注）
· recipes.md §A 业务功能清单 + §B 任务配方五要素（standard/compliance 档；§D.6/§D.7 提取——拼装的"路线层"）
· spec-template.md 含复用约束段（复用的既有单元表 + 新增胶水代码表 + 拼装合规声明）
· precheck.sh 含 `--reuse` 子命令（检测重复造轮子 + 提示核对稳定单元清单）

**★编排约束核对（按项目形态动态）：**
· dev-guide.md §8 含编排约束段，**按 §D.0 形态选择约束类别**
· 前端项目：含导入方向/跨模块边界/注册顺序/feature-gate/路由挂载/状态所有权/测试边界
· 后端项目：含分层依赖方向/事务边界/DTO转换/中间件顺序/认证层/外部副作用隔离/测试边界
· 异步项目：含消费幂等/消息时序/重试DLQ/生产消费解耦
· 微服务项目：含服务调用方向/共享DB禁止/trace透传/熔断降级
· 每条约束标注代码证据（文件:行 或 grep 命令）
· reference-manual.md §5 按形态选链路模型（前端三层 / 后端请求管道+分层 / 异步消息流 / 微服务跨服务链）
· reference-manual.md §6 按接口形态全量（REST逐端点 / GraphQL逐resolver / gRPC逐method / MQ逐queue）

**★详尽组件库清单核对（防止样本化+维度错配）：**
· 先做 §D.0 项目形态判定，记录"本项目含以下维度：[...]"
· reference-manual.md §4 按判定的维度全量填充，每个维度独立计数核验
· 纯后端项目：§4 含 controller/service/repository/middleware/model 全量，无 UI 组件表
· 纯前端项目：§4 含 UI组件/store/composable 全量，无 controller/service 表
· 全栈项目：前端+后端维度都全量填充
· 不存在的维度标注"本项目无此维度"，不留空
· reference-manual.md §9 按形态填（前端store+类型 / 后端model+entity+DTO / 通用类型）
· 可用 `find` + `grep` 对每个维度独立核验计数

**★版本锁定核对：**
· codebase.md 含技术栈版本基线表（探查时的当前版本）
· spec-template.md 含版本约束声明段（本次变更是否涉及版本升级 + 理由 + 用户确认）
· precheck.sh 含 `--deps` 子命令（对比基线检测依赖版本变更）

**★安全规范核对：**
· reference-manual.md §2 含安全检查清单（OWASP Top 10：注入/XSS/CSRF/访问控制/身份认证/敏感数据/路径穿越/SSRF/依赖安全/安全配置/日志安全）
· dev-guide.md 含安全编码规范（参数化查询/输入校验/输出编码/路径校验/SSRF 防御/不安全反序列化禁止）
· precheck.sh 含 `--security` 子命令（检测 SQL 拼接/命令注入/eval/v-html/路径穿越/硬编码密钥/弱哈希/禁用 TLS/CORS */调试模式）
· 引用 `references/security-spec.md`

**★三平台兼容核对（swarm-yuan 自身脚本，非目标技能强制）：**
· swarm-yuan 的 .sh 脚本兼容 macOS(BSD bash 3.2)+Linux(GNU bash 4+)（不用 declare -A / sed -i.bak / grep -E / date -u / cd+pwd / wc|xargs / ${var}防C-locale）
· 无硬编码平台特定路径（用配置/env/相对路径）
· 文件名小写无特殊字符（Windows 兼容）
· 代码模板中路径用 / + path.join（Node）/ os.path.join（Python）

**★左移核对（Shift-Left）：**
· spec-template.md 含 §19 测试左移段（测试策略+用例骨架+边界/异常+左移声明）
· spec-template.md 含 §20 变更左移段（影响范围+回滚预案+迁移兼容+灰度策略）
· spec-template.md 含 §21 可观测性约束段（日志规范+metrics埋点+trace透传+健康检查+告警runbook）
· workflow 节点②（spec）标注"测试左移+运维左移"要求
· workflow 节点③（plan）标注"变更左移"要求
· workflow 节点⑤（编码）标注"先测试后实现（TDD/BDD）"要求
· workflow 节点⑦（合入）标注"确认回滚预案+迁移兼容"要求
· workflow 节点⑧（发布）标注"灰度+告警+runbook"要求
· dev-guide.md §9 含左移要求说明（测试/变更/运维左移三项的关系）
· precheck.sh 含 `--shift-left` 子命令（校验 §19/§20/§21 段 + test 先于 impl + 回滚预案 + 迁移兼容 + 埋点 + 健康检查）
· precheck.conf 含左移配置段（TEST_DESIGN_FILE/CHANGE_IMPACT_FILE/OBSERVABILITY_FILE/METRIC_ENDPOINTS/HEALTH_CHECK_URLS/MIGRATION_DIRS）

**★框架适配核对：**
· exploration-guide §D.0.5 框架探查层存在（从依赖清单+注解+配置文件识别框架）
· exploration-guide §D.1-FW 框架特定构件枚举段存在（按激活框架动态枚举）
· `references/frameworks/<fw>.md` 含探查到框架的领域规则集（六段式，探查到才激活；domain-knowledge.md 仅留通用领域速查——框架规则已迁移，见其"框架特定领域规则集（已迁移）"声明）
· precheck.conf 含框架适配配置段（ACTIVE_FRAMEWORKS/MYBATIS_MAPPER_DIRS/SQL_INJECTION_WHITELIST/LOMBOK_SRC_GLOBS/SHARDING_KEY_COLUMNS/SHARDED_TABLES/SPRING_BATCH_JOB_DIRS/JAVA_BUILD_FILES）
· precheck.sh `--security` 区分 MyBatis #{} vs ${}（#{} 安全跳过，${} 须白名单）
· precheck.sh `_sec_scan` 当 MYBATIS_MAPPER_DIRS 非空时追加 .xml include
· precheck.sh `_extract_deps` 支持 pom.xml/build.gradle（JVM 项目 --deps 门禁可用）
· precheck.conf DOMAIN_FORBIDDEN_IMPORTS 含 Java 框架 import（springframework/ibatis/mybatisplus/shardingsphere）
· precheck.conf LOG_CODE_PATTERNS 含 @Slf4j + log. 方法调用（Lombok 日志感知）
· dev-guide.md §10 含框架特定约束（按 ACTIVE_FRAMEWORKS 推导）

**★框架适配四要素核验（对应 SKILL.md Step 13 框架适配四要素核验）：**
· ① 构件枚举计数 ≥ 实际 × 0.95——对 ACTIVE_FRAMEWORKS 每个框架，按 `references/frameworks/<fw>.md` §2 的 `find`/`grep` 命令实跑，对比 reference-manual.md §4 框架特定构件表行数，偏差 >5% 须回 Step 4 框架深化补全
· ② framework-knowledge.md 规律数 ≥ 规则文件 frontmatter 声明的"深度门槛"且 100% 规律行含"证据:"字段（剔除的规律不计；"待验证"规律须有版本区间标注，缺失证据 → 回 Step 4 框架深化）
· ③ precheck.sh 含 `_fw_<id>_check` 动态分发器（模板内置，`declare -f _fw_<id>_<rule>` 派发），门禁片段位于 `assets/framework-gates/<fw>.sh` 且已注入到 `# >>> swarm-yuan:framework-gates >>>` ... `# <<< swarm-yuan:framework-gates <<<` 标记区块，`precheck.sh --framework <id>` 实跑 exit 0
· ④ dev-guide.md §10 含该框架约束段 ≥ 3 条（每条含代码证据：文件:行 或 grep 命令），约束数 <3 → 回 Step 4 框架深化补全

**材料要素覆盖：**
· **meta**：铁律、改造分类、流程总览（含入口顺序）、命令速查、门禁、检查表、**自成长段**（骨架内置固定指引，保留未删——感知/更新链/落基线四环齐全）
· **workflow 11 要素**：每节点都有 流程入口/参与方/准入/门禁/分支处理/产出物归档/流程控制/状态控制/★调用追踪（公告格式 + trace-log.sh 落盘命令）/★方法论引用（消费档互为反查路由表）；末尾有完成检查表
· **reference 9 项**：目录结构/安全检查/编译规则/组件库(全量)/组件依赖链路(三层+约束)/接口清单(全量端点)/UI-UX资源/数据字典/store+类型(全量)
· **assets 7 项**：环境加载/资源检测/分支拉取/任务配置模版/静态资源/库表样例/组件填充说明
· **check 4 项**：单测接口集成回归安全/业务规则案例/数据勾稽(无多漏错重)/UI脱敏日志
· **scripts 3 项**：执行脚本/代码片段+组件参数/MCP工具

**方法论整合（7 项）：**
· **Spec-driven（OpenSpec）**：workflow 节点②③用 proposal→spec(delta)→design→tasks 模式；spec/plan 模板用 OpenSpec 格式（delta ADDED/MODIFIED + SHALL/MUST + Scenario WHEN/THEN；tasks `- [ ]` checkbox）
· **Subagent-driven（superpowers）**：workflow 节点⑤引用 subagent-orchestration.md（orchestrator + 每任务新 subagent + 两阶段审查 + progress ledger + 文件交接）；**复杂变更用 Dynamic Workflows 并行扇出 + 交叉验证（降级：Task(subagent) 手动并行）**
· **State machine（comet）**：scripts/state-machine.sh 实现阶段状态持久化 + 阶段转换硬门禁；workflow 状态控制段引用它
· **Review（gstack/OCR）**：check 段含 5 审查维度 + 两遍清单 + AUTO-FIX/ASK + 严重度分级；precheck.sh --review；引用 review-methodology.md
· **Code-graph（GitNexus/graphify）**：references/code-graph-tools.md 引用工具命令（只引用不复制）；探查阶段先用图谱索引；组件依赖链路从图谱读
· **Phase-loop + capability（gsd-core）**：引用 gsd-patterns.md；check 用 goal-backward 对抗验证（任务完成≠目标达成，FORCE 立场，BLOCKER/WARNING 分类）；门禁分 4 类（pre-flight/revision/escalation/abort）；workflow 可选 wave 并行；**若装了 gsd-core 则调用 `/gsd-execute-phase`/`/gsd-verify`/`gsd-tools` 运行时引擎，若未装则降级为 state-machine.sh + subagent 手动编排**
· **Memory persistence（claude-mem）**：引用 memory-persistence.md；状态控制段说明跨会话记忆方案（state-machine.sh 管阶段 + progress ledger 管任务 + claude-mem 若装则管跨会话知识）；3 层渐进式检索

**★五层认知基底核对（第三+四+五层，见 SKILL.md 五层框架段 + references/cognition-framework.md）：**
· **第一层 认知递进**：reference-manual.md 含"认知映射表"段（六阶落点）+ "六维动力学基线"段；特征卡第 13 项已填；`--cognition` ①-⑥ 体检可运行
· **第二层 思维语言**：spec-template.md 含 §14 交付衰减分析 + §15 蓝图任务段；workflow 节点含七推理落点；spec §2 决策记录含思维模型对照列
· **第三层 认知辩证**：workflow 含 4-Phase 多轮交互 SOP（概念澄清→破局重构→七步推演→行动落地，每 Phase 暂停）；check 段含逻辑剃刀 6 步对抗审查（观点镜像/核心定调/病理诊断/降维反驳/建设性重构/灵魂拷问）；reference-manual.md 含"逻辑谬误图谱"段（四类谬误）；引用 references/logic-razor.md
· **第四层 偏差防范**：spec-template.md 含 §16 认知偏差自检段（五维偏差扫描表 + 思维模型对照表 + 自检声明 3 checkbox）；workflow 6 节点含偏差检查锚点；引用 references/cognitive-bias.md
· **第五层 辩证认知**：SKILL.md 含辩证认知框架段（本质与现象+7对辩证关系+矛盾分析法落点）；spec-template.md 含 §17 辩证映射分析段（主要矛盾+7对≥2对+辩证声明）；reference-manual.md 含"辩证映射表"段（7对辩证关系落点）；workflow 节点含矛盾识别（主要矛盾+矛盾主要方面）；引用 references/cognition-framework.md 第五层
· **`--cognition` 五层总分**：`bash precheck.sh --cognition` 输出五层认知基底总分 ≥15/22（第一层 14 + 第二层 3 + 第三层 2 + 第四层 2 + 第五层 1）
· **最小意识三条件**：M(门禁可运行) + H(state-machine+记忆) + A(认知体检+对抗验证) 三条件标注在 dev-guide.md

**质量：**
· 无占位符残留（`<待填充>`/`<项目根>` 等）
· 所有 .sh 通过 `bash -n`
· frontmatter description 含项目关键词
· **工具引用合规**：只引用 GitNexus/graphify/ocr/claude-mem/gsd-core 命令，无重新实现

---

## §X 自动门禁 vs AI 灵活性的边界

**背景**：针对"自动门禁/脚本扫描破坏 AI 灵活性"的专项评审——56 门禁按"自动信号 vs AI 判断"二分。

**分层结论（56 门禁）：**

| 档 | 数量 | 处置 | 理由 |
|----|------|------|------|
| strict | 20 | **不动** | 信号可信误报少（branch/layer/security/sensitive/authz/crypto/privacy/requirements/rtm/test_evidence/review_record/release_sign 等） |
| warn | 21 | **部分项经 `_ENFORCE_OVERRIDE` 降级 advisory（名单以 precheck.sh 数组为准）** | 误报高启发式强（stable_diff/knowledge/metrics）；diagram 的客观契约机械分支使本档 20→21 |
| advisory | 15 | **4 项 AI 自觉判断** | cognition/pr_quality/consistency/link_depth 本质是 AI 看语义（diagram 已升 warn，不在本档） |

**生成流程边界：**

自动脚本只做"出初稿"（模板/嗅探/枚举），AI 做"审 + 判断"。详见 references/generation-flow.md §H-C 表格。

**开关**：
- `GATE_AI_JUDGMENT`——保留为兼容别名；cognition/pr_quality/consistency/link_depth 恒走 AI 检查单（`_AI_JUDGMENT=1` 硬编码）
- `check_diagram` 不受该开关影响：客观契约机械查始终执行，主观质量检查单同时输出
- `DIAGRAM_ENFORCE=0`——图表结构检查降级为只警告不阻断（环境变量逃生口，不写入 conf）

**关联文档**：
- 评审报告：docs/design-evolution.md A9 档案
- 生成流程边界：`references/generation-flow.md` §H-C
- 门禁分层实现：`assets/precheck.sh` `_ENFORCE_OVERRIDE_K/V` + `assets/gates-advisory.sh` `_ai_hint`

</details>