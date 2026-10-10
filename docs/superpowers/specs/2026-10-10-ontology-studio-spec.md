# 本体工作台（Ontology Studio）——GB/T 48000.3 方法论产品化

- 日期：2026-10-10
- 分支：`feat/ontology-layer`（overlay 仓）
- 来源：DClusterAI《本体建模写进国家标准：GB/T 48000.3 解读与工程落地》（2026-09-28，mp.weixin.qq.com/s/S96QcNYnY14UJ-Dn9B69LA）及文中引用的标准族（GB/T 48000.1/.2/.4、GB/T 42131-2022、GB/T 45628-2025、GB/T 45256-2025）
- 一句话：把 SwarmStudio 的知识层从「文档」升级为「可校验的语义资产」——按国标五要素骨架建领域本体，SHACL 式约束做写入前数据契约，IRI+版本管理让语义变更可查询，JSON-LD/SHACL/Turtle 导出让外部机器可消费。

## 0. 二阶段（同日追加）：× 看板治理整合——让本体不"虚"

用户裁定：一阶段是手工字典，虚。二阶段把双向流打通：

1. **看板数据自动进本体**（ontology-ingest.ts）：tasks/assignee/task_links → Task/Agent/Board 实例 + assignedTo/belongsTo/dependsOn 关系；`kb:` 前缀批替换语义（幂等重跑，手工实例零交集）；taskRef=`<slug>#<tid>` 唯一键防重；写前校验剔除 error 实例（连带悬空边）进 skipped 呈现。REST：POST /ingest、GET /kanban-overview。
2. **Task.status 枚举对齐 upstream KanbanTaskStatus 九态**（triage/todo/scheduled/ready/running/blocked/review/done/archived）——摄取零映射损耗；曾误造 'doing' 值（真实状态机无此态），真数据冒烟咬出 'ready' 越枚举后修正。
3. **语义体检页签**（/app/board gov-ontology，TasksView 第 12 页签，orchestra 零 patch 先例）：本体统计卡 + 契约健康度 + 源概览 + 一键摄取（结果/零拦截徽标/skipped 明细）+ 全量违规表 + 跳本体工作台。文案=ontology/i18n.ts gov 节。
4. 真数据实绩：14 板 975 任务 38 执行人 2357 关系摄取、零剔除、健康度 0/0/0。

以下为一阶段正文。

## 1. 为什么做

文章诊断的失败模式恰是 SwarmStudio 知识层的现状：wiki 页面写得很全，但无法被任何程序消费，也就无法产生复利。群体协作场景里「语义巴别塔」直接变现：不同 agent/任务对 Task、Gate、边界、口径的理解不一致，就是过度交付与边界漂移的根因（over-delivery-boundaries 轮实证）。

国标方法论中**可复用的是骨架**（文章 5.1「抄骨架，别抄内容」）：

| 国标要求（GB/T 48000.3） | 本产品化 |
|---|---|
| 五要素：实体类型/数据属性/对象属性/公理/规则 | OntologySpec 模型 + 种子本体 |
| 对象属性必须声明 Domain/Range | ObjectProperty.domain/range 强制 + 写入拦截 |
| 公理三层（类/属性/关系） | 声明式约束（schema 字段级 + Axiom 跨字段级） |
| SHACL 约束验证（闭世界：缺了=不合规） | validateInstances：required 缺失即违规；error 级拒写（422） |
| 全球唯一 IRI + owl:versionIRI/priorVersion | namespace + 本地名；每次保存快照 + 版本链 + 回滚 |
| 扩展红线：不得破坏父类 Domain/Range | validateSpec：子类只能收窄不能放宽 |
| 应/宜/可 情态分级 | 每类型/属性/公理带 modality，映射校验 severity（shall→error/should→warning/may→info） |
| 内容与表述形式分离 | 实体类型 ↔ wiki 页面经 source.wikiPage 松挂接，不强绑 |

不适用的（如实登记）：全量 OWL DL 推理机、SPARQL 端点、Turtle 全量序列化语义——按文章第七节「什么时候不需要 OWL」，落地按需形式化，导出面向机器消费但不内嵌推理。

