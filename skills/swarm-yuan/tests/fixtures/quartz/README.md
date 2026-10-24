# quartz fixture 说明

- violating 主触发 1 个 fail 意图：检出 @Scheduled 但全仓库无 ShedLock/Redisson 分布式锁（NightlySettleTask.java）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_quartz_scheduled_lock`）。
- 沉睡门禁：无（唯一 fail 门禁在 P1 实跑基线中已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧任务类带 @SchedulerLock 分布式锁 + quartz.properties 集群 JDBC JobStore，期望全 pass。
