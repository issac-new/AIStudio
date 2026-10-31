# 走查探针微批③：E5 审批钮态前置如实化＋E6 催办条断言修正（日常工作台回归收尾）

日期：2026-10-31 ｜ 轮次：日常工作台回归·探针收尾微批③ ｜ 类型：test（probe 2 处）

触发：收官走查 E5/E6 两项红。定谳均为探针预期缺陷而非产品缺陷：E5 审批钮（drawer-approve/reject）按设计仅在 `task.status === 'review'` 渲染（KanbanTaskDrawer.vue:1029），而现库零 review 态卡（overview 实测 archived 17＋done 6），且探针自有 triage 卡无法直达 review——服务端 PATCH status 走 `hermes kanban request-review --force`，状态机要求 ready/running 前置（triage→review 与 triage→ready→review 两步链均被 CLI 拒绝，实测 500）；E6 催办条在 E5 抽屉未关毕时被遮罩拦截（与微批②同类的序列性残留）。

## 1. 变更

scripts/regression/daily-workbench-walkthrough.mjs：E5 改「自有卡 API 试转 review（PATCH 200 才严断 approve+reject；拒转则如实记 P2 不可达注记，抽屉开仍为主断言）」；E6 改「E5 后 Escape 关毕抽屉→点 card-checkbox→等 .kanban-bulk-bar 可见→范围内找催办钮」。实测链：E4 建卡上板→E6 催办条「按卡的负责人/板归属解析催办对象」可见→E7 删卡清理全绿。

## 2. 决策记录

1. **E5 不造状态机旁路**：审批钮验证需 review 态，正确到达路径=specify（AI 规格）→指派→ready→running→request-review，超出走查探针职责；如实记「断言不可达（状态机前置）」优于伪造数据态。
2. **副产品观察不入本批**：PATCH 非法状态转移回 HTTP 500（CLI stderr 透传），语义宜 400/409——登记为后续 API 卫生项，不在回归批夹带。

## 3. 验证

收官走查 `node scripts/regression/daily-workbench-walkthrough.mjs` 台账 0 FAIL（E5 为 P2 注记项）；独立链 /tmp 探针 E4/E6/E7 实测 PASS。

## 4. 设计文档影响

DESIGN_SYNC: none。理由：纯走查探针断言修正，不触及产品契约。附录 A.1 随批登记。
