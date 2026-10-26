# Swarm Studio 全流程推演方案 - 缺口实现设计文档

> **项目代号**：aipaydev  
> **Git 仓库**：`https://github.com/issac-new/aipaydev`  
> **设计日期**：2026-09-22  
> **基准**：ncwk v0.7.23 + overlay 6ace167  
> **目标**：落地「Swarm Studio 全流程推演方案（V1.0）」的 7 大缺口，实现 20 步推演全链路闭环

---

## 一、缺口概览

| 编号 | 缺口名称 | 当前状态 | 实现方式 | 预计 Patch 号 |
|------|----------|----------|----------|---------------|
| 1 | RACI 字段 + Matrix 派发 | 0 | A 类 custom + B 类 patch | 361-365 |
| 2 | 架构规则引擎熔断 | 熔断机制存，规则引擎缺 | A 类 new component | 366-367 |
| 3 | 防死循环 retry_count | maxRetries 存，无 Leader 介入 | A 类 patch | 368 |
| 4 | Git 冲突 SOS 降级 | 有冲突检测，无降级 | A 类 new feature | 369 |
| 5 | IDE 任务简报面板 | 三视图存，六区块缺 | A 类 new component | 370-371 |
| 6 | 9 用户 Matrix 模拟 | 3 用户 + 3 Bot | A 类 extend | 372 |
| 7 | Docker 沙箱 compose | 无 compose，只有脚本 | A 类 new file | docker-compose.sandbox.yml |

---

## 二、机制细节设计

### 缺口 1：RACI 字段 + Matrix 派发

**位置**：`overlay/custom/client/api/hermes/kanban.ts`（添加字段） + `overlay/custom/server/controllers/...`（校验 + 消息）

**数据模型扩展**（KanbanTask 接口）：

```ts
interface KanbanTaskRACI {
  // R - 主责（Responsible）
  responsible: string[]  // 最少1人
  
  // A - 授权（Accountable / Approver）
  approver: string[]    // 最多1人，评审通过者
  
  // C - 咨询（Consulted）
  consulted: string[]   // 中间方
  
  // I - 通知（Informed）
  informed: string[]    // 监听方
}
```

**派发流程**：

1. `KanbanTask` 创建时，RACI 字段通过表单提交
2. 当状态变为 `analysis` 时，调用 `RACIDispatchService`：
   - 创建 Matrix 群聊
   - @ 所有 responsible
   - 发送任务摘要 + 需求文档链接
   - 邀请 approver、consulted、informed 加入群

**矩阵消息模板**：

```json
{
  "type": "task_dispatch",
  "task_id": "SYS-ANALYSIS-0001",
  "title": "收单商户支付收银台需求分析",
  "RACI": {
    "responsible": ["@dev-wang"],
    "approver": ["@lead-zhang"],
    "consulted": ["@arch-li"],
    "informed": ["@fanfan"]
  },
  "channels": ["#aipaydev-dev", "#aipaydev-general"]
}
```

**实现文件**：
- `overlay/custom/client/api/hermes/kanban.ts`：添加 RACI 接口
- `overlay/custom/server/services/kanban/raci-dispatch.ts`：分发服务
- `overlay/custom/server/controllers/hermes/kanban.ts`：新增 `dispatch-racii` endpoint

---

### 缺口 2：架构规则引擎熔断

**核心规则**：

1. **敏感模块校验**：涉及 `资金清算/路由网关/对账/签名验签` 的任务，指派人必须具备 `[Senior]` 或 `[Security]` 标签
2. **依赖拓扑校验**：禁止循环依赖（检测 task.parentTask 递归闭环）
3. **能力匹配校验**：任务所需技能 ⊆ 指派人已注册技能
4. **工作量阈值**：单个任务预估工作量 > 40 人天 → 触发拆分警告

**状态**：`BLOCKED_BY_POLICY` 需新增 Kanban 任务状态

```ts
// overlay/custom/client/cockpit/composables/useKanbanTaskGraph.ts
type KanbanTaskStatus = 
  | 'triage' | 'todo' | 'scheduled' | 'ready' | 'running'
  | 'blocked' | 'review' | 'done' | 'archived'
  | 'BLOCKED_BY_POLICY'  // 新增
```

**规则引擎入口**：

```ts
// overlay/custom/server/services/kanban/rule-engine.ts
class ArchitectureRuleEngine {
  static checkSensitiveModule(task: KanbanTask, assignee: AgentProfile): ValidationResult
  static checkDependencyTopology(task: KanbanTask): ValidationResult
  static checkCapabilityMatch(task: KanbanTask, assignee: AgentProfile): ValidationResult
  static checkWorkloadThreshold(task: KanbanTask, estimate: EstimateResult): ValidationResult
  
  static validate(task: KanbanTask, assignee: AgentProfile): RuleEngineResult
}
```

**熔断处理**：

