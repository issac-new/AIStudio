---
ruleset_id: spring-boot
适用版本: Spring Boot 3.4.x–4.0.x（jakarta 命名空间终态；3.2.x 起 javax.* 全量迁移至 jakarta.*；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/spring-projects/spring-boot/releases ；https://spring.io/projects/spring-boot ；https://docs.spring.io/spring-boot/reference/ ；https://github.com/spring-projects/spring-framework/wiki/Upgrading-to-Spring-Framework-6.x ；https://spring.io/blog/2025/11 ；https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#features.profiles ；https://docs.spring.io/spring-boot/docs/current/reference/htmlsingle/#actuator.endpoints ）
深度门槛: 15
---

# Spring Boot 规则集

<!--
本规则集覆盖 Spring Boot 3.4.x 与 4.0.x（2025-11 GA，jakarta.* 终态）。
调研时点：2026-07-17。Spring Boot 4.0 基于 Spring Framework 7，最低 Java 17（待验证：4.0 是否上调至 Java 21 baseline，未联网核实 release notes，相关规律按"Java 17+ baseline"保守陈述并标待验证）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.boot:spring-boot-starter` / `spring-boot-starter-web` / `spring-boot-starter-actuator` / `spring-boot-starter-data-jpa` / `spring-boot-starter-test` | 高 |
| 注解 | `@SpringBootApplication` / `@Configuration` / `@ConfigurationProperties` / `@ConditionalOnMissingBean` / `@Profile` / `@SpringBootConfiguration` | 高 |
| 文件 | `**/application.yml` / `**/application.yaml` / `**/application.properties` / `**/application-*.yml` / `banner.txt` / `**/META-INF/spring.factories` / `**/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` | 高 |
| 配置 | `spring.profiles.active` / `management.endpoints.web.exposure.*` / `spring.datasource.*` / `server.port` / `spring.devtools.*` / `spring.main.banner-mode` / `spring.main.allow-circular-references` | 高 |
| 代码 | `SpringApplication.run(` / `@Bean` / `@Transactional` / `extends SpringBootServletInitializer` / `WebSecurityConfigurerAdapter`(废弃) | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 spring-boot 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 配置文件：`find "${PROJECT_DIR}" -type f \( -name 'application*.yml' -o -name 'application*.yaml' -o -name 'application*.properties' \) -not -path '*/target/*'`（计数核验基准：文件个数 = `find … | wc -l`）
- 自动配置注册：`find "${PROJECT_DIR}" -type f -name 'org.springframework.boot.autoconfigure.AutoConfiguration.imports'`（计数核验基准：imports 文件数）
- @Configuration 类：`grep -rlE '@(Configuration|SpringBootConfiguration)\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含注解的 .java 文件数 = `grep -l … | wc -l`）
- @Bean 方法：`grep -rnE '^[[:space:]]*@Bean\b' $(grep -rlE '@Configuration' --include='*.java' "${PROJECT_DIR}")`（计数核验基准：@Bean 注解行数）
- Actuator 暴露配置：`grep -rnE 'management\.endpoints\.web\.exposure' "${PROJECT_DIR}"`（计数核验基准：命中配置项数）
- Profile 配置：`grep -rnE 'spring\.profiles(\.active|\.include|\.group)' "${PROJECT_DIR}"`
- devtools 依赖：`grep -rnE 'spring-boot-devtools' "${PROJECT_DIR}" --include='pom.xml' --include='build.gradle'`
- @Transactional 用法：`grep -rnE '@Transactional\b' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：@Transactional 同类自调用不走代理，事务失效
- **适用版本**: Spring Boot 3.4.x–4.0.x（Spring Framework 6.x/7.x，基于 JDK 动态代理或 CGLIB）
- **规律**: Spring 的 `@Transactional` 通过 AOP 代理实现。同类内部方法 A 直接调用本类方法 B（`this.b()` 或 `b()`）绕过代理对象，B 上的 `@Transactional` 不生效。须通过注入自身代理（`@Lazy` 自注入或 `ApplicationContext.getBean`）或将方法拆到另一 Bean。
- **违反后果**: 事务静默失效，写操作无事务保护 → 脏数据 / 部分提交不一致。
- **验证方法**: 在同一 `@Configuration`/`@Service`/`@Component` 类内，`grep -nE '@Transactional\b'` 标注的方法被同类其他方法直接调用（同文件内出现方法名调用且无 `self.`/代理引用）→ warn 人工确认。
- **对应门禁**: fw_sboot_transactional_selfinvoke(fail)

```verify
id: spring-boot-r1
cmd: grep -nE '@Transactional\b' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Transactional 默认仅对 RuntimeException 回滚，checked 异常不回滚
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `@Transactional` 默认 `rollbackFor = RuntimeException.class`（及 Error）。抛 checked 异常（如 `IOException`、自定义业务异常 extends Exception）默认提交而非回滚。业务中 checked 异常需显式 `@Transactional(rollbackFor = Exception.class)` 或 `rollbackForClassName`。
- **违反后果**: checked 异常场景事务未回滚 → 数据不一致。
- **验证方法**: `grep -rnE '@Transactional\b' --include='*.java'` 命中行未含 `rollbackFor`/`rollbackForClassName`，且方法签名 throws checked 异常 → warn 提示显式声明回滚异常。
- **对应门禁**: fw_sboot_transactional_rollback(warn)

```verify
id: spring-boot-r2
cmd: grep -rnE '@Transactional\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：构造器注入优于字段注入
- **适用版本**: Spring Boot 3.4.x–4.0.x（Spring Framework 4.3+ 起推荐构造器注入，6.x 文档明确不推荐字段注入）
- **规律**: 构造器注入使依赖不可变（final 字段）、可在非 Spring 环境实例化测试、强制依赖显式化。字段注入（`@Autowired` 标在字段上）隐藏依赖、阻碍测试、允许循环依赖。单构造器可省略 `@Autowired`。
- **违反后果**: 字段注入导致测试困难、依赖隐藏、循环依赖隐患（Spring Boot 2.6+ 默认禁止循环依赖）。
- **验证方法**: `grep -rnE '^[[:space:]]*@Autowired[[:space:]]+private\b' --include='*.java'`（字段注入）→ warn 建议改构造器注入。
- **对应门禁**: fw_sboot_constructor_inject(warn)

```verify
id: spring-boot-r3
cmd: grep -rnE '^[[:space:]]*@Autowired[[:space:]]+private\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Configuration proxyBeanMethods=false 优化启动，但 @Bean 间直接调用语义变化
- **适用版本**: Spring Boot 3.4.x–4.0.x（Spring Framework 5.2+ 起 `@Configuration(proxyBeanMethods = false)` 可用，proxyBeanMethods 默认 true）
- **规律**: `@Configuration` 默认 `proxyBeanMethods=true`，CGLIB 代理 @Configuration 类使 @Bean 方法间直接调用返回单例 Bean。设 `false` 关闭代理可加速启动、减少内存（Lite 模式），但此时 @Bean 方法间直接调用变为普通 Java 方法调用（每次 new 新实例，非单例语义）。Spring Boot 的 auto-configuration 大量使用 `false`。
- **违反后果**: 误在 `proxyBeanMethods=false` 的 @Configuration 类中 @Bean 方法间直接调用期望单例 → 每次新建实例，Bean 重复创建。
- **验证方法**: 对声明 `proxyBeanMethods[[:space:]]*=[[:space:]]*false` 的 @Configuration 类，检查其 @Bean 方法体内是否直接调用了同类另一个 @Bean 方法 → warn 核对单例语义。
- **对应门禁**: fw_sboot_proxy_bean_methods(warn)

```verify
id: spring-boot-r4
cmd: 
expect: always
```

### 规律：@Profile 隔离环境配置，不可在 @ConfigurationProperties 上误用
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `@Profile("prod")` 标在 `@Configuration`/`@Component` 上限定激活 profile；`@Profile` 不能直接标在 `@ConfigurationProperties` Bean 上（3.x 起属性绑定与 profile 解耦，应用 `@Profile` 在 `@ConfigurationPropertiesScan` 或 `@EnableConfigurationProperties` 的配置类上，或用 `spring.config.activate.on-profile` 在 yml 中切换）。误用会导致属性绑定随 profile 漂移不可预期。
- **违反后果**: 配置属性在不同 profile 下行为不一致 / 启动期 Bean 装配错乱。
- **验证方法**: `grep -rnE '@Profile' --include='*.java'`，命中行同文件含 `@ConfigurationProperties` 且无 `@Configuration`/`@Component` 隔离 → warn。
- **对应门禁**: fw_sboot_profile_isolation(warn)

```verify
id: spring-boot-r5
cmd: grep -rnE '@Profile' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@ConditionalOnMissingBean 顺序敏感，自定义配置须排在内置 auto-config 之前
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `@ConditionalOnMissingBean` 让 auto-configuration 在用户未自定义 Bean 时提供默认实现。用户自定义 Bean 覆盖默认项的前提是用户的 @Configuration 先于 auto-config 被处理；Spring Boot 通过 `@AutoConfigureBefore`/`@AutoConfigureAfter`/`@AutoConfigureOrder` 控制 auto-config 顺序，用户 @Configuration 普遍优先于 auto-config。但自定义 auto-configuration 类间须显式声明顺序，否则 `@ConditionalOnMissingBean` 判定时机不确定。
- **违反后果**: 自定义 Bean 未覆盖默认项 / 顺序不确定导致 Bean 装配不稳定。
- **验证方法**: `grep -rnE '@ConditionalOnMissingBean' --include='*.java'`，若位于自定义 auto-config 类（`META-INF/...AutoConfiguration.imports` 注册）且无 `@AutoConfigureBefore/After` → warn。
- **对应门禁**: fw_sboot_conditional_order(warn)

```verify
id: spring-boot-r6
cmd: grep -rnE '@ConditionalOnMissingBean' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Actuator 端点暴露面须收敛，生产禁用 exposure.include=*
- **适用版本**: Spring Boot 3.4.x–4.0.x（Actuator 端点默认仅暴露 `/health`，web exposure 须显式开启）
- **规律**: Actuator 端点（`/env`、`/beans`、`/configprops`、`/heapdump`、`/threaddump`、`/loggers` 等）泄露敏感运行时信息。`management.endpoints.web.exposure.include=*` 暴露全部端点为高危配置；生产应仅暴露 `/health`（必要时 `/info`、`/prometheus`），其余走独立 management 端口或禁用 web 暴露。
- **违反后果**: 信息泄露 CWE-200；`/heapdump` 可导出内存含密码密钥；`/env` 暴露配置含数据库口令。
- **验证方法**: `grep -rnE 'management\.endpoints\.web\.exposure\.include'` 命中值含 `*`（或 `env,beans,heapdump` 等敏感项）且无独立 management 端口隔离 → fail。
- **对应门禁**: fw_sboot_actuator_expose(fail)

```verify
id: spring-boot-r7
cmd: grep -rnE 'management\.endpoints\.web\.exposure\.include' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：devtools 仅限开发，生产 classpath 禁含 spring-boot-devtools
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `spring-boot-devtools` 提供热重启、LiveReload、开发期默认配置（如禁用模板缓存），其禁用打包机制依赖打包后的 jar 不含 devtools 类。若生产 classpath 含 devtools，会启用自动重启监控、修改默认行为（如 `server.servlet.session.persistent`）。Maven 须 `<optional>true</optional>` 或 `provided` scope；Gradle 须 `developmentOnly` configuration。
- **违反后果**: 生产环境意外启用热重启 / LiveReload / 缓存禁用 → 性能与稳定性问题。
- **验证方法**: `grep -rnE 'spring-boot-devtools' --include='pom.xml' --include='build.gradle'`，pom 中未标 `optional`/`provided`，或 gradle 未用 `developmentOnly` → warn。
- **对应门禁**: fw_sboot_devtools_in_prod(warn)

```verify
id: spring-boot-r8
cmd: grep -rnE 'spring-boot-devtools' --include='pom.xml' --include='build.gradle' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@SpringBootApplication 扫描范围 = 声明类所在包及子包
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `@SpringBootApplication` 默认 `@ComponentScan` 扫描声明类所在包及子包。若启动类放在 `com.example.app` 根包，组件须在其下；若启动类放在 `com.example.app.web` 子包，则 `com.example.app.service` 不会被扫描。须用 `@SpringBootApplication(scanBasePackages=...)` 显式扩大或 `@ComponentScan` 调整。
- **违反后果**: 组件未被扫描 → `NoSuchBeanDefinitionException` 启动失败，或 Bean 静默缺失。
- **验证方法**: 定位 `@SpringBootApplication` 类，其包路径若非项目根包（如其他 @Configuration 在更上层包）且未声明 `scanBasePackages` → warn。
- **对应门禁**: fw_sboot_scan_scope(warn)

```verify
id: spring-boot-r9
cmd: 
expect: always
```

### 规律：@ConfigurationProperties 须注册（@EnableConfigurationProperties 或 @ConfigurationPropertiesScan）
- **适用版本**: Spring Boot 3.4.x–4.0.x（3.x 起推荐 `@ConfigurationPropertiesScan` 批量扫描）
- **规律**: 标 `@ConfigurationProperties(prefix="...")` 的 POJO 须被注册为 Bean 才能绑定：或加 `@Component`/`@ConfigurationPropertiesScan`，或用 `@EnableConfigurationProperties(XxxProperties.class)`。仅声明注解不注册则绑定不生效（属性全 null），且不报错。
- **违反后果**: 配置未绑定，运行期 NPE / 默认值生效与预期不符。
- **验证方法**: `grep -rlE '@ConfigurationProperties' --include='*.java'` 的类，须在同文件或启动类检出 `@Component`/`@ConfigurationPropertiesScan`/`@EnableConfigurationProperties`，否则 → warn。
- **对应门禁**: fw_sboot_configprops_binding(warn)

```verify
id: spring-boot-r10
cmd: grep -rlE '@ConfigurationProperties' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：jakarta 命名空间迁移，javax.* 须全量替换为 jakarta.*
- **适用版本**: Spring Boot 3.0+（基于 Spring Framework 6，EE 9+ jakarta 命名空间）；4.0 完全终态
- **规律**: Spring Boot 3.0 起将 `javax.servlet.*`/`javax.persistence.*`/`javax.validation.*`/`javax.annotation.*` 等迁至 `jakarta.*`。残留 `javax.*`（web/persistence/validation 注解）会导致 `ClassNotFoundException` 或 `NoClassDefFoundError`，启动期或运行期失败。
- **违反后果**: 启动期 `NoClassDefFoundError: javax/servlet/...` 或运行期 `ClassNotFoundException`。
- **验证方法**: `grep -rnE 'import[[:space:]]+javax\.(servlet|persistence|validation|annotation(\.PostConstruct|\.PreDestroy)|transaction|mail|jms|websocket)' --include='*.java'` → fail（须替换为 jakarta）。
- **对应门禁**: fw_sboot_jakarta_migration(fail)

```verify
id: spring-boot-r11
cmd: grep -rnE 'import[[:space:]]+javax\.(servlet|persistence|validation|annotation(\.PostConstruct|\.PreDestroy)|transaction|mail|jms|websocket)' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：循环依赖默认禁止，allow-circular-references=true 为逃逸阀非默认
- **适用版本**: Spring Boot 2.6+（默认 `spring.main.allow-circular-references=false`）至 4.0
- **规律**: Spring Boot 2.6 起默认禁止循环依赖，启动期抛 `BeanCurrentlyInCreationException`。开启 `spring.main.allow-circular-references=true` 可绕过但属反模式（设计缺陷逃逸阀）。应重构为构造器注入 + 抽离中间层，或 setter/`@Lazy` 注入。
- **违反后果**: 循环依赖掩盖设计问题；运行期初始化顺序不确定导致 NPE。
- **验证方法**: `grep -rnE 'spring\.main\.allow-circular-references[[:space:]]*[:=][[:space:]]*true'` → warn（建议重构消除循环依赖）。
- **对应门禁**: fw_sboot_circular_refs(warn)

```verify
id: spring-boot-r12
cmd: grep -rnE 'spring\.main\.allow-circular-references[[:space:]]*[:=][[:space:]]*true' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：banner 与离线模式在生产应收敛
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: `spring.main.banner-mode=console` 默认在控制台打印 Spring banner（占用日志噪声）；生产建议 `log` 或 `off`。`spring.main.log-startup-info=false` 可关闭启动信息日志。`spring.main.web-application-type` 须显式声明（none/servlet/reactive）避免误判。
- **违反后果**: 生产日志噪声 / 启动信息泄露技术栈。
- **验证方法**: 缺 `spring.main.banner-mode` 配置（默认 console）且为生产 profile → warn。
- **对应门禁**: fw_sboot_banner_mode(warn)

```verify
id: spring-boot-r13
cmd: 
expect: always
```

### 规律：@Bean 方法间直接调用依赖 proxyBeanMethods，Lite 模式下单例失效
- **适用版本**: Spring Boot 3.4.x–4.0.x
- **规律**: 与规律4 互补。`@Configuration`（Full 模式，proxyBeanMethods=true）中 `@Bean` 方法 A 内调用 `@Bean` 方法 B 返回的是容器托管的单例；`@Configuration(proxyBeanMethods=false)`（Lite 模式）或 `@Component` 中的 `@Bean` 方法间调用是普通 Java 调用，B 每次新建实例。误用 Lite 模式做 @Bean 间单例引用是常见坑。
- **违反后果**: Lite 模式下 @Bean 方法间调用每次新建 → 多实例 / 状态不一致。
- **验证方法**: 与规律4 同一机制，对 Lite @Configuration 类的 @Bean 间调用 → warn（合并至 fw_sboot_proxy_bean_methods）。
- **对应门禁**: fw_sboot_proxy_bean_methods(warn)

```verify
id: spring-boot-r14
cmd: 
expect: always
```

### 规律：DataSource 配置须显式连接池参数，避免默认值导致连接耗尽
- **适用版本**: Spring Boot 3.4.x–4.0.x（默认 HikariCP）
- **规律**: Spring Boot 默认 HikariCP，`maximum-pool-size` 默认 10、`connection-timeout` 默认 30s。高并发场景默认池大小不足导致请求排队超时；须按业务显式配置 `spring.datasource.hikari.maximum-pool-size`、`minimum-idle`、`connection-timeout`、`max-lifetime`。
- **违反后果**: 连接耗尽 → 请求超时 `SQLTransientConnectionException: HikariPool-1 - Connection is not available`。
- **验证方法**: 配置含 `spring.datasource.url` 但无 `spring.datasource.hikari.maximum-pool-size` → warn 提示显式配置连接池。
- **对应门禁**: fw_sboot_datasource_pool(warn)

```verify
id: spring-boot-r15
cmd: 
expect: always
```

<!--
共 15 条规律（≥12 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
规律4 与规律14 共享门禁 fw_sboot_proxy_bean_methods（同一机制的两面）。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_sboot_transactional_selfinvoke | fail | 同类内 @Transactional 方法被本类其他方法直接调用（无代理引用）→ fail 事务失效 (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_transactional_rollback | warn | @Transactional 未声明 rollbackFor 且方法 throws checked 异常 → warn (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_constructor_inject | warn | `@Autowired private` 字段注入 → warn 建议构造器注入 (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_proxy_bean_methods | warn | proxyBeanMethods=false 的 @Configuration 中 @Bean 方法间直接调用 → warn 单例失效 (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_profile_isolation | warn | @Profile 误标在 @ConfigurationProperties 上 → warn (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_conditional_order | warn | 自定义 auto-config 含 @ConditionalOnMissingBean 无 @AutoConfigureBefore/After → warn (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_actuator_expose | fail | management.endpoints.web.exposure.include=* 或含敏感端点且无独立 management 端口 → fail (CWE-200) | SPRINGBOOT_CONFIG_FILES |
| fw_sboot_devtools_in_prod | warn | spring-boot-devtools 依赖未标 optional/provided/developmentOnly → warn (CWE-489) | SPRINGBOOT_CONFIG_FILES |
| fw_sboot_scan_scope | warn | @SpringBootApplication 类非根包且未声明 scanBasePackages → warn (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_configprops_binding | warn | @ConfigurationProperties 类未注册（无 @Component/@ConfigurationPropertiesScan/@EnableConfigurationProperties）→ warn (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_jakarta_migration | fail | import javax.(servlet|persistence|validation|...) → fail 须替换为 jakarta (n/a) | SPRINGBOOT_SRC_GLOBS |
| fw_sboot_circular_refs | warn | spring.main.allow-circular-references=true → warn (n/a) | SPRINGBOOT_CONFIG_FILES |
| fw_sboot_banner_mode | warn | 生产 profile 缺 spring.main.banner-mode 配置（默认 console）→ warn (CWE-200) | SPRINGBOOT_CONFIG_FILES |
| fw_sboot_datasource_pool | warn | 配置含 datasource.url 但无 hikari.maximum-pool-size → warn (CWE-400) | SPRINGBOOT_CONFIG_FILES |

<!--
门禁 id 命名规范：fw_sboot_<rule>（rule 全小写下划线）。
本表 14 条 id 须在 assets/framework-gates/spring-boot.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_sboot_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: spring-boot  requires_conf: VAR1 VAR2` 声明。
fixture 验证覆盖：violating 含 @Transactional 同类自调用 + Actuator exposure.include=* + javax import → fail；compliant 全 pass。
规律4 与规律14 共享 fw_sboot_proxy_bean_methods，故 §3 规律数 15 而门禁数 14。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| spring-boot × mybatis | `@MapperScan` 须在 @SpringBootApplication 扫描范围内；mybatis.mapper-locations 须显式 | @SpringBootApplication 扫描范围不含 @MapperScan 包则 Mapper 不注册；starter 默认无 mapper-locations |
| spring-boot × spring-cloud | Spring Cloud release train 须与 Boot 版本矩阵对齐（2025.x ↔ Boot 4.0）| 版本不匹配导致 auto-config 冲突、Bean 装配失败 |
| spring-boot × spring-security | Security 7.x lambda DSL 须在 SecurityFilterChain Bean 中声明 | 废弃 WebSecurityConfigurerAdapter，须用 SecurityFilterChain + lambda DSL |
| spring-boot × lombok | @Data 与 @ConfigurationProperties 同用时排除 @ToString 防 secrets 泄露 | @ConfigurationProperties 含数据库口令等，@ToString 序列化泄露 |
| spring-boot × sharding | ShardingSphere DataSource 须替换默认 HikariCP Bean 或用 dynamic-datasource | 默认 HikariCP 自动配置会与 ShardingSphere DataSource Bean 冲突 |

<!--
无强交互的框架组合省略；本表聚焦 spring-boot 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Spring Boot 3.0 | javax→jakarta 全量迁移；最低 Java 17；移除 WebSecurityConfigurerAdapter 支持 | 残留 javax.* 启动失败；Security 配置须迁 lambda DSL |
| Spring Boot 2.6 | 默认禁止循环依赖（allow-circular-references=false） | 循环依赖启动期 BeanCurrentlyInCreationException |
| Spring Boot 3.2 | @ConfigurationPropertiesScan 支持；虚拟线程支持（预览） | 属性绑定推荐 @ConfigurationPropertiesScan |
| Spring Boot 3.4 | 结构化日志（structured logging）GA；HttpClient5 替换 Apache HttpClient | 日志格式变化；http 客户端迁移 |
| Spring Boot 4.0 | 基于 Spring Framework 7；jakarta 终态；待验证：是否上调 Java baseline 至 21 | 待验证：Java 21 baseline（未联网核实 release notes，规律按 Java 17+ 保守陈述）|
| Spring Boot 4.0 | 待验证：Actuator 端点默认暴露集合是否变化（未联网核实）| 待验证：规律 fw_sboot_actuator_expose 默认值假设，须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
