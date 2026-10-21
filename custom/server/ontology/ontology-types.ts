/**
 * 本体模型与 IRI 工具（GB/T 48000.3 方法论产品化，2026-10-10 调研落地）。
 *
 * 五要素骨架（国标 3.1「通用要求」：实体类型/数据属性/对象属性/公理/规则）：
 *   - EntityType + DataProperty = 实体类型与数据属性（描述自身特征）
 *   - ObjectProperty = 对象属性（描述实体之间的关系，Domain/Range 必须显式声明）
 *   - Axiom = 公理（跨字段/类级约束：不相交/无环/唯一键/必备关系）
 *   - 字段级声明式约束（required/pattern/enum/min/max/cardinality）= 规则层，
 *     约束写在数据里而非代码 if 里——可被外部校验器消费（国标 4.2 数据契约）
 * 情态分级（国标 5.2 应/宜/可）：每个类型/属性/公理带 modality，缺省映射校验
 * severity：shall→error（硬闸）/ should→warning / may→info。
 * 形式化锚点（国标 4）：全局唯一 IRI（namespace + 本地名）+ owl:versionIRI/priorVersion
 * 版本链（存取见 ontology-store，序列化见 ontology-export）。
 */

/** 国标情态词：应（shall）/ 宜（should）/ 可（may）。 */
export type Modality = 'shall' | 'should' | 'may'

export type Severity = 'error' | 'warning' | 'info'

/** 情态→缺省 severity（显式 severity 声明优先）。 */
export function severityFromModality(modality: Modality, explicit?: Severity): Severity {
  if (explicit) return explicit
  return modality === 'shall' ? 'error' : modality === 'should' ? 'warning' : 'info'
}

export type Datatype = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'iri' | 'json'

/**
 * 术语出处（FIBO 对齐层，2026-10-21）。
 *
 * 单一 namespace 只能表达「本工作台自建术语」；引入外部标准时必须逐术语
 * 记录真实 IRI 与来源模块，否则「FIBO 概念」只是名义标注。origin 三档：
 *   fibo            —— spec.edmcouncil.org/fibo 命名空间下，module/versionIri 必填
 *   commons         —— OMG Commons 命名空间（FIBO 已把 Party/Identifier 等迁出）
 *   local-extension —— 本工作台工程近似（如卡支付 Authorization/Capture），不得冒充 FIBO
 */
export type OriginKind = 'fibo' | 'commons' | 'local-extension' | 'internal'

export interface TermProvenance {
  origin: OriginKind
  /** FIBO 模块路径，如 FND/ProductsAndServices/PaymentsAndSchedules。 */
  module?: string
  /** 源模块 owl:versionIRI（版本可追溯）。 */
  versionIri?: string
  /** 源模块成熟度：Release / Provisional / Informative。 */
  maturity?: string
  /** 取证日期（YYYY-MM-DD），防止「引用了一个当时不存在的类」。 */
  retrievedAt?: string
  /** 源 skos:definition 英文原文（中文定义是转述，原文才是锚）。 */
  definitionEn?: string
  /** 口径说明：为什么这样对齐、哪里做了工程近似。 */
  note?: string
}

export interface DataProperty {
  id: string
  label: string
  datatype: Datatype
  /** 显式全局 IRI（外部标准术语用；缺省 = namespace + 类名.属性名）。 */
  iri?: string
  provenance?: TermProvenance
  /** 闭世界语义（SHACL）：required 缺失即违规，不是"未知不成立"。 */
  required?: boolean
  pattern?: string
  enum?: string[]
  min?: number
  max?: number
  modality: Modality
  description?: string
}

export interface EntityType {
  id: string
  label: string
  labelEn?: string
  description?: string
  /** 显式全局 IRI（FIBO/Commons 术语用；缺省 = namespace + id）。 */
  iri?: string
  provenance?: TermProvenance
  /** 父类型（子类继承——扩展红线：约束只增不减，见 validateSpec 的 inherit-widen）。 */
  parent?: string
  /** 分组（照国标四类组织法，领域自定义组名）。 */
  category?: string
  /** 唯一标识数据属性（类级公理 unique-key 的锚点）。 */
  key?: string
  /** 与这些类不相交（实体类型规则）。 */
  disjointWith?: string[]
  modality: Modality
  dataProperties: DataProperty[]
}

export interface ObjectProperty {
  id: string
  label: string
  /** 显式全局 IRI（FIBO/Commons 术语用；缺省 = namespace + id）。 */
  iri?: string
  provenance?: TermProvenance
  /** 域（显式声明——国标硬要求；实例类型 ∉ domain（含子类判定）即写入拦截）。 */
  domain: string[]
  /** 范围（同上）。 */
  range: string[]
  cardinality?: { min?: number; max?: number }
  inverseOf?: string
  modality: Modality
  description?: string
}

