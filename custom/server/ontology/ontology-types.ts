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

export interface DataProperty {
  id: string
  label: string
  datatype: Datatype
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
  entityTypes: EntityType[]
  objectProperties: ObjectProperty[]
  axioms: Axiom[]
  updatedAt: number
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

export function entityIri(namespace: string, localId: string): string {
  return `${namespace}${localId}`
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
