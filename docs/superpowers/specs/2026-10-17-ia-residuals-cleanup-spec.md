# IA 残留清偿 spec（labelKey 逐行化＋aria-label）

日期：2026-10-17
来源：《2026-10-17-fullflow-plan-harness-ia-reconciliation.md》§六登记的两件产品残留（用户批准「4、完成」）；第三件（CenterKey 键名 stage1-6）已由 D20 先行清偿，本批不复。
验收：ia2 全量测试绿（644/644 实测）＋构建通过。

## 决策记录

- D-1：`IA_AREAS` 六行 labelKey 由同指 `ia2.nav.collab` 改为逐行 `ia2.nav.stage1-6`（术语正本 §5.8-3 裁定「改为读阶段元数据各自的标签」）。词条在 `i18n-term-overrides.ts` 由 `STAGE_META` 派生注册（zh 取 navLabel、en 取 navLabelEn）——破例入 en 侧的理由=新增键而非改上游非标准词，缺 en 词条时 vue-i18n 会回落显示键名。
- D-2：`IaCentersNav.vue` aria-label「三中心导航」→「六阶段一级导航」（D13 前残留，屏幕阅读器可闻面）。
- D-3：不改上游 locale 补丁（沿 D18 架构：运行时 mergeLocaleMessage，防补丁与注入树漂移）。
