# typeorm fixture 说明

- violating 主触发 2 个 fail 意图：synchronize: true / QueryBuilder where 模板插值拼接。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_typeorm_synchronize_prod`、`fw_typeorm_qb_injection`）。
- 2026-07-20 实跑核验：两个 fail id 均在 violating 输出 ✗ 行命中；无沉睡 fail 门禁。