## 2. 后端（overlay/custom/server/ontology/）

存储：文件 JSON（board-graph/kg-version 同款），`env ONTOLOGY_DIR > ~/.hermes/semantica/ontology/`：
- `ontology.json`（spec 正本）、`instances.json`（实例正本）、`snapshots/`（spec 快照 + meta 边车，保留上限 50，tmp+rename 原子写）

### 2.1 模型（ontology-types.ts）

```
OntologySpec { id, namespace, version, versionIri, priorVersion?, label, entityTypes[], objectProperties[], axioms[], updatedAt }
EntityType   { id, label, labelEn?, description?, parent?, category?, modality, key?, disjointWith?, dataProperties[] }
DataProperty { id, label, datatype(string|number|integer|boolean|date|datetime|iri|json), required?, pattern?, enum?, min?, max?, modality }
ObjectProperty { id, label, domain[], range[], cardinality?{min?,max?}, inverseOf?, modality }
Axiom        { id, kind(class|property|relation), constraint, severity?, message, modality }
AxiomConstraint = disjoint{classes} | acyclic{property} | required-relation{onClass,property} | unique-key{onClass}
Instance     { id, iri?, type, label, data{}, relations[{property,target}], source?{wikiPage?,taskRef?}, updatedAt }
```

severity 缺省由 modality 推导（shall→error / should→warning / may→info），显式声明优先。

### 2.2 校验器（ontology-validate.ts）——本域核心

- `validateSpec(spec)→Violation[]`：IRI 全局唯一、domain/range 引用存在、parent 无环、disjoint 对称登记、inverseOf 成对、**扩展红线**（子类对父类已有属性的 enum/pattern/min/max 只能收窄；子类不得放宽父类 disjointWith）。
- `validateInstances(spec, instances)→Violation[]`：
  - 字段级（闭世界）：required 缺失即违规；datatype 不符；pattern/enum/min/max 越界。
  - 关系级：未知属性；Domain 违规（subject 类型 ∉ domain）；Range 违规（target 类型 ∉ range，含子类继承判定）；cardinality 超限；悬空 target。
  - 类级公理：disjoint 实例双属；acyclic（DFS 回边）；unique-key 重复；required-relation 缺失。
- Violation `{ severity, code, subject, path?, detail }`——code 稳定可编程消费。

### 2.3 种子本体（ontology-seed.ts）——SwarmStudio 领域

四类组织（照国标分组法），实体 16 类 / 对象属性 12 / 公理 6 起步：
- 协作主体：Agent、Role、Human、Squad
- 工作对象：Task、Deliverable、Gate、Patch、Repo
- 知识资产：WikiPage、Standard、Term、Metric
- 运行环境：Board、Session、Run

对象属性示例：Task—assignedTo→Agent（domain=[Task] range=[Agent，Human]）、Task—dependsOn→Task（acyclic 公理）、Deliverable—verifiedBy→Gate（required-relation 公理）、Agent—playsRole→Role、Patch—modifies→Repo、Run—executes→GraphSpec、WikiPage—documents→Standard、Task—produces→Deliverable、Squad—hasMember→Agent、Human—leads→Squad、Task—parentOf→Task、Standard—cites→Standard。
公理示例：Task ⊥ Agent 不相交；Task.estimate_days ≥ 0；Task.status 枚举 {todo,doing,blocked,done}；Deliverable 必须有 verifiedBy；dependsOn 无环；Task.key=id 唯一。

### 2.4 REST（ontology-controller.ts，prefix /api/hermes/ontology）

- GET /spec（+统计）；PUT /spec（validateSpec error=0 才落盘，版本+1+快照）
- POST /validate（全量实例跑批；或 body.instances 临时校验不入库）
- GET /instances?type=；POST /instances；PUT /instances/:id；DELETE /instances/:id
  - 写入即校验：error 级违规 → 422 + violations（数据契约=事前准入）；warning/info 放行并在响应中带回
- GET /export?format=jsonld|shacl|turtle
- GET /versions；POST /rollback（body.ts）
- POST /seed（重置为种子本体，super_admin 闸）
- 写闸：kg-evolution 同款 superAdminDenied（PUT spec/rollback/seed/delete）

