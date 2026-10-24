# R11 · Palantir 理念映射调研：从"特征卡/门禁"到"本体论/谱系传播"的设计完善

- 调研角色：R11-Palantir 理念映射分析员（swarm-yuan 项目深度调研团队）
- 调研日期：2026-07-31
- 调研方法：Palantir 官方文档（`/docs/foundry/...` 树 + Architecture Center）+ Wikipedia 历史交叉核对 + 本仓库 `swarm-yuan/` 与 `docs/` 全文比对
- 证据规则：Palantir 侧事实性结论附 URL；本仓库侧结论附 `文件:行号`（2026-07-31 工作树实测）；无法验证处明确标注（见 §0.3 可信度声明）
- 目的：把 Palantir 的工程/产品理念作为"外部参照系"，审视 swarm-yuan 当前设计的盲区，产出**尊重复杂度负向预算（决策 26/27）**的完善建议——方法论吸收优先，不新增 `check_*` 门禁

> **前置声明**：本调研不主张 swarm-yuan "应成为 Palantir"。Palantir 是企业数据平台（数据/决策/操作），swarm-yuan 是 AI 研发范式元技能生成器（代码/认知/交付）——领域不同，理念不能整体搬运。本调研只提取**可迁移的结构性洞察**，并显式标注"不适用"的部分（§5）。

---

## 0. 总览

### 0.1 一句话结论

swarm-yuan 的"特征卡（立法）+ 门禁（执法）+ verifier（司法）"三权结构，与 Palantir 的"语义层（Objects/Links）+ 动能层（Actions/Functions）+ 安全传播（markings 沿谱系传播）"**结构性同构**——但 swarm-yuan 缺少 Palantir 最关键的一环：**标记沿调用链谱系传播**。稳定单元标注（稳定/不稳定/禁止改）是 file-glob 级别的静态属性，不沿调用链向下传播；下游组件触碰上游"禁止改"组件的依赖时，不会自动继承"禁止改"标记。这是本调研发现的首要可改进点，且可**以方法论吸收**（不新增门禁）落地。

### 0.2 对齐 vs 缺口速览

| Palantir 概念 | swarm-yuan 现状 | 对齐度 | 缺口 |
|--------------|----------------|--------|------|
| 本体论（语义+动能二分） | 特征卡（语义）+ 门禁（动能） | 结构同构，未显式命名 | 命名/分层未显式（§3.1） |
| Objects / Object Types | 详尽组件库清单（§C+.1）+ 特征卡第 16 项 | ✅ 高 | — |
| Links | 调用链路分析（§C+.2 按形态选模型） | ✅ 高 | 谱系不可查询（§4.6） |
| Actions（受治理、留痕） | 决策治理三级分类 + 四权分离 agent 拓扑 | ✅ 高 | 动作未绑定到组件标记（§4.3） |
| Functions（版本化业务逻辑） | 五层认知框架 + 框架规则集 | ✅ 中 | — |
| **markings 沿谱系传播** | 稳定单元标注（file-glob 级，不传播） | ❌ **核心缺口** | §4.1 |
| 谱系（列级/分支级/影响分析） | trace.jsonl（过程谱系）+ 调用链（静态图） | 部分 | 代码谱系不可查询（§4.6） |
| ABAC（属性驱动访问控制） | integrity-guard deny/advisory 模式 | 中 | 属性不沿谱系传播（§4.1） |
| Apollo（活环境/金丝雀/回滚） | --upgrade + .swarm-yuan-version | 低 | 技能级无金丝雀/回滚（§4.5） |
| FDE = 人工反向传播 | 生成器 forward-deploy 到每项目 | 部分 | 反向传播通道未形式化（§4.4） |
| 信任三柱（可解释/透明/严评估） | trace.jsonl + decisions.jsonl + verifier/v1 | ✅ 高 | — |
| AIP：AI 经本体论行动 | 决策治理 + 四权分离 | ✅ 高 | 动作未锚定组件模型（§4.3） |
| "世界不是软件"（拥抱混乱现实） | §C+.0 形态判定动态适配 | ✅ 高 | — |
| 集成债 > 技术债 | "知识债"概念（R1 理念 1） | ✅ 高 | — |

### 0.3 可信度声明

本调研引用的 Palantir 概念，可信度分级：

- **高（一手文档直引）**：本体论（Objects/Links/Actions/Functions 语义+动能二分）、安全模型（ABAC + Organizations + markings + "mandatory controls propagate along lineage"）、AIP（AI 经本体论行动）、信任三柱（可解释/透明/严评估）、FDE = "human equivalent of backpropagation"。来源：`palantir.com/docs/foundry/ontology/overview/`、`/docs/foundry/security/overview/`、`/docs/foundry/aip/overview/`、`/docs/foundry/architecture-center/overview/`。
- **中（二手一致描述，一手页面 JS 渲染空壳）**：Apollo 的 target/edge/rollback 机制；Gotham 的"building the airplane in flight"。Wikipedia + Architecture Center 间接佐证，但 Apollo 产品页本身未能抓取到正文。
- **低（无法一手验证）**："Software is eating the world but the world is not software" 作为 Palantir/Karp 原话**未能定位到一手出处**——前半句是 Andreessen 2011 WSJ 名言（可验证），后半句是"Palantir 风格"情绪，与 Palantir 公开立场一致但无法逐字溯源。本调研只引用其**实质**（运营现实比净室 SaaS 假设的更混乱），不引用其**措辞**。"decision intelligence"作为 Palantir 正式术语亦未能一手验证，按行业概念处理。

---

## 1. Palantir 核心理念速查（调研依据）

> 本节是后续映射的事实基础。每条附一手 URL；无法一手验证的明确标注。

### 1.1 本体论（Ontology）——语义+动能二分

