# Swarm Studio P2 能力补齐与换装（2026-10-19）

## 一、目标

补齐信任与归属纠偏批（`46fe066f`）显式挂账的 P2 能力项，不新增导航分组、不改冻结需求：

1. UAT 判定持久化与录入（⑤验收·UAT 待判）。
2. G5 发布准出真实留痕（运行绑定的批准/打回台账）。
3. 审批汇总单一契约（一个端点一个类型定义，供多 surface 同源计数）。
4. 路由级加载骨架（异步页签不再白屏等待）。
5. 移动收尾（工作台窄屏堆叠、导航触达高度）。
6. 换装：8649/8647 服务树切到本批合并后的 main。

## 二、服务端设计

### 2.1 UAT 判定（simcenter 族，run 绑定）

- `POST /api/hermes/sim/uat-verdict`：入参 `{run, ac, verdict, note?}`；
  - `verdict ∈ {pass, conditional, reject}`（规范键，界面文案 通过/有条件通过/不通过）；
  - `ac` 归一为 `AC-N`（≤3 位数字）；`note ≤200` 字；
  - 追加写 `<SIM_ROOT>/runs/<run>/evidence/uat-verdicts.jsonl`（append-only，与 evidence/mark 同款落位与穿越防护）；
  - 记录 `ts/actor/run/ac/verdict/note`，actor 取 `ctx.state.user.username`（不可自报）。
- `GET /api/hermes/sim/trace` 增量合并台账：人工判定（最新一条）覆盖验收书提取值；`meta.uatLedger` 标注台账在场。
- 纯函数导出（测试面）：`validateUatVerdict` / `mergeUatVerdicts`。

### 2.2 G5 发布准出台账（simcenter 族，run 绑定）

- `POST /api/hermes/sim/release-gate`：`{run, decision, note}`，`decision ∈ {approve, reject}`；
  - **打回必须给理由**（note 必填，≤300 字）；批准 note 可选；
  - 追加写 `evidence/release-gate.jsonl`；最新记录即当前判定（append-only 台账允许改判留痕）。
- `GET /api/hermes/sim/release-gate?run=`：返回 `{run, decision, records[]}`；未决=`decision:null`。
- 纯函数导出：`validateReleaseGate` / `latestReleaseDecision`。
- 不写 run-state 闸键：闸键仍由 harness 判定，本台账是"人工批准留痕"半件（对齐 iv-08 语义）。

### 2.3 审批汇总契约（approvals 族）

- `GET /api/approvals/pending-summary`：同一聚 合管线（fleet 命令 + 评审 + 执法门）产出的计数面
  `{total, command, review, enforce, byRisk:{high,medium,low}, ts}`；
- 客户端模块 `cockpit/api/approval-summary.ts` 在此之上并入 orgloop 介入点/清偿计数，输出统一类型
  `ApprovalSummary`——所有计数面（概览、④审批、收件箱）从此单一契约取数。

## 三、客户端设计

- ⑤ G5 页签换装 `StageG5Panel`：上半=发布门台账面板（当前判定徽标、批准/打回带确认、历史留痕、打回强制理由）；下半=原发布类审批过滤面板。
- ⑤ UAT 待判：未判行内三态按钮（通过/有条件/不通过），写台账后刷新；只读提示改为"就地录入，写入运行证据台账"。
- ④ 审批待办：头部挂汇总徽标（命令 n · 评审 n · 介入 n · 清偿 n），数据全部来自 ApprovalSummary。
- StageShell 异步页签补 `loadingComponent`（骨架条，延迟 200ms）与 `errorComponent`（重试）。
- 工作台 ≤720px 三栏堆叠为单列（grid 模板强制 1fr）；侧栏导航项移动端高度 ≥40px。

## 四、三级 scope 适用矩阵（本批定稿，后续铺开的单一事实源）

| 页面族 | 工作区 | 运行 | 任务/会话 |
|---|---|---|---|
| 看板、检索、今日工作 | 必需（或显式"全部"） | 可选过滤 | 点击进详情 |
| 运行中心、⑤验收各签 | 只读继承 | 必需（空态给运行中心出路） | 证据链接 |
| UAT 判定、发布门 | 只读继承 | 必需（写操作绑 run） | — |
| ①搭建（组织/账号/资产）、系统设置 | 全局/组织级 | 不适用 | 不适用 |
| IDE 工作区 | 从任务绑定继承 | 可选上下文 | 必需 |

URL 承载：页签与可分享筛选入 query（已落）；检索词不入 URL（隐私）。scope 只做数据过滤与上下文恢复，不替代服务端授权。

## 五、验收门

1. 新增守门测试全绿：simcenter（UAT 校验/合并/端点、发布门校验/最新判定/端点）、approvals 汇总、stage-shell G5 装配、既有套件零回归。
2. `vite build` 通过。
3. 换装后 8649 实测：概览 99.5%、G5 发布门（无 run 空态/有 run 批准留痕）、UAT 三态录入落台账、④汇总徽标、375px 工作台单列。
4. 不执行真实发布/开轮；写操作仅限测试夹具目录与本地验收。

## 六、决策记录

- D-1：UAT/发布门台账落 run 的 evidence/（append-only jsonl），与 evidence/mark 同款穿越防护；不写 run-state 闸键。
- D-2：发布门打回强制理由；批准留痕允许改判（append-only，历史可审计）。
- D-3：审批汇总是在既有聚合管线上的计数投影，不新建第二聚合源；跨域（orgloop）在客户端单模块合并为统一类型。
- D-4：scope 适用矩阵以本 spec 第四节为单一事实源；本轮只落 UAT/发布门的 run 必需语义，不做全站 URL scope 改造。
- D-5：加载骨架只包 StageShell 异步页签；不做全局 Suspense。
- D-6：移动收尾限工作台堆叠与触达高度；完整移动版仍属独立立项，不在本批伪装完成。
- D-7：换装走 serve-main 钉 main + ensure-injected（重链 upstream custom 符号链接）+ 双端重启；不删他人 worktree。
