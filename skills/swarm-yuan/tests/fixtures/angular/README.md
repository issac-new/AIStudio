# angular fixture 说明

- violating 主触发 1 个 fail 意图：.subscribe 未配 takeUntilDestroyed/takeUntil（user.service.ts）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_angular_subscribe_cleanup`）。
- 2026-07-20 P1 唤醒记录：无沉睡门禁（本框架唯一 fail 门禁原 fixture 已触发）。
- 无法实例化项登记：无。
- compliant 侧订阅均配 takeUntilDestroyed + standalone 组件，期望全 pass。
