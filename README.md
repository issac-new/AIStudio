# Hermes Overlay

本仓是 hermes-studio 二次开发的 overlay 层。三个上游仓在 `../upstream/`(hermes-studio / element-web / hermes-agent),保持纯净。

## 机制(混合策略)
- **A 类(纯新增)**:`custom/` + 运行时 registry(经 entry shim + 派生 vite/tsconfig alias 接入)
- **B 类(改上游骨架)**:`patches/`(`git apply` 可逆)

## 常用命令
- `npm run inject` — 应用 B 类 patch + 生成派生 config
- `npm run clean` — 还原上游工作树
- `npm run verify` — 校验上游状态
- `npm run sync` — 升级上游(clean → fetch/reset → re-inject)

详见 `../docs/superpowers/specs/2026-06-21-overlay-architecture-design.md`。
