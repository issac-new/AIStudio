/**
 * SwarmStudio 领域种子本体（GB/T 48000.3 方法论产品化）。
 *
 * 国标 5.1 边界：它规范的是「标准领域」本体，领域实体类型清单必须自己扩展——
 * 「抄骨架，别抄内容」。本种子按国标四类组织法（协作主体/工作对象/知识资产/
 * 运行环境）给出 SwarmStudio 群体协作域的起步骨架：16 实体类型 + 12 对象属性
 * + 6 公理；每类型/属性/公理带应/宜/可情态分级。
 *
 * 关系语义取自仓内真实协作面：Task/Board=看板面，Agent/Role/Squad=五角色边界
 * 单一事实源（over-delivery 轮），Patch/Repo=overlay 补丁面，Gate=交付门禁，
 * WikiPage=知识层（内容与表述形式分离——documents 关系挂接）。
 * 种子实例 2 条：把催生本特性的国标本身登记为 Standard 实例（开箱即可校验走通）。
 */
import { versionIriOf, type OntologyInstance, type OntologySpec } from './ontology-types'

export const SEED_NAMESPACE = 'https://swarm.studio/ns/core#'

export function seedSpec(now = Date.now()): OntologySpec {
  const spec: OntologySpec = {
    id: 'swarm-core',
    namespace: SEED_NAMESPACE,
    version: 1,
    versionIri: versionIriOf(SEED_NAMESPACE, 1),
    label: 'SwarmStudio 群体协作核心本体（种子）',
    entityTypes: [
      // —— 协作主体 ——
      {
        id: 'Agent', label: '智能体', labelEn: 'Agent', category: '协作主体', modality: 'shall', key: 'name',
        disjointWith: ['Task'],
        description: '参与协作的 AI 代理（人类协作方见 Human；两者经 playsRole 承担 Role）',
        dataProperties: [
          { id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' },
          { id: 'model', label: '模型', datatype: 'string', modality: 'should' },
          { id: 'provider', label: '提供方', datatype: 'string', modality: 'may' },
          { id: 'description', label: '说明', datatype: 'string', modality: 'may' },
        ],
      },
      {
        id: 'Human', label: '人类协作者', labelEn: 'Human', category: '协作主体', modality: 'shall', key: 'name',
        description: '参与协作的人（评审/裁决/领导职责的承担者）',
        dataProperties: [
          { id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' },
          { id: 'role_title', label: '职务', datatype: 'string', modality: 'may' },
        ],
      },
      {
        id: 'Role', label: '角色', labelEn: 'Role', category: '协作主体', modality: 'shall', key: 'name',
        description: '五角色边界单一事实源（over-delivery 轮：角色边界声明是防过度交付的语义闸）',
        dataProperties: [
          { id: 'name', label: '角色名', datatype: 'string', required: true, modality: 'shall' },
          { id: 'scope', label: '职责范围', datatype: 'string', required: true, modality: 'shall' },
          { id: 'boundaries', label: '边界（明确不做的事）', datatype: 'string', modality: 'should' },
        ],
      },
      {
        id: 'Squad', label: '小队', labelEn: 'Squad', category: '协作主体', modality: 'may', key: 'name',
        description: '多 agent/人组成的协作单元（派发与容量分析的基本单位）',
        dataProperties: [
          { id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' },
          { id: 'policy', label: '派发策略', datatype: 'string', modality: 'may' },
        ],
      },
      // —— 工作对象 ——
      {
        id: 'Task', label: '任务', labelEn: 'Task', category: '工作对象', modality: 'shall', key: 'taskRef',
        disjointWith: ['Agent'],
        description: '看板任务（estimate_days/parents/children 等字段与 kanban 快道对齐；状态枚举=upstream KanbanTaskStatus 九态原样对齐——摄取零映射损耗）',
        dataProperties: [
          { id: 'title', label: '标题', datatype: 'string', required: true, modality: 'shall' },
          { id: 'status', label: '状态', datatype: 'string', required: true, enum: ['triage', 'todo', 'scheduled', 'ready', 'running', 'blocked', 'review', 'done', 'archived'], modality: 'shall' },
          { id: 'estimate_days', label: '人日估算', datatype: 'number', min: 0, modality: 'should' },
          { id: 'taskRef', label: '看板任务号', datatype: 'string', modality: 'should', description: 'kanban 任务 id（溯源挂接；同号任务唯一）' },
          { id: 'description', label: '说明', datatype: 'string', modality: 'may' },
        ],
      },
      {
        id: 'Deliverable', label: '交付物', labelEn: 'Deliverable', category: '工作对象', modality: 'shall', key: 'path',
        description: '任务的产物（代码/文档/报告）；须经验收门禁（verifiedBy 公理）',
        dataProperties: [
          { id: 'path', label: '路径', datatype: 'string', required: true, modality: 'shall' },
          { id: 'kind', label: '种类', datatype: 'string', enum: ['code', 'doc', 'report', 'test'], modality: 'should' },
          { id: 'description', label: '说明', datatype: 'string', modality: 'may' },
        ],
      },
      {
        id: 'Gate', label: '验收门禁', labelEn: 'Gate', category: '工作对象', modality: 'shall', key: 'name',
        description: '交付验收闸（命令/评审/走查），severity 对齐校验严重度档',
        dataProperties: [
          { id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' },
          { id: 'command', label: '门禁命令', datatype: 'string', modality: 'should' },
          { id: 'severity', label: '严重度', datatype: 'string', enum: ['error', 'warning', 'info'], modality: 'should' },
        ],
      },
      {
        id: 'Patch', label: '补丁', labelEn: 'Patch', category: '工作对象', modality: 'should', key: 'series_id',
        description: 'overlay 对 upstream 的注入补丁（series 单一事实源）',
        dataProperties: [
          { id: 'series_id', label: 'series 编号', datatype: 'string', required: true, modality: 'shall', description: '如 "590"' },
          { id: 'target', label: '目标仓', datatype: 'string', enum: ['hermes-studio', 'hermes-agent'], modality: 'should' },
          { id: 'description', label: '用途', datatype: 'string', modality: 'may' },
        ],
      },
      {
        id: 'Repo', label: '仓库', labelEn: 'Repo', category: '工作对象', modality: 'shall', key: 'path',
        description: '协作涉及的代码仓（overlay 本体 / upstream 只读 / 独立仓）',
        dataProperties: [
          { id: 'path', label: '路径', datatype: 'string', required: true, modality: 'shall' },
          { id: 'role', label: '角色', datatype: 'string', enum: ['overlay', 'upstream', 'standalone'], modality: 'should' },
          { id: 'upstream_version', label: '上游版本', datatype: 'string', modality: 'may' },
        ],
      },
      // —— 知识资产 ——
      {
        id: 'WikiPage', label: '知识页', labelEn: 'WikiPage', category: '知识资产', modality: 'should', key: 'path',
        description: 'docs/wiki 知识页——本体的表述形式层（内容与形式分离：documents 关系挂接语义实体）',
        dataProperties: [
          { id: 'path', label: '页面路径', datatype: 'string', required: true, modality: 'shall' },
          { id: 'title', label: '标题', datatype: 'string', modality: 'should' },
          { id: 'updated_at', label: '更新日期', datatype: 'date', modality: 'should' },
        ],
      },
      {
        id: 'Standard', label: '标准', labelEn: 'Standard', category: '知识资产', modality: 'may', key: 'number',
        description: '外部标准/规范（本工作台方法论来源 GB/T 48000.3 即其实例）',
        dataProperties: [
          { id: 'number', label: '标准号', datatype: 'string', required: true, modality: 'shall', pattern: '^[A-Z]{2}(?:/[A-Z]+)?\\s?[A-Z]?\\s?\\d+(?:\\.\\d+)?(?:-\\d{4})?$', description: '如 GB/T 48000.3-2026' },
          { id: 'title', label: '标题', datatype: 'string', required: true, modality: 'shall' },
          { id: 'status', label: '状态', datatype: 'string', enum: ['draft', 'published', 'effective'], modality: 'should' },
          { id: 'effective_date', label: '实施日期', datatype: 'date', modality: 'may' },
        ],
      },
      {
        id: 'Term', label: '术语', labelEn: 'Term', category: '知识资产', modality: 'should', key: 'zh',
        description: '领域术语（跨系统同一词同一义——语义巴别塔的对照锚点）',
        dataProperties: [
          { id: 'zh', label: '中文', datatype: 'string', required: true, modality: 'shall' },
          { id: 'en', label: '英文', datatype: 'string', modality: 'should' },
          { id: 'definition', label: '定义', datatype: 'string', required: true, modality: 'shall' },
        ],
      },
      {
        id: 'Metric', label: '指标', labelEn: 'Metric', category: '知识资产', modality: 'may', key: 'name',
        description: '量化指标（caliber=口径定义必填——同一 GMV 四种算法的根治位）',
        dataProperties: [
          { id: 'name', label: '名称', datatype: 'string', required: true, modality: 'shall' },
          { id: 'caliber', label: '口径定义', datatype: 'string', required: true, modality: 'shall' },
          { id: 'unit', label: '单位', datatype: 'string', modality: 'may' },
          { id: 'owner', label: '口径责任人', datatype: 'string', modality: 'may' },
        ],
      },
      // —— 运行环境 ——
      {
        id: 'Board', label: '看板', labelEn: 'Board', category: '运行环境', modality: 'shall', key: 'slug',
        dataProperties: [
          { id: 'slug', label: '标识', datatype: 'string', required: true, modality: 'shall' },
          { id: 'title', label: '标题', datatype: 'string', modality: 'should' },
        ],
      },
      {
        id: 'Session', label: '会话', labelEn: 'Session', category: '运行环境', modality: 'should', key: 'session_id',
        dataProperties: [
          { id: 'session_id', label: '会话号', datatype: 'string', required: true, modality: 'shall' },
          { id: 'topic', label: '主题', datatype: 'string', modality: 'may' },
          { id: 'started_at', label: '开始时间', datatype: 'datetime', modality: 'should' },
        ],
      },
      {
        id: 'Run', label: '运行', labelEn: 'Run', category: '运行环境', modality: 'may', key: 'run_id',
        description: '一次推演/执行（run13/run14 等全流程推演的语义锚点；graph_id=图执行面清单）',
        dataProperties: [
          { id: 'run_id', label: '运行号', datatype: 'string', required: true, modality: 'shall' },
          { id: 'status', label: '状态', datatype: 'string', enum: ['running', 'done', 'failed'], modality: 'should' },
          { id: 'graph_id', label: '图标识', datatype: 'string', modality: 'may', description: 'loop-graph 事件日志的 graphId（摄取面带出）' },
          { id: 'started_at', label: '开始时间', datatype: 'datetime', modality: 'should' },
          { id: 'duration_ms', label: '时长(ms)', datatype: 'integer', min: 0, modality: 'may' },
        ],
      },
    ],
    objectProperties: [
      { id: 'assignedTo', label: '分派给', domain: ['Task'], range: ['Agent', 'Human'], cardinality: { max: 1 }, modality: 'shall' },
      { id: 'dependsOn', label: '依赖', domain: ['Task'], range: ['Task'], modality: 'shall' },
      { id: 'produces', label: '产出', domain: ['Task'], range: ['Deliverable'], modality: 'shall' },
      { id: 'verifiedBy', label: '验收于', domain: ['Deliverable'], range: ['Gate'], cardinality: { min: 1, max: 1 }, modality: 'shall' },
      { id: 'playsRole', label: '承担角色', domain: ['Agent', 'Human'], range: ['Role'], modality: 'shall' },
      { id: 'hasMember', label: '成员', domain: ['Squad'], range: ['Agent', 'Human'], modality: 'shall' },
      { id: 'leads', label: '领导', domain: ['Human'], range: ['Squad'], cardinality: { max: 1 }, modality: 'may' },
      { id: 'belongsTo', label: '归属看板', domain: ['Task'], range: ['Board'], cardinality: { max: 1 }, modality: 'should' },
      { id: 'runsTask', label: '执行任务', domain: ['Session'], range: ['Task'], modality: 'may' },
      { id: 'modifies', label: '修改', domain: ['Patch'], range: ['Repo'], modality: 'shall' },
      { id: 'documents', label: '文档化', domain: ['WikiPage'], range: ['Standard', 'Metric', 'Term', 'Role'], modality: 'should', description: '知识页是表述形式，语义实体经此挂接（内容与形式分离）' },
      { id: 'cites', label: '引用', domain: ['Standard'], range: ['Standard'], modality: 'may' },
    ],
    axioms: [
      {
        id: 'ax-task-agent-disjoint', kind: 'class', modality: 'shall',
        constraint: { type: 'disjoint', classes: ['Task', 'Agent'] },
        message: '任务与智能体不相交（工作对象 ≠ 协作主体）',
      },
      {
        id: 'ax-depends-acyclic', kind: 'relation', modality: 'shall',
        constraint: { type: 'acyclic', property: 'dependsOn' },
        message: '任务依赖必须无环（DAG）',
      },
      {
        id: 'ax-deliverable-gate', kind: 'relation', modality: 'shall',
        constraint: { type: 'required-relation', onClass: 'Deliverable', property: 'verifiedBy' },
        message: '交付物必须经门禁验收（无门禁的交付不算完成）',
      },
      {
        id: 'ax-task-ref-unique', kind: 'property', modality: 'shall',
        constraint: { type: 'unique-key', onClass: 'Task' },
        message: '同一看板任务号不得重复登记',
      },
      {
        id: 'ax-agent-name-unique', kind: 'property', modality: 'shall',
        constraint: { type: 'unique-key', onClass: 'Agent' },
        message: '智能体名称全局唯一',
      },
      {
        id: 'ax-wiki-entity-coverage', kind: 'relation', modality: 'should',
        constraint: { type: 'required-relation', onClass: 'WikiPage', property: 'documents' },
        message: '知识页宜挂接其文档化的语义实体（形式层应指回内容层）',
      },
    ],
    updatedAt: now,
  }
  return spec
}

/** 种子实例：催生本工作台的国标自身（Standard）+ 核心术语（Term）——开箱可校验。 */
export function seedInstances(now = Date.now()): OntologyInstance[] {
  return [
    {
      id: 'std-gbt-48000-3', type: 'Standard', label: 'GB/T 48000.3-2026 本体建模要求',
      data: {
        number: 'GB/T 48000.3-2026',
        title: '标准数字化 第3部分：本体建模要求',
        status: 'effective',
        effective_date: '2026-08-01',
      },
      relations: [],
      source: { wikiPage: 'docs/wiki/ontology.md' },
      updatedAt: now,
    },
    {
      id: 'term-ontology', type: 'Term', label: '本体（ontology）',
      data: { zh: '本体', en: 'ontology', definition: '形式化的概念模型：实体类型+数据属性+对象属性+公理+规则五要素，可被机器校验、推理与查询（区别于文档）' },
      relations: [],
      updatedAt: now,
    },
  ]
}
