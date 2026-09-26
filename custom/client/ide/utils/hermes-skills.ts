// overlay：工作台技能清单取数（技能入口 UI 数据面，zcode §七 #3 落地接线）。
//
// 数据源=studio 原生 GET /api/hermes/skills（modules/hermes/routes/skills.ts:9——
// categories 数组：{ name: 分类, skills: [{ name, description, enabled, ... }] }）。
// 本层=取数+归一→skills-ledger 事件流（合并口径投影），鉴权走 api/client request。
import { request } from '@/api/client'
import type { SkillEvent } from './skills-ledger'

interface RawCategory {
  name: string
  skills: Array<{
    name: string
    description?: string
    enabled?: boolean
    source?: string
  }>
}

export interface HermesSkillsResult {
  rows: SkillEvent[]
  categories: number
}

/** 拉取技能清单并归一为 ledger 事件流（失败抛错由调用方展示）。 */
export async function fetchHermesSkills(): Promise<HermesSkillsResult> {
  const res = await request<{ categories?: RawCategory[] }>('/api/hermes/skills')
  const cats = res.categories ?? []
  const rows: SkillEvent[] = []
  for (const cat of cats) {
    for (const s of cat.skills ?? []) {
      rows.push({
        name: s.name,
        kind: 'skill',
        source: s.source,
        enabled: s.enabled ?? true,
        description: s.description ? `${cat.name} · ${s.description}` : cat.name,
      })
    }
  }
  return { rows, categories: cats.length }
}
