# run21 预备清单（V8.37 产品功能同步批配套）

日期：2026-10-17
状态：开跑前核对件（配合 `mux/mx-prelaunch-check.sh` 十九项机械检查使用）
来源：V8.37 批（overlay `feat/plan-v837-product-ia-sync`、simharness `feat/ia-sync-capture-registry`）；对账正本=overlay `docs/superpowers/specs/2026-10-17-fullflow-plan-harness-ia-reconciliation.md`。

## 一、开跑前必做（本批新增/变更项）

1. **产品 dist 重建与 SIM 快照刷新**：`cd overlay && npm run inject && npm run build`，随后 `mux/mx-setup.sh` 供给 `product-dist` 快照。prelaunch ⑲（产品 IA 版本）会机械拦截 D13 前旧 dist——生效 dist 必须同时含 `stage/setup` 路由族与 `ia2.journey` 旅程页标记。
2. **采集注册表新键首轮实测**：capture-plan.env 已迁重定向后规范 URL（trace→/app/sim/trace、accounts→/app/sim/delivery、gov-harness→/app/gov/metrics、/app/runs→/app/sim、gov-docs 族→/app/gov/docs）。首跑 capture-precheck 必须全过；任一新键 404/空壳即记问题单并回落旧键（legacyTabRedirect 保底可达）。
3. **IA 面帧首采**：ia-journey（/app 旅程首页）与 ia-stages（建议 /app/stage/accept+/app/stage/govern）走帧命名锚通道挂步 26 前后；缺席记 `ia-frame-missing` 问题单（方案 §5.5 V8.37 条款，不占必采分母 15）。
4. **prelaunch 全绿**：十九项（⑲ 为新增）；⑯ 代偿清偿门沿用。

## 二、走查复核项（对账表挂账，run21 首轮实测后回填裁决）

| # | 项 | 现状口径 | 待证实 |
|---|---|---|---|
| W1 | report_view 拍摄位 | /app/sim（运行总览，旧 /app/runs 重定向落点） | 报告查看面在运行总览的落位（锚点抽屉/报告入口）实际可见 |
| W2 | 任务模板入库按钮 | /app/sim?run=（原运行详情页能力「由轮次总览/锚点抽屉承接」） | 按钮是否已在运行总览实装；未实装则该候选帧记产品缺口 |
| W3 | 注意力条 kanban 入口 | steps_entry 步 10 已改「④开发阶段页工具卡」 | 注意力条是否仍含 swarm kanban 直达（历史入口，D18 置顶改版后未证实） |
| W4 | 全链条追踪迁址 | /app/sim/ops（运行监控） | 原 ?tab=observatory 的拓扑/时间筛选/检索/下钻在运行监控签的完整性 |
| W5 | appinit/people 锚点 | /app/gov/docs 管理维护区（app-registry-editor/org-editor testid） | 两编辑器在 D19 导览密度收敛后仍稳定挂载（run12 勘误口径复测） |

## 三、已知产品残留（本批登记不动手，产品侧后续清偿）

- ~~`IaCentersNav.vue:40` aria-label「三中心导航」（D13 前残留）~~ 已清偿（overlay `ec8f5de2`，aria-label 改「六阶段一级导航」）。
- ~~`routes.ts:37-42` IA_AREAS 六行 labelKey 同指 `ia2.nav.collab`~~ 已清偿（同 `ec8f5de2`，逐行指向 `ia2.nav.stage1-6`，词条由 i18n-term-overrides 从 STAGE_META 派生 zh/en）。
- CenterKey 键名仍三中心字面（挂账项，用户不可见）。

> 2026-10-17 21:0x V8.38 批更新：上两项销账；dist 已按 overlay main `500fa73e` 双面重建（client+server，server bundle 补齐 10-16 20:56 后累计的 incident/D20/补丁 642-644 面）并供给 SIM（dist_mtime=21:03:21）。隔离通道=worktree `dist-v838` + `OVERLAY_UPSTREAM_ROOT` 私有上游（避开并行会话主树未提交编辑，不触共享注入树）。

## 四、轮次执行口径提醒

- 术语边界：报告叙事用 D18 标准词（仿真中心/运行总览/质量门/审批待办/IDE 工作区…）；26 步步名与 §3.3 完成键、七幕名（序幕·搭台/第四幕·并行生产）是推演域词汇，报告机器锚与方案条款照旧。
- 旅程地图（原驾驶舱联动地图）已六阶段化；历史轮叙事块零改动，重出旧轮报告不受影响。
- 推演叙事六阶段（mx-report-gen PHASES）≠产品时序六阶段（/app/stage/*），报告文案勿混写。
