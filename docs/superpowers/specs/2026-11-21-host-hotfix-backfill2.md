# 2026-11-21 宿主热修回灌批二（N-1 收口续）

> 背景：watchdog 回灌批（0ea16f70e）后 deploy 预检仍剩「保留 2」：`gateway/kanban_watchers_dispatcher.py`（宿主比 runtime 镜像新 274 行——`_record_tick` 观测面＋import os，runtime 镜像滞后）与 `hermes_cli/kanban_db.py`（单行：宿主 `workspace_kind: str = "worktree"` vs 模板 `Optional[str] = None`）。两件均无补丁承载（patches 零命中），按 D9 走模板回灌通道归零对账，否则 inject 预检持续 partial 拒绝全量注入。

## 变更

1. `runtime/gateway/kanban_watchers_dispatcher.py` ← 宿主现网版整体回灌（观测面 `_record_tick(_log_spawn_results(...))` 随行；宿主与 main 注入态该文件全同，回灌=镜像追平）。
2. `runtime/hermes_cli/kanban_db.py` 单行对齐宿主热修（`workspace_kind` 默认 `"worktree"`）。语义注：补丁 117 的智能默认（scoped→worktree else dir）仍为仓内正身，宿主硬编码为运行期调参——按 D9 保护先行承载，如需回归 117 语义走补丁域独立批。

## 决策记录

| # | 决策 | 依据 |
|---|---|---|
| D1 | 两件均模板跟宿主（回灌）而非 force 洗宿主 | D9 裁决：无补丁承载的宿主热修不覆盖；且 kanban_db 行为差异会影响 teams 建卡默认 workspace，无立法叙事不擅改 |
| D2 | dispatcher 整文件回灌 | 宿主版=main 注入态版（diff 全同实证），无旧基线污染风险 |

## 验证

- [x] deploy dry-run：保留目标归零（`RESULT status=complete` 或仅剩触碰待收口）。
- [x] deploy 守门测试 10/10 绿（清单未动）。
- [x] 合并后主检出 inject manifest complete＋宿主 SMOKE OK。

## 设计文档影响

DESIGN_SYNC: none 附理由——runtime 覆盖层镜像追平（D9 既定通道），无契约/能力面变化。
