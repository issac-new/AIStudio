// overlay/custom/client/loop/types.ts
// Loop 共享类型的 client 侧出口——定义本体已迁至 server 侧唯一事实源
// （custom/server/loop/types.ts，迁移动机见该文件头：TypeScript 6 默认 Bundler
// 解析按符号链接路径取相对 import，client→server 的旧跨根 re-export 在上游 tsc
// 视角断裂；反向 re-export 由 vite/vitest 按物理真实路径解析，不受影响）。
// 本文件路径不变，client 既有 `./types` / `@/custom/loop/types` 引用零改动。
export * from '../../server/loop/types'
