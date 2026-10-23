# 修复：Provider 配置提示误报——检测对象改为网关实际 profile

- 日期：2026-10-23
- 状态：已落地（fix/gateway-profile-provider-prompt，patch 678）
- 用户报障：当前 gateway 网关默认使用 Orchestrator profile（default 闲置），但 UI 弹「当前 Profile"default"未配置任何大模型 Provider，是否进入模型设置页面？」——检测对象错了。

## 根因

- 弹窗组件 `ProviderConfigurationPrompt.vue`（upstream，挂 App.vue 全局）：按 **UI 活跃 profile**（`profilesStore.activeProfileName`，来自 localStorage 或 profile 列表首个）查 `fetchProviders()`，空则弹窗。
- 网关实际使用的是另一条链：`~/.hermes/config.yaml` kanban 段 `orchestrator_profile: orchestrator` + `default_assignee: orchestrator`——studio 后端 `getOrchestration`（kanban.ts:1217）已暴露解析链 `resolved_orchestrator_profile`（显式配置 > profile.default > 'default'）。
- 本机事实：orchestrator profile 在用（有 providers），default 闲置（无 providers）且 UI 活跃名=default → 对着不用的 profile 报「未配置」。

## 修复（patch 678）

检测对象从 UI 活跃 profile 改为 `gatewayProfile()`：

1. `GET /api/hermes/kanban/orchestration` 取 `resolved_orchestrator_profile`（回落显式 `orchestrator_profile`）；
2. 端点不可用（老后端/网络故障）fail-soft 回落 UI 活跃 profile（原行为）；
3. 判定改用 `fetchAvailableModelsForProfile(profile)` 独立查询（不污染全局 modelsStore——后者仍预取作模型页数据源，保留原行为）；
4. 弹窗文案与 dismissed key 都锚 `checkedProfile`（网关实际 profile），点「稍后提醒」不会再按 UI profile 误放行；
5. moa 虚拟 provider 过滤与原 `fetchProviders` 口径一致。

## 决策记录

1. **D1 不改后端**：`resolved_orchestrator_profile` 已是现成事实源（upstream kanban.ts:1238），前端消费即可；orchestrator_profile 解析链是网关侧配置语义，studio 不重复实现。
2. **D2 直连 request 而非新建 API 封装**：upstream `api/hermes/kanban.ts` 并无 `getOrchestration` 客户端封装（orchestration API 仅服务端路由），为一行消费新增封装不值当；组件内 `request<T>` 直调带类型。
3. **D3 fail-soft 回落原行为**：端点失败时退回 UI 活跃 profile 判定——宁可保留旧误报形态也不把弹窗逻辑整个挂死在一个辅助端点上。
4. **D4 dismissed key 跟随 checkedProfile**：用户对 orchestrator 点「稍后」应静默 orchestrator，而非 default。

## 验证

- patch 678 干净应用（git apply --check 过）；注入树 vue-tsc 对该组件零错误（残留错误均为 workflow/group-chat 等既有基线噪音，与本组件无关）。
- overlay 客户端测试 12 文件 52 用例全绿。
- 8649 走查见提交后记录（弹窗不再以 default 误报）。

## 挂账

- upstream 基线自身该组件逻辑也有同款问题（对任何部署，只要 UI 活跃 profile ≠ 网关使用 profile 就误报）——本修复在 overlay patch 层；若 upstream 后续版本重写该组件，678 需按 upstream 新形态重做。
