// overlay/custom/client/ia2/utils/colWidths.ts
// 三栏宽度同步联动单一事实源（R6 补充：协作沟通 ↔ IDE 工作台布局宽度联动）。
// 两边各存各自的 localStorage（WorkbenchView ncwk.wb.* / IdeShell hermes_ide_layout
// + sidePane.width）是断的——用户指令「三栏的布局宽度要同步联动」：同一套宽度，
// 拖任一边另一边跟随。
// 本模块是唯一事实源：shared localStorage key + CustomEvent 广播（同页跨 store）。
// 历史 key 迁移（读时回填；写时只写共享 key，历史 key 不再写）。
export interface ColWidths {
  left: number
  right: number
}

const SHARED_KEY = 'ncwk.cols'
export const COL_WIDTHS_EVENT = 'ncwk:cols-changed'

const MIN_W = 180
const MAX_W = 560
const DEFAULT: ColWidths = { left: 280, right: 480 }

function clamp(w: number): number {
  return Math.min(MAX_W, Math.max(MIN_W, Math.round(w)))
}

// 历史 key（迁移源；读时若共享 key 无则回填）
const LEGACY = {
  left: 'ncwk.wb.leftWidth',
  right: 'ncwk.wb.rightWidth',
} as const

function readShared(): ColWidths | null {
  try {
    const raw = localStorage.getItem(SHARED_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ColWidths>
    if (typeof parsed.left !== 'number' || typeof parsed.right !== 'number') return null
    return { left: clamp(parsed.left), right: clamp(parsed.right) }
  } catch {
    return null
  }
}

function readLegacy(): Partial<ColWidths> {
  const out: Partial<ColWidths> = {}
  try {
    const lw = Number(localStorage.getItem(LEGACY.left))
    if (lw >= MIN_W && lw <= MAX_W) out.left = clamp(lw)
    const rw = Number(localStorage.getItem(LEGACY.right))
    if (rw >= MIN_W && rw <= MAX_W) out.right = clamp(rw)
  } catch { /* ignore */ }
  return out
}

/** 读共享宽度（历史 key 迁移回填；无则默认） */
export function readColWidths(): ColWidths {
  const shared = readShared()
  if (shared) return shared
  const legacy = readLegacy()
  const widths: ColWidths = {
    left: legacy.left ?? DEFAULT.left,
    right: legacy.right ?? DEFAULT.right,
  }
  // 历史 key 迁移：回填共享 key（下次读直接命中）
  writeColWidths(widths, { silent: true })
  return widths
}

/** 写共享宽度并广播（同页跨 store 同步；silent 迁移不写广播防抖动） */
export function writeColWidths(widths: ColWidths, opts: { silent?: boolean } = {}): void {
  const clamped: ColWidths = { left: clamp(widths.left), right: clamp(widths.right) }
  try {
    localStorage.setItem(SHARED_KEY, JSON.stringify(clamped))
  } catch { /* 存储满静默 */ }
  if (!opts.silent && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ColWidths>(COL_WIDTHS_EVENT, { detail: clamped }))
  }
}

/** 单边更新（left/right 其一），另一边保留现值 */
export function updateColWidth(side: 'left' | 'right', width: number): ColWidths {
  // 运行时防线：vite 无 vue-tsc，TS 类型在运行期不生效。非法侧名（如把组件内
  // 栏位 id sidebar/sidepane 直接传入）会在 writeColWidths 摘键时被静默丢弃——
  // 拖了不生效且无报错。此处当场抛错，把错配暴露在发生点。
  if (side !== 'left' && side !== 'right') {
    throw new Error(`updateColWidth: invalid side "${String(side)}" (expect "left" | "right")`)
  }
  const cur = readColWidths()
  const next: ColWidths = { ...cur, [side]: clamp(width) }
  writeColWidths(next)
  return next
}

/** 订阅宽度变化（返回退订函数） */
export function onColWidthsChange(cb: (widths: ColWidths) => void): () => void {
  const handler = (e: Event): void => {
    const detail = (e as CustomEvent<ColWidths>).detail
    if (detail) cb(detail)
  }
  window.addEventListener(COL_WIDTHS_EVENT, handler)
  return () => window.removeEventListener(COL_WIDTHS_EVENT, handler)
}