```ts
if (ruleEngine.validate(task, assignee).blocked) {
  task.status = 'BLOCKED_BY_POLICY'
  notify('high_priority', `架构规则熔断：${task.title}`)
  // 生成告警卡片，PM 手动解除
}
```

**实现文件**：
- `overlay/custom/server/services/kanban/rule-engine.ts`：规则引擎核心
- `overlay/custom/client/api/hermes/kanban.ts`：状态类型扩展
- `overlay/custom/server/controllers/hermes/kanban.ts`：校验入口

---

### 缺口 3：防死循环 retry_count + Leader 介入

**机制**：

1. Kanban 任务字段 `bug_fix_retry_count` 初始为 0
2. 测试 Agent 打回 → 研发 Agent 修复 → 提测
3. 每轮累加 `bug_fix_retry_count++`
4. 当 `>= 3` 时触发 Tech Leader Agent 介入

**Tech Leader 介入流程**：

```ts
interface RetryEvidence {
  errorLogs: string
  diffSummary: string
  testResults: string
  leaderRecommendation: '指导修复' | '接管修复' | '标记 ESCALATED'
}
```

**Leader Agent 查找**：在 `~/.hermes/profiles/` 按 `team_leader` 标签找代理

**实现文件**：
- `overlay/custom/server/services/kanban/retry-guard.ts`：重试计数 + 熔断
- `overlay/custom/server/services/agents/team-leader.ts`：Leader 代理发现

---

### 缺口 4：Git 冲突 SOS 降级

**机制**：

1. `git merge/pull` 时检测到冲突 → Agent 停止
2. 创建临时分支 `merge-conflict/<task-id>-<timestamp>`
3. 打包冲突文件、原文件、目标文件生成 `.zip`
4. 通过 Matrix 发送 "SOS：冲突求助" 消息
5. Swarm Studio IDE 接收信号 → 自动打开"合并解决视图"
6. 人类开发者在 IDE 中解决
7. 提交后，Agent 捕获提交事件 → 继续后续流程

**冲突文件打包**：

```bash
# 冲突文件列表
CONFLICTS=$(git diff --name-only --diff-filter=U)
# 原文件
ORIGINALS=$(git show HEAD --name-only)
# 打包
cd $WORKSPACE && zip -r conflicts-$TIMESTAMP.zip $CONFLICTS
```

**Matrix 消息**：

```json
{
  "type": "signal",
  "subtype": "conflict_sos",
  "task_id": "FEAT-001",
  "workspace": "/tmp/ws",
  "conflict_archive": "http://fileserver/conflicts-20260922-1430.zip",
  "matrix_room": "#aipaydev-dev:matrix.test"
}
```

**IDE 接收**：`IdeConflictSolver.vue` 组件展示冲突文件 + 提交监听

**实现文件**：
- `overlay/custom/server/controllers/ide/git.ts`：冲突检测增强
- `overlay/custom/server/services/kanban/conflict-sos.ts`：SOS 机制
- `overlay/custom/client/ide/components/IdeConflictSolver.vue`：合并解决视图

---

### 缺口 5：IDE 任务简报面板（六区块）

**组件**：`TaskBriefingPanel.vue`

```vue
<template>
  <NPanel title="📋 任务概览">
    <!-- 区块 1：任务概览 -->
    <TaskHeader :task="currentTask" />
    
    <!-- 区块 2：需求上下文 -->
    <RequirementContext :task="currentTask" />
    
    <!-- 区块 3：Git 活动 -->
    <GitActivity :workspace="currentTask.workspacePath" />
    
    <!-- 区块 4：Kanban 状态 -->
    <WorkflowStatus :task="currentTask" />
    
    <!-- 区块 5：协作动态 -->
    <CollaborationFeed :roomId="currentTask.roomId" />
    
    <!-- 区块 6：辅助会话 -->
    <AuxiliaryChat :taskId="currentTask.id" />
  </NPanel>
</template>
```

**数据流**：

| 区块 | 数据源 | 刷新 |
|------|--------|------|
| 任务概览 | Kanban API | ACP 推送 |
| 需求上下文 | Git 仓库 + Matrix 附件索引 | 创建时拉取 |
| Git 活动 | `git log` + 远端 PR API | 30s 轮询 |
| Kanban 状态 | Kanban 元数据 | 状态变化推送 |
| 协作动态 | Matrix 房间消息 | 实时同步 |
| 辅助会话 | Hermes Agent 生成 | 打开时生成 |

**触发方式**：

- 侧栏右上角 `📋` 按钮打开
- 或通过 Kanban 任务跳转时自动弹出

**实现文件**：
- `overlay/custom/client/ide/components/TaskBriefingPanel.vue`：主容器
- `overlay/custom/client/ide/components/briefing/TaskHeader.vue`
- `overlay/custom/client/ide/components/briefing/RequirementContext.vue`
- `overlay/custom/client/ide/components/briefing/GitActivity.vue`
- `overlay/custom/client/ide/components/briefing/WorkflowStatus.vue`
- `overlay/custom/client/ide/components/briefing/CollaborationFeed.vue`
- `overlay/custom/client/ide/components/briefing/AuxiliaryChat.vue`

