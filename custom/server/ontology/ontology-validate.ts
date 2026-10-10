/**
 * 本体校验器（GB/T 48000.3 方法论产品化核心件）。
 *
 * 两层：
 *   validateSpec —— 本体自检（模式层健康）：IRI 唯一 / 引用存在 / 继承红线 /
 *     公理一致性。PUT /spec 的写入前门禁（error=0 才落盘）。
 *   validateInstances —— 实例数据契约（闭世界，SHACL 语义）：
 *     字段级（required 缺失即违规）+ 关系级（Domain/Range 拦截荒谬三元组 +
 *     基数 + 悬空目标）+ 类级公理（不相交/无环/唯一键/必备关系）。
 *
 * 约束全部声明在数据里（schema 字段 + Axiom），本文件只做求值器——
 * 「没有约束的本体不算数」：约束能被程序读取并用来校验数据，才叫语义资产。
 * 国标三层公理 ↔ 三道闸：实例不能乱（disjoint/unique-key）、取值不能错
 * （字段级）、关系不能断（domain/range/acyclic/required-relation）。
 */
import {
  type Axiom, type EntityType, type OntologyInstance, type OntologySpec, type Violation,
  dataPropLocalName, entityIri, isValidNamespace, severityFromModality,
} from './ontology-types'

// ---- 模式层自检 ----

const SPEC_CODES = {
  badNamespace: 'spec:bad-namespace',
  dupIri: 'spec:dup-iri',
  dupType: 'spec:dup-type',
  dupProp: 'spec:dup-prop',
  dupAxiom: 'spec:dup-axiom',
  unknownParent: 'spec:unknown-parent',
  parentCycle: 'spec:parent-cycle',
  unknownRef: 'spec:unknown-class-ref',
  disjointAsym: 'spec:disjoint-asym',
  inverseMissing: 'spec:inverse-missing',
  inheritWiden: 'spec:inherit-widen',
  axiomBadRef: 'spec:axiom-bad-ref',
  keyNotFound: 'spec:key-not-found',
} as const

