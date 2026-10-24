# lombok fixture 说明

- violating 主触发 2 个 fail 意图：@Entity+@Data 同文件（User.java）/ @Slf4j+手写 LoggerFactory.getLogger 同文件（LogService.java）。
- 断言登记：**2/2 主触发已断言**（`violating/expected-fail-ids`：`fw_lombok_data_jpa`、`fw_lombok_slf4j_dup`）。
- 2026-07-20 P1 唤醒记录：`fw_lombok_slf4j_dup` 原 fixture 无 @Slf4j 样本而沉睡（输出为"无 @Slf4j 用法，跳过"），
  本批新增 violating/LogService.java 实例化唤醒；门禁判定逻辑未动。
- 无法实例化项登记：无（本框架 2 个 fail 门禁均可由静态源码 fixture 实例化）。
- compliant 侧 User.java 为 @Getter/@Setter + 字段级 Exclude 写法，期望全 pass。
