// overlay 测试权威配置。
// 与 vite.config.overlay.ts（构建期，inject 生成）平行，互不依赖：
//   - 构建 config 由 scripts/inject.mjs 派生，被 .gitignore 忽略
//   - 本文件手写、入库、随 overlay 仓库跟踪
// ⚠️ 若 alias 需调整，两处保持同步（见下方 alias 块注释）。
//
// 设计依据：docs/superpowers/specs/2026-06-22-cockpit-techdebt-batch0-testinfra-design.md
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// overlay 根（本文件所在目录）。
const overlayRoot = __dirname
// 上游 client src：@ 兜底 alias 的目标（@/api、@/views 等解析到上游）。
const upstreamClientSrc = resolve(overlayRoot, '../upstream/hermes-studio/packages/client/src')

export default defineConfig({
  plugins: [vue()],
  resolve: {
    // ⚠️ 与 vite.config.overlay.ts 的 alias 数组保持同步。
    // 数组形式按声明顺序匹配——更具体的前缀（@/custom）必须在兜底（@）之前，
    // 否则 '@' 会先吃掉 '@/custom/...'（对象形式 alias 不保证顺序，故用数组）。
    alias: [
      { find: '@/custom', replacement: resolve(overlayRoot, 'custom/client') },
      { find: '@custom', replacement: resolve(overlayRoot, 'custom/client') },
      // @ 兜底指向上游 client src
      { find: '@', replacement: upstreamClientSrc },
    ],
  },
  test: {
    // 只跑 overlay 自己的测试，不混跑 upstream 的 tests/**。
    include: ['custom/**/*.test.ts'],
    setupFiles: [resolve(overlayRoot, 'custom/client/test/setup.ts')],
    // environment 由各测试文件头部的 // @vitest-environment jsdom 指令按需指定；
    // store 级测试无需 DOM，config 层不强制全局 environment 以减少开销。
  },
})
