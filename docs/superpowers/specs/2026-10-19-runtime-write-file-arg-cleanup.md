# 运行时 write_file 链路参数清理（spec）

日期：2026-10-19
分支：`main`（运维修复，单文件）
来源：预检 ⑮ 红项复测。

## 变更

`runtime/tools/file_tools.py` 的 `_create_configured_env(...)` 调用删除
`local_config={"persistent": config.get("local_persistent", False)} if env_type == "local" else None`
实参。上游源与 overlay patch 613 都不含此行；该行把 persistent 默认值从 lifecycle 的
`True` 改成 `False`，与 Action Fusion 正本语义相反。

## 决策记录

- D-1：修复点必须落在 overlay 的运行时供给源（`runtime/tools/file_tools.py`），不能只改宿主 tree：`inject`/`deploy-agent-runtime` 会按源覆盖，只改目标等于下次注入复发（2026-10-19 实测：先改宿主与 SIM 两树，最终注入后宿主又被源里的旧行覆盖）。
- D-2：宿主与 SIM 两树仍然分别验证（预检 ⑮ 的判据），但机械保证由供给源承担：源无此行 → 部署后两树必无此行。
- D-3：部署用 `node scripts/deploy-agent-runtime.mjs --apply`（默认干跑），旧文件自动 `.bak.<ts>` 备份，可回滚。

## 验证

- `grep -c 'local_config=' runtime/tools/file_tools.py` → 0。
- `deploy-agent-runtime.mjs --apply` 后宿主与 SIM `hermes-agent-src` 两树同项均为 0。
- 预检 ⑮ 转绿；网关重启后生效。
