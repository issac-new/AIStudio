# Swarm Studio 全流程推演方案 — 实施计划

> **项目代号**：aipaydev  
> **基准**：ncwk v0.7.23 + overlay 6ace167  
> **依赖**：`docs/superpowers/specs/2026-09-22-aipaydev-full-sim-spec.md`  
> **编写日期**：2026-09-22  
> **状态**：待批准

---

## 一、整体架构

### 改造分类

| 类别 | 落点 | 说明 |
|------|------|------|
| A 类（纯新增） | `overlay/custom/` | 新组件/服务/API，零侵入 upstream |
| B 类（骨架修改） | `overlay/patches/NNN-xxx.patch` | 修改 upstream 骨架，通过 inject 注入 |
| 新文件 | `overlay/docker-compose.sandbox.yml` | Docker 沙箱基础设施 |

### Patch 编号规划（当前最高 360）

| 编号 | 名称 | 类型 | 缺口 |
|------|------|------|------|
| 361 | server-kanban-raci | B | 1 |
| 362 | server-rule-engine | B | 2 |
| 363 | client-rule-engine-ui | A | 2 |
| 364 | server-retry-guard | B | 3 |
| 365 | server-conflict-sos | B | 4 |
| 366 | client-ide-briefing-panel | A | 5 |
| 367 | client-ide-briefing-components | A | 5 |
| 368 | server-sim-9users | B | 6 |
| 369 | client-sim-9users | A | 6 |

Docker compose 文件不作为 patch，直接放 `overlay/` 根。

---

## 二、逐项实施步骤

### 缺口 1：RACI 字段 + Matrix 派发（Patch 361）

#### 2.1.1 后端：Kanban 模型扩展

**文件**：`overlay/patches/361-server-kanban-raci.patch`

修改 `packages/server/src/modules/hermes/types/kanban.ts`（上游文件），为 `KanbanTask` 接口添加：

```ts
// RACI 字段
responsible: string[]  // 最少 1 人
approver: string[]     // 最多 1 人
consulted: string[]    // 中间方
informed: string[]     // 监听方
```

**注意**：上游文件可能不存在，需先确认。如果上游不存在，改用 overlay/custom/ 下新增服务。

#### 2.1.2 后端：RACI 派发服务

**文件**：`overlay/custom/server/services/kanban/raci-dispatch.ts`（新增）

```ts
export class RACIDispatchService {
  async dispatch(taskId: number): Promise<DispatchResult>
  async createMatrixRoom(task: KanbanTask): Promise<roomId>
  async sendDispatchMessage(roomId: string, task: KanbanTask): Promise<void>
  async inviteParticipants(roomId: string, raci: RACITuple): Promise<void>
}
```

功能：
1. 根据 KanbanTask 的 RACI 字段，创建 Matrix 群聊
2. @ 所有 responsible
3. 发送任务摘要 + 需求文档链接
4. 邀请 approver、consulted、informed 加入群

#### 2.1.3 后端：API 端点

**文件**：`overlay/patches/361-server-kanban-raci.patch`（同 patch，新增路由）

在 `packages/server/src/modules/hermes/routes/kanban.ts` 添加：
- `POST /api/hermes/kanban/:id/dispatch-racii` — 触发 RACI 派发

#### 2.1.4 前端：表单 RACI 字段

**文件**：`overlay/custom/client/kanban/components/KanbanTaskForm.vue`（修改）

在 `formData` 添加 RACI 字段：
```ts
responsible: [] as string[],
approver: [] as string[],
consulted: [] as string[],
informed: [] as string[],
```

在模板添加 RACI 选择器（4 个 NSelect）。

#### 2.1.5 前端：API 接口

**文件**：`overlay/custom/client/api/hermes/kanban.ts`（修改）

添加 `dispatchRACI(taskId)` 方法。

---

### 缺口 2：架构规则引擎熔断（Patch 362 + 363）

#### 2.2.1 后端：规则引擎核心

**文件**：`overlay/custom/server/services/kanban/rule-engine.ts`（新增）

