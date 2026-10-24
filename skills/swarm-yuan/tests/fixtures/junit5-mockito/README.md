# junit5-mockito fixture 说明

- violating 主触发 1 个 fail 意图：测试仅含 assertNotNull 断言、无具体期望值断言（UserServiceTest.java）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_junit_assertnotnull_only`）。
- 沉睡门禁：无（唯一 fail 门禁在 P1 实跑基线中已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧 UserServiceTest.java 用 assertEquals/assertThrows/verify 实质断言，期望全 pass。
