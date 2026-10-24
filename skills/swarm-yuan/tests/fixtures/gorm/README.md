# gorm fixture 说明

- violating 主触发 2 个 fail 意图：for-range 内逐条查询无 Preload（N+1） / gorm.Open 未配 SetMaxOpenConns。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_gorm_conn_pool`、`fw_gorm_n_plus_one`，
  2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的 2 个 fail 门禁全部命中，无需唤醒修复。