```ts
export class ArchitectureRuleEngine {
  static checkSensitiveModule(task, assignee): ValidationResult
  static checkDependencyTopology(task): ValidationResult
  static checkCapabilityMatch(task, assignee): ValidationResult
  static checkWorkloadThreshold(task, estimate): ValidationResult
  static validate(task, assignee): RuleEngineResult
}
```

四条规则：
1. 敏感模块校验：涉及 `资金清算/路由网关/对账/签名验签` 的任务，指派人必须有 `[Senior]` 或 `[Security]` 标签
2. 依赖拓扑校验：禁止循环依赖（检测 task.parentTask 递归闭环）
3. 能力匹配校验：任务所需技能 ⊆ 指派人已注册技能
4. 工作量阈值：单个任务预估工作量 > 40 人天 → 触发拆分警告

**文件**：`overlay/custom/server/services/kanban/rule-engine.ts`

#### 2.2.2 后端：BLOCKED_BY_POLICY 状态

**文件**：`overlay/patches/362-server-rule-engine.patch`

修改上游 KanbanTaskStatus 类型，添加 `'BLOCKED_BY_POLICY'`。

修改上游 kanban service，在 `assignTask` 时调用 `ArchitectureRuleEngine.validate()`。

如果校验失败：
```ts
task.status = 'BLOCKED_BY_POLICY'
notify('high_priority', `架构规则熔断：${task.title}`)
```

#### 2.2.3 前端：规则引擎 UI

**文件**：`overlay/custom/client/cockpit/components/RuleEnginePolicyCard.vue`（已有，增强）

当前组件只做展示，需添加：
- 熔断详情弹窗
- 解除熔断按钮（仅 PM 可见）

**文件**：`overlay/custom/client/api/hermes/kanban.ts`

添加 `releaseBlockedTask(taskId)` 方法。

---

### 缺口 3：防死循环 retry_count + Leader 介入（Patch 364）

#### 2.3.1 后端：重试守卫

**文件**：`overlay/custom/server/services/kanban/retry-guard.ts`（新增）

```ts
export class RetryGuardService {
  static incrementRetryCount(taskId: number): Promise<number>
  static checkRetryThreshold(taskId: number): Promise<RetryDecision>
  static invokeLeader(taskId: number, evidence: RetryEvidence): Promise<void>
}
```

功能：
1. 每轮测试打回 → `bug_fix_retry_count++`
2. 当 `>= 3` 时触发 `Tech Leader Agent` 介入
3. Leader 查找：在 `~/.hermes/profiles/` 按 `team_leader` 标签找代理

**文件**：`overlay/patches/364-server-retry-guard.patch`

修改上游 kanban service 的 `completeTask` 流程，在测试打回时调用 `RetryGuardService`。

---

### 缺口 4：Git 冲突 SOS 降级（Patch 365）

#### 2.4.1 后端：冲突检测增强

**文件**：`overlay/custom/server/controllers/ide/git.ts`（修改）

当前已有冲突检测（`kind: 'conflicted'`），需增强：
- 检测到冲突时自动创建分支 `merge-conflict/<task-id>-<timestamp>`
- 打包冲突文件（`.zip`）
- 发送 Matrix "SOS：冲突求助" 消息

#### 2.4.2 后端：冲突 SOS 服务

**文件**：`overlay/custom/server/services/kanban/conflict-sos.ts`（新增）

```ts
export class ConflictSOSService {
  static async detectAndEscalate(taskId: number, workspace: string): Promise<SOSResult>
  static async createConflictBranch(taskId: string): Promise<string>
  static async packageConflicts(workspace: string): Promise<string>
  static async sendSOSMessage(result: SOSResult): Promise<void>
}
```

#### 2.4.3 前端：合并解决视图

**文件**：`overlay/custom/client/ide/components/IdeConflictSolver.vue`（新增）

组件功能：
- 展示冲突文件列表
- 显示冲突差异
- 提交监听（捕获 git commit 事件 → 继续后续流程）

---

### 缺口 5：IDE 任务简报面板（Patch 366 + 367）

#### 2.5.1 主容器

**文件**：`overlay/custom/client/ide/components/TaskBriefingPanel.vue`（新增）

