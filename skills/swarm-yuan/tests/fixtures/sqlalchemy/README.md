# sqlalchemy fixture 说明

- violating 主触发 2 个 fail 意图：create_engine URL 明文凭据 / text(f"") 拼接 SQL。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：
  `fw_sa_engine_credentials`、`fw_sa_text_injection`，
  2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的 2 个 fail 门禁全部命中，无需唤醒修复。
