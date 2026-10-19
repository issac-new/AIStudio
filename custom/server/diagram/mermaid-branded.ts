// overlay/custom/server/diagram/mermaid-branded.ts
// Mermaid IR → SwarmStudio 品牌 HTML+SVG 重绘（spec 项5）。
//
// 「提取内容、丢弃源样式」（diagram-design import 教义）：IR 只携带节点/边/标签语义，
// 视觉全部由品牌 token 与连线硬规则（正交走线 r=8、标签垫 paper 遮罩、4px 网格）重建。
// 覆盖 flowchart 与 sequenceDiagram 两类；其余 kind 由调用方如实回退（不假装覆盖）。
import { BRAND, FONT_MONO, FONT_SANS, FONT_SERIF, escapeXml, hasCjk, round4, textWidth } from './brand-tokens'

export interface MermaidIrNode {
  id: string
  label: string
  shape: string
  container?: boolean
  in_degree?: number
  out_degree?: number
}

export interface MermaidIrEdge {
  source: string
  target: string
  label?: string
  style?: string
  arrowhead?: string
  order?: number
}

export interface MermaidIrDiagram {
  kind: string
  direction?: string
  nodes: MermaidIrNode[]
  edges: MermaidIrEdge[]
}

export const SUPPORTED_KINDS = new Set(['flowchart', 'sequenceDiagram', 'stateDiagram-v2'])

const PAD = 24
const GAP_X = 72
const GAP_Y = 32
const NODE_H = 40

interface Placed {
  node: MermaidIrNode
  x: number
  y: number
  w: number
  h: number
}

function nodeSize(node: MermaidIrNode): { w: number; h: number } {
  if (node.shape === 'start' || node.shape === 'end') return { w: 24, h: 24 }
  const label = node.label || node.id
  const textW = textWidth(label, 12)
  if (node.shape === 'rhombus') return { w: round4(Math.max(80, textW + 48)), h: 56 }
  if (node.shape === 'cylinder') return { w: round4(Math.max(72, textW + 32)), h: 52 }
  return { w: round4(Math.max(64, textW + 24)), h: NODE_H }
}

/** longest-path 分层（DAG 直取；含环时 Kahn 残余逐点置 maxPred+1，有界迭代） */
function layerOf(nodes: MermaidIrNode[], edges: MermaidIrEdge[]): Map<string, number> {
  const layer = new Map<string, number>()
  const indeg = new Map<string, number>()
  const succ = new Map<string, string[]>()
  for (const n of nodes) { indeg.set(n.id, 0); succ.set(n.id, []) }
  for (const e of edges) {
    if (!indeg.has(e.target) || !succ.has(e.source)) continue
    indeg.set(e.target, (indeg.get(e.target) ?? 0) + 1)
    succ.get(e.source)!.push(e.target)
  }
  const queue = nodes.filter((n) => (indeg.get(n.id) ?? 0) === 0).map((n) => n.id)
  for (const id of queue) layer.set(id, 0)
  let guard = nodes.length * 4 + 8
  while (queue.length && guard-- > 0) {
    const id = queue.shift()!
    for (const t of succ.get(id) ?? []) {
      const cand = (layer.get(id) ?? 0) + 1
      if (cand > (layer.get(t) ?? -1)) layer.set(t, cand)
      indeg.set(t, (indeg.get(t) ?? 0) - 1)
      if (indeg.get(t) === 0) queue.push(t)
    }
  }
  for (const n of nodes) if (!layer.has(n.id)) layer.set(n.id, 0)
  return layer
}

