# elasticjob fixture 说明

- violating 主触发 1 个 fail 意图：检出 ElasticJob 作业但未开启 failover（OrderShardingJob.java + application.yml）。
- 断言登记：**1/1 主触发已断言**（`violating/expected-fail-ids`：`fw_elasticjob_failover`）。
- 沉睡门禁：无（唯一 fail 门禁在 P1 实跑基线中已触发，输出 ✗ 行为证）。
- 无法实例化项登记：无。
- compliant 侧 application.yml 显式 failover=true + ZK 集群多地址，期望全 pass。
