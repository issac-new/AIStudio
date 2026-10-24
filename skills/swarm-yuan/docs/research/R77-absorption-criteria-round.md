# R77 吸收判据制度化轮台账（R76 复盘与全面反思）

> 2026-09-30。任务（用户指令）：① 这篇文档的方法和技能有哪些可以完善进 swarm-yuan；② 记住教训并全面反思、复盘历史上所有调研和改进吸收是否存在同类或其他问题，并修正。
> 承接：R76 回退轮（v2.40.1，见 `R76-flow-orchestration-absorption.md`——已改写为教训档）。

## 一、全面复盘：46 档消费证据逐档核查

**核查方法**：① 文档面扫描——每档在消费方流程文档（SKILL.md/exploration-guide/template-spec/generation-flow/review-methodology/随发模板）中的正文引用 vs 仅 capability-map/router 登记；② 机器面扫描——scripts/assets/ci 侧消费（分发行/门禁依据/断言锁/代码注释）；③ 嫌疑档逐个深挖定性（头部定位声明+机制化证据）。

**结论：无一档需要回退**。历史吸收各有真实消费形态，按形态归类：

| 消费形态 | 档（例） | 证据 |
|---|---|---|
| 机制代码化 | dsh-engineering-methodology | project-fingerprint.sh 顶层目录分组 cksum 代码注释直接引用其 §3.2（R12 机制真实落地） |
| 分发行+任务分派注入 | knowledge-lifecycle / codex-methodology / mea-loop / ai-process-records / cordis-composability | generate-skill.sh UNIVERSAL_FILES 分发行各带用途注释 + workflow 模板按任务类型注入"⑩ 方法论引用" |
| 门禁依据 | crypto-spec / cwe-database / security-certification-profiles / canary-monitoring | gates-warn/gates-advisory 消费（check_crypto/cwe_audit/cert_audit；canary 为门禁降级后的脚本使用文档，setup-loop --verify 承载） |
| 按需加载机制 | 行业八档 | `--industry` 真实加载 + tests/run-industry-profile.sh（R26 产品定位：领域立法） |
| 存在性断言锁 | context-engineering-layering | self-check G14 吸收载体断言（存在+SKILL.md 引用） |
| 维护者设计参考 | four-theories-methodology | 头部"何时读我"列六个具体场景（划边界/上下文预算/门禁设计/修复环诊断等）——方法论非领域知识，消费主体是维护会话 |
| 认证过程资产 | quality-management-standards | 头部边界声明先读："只做概念映射，供认证时引用，不提供专属门禁"——定位诚实 |
| 流程正文消费 | 其余多数档 | SKILL.md 第四层流程表/exploration-guide/template-spec 正文引用 |

**R76 是唯一无消费设计的吸收**：登记的"探查关注点/门禁联动"是编造的形式成立。历史轮没犯此错的原因是各自有先例纪律兜着（R37"机制不进表"、R49"机制化接线"、方法论吸收口径），R76 以"扩充既有档"的轻动作形态绕过了所有既有纪律——**判据本身从未成文**是结构性缺口。

## 二、文章方法甄别：哪些能进 skill（按决策 46 两问判）

六条论证方法逐一过两问：

| 方法 | 两问判定 | 处置 |
|---|---|---|
| 被什么击穿（阶段划界） | ✅ spec §2 决策记录缺选型论证质量要求；每次含选型的 spec 填充/评审触达 | **机制化为三问之一** |
| 高手反例=本质清单 | ✅ 同上 | **机制化为三问之一** |
| 相反决策同逻辑（给决策变量） | ✅ 同上（防"我选 A 因为 A 好"式论证） | **机制化为三问之一** |
| 体感先行 | ❌ 论证写作方法，swarm-yuan 无消费环节 | 记 R76 台账 §四（用户级 gongwen-bifa 领域，不动用户的 skill） |
| 场景化痛点×机理解 | ❌ 同上（spec §1 背景已有价值声明要求，不重复造） | 同上 |
| 两份实物对比+缺席清单 | ❌ 属深度技术论证写法，需求交付流程无此环节 | 同上 |

**落点**：`assets/spec-template.md` §2 决策记录加"技术选型三问"块（填表前先答，答案进"理由"列）+ `references/template-spec.md` assets 段表格行同步（模板与指引双向同步，R59 纪律）。方法以**流程问句**形态存在——每次填 spec 都会经过，不是知识段落入库。

## 三、修正清单（本轮落地）

1. **决策 46（docs/design-evolution.md）**：吸收判据两问（入库前必答：哪个环节缺这个/谁在什么场景消费它，登记行不算证据）+ 文章源两层分离（内容层默认不吸收、方法层机制化）+ 执行纪律与判断关系澄清（绿≠对）。
2. **capability-map.md 对账纪律第 5 条**：消费节点真实性口径——G25 只锁存在性、真实性由判据守。
3. **spec-template.md §2 + template-spec.md 同步**：技术选型三问（R76 文章方法 1/5/6 的机制化）。
4. **R76 台账**：已改写为教训档（含方法六条完整提炼与用法）。

**未发现需回退的历史档**（§一结论）；无需用户拍板的重大项。

## 四、验证

test-r77-absorption-criteria.sh 锚锁 + run-sweep 全量，见 CHANGELOG v2.41.0 发布记录。
