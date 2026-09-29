// overlay/custom/client/ia2/__tests__/standalone-embed-patches.test.ts
// v14 统一聊天 Phase 1 补丁守门（2026-09-29；517/518/519=原 506/507/508 复位）：关键接线
// 以文本断言钉死——standaloneEmbed 判定、嵌入态深链回 /app、:standalone 透传、
// 高度 100%、series 登记。补丁被误改/漂移时此处当场红（改任一端守门必须 fail）。
// 补丁本体不经 vitest 装载（测试链 alias 指向共享 upstream，注入态与本仓 series
// 不保证同步），故用读文件断言而非组件级断言。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const overlayRoot = resolve(__dirname, '../../../..')

function readPatch(name: string): string {
  return readFileSync(resolve(overlayRoot, 'patches', name), 'utf8')
}

describe('v14 standaloneEmbed 补丁守门', () => {
  it('517(原506) ChatView：standaloneEmbed 并入 standalone 判定 + 嵌入态深链回 /app', () => {
    const p = readPatch('517-client-chatview-standalone-embed.patch')
    expect(p).toContain("route.meta?.standaloneChat === true || route.meta?.standaloneEmbed === true")
    expect(p).toContain("route.meta?.standaloneEmbed === true ? '/app' : { name: 'hermes.chat' }")
  })

  it('518(原507) GroupChatView：:standalone 透传 + 嵌入态 class + 高度 100% + 深链回 /app', () => {
    const p = readPatch('518-client-groupchatview-standalone-embed.patch')
    expect(p).toContain('const isStandaloneEmbed = computed(() => route.meta?.standaloneEmbed === true)')
    expect(p).toContain(':standalone="isStandaloneEmbed"')
    expect(p).toContain(`:class="{ 'group-chat-view--standalone': isStandaloneEmbed }"`)
    expect(p).toContain('.group-chat-view--standalone {')
    expect(p).toContain('height: 100%;')
    expect(p).toContain("isStandaloneEmbed.value ? '/app' : { name: 'hermes.groupChat' }")
  })

  it('519(原508) 词条：ia2.flow 六键 zh/en 成对', () => {
    const p = readPatch('519-client-i18n-comm-v14.patch')
    for (const key of ['chatSection', 'newChat', 'newAgentChat', 'newGroupChat', 'newMatrixRoom', 'deleteGroup']) {
      expect(p.match(new RegExp(`\\+\\s+${key}:`, 'g'))?.length, `${key} zh/en 两处`).toBe(2)
    }
    expect(p).toContain("chatSection: '聊天'")
    expect(p).toContain("chatSection: 'Chats'")
  })

  it('series 登记：517/518/519 三补丁在列', () => {
    const s = readFileSync(resolve(overlayRoot, 'patches', 'series'), 'utf8')
    for (const name of [
      '517-client-chatview-standalone-embed.patch',
      '518-client-groupchatview-standalone-embed.patch',
      '519-client-i18n-comm-v14.patch',
    ]) {
      expect(s).toContain(name)
    }
  })
})
