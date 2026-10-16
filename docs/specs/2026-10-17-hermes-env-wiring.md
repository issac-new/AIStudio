# Spec：SIM 侧 hermes 数据面 env 接线（A7 挂账清账·harness 侧）

- 分支：`main` 直接修复（小件 env 注入，无新逻辑）
- 日期：2026-10-17
- 上游：用户指令「hermes 侧那两个数据面……要的」（overlay 侧 spec=docs/superpowers/specs/2026-10-17-hermes-data-surface-supply.md 的 harness 配套）

## 问题
studio server 与网关的 env 未注入两个数据面路径：身份册读宿主 ~/.hermes-web-ui
（15 员工身份注册不进 SIM 树）、轨迹落宿主 ~/.hermes/traces（span 不进 SIM 树）。

## 修复
1. mx-lib ensure_studio_up：注入 AGENT_IDENTITY_STORE=$WEBUI_HOME/agent-identity
   +HERMES_INCIDENT_TRACE_DIR=$HERMES_ROOT/traces（WEBUI_HOME 已隔离到 SIM 树）。
2. mx-up 网关启动（nohup 形态）+ mx-sim-gateway-service plist（launchd 托管形态）：
   注入 HERMES_RUN_TRACE_DIR=$HERMES_ROOT/traces（worker spawn 继承=全 fleet span 落 SIM）。

## 验收
- SIM 树一次性会话（wrapper）trace 落盘实证：hermes/traces/*.jsonl header+llm_span×13。
- 身份 REST 注册 15/15 落 SIM 隔离 store（overlay 侧驱动注册链）。

## 决策记录

| # | 决策 | 理由 | 替代（否） | 可逆 |
|---|---|---|---|---|
| D1 | env 走 WEBUI_HOME/HERMES_ROOT 派生 | 与既有隔离约定同源（禁写死绝对路径——P7 跨端） | 写死路径 | 可逆 |
| D2 | plist 与 nohup 双形态同步注入 | launchd 托管与手动启动都真实存在过（run20 实录两形态） | 只改一处（另一形态漂移） | 可逆 |
| D3 | spec 随提交 | L2 spec-first | --no-verify | 可逆 |