Palantir 本体论是"组织的操作层"（an operational layer for the organization），把集成数据资产映射到现实世界对应物（设备/订单/交易）。关键是**两类原语**的显式区分（`/docs/foundry/ontology/overview/`）：

- **语义原语（名词）**：Objects（对象/对象类型，带主键/属性/展示元数据）、Properties、Links（类型化关系，免 ad-hoc join）。
- **动能原语（动词）**：Actions（受治理/受权限/留痕的状态变换单元，可回写源系统）、Functions（版本化业务逻辑，含规则/ML/优化器）、Dynamic Security。

> "the Ontology serves as a digital twin of the organization, containing both the semantic elements (objects, properties, links) and kinetic elements (actions, functions, dynamic security)."

Interfaces（多态）让共享形状的对象类型可统一处理。**Object-backed UI/actions**：工具直接消费对象而非查询结果，所以 UI/动作天然继承模型的安全与治理——"你建不出绕过安全的看板，因为看板读的是受治理的对象"。

### 1.2 谱系与 provenance（Foundry）

Data Lineage 应用追溯每个数据集如何产生、被什么产生、谁依赖它（`/docs/foundry/data-integration/`）。机械能力：交互式谱系图（节点着色/保存共享）、**分支级谱系**（dev 分支看差异）、**列级 provenance**（按列找数据集）、回滚（pipeline/dataset 双回滚）、**影响分析**（安全标记变更时显示下游受影响数据集）、诊断 REST API。

谱系是两个支柱的基座：(1) 安全传播（见 1.4），(2) AI 信任（AIP 的 "historical lineage in AI operations"）。

### 1.3 Apollo——活环境、金丝雀、回滚

Apollo 是 Foundry/AIP 之下的持续交付平台（`/docs/foundry/architecture-center/overview/`），"orchestrates tens of thousands of releases per week"，"every deployment is a living environment"。机械能力（中可信度）：target 化分发（金丝雀到子集）、edge/断网部署、自动+手动回滚、多环境/多基础设施抽象、单租户 SaaS 交付（每客户独立实例）。

### 1.4 安全模型——标记沿谱系传播（核心洞察）

> "Mandatory controls propagate along with each unit of data or resource type, via Palantir's sophisticated provenance and lineage capabilities."（`/docs/foundry/security/overview/`）

组成：ABAC（属性驱动授权，行/列级）+ Organizations（强制隔离舱）+ **Markings（need-to-know，强制）** + 沿谱系传播 + Restricted Views/Sensitive Data Scanner/Cipher/Project constraints。

**关键区分 RBAC**：RBAC 在应用边缘检查；Palantir 把安全做成**数据本身的属性**，沿计算传播。新建看板不会"忘记"加安全，因为看板读的对象自带标记。Ontology 的 "Multimodal, military-grade security controls" 覆盖"objects, links, actions, functions, and other semantic and kinetic primitives"。

### 1.5 AIP——AI 经本体论行动（而非自由形式）

AIP builder 工具（AIP Logic/Chatbot Studio/Evals）"enable the development of production-ready AI-powered workflows, agents, and functions **on top of the Ontology**"（`/docs/foundry/aip/overview/`）。Architecture Center：本体论"both humans and AI agents can wield"。

**核心教条**：AI 不对原始系统生成自由形式文本/SQL/代码；它对**类型化对象**经**已定义动作**提议操作。AI 的可达动作空间被本体论显式建模与授权的集合约束。后果：权限免费继承自 Actions、可审计免费（每动作是留痕的本体操作）、语义正确性（AI 不能发明实体/字段）、人工监督钩子（Actions 是天然审批边界）。人在环：AI 提议→人审批→低风险动作可在护栏内自动执行但必留审计轨迹。

### 1.6 信任三柱（AIP 专有框架）

> "for LLMs, trust comes from explainability and transparency, as well as from rigorous evaluations."（`/docs/foundry/aip/overview/`）

三柱：**可解释**（详细审计轨迹/解释/模型决策评估）、**透明**（治理工具维护问责制与历史谱系）、**严评估**（AIP Evals 评估 Logic functions 与 Ontology edits，跑实验，指标看板）。

### 1.7 FDE = 人工反向传播

Forward Deployed Engineering 是"the human equivalent of backpropagation, in which teams of engineers get as close as possible to a problem while working in concert with core engineering teams" to "relentlessly synthesize feedback and ship new features"（Architecture Center）。FDE（前线客户嵌入）与 core engineering（平台）的结构性分工：FDE 从运营现实产生信号，core 把可复用模式泛化回平台。

### 1.8 Gotham——"building the airplane in flight"

Gotham（2008，情报/国防）打破数据孤岛。头两年"continuously revised its technology based on the demands of analysts"——软件在运营环境内、对着真实任务被塑形，而非净室构建后发货。立论："computers alone using artificial intelligence could not defeat an adaptive adversary"——智能增强（human analysts 探索集成数据），而非纯 AI 自动化。

### 1.9 商业模式——build vs buy vs forward-deploy

Palantir 不收集/存储数据，只分析客户已有数据；单租户交付 + FDE 深度定制。这是 build（客户自建）与 buy（成品 SaaS）之间的**第三类**——买平台 + 买塑造它的工程力量。FDE/core 分工让客户特定定制随时间沉淀为平台特性（"每次 forward deployment 是更新共享核心的梯度步"）。

### 1.10 "世界不是软件"（实质可信，措辞不可溯源）

实质：运营现实是混乱的、物理的、制度的，不可还原为净室代码。本体论是"组织的数字孪生"连接"plants, equipment, products"等现实对应物；FDE"get as close as possible to a problem"；Wikipedia 称 Palantir 像"technical band-aid"——集成而不要求先修好底层架构。这些一手证据支撑该实质，即便逐字措辞无法定位。

---

