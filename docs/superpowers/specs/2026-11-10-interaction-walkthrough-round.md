# 全页面交互级功能排查轮：写路径回归＋缺口域闭环＋走查工装锚点修复（2026-11-10）

## 变更

对 AIStudio 全部页面的增删改查/提交/查看做交互级排查（用户指令「全面排查页面每一处具体的增删改查、提交、查看等等功能」）。三层验证面：

**① 存量写路径回归脚本全量重放**（隔离环境 worktree qa-walk2-1110，端口 8647/8649＋8657/8659 双对，三套隔离数据根）：

| 域 | 脚本 | 结果 |
|---|---|---|
| 看板 API 写路径 | walk-writes | 16/16（建板/建卡/改状态/删卡/删板/401 权限矩阵/running 409） |
| 看板 UI 写路径 | prod-board-write | 6/6（行内建卡→抽屉→审批按钮区；修复后） |
| 变更治理实弹 | change-gov | 20/20（变更单提交/SLA/冻结窗口/穿透 chip/override/指标回灌/管理三账；修复后） |
| eval 评测引擎 | verify-helix-live | 10/10（建集 201/跑 run 判过/拒伪造/calibrate F2P 落库） |
| 日常工作台 | daily-workbench | 69 pass/4 defect（缺陷全环境数据态：matrix 未接/空看板/空检索面；写路径 E4-E7 全过） |
| 仿真中心 | sim-center | 4 pass/3 defect（failClosed 态：OBS_SIM_ROOT 缺席时按钮不渲染，与路由清单 expect 声明一致） |
| IDE 工作模式 | ide-work-mode | 4/5（失败=空 provider 引导弹窗环境态） |
| 技能治理 | gap 探针 | 扫描执行 POST /api/skillgov/scan → 200 无错误 |

**② 缺口域浏览器级交互闭环**（无专属走查脚本的域，本轮新探针）：

- 本体域（/app/ontology）：**CRUD 全闭环**——实例页签→新建→填 id/type=Human/label/data→保存（POST /validate 预检 200 → POST /instances 200）→行出现→行内删除（DELETE 200）→行消失。
- 审批收件箱（/app/inbox）：**真裁决闭环**——待审行在位→点批准→确认弹窗（裁决 C 防误触）→确定→`POST /api/approvals/:id/decide 200`→待审行 2→0。
- 治理文档（stage/govern?tab=docs）：六道质量门工件面板渲染正常；活体保存被「治理仓当前无工件（全缺失态）」数据态挡，编辑→保存接线（PUT /api/governance/doc）由 `custom/client/ia2/__tests__/governance-view.test.ts` 组件测试覆盖。
- projects/matrix-teams：projects 无新建 UI（列表只读＋pause/resume/complete 动作，隔离库无项目数据）；matrix-teams 写全走 Matrix SDK（需真实 Matrix 会话）——两者环境数据态，留专项轮。

**③ 走查工装锚点修复**（脚本与产品演进脱节的工装债，本轮修两件）：

1. `change-gov-walkthrough.mjs` 三处：`/app/gov` 导航×2 → `/#/app/stage/govern?tab=audit`（2026-10-18 治理中心壳解体批后旧路径重定向到 gateLog 页签，变更治理区实际在 audit 页签）；新增 gov-fold-change 折叠面板展开步骤（默认只开「统一审计」）；管理三账导航 → `/#/app/board?tab=effectiveness`（2026-10-24 用户裁定挂回交付效能页签）。
2. `prod-board-write-walkthrough.mjs`：登录后新增 clearMasks（Escape×3）——空 Profile 环境首屏弹「未配置大模型」引导模态，n-modal-mask 拦原生点击致 E4 建卡静默失效（修复后 6/6）。

## 决策记录

- 探针交互方式裁决（Mechanical）：naive-ui 遮罩下的点击用 DOM 级 evaluate click（force click 也会被遮罩层吞掉 Vue 事件传播外的可见性判定）；页签/折叠切换一律 DOM click＋change/input 事件派发（playwright fill 对无 data-testid 输入按位序填）。
- settings-batch4 段②（蓝图画廊）判废不修（Mechanical）：bpgal 组件族已在 bpa 域重构中整体下线（现为 BpaGovernance/Link/Map/Maturity/Pcf/Tree 六面板，页面渲染由路由走查覆盖），为废面重写脚本不值；段①③仍有效，挂账待重写。
- 交互级排查分层口径（Taste→成文）：浏览器级（真实点击→真实端点→状态变化）为最高证据；vitest 组件级（mock API 断言 handler 入参）＋API 级活体（真端点真写）两者拼接可等效闭环；三层都缺才判未覆盖。

## 验证

- 修复后重放：prod-board-write 6/6、change-gov 20/20（见上表）。
- 缺口域探针实录：本体 NET=`POST validate→200 / POST instances→200 / DELETE→200`；收件箱 NET=`POST /api/approvals/enf:66695991fa1e/decide→200`，行数 2→0。
- 工装脚本改动无产品代码变更；`scripts/regression/` 两文件语法经 node 实跑验证。

## 设计文档影响

DESIGN_SYNC: none——纯走查工装（scripts/regression/）锚点修复，不触及产品行为与既有设计决策；排查结论（各域功能正常/环境态清单）记录于本 spec 供后续回归轮引用。