```vue
<template>
  <NPanel title="📋 任务概览">
    <TaskHeader :task="currentTask" />
    <RequirementContext :task="currentTask" />
    <GitActivity :workspace="currentTask.workspacePath" />
    <WorkflowStatus :task="currentTask" />
    <CollaborationFeed :roomId="currentTask.roomId" />
    <AuxiliaryChat :taskId="currentTask.id" />
  </NPanel>
</template>
```

#### 2.5.2 子组件（6 个）

| 子组件 | 路径 | 功能 |
|--------|------|------|
| TaskHeader | `briefing/TaskHeader.vue` | 任务标题、状态、指派人、优先级 |
| RequirementContext | `briefing/RequirementContext.vue` | 需求文档链接、RF 摘要 |
| GitActivity | `briefing/GitActivity.vue` | git log、分支、PR 状态 |
| WorkflowStatus | `briefing/WorkflowStatus.vue` | Kanban 状态机可视化 |
| CollaborationFeed | `briefing/CollaborationFeed.vue` | Matrix 房间消息流 |
| AuxiliaryChat | `briefing/AuxiliaryChat.vue` | Hermes Agent 辅助会话 |

#### 2.5.3 侧栏集成

**文件**：`overlay/custom/client/ide/views/IdeTaskSidebar.vue`（修改）

在顶部操作栏添加 `📋` 按钮，点击打开 TaskBriefingPanel。

---

### 缺口 6：9 用户 Matrix 模拟扩展（Patch 368 + 369）

#### 2.6.1 后端：Hermes 配置模板

**文件**：`overlay/scripts/sim/configs/`（新增目录，9 个 .yaml 文件）

每个用户一个 Hermes 配置文件模板。

#### 2.6.2 脚本：sim-lib.sh 扩展

**文件**：`overlay/scripts/sim/sim-lib.sh`（修改）

USERS 数组扩展为：
```bash
USERS=(admin ba-chen fanfan lead-zhang dev-wang dev-liu arch-li qa-zhao qa-sun)
```

新增端口分配逻辑（9 用户 + 9 Bot，端口不冲突）。

#### 2.6.3 脚本：sim-setup.sh 扩展

**文件**：`overlay/scripts/sim/sim-setup.sh`（修改）

注册 9 个 Matrix 账号 + 9×3 = 27 个 Agent Bot。

#### 2.6.4 前端：模拟控制面板

**文件**：`overlay/custom/client/sim/SimControlPanel.vue`（新增）

提供 Web UI 控制模拟启动/停止/查看状态。

---

### 缺口 7：Docker 沙箱 compose（新文件）

#### 2.7.1 Compose 文件

**文件**：`overlay/docker-compose.sandbox.yml`（新增）

```yaml
version: '3.8'
services:
  mysql:
    image: mysql:8.0
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: pay_cashier
    volumes:
      - ./sandbox/init-data:/docker-entrypoint-initdb.d
    ports:
      - "${SANDBOX_MYSQL_PORT:-3307}:3306"

  redis:
    image: redis:7-alpine
    ports:
      - "${SANDBOX_REDIS_PORT:-6380}:6379"

  mock-gateway:
    image: aipaydev/mock-payment-gateway:latest
    environment:
      MOCK_MODE: "sandbox"
      SUPPORTED_CHANNELS: "wechat,alipay"
    ports:
      - "${SANDBOX_GATEWAY_PORT:-9090}:9090"

  app:
    build:
      context: .
      dockerfile: Dockerfile.sandbox
    environment:
      DB_HOST: mysql
      REDIS_HOST: redis
      GATEWAY_URL: "http://mock-gateway:9090"
    ports:
      - "${SANDBOX_APP_PORT:-8080}:8080"
    depends_on:
      - mysql
      - redis
      - mock-gateway
```

#### 2.7.2 Dockerfile

**文件**：`overlay/Dockerfile.sandbox`（新增）

基于 Node.js 18，安装依赖，启动应用。

#### 2.7.3 MySQL 初始化

**文件**：`overlay/sandbox/init-data/01-schema.sql`（新增）

支付收银台核心表 schema。

---

## 三、验证门禁（按缺口）

