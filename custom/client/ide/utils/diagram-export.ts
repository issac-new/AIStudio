// overlay/custom/client/ide/utils/diagram-export.ts
// Vue Flow 活图 → SwarmStudio 品牌静态 HTML+SVG 导出（spec 项6）。
// 纯函数：nodes/edges + 绝对坐标 → 自包含 HTML（正交连线 r=8、标签 paper 遮罩、
// a11y title/desc、4px 网格、font source=system）。
// 品牌 token 为客户端副本（client 不 import server 模块，仓库既有边界）；
// custom/server/diagram/__tests__ 的三方绊线测试与 profile 单一事实源对账。
export const CLIENT_BRAND = {
  paper: '#fafafa',
  paper2: '#f0f0f0',
  ink: '#1a1a1a',
  muted: '#666666',
  soft: '#6b6b6b',
  ruleSolid: '#e0e0e0',
  accent: '#333333',
  link: '#2e6db4',
  error: '#c62828',
  warning: '#f57f17',
} as const

const FONT_SANS = "'Geist', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
const FONT_SERIF = "'Instrument Serif', 'Noto Serif', 'PingFang SC', serif"
const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export interface FlowExportNode {
  id: string
  label: string
  sublabel?: string
  /** 状态语义：failed=error 描边，running=虚线描边，warning=琥珀描边（文本仍承载含义） */
  status?: 'failed' | 'running' | 'done' | 'pending' | 'warning'
  x: number
  y: number
  w?: number
  h?: number
}

export interface FlowExportEdge {
  from: string
  to: string
  label?: string
  /** 走过的边加粗；回边 dashed */
  strong?: boolean
  dashed?: boolean
  /** 非法边（校验判红）：error 描边加粗——如实入图，草稿态不化妆 */
  invalid?: boolean
}

const PAD = 24
const DEFAULT_W = 176
const DEFAULT_H = 58

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function round4(n: number): number {
  return Math.ceil(n / 4) * 4
}

function hasCjk(value: string): boolean {
  return /[⺀-鿿豈-﫿︰-﹏＀-￯]/.test(value)
}

function textWidth(value: string, fontSize: number, mono = false): number {
  let units = 0
  for (const ch of value) {
    if (/[⺀-鿿豈-﫿︰-﹏＀-￯]/.test(ch)) units += 1
    else units += mono ? 0.62 : 0.6
  }
  return units * fontSize
}

/** 正交肘形（r=8 圆角，禁对角线——连线硬规则同源服务端渲染器） */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`
  const midX = (x1 + x2) / 2
  const sx = x2 >= x1 ? 1 : -1
  const sy = y2 >= y1 ? 1 : -1
  const r = Math.min(8, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2)
  return [
    `M ${x1} ${y1}`,
    `L ${round4(midX - sx * r)} ${y1}`,
    `Q ${midX} ${y1} ${midX} ${round4(y1 + sy * r)}`,
    `L ${midX} ${round4(y2 - sy * r)}`,
    `Q ${midX} ${y2} ${round4(midX + sx * r)} ${y2}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

