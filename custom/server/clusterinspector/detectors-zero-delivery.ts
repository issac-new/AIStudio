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
// 分类判据（2026-10-16 产品化，card-classify.ts）：治理/台账类卡合法无锚→静默
// 剔除（计入 detail.governanceNoAnchor 可反查）；研发类零锚→warn 强告警；不确定
// （双命中/双不命中）→维持人工分诊文案。uncertain 残留仍禁升 high——分类不确定
// 时高噪高级别=告警疲劳（run20 巡检官致盲史的同型教训）。
//
// fail-open：runningCards/profiles 面未接线=合法空态静默（同族检测器语义）。
import type { ClusterSnapshot } from './collectors'
import type { Anomaly, DetectOptions } from './detectors'
import { classifyCard } from './card-classify'

/** commit= 锚（卡 body 内的交付凭证行，形如 `commit=1a2b3c4d`） */
const COMMIT_ANCHOR_RE = /(?:^|\s)commit=[0-9a-f]{7,40}/i

/** ── 零交付检测（run20 复盘产品化）──
 *  判据：done/completed 卡 ∧ 无 branch_name ∧ body 无 commit= 锚。
 *  输出：单条聚合异常（subject=board:zero-delivery-candidates），detail 带候选
 *  卡清单（≤20 张防载荷爆）+ 分诊提示。 */
export function detectZeroDelivery(snap: ClusterSnapshot, _opts: DetectOptions = {}): Anomaly[] {
  if (!snap.runningCards.ok) return []
  const governanceNoAnchor: Array<Record<string, unknown>> = []
  const suspects = snap.runningCards.cards.filter((c) => {
    if (!['done', 'completed'].includes(String(c.status ?? '').toLowerCase())) return false
    if ((c.branch_name ?? '').trim()) return false           // 有分支引用→归 anchor-missing 面
    const body = typeof c.body === 'string' ? c.body : ''
    if (COMMIT_ANCHOR_RE.test(body)) return false            // 有 commit 锚=凭证在位
    // 分类判据（run20 复盘件 4/4）：治理/台账类卡合法无锚——静默（计入明细不告警）；
    // 研发类零锚=零交付（强告警）；不确定=维持人工分诊。判据单一源=card-classify.ts。
    const cls = classifyCard(c as Parameters<typeof classifyCard>[0])
    if (cls === 'governance') {
      governanceNoAnchor.push({ card: c.id, title: c.title, cls })
      return false
    }
    return true                                              // delivery + uncertain 入候选
  })
  if (suspects.length === 0) return []
  return [{
    detector: 'completion.zero-delivery',
    subject: 'board:zero-delivery-candidates',
    severity: 'warn',
    summary: `零交付 ${suspects.length} 张：done 卡既无交付分支引用、body 又无 commit= 锚`
      + `（${suspects.slice(0, 3).map((c) => c.id).join('、')}${suspects.length > 3 ? ' 等' : ''}）`
      + '——研发交付类卡零凭证（分类判据：标题规则，治理/台账类已静默剔除）；请补 commit 锚/分支引用或改状态',
    detail: {
      candidates: suspects.slice(0, 20).map((c) => ({
        card: c.id, title: c.title, assignee: c.assignee, status: c.status,
        cls: classifyCard(c as Parameters<typeof classifyCard>[0]),
      })),
      total: suspects.length,
      governanceNoAnchor: governanceNoAnchor.slice(0, 20),   // 合法无锚清单（静默但可反查）
      note: '分类=card-classify.ts 标题规则（v1）：governance 静默剔除、delivery 强告警、'
            + 'uncertain 维持人工分诊（双命中/双不命中禁机器臆断）',
    },
  }]
}
