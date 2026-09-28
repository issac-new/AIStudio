# 产品 UI 缺陷清单与修复方案（推演暴露 · 2026-09-27）

> 来源：V3 全流程推演（09-25 14:00 — 09-26 08:27）+ 09-27 报告走查暴露。
> 本文档是下一轮 goal 模式会话的输入：以"推演报告=产品实操演示"为目标，修复下列全部缺陷。

## 一、P0：恢复 Studio 前端构建（阻断性）

### 现象
- `upstream/hermes-studio/dist/client/` 为空，所有 SPA 路由 404
- Studio 服务端 :8802 报 `ready` 但无前端可服务
- 直接原因：并行会话直接修改了 `packages/client/src/i18n/locales/{zh,en}.ts`（绕过 patch 体系），导致 patch 473-475 的 git apply 上下文不匹配

### 根因链
1. **patch 473** (`473-delivery-cases-i18n.patch`)：i18n locale 文件在 1109 行处的上下文被并行会话改变 → `git apply` 拒绝
2. **patch 475** (`475-agent-shed-tiered-metrics.patch`)：hermes-agent 的 `context_compressor.py` 同样被并行修改
3. **连锁**：clean 操作（`npm run clean`）把已注入的 auth store 等文件还原到 upstream 原始态 → `@/stores/hermes/auth` 模块消失 → vite build 报 module not found
4. **构建体系脆弱**：`npm run build` 的 prebuild（ensure-injected.mjs）在任一 patch 冲突时硬失败，没有 `--3way` 回退或跳过机制

### 修复方案
```bash
# 1. 确认 upstream git 状态（哪些文件被直接修改）
cd upstream/hermes-studio && git diff --stat

# 2. 对每个冲突 patch，用 git diff 生成正确的新 patch（以当前文件为基线）
#    或者：把并行会话的直接修改提取为新 patch，然后删除旧 patch

# 3. 重新 inject + build
cd overlay && npm run clean && npm run inject && npm run build

# 4. 验证 dist/client/index.html 存在
ls upstream/hermes-studio/dist/client/index.html
```

### 长期改进
- inject.mjs 加 `--skip-conflicts` 选项（冲突 patch 打警告不阻断）
- 或改用 `git apply --3way` 自动合并
- 加 CI 门禁：构建产物完整性检查（dist/client/index.html 存在性）

---

## 二、P1：人工审批 UI（产品功能缺失）

### 现象
推演过程中，agent 发起终端命令时需人工批准（如建卡/推送/评审操作）。当前唯一方式是在 matrix 群里发 `!approve` 文本命令——**产品没有审批 UI 组件**。

### 需要的 UI
1. **看板卡详情面板**：卡片操作区加"审批"按钮（Approve / Reject / View Diff）
2. **收件箱式待审列表**：左侧导航加"Inbox"入口，显示当前登录人所有待审事项（来源：agent 命令请求 + 看板评审卡 + 发布准出卡）
3. **审批历史**：已批准/已拒绝的记录（时间+操作人+操作对象+结果）

### 数据源
- hermes agent 的审批队列已有后端支持（`MATRIX_APPROVAL_TIMEOUT_SECONDS` / `!approve` 命令机制）
- 需要在 studio server 加 REST API：`GET /api/approvals/pending` / `POST /api/approvals/:id/approve`
- 前端调用此 API 渲染审批面板

### 实现位置
- `overlay/custom/client/cockpit/components/` → 加 `ApprovalPanel.vue`
- `overlay/custom/server/` → 加审批路由
- 需要 patch：`4xx-approval-panel.patch`

---

## 三、P2：看板 RACI 可视化（产品功能缺失）

### 现象
看板卡片只显示标题+状态+指派人，不显示 RACI 角色（谁主责/谁审批/谁咨询/谁通知）。人打开看板看不出"哪些卡等我来操作"。

### 需要的 UI
1. **卡片 RACI 徽章**：卡片右上角显示 R/A/C/I 彩色小标签
2. **"等您操作"过滤器**：顶部按钮，一键过滤出当前登录人的待审(R)/待做(A)卡
3. **泳道视图**：按 RACI 角色分泳道显示（可选高级功能）
4. **RACI 结构化字段展示**：卡片详情面板里显示完整的 RACI 四元组（已有后端结构化 raci 字段，前端未渲染）

### 数据源
- 看板卡已有结构化 `raci` 字段（patch 391 后 kanban 支持 `--raci` 参数）
- Studio API 返回卡详情时已含 raci 数据，前端未利用

