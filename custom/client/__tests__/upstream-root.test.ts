import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { OVERLAY_ROOT, UPSTREAM_ROOT, upstreamPath } from '../../test/upstream-root'

describe('测试源码根目录解析', () => {
  it('当前 worktree 的 vendor 注入态优先于旧 upstream 缓存', () => {
    expect(OVERLAY_ROOT).toBe(resolve(__dirname, '../../..'))
    expect(UPSTREAM_ROOT).toBe(resolve(OVERLAY_ROOT, 'vendor'))
    expect(existsSync(upstreamPath('hermes-studio/packages/client/src/router/index.ts'))).toBe(true)
    expect(upstreamPath('hermes-agent')).toBe(resolve(OVERLAY_ROOT, 'vendor/hermes-agent'))
  })
})
