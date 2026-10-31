# 恢复图 run 详情及回放（2026-10-31 用户裁决）

日期：2026-10-31
状态：implemented
来源：用户在 2026-10-31 日常调研轮中途明确指示「恢复图run详情及回放」——LG-01/LG-04 按恢复路径执行，推翻「只出台账等裁决」的暂缓处置。

## 变更

1. **恢复五件套**（自 250e058d9^ 检出，2026-10-20 删除轮回收）：
   - `custom/client/loop/runcenter/views/RunDetailView.vue`（左图右流：执行图 + 时间轴回放 + 节点检查器 + 导出 + 模板沉淀）
   - `custom/client/loop/runcenter/components/RunGraphCanvas.vue`（vue-flow 只读画布：状态着色/迭代徽标/回边弧/容器框）
   - `custom/client/loop/runcenter/components/RunTimeline.vue`（回放时间轴：游标/播放/倍速/语义模式）
   - `custom/client/loop/runcenter/components/NodeInspector.vue`（attach 档节点检查器）
   - `custom/client/loop/runcenter/components/RunStageBadge.vue`（状态徽标）
   - `custom/client/loop/runcenter/__tests__/run-detail-components.test.ts`（18 例）
2. **恢复范围裁剪**：V5 补遗⑤ M6 的 RunCanvas 循环画布内嵌节**不恢复**（组件已随 250e058d9 退役）；`goBack` 从「ia2.runs 列表」改为「浏览器历史优先，无历史回落 ia2.sim」（列表页维持退役）。`CockpitIcon` 导入路径随组件搬迁改为 `shared/components`。
3. **路由接线**：`ia2.runDetail`（/app/runs/:runId）从 B1 重定向改回懒组件（`custom/client/ia2/routes.ts`）；`ia2.runs` 列表重定向保持不变。三条断链入口（编辑器试跑 `SpecEditorView.vue:232`、任务反查 `RunLinks.vue:78`、旧 loop 详情 `LegacyLoopView.vue`）零改动自然修复——它们都按名跳 `ia2.runDetail`。
4. **守门更新**（断言随裁决演进，非放宽）：
   - `cockpit-hygiene.test.ts`：RunDetailView 移出删除清单（RunCenterView 维持在列）。
   - `routes.test.ts`：runDetail 断言从「重定向」改为「懒组件身份 = RunDetailView」。
   - `unified-nav-guard.test.ts`：迁移链尾 `/app/runs/:runId` 不再顺延到 `/app/sim?run=`（详情已是实体路由）。
5. **台账联动**：`2026-10-31-loop-graph-task-ledger.md` LG-01/LG-04 改「已修（本批）」，LG-02 列表页去留仍留裁决（本批未恢复列表）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| D1 | 只恢复详情/回放，不恢复运行中心列表页 | 用户指令字面=「图run详情及回放」；列表能力已并入推演运行总览（A13），恢复列表会制造双列表 | 连列表页一起恢复（否决：超指令范围） | 是 |
| D2 | RunCanvas 循环内嵌节不恢复 | 组件已退役且依赖面大；属 V5 附加能力，非详情/回放本体 | 连带恢复 RunCanvas（否决：扩大面） | 是 |
| D3 | goBack 走浏览器历史优先 | 列表页退役后没有稳定返回目标；jsdom 与浏览器行为均可测 | 固定跳 ia2.sim（否决：丢上下文） | 是 |
| D4 | 守门断言随产品裁决更新并注明依据 | 卫生测试是「防回流」工具，产品裁决变更时应显式演进，不是绕过 | 改测试绕过（否决：本批是显式裁决+注释留痕） | 是 |

## 验证

- 目标面：`custom/client/loop`（40 文件 355 例，含恢复的 18 例）＋ routes/cockpit-hygiene/route-whitelist/unified-nav-guard/sim-center-shell/run-display/domain-split/traceability-components＋i18n 三门全绿。
- **全量 `npm test` = 972 文件 / 7063 用例通过、11 跳过、0 失败（第二次跑；首轮 5 处失败三例为本批修弃用断言、两例为并行批遗留 K19 棘轮破口，本批一并根治）**。
- 随批 K19 收敛：hgate decide 新块 4 处与本批 constraints 端点 1 处改走 `lib/http`（fail/ok），棘轮 1193/874 双达标（实测 1192/874——`ok:false` 阈值压线，注：4147ac1cd 的 +1 为非 HTTP 内部对象属正则误伤，未计入处置）。
- 断链入口核验：`SpecEditorView.vue:231-232`、`RunLinks.vue:77-78` 均按名跳 `ia2.runDetail`，路由已是实体组件，无需改动。
- i18n 键确认仍在（`vendor/.../i18n/locales/zh.ts:1491 runcenter` 节，patch 473 基线未动）。
- 未验证项：浏览器活体走查（本批收口前如服务在线可补；jsdom 组件测试已覆盖装载/回放游标/导出/沉淀路径）。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/superpowers/specs/2026-10-31-loop-graph-task-ledger.md`：LG-01/LG-04 状态改「已修（2026-10-31 恢复批）」，§三矛盾表第 1 条补恢复注记（本 spec 在变更集内，收据随批重绑）。
- `docs/superpowers/specs/2026-10-21-swarmstudio-appendix-a-spec-index.md`：登记本 spec，计数 419→420。