### 2.5 导出（ontology-export.ts）

- JSON-LD：@context（本体 ns + rdfs/owl/xsd/sh 前缀）+ 类（rdfs:Class, rdfs:subClassOf, owl:disjointWith）+ 属性（owl:ObjectProperty/DatatypeProperty, rdfs:domain/range）+ owl:versionIRI/priorVersion + 实例图（prov-o.ts 直出先例）
- SHACL shapes（JSON-LD）：每个 EntityType → sh:NodeShape（sh:property：path/datatype/minCount/maxCount/in/pattern/minExclusive…；对象属性 → sh:class + 计数）；disjoint → sh:disjointWith；acyclic/required-relation 以 sh:annotation 自定义注记（如实标注「需应用侧求值」）
- Turtle：@prefix + 三元组文本（紧凑可读，面向人工核对/外部导入）

## 3. 接线 patch（590-server-ontology-routes.patch）

照 582 三 hunk 范式：bootstrap/routes.ts import（clusterInspector 之后）+ app.use 两行。能力正本全在 custom/server/ontology/，patch 只做接线。

## 4. 前端（overlay/custom/client/ontology/）

- 路由 /app/ontology（name ia2.ontology，fullscreen），features.ontology 门控（**默认开**，VITE_CUSTOM_ONTOLOGY=false 显式关——产品能力非实验特性，同 cockpit/ide 档）
- 导航：OntologyNavEntry（EvalNavEntry 同款自含模式）挂 FlowNavPanel（custom 文件，零 patch）
- 主视图 OntologyView 六页签：
  1. 概览（统计卡：类型/属性/公理/实例数 + 最近校验健康度 error/warning/info 计数 + 国标对照一句话）
  2. 模式（Schema）：实体类型列表 + 编辑抽屉（数据属性表/父类/modality）；对象属性表（domain/range 多选、基数）；公理列表
  3. 图谱（Graph）：@vue-flow——类节点（父类层级布局）+ 对象属性边（label=属性名，Domain→Range）
  4. 实例（Instances）：类型过滤 + 表格 + 新增/编辑（数据属性按 schema 生成表单 + 关系编辑）+ 单实例校验按钮
  5. 校验（Validate）：跑批 + 违规表（severity 徽标/subject/path/detail/跳转实例）；「写入即校验」说明文案
  6. 版本（Versions）：快照列表（ts/version/label/类型数）+ 回滚
  7. 导出（Export）：格式切换 + 预览 + 复制/下载
- i18n：独立 i18n.ts（eval 先例），不动 patch 473 locale 单一事实源面
- api.ts：服务端契约客户端镜像（刻意不跨包 import server 类型）

## 5. IDE 打通

mention-resolution.ts +ontology 第八源（@ontology:Task / @ontology 整册目录）——字面量约定式通道，代理按 AGENTS.md 受管块先读本体再作答（wiki 第七源同款）。MentionKind + PREFIX_KIND 各一行。

## 6. 测试与验证

- server：ontology-validate.test.ts（全维度：字段级/关系级/类级/扩展红线/闭世界/情态→severity）；ontology-export.test.ts（JSON-LD/SHACL 结构断言、IRI 唯一、versionIRI）；ontology-store.test.ts（往返/快照/回滚/版本链，env 指向 tmp）；ontology-controller.test.ts（REST 合约含 422 数据契约路径）
- client：mention-resolution 第八源用例更新；OntologyView 组件冒烟（tab 切换 + api mock）
- 走查：npm run dev (8649) + 内置浏览器 /app/ontology 六页签全过 + 违规路径实拍
- 收敛判据：新测试全绿 + 既有 576 测试文件无回归 + 走查零新缺陷

## 7. 边界（不做的，如实登记）

- 不做 OWL DL 推理、SPARQL 端点、pyshacl 内嵌（导出的 SHACL 文件可被外部 pyshacl 消费，本产品不自建推理机）
- 不硬拦 wiki 写入（本体校验是独立数据契约面；wiki 溯源缺失以 warning 呈现）
- 不做实例自动摄取（kanban/board KG 已有摄取管线，属另一域；经 source.taskRef 可手工挂接）
