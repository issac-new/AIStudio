# aipaydev 全流程推演 — 问题记录（缺口实现轮，2026-09-22）

> 记录人：缺口实现会话（区别于推演执行会话，后者台账在 `ncwk-sim-aipay/evidence/issues.log`）
> 方案基准：《Swarm Studio 全流程推演方案 V1.0》+ `overlay/spec/design.md`

## 问题记录 #1

- **发现阶段**：缺口 1（RACI 派发）/ patch 361 首版
- **问题描述**：patch 361 初版三处硬伤——①RACI 派发写在 createTask 的 catch（失败）分支；②patchTask 尾部 return 之后派发代码不可达；③custom 文件反向 `import type` upstream 模块（overlay 树内无该文件，custom→upstream import 禁令）
- **影响范围**：RACI 派发在生产路径永不生效 / build:full 必炸
- **严重程度**：P0（阻塞）
- **根因分析**：手写 patch 未对照注入态真实文件；忽略 custom 符号链接解析规则
- **修复方案**：改为 createTask 成功路径派发（`const created = JSON.parse(stdout)` → dispatch → return created）；删除 patchTask 尾巴；任务对象改本地结构化类型 `RaciDispatchTask`
- **修复人**：缺口实现会话
- **修复时间**：2026-09-22 18:35-18:40
- **回归验证**：inject 实测 361 落 upstream（kanban-service.ts:10/639-645 锚点）；build:full 绿；vitest 2199/2199

## 问题记录 #2

- **发现阶段**：缺口 5（IDE 任务简报面板）首版
- **问题描述**：面板首版写成 React TSX（.tsx + hooks），而项目技术栈是 Vue 3 + naive-ui + Pinia
- **影响范围**：死代码；若被引用必炸构建
- **严重程度**：P1
- **根因分析**：未先读同目录组件（IdeTaskContextBar.vue）确认栈
- **修复方案**：删除 TSX，重建 `TaskBriefingPanel.vue`（六区块、可折叠、props 注入、aux-send 事件）+ `briefing-types.ts`（`<script setup>` 禁 export interface）+ 5 项挂载测试 + IdeShell 右缘导轨按钮与抽屉集成
- **修复人**：缺口实现会话
- **修复时间**：2026-09-22 18:28-18:37
- **回归验证**：task-briefing-panel.test.ts 5/5；shell-layout.test.ts 9/9（补 kanban store 与面板桩）

## 问题记录 #3

- **发现阶段**：build:full 构建门禁
- **问题描述**：architecture-engine 引用 loop-guard 的 `LoopActionType` enum——严格 tsc 下 enum 类型不接受字符串字面量赋值；且 `{type:'CONTINUE'}` 缺 LoopAction 必填字段 message/taskId
- **影响范围**：server tsc 门禁红
- **严重程度**：P1
- **根因分析**：两文件分批写，类型契约未对齐
- **修复方案**：enum 改字符串联合类型；CONTINUE 语义性字段改 optional
- **修复人**：缺口实现会话
- **修复时间**：2026-09-22 18:47
- **回归验证**：build:full 全链绿（openapi → vite 8011 模块 → server tsc）

## 问题记录 #4

- **发现阶段**：收口审计
- **问题描述**：缺口 2/3 的生产调用点未接线——architecture-engine 与 loop-guard 为「服务+单测」态，尚无 B 类 patch 在 kanban assign/状态流转中调用；简报面板 Git 活动/协作动态两区块数据源为空态（UI 与任务概览数据已实接）
- **影响范围**：推演方案步骤 10.4 规则引擎关卡、16.7 防死循环熔断在生产链路未生效
- **严重程度**：P2（机制已实现且被单测锁定，缺集成点）
- **根因分析**：接线需在 kanban 流转热路径动 patch，恰逢并行会话实弹推演运行于同一注入树，收口纪律优先于范围扩张
- **修复方案**：待推演轮收口后单独一轮：patch 362（assign 链调 evaluateRules，BLOCKED_BY_POLICY 落任务 body 策略位）+ patch 363（complete/reopen 链调 RetryGuardService）+ 简报 Git 块接 /api/ide/git log
- **修复人**：待办（缺口实现会话移交）
- **修复时间**：—
- **回归验证**：—

**【已闭】2026-09-22 深夜二轮收口（main @67b3fef）**：
- patch 362/363 已落地并通过合并后全套门禁（规则引擎派发闸 362 打通 kanban-service:742 评估点；打回计数熔断 363 打通 reopenReview 链）
- 简报 Git 活动块接 ideGitApi status/log；协作动态块接 Matrix（任务群弱锚点匹配 + /messages 直读）
- Leader 通知实弹化：notifyLeader 经 `hermes send --to matrix:<AIPAYDEV_LEADER_MATRIX_ID>`（env 门控）
- 侧栏裸键 ide-i18n-raw-keys 修复：patch 365 四键 zh/en 双补 + TABS 全键双语言守门测试

## 问题记录 #6（二轮新增）

- **发现阶段**：二轮收口（inject 循环）
- **问题描述**：为生成 patch 365 手工编辑上游 locale 文件时序错误——`git checkout --` 把注入态还原成 pristine 后，inject 以「工作树不干净」拒跑，依赖注入态的守门测试批量挂（landing-ide/fleet-ws/cli-shim 共 8 例）
- **影响范围**：inject 循环中断约 10 分钟
- **严重程度**：P2
- **根因分析**：两态 diff 产 patch 时把「注入态备份/恢复」与「series 登记」的顺序搞反
- **修复方案**：从 /tmp 备份恢复注入态+按键编辑 → series 登记 365 → clean（逆序先吃 365）→ inject（全量重放）
- **修复人**：缺口实现会话
- **修复时间**：2026-09-22 23:14
- **回归验证**：inject 365 应用成功、守门 10/10、全量 2225/2225

## 门禁快照（二轮收口后最终态）

| 门禁 | 结果 |
|------|------|
| vitest（overlay npm test） | 230 文件 / 2225 用例全绿 |
| build:full | 绿（openapi → vite build → server tsc） |
| inject | 全 series 含 361-365 应用成功 |
| 实弹推演 | 20 步全部门禁跑通，中央仓终提交 f4f716c |
| origin 推送 | **已推**（09-22 深夜网络恢复窗口）：`da82ce3..1802c58 main->main` 共 31 提交，`git rev-parse origin/main` 反查实证 = 1802c58d |

## 问题记录 #5（引用推演执行会话台账）

- **发现阶段**：切片 2 步骤 10.4（实弹轮，由推演执行会话驱动）
- **问题描述**：room-invite-gap ×8（Orchestrator 不自动邀人，根因 adapter.invite_user:2721 死 API，无 CLI 无工具面）+ receipt-missing ×1（AN-CHWX 双兜底缺口），详见 `ncwk-sim-aipay/evidence/issues.log`
- **严重程度**：P1
- **修复方案**：hermes matrix invite/send CLI 补面（推演执行会话在案）
- **回归验证**：推演执行中

---

## 门禁快照（本记录落档时点）

| 门禁 | 结果 |
|------|------|
| vitest（overlay npm test） | 224 文件 / 2199 用例全绿（新增 14） |
| build:full | 绿（openapi → vite build → server tsc） |
| inject | 361 号 patch 应用成功，upstream 锚点在位 |
| 实弹推演 | 切片 2 步骤 10 进行中（四系分任务全回执），由推演执行会话持续驱动 |
