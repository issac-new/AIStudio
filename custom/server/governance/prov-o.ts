/**
 * PROV-O 证据链导出（丁10，2026-09-30 调研落地）——审计四源归一升级为 W3C PROV
 * 标准交换格式（PROV-JSON 结构 + JSON-LD @context，prov 命名空间），供外部审计
 * 与跨系统对账。
 *
 * 映射（每条 NormalizedEvent）：
 *   actor   → prov:Agent       （ag:<actor>）
 *   action  → prov:Activity     （ac:<ts>-<seq>，prov:type=action，prov:startedAtTime）
 *   target  → prov:Entity       （e:<target>，多事件同 target 归一为同一实体）
 *   关系    → wasAssociatedWith(activity, agent) + used(activity, entity)；
 *             result 非空时 entity 由活动生成（prov:hadGeneration 记结果值）
 * 不用 semantica RDFExporter：其面在 python KG 对象，audit 四源是 studio 侧数据，
 * TS 直出可审计可测（每字段映射有单测锚点）。
 */
import { auditLog, type NormalizedEvent } from './governance-audit'

const PROV_CONTEXT = {
  prov: 'http://www.w3.org/ns/prov#',
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  'prov:startedAtTime': { '@type': 'xsd:dateTime' },
}

export interface ProvDocument {
  '@context': typeof PROV_CONTEXT
  prefix: { prov: string }
  agent: Record<string, { 'prov:label': string }>
  activity: Record<string, { 'prov:type': string; 'prov:startedAtTime': string; 'prov:label'?: string }>
  entity: Record<string, Record<string, string>>
  wasAssociatedWith: Array<{ 'prov:activity': string; 'prov:agent': string }>
  used: Array<{ 'prov:activity': string; 'prov:entity': string }>
  /** 导出元数据（诚实标注源与生成时间）。 */
  _export: { generatedAt: string; sources: Array<{ id: string; available: boolean; note?: string }>; events: number }
}

function iso(ts: number): string {
  return new Date(ts).toISOString()
}

/** 稳定 id（同 target 多事件归一同一实体）。 */
function entityId(target: string): string {
  return `e:${target.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 120)}`
}

export function eventsToProv(events: NormalizedEvent[], sources: Array<{ id: string; available: boolean; note?: string }>, now = Date.now()): ProvDocument {
  const doc: ProvDocument = {
    '@context': PROV_CONTEXT,
    prefix: { prov: 'http://www.w3.org/ns/prov#' },
    agent: {},
    activity: {},
    entity: {},
    wasAssociatedWith: [],
    used: [],
    _export: { generatedAt: iso(now), sources, events: events.length },
  }
  events.forEach((ev, i) => {
    const agId = `ag:${ev.actor.replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 80) || 'unknown'}`
    if (!doc.agent[agId]) doc.agent[agId] = { 'prov:label': ev.actor }
    const acId = `ac:${ev.ts}-${i}`
    doc.activity[acId] = {
      'prov:type': ev.action,
      'prov:startedAtTime': iso(ev.ts),
      'prov:label': `${ev.action} ${ev.target}`.slice(0, 160),
    }
    const enId = entityId(ev.target)
    if (!doc.entity[enId]) doc.entity[enId] = { 'prov:label': ev.target }
    doc.wasAssociatedWith.push({ 'prov:activity': acId, 'prov:agent': agId })
    doc.used.push({ 'prov:activity': acId, 'prov:entity': enId })
    if (ev.result) doc.entity[enId] = { ...doc.entity[enId], 'prov:value': `${ev.action}:${ev.result}`.slice(0, 200) }
  })
  return doc
}

/** 导出入口：auditLog 四源归一 → PROV 文档。 */
export async function provExport(opts?: { limit?: number; now?: number }): Promise<ProvDocument> {
  const log = await auditLog({ limit: opts?.limit ?? 200 })
  return eventsToProv(log.events, log.sources, opts?.now)
}