/** 公理约束（声明式，数据驱动；kind 照国标 3.4 三层：类/属性/关系）。 */
export type AxiomConstraint =
  | { type: 'disjoint'; classes: [string, string] }
  | { type: 'acyclic'; property: string }
  | { type: 'unique-key'; onClass: string }
  | { type: 'required-relation'; onClass: string; property: string }

export interface Axiom {
  id: string
  kind: 'class' | 'property' | 'relation'
  constraint: AxiomConstraint
  severity?: Severity
  message: string
  modality: Modality
  description?: string
}

export interface OntologySpec {
  id: string
  /** 命名空间（IRI 前缀，须以 # 或 / 结尾；实体 IRI = namespace + 本地名）。 */
  namespace: string
  version: number
  /** owl:versionIRI（本版本本体的全局标识）。 */
  versionIri: string
  /** owl:priorVersion（上一版本号；首版无）。 */
  priorVersion?: number
  label: string
  /** 本体内引用的外部词表（FIBO/Commons），导出时生成前缀与 owl:imports。 */
  vocabularies?: ExternalVocabulary[]
  entityTypes: EntityType[]
  objectProperties: ObjectProperty[]
  axioms: Axiom[]
  updatedAt: number
}

/** 外部词表声明：prefix 用于导出可读前缀，iri 为 ontology IRI。 */
export interface ExternalVocabulary {
  prefix: string
  iri: string
  label?: string
}

export interface InstanceRelation {
  property: string
  /** 目标实例 id。 */
  target: string
}

export interface OntologyInstance {
  id: string
  iri?: string
  type: string
  label: string
  data: Record<string, unknown>
  relations: InstanceRelation[]
  /** 溯源（内容与表述形式分离：本体实体与 wiki 页/任务松挂接）。 */
  source?: { wikiPage?: string; taskRef?: string }
  updatedAt: number
}

// ---- IRI 工具（国标 4.3：全球唯一、持久稳定） ----

export function isValidNamespace(ns: string): boolean {
  return /^https?:\/\/[^\s]+[#/]$/.test(ns)
}

/** 显式 IRI 合法性（FIBO/Commons 引用必须是绝对 http(s) IRI，且不含空白）。 */
export function isValidIri(iri: string): boolean {
  return /^https?:\/\/[^\s]+$/.test(iri)
}

export function entityIri(namespace: string, localId: string): string {
  return `${namespace}${localId}`
}

/** 实体类型的最终 IRI：显式 IRI 优先，缺省回落 namespace + id。 */
export function typeIri(spec: OntologySpec, typeId: string): string {
  const t = spec.entityTypes.find((x) => x.id === typeId)
  return t?.iri ?? entityIri(spec.namespace, typeId)
}

/** 对象属性的最终 IRI：显式 IRI 优先。 */
export function objectPropertyIri(spec: OntologySpec, propId: string): string {
  const p = spec.objectProperties.find((x) => x.id === propId)
  return p?.iri ?? entityIri(spec.namespace, propId)
}

/** 数据属性的最终 IRI：显式 IRI 优先，缺省 namespace + 类名.属性名。 */
export function dataPropertyIri(spec: OntologySpec, typeId: string, propId: string): string {
  const t = spec.entityTypes.find((x) => x.id === typeId)
  const p = t?.dataProperties.find((x) => x.id === propId)
  return p?.iri ?? entityIri(spec.namespace, dataPropLocalName(typeId, propId))
}

/** 数据属性全局 IRI：类名.属性名（导出为全局 owl:DatatypeProperty 用的本地名）。 */
export function dataPropLocalName(typeId: string, propId: string): string {
  return `${typeId}.${propId}`
}

export function ontologyIri(namespace: string): string {
  return namespace.replace(/[#/]$/, '')
}

export function versionIriOf(namespace: string, version: number): string {
  return `${ontologyIri(namespace)}/v${version}`
}

/** 校验结果单位（code 稳定，可编程消费；subject=违规定位）。 */
export interface Violation {
  severity: Severity
  code: string
  subject: string
  path?: string
  detail: string
}

/** 统计（GET /spec 附带，前端概览卡消费）。 */
export interface OntologyStats {
  typeCount: number
  dataPropCount: number
  objPropCount: number
  axiomCount: number
  instanceCount: number
}

export function specStats(spec: OntologySpec, instanceCount: number): OntologyStats {
  return {
    typeCount: spec.entityTypes.length,
    dataPropCount: spec.entityTypes.reduce((n, t) => n + t.dataProperties.length, 0),
    objPropCount: spec.objectProperties.length,
    axiomCount: spec.axioms.length,
    instanceCount,
  }
}