export function validateSpec(spec: OntologySpec): Violation[] {
  const v: Violation[] = []
  const typeIds = new Set<string>()
  const propIds = new Set<string>()

  if (!isValidNamespace(spec.namespace)) {
    v.push({ severity: 'error', code: SPEC_CODES.badNamespace, subject: 'namespace', detail: `namespace 须为以 # 或 / 结尾的 http(s) IRI，当前：${spec.namespace}` })
  }

  // IRI 全局唯一：类型 / 对象属性 / 公理 / 数据属性（类名.属性名 扁平化）
  const iris = new Map<string, string>()
  const claim = (local: string, subject: string): void => {
    const iri = entityIri(spec.namespace, local)
    if (iris.has(iri)) v.push({ severity: 'error', code: SPEC_CODES.dupIri, subject, detail: `IRI 重复 ${iri}（已由 ${iris.get(iri)} 占用）` })
    else iris.set(iri, subject)
  }

  for (const t of spec.entityTypes) {
    if (typeIds.has(t.id)) v.push({ severity: 'error', code: SPEC_CODES.dupType, subject: t.id, detail: `实体类型 id 重复：${t.id}` })
    typeIds.add(t.id)
    claim(t.id, `entityType:${t.id}`)
    const propSeen = new Set<string>()
    for (const p of t.dataProperties) {
      if (propSeen.has(p.id)) v.push({ severity: 'error', code: SPEC_CODES.dupProp, subject: `${t.id}.${p.id}`, detail: `数据属性 id 在类型 ${t.id} 内重复：${p.id}` })
      propSeen.add(p.id)
      claim(dataPropLocalName(t.id, p.id), `dataProperty:${t.id}.${p.id}`)
    }
    if (t.key && !propSeen.has(t.key)) {
      v.push({ severity: 'error', code: SPEC_CODES.keyNotFound, subject: t.id, detail: `key 属性 "${t.key}" 不在 ${t.id}.dataProperties 中` })
    }
  }
  for (const p of spec.objectProperties) {
    if (propIds.has(p.id)) v.push({ severity: 'error', code: SPEC_CODES.dupProp, subject: p.id, detail: `对象属性 id 重复：${p.id}` })
    propIds.add(p.id)
    claim(p.id, `objectProperty:${p.id}`)
  }
  const axiomIds = new Set<string>()
  for (const a of spec.axioms) {
    if (axiomIds.has(a.id)) v.push({ severity: 'error', code: SPEC_CODES.dupAxiom, subject: a.id, detail: `公理 id 重复：${a.id}` })
    axiomIds.add(a.id)
    claim(a.id, `axiom:${a.id}`)
  }

  // parent 引用存在 + 无环
  const byId = new Map(spec.entityTypes.map((t) => [t.id, t]))
  for (const t of spec.entityTypes) {
    if (t.parent && !byId.has(t.parent)) {
      v.push({ severity: 'error', code: SPEC_CODES.unknownParent, subject: t.id, detail: `parent "${t.parent}" 不存在` })
    }
  }
  for (const t of spec.entityTypes) {
    const seen = new Set<string>([t.id])
    let cur: EntityType | undefined = t
    while (cur?.parent) {
      if (seen.has(cur.parent)) {
        v.push({ severity: 'error', code: SPEC_CODES.parentCycle, subject: t.id, detail: `parent 链成环：${[...seen, cur.parent].join(' → ')}` })
        break
      }
      seen.add(cur.parent)
      cur = byId.get(cur.parent)
    }
  }

  // 对象属性 domain/range 引用存在；inverseOf 成对；disjoint 对称登记
  for (const p of spec.objectProperties) {
    for (const ref of [...p.domain, ...p.range]) {
      if (!byId.has(ref)) v.push({ severity: 'error', code: SPEC_CODES.unknownRef, subject: p.id, detail: `domain/range 引用了不存在的类型：${ref}` })
    }
    if (p.inverseOf && !spec.objectProperties.some((q) => q.id === p.inverseOf)) {
      v.push({ severity: 'warning', code: SPEC_CODES.inverseMissing, subject: p.id, detail: `inverseOf "${p.inverseOf}" 不存在（单向关系，宜补逆属性）` })
    }
  }
  for (const t of spec.entityTypes) {
    for (const d of t.disjointWith ?? []) {
      if (!byId.has(d)) {
        v.push({ severity: 'error', code: SPEC_CODES.unknownRef, subject: t.id, detail: `disjointWith 引用了不存在的类型：${d}` })
        continue
      }
      const other = byId.get(d)!
      if (!(other.disjointWith ?? []).includes(t.id)) {
        v.push({ severity: 'warning', code: SPEC_CODES.disjointAsym, subject: `${t.id}⊥${d}`, detail: `不相交声明不对称：${d} 未声明 ⊥${t.id}` })
      }
    }
  }

  // 公理引用存在
  for (const a of spec.axioms) {
    const c = a.constraint
    if (c.type === 'disjoint' && (!byId.has(c.classes[0]) || !byId.has(c.classes[1]))) {
      v.push({ severity: 'error', code: SPEC_CODES.axiomBadRef, subject: a.id, detail: `disjoint 公理引用了不存在的类型：${c.classes.join(' ⊥ ')}` })
    }
    if (c.type === 'acyclic' && !propIds.has(c.property)) {
      v.push({ severity: 'error', code: SPEC_CODES.axiomBadRef, subject: a.id, detail: `acyclic 公理引用了不存在的对象属性：${c.property}` })
    }
    if (c.type === 'unique-key' && !byId.has(c.onClass)) {
      v.push({ severity: 'error', code: SPEC_CODES.axiomBadRef, subject: a.id, detail: `unique-key 公理引用了不存在的类型：${c.onClass}` })
    }
    if (c.type === 'required-relation' && (!byId.has(c.onClass) || !propIds.has(c.property))) {
      v.push({ severity: 'error', code: SPEC_CODES.axiomBadRef, subject: a.id, detail: `required-relation 公理引用不存在的类型/属性：${c.onClass} / ${c.property}` })
    }
  }

  // 扩展红线（国标 3.5）：继承是约束的传递，不是约束的稀释——
  // 子类同名数据属性只能收窄（enum ⊆ / min ↑ / max ↓ / required 只增不减 /
  // pattern 只增不减 / datatype 不变）；父类 disjoint 声明子类必须继承。
  // 巡走带 seen 守卫：parent 环由上方 parent-cycle 报 error，这里不死循环。
  for (const t of spec.entityTypes) {
    const walked = new Set<string>([t.id])
    let parent = t.parent ? byId.get(t.parent) : undefined
    while (parent) {
      if (walked.has(parent.id)) break
      walked.add(parent.id)
      for (const pp of parent.dataProperties) {
        const cp = t.dataProperties.find((x) => x.id === pp.id)
        if (!cp) continue
        if (cp.datatype !== pp.datatype) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `子类不得改父类属性 datatype（${parent.id}.${pp.id}=${pp.datatype} → ${cp.datatype}）` })
        }
        if (pp.required && !cp.required) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `父类必填属性子类不得转可选（继承自 ${parent.id}）` })
        }
        if (pp.pattern && !cp.pattern) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `父类 pattern 约束子类不得移除（继承自 ${parent.id}）` })
        }
        if (pp.enum && cp.enum && cp.enum.some((x) => !pp.enum!.includes(x))) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `子类 enum 只能收窄（出现父类枚举之外的取值，继承自 ${parent.id}）` })
        }
        if (pp.min !== undefined && cp.min !== undefined && cp.min < pp.min) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `子类 min 只能上调（${pp.min} → ${cp.min}，继承自 ${parent.id}）` })
        }
        if (pp.max !== undefined && cp.max !== undefined && cp.max > pp.max) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: `${t.id}.${cp.id}`, detail: `子类 max 只能下调（${pp.max} → ${cp.max}，继承自 ${parent.id}）` })
        }
      }
      for (const d of parent.disjointWith ?? []) {
        if (!(t.disjointWith ?? []).includes(d)) {
          v.push({ severity: 'error', code: SPEC_CODES.inheritWiden, subject: t.id, detail: `子类必须继承父类的不相交声明（缺 ${t.id} ⊥ ${d}，继承自 ${parent.id}）` })
        }
      }
      parent = parent.parent ? byId.get(parent.parent) : undefined
    }
  }
  return v
}

