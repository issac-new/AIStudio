# 驾驶舱 P1 残项清偿（建板反馈定性＋假开关根治＋板列说明）

> 批次：fix/cockpit-p1-residual-20261023｜日期：2026-10-23｜依据：用户指令「按建议推进」（建议顺序=驾驶舱 P1 剩 2 项→首载复测→P7 委托能力摘要）

## 一、P1-1「建板成功无反馈」定性（重要反转）

走查实录（2026-10-22-cockpit-refactor-design.md P1：「建板成功后停在原页…API 建成、UI 无感」）本轮活体三轮复现取证后**定性为服务载体态漂移，非产品正身缺陷**：

- 取证链：无头浏览器三轮提交建板→fetch/XHR 双 hook+resource timing 证实**POST /api/hermes/kanban/boards 从未发出**且零 JS 错误；Vue vnode 检查证实 onCreateBoard handler 运行态已注册；最终定位 8649 vite serve 的 SwarmKanbanView 编译产物为**旧版**（serve-main worktree 的 vite 模块缓存未随磁盘换装刷新，旧版组件无建板 handler——正好构成「emit 发生（modal 关）→无 handler→零请求零报错」的完整静默特征）。
- 产品正身链路健全证据：handleCreateBoard（SwarmKanbanView.vue:547）有 message.success('看板已创建'，zh locale 3772 行在册）＋workspace.refreshAllBoards(true) 列表刷新；聚合模式（v12.5 排除集语义）下新板自动并入 chips（空集=全选），「hash 未变/无跳转」在聚合页无单板 hash 语义，不是缺陷。
- 处置：产品代码不为此项改动；载体侧属运维事实（8649 换装后需确认模块缓存刷新，已记入决策）。

## 二、真缺陷根治：建板「创建后切换」假开关（patch 682）

深挖发现的真缺陷：KanbanToolbar 建板表单有「创建后切换到新看板」勾选框（默认勾），但 store.createBoard 无视 switchCurrent 参数、无条件 setSelectedBoard——取消勾选仍强切，表单选项是假的（违反产品验收五条之「点得通」）。

- 修复：patch 682（upstream stores/hermes/kanban.ts createBoard）：`if (data.switchCurrent !== false) setSelectedBoard(board.slug)`——默认行为不变（默认勾选仍切），仅取消勾选时尊重用户选择。
- 生成方式：difflib 非手写 hunk；git apply --check 干净通过；series 登记 682（原 680 撞号改 682）。

## 三、P1-2 组织表「板（team）」列裸 slug

OrgEditor 是 org registry markdown 正身编辑器（表格直接编辑 org.md 原文），显示 slug 属**正身语义**——显示层替换成板名会破坏「所编即所存」。走查诉求的实质是「看不懂这一列填什么」。

- 修复：表格上方加格式说明条（data-testid=org-editor-board-hint）：说明该列填板 slug、可带括号角色注记、按原文提交、看板中文名在看板页查看。编辑语义零改动。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | P1-1 定性为载体态漂移不改正身代码 | 三轮活体取证：旧版编译产物无 handler＝完整静默特征；正身链路（handler+locale+刷新+chips 并入）逐环实测在册 | 硬给 handleCreateBoard 加冗余反馈（否决：重复反馈无信息增量） | 是 |
| 2 | switchCurrent 假开关经 patch 682 根治（!== false 语义） | 表单选项必须有效（验收「点得通」）；默认开=存量行为零变化 | 一律不切/一律切（否决：破坏默认体验） | 是 |
| 3 | P1-2 用格式说明条而非显示名替换 | OrgEditor=markdown 正身编辑器，所编即所存；替换显示会写坏 registry | slug→板名映射渲染（否决：编辑器不能展示非提交内容） | 是 |

## 验证

- patch 682：git apply --check 通过；差量注入后跑定向测试（见批次收口记录）。
- OrgEditor：hint 渲染测试＋vue-tsc 定向。
- 8649 复验：属并行会话载体，本批不重启；换装后由下轮走查确认。
