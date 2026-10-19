// overlay/custom/client/ide/utils/mermaid-brand.ts
// wiki 页 mermaid 块的「品牌重绘」分段与服务端调用（spec 项5 客户端）。
// 语义：开=逐块走服务端 /mermaid-brand（提取器+品牌重绘）；失败/不支持图型
// 如实回退该块为原 mermaid 源（交还 mermaid.js 现状渲染，内容不丢）。

export interface MermaidSegment {
  kind: 'md' | 'mermaid'
  text: string
}

/** 按行扫描切分 mermaid 围栏；未闭合围栏到文末按 markdown 处理（不吃内容） */
export function splitMermaidSegments(md: string): MermaidSegment[] {
  const lines = md.split('\n')
  const segments: MermaidSegment[] = []
  let mdBuf: string[] = []
  let mmBuf: string[] | null = null
  let fence = '```'
  const flushMd = () => {
    // 只在有实际内容的段才产出：闭合围栏后的孤立空行不产生空 md 段
    if (mdBuf.length && mdBuf.join('\n').length > 0) {
      segments.push({ kind: 'md', text: mdBuf.join('\n') })
    }
    mdBuf = []
  }
  for (const line of lines) {
    if (mmBuf === null) {
      const open = line.match(/^\s*(```|~~~)\s*mermaid\s*$/i)
      if (open) {
        fence = open[1]
        mmBuf = []
        continue
      }
      mdBuf.push(line)
    } else {
      if (line.trim() === fence) {
        flushMd()
        segments.push({ kind: 'mermaid', text: mmBuf.join('\n') })
        mmBuf = null
      } else {
        mmBuf.push(line)
      }
    }
  }
  if (mmBuf !== null) {
    // 未闭合：回吐为 markdown（含开围栏行），不丢内容
    mdBuf.push(`${fence}mermaid`, ...mmBuf)
  }
  flushMd()
  return segments
}

export interface MermaidBrandResponse {
  ok: boolean
  html?: string
  kind?: string
  reason?: 'extract_failed' | 'unsupported_kind'
  runnerError?: string
}

export async function brandMermaid(source: string, title?: string): Promise<MermaidBrandResponse> {
  // 懒加载 @/api/client：模块级 import 会经 api client → @/router 模块级 createRouter
  // 击穿无 DOM 环境（vitest node 环境，2026-10-18 先例——懒加载治）。
  const { request } = await import('@/api/client')
  return request<MermaidBrandResponse>('/api/hermes/diagram/mermaid-brand', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ source, ...(title ? { title } : {}) }),
    credentials: 'same-origin',
  })
}

/** 从品牌 HTML 的 svg viewBox 估算 iframe 高度（含页边与标题行；上限防爆版） */
export function brandedFrameHeight(html: string): number {
  const m = html.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/)
  const h = m ? Number(m[2]) : 240
  return Math.min(1200, Math.max(160, Math.ceil(h) + 96))
}
