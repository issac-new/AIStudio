# 2026-11-21 宿主 watchdog 热修回灌批（换血批 N-1 收口）

> 背景：换血批 N-1（宿主升级）探查发现宿主基线已被他会话换至 v0.23.3（describe 实证），但收口链断裂：宿主 `gateway/shutdown_watchdog.py` 的 **hostile-load 容忍热修**（2026-11-05 立法：loadavg ≥ factor×cpu 时 strike 升级延迟杀进程重启，防 8 次/66min 重启风暴）与 `gateway/config.py` 的配套引用（两常量＋两字段＋opt-out 键）**无补丁/清单承载**（main 面零命中）。宿主曾因 deploy smoke 失败自动回滚产生「config.py 新引用 vs watchdog 旧无定义」ImportError 错配（`import gateway.run` 实锤），本批前已手工恢复自洽（SMOKE OK）。D9 裁决要求：有承载的热修走模板回灌，否则每次 deploy 都会洗掉热修重现错配。

## 变更

1. `runtime/gateway/shutdown_watchdog.py` 新增镜像=宿主融合版（v0.23.3 基线＋hostile-load 热修段：两常量＋`_hostile_load_active`＋`_record_probe_miss` deferral 逻辑＋snapshot 字段扩展）。源=宿主现网文件（内容 diff 实证=main 注入态＋41 行新增＋2 行配套改）。
2. `runtime-manifest.json` files 登记 `gateway/shutdown_watchdog.py`（清单同步面接管该件，防触碰面 force 覆盖洗掉热修）。
3. `gateway/config.py` 配套面**不入本批**：config.py 不在任何部署面（无补丁触碰、不在清单），deploy 永不触碰，宿主热修天然幸存；其回灌需补丁承载（触碰面同步源=vendor 注入态），挂账 N-1' 随 watchdog 稳定后评估。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | watchdog 走清单登记而非补丁承载 | watchdog 无既有补丁触碰历史依赖（.bak 仅 deploy 所留）；清单=runtime 覆盖层正道，镜像即模板，最小改动。config.py 的引用面在宿主已存在且不被 deploy 触碰，无需仓内承载即可运行 |
| D2 | 镜像源=宿主现网文件而非手工重打 | 宿主版经 diff 实证=main 注入态＋纯热修段（无 v0.23.2 旧基线残留），且 SMOKE OK 活体验证过 |
| D3 | 不动 11 件滞后面于本批提交 | kanban_db 等滞后面由 deploy --apply --force 从既有模板刷齐（模板=main 注入态权威），无仓内变更需求 |

## 验证

- [x] `npx vitest run scripts/__tests__/deploy-agent-runtime.test.ts` 绿（清单变更守门）。
- [x] worktree 内 dry-run deploy 对账：watchdog 归入「相同」（模板=宿主融合版）。
- [x] 合并后主检出 `npm run inject` manifest complete；`deploy --apply --force` 后宿主 `import gateway.run` SMOKE OK 且 hostile-load 常量在位。
- [x] 网关重启（launchctl kickstart -k）后进程稳定无重启风暴。

## 设计文档影响

DESIGN_SYNC: none 附理由——运行时部署覆盖层的模板回灌（D9 裁决既定通道），无契约/能力/版本面变化；watchdog 热修语义已在 2026-11-05 立法叙事留痕，不触及设计正本。
