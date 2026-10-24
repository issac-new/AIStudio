# xxl-job fixture 说明

- violating 主触发 2 个 fail 意图：执行器 accessToken 为空或弱值（application.properties）/ 动态执行 API 与任务参数同文件（GlueJobHandler.java）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_xxljob_access_token`、`fw_xxljob_glue_injection`）。
- 2026-07-20 P1 唤醒记录：`fw_xxljob_glue_injection` 原 fixture 无动态执行面样本而沉睡（输出"未检出动态执行面"），
  本批新增 violating/GlueJobHandler.java（GroovyClassLoader + XxlJobHelper.getJobParam 同文件）实例化唤醒；门禁判定逻辑未动。
- 无法实例化项登记：无（本框架 2 个 fail 门禁均可由静态源码/配置 fixture 实例化）。
- compliant 侧 application.properties 强 accessToken + BatchJobHandler.java 幂等分片写法，期望全 pass。
