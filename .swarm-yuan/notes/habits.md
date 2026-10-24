# 开发者行为挖掘初稿（mine-habits.sh 机械生成——AI 审读采纳，不直接当规范用）

> 窗口：--since '180 days ago'，共 5204 次提交（共变对按最近 500 次计）。生成时间 2026-10-24T23:28:05+0800。
> 三去向（exploration-guide「项目知识读取」节 行为观察）：提交/分支习惯→SKILL.md 铁律段（引用来源）；工作偏好→dev-guide「开发偏好」节；隐式耦合/热点→reference-manual 说明列 + recipes 配方提取（§D.7 源②）。

## 提交前缀分布（Top 10）

| 前缀 | 次数 |
|------|------|
| feat | 1491 |
| fix | 1344 |
| merge | 1225 |
| docs | 670 |
| (other) | 188 |
| chore | 98 |
| test | 82 |
| refactor | 49 |
| style | 23 |
| perf | 19 |

## 分支命名分布（近 30 条活跃分支按首段）

| 首段 | 分支数 |
|------|--------|
| feat | 1 |
| (单段名) | 1 |

## 提交规模分桶（±行数合计）

| 桶 | 提交数 |
|----|--------|
| 小(<100行) | 2353 |
| 中(100-500行) | 979 |
| 大(>500行) | 477 |

## 共变文件 Top 对（同提交共现 ≥2 次——隐性耦合/拼装单元信号）

| 共现次数 | 文件对 |
|----------|--------|
| 8 | docs/superpowers/specs/2026-10-21-ncwk-design-spec.md ⇄ docs/superpowers/specs/2026-10-21-ncwk-product-spec.md |
| 7 | docs/superpowers/specs/2026-10-21-ncwk-product-spec.md ⇄ docs/superpowers/specs/2026-10-21-swarmstudio-complete-design.md |
| 7 | docs/superpowers/specs/2026-10-21-ncwk-design-spec.md ⇄ docs/superpowers/specs/2026-10-21-swarmstudio-complete-design.md |
| 7 | custom/server/harness/workbench/__tests__/workbench-http.test.ts ⇄ custom/server/harness/workbench/service.ts |
| 7 | custom/client/governance/improve-i18n.ts ⇄ custom/client/ia2/views/gov/HarnessImprovePanel.vue |
| 6 | docs/superpowers/specs/2026-10-23-swarmstudio-design-ledger.md ⇄ docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md |
| 6 | docs/superpowers/specs/2026-10-21-ncwk-unified-product-design.md ⇄ docs/superpowers/specs/2026-10-21-swarmstudio-complete-design.md |
| 6 | docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md ⇄ docs/superpowers/specs/2026-10-23-swarmstudio-integrated-design.md |
| 6 | custom/client/ia2/__tests__/harness-improve-panel.test.ts ⇄ custom/client/ia2/views/gov/HarnessImprovePanel.vue |
| 6 | custom/client/governance/improve-i18n.ts ⇄ custom/client/ia2/__tests__/harness-improve-panel.test.ts |
| 6 | custom/client/governance/api/workbench.ts ⇄ custom/client/ia2/views/gov/HarnessImprovePanel.vue |
| 6 | custom/client/governance/api/workbench.ts ⇄ custom/client/ia2/__tests__/harness-improve-panel.test.ts |
| 6 | custom/client/governance/api/workbench.ts ⇄ custom/client/governance/improve-i18n.ts |
| 5 | mux/mx-eval-lib.sh ⇄ mux/mx-report-gen.py |
| 5 | docs/superpowers/specs/2026-10-21-ncwk-appendix-a-spec-index.md ⇄ docs/superpowers/specs/2026-10-21-ncwk-design-spec.md |

## 热点文件 Top 15（窗口内被改次数）

| 次数 | 文件 |
|------|------|
| 461 | patches/series |
| 250 | mux/mx-report-gen.py |
| 213 | docs/superpowers/specs/2026-10-05-mux-v8-fullflow-plan.md |
| 191 | aipay-scenario.sh |
| 136 | mux/mx-scenario-lib.sh |
| 127 | docs/superpowers/specs/2026-09-25-ycode-absorption-matrix.md |
| 98 | mux/mx-lib.sh |
| 90 | package.json |
| 78 | RELEASE-NOTES.md |
| 73 | custom/client/ia2/views/WorkbenchView.vue |
| 72 | custom/client/ide/views/IdeShell.vue |
| 70 | custom/client/cockpit/store/cockpit.ts |
| 69 | tests/harness-gate-integrity.test.ts |
| 68 | custom/client/ide/views/IdeChatPane.vue |
| 63 | scripts/aipay/aipay-scenario.sh |

## 测试文件提交占比

- 55% 的提交触及测试文件（test/spec/__tests__ 路径）。

## AI 审读指引（机械/AI 边界）

- 本文件是统计事实，不是规范——前缀分布 ≠ 必须遵守的提交规范（规范以其书面规则为准，本表只作实证交叉）。
- 共变对是隐性耦合信号：高频共变文件对应在 reference-manual 说明列记注意事项，并作为 recipes 配方「复用件清单」的佐证（§D.7 源②）。
- 异常信号（如测试占比 0%、单体巨型提交为主）如实写入 dev-guide 注意事项，不粉饰。