| 缺口 | 验证方式 | 通过标准 |
|------|----------|----------|
| 1 RACI | `npm run inject` + 前端表单渲染 | 表单含 4 个 RACI 选择器，API 响应含 RACI 字段 |
| 2 规则引擎 | `npm test`（新增规则引擎测试） | 4 条规则全部覆盖，熔断状态可触发 |
| 3 重试守卫 | `npm test`（新增重试守卫测试） | retry_count=3 时触发 Leader 介入 |
| 4 冲突 SOS | 手动触发 git 冲突 | Matrix 收到 SOS 消息，IDE 展示冲突视图 |
| 5 简报面板 | CDP 真机走查 | 六区块全部渲染，数据源正常 |
| 6 9 用户模拟 | `sim-fullchain.sh` | 9 用户 + 27 Bot 注册成功，流程通过 |
| 7 Docker | `docker compose -f docker-compose.sandbox.yml up` | 4 服务全部启动，端口映射正确 |

---

## 四、完整验证清单

### 4.1 构建验证

- [ ] `npm run inject` — 所有 patch 应用成功
- [ ] `npm run build:full` — 客户端/服务端全链构建通过
- [ ] `npm test` — 全部测试通过（原有 + 新增）

### 4.2 推演验证（3 个切片）

#### 切片 1：RFD → 分析 → 规则引擎熔断 → 解除 → 拆分（步骤 1-5）

- [ ] 创建收单商户需求 RFD
- [ ] RACI 派发消息到达 Matrix
- [ ] 指派人无 [Senior] 标签 → 熔断 `BLOCKED_BY_POLICY`
- [ ] PM 解除熔断 → 状态变为 `ready`
- [ ] 工作量 > 40 人天 → 触发拆分警告

#### 切片 2：分析完成 → 实施 → Git 冲突 → SOS → 解决 → 提测 → 测试打回 → 重试 → Leader 介入（步骤 6-15）

- [ ] 分析完成 → 任务状态变为 `running`
- [ ] Git merge 冲突 → SOS 消息
- [ ] IDE 展示冲突视图 → 开发者解决
- [ ] 提测 → 测试打回 → retry_count=1
- [ ] 修复 → 测试通过 → 任务状态变为 `review`
- [ ] 重复 3 次 → Leader 介入

#### 切片 3：评审 → 完成 → 简报 → 归档（步骤 16-20）

- [ ] 评审通过 → 任务状态变为 `done`
- [ ] IDE 简报面板展示六区块
- [ ] 任务归档 → 侧栏归档区可见

### 4.3 基础设施验证

- [ ] Docker compose `docker compose -f docker-compose.sandbox.yml up` 4 服务启动
- [ ] MySQL 初始化脚本执行成功
- [ ] 9 用户模拟 `sim-fullchain.sh` 完整流程通过

---

## 五、风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| RACI 语义冲突 | code 中明确 `approver` ≠ `assignee` |
| 规则引擎过度熔断 | 确保解除机制（人工点击"解除熔断"） |
| IDE 侧栏宽度 | 六区块支持折叠/宽度调节 |
| Matrix 端口冲突 | 9 用户 + 9 Bot，gateway 用 8781+ |
| Docker 资源 | 沙箱 4 服务建议 4GB+ 内存 |
| 上游文件不匹配 | 如需 patch 修改上游文件，先确认上游版本 |

---

## 六、实施顺序

1. **第 1 步**：RACI 数据模型（361 patch）— 其他缺口依赖 Kanban 字段
2. **第 2 步**：规则引擎（362 patch + 363 component）— 熔断机制需在任务创建时触发
3. **第 3 步**：防死循环（364 patch）— 独立模块
4. **第 4 步**：冲突 SOS（365 patch + component）— 独立模块
5. **第 5 步**：IDE 简报面板（366 + 367 patch）— UI 集成
6. **第 6 步**：9 用户模拟（368 + 369 patch）— 基础设施
7. **第 7 步**：Docker compose — 基础设施

实施顺序完成后 → 切片 1 → 切片 2 → 切片 3 → 全量回归

---

> **实施计划状态**：草稿，待用户批准后执行
