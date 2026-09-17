# 开发者行为挖掘初稿（mine-habits.sh 机械生成——AI 审读采纳，不直接当规范用）

> 窗口：--since '180 days ago'，共 501 次提交（共变对按最近 500 次计）。生成时间 2026-09-16T11:36:46+0800。
> 三去向（exploration-guide §Step -1 行为观察）：提交/分支习惯→SKILL.md 铁律段（引用来源）；工作偏好→dev-guide「开发偏好」节；隐式耦合/热点→reference-manual 说明列 + recipes 配方提取（§C+.7 源②）。

## 提交前缀分布（Top 10）

| 前缀 | 次数 |
|------|------|
| fix | 148 |
| feat | 147 |
| (other) | 75 |
| merge | 46 |
| docs | 39 |
| chore | 17 |
| style | 12 |
| refactor | 8 |
| test | 5 |
| wip | 2 |

## 分支命名分布（近 30 条活跃分支按首段）

| 首段 | 分支数 |
|------|--------|
| feat | 15 |
| fix | 11 |
| chore | 2 |
| docs | 1 |
| (单段名) | 1 |

## 提交规模分桶（±行数合计）

| 桶 | 提交数 |
|----|--------|
| 小(<100行) | 187 |
| 中(100-500行) | 132 |
| 大(>500行) | 62 |

## 共变文件 Top 对（同提交共现 ≥2 次——隐性耦合/拼装单元信号）

| 共现次数 | 文件对 |
|----------|--------|
| 20 | RELEASE-NOTES.md ⇄ package.json |
| 14 | custom/client/cockpit/components/RunTraceTopology.vue ⇄ custom/client/cockpit/composables/computeLayeredLayout.ts |
| 13 | patches/023-client-store-chat.patch ⇄ patches/042-desktop-rebrand-swarmstudio-pkg.patch |
| 9 | patches/042-desktop-rebrand-swarmstudio-pkg.patch ⇄ patches/043-desktop-rebrand-swarmstudio-strings.patch |
| 9 | package.json ⇄ patches/042-desktop-rebrand-swarmstudio-pkg.patch |
| 9 | custom/client/loop/graph/__tests__/assembly.test.ts ⇄ custom/server/loop/graph/graph-assembly.ts |
| 9 | custom/client/cockpit/components/RunTraceTimelinePanel.vue ⇄ custom/client/cockpit/components/RunTraceTopology.vue |
| 9 | RELEASE-NOTES.md ⇄ patches/042-desktop-rebrand-swarmstudio-pkg.patch |
| 8 | patches/042-desktop-rebrand-swarmstudio-pkg.patch ⇄ patches/series |
| 8 | patches/042-desktop-rebrand-swarmstudio-pkg.patch ⇄ patches/102-groupmessagelist-gateway-banner.patch |
| 8 | custom/client/cockpit/components/CockpitRunTraceModal.vue ⇄ custom/client/cockpit/composables/useRunTrace.ts |
| 7 | custom/client/ia2/__tests__/cockpit-view.test.ts ⇄ custom/client/ia2/views/LoopCockpitView.vue |
| 7 | custom/client/cockpit/adapters/run-trace-adapter.ts ⇄ custom/client/cockpit/composables/useRunTrace.ts |
| 7 | custom/client/cockpit/adapters/run-trace-adapter.ts ⇄ custom/client/cockpit/components/CockpitRunTraceModal.vue |
| 7 | custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts ⇄ custom/client/cockpit/composables/useRunTrace.ts |

## 热点文件 Top 15（窗口内被改次数）

| 次数 | 文件 |
|------|------|
| 91 | patches/series |
| 47 | RELEASE-NOTES.md |
| 37 | custom/client/cockpit/components/RunTraceTopology.vue |
| 33 | patches/042-desktop-rebrand-swarmstudio-pkg.patch |
| 29 | package.json |
| 28 | README.md |
| 19 | custom/client/cockpit/composables/computeLayeredLayout.ts |
| 18 | custom/client/cockpit/__tests__/cockpit-run-trace-modal.test.ts |
| 16 | custom/client/cockpit/components/RunTraceTimelinePanel.vue |
| 15 | custom/server/loop/graph/graph-assembly.ts |
| 15 | custom/client/cockpit/components/RunTraceOverview.vue |
| 15 | custom/client/cockpit/components/CockpitRunTraceModal.vue |
| 14 | patches/023-client-store-chat.patch |
| 14 | custom/client/loop/graph/__tests__/assembly.test.ts |
| 13 | custom/server/loop/graph/event-log-store.ts |

## 测试文件提交占比

- 41% 的提交触及测试文件（test/spec/__tests__ 路径）。

## AI 审读指引（机械/AI 边界）

- 本文件是统计事实，不是规范——前缀分布 ≠ 必须遵守的提交规范（规范以其书面规则为准，本表只作实证交叉）。
- 共变对是隐性耦合信号：高频共变文件对应在 reference-manual 说明列记注意事项，并作为 recipes 配方「复用件清单」的佐证（§C+.7 源②）。
- 异常信号（如测试占比 0%、单体巨型提交为主）如实写入 dev-guide 注意事项，不粉饰。
