> **何时读我**：任何"该读哪个档 / 这能力从哪来 / 这运行时在哪被消费"的路由与对账问题。首行：# 文档索引（Capability Map）

# 文档索引（Capability Map）——references 吸收层整合清单

> **定位**：本表是吸收内容（references 全档 + 22 个上游运行时，档数以 `assets/facts.conf` 的 `FACT_REFERENCES` 为准）的**整合总清单**：每份文档登记 来源→证据分级→消费环节→何时读，由生成器自检的 G25 断言双向一致性校验（每份实存文档必须入账、账上不登记不存在的文档）。分工：SKILL.md 的参考文档路由表按族分组登记按需入口；本表登记**吸收来的文档**从哪来、在哪被用——层次互补，纪律同一条：无悬空（谁都有消费方）。**本表只在生成器仓维护，不随目标技能分发**（目标技能只收到 UNIVERSAL_FILES 清单里的子集）。
> **证据分级**：A=本机实测；B=官方一手直查；C=二手转述（未核验不进基线）。

## 一、整合视图：吸收物如何构成一个整体

吸收不是收藏：每档能力都归位在主循环（探查→生成→日常使用→指纹反馈）的某一环，缺了它那一环就弱。五类即循环的五段：

| 族 | 回答的问题 | 循环段 |
|----|-----------|--------|
| ① 生成主干 | 生成流程 怎么把仓库变成技能 | 探查/填充/生成（生成流程 Step 1-13） |
| ② 拼装与知识消费 | 开发工作流 ②⑤怎么先查再写、知识怎么读 | 日常开发段 |
| ③ 编排与治理 | 多 agent 怎么协作、纪律怎么守 | 开发全程 + hooks |
| ④ 验证与过程资产 | ⑥⑦怎么证、审计留什么痕 | 验证司法段 |
| ⑤ 安全合规与行业 | 门禁依据什么标准、行业怎么立法 | 门禁执法段 |

族内文档的互补关系在"触发"列可辨（如 memory-persistence 管跨会话记忆工具族 / knowledge-lifecycle 管项目知识四阶段协议 / context-engineering-layering 管规则放哪层——三者都关"知识"，粒度不同不重叠）。

**配套查询**：本表从**文档**查"它被谁用"；`task-methodology-router.md` §文档路由表从**任务**查"开工读什么"——一个任务要读什么，从那边查；一份文档被谁消费，从这里查。

## 二、references 整合总表（self-check G25 对账面）

### 族① 生成主干（生成流程）

| 档 | 来源（证据） | 消费节点 | 触发 |
|----|-------------|---------|------|
| exploration-guide | 内生 + semantica/graphify（A） | 生成流程 Step 2/Step 4 探查（含 §D.0.6/矛盾裁决） | 执行任何探查 |
| generation-flow | 内生 | 生成流程 Step 1-13 详解 | 生成流程逐步执行 |
| template-spec | 内生 + agent-skills 联动（A） | 生成流程 Step 7 填充六文件 | 填 spec/六文件 |
| agent-skills-methodology | addyosmani/agent-skills（B） | 生成流程 Step 7 + 开发工作流 ⑤ | 反借口/假设前置/Prove-It |
| context-engineering-layering | Vibe编码文章 + Anthropic 文档（B/C） | 生成器自身配置分层 | 决定规则放哪层 |
| task-methodology-router | tanweai/pua 改写（A） | 开发工作流 任务类型路由 | 任务类型判定 |
| cost-estimation-methodology | 人行科技司培训 + GB/T 42588（B） | spec §25 填充 | 规模/工作量估算 |
| domain-knowledge | 内生速查（A） | 生成流程 Step 4 + --domain 门禁 | 领域规律推导 |
| business-ontology-methodology | FIBO ONTOLOGY_GUIDE + 2026Q3 源码树（B，MIT） | 生成流程 Step 4/5 探查建模 + 开发工作流 ③ spec 领域段 | 业务领域建模、术语表、跨系统语义对齐 |
| code-graph-tools | GitNexus/graphify/codegraph 调研（A） | 生成流程 Step 3 图谱优先 | 图谱工具选型 |
| togaf-metamodel-methodology | TOGAF BDAT（B） | §D.0.6 四层视角 | 架构类变更探查 |
| frontend-design-methodology | pbakaus/impeccable（B） | 生成流程 Step 7 + 开发工作流 ⑤ 前端 | 前端设计任务 |
| diagram-production-methodology | cathrynlavery/diagram-design v2.6.120（A，MIT；版本真值=runtime/diagram-design/MANIFEST.md，facts.conf FACT_DIAGRAM_DESIGN_VERSION 对账） | 生成流程 Step 7 + 开发工作流 ③ spec/⑦ 审查/⑨ 发布 | 需要可发布架构/流程/时序/状态/ER/依赖/部署图 |

### 族② 拼装与知识消费（开发工作流 ②⑤）