/** 回边（目标在源左侧）：源底部出发绕行到目标底部 */
function backRoute(x1: number, y1: number, x2: number, y2: number): string {
  const drop = 24
  const below = round4(Math.max(y1, y2) + drop)
  const r = 8
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${below - r}`,
    `Q ${x1} ${below} ${x1 - r} ${below}`,
    `L ${round4(x2 + r)} ${below}`,
    `Q ${x2} ${below} ${x2} ${below - r}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

export function exportFlowDiagramHtml(
  nodes: FlowExportNode[],
  edges: FlowExportEdge[],
  options: { title?: string; desc?: string } = {},
): string {
  if (nodes.length === 0) throw new Error('导出需要至少一个节点')
  const placed = nodes.map((n) => ({
    ...n,
    w: n.w ?? DEFAULT_W,
    h: n.h ?? DEFAULT_H,
  }))
  const minX = Math.min(...placed.map((n) => n.x)) - PAD
  const minY = Math.min(...placed.map((n) => n.y)) - PAD - 8
  const maxX = Math.max(...placed.map((n) => n.x + n.w)) + PAD
  // 回边绕行底部需要额外余量
  const hasBack = edges.some((e) => {
    const s = placed.find((n) => n.id === e.from)
    const t = placed.find((n) => n.id === e.to)
    return s && t && t.x + t.w / 2 < s.x + s.w / 2
  })
  const maxY = Math.max(...placed.map((n) => n.y + n.h)) + PAD + (hasBack ? 48 : 0)
  const width = round4(maxX - minX)
  const height = round4(maxY - minY)
  const ox = -minX
  const oy = -minY
  const at = new Map(placed.map((n) => [n.id, n]))

  const title = options.title?.trim() || '执行图'
  const desc = options.desc?.trim() || `执行图：${placed.length} 个节点、${edges.length} 条边`
  const uid = `fx${placed.length.toString(36)}${edges.length.toString(36)}`

  const parts: string[] = []
  for (const e of edges) {
    const s = at.get(e.from)
    const t = at.get(e.to)
    if (!s || !t) continue
    const sx = round4(s.x + s.w + ox)
    const sy = round4(s.y + s.h / 2 + oy)
    const tx = round4(t.x + ox)
    const ty = round4(t.y + t.h / 2 + oy)
    const backward = t.x + t.w / 2 < s.x + s.w / 2
    const d = backward
      ? backRoute(round4(s.x + s.w / 2 + ox), round4(s.y + s.h + oy), round4(t.x + t.w / 2 + ox), round4(t.y + t.h + oy))
      : elbow(sx, sy, tx, ty)
    const dash = e.dashed ? ' stroke-dasharray="6 4"' : ''
    const invalid = e.invalid === true
    const stroke = invalid ? CLIENT_BRAND.error : e.strong ? CLIENT_BRAND.accent : CLIENT_BRAND.muted
    const widthAttr = invalid || e.strong ? 1.6 : 1
    parts.push(`<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${widthAttr}"${dash} marker-end="url(#fx-arrow)"/>`)
    if (e.label) {
      const cjk = hasCjk(e.label)
      const size = cjk ? 11 : 8
      const lw = round4(textWidth(e.label, size, !cjk) + 12)
      const lh = cjk ? 16 : 12
      const lx = backward ? round4((s.x + t.x + t.w) / 2 + ox) : round4((sx + tx) / 2)
      const ly = backward ? round4(Math.max(s.y + s.h, t.y + t.h) + 24 + oy) : round4((sy + ty) / 2)
      parts.push(`<rect x="${round4(lx - lw / 2)}" y="${round4(ly - lh / 2)}" width="${lw}" height="${lh}" rx="4" fill="${CLIENT_BRAND.paper}"/>`)
      parts.push(`<text x="${lx}" y="${ly + (cjk ? 4 : 3)}" text-anchor="middle" font-family='${cjk ? FONT_SANS : FONT_MONO}' font-size="${size}" fill="${CLIENT_BRAND.muted}">${esc(e.label)}</text>`)
    }
  }
  for (const n of placed) {
    const x = round4(n.x + ox)
    const y = round4(n.y + oy)
    const stroke = n.status === 'failed' ? CLIENT_BRAND.error
      : n.status === 'warning' ? CLIENT_BRAND.warning
        : CLIENT_BRAND.ink
    const dash = n.status === 'running' ? ' stroke-dasharray="6 4"' : ''
    parts.push(`<rect x="${x}" y="${y}" width="${round4(n.w)}" height="${round4(n.h)}" rx="6" fill="#ffffff" stroke="${stroke}" stroke-width="1"${dash}/>`)
    parts.push(`<text x="${x + 12}" y="${y + 22}" font-family='${FONT_SANS}' font-size="12" font-weight="600" fill="${CLIENT_BRAND.ink}">${esc(n.label)}</text>`)
    if (n.sublabel) {
      parts.push(`<text x="${x + 12}" y="${y + 40}" font-family='${FONT_MONO}' font-size="9" fill="${CLIENT_BRAND.soft}">${esc(n.sublabel)}</text>`)
    }
  }

  const svg = [
    `<svg role="img" aria-labelledby="${uid}-title ${uid}-desc" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="${uid}-title">${esc(title)}</title>`,
    `<desc id="${uid}-desc">${esc(desc)}</desc>`,
    `<defs><marker id="fx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${CLIENT_BRAND.muted}"/></marker></defs>`,
    ...parts,
    '</svg>',
  ].join('\n')

  return [
    '<!doctype html>',
    '<html lang="zh"><head><meta charset="utf-8">',
    `<title>${esc(title)}</title>`,
    '<style>',
    `body{background:${CLIENT_BRAND.paper};margin:0;padding:24px;font-family:${FONT_SANS};}`,
    `h1{font-family:${FONT_SERIF};font-size:1.75rem;font-weight:400;color:${CLIENT_BRAND.ink};margin:0 0 16px;}`,
    'svg{display:block;max-width:100%;height:auto;}',
    '</style></head><body>',
    `<h1>${esc(title)}</h1>`,
    svg,
    '</body></html>',
  ].join('\n')
}

/** 浏览器侧落盘：Blob 下载（无服务端依赖） */
export function downloadHtml(html: string, filename: string): void {
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
