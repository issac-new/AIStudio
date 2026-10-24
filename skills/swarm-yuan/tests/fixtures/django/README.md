# django fixture 说明

- violating 主触发 3 个 fail 意图：SECRET_KEY 字面量硬编码 / 生产 settings DEBUG=True / cursor.execute f-string 拼接 SQL。
- 断言登记：**3/3 主触发已断言**（`violating/expected-fail-ids`：
  `fw_django_debug`、`fw_django_raw_sql`、`fw_django_secret_key`，
  2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的 3 个 fail 门禁全部命中，无需唤醒修复。
