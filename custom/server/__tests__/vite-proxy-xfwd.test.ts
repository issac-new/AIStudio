// G3 守门：vite dev 代理必须带 xfwd，否则 gateway-credentials 的回环闸被本机代理放大
// （经代理的 LAN 请求与本机直连在后端字节级不可区分）。此测试钉住 inject.mjs 派生
// 配置模板中的 xfwd 注入；任一代理键被移除/改名即红。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const injectSrc = readFileSync(resolve(__dirname, '../../../scripts/inject.mjs'), 'utf8')

describe('vite 代理 xfwd 注入（G3 威胁面收口）', () => {
  it('五个上游代理键都注入 xfwd: true', () => {
    for (const key of ['/api', '/v1', '/health', '/upload', '/socket.io']) {
      expect(injectSrc, `代理键 ${key} 缺 xfwd 注入`).toContain(`'${key}': { xfwd: true }`)
    }
  })
})
