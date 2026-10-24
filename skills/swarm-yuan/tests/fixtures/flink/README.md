# flink fixture 说明

- violating 主触发 1 个 fail 意图：Flink 作业全项目无 checkpoint 配置。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：
  `fw_flink_checkpoint_enabled`，2026-07-20 P1-B6 实跑登记）。
- 门禁无沉睡：声明的唯一 fail 门禁命中，无需唤醒修复。
