# 治理面收口：三面对账 + GovOverlay 退役（spec）

日期：2026-10-21
分支：`feat/backlog-closure`
来源：`2026-10-21-backlog-closure.md` 战线B；用户裁定「⑥运营 + 设置配置，GovOverlay 退役」。

## 一、三面对账表（能力 → 唯一归属）

| GovOverlay 区 | 重复/独有 | 唯一归属 | 处置 |
|---|---|---|---|
| task 任务 | 与④看板重复（看板+任务抽屉四页） | ④ `/app/board` | 入口直达看板 |
| session 会话 | 与历史会话重复 | `/app/history`（ia2.collabHistory） | 入口直达历史 |
| people 员工 | 与①组织页签重复（OrgEditor/RACI） | ① `/app/stage/setup?tab=org` | 入口直达①组织 |
| agent 智能体 | 与①智能体页签重复 | ① `?tab=agents` | 入口直达① |
| team 团队 | 与①团队页签重复（区内已有 jump-org 按钮） | ① `?tab=teams` | 入口直达① |
| review 评审 | 与⑥评审治理页签重复（ReviewGovPanel） | ⑥ `/app/stage/govern?tab=reviewGov` | 入口直达⑥ |
| stats 统计 | 与⑥度量检查重复（StageMetricsPanel） | ⑥ `?tab=metrics` | 随组件退役（独有 VTU 测试同删） |

⑥八签与设置七域不变：⑥=运营记录与处置（发生了什么/要处理什么），设置=配置写入（改什么）。三面并存收敛为两面。

## 二、变更

1. **入口改路由直达**（调用点零语义变化，只换落点）：
   - `NotifyDropdownPanel` gate-review → ⑥评审治理；
   - `IaShellHeader` open-review → ⑥评审治理、open-gov-people → ①组织；
   - `WorkbenchView` ⚙管理 → ④看板；画布邀请（原会话区）→ 历史会话页。
2. **覆盖层退役**：删除 `GovOverlay/GovDetailPanel/Gov{Task,Session,People,Agent,Team,Review,Stats}Section` 九组件；`IaShell` 卸载挂载点与 Esc 专属分支；`flow` store 删除 `govOpen/govSection/govSelectedId/openGov/closeGov/GOV_SECTIONS`（布局与选择态保留）。
3. **测试**：`gov-overlay.test.ts`、`mf-test-stats.test.ts`（退役组件 VTU）删除；`ia-shell/ia-shell-header-sit/workbench-flow/cockpit-layout-guards` 四处断言改为路由直达。

## 三、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 七区全部「入口直达」而非内容迁移 | 每区能力在归属面都有正身（对账表）；复制内容=双实现违例 |
| D2 | stats 区随组件退役不迁移 | StageMetricsPanel 已覆盖同数据；仅一个 VTU 测试消费该组件 |
| D3 | store 不保留任何覆盖层态 | 覆盖层消失后 `govOpen` 等为死状态；布局/选择态与治理无关，保留 |
| D4 | `ia2.gov.*` i18n 词条本轮不清 | 词条量大且另有 i18n 守门批次；登记残留，防误删仍在用的键 |

## 四、验证

- 定向：`ia-shell / ia-shell-header-sit / workbench-flow / cockpit-layout-guards / matrix-teams/__tests__` **24 文件 / 247 用例全绿**。
- 源内 `openGov/govOpen/GOV_SECTIONS/GovOverlay` 引用清零（仅剩注释与 SkillgovSection 同名前缀，无关）。

## 五、未做（挂账）

- `ia2.gov.section.*` 等死词条清理（随 i18n 批）。
- `GovDetailPanel` 若未来需要「对象详情浮层」，按需求另立（当前无消费方）。
