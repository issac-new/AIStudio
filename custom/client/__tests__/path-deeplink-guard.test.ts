import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

// 守门：推演实锤 ide-deeplink-loses-task 的根治 patch 368。
// hash 路由（createWebHashHistory）下路径形态深链 /ide?task=x 的 search 参数
// vue-router 全程不可见，须在 router 初始化前迁移为 hash 形态。

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const UPSTREAM_MAIN = join(
  OVERLAY_ROOT,
  '../upstream/hermes-studio/packages/client/src/main.ts',
)
const PATCH_FILE = join(OVERLAY_ROOT, 'patches/368-client-path-deeplink-to-hash.patch')
const SERIES = join(OVERLAY_ROOT, 'patches/series')

/** 与 patch 内联迁移块保持同构的判定（单一语义，改动须双侧同步） */
export function shouldMigrateToHash(search: string, hash: string): boolean {
  const notNavigated = hash === '' || hash === '#' || hash === '#/'
  return search.length > 1 && notNavigated
}

describe('patch 368 路径形态深链迁移（ide-deeplink-loses-task）', () => {
  it('patch 文件存在且注册于 series', () => {
    expect(existsSync(PATCH_FILE)).toBe(true)
    expect(readFileSync(SERIES, 'utf8')).toContain('368-client-path-deeplink-to-hash.patch')
  })

  it('upstream main.ts 已注入迁移块（inject 产物守门）', () => {
    const src = readFileSync(UPSTREAM_MAIN, 'utf8')
    expect(src).toContain('ide-deeplink-loses-task')
    expect(src).toContain('window.location.replace')
    expect(src).toContain('pathname+search 迁移')
    // 迁移块必须先于 token 特例读取（router 初始化前生效）
    expect(src.indexOf('ide-deeplink-loses-task')).toBeLessThan(src.indexOf('Read token from URL'))
  })

  it.each([
    ['?task=t_5b889ee8', '', true, '#/ide?task=t_5b889ee8'],
    ['?task=t_x&foo=1', '#/', true, '#/ide?task=t_x&foo=1'], // '#/'=router 写的空路由默认值，视为未导航
    ['?task=t_x&foo=1', '', true, '#/ide?task=t_x&foo=1'],
    ['?token=abc', '', true, '#/?token=abc'],
    ['?task=t_x', '#/app', false, null], // 真路由状态：不迁移
    ['', '', false, null], // 无 search：无需迁移
    ['', '#/ide?task=t_x', false, null], // hash 形态深链：本就可用
  ])('search=%j hash=%j → 迁移=%j（%j）', (search, hash, expected) => {
    expect(shouldMigrateToHash(search, hash)).toBe(expected)
  })
})
