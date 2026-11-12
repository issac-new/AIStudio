# swarm-yuan 脚本行数台账同步（FACT_SCRIPT_LOC 9972 → 9988）

## 变更

`skills/swarm-yuan/scripts/self-check.sh` 的 LOC 监控以四脚本（`assets/precheck.sh`、`gates-strict.sh`、`gates-warn.sh`、`gates-advisory.sh`）`wc -l` 合计与 `assets/facts.conf` 的 `FACT_SCRIPT_LOC` 对账。main 上实测为 9988 行，台账写 9972，差 16 行；自检因此长期输出 warn。本次把台账同步为实测值。

## 决策记录

1. 只同步台账数值，不改脚本、门禁、阈值或预算。LOC 是膨胀趋势监控而非硬约束，该检查本身是 warn-only；本次消除的是“文档口径与实测不一致”。
2. 漂移系 main 既有（`git show origin/main` 同时为 9972 与 9988 行），非本分支引入；在此顺带清偿，避免培训手册发布时自检带警告。
3. 注释保留历史口径（R141、函数拆分、spec-first 四维块），只追加本次实测值与日期，不覆盖既有来路。
4. 不改 `docs/DESIGN.md` 或设计数字总账：该 key 服务 self-check 与文档“不写死行数”的约定。

## 验证

- `bash skills/swarm-yuan/scripts/self-check.sh --check-only`：LOC 行由 warn 变为 `✓ 脚本行数 9988 = FACT_SCRIPT_LOC`，其余检查不回归。
- `node scripts/maintenance/gen-doc-indexes.mjs --check` 0 问题；文档守门全绿；`git diff --check` 干净。

## 设计文档影响

DESIGN_SYNC: none。仅同步技能自检台账数值，不改变产品能力、架构、接口、门禁集合或发布数字。
