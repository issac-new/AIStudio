// overlay/custom/client/ontology/api.ts
// 本体工作台客户端 API 面（/api/hermes/ontology/*）。
// 类型为服务端契约的客户端镜像（custom/server/ontology/ontology-types.ts）——
// 刻意不跨包 import server 类型（域自包含，eval api 同款纪律）。
// 422（写入即校验拒写）在 request 层抛错；UI 写前先走 validate（临时校验
// 不入库）拿违规清单展示，再提交——服务端 422 仍是最终闸。
import { request, getApiKey, getBaseUrlValue } from '@/api/client'

export type Modality = 'shall' | 'should' | 'may'
export type Severity = 'error' | 'warning' | 'info'
export type Datatype = 'string' | 'number' | 'integer' | 'boolean' | 'date' | 'datetime' | 'iri' | 'json'

export interface DataProperty {
  id: string; label: string; datatype: Datatype
  required?: boolean; pattern?: string; enum?: string[]; min?: number; max?: number
  modality: Modality; description?: string
}
export interface EntityType {
  id: string; label: string; labelEn?: string; description?: string
  parent?: string; category?: string; key?: string; disjointWith?: string[]
  modality: Modality; dataProperties: DataProperty[]
}
export interface ObjectProperty {
  id: string; label: string; domain: string[]; range: string[]
  cardinality?: { min?: number; max?: number }; inverseOf?: string
  modality: Modality; description?: string
}
export type AxiomConstraint =
  | { type: 'disjoint'; classes: [string, string] }
  | { type: 'acyclic'; property: string }
  | { type: 'unique-key'; onClass: string }
  | { type: 'required-relation'; onClass: string; property: string }
export interface Axiom {
  id: string; kind: 'class' | 'property' | 'relation'; constraint: AxiomConstraint
  severity?: Severity; message: string; modality: Modality; description?: string
}
export interface OntologySpec {
  id: string; namespace: string; version: number; versionIri: string; priorVersion?: number
  label: string; entityTypes: EntityType[]; objectProperties: ObjectProperty[]; axioms: Axiom[]
  updatedAt: number
}
export interface InstanceRelation { property: string; target: string }
export interface OntologyInstance {
  id: string; iri?: string; type: string; label: string
  data: Record<string, unknown>; relations: InstanceRelation[]
  source?: { wikiPage?: string; taskRef?: string }; updatedAt: number
}
export interface Violation { severity: Severity; code: string; subject: string; path?: string; detail: string }
export interface OntologyStats { typeCount: number; dataPropCount: number; objPropCount: number; axiomCount: number; instanceCount: number }
export interface Health { error: number; warning: number; info: number }
export interface SpecSnapshotMeta { ts: number; file: string; bytes: number; label: string; version: number; typeCount: number }

export interface SpecResponse { ok: boolean; spec: OntologySpec; stats: OntologyStats; health: Health }
export interface SaveSpecResponse { ok: boolean; spec?: OntologyInstance; detail?: string }
export interface UpsertResponse { ok: boolean; saved?: OntologyInstance; violations?: Violation[] }
export interface ValidateResponse { ok: boolean; persisted: boolean; count: number; violations: Violation[]; summary: Health }
/** 摄取结果（服务端 ontology-ingest IngestResult 镜像）。 */
export interface IngestResultDto {
  ok: boolean
  boards: Array<{ slug: string; tasks: number; links: number }>
  ingested: { tasks: number; agents: number; boards: number; runs: number; relations: number }
  skipped: Violation[]
  summary: Health
  instanceTotal: number
  inboxPushed: number
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  return request<T & { ok?: boolean }>(path, { credentials: 'same-origin', ...init })
}

export const ontologyApi = {
  getSpec: () => req<SpecResponse>('/api/hermes/ontology/spec'),
  /** 422 拒写时 request 抛错（message 含服务端 detail）——写前先 validate。 */
  saveSpec: (spec: OntologySpec) =>
    req<{ ok: boolean; spec: OntologySpec; snapshot?: string | null }>('/api/hermes/ontology/spec', { method: 'PUT', body: JSON.stringify(spec) }),
  listInstances: (type?: string) =>
    req<{ ok: boolean; instances: OntologyInstance[]; total: number }>(`/api/hermes/ontology/instances${type ? `?type=${encodeURIComponent(type)}` : ''}`),
  createInstance: (inst: OntologyInstance) =>
    req<UpsertResponse>('/api/hermes/ontology/instances', { method: 'POST', body: JSON.stringify(inst) }),
  replaceInstance: (inst: OntologyInstance) =>
    req<UpsertResponse>(`/api/hermes/ontology/instances/${encodeURIComponent(inst.id)}`, { method: 'PUT', body: JSON.stringify(inst) }),
  deleteInstance: (id: string) =>
    req<{ ok: boolean }>(`/api/hermes/ontology/instances/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  /** instances 传值=临时校验不入库（写前预检）；缺省=全量跑批。 */
  validate: (instances?: OntologyInstance[]) =>
    req<ValidateResponse>('/api/hermes/ontology/validate', { method: 'POST', body: JSON.stringify(instances ? { instances } : {}) }),
  /** jsonld/shacl 走 request（恒 res.json()，带 Bearer）；turtle 是文本——裸 fetch
   *  须自带 Authorization（token 在 localStorage 不在 cookie，same-origin 不够）。 */
  exportText: async (format: 'jsonld' | 'shacl' | 'turtle'): Promise<string> => {
    if (format !== 'turtle') {
      const j = await req<Record<string, unknown>>(`/api/hermes/ontology/export?format=${format}`)
      return JSON.stringify(j, null, 2)
    }
    const key = getApiKey()
    const res = await fetch(`${getBaseUrlValue()}/api/hermes/ontology/export?format=turtle`, {
      credentials: 'same-origin',
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    })
    if (!res.ok) throw new Error(`导出失败 ${res.status}`)
    return res.text()
  },
  listVersions: () => req<{ ok: boolean; versions: SpecSnapshotMeta[] }>('/api/hermes/ontology/versions'),
  rollback: (ts: number) =>
    req<{ ok: boolean; restoredVersion?: number; detail?: string }>('/api/hermes/ontology/rollback', { method: 'POST', body: JSON.stringify({ ts }) }),
  resetSeed: () => req<{ ok: boolean; instanceCount: number }>('/api/hermes/ontology/seed', { method: 'POST' }),
  kanbanOverview: () =>
    req<{ ok: boolean; sources: Array<{ slug: string; path: string; exists: boolean }> }>('/api/hermes/ontology/kanban-overview'),
  ingest: (board?: string) =>
    req<{ ok: boolean; ingest: IngestResultDto }>('/api/hermes/ontology/ingest', { method: 'POST', body: JSON.stringify(board ? { board } : {}) }),
}