## 2. swarm-yuan 现状的结构性定位（映射前的内部事实基线）

> 本节是 2026-07-31 工作树实测，作为 §3 映射的内部锚点。行号以当日为准。

### 2.1 已有的"语义/动能"二分（未显式命名）

swarm-yuan 现有结构其实已是语义/动能二分，只是用"立法/执法/司法"隐喻命名：

| Palantir 二分 | swarm-yuan 现有对应 | 证据 |
|--------------|--------------------|------|
| 语义层（Objects/Links） | 特征卡 17 项（项目认知 DNA）+ 详尽组件库清单（§C+.1）+ 调用链路分析（§C+.2）+ 编排约束（§C+.3） | `SKILL.md:80`、`exploration-guide.md:220-618`、特征卡第 15/16 项 |
| 动能层（Actions/Functions） | 54 门禁（check_*）+ 决策治理三级分类 + 四权分离 agent 拓扑 + 状态机 | `facts.conf:25`、`decision-governance.md`、`governance-agents.md` |
| Dynamic Security | integrity-guard（deny/advisory 两档）+ 门禁 enforce_level（strict/warn/advisory） | `facts.conf:112-114`、`governance-agents.md:97-104` |

`README.md:47` 现有措辞"特征卡是立法，门禁是执法，验证器是司法"——这是**立法/执法/司法三权**隐喻。Palantir 的**语义/动能**二分是更底层的结构性切分（描述"是什么"vs"能做什么"），与三权隐喻正交：语义层既可被立法（特征卡）也含执行依据（组件清单），动能层既含执法（门禁）也含司法（verifier）。两套隐喻可共存，但语义/动能切分目前**未被显式命名**，导致"组件清单（语义）"与"门禁规则（动能）"的耦合关系不清晰（见 §4.2）。

### 2.2 已有的"标记"（file-glob 级，不传播）

`exploration-guide.md:205`："稳定性标注：区分稳定层（推荐复用）/不稳定层（慎用）/禁止改层（禁止改）"。`--stable-diff` 门禁（`gates-strict.sh`）配置 `STABLE_GLOBS`（稳定层文件 glob），git diff 检测稳定层文件改动须在 spec MODIFIED 段声明+理由+迁移，否则 fail。

**关键事实**：稳定标注是**文件 glob 级别**的静态属性（`STABLE_GLOBS=src/domain/** src/repositories/**`），**不沿调用链向下传播**。若 `src/repositories/UserRepo`（禁止改）被 `src/services/UserService`（未标注）调用，`UserService` 不会被自动标记为"依赖禁止改单元"；改 `UserService` 不会触发 `--stable-diff`。这正是 Palantir "markings propagate along lineage" 所覆盖而 swarm-yuan 缺失的机制（§4.1）。

### 2.3 已有的"AI 经本体论行动"（过程级，未锚定组件模型）

决策治理（`decision-governance.md`）：Mechanical/Taste/UserChallenge 三级 + 五要素 + `decisions.jsonl` 留痕。四权分离（`governance-agents.md`）：policy-guardian（环境修改权审查）/action-executor（行动权）/self-reviewer（自评权）/verifier（评分建议权）。

**关键事实**：这套治理是**过程级**的（按决策类型/阶段/资产路径分类），**未锚定到组件模型的标记**。即"改组件 X"是 UserChallenge 还是 Mechanical，取决于 X 是否在受保护资产清单（`governance-agents.md:97-104`，precheck.conf/facts.conf/framework-gates/verifier/v1 等），**不取决于 X 的稳定性标注或 X 的上游依赖是否禁止改**。Palantir AIP 的动作授权是"对象标记驱动"的（改一个 `load-bearing` 对象的授权，继承自该对象的标记）；swarm-yuan 的动作授权是"资产路径驱动"的（改 precheck.conf 要 policy-guardian，改普通源码不要）。两者正交，swarm-yuan 缺前者（§4.3）。

### 2.4 已有的"谱系"（过程谱系强，代码谱系弱）

- **过程谱系（强）**：`trace-log.sh` → `trace.jsonl`（节点级+调用级双通道，`SKILL.md:78`）；`decisions.jsonl`（决策审计轨迹）；honest-edge provenance 三标 EXTRACTED/INFERRED/AMBIGUOUS（`runtime-update-2026-07.md:74`，graphify v0.9.27 吸收）。
- **代码谱系（弱/静态）**：§C+.2 调用链路分析在**生成时**产出一次静态依赖图（Mermaid 矩阵 + 挂载树），写入 `reference-manual.md §5`。**不可查询**——没有"如果改 X，下游什么会断"的查询接口；`--impact` 门禁是运行时变更影响检测（git diff 驱动），不是谱系图查询。`inventory-verify.sh` 是计数核验（清单计数 ≥ 枚举计数×0.95），不是影响分析。

### 2.5 已有的"FDE/反向传播"（forward 强，backprop 弱）

- **Forward deploy（强）**：生成器对每个项目 forward-deploy——`generate-skill.sh <name> <project-dir>` 在目标项目生成专属技能；`memory-writeback.sh` 三路写回 `.swarm-yuan/project-knowledge.md`/`.zcode/memories/`/claude-mem（`SKILL.md:106`）。这完全是 FDE 模式。
- **Backprop 到核心（弱/手工）**：每项目学到的教训回传到 swarm-yuan 核心模板的通道是**手工的**——`docs/research/R1-R9` 调研文档、`docs/paradigm-decisions.md` 决策记录、WP-* 批次提交。没有"从 N 个项目提取重复模式 → 自动建议核心模板更新"的形式化通道。

---

## 3. 对齐分析：swarm-yuan 已经"暗合"Palantir 的部分

### 3.1 语义/动能二分（结构同构，未显式命名）

