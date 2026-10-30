# 治理工件注册表按轮回落（candidates）＋发版收口

日期：2026-10-30 ｜ 类型：fix（产品数据接线）｜ 触发：run23 用户实报「产出物在 UI 页面上看不到（文档、代码、规范）」

## 变更

1. **`custom/server/governance/governance-controller.ts`**——`GOVERNANCE_DOCS` 条目新增可选 `candidates: readonly string[]`（按轮命名工件的回落路径族）；`docMeta()` 逐候选解析（default 路径优先、按轮路径回落），命中者作为该工件实际 `path` 返回（GET /doc 全文读取同用该 path）。本次登记三族：G5 发布说明（RELEASE.md → docs/release/RFD-001-release-notes.md）、合规审计意见书（default-audit-opinion.md → 20261028-v8-run23-audit-opinion.md）、G6 复盘报告（default-RFD-001-retrospective.md → 20261028-v8-run23-RFD-001-retrospective.md）。
2. **发版收口（数据面，非代码）**——REL-MERGE integration/RFD-001 → main（合并提交 `219fd33`）：G5 放行后补齐的交付物（G4 整合测试报告、商户接入文档、模板合规七件、审计意见书）并落 main，治理·文档评审面的数据仓（读 main）随即可见。

## 决策记录

- **根因（两层）**：①发版步（11:14 release_done）早于后续补齐件落 integration（15:29 前），main 落后→页面读 main 显示「缺失」；②注册表路径是 `default-*` 占位命名，而真实产出按轮命名（`docs/retro/<date>-<runtag>-*.md`），即使 main 有文件也对不上路径。
- **为什么不改成 glob 动态发现**：glob 会在多轮并存时命中歧义文件（旧轮同名工件）；显式 candidates 族与 mx-report-gen 的 `_cands` 同族口径，可控可审计。轮号写死在注册表是已知代价——换轮时须同步本表（与 capture-plan.env 换轮同步任务同级）。
- **不引入新端点**：复用 `/overview` 与 `/doc`，响应结构零变化（path 字段语义从「注册路径」变「实际命中路径」，client 无感）。

## 验证

- `npm run typecheck:harness` rc=0；`npx vitest run custom/__tests__` 除注入态守门 2 例（worktree 无注入态基线失败，与本次无关）外全过。
- 部署实测：治理·文档评审页「合规审计意见书 3f84b15 本轮」「G6 复盘报告 ffd082e 本轮」「G4 测试报告 fc3658f 本轮」全部带 commit 锚显示；缺失计数 5→3（余 3 为 G3 分支证据 feat/DEV-* 引用随合并清理，属合法缺席）。
- 帧重拍入报告（appinit_done-op1-after，收尾补拍标注），报告审计四查全过。

## 设计文档影响

DESIGN_SYNC: none——注册表结构新增可选字段为向后兼容扩展，端点契约与 UI 消费面零改动；按轮命名的工件路径族与推演方案 §2.7 交付物路径约定一致，无需改正本。