### 实现位置
- `upstream/hermes-studio/packages/client/src/views/hermes/KanbanView.vue` → patch 加 RACI 渲染
- `overlay/custom/client/cockpit/components/` → 加 RACI 过滤器组件

---

## 四、P3：IDE 任务简报联动（产品功能缺失）

### 现象
从看板卡跳转到 IDE 工作台（`#/ide?task=<卡ID>`）后，IDE 不自动显示该任务简报。用户需要自己找上下文。

### 需要的 UI
1. **任务简报面板**：IDE 左侧或顶部显示当前任务的基本信息（标题/描述/RACI/关联文档/当前状态）
2. **上下文文件列表**：任务简报下列出 workspace 中的关键文件（需求文档/概设/排期等）
3. **一键打开**：点击文件名在 IDE 编辑器中打开

### 数据源
- 任务数据已在 kanban 数据库中
- workspace 文件列表可通过 API 获取

### 实现位置
- `overlay/custom/client/ide/` → 加 `TaskBriefPanel.vue`
- IDE 路由 `#/ide?task=` 参数已有解析逻辑，需接入简报生成

---

## 五、P4：协作沟通 UI 增强（体验不足）

### 现象
群聊页面只显示消息列表，缺少以下关键信息：
- 不显示消息关联的看板卡（消息里的 card=t_xxx 是纯文本）
- 不显示消息的 RACI 语义（@某人 + 任务 ≠ 自动识别为"这是派发给你的"）
- 无"任务时间线"视图（无法看到任务的完整流转历史）

### 需要的 UI
1. **消息内卡链接**：消息正文里的 `card=t_xxx` 自动渲染为可点击链接（跳转到看板卡详情）
2. **@提及高亮**：被 @ 的当前登录人名高亮显示
3. **任务时间线**：侧栏显示当前群关联的任务流转时间线（谁→谁→什么操作→什么时候）

---

## 六、P5：驾驶舱全局概览增强（体验不足）

### 现象
驾驶舱首页（#/app）显示_rooms 列表和 Tasks·Decisions 面板，但缺少：
- 无"当前轮次推演进度"概览（26 步走到哪了）
- 无"闸门状态"仪表盘（G1-G6 哪些过了哪些没过）
- 无"我的待办"聚合视图

### 需要的 UI
1. **推演进度条**：26 步进度条（当前步高亮，闸门步骤金色标记）
2. **闸门仪表盘**：六道闸的状态卡片（通过=绿色/待过=灰色/未到=隐藏）
3. **我的待办**：聚合当前登录人的所有待操作事项（待审/待做/待评）

---

## 修复顺序与依赖

```
P0 恢复构建 ──→ P1 审批 UI ──→ P2 看板 RACI ──→ P3 IDE 简报
                     │                              │
                     └──→ P4 沟通增强 ──→ P5 驾驶舱增强
```

P0 是阻断项（不修好构建什么都做不了）。P1-P3 是核心功能（推演报告需要的实操截图）。P4-P5 是体验增强。

---

## 推演报告=产品实操演示的目标形态

修复完上述缺陷后，推演报告应该：
1. **每步截图=真实产品 UI 操作画面**（不是文档渲染或 CLI 输出）
2. **人的操作清晰可见**：审批按钮点击、看板卡拖拽、IDE 代码编辑
3. **AI 的工作清晰可见**：agent 回复消息、自动建卡、自动测试
4. **闸门决策有专属界面**：G1-G6 各有评审/准出/复盘的专属 UI
5. **全程流畅连贯**：像看一段录屏，从需求到交付一气呵成

---

## 附录：本轮推演已根治的 9+ 项基础设施缺陷

| # | 缺陷 | 修复锚点 |
|---|---|---|
| 1 | 凭证验证器自毒化假阴性 | overlay main 9222e72 |
| 2 | 派单 assignee 与围栏约定冲突 | overlay main c6368d0 |
| 3 | worker 运行时 PYTHONPATH 缺失 | overlay main 78dbf7d |
| 4 | studio 家族授权缺失（28 条） | 数据修复 |
| 5 | mx_send 瞬断静默击杀 + mx_room_members 缺失 | overlay main d734653 |
| 6 | 派发者不在群（403） | overlay main 7ef0cfc |
| 7 | integration checkout 脏文件挡 | overlay main baa787b |
| 8 | 报告自指标记矛盾 | overlay main 070cf85 |
| 9 | 存证时间窗毫秒/秒单位错配 | overlay main 97a4de6 |
| 10 | csw-cashier-mp vitest 骨架缺失 | aipaydev main 728dcfe |
| 11 | gov_report 占位符 → 实算首过率 | overlay main dd026d24 |
