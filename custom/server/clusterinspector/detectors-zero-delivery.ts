// detectors-zero-delivery.ts — 零交付遥测检测器（run20 复盘产品化，2026-10-16）
//
// 背景（run20 实锤）：收官工作台账遥测发现「done 状态但卡 body 无 commit= 锚的卡
// 31 张」——标记完成却无代码证据。当时的处置是收尾时人工逐张判定（治理/台账类卡
// 属合法无锚，研发交付类卡=零交付形态），判定滞留在报告层、无持续监测面。
// 本检测器把该遥测产品化：done 卡既无 branch_name 引用、body 又无 commit= 锚
// → 报 completion.zero-delivery（warn），附候选清单供人工分诊。
//
// 与既有检测器的边界（防重复报）：
//   - delivery.anchor-missing（detectDeliveryAnchor）：卡有 branch_name 但分支
//     不可反查——管「伪锚」；本检测器管「无锚」（done 但零交付引用）。
//   - completion.no-realwork（detectFakeCompletion）：负责人全程无真做行——管
//     「过程归属」；本检测管「结果凭证」。
//   - card.body-empty（detectCardBodyEmpty）：正文空——本检测要求 body 存在但
//     缺 commit= 锚（有正文、无凭证）。
// 误报口径：治理/台账/评审类卡合法无代码锚（run20 实测多数属此类）——故定级
// warn 且 summary 明示「须人工分诊」，禁一键升 high（分类判据未产品化前，
// 高噪高级别=告警疲劳，run20 巡检官致盲史的同型教训）。
//
// fail-open：runningCards/profiles 面未接线=合法空态静默（同族检测器语义）。
import type { ClusterSnapshot } from './collectors'
import type { Anomaly, DetectOptions } from './detectors'

/** commit= 锚（卡 body 内的交付凭证行，形如 `commit=1a2b3c4d`） */
const COMMIT_ANCHOR_RE = /(?:^|\s)commit=[0-9a-f]{7,40}/i

/** ── 零交付检测（run20 复盘产品化）──
 *  判据：done/completed 卡 ∧ 无 branch_name ∧ body 无 commit= 锚。
 *  输出：单条聚合异常（subject=board:zero-delivery-candidates），detail 带候选
 *  卡清单（≤20 张防载荷爆）+ 分诊提示。 */
export function detectZeroDelivery(snap: ClusterSnapshot, _opts: DetectOptions = {}): Anomaly[] {
  if (!snap.runningCards.ok) return []
  const suspects = snap.runningCards.cards.filter((c) => {
    if (!['done', 'completed'].includes(String(c.status ?? '').toLowerCase())) return false
    if ((c.branch_name ?? '').trim()) return false           // 有分支引用→归 anchor-missing 面
    const body = typeof c.body === 'string' ? c.body : ''
    return !COMMIT_ANCHOR_RE.test(body)                      // 无 commit 锚=零交付候选
  })
  if (suspects.length === 0) return []
  return [{
    detector: 'completion.zero-delivery',
    subject: 'board:zero-delivery-candidates',
    severity: 'warn',
    summary: `零交付候选 ${suspects.length} 张：done 卡既无交付分支引用、body 又无 commit= 锚`
      + `（${suspects.slice(0, 3).map((c) => c.id).join('、')}${suspects.length > 3 ? ' 等' : ''}）`
      + '——治理/台账类卡合法无锚，研发交付类卡=零交付形态；请逐张人工分诊（补凭证或改状态）',
    detail: {
      candidates: suspects.slice(0, 20).map((c) => ({
        card: c.id, title: c.title, assignee: c.assignee, status: c.status,
      })),
      total: suspects.length,
      note: '分类判据（治理类合法 vs 研发类零交付）未产品化——v1 只出候选清单，禁自动定罪',
    },
  }]
}
