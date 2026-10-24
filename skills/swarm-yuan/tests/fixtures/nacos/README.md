# nacos fixture 说明

- violating 主触发 1 个 fail 意图：敏感配置明文入 Nacos（application.yml 明文 password/secret）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_nacos_config_encrypt`）。
- 沉睡门禁：无（唯一 fail 门禁在 P1 实跑基线中已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧 application.yml 敏感项 ${ENV} 外部化注入 + namespace 隔离，期望全 pass。
