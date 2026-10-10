import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { shouldMigratePathToHash, hashDeeplinkTarget } from '../../../registries/client/deeplink'

// 守门：路径形态深链迁移（原 ide-deeplink-loses-task 根治 patch 368；2026-10-10
// run13 步18 实锤后放宽——裸路径深链 /app/ide 冷启动落登录链→#/app→被带进最近
// 群聊房，深链目标永远到不了）。判定单一事实源=registries/client/deeplink.ts，
// entry.mts 与 patch 368（upstream main.ts 内联副本）消费同一语义。

const OVERLAY_ROOT = resolve(__dirname, '../../..')
const UPSTREAM_MAIN = join(
  OVERLAY_ROOT,
  '../upstream/hermes-studio/packages/client/src/main.ts',
)
const PATCH_FILE = join(OVERLAY_ROOT, 'patches/368-client-path-deeplink-to-hash.patch')
const SERIES = join(OVERLAY_ROOT, 'patches/series')

describe('patch 368 路径形态深链迁移（run13 步18 放宽版）', () => {
  it('patch 文件存在且注册于 series', () => {
    expect(existsSync(PATCH_FILE)).toBe(true)
    expect(readFileSync(SERIES, 'utf8')).toContain('368-client-path-deeplink-to-hash.patch')
  })

  it('upstream main.ts 已注入迁移块（inject 产物守门；须先 npm run inject）', () => {
    const src = readFileSync(UPSTREAM_MAIN, 'utf8')
    expect(src).toContain('ide-deeplink-loses-task')
    expect(src).toContain('window.location.replace')
    expect(src).toContain('pathname+search 迁')
    // 迁移块必须先于 token 特例读取（router 初始化前生效）
    expect(src.indexOf('ide-deeplink-loses-task')).toBeLessThan(src.indexOf('Read token from URL'))
  })

  it.each([
    // 本轮根治位：裸路径深链（无 query）也迁移——/app/ide 曾落群聊房错帧
    ['/app/ide', '', '', true, '#/app/ide'],
    ['/app/board', '', '', true, '#/app/board'],
    ['/app/ide', '?task=DEV-PAYCORE-S', '', true, '#/app/ide?task=DEV-PAYCORE-S'],
    ['/ide', '?task=t_x&foo=1', '#/', true, '#/ide?task=t_x&foo=1'], // '#/'=router 空路由默认值，视为未导航
    // 登录 token 链旧语义保持：根路径带 search 仍迁移
    ['/', '?token=abc', '', true, '#/?token=abc'],
    // 不迁移：根路径无 search（登录流程原样）/ 已导航真路由 / hash 形态本就可用 / 入口直访
    ['/', '', '', false, null],
    ['/app/ide', '', '#/app', false, null],
    ['/app/ide', '?task=t_x', '#/ide?task=t_x', false, null],
    ['/index.html', '', '', false, null],
  ])('pathname=%j search=%j hash=%j → 迁移=%j（目标=%j）', (pathname, search, hash, expected, target) => {
    const loc = { pathname, search, hash }
    expect(shouldMigratePathToHash(loc)).toBe(expected)
    expect(hashDeeplinkTarget(loc)).toBe(target)
  })

  it('patch 368 内联副本与 deeplink.ts 单源语义同步（条件行守卫）', () => {
    const patch = readFileSync(PATCH_FILE, 'utf8')
    // 内联副本的关键条件必须与单源等价：index.html 豁免 + 根路径仅带 search 迁移
    expect(patch).toContain("pathname !== '/index.html'")
    expect(patch).toContain("|| search.length > 1")
  })
})