swarm-yuan 的"特征卡+组件库+调用链"（语义：项目是什么）与"门禁+决策治理+四权分离"（动能：能对项目做什么）的二分，与 Palantir 语义/动能二分**结构性同构**。差异仅在命名：Palantir 显式叫 semantic/kinetic primitives，swarm-yuan 用立法/执法/司法隐喻（`README.md:47`）。

**对齐结论**：无需重构，可在叙事层补"语义/动能"命名（§4.2，方法论吸收，0 新门禁）。

### 3.2 详尽组件库 = Objects

§C+.1 全量穷举（按维度动态适配：前端UI/后端API/异步/桌面/移动/库/通用）+ Step 2 签名提取 + Step 3 计数核验（清单 ≥ 枚举×0.95），对应 Palantir Object Types（schema）+ Objects（实例）+ 主键/属性/展示元数据。特征卡第 16 项"详尽组件库清单"是 P0 必填（`exploration-guide.md:754`）。

**对齐结论**：✅ 高。swarm-yuan 的"形态判定→按维度枚举→签名提取→计数核验"四步甚至比 Palantir 文档描述的 Object Type 定义更机械可验证。

### 3.3 调用链路分析 = Links（按形态选模型）

§C+.2 按形态选链路模型（前端注册装配/后端请求管道/异步消息流/微服务跨服务链/桌面IPC/库导出图），对应 Palantir Links（类型化关系，免 ad-hoc join）。swarm-yuan 明确"链路不是模块A→B 骨架树"（`exploration-guide.md:449`），按形态追不同重点——这比通用"依赖图"更贴合运营现实（对应 Palantir "世界不是软件"）。

**对齐结论**：✅ 高。形态自适应是 swarm-yuan 的设计优势。

### 3.4 决策治理 + 四权分离 = AI 经本体论行动（过程级）

AIP 核心教条"AI 经类型化对象+已定义动作行动，可达动作空间被本体论约束"——swarm-yuan 的对应是：决策三级分类（Mechanical 直接做/Taste 给方案/UserChallenge 必停五要素）+ 四权分离（action-executor 只给 candidate_pass，verifier_status 由 external harness/hook/human 定，`governance-agents.md:68-72`）。`governance-agents.md:12-14` 明言"行动权/自评权/评分权/环境修改权必须分开……Agent 可以执行和提出候选结论，但不能自己修改评分器后宣布通过"——这正是 AIP"AI 提议、人审批、动作是天然审批边界"的工程化。

**对齐结论**：✅ 高（过程级）。缺口在动作未锚定组件标记（§4.3）。

### 3.5 信任三柱（可解释/透明/严评估）

| AIP 三柱 | swarm-yuan 对应 | 证据 |
|---------|----------------|------|
| 可解释（审计轨迹/解释） | trace.jsonl 双通道（stdout 公告+落盘）+ 每门禁 `=== 检查 ===` 横幅 + pass/warn 归因工具 + SARIF | `SKILL.md:78`、`design-philosophy-consistency.md:67` |
| 透明（问责+历史谱系） | decisions.jsonl（五要素+user_action+reversibility）+ claude-mem 跨会话回溯 | `decision-governance.md:88-144` |
| 严评估（Evals 评估 Ontology edits） | verifier/v1（fixture 双态+assertion 双层独立）+ self-check（数字漂移+运行时）+ inventory-verify（计数核验）+ 框架四要素核验 | `SKILL.md:125-127`、`governance-agents.md:218-224` |

**对齐结论**：✅ 高。AIP 的"evaluate Ontology edits"对应 swarm-yuan 的"verifier 评估技能提议的变更"——`governance-agents.md:218-224` verifier 验证命令集已落地。

### 3.6 "世界不是软件"（形态判定动态适配）

§C+.0 项目形态判定（`exploration-guide.md:228-243`）"不预设项目是前端/后端/全栈/移动/桌面/库……按探查到的文件类型/框架特征动态判定"，对应 Palantir"运营现实比净室假设更混乱"的立场。`paradigm-positioning.md:8` "重量是设计选择不是缺陷"与 Palantir"不假装 one-size-fits-all"同源。R9 五项目实测暴露 3 阻断 bug（`docs/research/R9`）正是"对着真实项目塑形"的实践。

**对齐结论**：✅ 高。

### 3.7 集成债 > 技术债（知识债概念）

Palantir 价值主张：集成债（数据孤岛/不一致/不可治理的累积成本）是真瓶颈，本体论是集成债偿还机制。swarm-yuan 等价概念是**知识债**——R1 理念 1（`docs/research/R1-self-design.md:12-16`）"AI 的代码生成能力已经很强，但项目认知还停留在零"；特征卡+组件库+调用链是知识债偿还机制。

**对齐结论**：✅ 高。swarm-yuan 已隐含"知识债"概念（R1），可显式命名强化（§4.2）。

---

## 4. 缺口分析：Palantir 照亮的盲区

> 按"可改进性×对范式可信度的影响"排序。每条标注预算影响（是否触决策 26/27）。

### 4.1 【首要缺口】标记沿调用链谱系传播

**Palantir 机制**：`/docs/foundry/security/overview/`——"Mandatory controls propagate along with each unit of data or resource type, via Palantir's sophisticated provenance and lineage capabilities." 标记是数据本身的属性，沿计算传播。新建看板不会"忘记"加安全，因为看板读的对象自带标记。

**swarm-yuan 现状**：稳定单元标注（稳定/不稳定/禁止改，`exploration-guide.md:205`）是 **file-glob 级**静态属性（`STABLE_GLOBS`）。`--stable-diff` 只检测"是否改了 STABLE_GLOBS 内文件"，**不检测"是否改了依赖 STABLE_GLOBS 文件的下游文件"**。

