// overlay/custom/client/ide/__tests__/sidepane-tabs-i18n.test.ts
// 守门：IdeSidePane 页签 TABS 的每个 key 必须在 zh/en 双语言有 ide.sidePane.tab_<key>
// （推演 CDP 实锤 ide-i18n-raw-keys：tab_storage/memory/board/hooks 裸键上屏）。
// 断言对象是注入态上游 locale 文件，patch 365 丢失/漂移时当场 fail。
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const UPSTREAM_CLIENT = '../../../../../upstream/hermes-studio/packages/client/src'
const TABS_SRC = resolve(__dirname, '../views/IdeSidePane.vue')

function readUpstream(rel: string): string {
  return readFileSync(resolve(__dirname, `${UPSTREAM_CLIENT}/${rel}`), 'utf8')
}

/** 从 IdeSidePane.vue 的 TABS 数组解析全部页签 key（{ key: 'xxx', icon: ... }） */
function parseTabKeys(src: string): string[] {
  return [...src.matchAll(/\{\s*key:\s*'([a-z_]+)'\s*,\s*icon:/g)].map(m => m[1]!)
}

describe('IdeSidePane 页签 i18n 守门（无裸键）', () => {
  const tabsSrc = readFileSync(TABS_SRC, 'utf8')
  const keys = parseTabKeys(tabsSrc)

  // 漂移期本地字典豁免（i18n-observatory.ts 兜底，同 i18n-run-surface 先例）：
  // tab_trajectory 键走本地字典（IdeSidePane.tabTitle 分支），473 恢复后收编进
  // locale 并从本豁免清单移除（届时本守门重新全覆盖）。
  const LOCAL_DICT_EXEMPT = new Set(['trajectory'])

  it('TABS 解析非空（组件重构时同步本守门）', () => {
    expect(keys.length).toBeGreaterThan(5)
    expect(keys).toContain('files')
  })

  for (const locale of ['zh', 'en']) {
    it(`${locale}.ts 覆盖全部 ${keys.length} 个页签键（本地字典豁免 ${[...LOCAL_DICT_EXEMPT].join('/')}）`, () => {
      const localeSrc = readUpstream(`i18n/locales/${locale}.ts`)
      const missing = keys
        .filter(k => !LOCAL_DICT_EXEMPT.has(k))
        .filter(k => !localeSrc.includes(`tab_${k}:`))
      expect(missing, `${locale}.ts 缺 ide.sidePane.tab_{${missing.join(',')}}`).toEqual([])
    })
  }
})
