# 2026-11-02 supervisor 熔断催办闸别分流

## 变更

`simharness/mux/run-driver-supervisor.sh` `_br_nudge_g5()`：催办前读 `runs/<RUN>/governance/breaker.json` 取 `failRounds>=2` 的实际熔断闸键，按闸别三分支生成话术——G2 催「概设全量修订（以评审卡完整清单为唯一依据）＋@arch 复评」；G5 保留原 READY-GATE-PASS 话术；其余闸催通用补证。守门断言三枚（harness-gate-integrity）。

## 决策记录

- run25 实锤（22:45-22:55 三回合）：G2 熔断死等被 G5 话术误催——run25 未到 G5，fanfan 每次只能「拒报 READY-GATE-PASS」，每 20 分钟一个回合抢占概设 v1.2 全量修订的关键路径。原实现（run19 根治件）只考虑了 G5 熔断场景，闸别硬编码。
- 分流而非停催：熔断死等催办本身是 run19「死等 14400s+」的根治件，语义保留；仅话术与被催对象动作按闸别正确化。G2 分支话术与场景脚本 G2 退回派单词同口径（以评审卡完整缺项清单为唯一修订依据），顺带对冲「窄修循环」（run25 G2 环第 2 轮根因）。

## 验证

- `bash -n` 语法门过；`npx vitest run tests/harness-gate-integrity.test.ts` 128/128（含新三断言）。

## 设计文档影响

DESIGN_SYNC: none——监督器催办话术层修复，熔断/催办/复位判据零变化。