**具体缺口场景**：
```
src/repositories/UserRepo.java        ← STABLE_GLOBS，标注"禁止改"
src/services/UserService.java          ← 调用 UserRepo，未在 STABLE_GLOBS，无标注
src/controllers/UserController.java    ← 调用 UserService，无标注

现状：改 UserService 不触发 --stable-diff（UserService 不在 STABLE_GLOBS）
      → 但 UserService 改动可能破坏 UserRepo 的调用契约（如改了传给 UserRepo 的参数类型）
      → "禁止改"标记没有沿调用链传播到 UserService
```

**对范式可信度的影响**：高。`--stable-diff` 宣称"防范顺手改稳定单元签名/破坏聚合根/改 Repository 接口"（`template-spec.md:494`），但只能防"直接改 Repository"，防不了"改 Service 间接破坏 Repository 契约"。这是"标记是执法"宣称与实际行为的系统性落差——与决策 31（门禁分层）发现"36 门禁仅 2 fail"同性质的诚实化缺口。

**预算影响**：✅ 可方法论吸收，0 新门禁。方案见 §4.1.1。

#### 4.1.1 建议方案（方法论吸收）

**不新增 `check_*` 门禁**（守决策 26：门禁预算 54/54 满）。改为：

1. **扩展 `--stable-diff` 的语义**（改现有门禁，不加门禁数）：在现有"git diff 检测 STABLE_GLOBS 文件改动"基础上，追加"git diff 检测**调用 STABLE_GLOBS 文件的下游文件**改动"——利用 §C+.2 已产出的调用链路图（`reference-manual.md §5`），反查 diff 文件是否在 STABLE_GLOBS 文件的下游邻域（1 跳即可，避免图遍历爆炸）。下游文件改动不直接 fail，但 **warn** "该文件依赖禁止改单元 X，改动可能破坏其契约，须在 spec 声明"。
2. **特征卡第 11 项扩展"传播标注"**：稳定单元清单（特征卡第 11 项，`exploration-guide.md:814`）每条加"下游影响域"字段——列出直接调用该稳定单元的下游文件（1 跳），作为 `--stable-diff` warn 的数据源。这是特征卡填充指引变更，非新门禁。
3. **新增 G16 self-check 断言**（守决策 27：G<N> 断言不计入 54 预算）：断言 `reference-manual.md §5` 调用链路图含"下游影响域"标注的稳定单元占比 ≥ 阈值（渐进式，初设 warn-only）。

**预算核算**：门禁数 54 不变（扩展现有 `--stable-diff` 语义，不加 `check_*`）；conf 变量 +1（`STABLE_PROPAGATE_HOPS=1`，预算 169→170，余 30 槽）；G16 断言不计入 54。✅ 合规。

### 4.2 【次要缺口】语义/动能二分未显式命名

**Palantir 机制**：显式区分 semantic primitives（Objects/Links）与 kinetic primitives（Actions/Functions/Dynamic Security），让"项目是什么"与"能对项目做什么"分层清晰，每层继承下层治理。

**swarm-yuan 现状**：用立法/执法/司法三权隐喻（`README.md:47`）。三权隐喻描述**权力分立**（谁有权做什么），语义/动能描述**结构分层**（什么是什么）。两者正交但 swarm-yuan 只有前者命名，导致"组件清单（语义）"与"门禁规则（动能）"的耦合关系不清晰——例如特征卡第 11 项（稳定单元清单，语义）同时是 `--reuse`/`--stable-diff` 门禁（动能）的依据，但这层"语义→动能"继承关系未被显式表达。

**对范式可信度的影响**：中。是设计清晰度问题，非功能缺口。

**预算影响**：✅ 纯叙事吸收，0 新门禁，0 新变量。在 `cognition-framework.md` 或 `decision-governance.md` 补一节"语义层/动能层二分（Palantir 本体论映射）"，把现有结构重新命名（不改实现）。

### 4.3 【次要缺口】动作授权未锚定组件标记

**Palantir 机制**：AIP 动作授权是"对象标记驱动"——改一个 `load-bearing` 对象的授权，继承自该对象的标记；AI 的可达动作空间被本体论约束。

**swarm-yuan 现状**：动作授权（决策三级分类 + 四权分离）是"资产路径驱动"——改 `precheck.conf`/`facts.conf`/`framework-gates`/`verifier/v1` 要 policy-guardian（`governance-agents.md:97-104`），改普通源码不要。**不取决于组件的稳定性标注或上游依赖**。即"改 UserService（调用禁止改的 UserRepo）"与"改普通 util"在治理上无差别——都是 Mechanical/Taste，不因 UserService 依赖禁止改单元而升 UserChallenge。

**对范式可信度的影响**：中。`--stable-diff`（§4.1）防直接改稳定单元，但"改依赖稳定单元的下游"既不触发 `--stable-diff`（不在 STABLE_GLOBS），也不触发 UserChallenge（不在受保护资产清单）——存在治理盲区。

**预算影响**：✅ 可方法论吸收，0 新门禁。方案：决策治理 §2.2 升级规则补一条"组件标记驱动的升级"——AI 记录决策时，若拟改文件在某个"禁止改"稳定单元的下游影响域（§4.1.1 的 1 跳邻域），自动评 `costly` 可逆性（`decision-governance.md:46`），`cost_if_wrong` 字段须反映"可能破坏上游稳定单元契约"。这是决策治理文档+trace-log 字段变更，非新门禁。与 §4.1.1 的 `--stable-diff` warn 形成"门禁 warn + 决策升级"双通道。

### 4.4 【次要缺口】FDE 反向传播通道未形式化

**Palantir 机制**：FDE = "human equivalent of backpropagation"——每个 forward deployment 是更新共享核心的梯度步；FDE/core 分工让客户特定定制随时间沉淀为平台特性。

