# aipaydev 全流程推演缺口 — 功能设计

## 目标

为 overlay 仓库提供可测试的 RACI 派发、架构规则熔断、重试保护、Git 冲突降级、IDE 任务简报、Matrix 九用户模拟与 Docker 沙箱能力。所有新增逻辑先在 `custom/` 中实现，只有上游骨架接线通过 patch 注入。

## 功能模块

### RACI 派发

- 任务正文可携带 `{ "raci": { "responsible": [], "approver": [], "consulted": [], "informed": [] } }`。
- `responsible` 至少一人，`approver` 最多一人。
- 模拟模式写入本地 Matrix 事件存储，生产接线复用 Matrix gateway。

### 架构规则引擎

- 依赖完整性：依赖任务必须完成。
- 角色分配：任务必须有 responsible。
- 审批唯一性：多审批人自动收敛为一人。
- 并发配额：同一负责人运行任务不超过 3 个。
- 阻断动作统一产出 `BLOCKED_BY_POLICY`，并保留 ruleId、policy、taskId、message。

### 重试与 Leader 介入

- 每次策略阻断递增 retry count。
- 连续阻断 3 次触发 Leader 介入，累计 5 次拒绝自动重试。

### Git 冲突 SOS

- 冲突类型分类：content、structural、semantic。
- 普通冲突中止合并；语义冲突或重试超限升级人工/Leader；Leader 模式允许回滚。

### IDE 任务简报

使用现有 Vue/Pinia 技术栈，提供六个可折叠区块：进度概览、RACI 分配、架构约束、Matrix 通道、风险与阻塞、Leader 介入。不得引入 React/TSX。

### Matrix 模拟

提供 9 个稳定角色用户、房间创建、成员关系、消息历史、广播与 Leader 介入消息的内存实现，供 sim 脚本和单元测试使用。

### Docker 沙箱

基础 compose 仅提供可验证的 Matrix、server、IDE、Postgres、Redis、Leader 服务拓扑；镜像和 Dockerfile 在当前项目没有可复用实现时不得伪造可运行产物，先以 compose config 静态校验为门禁。

## 非目标

- 不修改 upstream 工作树中的文件。
- 不伪造真实 Matrix access token、支付网关或生产支付数据。
- 不宣称未运行的 Docker、真实 Matrix 或 UI 走查已经通过。
