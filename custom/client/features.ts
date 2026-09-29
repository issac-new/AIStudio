// overlay/custom/client/features.ts
// 开关正本 re-export：正本在 overlay/config/features.ts（单一事实源）；本文件
// 存在的意义是让注入态上游代码（patch 514 等）经 '@/custom/features' 别名读到
// 同一份开关——vitest alias（@/custom → custom/client）与构建 alias（inject.mjs
// generateOverlayViteConfig）同路径解析，两端零漂移。
export * from '../../config/features'
