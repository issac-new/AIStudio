# 治理收尾批：决策台账、发布批次与独立审计（2026-11-05）

> 定位：`2026-11-05-governance-truth-restoration.md` 的收尾批，清偿其挂账的决策台账、发布批次、独立审计三项。

## 变更

1. **决策台账 actor 回填**：`.swarm-yuan/decisions.jsonl` 34 条标准形态缺 `actor` 的行补 `actor:"unattributed"`，显式标注「原始责任人未记录」，不改任何判定字段。5 条 `legacy-id-decision` 形态保留 schema 声明的兼容形态，lint 仍告警但不计 problem。
2. **发布批次落真**：`RELEASE-MANIFEST.json` 的 `releaseBatches` 从空数组改为 `v1.0.12-overlay` 实际批次（tag 指向 commit `5f160d3c2`、tree `65090612010d`），`verify-release-manifest.mjs` 校验通过。
3. **独立审计**：以 seed=20261105 抽 5 门 + 5 份 spec，独立会话复核，意见落 `docs/reports/2026-11-05-independent-audit-opinion.md`；抽样写入 `.swarm-yuan/audit-samples.jsonl`。
4. **审计脚本三修**：`--record` 纳入 `release:preflight`；门池不可用/为空返回退出码 3 并记 finding；四段检查读取 `spec-sections-baseline.txt`，在册豁免不再计 finding。
5. **注释失真两修**：`.qgate/qgate.yaml` 的 pre-push 默认档改为「默认拦截、`QGATE_PREPUSH_ENFORCE=0` 降级告警」；`spec-sections-baseline.txt` 的棘轮路径改指 `custom/__tests__/l2-kit-parity.test.ts`。
6. **silent-return 逐类复核**：85 处经上下文分类——79 处紧邻 `expect`（TypeScript 收窄守卫，断言失败即红）、2 处生命周期钩子、5 处 helper（递归/轮询/mock 前置判断），无一处是「测试体静默通过」。基线维持 85，作为新增棘轮。

## 决策记录

| 决策 | 选择 | 备选 | 理由 | 类型 |
|---|---|---|---|---|
| 历史 actor 缺失怎么补 | 补 `unattributed`，不改判定字段 | 用 git author 回填 / 不补 | git author 是提交者不是决策者，回填会伪造责任；`unattributed` 诚实且让 schema 可判 | Judgment |
| 无收据历史 spec 是否追认 | 不追认，下次触碰时首次绑定 | 事后生成收据 | 事后收据只证明回填时内容，不能证明合入时绑定 | Judgment |
| silent-return 是否清零 | 维持 85 棘轮，逐类复核后不动 | 全量改 `throw` | 85 处均非测试体静默通过；全量改会放大环境门控测试的失败面 | Mechanical |
| 审计脚本空门池 | 退出码 3 + finding | 维持 0 | 空样本不能代表治理常态，成功退出会误导 | Mechanical |
| fibo 缺段 | 读 baseline 豁免，不重复告警 | 补段删豁免 | 棘轮已断言其仍不达标；重复告警是假阳性 | Mechanical |

## 验证

- `node scripts/audit-sample.mjs --seed 20261105 --record` → `gates=5 specs=5 findings=2`（仅两份历史无收据），退出码 0。
- `node scripts/verify-release-manifest.mjs` → `✓ release:check`。
- `node scripts/governance-lint.mjs --strict` → `0 problem(s), 5 warning(s)`（5 条 legacy 形态，schema 声明兼容）。
- `npm test` → 1074 文件 / 8041 用例通过，6 skipped / 11 skipped。
- `npm run typecheck:harness` → exit 0。

## 设计文档影响

- DESIGN_SYNC: none
  - 理由：本批只改治理台账、审计脚本与发布清单证据字段，不改变产品能力边界、契约或数字口径；四份设计正本无需同步。
