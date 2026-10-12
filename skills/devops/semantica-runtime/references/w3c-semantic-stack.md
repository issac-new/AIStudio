# W3C 语义技术栈分工参照（收缩版）

> 来源：t_267c3479 调研融合（2026-09-25），3 篇微信文精读收缩。
> 原文锚点：research/_wechat6_20260925.json 索引 [2][3][6]；全文本地镜像 profile scratch wechat6_art2/3/6.md。
> 定位：**评估外部本体/语义层方案时的参照基准**，非本机实现规范。semantica 是轻量 KG runtime，不是 W3C 栈实现——本文件不构成对 semantica 的改造要求。

## 一、五标准分工表（[2]:23-70）

| 问题 | 标准 | 得到 | 不应期待 |
|------|------|------|---------|
| 怎样记录事实 | RDF | 可交换三元组（主语/谓语/宾语，IRI 身份） | 自动判断事实完整/正确 |
| 类层次与属性语义 | RDFS | subClassOf/subPropertyOf/domain/range，可推导类型 | 把缺字段当校验失败 |
| 等价/互斥/传递/基数 | OWL | 本体公理与推理结论（注意 OWA 开放世界+无 UNA） | 像表单一样强制字段存在 |
| 按条件取数 | SPARQL | SELECT/ASK/CONSTRUCT 查询结果 | 完整性证明；空结果≠不存在 |
| 数据满足约束吗 | SHACL | 通过/失败的验证报告（focus node/path/severity） | 推理结论；自动授权 |

成熟组合流水线（[2]:71）：RDF 交换事实 → RDFS/OWL 解释语义 → SHACL 检查约束 → SPARQL 面向业务取数。

## 二、四件事边界（[3]:19-23，核心命题）

**推得出结论（OWL）、查得到结果（SPARQL）、数据满足要求（SHACL）、动作获得授权（业务系统）是四件事，不能互相替代。**

案例（[3]:11-17）：工单 wo-2002 P1/Open 可被推理归高风险、被查询检出，但缺设备关联与创建时间——查询没报错、推理没停，派工却无法启动。缺字段要等校验检出，应用才决定暂停/退回/人工确认。

本机等价物映射（2026-09-25 实测，不建新机制）：
- 查询 → kanban --state/--dispatch（capability-ontology.py）
- 数据完备校验 → gap_risks 三态检出 + 验收门禁命令
- 缺字段暂停 → kanban_block(kind="capability")（capability-ladder §5 硬约束）
- 授权 → clearance_gate fail-closed（markings×clearances 合取判定）
- 补齐重验 → R0-R3 验证关「原任务验收命令重跑 exit=0」

## 三、常见混淆对照（[2]:195-223 + [3] 补充）

| 混淆 | 纠正 |
|------|------|
| RDF = 知识图谱 | RDF 只是图数据模型；无身份/来源/版本/质量治理仍只是交换数据 |
| domain/range = 字段校验 | 是类型推导：填错类型会被「推导为该类」而非拒绝（[3]:129-147） |
| OWL = 业务规则引擎 | 公理是模型论语义；审批/事务/权限归业务系统（[3]:211-239） |
| SPARQL 空结果 = 不存在 | 只是「给定数据集/图范围/权限/条件下无匹配」；OWA 下缺失=未知 |
| SHACL 通过 = 可以派工 | conforms=true 只说明满足所选 shapes，不蕴含权限（[3]:385-399） |
| 局部计数 = 全库唯一 | sh:maxCount 1 不保证跨对象唯一性（[3]:401-405） |
| 没有违规 = 检查过了 | 目标节点可能没被 shape 选中；测试要断言目标覆盖（[3]:391-399） |

## 四、运行态九要素（[6]:111，评估外部「Ontology Runtime」方案时的检查单）

Identity（跨系统跨时间身份连续）→ Fact（观测≠事实，候选事实经裁决转正）→ Event/State（State(t)+Event→State(t+1)）→ Rule/Function（判断可追溯规则版本，如 RiskRule v2.3）→ Action（执行归业务系统，本体管业务上下文）→ Version/Evidence/Permission/Change Propagation 横向贯穿（Semantic Change → Impact Analysis → Revalidation → Recomputation → State Update）。

边界原则（[6]:85-93）：Ontology Runtime 是业务语义协调层，**不是大一统平台**——数据平台/主数据/图谱/规则引擎/BPM 各司其职，本体负责让它们的结果能被放回同一个业务世界解释。

本机对应：存储层六源不动、查询层合一（capability-ontology.py 设计即此原则的实例）；状态迁移事件链为已登记 gap（见 gap_register platform 域），触发条件：reliability 快照无法解释降级原因的真实事故 ≥2 次。

## 五、版本锚

- 收缩自 3 篇微信文（2026-09-25 抓取）：[2] 全景图 5.8K / [3] 怎样工作 15.7K / [6] 企业本体运行 7.3K
- 标准版本时点（[3]:581-591，2026-09-10 核对）：RDF 1.1 / OWL 2 / SPARQL 1.1 / SHACL 1.1 成熟可用；RDF 1.2 Concepts 为 CR Snapshot，SPARQL 1.2 / SHACL 1.2 为 WD——草案不能写成已一致支持
