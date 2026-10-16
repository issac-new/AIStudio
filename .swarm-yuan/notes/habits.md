# 开发者行为挖掘初稿（mine-habits.sh 机械生成——AI 审读采纳，不直接当规范用）

> 窗口：--since '180 days ago'，共 3353 次提交（共变对按最近 500 次计）。生成时间 2026-10-16T01:25:55+0800。
> 三去向（exploration-guide「项目知识读取」节 行为观察）：提交/分支习惯→SKILL.md 铁律段（引用来源）；工作偏好→dev-guide「开发偏好」节；隐式耦合/热点→reference-manual 说明列 + recipes 配方提取（§D.7 源②）。

## 提交前缀分布（Top 10）

| 前缀 | 次数 |
|------|------|
| feat | 966 |
| merge | 787 |
| fix | 753 |
| docs | 508 |
| (other) | 147 |
| chore | 68 |
| test | 45 |
| refactor | 37 |
| style | 21 |
| perf | 12 |

## 分支命名分布（近 30 条活跃分支按首段）

| 首段 | 分支数 |
|------|--------|
| feat | 5 |
| (单段名) | 1 |

## 提交规模分桶（±行数合计）

| 桶 | 提交数 |
|----|--------|
| 小(<100行) | 1437 |
| 中(100-500行) | 690 |
| 大(>500行) | 309 |

## 共变文件 Top 对（同提交共现 ≥2 次——隐性耦合/拼装单元信号）

| 共现次数 | 文件对 |
|----------|--------|
| 16 | docs/superpowers/specs/2026-10-05-mux-history-and-engineering-archive.md ⇄ docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md |
| 15 | custom/server/clusterinspector/detectors.ts ⇄ custom/server/clusterinspector/inspector.ts |
| 14 | custom/server/clusterinspector/collectors.ts ⇄ custom/server/clusterinspector/inspector.ts |
| 12 | custom/server/clusterinspector/collectors.ts ⇄ custom/server/clusterinspector/detectors.ts |
| 11 | custom/server/clusterinspector/__tests__/cluster-inspector.test.ts ⇄ custom/server/clusterinspector/inspector.ts |
| 11 | custom/server/clusterinspector/__tests__/cluster-inspector.test.ts ⇄ custom/server/clusterinspector/detectors.ts |
| 10 | custom/server/clusterinspector/cluster-inspector-controller.ts ⇄ custom/server/clusterinspector/inspector.ts |
| 9 | custom/server/clusterinspector/cluster-inspector-controller.ts ⇄ custom/server/clusterinspector/collectors.ts |
| 9 | custom/server/clusterinspector/__tests__/cluster-inspector.test.ts ⇄ custom/server/clusterinspector/collectors.ts |
| 8 | docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md ⇄ scripts/plan-html/render.sh |
| 7 | custom/server/clusterinspector/cluster-inspector-controller.ts ⇄ custom/server/clusterinspector/detectors.ts |
| 6 | custom/server/clusterinspector/__tests__/cluster-inspector.test.ts ⇄ custom/server/clusterinspector/cluster-inspector-controller.ts |
| 4 | patches/series ⇄ scripts/inject.mjs |
| 4 | custom/server/progress/task-progress-controller.ts ⇄ custom/server/progress/task-progress-store.ts |
| 4 | custom/server/progress/__tests__/task-progress.test.ts ⇄ custom/server/progress/task-progress-store.ts |

## 热点文件 Top 15（窗口内被改次数）

| 次数 | 文件 |
|------|------|
| 420 | patches/series |
| 178 | docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md |
| 127 | docs/superpowers/specs/2026-09-25-ycode-absorption-matrix.md |
| 73 | RELEASE-NOTES.md |
| 69 | custom/client/cockpit/store/cockpit.ts |
| 63 | scripts/aipay/aipay-scenario.sh |
| 56 | scripts/aipay/mux/mx-report-gen.py |
| 56 | package.json |
| 54 | custom/client/ide/views/IdeShell.vue |
| 53 | scripts/inject.mjs |
| 52 | custom/client/cockpit/views/CockpitView.vue |
| 49 | scripts/aipay/mux/mx-scenario-lib.sh |
| 49 | patches/042-desktop-rebrand-swarmstudio-pkg.patch |
| 45 | custom/client/ia2/views/WorkbenchView.vue |
| 43 | custom/client/ide/views/IdeChatPane.vue |

## 测试文件提交占比

- 58% 的提交触及测试文件（test/spec/__tests__ 路径）。

## AI 审读指引（机械/AI 边界）

- 本文件是统计事实，不是规范——前缀分布 ≠ 必须遵守的提交规范（规范以其书面规则为准，本表只作实证交叉）。
- 共变对是隐性耦合信号：高频共变文件对应在 reference-manual 说明列记注意事项，并作为 recipes 配方「复用件清单」的佐证（§D.7 源②）。
- 异常信号（如测试占比 0%、单体巨型提交为主）如实写入 dev-guide 注意事项，不粉饰。