---

### 缺口 6：9 用户 Matrix 模拟扩展

**从 3 用户 → 9 用户**：

| Matrix 账号 | 角色 | Hermes 配置文件 |
|-------------|------|-----------------|
| admin | 平台运维 | ~/.hermes/configs/admin.yaml |
| ba-chen | Business Analyst | ~/.hermes/configs/ba-chen.yaml |
| fanfan | 产品经理A | ~/.hermes/configs/fanfan.yaml |
| lead-zhang | 技术负责人 | ~/.hermes/configs/lead-zhang.yaml |
| dev-wang | 研发工程师 | ~/.hermes/configs/dev-wang.yaml |
| dev-liu | 研发工程师 | ~/.hermes/configs/dev-liu.yaml |
| arch-li | 架构治理 | ~/.hermes/configs/arch-li.yaml |
| qa-zhao | 测试负责人 | ~/.hermes/configs/qa-zhao.yaml |
| qa-sun | 测试工程师 | ~/.hermes/configs/qa-sun.yaml |

**Agent Bot**：

| Bot 名称 | 能力 |
|----------|------|
| orchestrator-<user> | 任务调度、消息路由 |
| systems-analyst-<user> | 需求分析、任务拆分 |
| test-agent-<user> | 测试执行、缺陷报告 |

**扩展脚本**：`overlay/scripts/sim/sim-setup.sh`

```bash
# 从 3 用户扩展到 9 用户
USERS=(admin ba-chen fanfan lead-zhang dev-wang dev-liu arch-li qa-zhao qa-sun)

# 为每个用户创建 Matrix 账号
for user in "${USERS[@]}"; do
  synapse_register "$user" "$USERS_MATRIX_ROOM"
done

# 为每个用户创建 3 个 Agent Bot
for user in "${USERS[@]}"; do
  for bot in orchestrator systems-analyst test-agent; do
    register_agent_bot "$user" "$bot"
  done
done
```

**实现文件**：
- `overlay/scripts/sim/sim-lib.sh`：USERS 数组扩展
- `overlay/scripts/sim/sim-setup.sh`：账号注册逻辑
- `overlay/scripts/sim/configs/*.yaml`：9 个 Hermes 配置模板

---

### 缺口 7：Docker 沙箱 compose

**文件**：`overlay/docker-compose.sandbox.yml`

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

**实现文件**：
- `overlay/docker-compose.sandbox.yml`：主 compose 文件
- `overlay/Dockerfile.sandbox`：App 构建文件
- `overlay/sandbox/init-data/`：MySQL 初始化脚本

---

## 三、实施计划（9 项子任务）

### 阶段 1：骨架搭建（第 1-2 天）

1. **RACI 数据模型扩展** → `361-server-kanban-raci.patch`
2. **规则引擎核心** → `362-server-rule-engine.patch` + `363-client-rule-engine-ui.patch`
3. **Docker compose** → `docker-compose.sandbox.yml` + `Dockerfile.sandbox`

### 阶段 2：机制实现（第 3-4 天）

4. **防死循环 retry_count** → `364-server-retry-guard.patch`
5. **Git 冲突 SOS 降级** → `365-server-conflict-sos.patch` + 组件
6. **9 用户 Matrix 模拟** → 扩展 `sim-lib.sh` + `sim-setup.sh`

### 阶段 3：IDE 集成（第 5 天）

7. **IDE 任务简报面板** → `366-client-ide-briefing.patch` + 6 个子组件

### 阶段 4：推演验证（第 6 天）

8. **切片 1**：3 用户 → 9 用户，验证矩阵通信
9. **切片 2-3**：完整推演闭环

---

## 四、验证门禁

| 门槛 | 检查方式 |
|------|----------|
| `npm run inject` | 所有 patch 应用成功，`vite.config.overlay.ts` 生成 |
| `npm run build:full` | 客户端/服务端全链构建通过 |
| `npm test` | 140+ 测试文件 100% 通过 |
| `overlay/scripts/sim/sim-fullchain.sh` | 推演脚本完整通过一次 |
| CDP 真机走查 | 侧栏六区块渲染，RACI 派发消息，规则引擎熔断生效 |

---

## 五、风险与注意事项

1. **RACI 语义冲突**：方案中 "A" 指授权/审查者，需在 code 中明确 `approver` ≠ `assignee`
2. **规则引擎积极防御**：过度熔断可能阻塞开发，需确保解除机制（人工点击"解除熔断"）
3. **IDE 侧栏宽度**：六区块叠加会占满屏，需支持折叠/宽度调节
4. **Matrix 端口冲突**：9 用户 + 9 Bot = 18 个 hermes 实例，需确保端口不冲突（gateway 用 8781+）
5. **Docker 资源**：沙箱 MySQL + Redis + Mock Gateway + App，建议 4GB+ 内存

---

> **设计文档状态**：草稿，待用户批准后进入实施