**swarm-yuan 现状**：Forward deploy 强（每项目生成专属技能 + memory-writeback 三路写回）；backprop 弱/手工——`docs/research/R1-R9` 调研、`docs/paradigm-decisions.md` 决策、WP-* 批次都是**人工**捕获的"从项目学到什么"。没有"从 N 个项目的 decisions.jsonl/trace.jsonl 提取重复模式 → 建议核心模板更新"的形式化通道。

**对范式可信度的影响**：中。R9 已暴露"5 项目清一色 Java/JS Web"的样本偏倚（`docs/research/R9` 末尾 R10 待测品类段，R9 已占 R10 编号），反向传播弱会加剧"核心模板只反映 Java/JS Web 品类"的偏倚。

**预算影响**：✅ 可方法论吸收，0 新门禁。方案：新增 `references/fde-backprop.md`（方法论引用层，非门禁），定义"反向传播纪律"——每 N 个 forward deploy 后，跑 `scripts/cost-report.sh` 聚合 decisions.jsonl/trace.jsonl，提取高频 UserChallenge/高频门禁 fail 模式，作为 WP-* 批次的输入。这是文档+现有脚本复用，非新门禁。

### 4.5 【低优先】技能级金丝雀/回滚（Apollo）

**Palantir 机制**：Apollo "every deployment is a living environment"，target 化金丝雀+回滚。

**swarm-yuan 现状**：`--upgrade` + `.swarm-yuan-version` 版本戳（`generate-skill.sh`），但无"新技能版本先金丝雀到子集任务，失败回滚到上一已知好版本"的机制。技能升级失败只能手工恢复。

**对范式可信度的影响**：低。技能是文档+脚本，回滚=git revert，成本可控；不像 Palantir 的生产数据系统需要金丝雀。

**预算影响**：⚠️ 不建议近期做。若做需新 conf 变量（`SKILL_CANARY_TARGETS`/`SKILL_ROLLBACK_VERSION`），占变量预算 2 槽（余 30→28，仍合规）。但收益低，建议列入 R12 待测项而非立即落地。

### 4.6 【低优先】代码谱系可查询（影响分析查询接口）

**Palantir 机制**：谱系是可查询图——"如果改 X，下游什么会断"是 lineage 视图的查询；列级 provenance；分支级谱系。

**swarm-yuan 现状**：§C+.2 调用链路分析在生成时产出**静态** Mermaid 图+矩阵，写入 `reference-manual.md §5`，**不可查询**。`--impact` 门禁是运行时 git diff 驱动的变更影响检测，不是谱系图查询。`inventory-verify.sh` 是计数核验，不是影响分析。

**对范式可信度的影响**：低-中。`--impact` 已覆盖运行时影响检测的主要场景；缺的是"假设性影响查询"（不实际改，先问"如果改 X 会影响什么"）。

**预算影响**：⚠️ 不建议近期做。可查询谱系图需要数据结构+查询引擎，是较大工程。建议作为 `graphify`/`gitnexus` 深度接线的扩展（已有 `graphify path`/`gitnexus trace` 调用，`exploration-guide.md:123-124`），而非 swarm-yuan 自建。列入 R12 待测项。

---

## 5. 不适用：Palantir 概念不应搬运的部分

### 5.1 Object-backed UI / 模型驱动 UI

Palantir UI 绑定对象类型而非查询结果。swarm-yuan 是技能生成器（文档+脚本+门禁），无 UI 层。**不适用**。

### 5.2 单租户 SaaS 交付 / Apollo 多环境分发

Palantir 单租户隔离是数据安全要求（每客户独立实例）。swarm-yuan 的"单租户"等价物是"每项目独立技能目录"（`<project>/.claude/skills/`），已天然实现，不需要 Apollo 级多环境分发基础设施。**不适用**。

### 5.3 情报/国防场景的 need-to-know 强制隔离

Palantir Organizations + markings 是为情报社区多密级数据隔离设计。swarm-yuan 面向研发场景，组件无密级概念（"禁止改"是稳定性而非保密性）。**标记传播机制可借鉴，但 Organizations/密级隔离不适用**。

### 5.4 "decision intelligence" 作为正式术语

未能一手验证为 Palantir 术语（§0.3）。swarm-yuan 已有"决策治理"命名（对齐 ISO/IEC 42001），不引入"decision intelligence"避免概念污染。

---

## 6. 完善建议（尊重复杂度负向预算）

### 6.1 优先级矩阵

| 建议 | 缺口 | 预算影响 | 优先级 | 落地方式 |
|------|------|---------|--------|---------|
| 标记沿调用链传播 | §4.1 | +1 conf 变量（170，余30）+ G16 断言（不计 54） | **P1** | 扩展 `--stable-diff` warn + 特征卡第 11 项加"下游影响域"字段 + G16 断言 |
| 语义/动能二分显式命名 | §4.2 | 0 | P2 | `cognition-framework.md` 补节（纯叙事） |
| 动作授权锚定组件标记 | §4.3 | 0（文档+字段） | P2 | `decision-governance.md` §2.2 补"组件标记驱动升级"规则 |
| FDE 反向传播形式化 | §4.4 | 0（文档+现有脚本） | P3 | 新增 `references/fde-backprop.md` |
| 技能级金丝雀/回滚 | §4.5 | +2 conf 变量（余28） | P4（R12） | 暂不落地，列 R12 待测 |
| 代码谱系可查询 | §4.6 | 大工程 | P4（R12） | 借 `graphify`/`gitnexus` 扩展，不自建 |

### 6.2 P1 方案细化：标记沿调用链传播

**目标**：让"禁止改"标记沿调用链向下传播 1 跳，使 `--stable-diff` 能 warn"改下游文件可能破坏上游稳定单元契约"。

**改动清单**（全部方法论吸收/现有门禁扩展，0 新 `check_*`）：

