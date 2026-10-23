# 驾驶舱 P1 残项清偿（建板反馈定性＋假开关根治＋板列说明）

> 批次：fix/cockpit-p1-residual-20261023｜日期：2026-10-23｜依据：用户指令「按建议推进」（建议顺序=驾驶舱 P1 剩 2 项→首载复测→P7 委托能力摘要）

## 一、P1-1「建板成功无反馈」定性（终版：真缺陷，收窄到聚合板源）

走查实录（2026-10-22-cockpit-refactor-design.md P1：「建板成功后停在原页…API 建成、UI 无感」）本轮经**载体刷新后仍复现**＋服务端对账，定性修正为：**真缺陷，且正是走查所述「API 建成、UI 无感」**。取证全程（含一次中间误判的更正）：

- **创建链路全通**：每轮 UI 提交（含 hook 抓不到请求的三轮）服务端都真实建板——最终 `listBoards` 对账 6 个 e2e 板全部在册（本轮已全部归档清理）。此前「POST 从未发出」是 hook 覆盖面不足（应用自有 request 通道）造成的误判；toast 大概率正常（message 3 秒生命期与取样竞态，未定论）。
- **用户可见缺陷＝chips 板条不反映真实板清单**：服务端 21 板（aiteam/pay/platform/[已移除]…）而板条常驻只显示 `default`。workspace.refreshAllBoards 优先走聚合端点 `/api/hermes/kanban/overview`，其 boards 为空时前端回落值恰为 `[{default}]`——与实测症状完全吻合。嫌疑落点：服务端 kanban-overview 的 boards 快道（`<home>/kanban/boards/` 文件布局直读）在 8647 载体的 HERMES home 布局下返回空。8647 为并行会话载体（env/布局不可控、不宜重启），根因坐实需要鉴权态下对真实载体打 overview 端点＋核 kanbanDir 布局，归**下一专项批**。
- **已排除项**：双实例疑云（vnode uid 40/41）系 keep-alive 缓存实例的正常并存，非断链；switchCurrent 假开关已根治（§二）。
- 处置：本批不改聚合链路；专项批验收线=建板/归档后 chips 即时反映（含 WS 事件驱动路径），并对「overview boards 空」出根因结论。

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
| 1 | P1-1 定性为真缺陷（聚合板源空导致 chips 常驻只显 default），本批不改、立专项批 | 服务端 6 个 e2e 板全部建成＝创建链全通；chips 不反映 21 板真实清单与 overview boards 空回落值吻合；初判「载体漂移」系 hook 覆盖不足误判，已更正 | 按「正身无缺陷」结案（否决：与走查症状和服务端对账矛盾） | 是 |
| 2 | switchCurrent 假开关经 patch 682 根治（!== false 语义） | 表单选项必须有效（验收「点得通」）；默认开=存量行为零变化 | 一律不切/一律切（否决：破坏默认体验） | 是 |
| 3 | P1-2 用格式说明条而非显示名替换 | OrgEditor=markdown 正身编辑器，所编即所存；替换显示会写坏 registry | slug→板名映射渲染（否决：编辑器不能展示非提交内容） | 是 |

## 验证

- patch 682：git apply --check 通过；差量注入后跑定向测试（见批次收口记录）。
- OrgEditor：hint 渲染测试＋vue-tsc 定向。
- 8649 复验：属并行会话载体，本批不重启；换装后由下轮走查确认。
