# consistency gate-fixture（R13 后语义）

check_consistency 自 WP-Q2H-A/R13 起 转 AI 自觉判断模式（机械 grep 分支退役，
GATE_AI_JUDGMENT 恒 1）：输出固定引导文案（自查要点 + notes 留痕提示 + advisory pass 行），
子组输出一致——原机械双态区分（含图/无图、深链/浅链）已随机械分支退役。
样本源码保留（给 AI 判断场景提供真实上下文）。

# consistency 门禁 fixture 语义登记

`check_consistency`（--consistency，业务规则 + 数据勾稽核对）**永不 fail**：
函数体内无 `fail()` 调用，幂等性提醒仅为 `warn`，退出码恒为 0。

因此本门禁的「违规语义态」无法以 `violating/`（期望退出非 0）承载，
改用 `compliant-*` 命名（runner 期望退出 0）+ `expect-output` 断言 warn 文案：

| fixture | 语义态 | 断言 |
| --- | --- | --- |
| `compliant/` | 写入 ≤5 处，无 warn | expect-output 命中 pass 行；forbidden-ids 禁中幂等性提醒 |
| `compliant-warn-idempotency/` | 写入 7 处（>5），触发幂等性 warn | expect-output 命中 warn 文案与 pass 行（warn 与 pass 共存） |

门禁行为真值来源：`assets/precheck.sh` `check_consistency()` ——
`CONSISTENCY_DIRS` 内同名写入（INSERT INTO/.create(/db.insert）粗筛计数 >5 时 warn，
末尾恒 `pass "业务规则与勾稽核对完成..."`。