| 档 | 来源（证据） | 消费节点 | 触发 |
|----|-------------|---------|------|
| lazy-generation-methodology | ponytail 蒸馏 + 行者明灵文章（B） | 开发工作流 ⑤ 编码七层下探 | 写新代码前找零件 |
| clean-code-metrics-methodology | unclebob/ub-mode（B，GitHub API 实测 4,858★） | 开发工作流 ⑤编码/⑥测试/⑦审查 | 写改代码与测试质量口径核对 |
| mattpocock-skills-methodology | mattpocock/skills v1.2.3（A） | 开发工作流 ①②③ + fix 任务路由 | 模糊需求访谈/spec 测试缝/任务纵切/诊断回路 |
| cordis-composability-methodology | DeepSeek Harness（B） | 机制设计参考 | 设计可组合机制 |
| knowledge-lifecycle-methodology | 京东海博文章 + OKF 核验（B） | 开发工作流 ② 读法 + 反馈回路三态 | 知识读取/更新处置 |
| memory-persistence | claude-mem/ruflo/ECC 工具族（A） | Step 12 记忆写回 + 溯源标记 | 跨会话记忆/蒸馏 |
| cognition-framework | 内生五层认知（A） | 生成流程 Step 3 认知六阶链 | 探查建模 |
| cognitive-bias | 内生 + Kahneman 框架（B） | spec §16 自检 | 方案偏差自检 |
| logic-razor | 内生（A） | 方案删冗余假设 | 思维语言推演 |
| four-theories-methodology | 工程控制论等四源（B） | 生成器自身设计决策 | 划边界/评估门禁/上下文预算 |
| mea-loop-methodology | AMAP LongHorizon-Harness（B） | 长任务规划 + 审计引用 | 长任务拆解 |

### 族③ 编排与治理（开发工作流 全程）

| 档 | 来源（证据） | 消费节点 | 触发 |
|----|-------------|---------|------|
| governance-agents | pua 四权分离 + §Z 五协议（A） | hooks/loop 治理拓扑 | 治理架构/交付纪律 |
| subagent-orchestration | superpowers/comet（A/B） | 开发工作流 ⑤ 复杂变更扇出 | subagent 编排 |
| gsd-patterns | gsd-core（A） | 计划验证/状态戳 | 计划/状态管理 |
| decision-governance | gsd-core + gstack（A/B） | UserChallenge 决策留痕 | 用户决策点 |
| dsh-engineering-methodology | DeepSeek Harness rc.8（B） | 审计/状态韧性设计 | 机制设计参考 |
| codex-methodology | openai/codex（B） | 执行纪律（缓存/截断） | 省 token/执行纪律 |
| claude-code-capabilities | claude-code releases 全量（B） | 宿主能力选型 | 查宿主原生能力 |
| mcp-governance | 内生（A） | .mcp.json 配置审计 | MCP 服务接入 |
| codex-security-methodology | openai/codex-security（A） | 安全扫描门禁整合 | 威胁建模/安全扫描 |
| controlled-language-methodology | ASD-STE100 规范思想 + 公文笔法 skill 调研档案（A，含改写保真基线测试） | 人面输出（回复/汇报/回归轮报告/审查意见）全程 | 任何面向人的文字落笔前 |

### 族④ 验证与过程资产（开发工作流 ⑥⑦⑧）

| 档 | 来源（证据） | 消费节点 | 触发 |
|----|-------------|---------|------|
| review-methodology | gstack review + cso（A） | ⑦ 独立审查 rubric | 代码审查执行 |
| canary-monitoring | check_canary 降档保留（A） | ⑨ 发布后监控（setup-loop --verify） | 发布后基线对比 |
| ai-process-records | GB/T 8566 扩展（B） | trace/decisions 留痕口径 | 审计/复盘/交接 |
| quality-management-standards | ISO 9001/CMMI 映射（B） | 认证过程资产引用 | 组织级标准对齐 |
| rsi-evidence-methodology | 清华 RSI 综述 + D2I-ai + 字节三论文（B） | 生成侧吸收轮收口验收 + 目标技能自成长链证据纪律（⑤⑦） | 改进/自进化系统的验收证据分层、升级已有技能 |
| bugfix-runbook | 内生（A） | 开发工作流 ②-⑥ fix 任务排障流水线（研发环境取证） | fix 任务连研发环境日志/数据库/远程断点取证 |
| remote-debug-jvm | 内生（A） | bugfix-runbook 第③步（JDWP 经隧道 + IDE attach + 断点纪律） | fix 任务需断点级取证 |

### 族⑤ 安全合规与行业立法（门禁）

