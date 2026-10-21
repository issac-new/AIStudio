# 遗留清偿批：导航收口 + 诚实404 + 导演详情分流 + 治理面退役 + G5/UAT 状态机（spec）

日期：2026-10-21
分支：`feat/backlog-closure`
来源：`2026-10-21-swarmstudio-complete-design.md` §9.3 五项遗留；用户 2026-10-21 拍板「全部都做」。

## 〇、用户裁决

| 决策点 | 裁决 |
|---|---|
| 双入口 | 留侧栏 6 项，删页头「运行编排/推演设置」两按钮 |
| 404 | 做诚实「页面不存在」页；已知旧链接 redirect 继续生效 |
| 三治理面 | ⑥运营 + 设置配置，GovOverlay 退役（内容并回后重定向/删除） |
| 导演/26 步详情 | 按 run 类型分流：导演 run 走图运行时详情，26 步 run 走原详情，不再静默跳转 |
| G5/UAT | 建真状态机：先 G5（pending→approved/rejected→released），再 UAT 逐 AC（pass/conditional/reject）；复用 approvals/evidence 模式，不造通用工作流引擎 |

## 一、变更

### A. 导航收口 + 404 + 导演详情（战线A）

1. **双入口收敛**：`SimCenterView` 删除页头两个动作按钮与 `goAction`；四签与侧栏 6 项不变（入口唯一=侧栏）。
2. **诚实 404**：新增 `views/NotFoundView.vue` + `/app/not-found` 路由（`ia2.notFound`）；新增 `not-found-guard.ts` 全局 `beforeEach`——检测上游 catch-all（`/:pathMatch(.*)*` redirect `/app`）产生的 `to.redirectedFrom`，改写为 notFound 并带 `from` 原路径；已知 redirect（`/hermes/kanban`、`/app/gov/*` 等）不受影响。
3. **导演详情分流**：新增 `views/sim/DirectorRunDetail.vue`（`/app/sim/director`，`ia2.simDirector`），用既有 `/api/graph/runs/:id` + `replay` 展示状态/步数/事件/未应答人工闸（可批准/打回）；`SimCenterView` 删除「导演 run 自动改道导演台」的 watch，改为 legacy 三签在导演 run 下的**显式内联态**（说明不适用 + 「打开导演详情」按钮）；26 步 run 行为不变。

### B. 治理面去留 + GovOverlay 退役（战线B）

1. **对账表**：⑥八签 / GovOverlay 七区（task/session/people/agent/team/review/stats）/ 设置七域逐项映射「能力→唯一归属（①/④/⑥/设置）→处置」。
2. **退役实施**：删除 GovOverlay 入口与挂载；重复区直接退役；独有能力以链接落位（task/session→④，people/agent/team→①，review→⑥评审治理，stats→⑥度量检查）；清理 flow store 的 govSection 死状态；守门测试断言不再可达。

### C. G5/UAT 状态机（战线C）

1. **G5**：新 `simcenter/release-state.ts` 纯状态机（submit/approve/reject/release；非法转移 409；approve 需证据锚；reject 必填理由；approve/release 仅 super_admin）；append-only `evidence/release-gate-events.jsonl`；端点 `GET/POST /api/hermes/sim/release-gate-state`；`DailyG5Panel` 增「发布门状态」卡与动作。
2. **UAT**：`/uat-verdict` 增校验（conditional/reject 必填 note）；读模型按 AC 聚合最新判定；`DailyUatPanel` 增最小「记录 UAT 判定」表单（AC/verdict/note，run 取最近一次推演，缺席诚实禁用）。

## 二、决策记录

| # | 决策 | 理由 |
|---|---|---|
| D1 | 404 用全局 guard 而非改上游 catch-all | 上游只读；guard 只认 catch-all 记录的 `redirectedFrom`，不动既有 redirect 语义 |
| D2 | 导演 run 在 legacy 三签显示显式内联态而非自动跳转 | 静默跳转曾让用户「点了一个签却到了另一个签」；分流要可见、可解释、可点入详情 |
| D3 | 导演详情复用 `/api/graph/runs/:id`+`replay` | 单一事实源=图事件流；不造第二份 run 视图 |
| D4 | GovOverlay 退役而非保留 | 七区均可归位（④/①/⑥）；管理台与阶段页重复是「三面并存」的主体 |
| D5 | G5 事件另起 `release-gate-events.jsonl` | 既有 `release-gate.jsonl` 是 harness 步 20 的证据写入口，语义保留；状态机事件独立 append-only |
| D6 | UAT 表单 run 取最近一次推演并显示 | 日常页无 run 上下文；自动取最近+如实显示，缺席禁用不猜数 |

## 三、验证（实施后回填）

- 定向测试：战线A/B/C 各自守门测试全绿。
- 构建：`npx vite build --config vite.config.overlay.ts` rc=0 + `verify-dist` OK。
- 浏览器（8669 热更新）：四签无页头按钮；未知路径落 404 页；旧链接 redirect 正常；导演 run 三签内联态+详情可达；GovOverlay 不再可达；G5/UAT 动作可用。
- 全量 `npm test`。

## 四、不做（挂账）

- 404 不改上游 catch-all 本体（guard 方案已满足）。
- GovOverlay 若发现无法归位的独有能力，保留为⑥内链接并在此登记。
- UAT 的 AC 列表自动来源（冻结单解析）挂账；本轮 AC 编号手输。
