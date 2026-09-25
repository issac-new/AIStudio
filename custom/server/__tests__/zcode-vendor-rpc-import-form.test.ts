// overlay/custom/server/__tests__/zcode-vendor-rpc-import-form.test.ts
// X3 守门：vendor/rpc 的相对 import 省略扩展名（"./buffer" 而非 "./buffer.js"）是
// 【有意不变量】不是隐患——当前运行链是 ts-node CJS（require 解析补 .ts）与 vitest
// 转换链，该形态合法；Node ESM 直跑则 ERR_MODULE_NOT_FOUND。迁移 ESM 前必须回补
// 扩展名并同步改本守门（形态扫描断言随之翻转）。
// 三层钉死：① 形态（无扩展名 + 文件面固定）② 头注释在位（重拷 upstream 后回放提醒）
// ③ 当前运行链真实 import 冒烟（省略形态确实可解析）。
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { resolve } from 'path'

const VENDOR = resolve(__dirname, '../zcode/vendor/rpc')

/** 含相对 import/export-from 的文件面（形态钉死；目录内新增文件须同步本清单）。 */
const FILES_WITH_RELATIVE_IMPORTS = [
  'channelClient.ts', 'channelServer.ts', 'channels.shared.ts', 'channels.ts',
  'delayedChannel.ts', 'index.ts', 'protocol.ts', 'proxy-channel.ts', 'serialization.ts',
]

/** 目录文件全集（buffer/foundation 是叶子模块，无相对 import）。 */
const ALL_VENDOR_FILES = [...FILES_WITH_RELATIVE_IMPORTS, 'buffer.ts', 'foundation.ts']

function relativeSpecifiers(src: string): string[] {
  return [...src.matchAll(/(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/g)].map((m) => m[1])
}

describe('vendor/rpc import 形态不变量（X3）', () => {
  it('相对 import 全部省略扩展名且文件面固定（形态钉死）', () => {
    expect(readdirSync(VENDOR).filter((f) => f.endsWith('.ts')).sort()).toEqual([...ALL_VENDOR_FILES].sort())
    for (const f of ALL_VENDOR_FILES) {
      const specs = relativeSpecifiers(readFileSync(resolve(VENDOR, f), 'utf8'))
      for (const spec of specs) {
        expect(spec, `${f} 的相对 import 不得带扩展名`).not.toMatch(/\.(js|ts|mjs|cjs|json)$/)
      }
      expect(specs.length > 0, `${f} 须在文件面清单中分类正确`).toBe(FILES_WITH_RELATIVE_IMPORTS.includes(f))
    }
  })

  it('不变量注释在位：channels.ts 全文 + 其余文件一行指针（重拷 upstream 后须回放）', () => {
    const channels = readFileSync(resolve(VENDOR, 'channels.ts'), 'utf8')
    expect(channels).toContain('迁移 ESM')
    expect(channels).toContain('ERR_MODULE_NOT_FOUND')
    for (const f of FILES_WITH_RELATIVE_IMPORTS.filter((f) => f !== 'channels.ts')) {
      expect(readFileSync(resolve(VENDOR, f), 'utf8'), `${f} 缺不变量指针注释——重拷后须回放`).toContain('import 形态不变量见 channels.ts')
    }
  })

  it('当前运行链真实 import 冒烟：省略扩展名形态可解析（ts-node CJS / vitest 合法）', async () => {
    // 逐模块动态 import（字面量路径）：任一模块解析失败即运行链形态非法，本测试当场 fail。
    await import('../zcode/vendor/rpc/buffer')
    await import('../zcode/vendor/rpc/foundation')
    await import('../zcode/vendor/rpc/serialization')
    await import('../zcode/vendor/rpc/protocol')
    await import('../zcode/vendor/rpc/channelClient')
    await import('../zcode/vendor/rpc/channelServer')
    await import('../zcode/vendor/rpc/channels.shared')
    await import('../zcode/vendor/rpc/channels')
    await import('../zcode/vendor/rpc/delayedChannel')
    await import('../zcode/vendor/rpc/proxy-channel')
    const rpc = await import('../zcode/vendor/rpc/index')
    expect(rpc.VSBuffer.wrap(new Uint8Array([1, 2])).buffer).toEqual(new Uint8Array([1, 2]))
    expect(typeof rpc.ChannelClient).toBe('function')
    expect(typeof rpc.ProxyChannel.toService).toBe('function') // namespace 形态（对象面）
    expect(typeof rpc.SocketProtocol).toBe('function')
  })
})