// ---- 实例数据契约（闭世界） ----

const INST_CODES = {
  unknownType: 'inst:unknown-type',
  dupId: 'inst:dup-id',
  fieldRequired: 'field:required',
  fieldDatatype: 'field:datatype',
  fieldPattern: 'field:pattern',
  fieldEnum: 'field:enum',
  fieldRange: 'field:range',
  fieldUnknown: 'field:unknown-property',
  relUnknown: 'rel:unknown-property',
  relDomain: 'rel:domain',
  relRange: 'rel:range',
  relCardinality: 'rel:cardinality',
  relDangling: 'rel:dangling-target',
  classDisjoint: 'class:disjoint',
  classAcyclic: 'class:acyclic',
  classUniqueKey: 'class:unique-key',
  classRequiredRelation: 'class:required-relation',
} as const

/** 类型链（含祖先）；type 不在 spec 中返回空表。seen 守卫防 parent 环死循环。 */
function typeChain(typeId: string, byId: Map<string, EntityType>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let cur = byId.get(typeId)
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id)
    out.push(cur.id)
    cur = cur.parent ? byId.get(cur.parent) : undefined
  }
  return out
}

function isTypeOrSubclass(actual: string, expected: string, byId: Map<string, EntityType>): boolean {
  return typeChain(actual, byId).includes(expected)
}

function datatypeOk(value: unknown, dt: string): boolean {
  switch (dt) {
    case 'string': case 'iri': return typeof value === 'string'
    case 'number': return typeof value === 'number' && Number.isFinite(value)
    case 'integer': return typeof value === 'number' && Number.isInteger(value)
    case 'boolean': return typeof value === 'boolean'
    case 'date': return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    case 'datetime': return typeof value === 'string' && !Number.isNaN(Date.parse(value))
    case 'json': return typeof value === 'object' && value !== null
    default: return false
  }
}

