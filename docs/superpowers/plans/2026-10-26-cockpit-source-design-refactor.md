# AIStudio Cockpit Source and Design Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 AIStudio 现有信息架构，修复驾驶舱的数据与轨迹状态错误，并恢复由真实注册表驱动的全功能只读走查。

**Architecture:** `custom/` 是修改正身，vendor 只作为注入基线。轨迹以 session 为 reducer 隔离单位，最终合并仅为展示投影；路由走查以运行注册链为唯一来源，截图与报告为派生产物。

**Tech Stack:** TypeScript、Vue 3、Pinia、Vitest、vite-node、Playwright、Koa 路由注册链。

**Spec:** `docs/superpowers/specs/2026-10-26-cockpit-source-design-refactor.md`

## Global Constraints

- 不改导航结构、深链、TraceState schema、节点 ID、审批 decide API 或原始优先级语义。
- 不直接编辑 vendor，不在 main 工作区改代码，不覆盖在线 `serve-main`。
- 每项缺陷先跑出新测试的预期失败，再写实现；失败与未验证项不得省略。
- 路由走查只读，不把合法空态、鉴权响应、桌面专属页或不存在测试资源误报为缺陷。

## Review Focus

- 关联实时事件与历史加载交错：各自 session 状态不得被迟到结果覆盖。
- 同名但不同 id 的命令审批：两条都必须出现并可分别裁决。
- KanbanTask 与 CockpitTask 混合输入：时间和 P0→P3 顺序必须一致。
- 无提醒待办：不得显示虚假闹钟时间，也不得因时间戳 0 失去稳定顺序。
- 参数路由和重定向：清单必须可执行、可解释，不能靠增加静态复制表凑覆盖数。

---

### Task 1: 建立可测试基线

**Files:**
- Create: `docs/superpowers/specs/2026-10-26-cockpit-source-design-refactor.md`
- Create: `docs/superpowers/plans/2026-10-26-cockpit-source-design-refactor.md`

- [ ] 在 worktree 运行 `npm run inject`，确认基线与补丁重放成功。
- [ ] 运行 cockpit 目标测试，记录既有结果。
- [ ] 将规格决策写入 `.swarm-yuan/decisions.jsonl`（使用仓库现有 trace 工具）。

### Task 2: 审批与注意力契约

**Files:**
- Modify: `custom/client/cockpit/api/approvals.ts`
- Modify: `custom/client/cockpit/adapters/attention-adapter.ts`
- Modify: `custom/client/cockpit/store/cockpit.ts`
- Test: `custom/client/cockpit/__tests__/approvals-dedupe.test.ts`
- Test: `custom/client/cockpit/__tests__/approval-panel.test.ts`
- Test: `custom/client/cockpit/__tests__/attention-adapter.test.ts`
- Test: `custom/client/cockpit/__tests__/cockpit-store.test.ts`

**Interfaces:**
- `dedupePending(items: PendingApprovalItem[]): PendingApprovalItem[]` 签名不变。
- `toAttention(task: KanbanTask | CockpitTask): AttentionItem | null` 统一输入；输出结构不变。

- [ ] 添加同名不同 id 的 command 保留测试、同 task review 新盖旧测试和真实 dedupe 的组件测试，运行并确认 command 用例失败。
- [ ] 收窄去重实现，跑审批相关测试通过。
- [ ] 添加 CockpitTask 的 createdAt、P0/P3 排序及 KanbanTask 兼容测试，确认原实现失败。
- [ ] 复用 `toMs`/`bucketPriority` 修输入边界，移除 store 的 `as any`，跑相关测试通过。

### Task 3: 轨迹状态隔离与回放收敛

**Files:**
- Modify: `custom/client/cockpit/composables/useRunTrace.ts`
- Modify: `custom/client/cockpit/adapters/run-trace-adapter.ts`
- Test: `custom/client/cockpit/__tests__/use-run-trace.test.ts`
- Test: `custom/client/cockpit/__tests__/run-trace-adapter.test.ts`
- Test: `custom/client/cockpit/__tests__/trace-middlewares.test.ts`

**Interfaces:**
- 保持 `useRunTrace(sessionId)` 的返回契约。
- 保持 `createTraceState`、`mergeTraceStates`、`replayMessagesIntoState` 的同步签名。
- 提取同步的消息事件迭代/转换函数；composable 负责进度与 yield。

- [ ] 添加关联历史含 tool+reasoning+run completed 的测试：关联 run 闭合、thinking 归属正确、所有 edge 端点存在、主 run 不被改写。先确认失败。
- [ ] 添加关联实时 run.started/tool/completed 与主 run 交错的测试，先确认当前实现失败。
- [ ] 实现每 session 独立状态及合并投影，接入 L2、空壳、跨 session 边与标注；运行轨迹测试。
- [ ] 为统一消息转换添加相同输入等价测试，迁移主回放和关联回放；删除无调用旧 handlers，复跑全部 trace 与任务图测试。

### Task 4: 日程提醒时间

**Files:**
- Modify: `custom/client/ia2/store/workspace.ts`
- Test: `custom/client/ia2/__tests__/workspace-store.test.ts`
- Test: `custom/client/cockpit/__tests__/cockpit-schedule-modal.test.ts`

- [ ] 添加提醒时间、无提醒和排序测试，确认当前显示 createdAt 的行为失败。
- [ ] 修改日程投影并保留无提醒稳定顺序，运行 workspace 与 schedule 测试。

### Task 5: 路由清单与只读走查恢复

**Files:**
- Create: `scripts/regression/route-manifest.ts`
- Create: `scripts/regression/route-manifest.test.ts`
- Modify: `scripts/regression/walk-routes.mjs`
- Modify: `scripts/regression/harness.mjs`（仅在共享默认端口确需调整时）

**Interfaces:**
- 清单生成器输出 `{ routes, stageTabs, featureGates }` JSON；每条路由含 `name/path/kind/params`，页签含 `stage/key/query`。
- `walk-routes.mjs [routeFilterRegex]` 保留；`WALK_BASE`、`WALK_SHOTS` 保留。

- [ ] 先写清单测试：Matrix 与四个专题必须出现、六阶段 36 签、路由名唯一、没有缺失组件或重复页面状态。运行确认当前工具没有可满足的清单入口。
- [ ] 用注册函数和 vite-node 实现生成器，测试清单可独立生成。
- [ ] 修复 `openApp`、BASE、参数替换、重定向断言、失败分类、截图和退出码；先跑 `node --check` 与单路由 smoke，再跑全量。

### Task 6: 验证、审查与交付

**Files:**
- Modify: `docs/superpowers/specs/2026-10-26-cockpit-source-design-refactor.md`

- [ ] 运行全部相关 Vitest、静态检查与构建。
- [ ] 启动隔离前端并核验进程 cwd，完成全路由/页签走查与三档视口抽测。
- [ ] 在稳定 worktree 后台运行 `npm test`，记录完整结果。
- [ ] 复核完整 diff 和相邻路径，回填规格的证据与未验证项。
- [ ] 合入前按仓规决定提交与合并；合入成功后才通过 git 通道清理 worktree。