1. `assets/precheck.arch.conf`：新增 `STABLE_PROPAGATE_HOPS=1`（传播跳数，默认 1，0=关闭传播=现状）。conf 变量 169→170，预算 200 余 30。✅
2. `exploration-guide.md` §C+.3 + 特征卡第 11 项填充指引：稳定单元清单每条加"下游影响域"字段（列出直接调用该单元的下游文件，1 跳，从 §C+.2 调用链路图反查）。这是填充指引变更，非新门禁。
3. `gates-strict.sh` `check_stable_diff`：在现有"git diff 检测 STABLE_GLOBS 文件改动"后，追加"git diff 检测**在 STABLE_GLOBS 文件下游影响域内**的文件改动"——下游改动不 fail，warn "该文件依赖禁止改单元 X（@file:line），改动可能破坏其契约，须在 spec §MODIFIED 声明"。fail 计数不变（保持 strict 档 ≥3 fail 的判定，warn 不影响 enforce_level 归类）。
4. `scripts/self-check.sh` 新增 G16 断言：扫描 `reference-manual.md §5`，断言"含下游影响域标注的稳定单元占比 ≥ STABLE_PROPAGATE_COVERAGE 阈值"（初设 0=warn-only，全量达标后翻 1=fail，对齐 `FACT_MEASURE_METADATA_REQUIRED` 模式）。G<N> 断言不计入 FACT_GATES_TOTAL=54。✅
5. `facts.conf`：新增 `FACT_STABLE_PROPAGATE=1`（启用标志）+ `FACT_STABLE_PROPAGATE_HOPS=1`（默认跳数）。
6. `docs/paradigm-decisions.md`：追加决策 28"标记沿调用链传播（Palantir markings-propagate 映射）"，记录预算核算（54 不变，169→170，+G16）。

**预算核算总表**：

| 项 | 变更前 | 变更后 | 预算 | 余量 |
|----|--------|--------|------|------|
| FACT_GATES_TOTAL | 54 | 54（扩展 `--stable-diff` 语义，不加 `check_*`） | 54 | 0 |
| FACT_CONF_VARS | 169 | 170（+STABLE_PROPAGATE_HOPS） | 200 | 30 |
| G<N> 断言 | G15 | G16（不计入 54） | — | — |

✅ 全部合规决策 26（门禁预算）+ 决策 27（吸收优先于新增门禁）。

### 6.3 P2 方案细化：语义/动能二分显式命名 + 动作授权锚定组件标记

**纯文档变更，0 新门禁，0 新变量**：

1. `cognition-framework.md` 新增 §7"语义层/动能层二分（Palantir 本体论映射）"：
   - 语义层 = 特征卡 17 项 + 详尽组件库清单（§C+.1）+ 调用链路（§C+.2）+ 编排约束（§C+.3）
   - 动能层 = 54 门禁（check_*）+ 决策治理三级分类 + 四权分离 agent 拓扑 + 状态机
   - 继承关系：动能层规则继承自语义层（门禁依据来自特征卡，`README.md:107` 立法→执法映射表）
   - 与立法/执法/司法三权隐喻的关系：正交（三权描述权力分立，语义/动能描述结构分层）
2. `decision-governance.md` §2.2 升级规则补一条"组件标记驱动升级"：
   - AI 记录决策时，若拟改文件在某个"禁止改"稳定单元的下游影响域（§6.2 的 1 跳邻域），自动评 `costly` 可逆性
   - `cost_if_wrong` 字段须反映"可能破坏上游稳定单元契约"
   - 这不改变三级分类（Mechanical/Taste/UserChallenge），只在 `reversibility` 横切属性上体现（§2.4 已有 costly 评级，此处补"何时判 costly"的规则）

### 6.4 P3 方案细化：FDE 反向传播形式化

**纯文档+现有脚本复用，0 新门禁，0 新变量**：

1. 新增 `references/fde-backprop.md`（方法论引用层）：
   - 定义"反向传播纪律"：每 N 个 forward deploy 后（N 可配，建议 5），跑 `scripts/cost-report.sh` 聚合 N 个项目的 `decisions.jsonl`/`trace.jsonl`
   - 提取高频 UserChallenge 模式（如"依赖升级"占比 >30% → 核心模板补版本锁定纪律）
   - 提取高频门禁 fail 模式（如 `--reuse` fail 集中在某类组件 → 特征卡第 11 项填充指引补该类组件的稳定单元识别规则）
   - 产出"反向传播报告"作为 WP-* 批次的输入（人工审阅后落地，非自动改核心模板——守"AI 主导+用户决策"原则）
2. `SKILL.md` "它整合的方法论"表方法论引用层补一行：FDE-backprop（本仓库自创，借鉴 Palantir FDE=human backpropagation）。

---

## 7. 与现有决策的关系

### 7.1 与决策 26（复杂度负向预算）的关系

本调研全部建议**不突破门禁预算 54**（§6.2 扩展现有 `--stable-diff` 语义而非新增 `check_*`）。conf 变量 169→170 在预算 200 内（余 30）。G16 断言按决策 27 §4 不计入 54。✅

### 7.2 与决策 27（吸收优先于新增门禁）的关系

本调研是决策 27 纪律的**外部参照系应用**——Palantir 概念挖出的 6 缺口，全部以方法论吸收（文档/叙事/现有门禁扩展/G<N> 断言）落地，**0 新 `check_*` 门禁**。这验证了决策 27 的可操作性：外部理念催生的改进需求，可以被"吸收通道"消化而不破预算。

### 7.3 与决策 31（门禁分层 enforce_level）的关系

§4.1 的"标记沿调用链传播"扩展 `--stable-diff` 时，下游改动只 **warn** 不 fail——保持 `--stable-diff` 的 strict 档（≥3 fail）判定不变（warn 不增 fail 计数）。这与决策 31"advisory/warn/strict 横切分层"一致：传播违规是"风险提示"（warn 级），直接改稳定单元才是"硬执法"（strict 级）。