export function validateInstances(spec: OntologySpec, instances: OntologyInstance[]): Violation[] {
  const v: Violation[] = []
  const byId = new Map(spec.entityTypes.map((t) => [t.id, t]))
  const propById = new Map(spec.objectProperties.map((p) => [p.id, p]))
  const instById = new Map<string, OntologyInstance>()
  const ids = new Set<string>()

  // 实例级：类型存在 + id 唯一
  for (const inst of instances) {
    if (ids.has(inst.id)) {
      v.push({ severity: 'error', code: INST_CODES.dupId, subject: inst.id, detail: `实例 id 重复：${inst.id}` })
    } else {
      ids.add(inst.id)
      instById.set(inst.id, inst)
    }
    if (!byId.has(inst.type)) {
      v.push({ severity: 'error', code: INST_CODES.unknownType, subject: inst.id, detail: `实例类型 "${inst.type}" 不在本体中` })
    }
  }

  // 字段级 + 关系级
  for (const inst of instances) {
    const type = byId.get(inst.type)
    if (!type) continue
    // 数据属性（含继承链上的）
    const chain = typeChain(inst.type, byId)
    const props = new Map<string, { p: EntityType['dataProperties'][number]; owner: string }>()
    for (const tid of chain) {
      for (const p of byId.get(tid)?.dataProperties ?? []) props.set(p.id, { p, owner: tid })
    }
    for (const [pid, { p }] of props) {
      const value = inst.data?.[pid]
      const sev = severityFromModality(p.modality)
      if (value === undefined || value === null || value === '') {
        if (p.required) v.push({ severity: sev, code: INST_CODES.fieldRequired, subject: inst.id, path: pid, detail: `必填数据属性缺失：${type.id}.${pid}（闭世界：缺了就是不合规）` })
        continue
      }
      if (!datatypeOk(value, p.datatype)) {
        v.push({ severity: sev, code: INST_CODES.fieldDatatype, subject: inst.id, path: pid, detail: `${pid} 期望 ${p.datatype}，实际 ${typeof value}：${JSON.stringify(value).slice(0, 60)}` })
        continue
      }
      if (p.pattern && typeof value === 'string' && !new RegExp(p.pattern).test(value)) {
        v.push({ severity: sev, code: INST_CODES.fieldPattern, subject: inst.id, path: pid, detail: `${pid} 不匹配 pattern ${p.pattern}：${value.slice(0, 60)}` })
      }
      if (p.enum && !p.enum.includes(String(value))) {
        v.push({ severity: sev, code: INST_CODES.fieldEnum, subject: inst.id, path: pid, detail: `${pid} 越出枚举 {${p.enum.join('|')}}：${String(value).slice(0, 40)}` })
      }
      if (typeof value === 'number') {
        if (p.min !== undefined && value < p.min) v.push({ severity: sev, code: INST_CODES.fieldRange, subject: inst.id, path: pid, detail: `${pid}=${value} 低于下限 ${p.min}` })
        if (p.max !== undefined && value > p.max) v.push({ severity: sev, code: INST_CODES.fieldRange, subject: inst.id, path: pid, detail: `${pid}=${value} 超过上限 ${p.max}` })
      }
    }
    // 未声明的数据键（info 级——扩展可，但必须显式声明才可校验）
    for (const key of Object.keys(inst.data ?? {})) {
      if (!props.has(key)) v.push({ severity: 'info', code: INST_CODES.fieldUnknown, subject: inst.id, path: key, detail: `数据键 "${key}" 未在 ${inst.type}（含继承链）中声明——本体外的字段无约束` })
    }

    // 对象属性
    for (const rel of inst.relations ?? []) {
      const p = propById.get(rel.property)
      if (!p) {
        v.push({ severity: 'error', code: INST_CODES.relUnknown, subject: inst.id, path: rel.property, detail: `未声明的对象属性：${rel.property}` })
        continue
      }
      const sev = severityFromModality(p.modality)
      if (!p.domain.some((d) => isTypeOrSubclass(inst.type, d, byId))) {
        v.push({ severity: sev, code: INST_CODES.relDomain, subject: inst.id, path: rel.property, detail: `Domain 违规：${inst.type} 不是 ${rel.property} 的域 {${p.domain.join('|')}}（拦掉"设备购买了客户"式三元组）` })
      }
      const target = instById.get(rel.target)
      if (!target) {
        v.push({ severity: sev, code: INST_CODES.relDangling, subject: inst.id, path: rel.property, detail: `关系目标不存在：${rel.property} → ${rel.target}` })
        continue
      }
      if (!p.range.some((r) => isTypeOrSubclass(target.type, r, byId))) {
        v.push({ severity: sev, code: INST_CODES.relRange, subject: inst.id, path: rel.property, detail: `Range 违规：${rel.property} → ${target.id}（${target.type}）不在范围 {${p.range.join('|')}} 内` })
      }
    }
    // 基数
    for (const p of spec.objectProperties) {
      const mine = (inst.relations ?? []).filter((r) => r.property === p.id)
      if (!mine.length) continue
      if (!p.domain.some((d) => isTypeOrSubclass(inst.type, d, byId))) continue
      const sev = severityFromModality(p.modality)
      if (p.cardinality?.max !== undefined && mine.length > p.cardinality.max) {
        v.push({ severity: sev, code: INST_CODES.relCardinality, subject: inst.id, path: p.id, detail: `${p.id} 基数超上限 ${p.cardinality.max}：实际 ${mine.length}` })
      }
    }
  }

  // 类级公理求值（公理是数据，求值器通用——加公理不改代码）
  for (const a of spec.axioms) {
    const sev = severityFromModality(a.modality, a.severity)
    const c = a.constraint
    if (c.type === 'disjoint') {
      const [a1, a2] = c.classes
      for (const inst of instances) {
        const chain = typeChain(inst.type, byId)
        if (chain.includes(a1) && chain.includes(a2)) {
          v.push({ severity: sev, code: INST_CODES.classDisjoint, subject: inst.id, detail: `${inst.type} 同时落入不相交类 ${a1} ⊥ ${a2}：${a.message}` })
        }
      }
    } else if (c.type === 'acyclic') {
      // 关系图 DFS 回边检测（含自环）
      const adj = new Map<string, string[]>()
      for (const inst of instances) {
        for (const rel of inst.relations ?? []) {
          if (rel.property !== c.property) continue
          if (!adj.has(inst.id)) adj.set(inst.id, [])
          adj.get(inst.id)!.push(rel.target)
        }
      }
      const color = new Map<string, 1 | 2>()
      const cyclicAt = new Set<string>()
      const dfs = (u: string): void => {
        color.set(u, 1)
        for (const w of adj.get(u) ?? []) {
          const cState = color.get(w)
          if (cState === 1 || w === u) cyclicAt.add(w === u ? u : w)
          else if (cState === undefined) dfs(w)
        }
        color.set(u, 2)
      }
      for (const u of adj.keys()) if (!color.has(u)) dfs(u)
      for (const id of cyclicAt) {
        v.push({ severity: sev, code: INST_CODES.classAcyclic, subject: id, path: c.property, detail: `${c.property} 关系成环（涉及 ${id}）：${a.message}` })
      }
    } else if (c.type === 'unique-key') {
      const seen = new Map<string, string>()
      for (const inst of instances) {
        if (!isTypeOrSubclass(inst.type, c.onClass, byId)) continue
        const keyProp = byId.get(inst.type)?.key
        if (!keyProp) continue
        const kv = String(inst.data?.[keyProp] ?? '')
        if (!kv) continue
        const prev = seen.get(kv)
        if (prev) v.push({ severity: sev, code: INST_CODES.classUniqueKey, subject: inst.id, path: keyProp, detail: `唯一键 ${keyProp}="${kv}" 与 ${prev} 重复：${a.message}` })
        else seen.set(kv, inst.id)
      }
    } else if (c.type === 'required-relation') {
      for (const inst of instances) {
        if (!isTypeOrSubclass(inst.type, c.onClass, byId)) continue
        const has = (inst.relations ?? []).some((r) => r.property === c.property)
        if (!has) v.push({ severity: sev, code: INST_CODES.classRequiredRelation, subject: inst.id, path: c.property, detail: `${inst.type} 必须有 ${c.property} 关系：${a.message}` })
      }
    }
  }

  // 类型上声明的 disjointWith（除公理外的主张面，实例双属同样违规）
  for (const t of spec.entityTypes) {
    for (const d of t.disjointWith ?? []) {
      for (const inst of instances) {
        const chain = typeChain(inst.type, byId)
        if (chain.includes(t.id) && chain.includes(d)) {
          v.push({ severity: severityFromModality(t.modality), code: INST_CODES.classDisjoint, subject: inst.id, detail: `${inst.type} 同时落入不相交类 ${t.id} ⊥ ${d}（类型声明主张）` })
        }
      }
    }
  }
  return v
}

export function hasErrors(violations: Violation[]): boolean {
  return violations.some((x) => x.severity === 'error')
}

export function violationSummary(violations: Violation[]): { error: number; warning: number; info: number } {
  return {
    error: violations.filter((x) => x.severity === 'error').length,
    warning: violations.filter((x) => x.severity === 'warning').length,
    info: violations.filter((x) => x.severity === 'info').length,
  }
}
