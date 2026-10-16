# E 波收尾·退役件清点与测试总核（E1/E2/E3 正本）

日期：2026-10-16
状态：v1——E1 已执行、E2 已核、E3 判据在档；终验场（一轮全量推演经产品面）按下轮开跑执行
上游：排期正本（计划文件冻结重排版）E1-E3 工单＋设计正本 §六 Non-goals（不删功能红线）

## 〇、三句话主旨

E 波三件收尾工单（帧拍摄位同步/测试随迁总核/退役件清点）的执行记录与判据存档：E1 已把拍摄位重定向细化到治理中心专签；E2 十三键残留经运行时引用扫描为零；E3 三件退役项按「不删功能」红线给出保留判据与摘除条件。读毕应能回答：旧链接还会不会断、测试面是否覆盖迁移、哪些兼容垫层何时可拆。

## 一、E1 帧拍摄位注册表同步（已执行）

拍摄位正本=simharness `mux/capture-plan.env`（overlay 只读消费）。治理内容迁移后，注册表中的旧 `?tab=gov-*` 键经 `TasksView` 的 `LEGACY_TAB_REDIRECTS` 全部可达——本轮把七键映射从「治理中心整页」细化为对应专签路由（gov-registry→组织与资产签/gov-audit→审计与变更签/gov-docs→文档评审签/gov-harness·cluster·ontology·session-health→度量体检签），帧语义不断链且更准（锚点：`TasksView.vue` LEGACY_TAB_REDIRECTS；重定向链实测=ia-views 集成用例逐键断言）。simharness 仓自身的注册表文本同步属其仓工单（overlay 边界），重定向表已保证两侧兼容期无死链。

## 二、E2 测试随迁总核（已核）

- 13 键拆分（对方 A0）：i18n-tasks-tabs 收敛 3 键＋迁出 10 键去向逐键注释＋legacyTabRedirect 全表正反例纯函数用例＋ia-views 集成逐键重定向断言——运行时引用扫描（rsText.tab 前缀法）零残留。
- 三中心壳（B1/C1/A0）：sim-center-shell/gov-center/workbench-nav-centers 三套单测各自断言页签集合与文案键成对。
- 本轮新增：gov-* 专签细化后两组断言同步更新（26 例全绿）。
- 全量基线：4695 过/3 已知存量败（humansim REST 白名单债/simharness 残留工作树污染扫描/dsh 分帧——三件均登记独立缺陷不在重设计域内）。

## 三、E3 退役件清点（判据在档，摘除各设条件）

红线：不删任何功能（对账总表 123 行零删除）；「退役」=兼容垫层的摘除，条件达成才执行。

| # | 退役项 | 现状 | 摘除条件（可测） |
|---|---|---|---|
| 1 | /app/runs→/app/sim 重定向（A13） | 保留一个版本周期 | 拍摄位注册表与既有文档链接零 `?tab=runs` 引用（grep simharness＋中央仓 docs）后随下个版本周期移除 |
| 2 | /app/eng→/app/sim/orchestration 重定向（B9） | 保留一个版本周期 | 同上（`/app/eng` 字面零新引用一轮后移除） |
| 3 | board `?tab=gov-org` 别名与 gov-* 旧键重定向（A0/E1） | 保留（capture-plan.env 仍用旧键） | simharness 注册表迁新键且经一轮全量推演实拍验证后，旧键表移入档案 |

三项均未达成摘除条件（当前轮次未走、注册表未迁），**如实保留不提前拆**。启动器/launchd 看守类退役件不在产品重设计域（方案 §九 Non-goals）。

## 四、遗留与终验

- UI 旗舰屏计时：待浏览器走查窗（隔离实例+vite dev 可复用本轮配方）。
- 终验场：下一轮全量推演经产品面走通（Q4 裁定）——推演中心六签承载观测、治理报告数据面与 UI 同值对照。
- 三存量败归属他域已登记；重设计域内测试全绿。

## 决策记录

- D1（E1 落点）：gov-* 旧键重定向从「治理中心整页」细化为专签路由（registry→orgAssets/audit→audit/docs→docs/harness·cluster·ontology·session-health→metrics）——理由：拍摄帧语义直落实际承载签，兼容垫层语义不变；判据：legacyTabRedirect 全表正反例＋ia-views 集成逐键断言（本批两套测试已绿）。
- D2（E3 红线）：三项退役（runs/eng 重定向、gov 旧键别名）全部保留不提前拆——摘除条件各设（注册表迁新键＋一轮全量推演实拍验证），当前未达成，如实保留。
- D3（边界）：capture-plan.env 文本同步属 simharness 仓工单；overlay 侧以重定向表保证兼容期零死链。
- D4（统筹批·白名单补录，2026-10-16）：humansim-controller（人类角色模拟发送面，token 文件+审计留档）与 simharness 主树四件（双心跳/场景模板/多主测试，运维探测面）补录 REST 直连白名单——判定依据=用途属管理面/探测面而非任务协作消息；同批清除 simharness 残留 feat-win-trinode worktree（分支零领先、改动未采纳，diff 存档 /tmp 后 force remove）。
- D5（统筹批·patch 639）：dsh ACP 非 JSON 行连续上限 64（超限判协议破坏拒绝）——官方 2b68cfc2e「无限跳过」在 stdout 洪泛下让 pending 挂到 timeout；测试既定断言（垃圾行>64 拒绝）为本批补齐的契约。upstream 边界合规：改动经 patch 639 承载（series 登记），共享树态=单段应用（幂等验证 apply-check 拒绝）。
- D6（统筹批·B10 落位）：CockpitPanel 由 OverviewPanel 早期拷贝重写为轻量驾驶条（壳头常驻三徽标：姿态色点/清偿灯/服务异常数），run 单一事实源=/app/sim?run= query（与旗舰签同源，不另建状态）；与旗舰全量屏同端点不同密度，非双实现。
- D7（统筹批·A1 落位）：交接区=HandoffSection 挂协作与知识签（类型×状态语义面，正本=kanban/handoff.ts 常量只渲染不复制）；交接记录数据端点未建如实标注挂账。净额步级挂账经核实已由并行批实现（steps-registry netStepsAvailable+驾驶屏 KPI 在库），本批不重复。