### 7.4 与决策 25（范式定位）的关系

本调研强化决策 25 的定位：swarm-yuan 与 Palantir 同属"重量级、重量是设计选择"的范式（`paradigm-positioning.md:8`）。Palantir 的重量来自本体论+谱系+ABAC；swarm-yuan 的重量来自特征卡+门禁+认知框架。两者都"不假装 one-size-fits-all"，都面向"值得先懂再动"的场景。本调研的缺口分析（§4）不是"swarm-yuan 不如 Palantir"，而是"Palantir 照亮了 swarm-yuan 可补的盲区"——补盲区是为强化范式可信度，非追平 Palantir。

---

## 8. R12 待测项

| 待测项 | 来源 | 验收点 |
|--------|------|--------|
| 标记传播的图遍历爆炸风险 | §4.1.1（1 跳邻域） | 大型项目（如 yudao-cloud 5564 java 文件，R9 样本）下，1 跳邻域反查的性能与误报率 |
| 技能级金丝雀/回滚的必要性 | §4.5 | 真实项目技能升级失败率统计（需先收集 N 次升级数据） |
| 代码谱系可查询的 ROI | §4.6 | `graphify path`/`gitnexus trace` 现有能力是否已覆盖"假设性影响查询"80% 场景 |
| FDE 反向传播的自动化程度 | §4.4 | `cost-report.sh` 聚合 N 项目数据的字段充分性（decisions.jsonl schema 是否够提取模式） |
| 非 Java/JS Web 品类的标记传播 | R9 R10 + §4.1 | C/Rust/Go 项目中"稳定单元"概念是否成立（C 无 class，稳定单元边界如何定） |

---

## 9. 结论

Palantir 理念作为外部参照系，照亮了 swarm-yuan 的一个首要缺口（**标记沿调用链谱系传播**，§4.1）与三个次要缺口（语义/动能命名 §4.2、动作授权锚定组件标记 §4.3、FDE 反向传播形式化 §4.4）。首要缺口可**以方法论吸收+现有门禁扩展+G16 断言**落地，**不突破门禁预算 54**（决策 26）与"吸收优先于新增门禁"纪律（决策 27）。

swarm-yuan 与 Palantir 的结构性同构（语义/动能二分、Objects/Links、AI 经本体论行动、信任三柱）是设计上的"暗合"——说明 swarm-yuan 的范式方向与 Palantir 的工程哲学在结构性层面一致，差异在领域（代码 vs 数据）与成熟度（标记传播尚未实现）。本调研的价值不是"把 swarm-yuan 改成 Palantir"，而是用 Palantir 的成熟实践**校验 swarm-yuan 的设计假设**、**照亮盲区**、**给吸收通道喂数据**——这正是 FDE = human backpropagation 在元层面的应用：把外部参照系的反馈反向传播回 swarm-yuan 核心。

---

## 附：Palantir 概念 → swarm-yuan 落点 速查表

| Palantir 概念 | 一手来源 | swarm-yuan 现有落点 | 对齐度 | 建议动作 |
|--------------|---------|--------------------|--------|---------|
| 本体论（语义+动能二分） | `/docs/foundry/ontology/overview/` | 特征卡+组件库（语义）+ 门禁+决策治理（动能） | 结构同构，未命名 | §4.2 显式命名 |
| Objects / Object Types | 同上 | §C+.1 详尽组件库 + 特征卡第 16 项 | ✅ 高 | — |
| Links | 同上 | §C+.2 调用链路（按形态选模型） | ✅ 高 | — |
| Actions（受治理/留痕） | 同上 | 决策治理三级分类 + 四权分离 | ✅ 高 | §4.3 锚定组件标记 |
| Functions（版本化逻辑） | 同上 | 五层认知框架 + 框架规则集 | ✅ 中 | — |
| **markings 沿谱系传播** | `/docs/foundry/security/overview/` | 稳定单元标注（file-glob 级，不传播） | ❌ 核心缺口 | §4.1 P1 优先 |
| 谱系（列级/分支级/影响分析） | `/docs/foundry/data-integration/` | trace.jsonl（过程）+ 调用链（静态图） | 部分 | §4.6 R11 |
| ABAC | `/docs/foundry/security/overview/` | integrity-guard deny/advisory | 中 | §4.1 传播后自然增强 |
| Apollo（活环境/金丝雀/回滚） | `/docs/foundry/architecture-center/overview/` | --upgrade + .swarm-yuan-version | 低 | §4.5 R11 |
| FDE = human backpropagation | 同上 | 生成器 forward-deploy + memory-writeback | 部分（backprop 弱） | §4.4 P3 |
| 信任三柱（可解释/透明/严评估） | `/docs/foundry/aip/overview/` | trace.jsonl + decisions.jsonl + verifier/v1 | ✅ 高 | — |
| AIP：AI 经本体论行动 | 同上 | 决策治理 + 四权分离 | ✅ 高 | §4.3 锚定组件标记 |
| "世界不是软件"（实质） | Architecture Center + Wikipedia | §C+.0 形态判定动态适配 | ✅ 高 | — |
| 集成债 > 技术债 | Architecture Center | 知识债概念（R1 理念 1） | ✅ 高 | §4.2 显式命名 |
| Object-backed UI | `/docs/foundry/ontology/overview/` | 无 UI 层 | 不适用 | §5.1 |
| 单租户 SaaS / Apollo 多环境 | Architecture Center | 每项目独立技能目录（天然单租户） | 不适用 | §5.2 |
| Organizations / 密级隔离 | `/docs/foundry/security/overview/` | 无密级概念 | 不适用 | §5.3 |
