// overlay[expertise]: 协作画像「谁懂什么」证据提炼纯函数（2026-10-23 天猫数字员工两文吸收轮）。
// 文章口径（协作篇 §6.3/§7.2 协作维度）：从真实痕迹提炼「人 × 业务概念 × 证据」画像——
// 谁最熟这个概念、什么类型的问题该找谁、此刻找不找得到；每次推荐挂可回查原文证据。
// SwarmStudio 证据源（spec D8；实测约束：SIM gc_messages 空表且 senderType 无人类/AI
// 判别位 → 不依赖聊天库）：
//   ① 推演台账 dispatch-preset（from=<人> text=<原话>）——人在协作现场留下的业务话迹
//   ② 看板 slug（28 块全为 <人>-<域> 形态，如 chen-pay-api）——人长期负责的业务域
//   ③ 任务标题/结果关键词（挂在板 owner 名下，锚到 taskId）

export interface EvidenceEntry {
  person: string
  /** 概念词（检索面：term 命中即候选） */
  term: string
  source: 'compensation-ledger' | 'kanban-board' | 'kanban-task'
  snippet: string
  anchor: string
  tsMs: number
}

/** 概念词停用表：结构性词不进画像（避免「任务/测试」这类词淹没有效概念） */
const STOP_TERMS = new Set([
  '任务', '测试', '需求', '进行', '完成', '处理', '相关', '以及', '一个', '这个',
  // 派发词模板后缀话术（「（预写派发词代演人类派单）」的二元组切分残留——2026-10-23
  // 卫生批 D15：先剥括注再兜底停用）
  '人类', '代演', '写派', '发任', '件事', '一件', '预写', '派单', '派发', '话务',
  '分析', '评审', '上线', '更新', '优化', '支持', '确认', '问题', '接口', '补登',
  'task', 'test', 'run', 'the', 'and', 'for', 'with',
  // 台账结构词/话迹噪音（2026-10-23 活体走查实录：open=status 列残留、matrix=群域名、
  // agent 后缀词=自指；run 形态词不再拼入抽取文本，此表兜底历史形态）
  'open', 'status', 'resolution', 'backfill', 'matrix', 'agent', 'agents', 'desc',
])

/** 结构词形过滤：*-agent 自指词、run id 形态（20261021-v8-run22）、纯数字词不进概念表 */
function isStructuralTerm(term: string): boolean {
  if (/^(\d{6,})/.test(term)) return true
  if (/^[a-z]+-agent$/.test(term)) return true
  if (/^v\d/.test(term)) return true
  return false
}