/** 正交肘形路径（r=8 圆角，六条连线硬规则之一：禁对角线） */
function elbowPath(x1: number, y1: number, x2: number, y2: number, horizontal: boolean): string {
  const r = 8
  if (horizontal) {
    if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`
    const midX = (x1 + x2) / 2
    const sx = x2 >= x1 ? 1 : -1
    const sy = y2 >= y1 ? 1 : -1
    const rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2)
    return [
      `M ${x1} ${y1}`,
      `L ${midX - sx * rr} ${y1}`,
      `Q ${midX} ${y1} ${midX} ${y1 + sy * rr}`,
      `L ${midX} ${y2 - sy * rr}`,
      `Q ${midX} ${y2} ${midX + sx * rr} ${y2}`,
      `L ${x2} ${y2}`,
    ].join(' ')
  }
  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`
  const midY = (y1 + y2) / 2
  const sx = x2 >= x1 ? 1 : -1
  const sy = y2 >= y1 ? 1 : -1
  const rr = Math.min(r, Math.abs(x2 - x1) / 2, Math.abs(y2 - y1) / 2)
  return [
    `M ${x1} ${y1}`,
    `L ${x1} ${midY - sy * rr}`,
    `Q ${x1} ${midY} ${x1 + sx * rr} ${midY}`,
    `L ${x2 - sx * rr} ${midY}`,
    `Q ${x2} ${midY} ${x2} ${midY + sy * rr}`,
    `L ${x2} ${y2}`,
  ].join(' ')
}

function edgeLabel(text: string, x: number, y: number): string {
  if (!text) return ''
  const cjk = hasCjk(text)
  const size = cjk ? 11 : 8
  const font = cjk ? FONT_SANS : FONT_MONO
  const w = round4(textWidth(text, size, !cjk) + 12)
  const h = cjk ? 16 : 12
  return [
    `<rect x="${round4(x - w / 2)}" y="${round4(y - h / 2)}" width="${w}" height="${h}" rx="4" fill="${BRAND.paper}"/>`,
    `<text x="${x}" y="${y + (cjk ? 4 : 3)}" text-anchor="middle" font-family='${font}' font-size="${size}"${cjk ? ' font-weight="500"' : ''} fill="${BRAND.muted}">${escapeXml(text)}</text>`,
  ].join('')
}

function nodeShape(p: Placed): string {
  const { node, x, y, w, h } = p
  const label = escapeXml(node.label || node.id)
  const cx = x + w / 2
  const cy = y + h / 2
  if (node.shape === 'start') {
    return `<circle cx="${cx}" cy="${cy}" r="10" fill="${BRAND.ink}"/>`
  }
  if (node.shape === 'end') {
    return [
      `<circle cx="${cx}" cy="${cy}" r="11" fill="none" stroke="${BRAND.ink}" stroke-width="1.2"/>`,
      `<circle cx="${cx}" cy="${cy}" r="6" fill="${BRAND.ink}"/>`,
    ].join('')
  }
  const text = `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-family='${FONT_SANS}' font-size="12" font-weight="600" fill="${BRAND.ink}">${label}</text>`
  if (node.shape === 'rhombus') {
    return `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="#ffffff" stroke="${BRAND.ink}" stroke-width="1"/>${text}`
  }
  if (node.shape === 'cylinder') {
    const ry = 8
    return [
      `<path d="M ${x} ${y + ry} L ${x} ${y + h - ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + h - ry} L ${x + w} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x} ${y + ry}" fill="#ffffff" stroke="${BRAND.ink}" stroke-width="1"/>`,
      `<path d="M ${x} ${y + ry} A ${w / 2} ${ry} 0 0 0 ${x + w} ${y + ry}" fill="none" stroke="${BRAND.ink}" stroke-width="1"/>`,
      text,
    ].join('')
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#ffffff" stroke="${BRAND.ink}" stroke-width="1"/>${text}`
}

export function renderFlowchart(diagram: MermaidIrDiagram): { svg: string; width: number; height: number } {
  const horizontal = (diagram.direction ?? 'TD').toUpperCase() !== 'TD'
  const layers = layerOf(diagram.nodes, diagram.edges)
  const byLayer = new Map<number, MermaidIrNode[]>()
  for (const n of diagram.nodes) {
    const l = layers.get(n.id) ?? 0
    if (!byLayer.has(l)) byLayer.set(l, [])
    byLayer.get(l)!.push(n)
  }
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b)
  const sizes = new Map(diagram.nodes.map((n) => [n.id, nodeSize(n)]))
  const majorDim = (id: string) => (horizontal ? sizes.get(id)!.w : sizes.get(id)!.h)
  const minorDim = (id: string) => (horizontal ? sizes.get(id)!.h : sizes.get(id)!.w)
  const colMajor = layerKeys.map((l) => Math.max(...byLayer.get(l)!.map((n) => majorDim(n.id))))
  const colMinorTotal = layerKeys.map((l) => {
    const nodes = byLayer.get(l)!
    return nodes.reduce((s, n) => s + minorDim(n.id), 0) + (nodes.length - 1) * GAP_Y
  })
  const minorSpan = Math.max(...colMinorTotal)
  const width = PAD * 2 + colMajor.reduce((s, v) => s + v, 0) + (layerKeys.length - 1) * GAP_X
  const height = PAD * 2 + minorSpan

  const placed = new Map<string, Placed>()
  let cursor = PAD
  layerKeys.forEach((l, i) => {
    let minor = PAD + (minorSpan - colMinorTotal[i]) / 2
    for (const n of byLayer.get(l)!) {
      const s = sizes.get(n.id)!
      const x = horizontal ? cursor : minor
      const y = horizontal ? minor : cursor
      placed.set(n.id, { node: n, x: round4(x), y: round4(y), w: s.w, h: s.h })
      minor += minorDim(n.id) + GAP_Y
    }
    cursor += colMajor[i] + GAP_X
  })

  const parts: string[] = []
  for (const e of diagram.edges) {
    const s = placed.get(e.source)
    const t = placed.get(e.target)
    if (!s || !t) continue
    const x1 = horizontal ? s.x + s.w : s.x + s.w / 2
    const y1 = horizontal ? s.y + s.h / 2 : s.y + s.h
    const x2 = horizontal ? t.x : t.x + t.w / 2
    const y2 = horizontal ? t.y + t.h / 2 : t.y
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6 4"' : ''
    parts.push(`<path d="${elbowPath(round4(x1), round4(y1), round4(x2), round4(y2), horizontal)}" fill="none" stroke="${BRAND.muted}" stroke-width="1"${dash} marker-end="url(#arrow)"/>`)
    if (e.label) parts.push(edgeLabel(e.label, round4((x1 + x2) / 2), round4((y1 + y2) / 2)))
  }
  for (const p of placed.values()) parts.push(nodeShape(p))
  return { svg: parts.join('\n'), width, height }
}

export function renderSequence(diagram: MermaidIrDiagram): { svg: string; width: number; height: number } {
  const participants = diagram.nodes
  const headH = 36
  const headW = new Map(participants.map((p) => [p.id, round4(Math.max(96, textWidth(p.label || p.id, 12) + 28))]))
  const colGap = 56
  const xs = new Map<string, number>()
  let cursor = PAD
  for (const p of participants) {
    xs.set(p.id, cursor + headW.get(p.id)! / 2)
    cursor += headW.get(p.id)! + colGap
  }
  const width = cursor - colGap + PAD
  const rowGap = 56
  const firstY = PAD + headH + 40
  const lastY = firstY + Math.max(0, diagram.edges.length - 1) * rowGap
  const height = lastY + 32 + PAD

  const parts: string[] = []
  for (const p of participants) {
    const cx = xs.get(p.id)!
    const hw = headW.get(p.id)!
    parts.push(`<line x1="${cx}" y1="${PAD + headH}" x2="${cx}" y2="${height - PAD}" stroke="${BRAND.ruleSolid}" stroke-width="1" stroke-dasharray="4 4"/>`)
    parts.push(`<rect x="${round4(cx - hw / 2)}" y="${PAD}" width="${hw}" height="${headH}" rx="6" fill="${BRAND.paper2}" stroke="${BRAND.ink}" stroke-width="1"/>`)
    parts.push(`<text x="${cx}" y="${PAD + headH / 2 + 4}" text-anchor="middle" font-family='${FONT_SANS}' font-size="12" font-weight="600" fill="${BRAND.ink}">${escapeXml(p.label || p.id)}</text>`)
  }
  diagram.edges.forEach((e, i) => {
    const y = firstY + i * rowGap
    const x1 = xs.get(e.source)
    const x2 = xs.get(e.target)
    if (x1 === undefined || x2 === undefined) return
    const dash = e.style === 'dashed' ? ' stroke-dasharray="6 4"' : ''
    if (e.source === e.target) {
      parts.push(`<path d="M ${x1} ${y} C ${x1 + 36} ${y - 16} ${x1 + 36} ${y + 16} ${x1 + 4} ${y + 16}" fill="none" stroke="${BRAND.muted}" stroke-width="1"${dash} marker-end="url(#arrow)"/>`)
    } else {
      parts.push(`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${BRAND.muted}" stroke-width="1"${dash} marker-end="url(#arrow)"/>`)
    }
    if (e.label) parts.push(edgeLabel(e.label, round4((x1 + x2) / 2), y - 12))
  })
  return { svg: parts.join('\n'), width, height }
}

function svgShell(prefix: string, title: string, desc: string, width: number, height: number, body: string): string {
  return [
    `<svg role="img" aria-labelledby="${prefix}-title ${prefix}-desc" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">`,
    `<title id="${prefix}-title">${escapeXml(title)}</title>`,
    `<desc id="${prefix}-desc">${escapeXml(desc)}</desc>`,
    `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${BRAND.muted}"/></marker></defs>`,
    body,
    '</svg>',
  ].join('\n')
}

export function htmlShell(title: string, svg: string): string {
  return [
    '<!doctype html>',
    '<html lang="zh"><head><meta charset="utf-8">',
    `<title>${escapeXml(title)}</title>`,
    '<style>',
    `body{background:${BRAND.paper};margin:0;padding:24px;font-family:${FONT_SANS};}`,
    `h1{font-family:${FONT_SERIF};font-size:1.75rem;font-weight:400;color:${BRAND.ink};margin:0 0 16px;}`,
    'svg{display:block;max-width:100%;height:auto;}',
    '</style></head><body>',
    `<h1>${escapeXml(title)}</h1>`,
    svg,
    '</body></html>',
  ].join('\n')
}

let counter = 0

/** IR → 完整自包含 HTML（品牌皮；不支持 kind 返回 null，调用方如实回退） */
export function renderBrandedHtml(diagram: MermaidIrDiagram, title?: string): { html: string; kind: string } | null {
  if (!SUPPORTED_KINDS.has(diagram.kind)) return null
  const rendered = diagram.kind === 'sequenceDiagram' ? renderSequence(diagram) : renderFlowchart(diagram)
  const prefix = `dg${(counter++).toString(36)}${diagram.nodes.length.toString(36)}`
  const fallbackTitle = diagram.kind === 'flowchart' ? '流程图' : diagram.kind === 'sequenceDiagram' ? '时序图' : '状态机'
  const t = title?.trim() || diagram.nodes.find((n) => n.shape !== 'start' && n.shape !== 'end')?.label || fallbackTitle
  const desc = diagram.kind === 'sequenceDiagram'
    ? `时序图：${diagram.nodes.length} 个参与方、${diagram.edges.length} 条消息`
    : `${fallbackTitle}：${diagram.nodes.length} 个节点、${diagram.edges.length} 条连线`
  const svg = svgShell(prefix, t, desc, rendered.width, rendered.height, rendered.svg)
  return { html: htmlShell(t, svg), kind: diagram.kind }
}
