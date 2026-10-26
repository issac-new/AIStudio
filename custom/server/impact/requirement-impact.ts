// overlay[impact] 需求影响推演（JoyAI 闭环吸收轮 P5，2026-10-26）。
//
// 范式来源：京东 JoyAI ONE「输入主 PRD 后系统自动推演关联业务领域与改造范围」。
// 本仓规则式实现（不上 LLM）：需求文本 × 四路知识面做词面提及检测——
//   ① 本体实例（任务/Agent/Board 标题） ② 板级 KG 节点（结案任务图谱）
//   ③ FIBO 术语（36 概念中文名/别名）    ④ specs 历史迭代（P2 索引全文检索）
// 再叠加建议模块（与导演台 inferModules 同源，单一事实源）。
//
// 保守原则（impact-preview.ts 同款纪律）：拿不准不猜数——实体标题短于阈值
// 不参与（误报）、命中即带命中词面（可核对）、boundary 声明覆盖边界。fail-soft：
// 任一路源缺席该路计 0 命中，不阻断其余路。
import { readdirSync } from 'node:fs'
import { loadInstances } from '../ontology/ontology-store'
import { readBoardKgState, boardKgPath, boardKgDir } from '../knowledge/board-graph'
import { fiboGlossary } from '../ontology/ontology-fibo-glossary'
import { searchSpecs, type SpecHit } from '../specs/specs-index'
import { inferModules } from '../graph/simulation-graph-template'

export type ImpactSource = 'ontology-instance' | 'board-kg' | 'fibo-term'

export interface ImpactEntityHit {
  source: ImpactSource
  /** 实例 id / KG 节点 id / FIBO 概念 id。 */
  id: string
  label: string
  /** 需求文本中命中的词面（可人工核对）。 */
  matchedTerm: string
  /** 补充定位（本体 taskRef / KG 板 slug）。 */
  detail?: string
}

export interface RequirementImpact {
  title: string
  description: string
  entities: ImpactEntityHit[]
  relatedSpecs: SpecHit[]
  /** 与导演台同源的建议模块（inferModules 词表推导）。 */
  suggestedModules: string[]
  boundary: string
  counts: { ontology: number; boardKg: number; fibo: number; specs: number }
}

/** 词面有效性：纯 ASCII ≥3（pay/to 等短英文词误报高），其余（中文等）≥2。 */
function termEligible(t: string): boolean {
  const s = t.trim()
  if (!s) return false
  return /^[\x20-\x7e]+$/.test(s) ? s.length >= 3 : s.length >= 2
}

/** 词面提及检测：term 出现在需求文本中即命中（ASCII 大小写不敏感）。 */
function mentions(text: string, term: string): string | null {
  const t = term.trim()
  if (!termEligible(t)) return null
  const isAscii = /^[\x20-\x7e]+$/.test(t)
  const haystack = isAscii ? text.toLowerCase() : text
  const needle = isAscii ? t.toLowerCase() : t
  return haystack.includes(needle) ? t : null
}

const PER_SOURCE_CAP = 10

/** 本体实例路：任务/Agent/Board 的 label 与 data.title 参与提及检测。 */
function hitOntologyInstances(text: string): ImpactEntityHit[] {
  try {
    const hits: ImpactEntityHit[] = []
    for (const inst of loadInstances()) {
      const forms = [inst.label, typeof inst.data?.title === 'string' ? inst.data.title : '']
      for (const f of forms) {
        const m = mentions(text, f)
        if (!m) continue
        hits.push({
          source: 'ontology-instance', id: inst.id, label: inst.label, matchedTerm: m,
          detail: typeof inst.data?.taskRef === 'string' ? inst.data.taskRef : undefined,
        })
        break
      }
      if (hits.length >= PER_SOURCE_CAP) break
    }
    return hits
  } catch { return [] }
}

/** 板级 KG 路：boardKgDir() 下 board-*.json 的节点 properties.title/name。 */
function hitBoardKg(text: string): ImpactEntityHit[] {
  try {
    const hits: ImpactEntityHit[] = []
    for (const name of readdirSync(boardKgDir())) {
      const m = name.match(/^board-(.+)\.json$/)
      if (!m) continue
      const slug = m[1]
      const state = readBoardKgState(boardKgPath(slug))
      if (!state) continue
      for (const node of state.nodes) {
        const title = typeof node.properties?.title === 'string' ? node.properties.title
          : typeof node.properties?.name === 'string' ? node.properties.name : ''
        const matched = mentions(text, title)
        if (!matched) continue
        hits.push({ source: 'board-kg', id: node.id, label: title, matchedTerm: matched, detail: slug })
        if (hits.length >= PER_SOURCE_CAP) return hits
      }
    }
    return hits
  } catch { return [] }
}

/** FIBO 术语路：36 概念中文名+别名提及检测。 */
function hitFiboTerms(text: string): ImpactEntityHit[] {
  try {
    const hits: ImpactEntityHit[] = []
    for (const e of fiboGlossary().entries) {
      for (const form of [e.labelZh, ...e.aliases]) {
        const m = mentions(text, form)
        if (!m) continue
        hits.push({ source: 'fibo-term', id: e.id, label: e.labelZh, matchedTerm: m })
        break
      }
      if (hits.length >= PER_SOURCE_CAP) break
    }
    return hits
  } catch { return [] }
}

/** 需求影响推演主入口（纯读侧，无写入面）。 */
export function analyzeRequirementImpact(title: string, description: string): RequirementImpact {
  const text = `${title}\n${description}`
  const entities = [...hitOntologyInstances(text), ...hitBoardKg(text), ...hitFiboTerms(text)]
  // specs 路：用实体命中词面 + 标题做关键词（实体词面已是「需求里真实出现的领域词」）
  const keywords = [title, ...entities.map((e) => e.matchedTerm)].filter(termEligible)
  const relatedSpecs = searchSpecs(keywords, 8)
  return {
    title,
    description,
    entities,
    relatedSpecs,
    suggestedModules: inferModules(description),
    boundary: '规则式词面推演（非语义理解）：命中=词面提及，改造范围须人工确认；'
      + '实体短词不参与（防误报）、每路封顶 10 条；源缺席该路计 0（fail-soft）。',
    counts: {
      ontology: entities.filter((e) => e.source === 'ontology-instance').length,
      boardKg: entities.filter((e) => e.source === 'board-kg').length,
      fibo: entities.filter((e) => e.source === 'fibo-term').length,
      specs: relatedSpecs.length,
    },
  }
}