/** 文本 → 概念词候选：拉丁词（≥2 字符小写）+ CJK 二元组；去停用词、按频次取 topK */
export function extractTerms(text: string, topK = 8): Array<{ term: string; count: number }> {
  const counts = new Map<string, number>()
  const latin = text.match(/[A-Za-z][A-Za-z0-9_-]{1,31}/g) ?? []
  for (const w of latin) {
    const t = w.toLowerCase()
    if (STOP_TERMS.has(t) || isStructuralTerm(t)) continue
    counts.set(t, (counts.get(t) ?? 0) + 1)
  }
  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i + 2 <= run.length; i += 1) {
      const t = run.slice(i, i + 2)
      if (STOP_TERMS.has(t)) continue
      counts.set(t, (counts.get(t) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .map(([term, count]) => ({ term, count }))
    .sort((a, b) => b.count - a.count || a.term.localeCompare(b.term))
    .slice(0, topK)
}

/** 看板 slug → 归属人（28 板实测 <人>-<域> 形态；通用团队前缀归为团队节点） */
const TEAM_PREFIXES = new Set(['ops', 'secops', 'arch', 'audit'])

export function boardOwnerOf(slug: string): { owner: string; domain: string } | null {
  const m = /^([a-z]{2,10})-(.+)$/.exec(slug)
  if (!m) return null
  return { owner: m[1], domain: m[2] }
}

/** 台账 dispatch-preset 行 → 证据（from=人 才算人的话迹；system 行不产证据） */
export function evidenceFromLedger(rows: Array<{ id: string; ts: string; type: string; detail: string }>, run: string, ledgerTsToMs: (ts: string) => number): EvidenceEntry[] {
  const out: EvidenceEntry[] = []
  for (const row of rows) {
    if (row.type !== 'dispatch-preset') continue
    const from = /^from=(\S+)/.exec(row.detail)?.[1]
    if (!from) continue
    let text = / text=(.*)$/s.exec(row.detail)?.[1] ?? row.detail
    // D15：剥派发词统一模板括注（「（预写派发词代演人类派单）」等）——结构话术非业务概念
    text = text.replace(/（[^（）]*(?:代演|预写|派单)[^（）]*）/g, '').replace(/（用户/g, '')
    for (const { term } of extractTerms(text, 4)) {
      out.push({
        person: from,
        term,
        source: 'compensation-ledger',
        snippet: clip(text, 100),
        anchor: `${run}#${row.id}`,
        tsMs: ledgerTsToMs(row.ts),
      })
    }
  }
  return out
}

function clip(text: string, max: number): string {
  const t = (text ?? '').trim()
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

export interface BoardEvidenceInput {
  slug: string
  tasks: Array<{ id: string; title: string; result: string | null; completedAt: number | null; createdAt: number | null }>
}

/** 看板 → 证据：slug 归属人 + 域概念（板级）+ 任务标题概念（任务级，锚 taskId） */
export function evidenceFromBoard(board: BoardEvidenceInput): EvidenceEntry[] {
  const owner = boardOwnerOf(board.slug)
  if (!owner) return []
  const out: EvidenceEntry[] = []
  const boardTs = board.tasks.reduce((best, t) => Math.max(best, (t.completedAt ?? t.createdAt ?? 0) * 1000), 0)
  // 板级：域概念（slug 余段按 - 切分，如 pay-api → pay/api/pay-api）
  const domainParts = owner.domain.split('-').filter(Boolean)
  const domainTerms = new Set([...domainParts, owner.domain])
  for (const term of domainTerms) {
    if (STOP_TERMS.has(term)) continue
    out.push({
      person: owner.owner,
      term,
      source: 'kanban-board',
      snippet: `负责看板 ${board.slug}（${board.tasks.length} 任务）`,
      anchor: board.slug,
      tsMs: boardTs,
    })
  }
  // 任务级：标题概念，锚 taskId（每板最多 6 条，防大板淹没有效信号）
  const titleText = board.tasks.map(t => t.title).join('\n')
  for (const { term } of extractTerms(titleText, 6)) {
    if (domainTerms.has(term) || STOP_TERMS.has(term)) continue
    const hit = board.tasks.find(t => t.title.toLowerCase().includes(term) || t.title.includes(term))
    out.push({
      person: owner.owner,
      term,
      source: 'kanban-task',
      snippet: hit ? clip(hit.title, 80) : clip(term, 80),
      anchor: hit ? hit.id : board.slug,
      tsMs: boardTs,
    })
  }
  return out
}

export interface PersonProfile {
  person: string
  concepts: Array<{ term: string; count: number; lastTsMs: number }>
  evidenceTotal: number
  lastActiveMs: number
  sources: string[]
}

/** 证据集 → 画像墙（人 → 概念列表，按证据数排序） */
export function buildWall(evidence: EvidenceEntry[]): { persons: PersonProfile[]; evidenceCount: number } {
  const byPerson = new Map<string, EvidenceEntry[]>()
  for (const e of evidence) {
    const list = byPerson.get(e.person) ?? []
    list.push(e)
    byPerson.set(e.person, list)
  }
  const persons: PersonProfile[] = []
  for (const [person, list] of byPerson) {
    const byTerm = new Map<string, { count: number; lastTsMs: number }>()
    for (const e of list) {
      const t = byTerm.get(e.term) ?? { count: 0, lastTsMs: 0 }
      t.count += 1
      t.lastTsMs = Math.max(t.lastTsMs, e.tsMs)
      byTerm.set(e.term, t)
    }
    persons.push({
      person,
      concepts: [...byTerm.entries()]
        .map(([term, v]) => ({ term, ...v }))
        .sort((a, b) => b.count - a.count || b.lastTsMs - a.lastTsMs)
        .slice(0, 12),
      evidenceTotal: list.length,
      lastActiveMs: list.reduce((m, e) => Math.max(m, e.tsMs), 0),
      sources: [...new Set(list.map(e => e.source))],
    })
  }
  persons.sort((a, b) => b.evidenceTotal - a.evidenceTotal || a.person.localeCompare(b.person))
  return { persons, evidenceCount: evidence.length }
}

export interface SearchCandidate {
  person: string
  /** 评分=匹配概念证据数×2 + 新近度（30 天半衰）；仅排序用，非精确度量 */
  score: number
  matchedTerms: string[]
  evidence: Array<{ source: string; snippet: string; anchor: string; tsMs: number }>
}

/** 概念检索 → 候选人排序（D8：证据数×2 + 30 天半衰新近度；每条挂可回查证据） */
export function searchExpertise(evidence: EvidenceEntry[], query: string, nowMs = Date.now()): SearchCandidate[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const matched = evidence.filter(e => e.term === q || e.term.includes(q) || q.includes(e.term))
  const byPerson = new Map<string, EvidenceEntry[]>()
  for (const e of matched) {
    const list = byPerson.get(e.person) ?? []
    list.push(e)
    byPerson.set(e.person, list)
  }
  const out: SearchCandidate[] = []
  for (const [person, list] of byPerson) {
    const ageDays = Math.max(0, (nowMs - Math.max(...list.map(e => e.tsMs || nowMs))) / 86_400_000)
    const score = list.length * 2 + Math.pow(0.5, ageDays / 30)
    out.push({
      person,
      score: Math.round(score * 10) / 10,
      matchedTerms: [...new Set(list.map(e => e.term))].slice(0, 6),
      evidence: [...list]
        .sort((a, b) => b.tsMs - a.tsMs)
        .slice(0, 5)
        .map(e => ({ source: e.source, snippet: e.snippet, anchor: e.anchor, tsMs: e.tsMs })),
    })
  }
  return out.sort((a, b) => b.score - a.score || a.person.localeCompare(b.person))
}
