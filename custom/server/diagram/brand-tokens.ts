// overlay/custom/server/diagram/brand-tokens.ts
// SwarmStudio 品牌 token 的 TS 镜像（spec 项5 D-绊线）：唯一事实源=
// assets/skills/diagram-design-brand/swarmstudio.profile.md（light 列）。
// 本文件值由 custom/server/diagram/__tests__/diagram-mermaid.test.ts 的绊线测试
// 与 profile 文件逐值对账——改任何一边，测试当场 fail，禁双源漂移。
export const BRAND = {
  paper: '#fafafa',
  paper2: '#f0f0f0',
  ink: '#1a1a1a',
  muted: '#666666',
  soft: '#6b6b6b',
  rule: 'rgba(26,26,26,0.12)',
  ruleSolid: '#e0e0e0',
  accent: '#333333',
  accentTint: 'rgba(51,51,51,0.06)',
  link: '#2e6db4',
} as const

/** 字体栈（font source=system：不发网络请求，CJK 走平台回退） */
export const FONT_SANS = "'Geist', 'Noto Sans SC', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif"
export const FONT_SERIF = "'Instrument Serif', 'Noto Serif', 'PingFang SC', serif"
export const FONT_MONO = "'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace"

export function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/** 含 CJK/全角字符？（style-guide：宽字符 1em，其余 0.60em sans / 0.62em mono） */
export function hasCjk(value: string): boolean {
  return /[⺀-鿿豈-﫿︰-﹏＀-￯]/.test(value)
}

/** 文本宽度预算（style-guide 宽度契约：逐字符计量，禁按 script 计数） */
export function textWidth(value: string, fontSize: number, mono = false): number {
  let units = 0
  for (const ch of value) {
    if (/[⺀-鿿豈-﫿︰-﹏＀-￯]/.test(ch)) units += 1
    else if (/^[\u0300-\u036f\u20d0-\u20ff]$/.test(ch)) units += 0
    else units += mono ? 0.62 : 0.6
  }
  return units * fontSize
}

/** 4px 网格向上取整（硬规则） */
export function round4(n: number): number {
  return Math.ceil(n / 4) * 4
}
