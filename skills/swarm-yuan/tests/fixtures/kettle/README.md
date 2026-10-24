# kettle fixture 说明

- violating 主触发 2 个 fail 意图：.ktr 数据库连接密码明文 / Carte 默认 cluster/cluster 弱口令。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_kettle_carte_default_auth`、`fw_kettle_password_encr`，
  2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的 2 个 fail 门禁全部命中，无需唤醒修复。
