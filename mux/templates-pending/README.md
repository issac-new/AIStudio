# templates-pending — 中央仓交付物模板待迁区

**为什么存在**：中央仓 aipaydev 是在跑推演轮（run11+）的活数据源，推演进行中改 templates/ 会污染当轮（零污染铁律 §4.3-25c）。公文技法修订后的模板在此暂存，**当轮收官后迁入**。

**迁移口径（收官后执行）**：
```bash
cd <central>/aipaydev && git checkout main && git pull
cp <simharness>/mux/templates-pending/design.md templates/design.md
git commit -am "docs(templates): design.md 公文技法修订——填表人三问+三态词对齐+编号修复"
git push origin main   # 记 DISP 锚入当轮 issues.log（补件带 provenance 纪律）
```

**当前清单**：
- `design.md`（2026-10-08 修订；基于 origin/main@dc0abff 版）：
  ① 填表人三问总注（判断句/可机械核对判据/黑话首现释义）
  ② §7 状态词对齐台账三态（已修/观察/延后——"已闭环"系表外词，§4.3-28）
  ③ §7→§9 编号断档修复（原缺 §8，风险节升为 §8）
  ④ §1.1 判据提示（禁自创判据，引冻结 AC 编号）

**后续批量项（挂账）**：mx-scenario-lib.sh 内嵌交付物模板（freeze/tasklist/schedule/test-report/acceptance/audit-opinion/retrospective/work-report/release-plan/release-notes）按方案 §2.7 模板写法规范逐张过——字段说明判断句化+判据机械核对化+三态词对齐；改动随轮验证（步 20 约定：模板不满足实际需要直接完善再用）。