| 档 | 来源（证据） | 消费节点 | 触发 |
|----|-------------|---------|------|
| security-spec | OWASP/STRIDE/CWE 综合（B） | --security 门禁依据 | 应用安全规范 |
| crypto-spec | GB/T 39786 等国标（B） | check_crypto 判定依据 | 密码学选型/密评 |
| cwe-database | CWE 视图 799（B） | cwe_audit 门禁 | 弱点分级查询 |
| security-certification-profiles | 等保/PCI-DSS 等（B） | cert_audit 门禁 | 认证合规映射 |
| standards-compliance | GB/T 25000 系列映射（B） | compliance 档核验 | 标准合规矩阵 |
| industry-profile-finance | 金融法规调研（B） | --industry 真实加载 | 金融项目立法 |
| industry-profile-gov | 政务法规调研（B） | --industry 真实加载 | 政务项目立法 |
| industry-profile-medical | 医疗法规调研（B） | --industry 真实加载 | 医疗项目立法 |
| industry-profile-telecom | 电信法规调研（B） | --industry 真实加载 | 电信项目立法 |
| industry-profile-automotive | 汽车法规调研（B） | --industry 真实加载 | 汽车项目立法 |
| industry-profile-energy | 能源法规调研（B） | --industry 真实加载 | 能源项目立法 |
| industry-profile-industrial | 工控法规调研（B） | --industry 真实加载 | 工控项目立法 |
| industry-profile-payment | 支付法规 + hermes pay-team（B/A） | --industry 真实加载 | 支付项目立法 |
| compliance-checkpoints | 执法检查底稿调研（B，法规引用核至条文号） | 开发工作流 ⑦ 审查 + 迎检自查路由 + inspection-ledger.sh 映射源 | 强监管交付/迎检准备/敏感数据与权限密钥变更 |
| regulatory-checkpoint-table | 执法检查底稿调研（B，主表 173 条经原文核实） | inspection-ledger.sh checklist/ledger 数据正本 | 需要执法检查条目级底稿 |
| fibo-financial-ontology | EDM Council FIBO `master_2026Q3`（B，MIT；提交 `2d73435`，2026-10-20 发布） | ③ spec 领域段 + ⑤ 编码命名/标识符校验 | 金融业务系统建模、术语消歧、LEI/ISIN 等标识符 |

## 三、运行时整合表（供给侧见 upstream-baseline 22 行；此为消费侧）

| 整合深度 | 运行时 | 消费点 | 降级链 |
|---------|--------|--------|--------|
| 深度×4 | GitNexus / graphify | 探查图谱优先（code-graph-tools 三选型，codegraph 为 watch 备选） | 未装→静态扫描清单 |
| 深度×4 | claude-mem | Step 12 记忆写回后端 + 知识门禁记忆检索（均经 memory-backends.sh 适配层注册，可替换后端） | 未装→local 项目本地落盘（.swarm-yuan/，探测到 .zcode/memories 时同步） |
| 深度×4 | ocr | ⑥ 测试验证 5 审查维度 | 未装→4 维 |
| CLI×6 | OpenSpec | 节点②③ spec proposal/tasks 格式 | 未装→自有 spec-template |
| CLI×6 | comet | 工作流骨架仪式/resume-probe | 未装→state-machine.sh |
| CLI×6 | gsd-core | 计划验证/STATE 戳模式 | 未装→tasks.md checkbox |
| CLI×6 | codex-security | 安全扫描门禁子进程 | 未装→grep 级安全模式 |
| CLI×6 | mattpocock-skills（物化型：runtime/mattpocock-skills/ 27 技能整镜像，非 command -v 型） | 生成器侧读技能原文执行：探查访谈（grilling/grill-with-docs）、领域建模（domain-modeling/codebase-design）、调研（research）、原型（prototype）、用户显式发起的 retro/handoff/triage/wayfinder/wizard 直调 | 仓内物化随 install.sh 装 8 宿主恒可达，无降级；目标技能侧不随技能分发→消费走 mattpocock-skills-methodology 机制改写 |
| CLI×6 | diagram-design（物化型：runtime/diagram-design/ 45 类型整镜像，非 command -v 型） | 生成器侧读技能原文执行：spec/设计文档/审查报告/发布说明的架构/流程/时序/状态/ER/依赖/部署图；目标技能侧 `scripts/diagram-check.sh` 做结构自检 | 仓内物化随 install.sh 装 8 宿主恒可达；PNG 导出需 Playwright，缺失降级 HTML/SVG；深检脚本不可达时只用内建结构检查并披露 |
| 方法论×5 | superpowers / gstack / ECC / Ruflo / impeccable | 编排/审查/记忆蒸馏/前端设计方法论引用 | 无运行时依赖（纯文档） |
| 机制源×7 | dsh / pua / semantica / ponytail / codegraph / pi / 文章源 | 已蒸馏为 references 各档（见上表来源列） | 同上 |

## 四、对账纪律（self-check G25 机器执法）

1. references/*.md（不含 frameworks/ 与本表自身）每个 basename 必须出现在本表——吸收必整合，未登记文档检查；
2. 本表提及的每个档名必须实存——清单不登记幽灵；
3. SKILL.md 参考文档路由表必须引用本表——路由表与清单两级互指。
4. 文档路由覆盖：`*-methodology.md` 每档必须可从 task-methodology-router.md §文档路由表到达（反向索引闭环：建档必整合、整合必可达）。
5. 消费节点真实性：本表"消费节点"列登记的触达点必须有真实证据（消费方文档正文引用 / 分发行+任务分派注入 / 门禁依据 / 按需加载机制 / 机制代码化）——本表登记行本身不算证据，G25 只对账存在性、不判真实性。吸收入库（含扩充既有档）前过两问：哪个环节缺这个、谁在什么场景消费它；答不上记轮台账即可，不入库。
