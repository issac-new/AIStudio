---
ruleset_id: jackson
适用版本: Jackson 2.18–2.23（com.fasterxml.jackson）/ Jackson 3.0.x（tools.jackson，GA 2025-10-03；差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/FasterXML/jackson/wiki/Jackson-Release-3.0 ；https://github.com/FasterXML/jackson-databind ；https://github.com/FasterXML/jackson-modules-java8 ；https://owasp.org/www-community/vulnerabilities/Deserialization_of_untrusted_data ；CVE-2017-7525）
深度门槛: 10
---

# Jackson 规则集

<!--
本规则集为 P2 框架规则集。
覆盖范围：Jackson 2.x（com.fasterxml.jackson，现行主线 2.23）+ Jackson 3.0（tools.jackson，2025-10-03 GA，最新补丁 3.0.4）。
调研时点：2026-07-17，已核对官方 wiki Jackson-Release-3.0：3.0 GA 已发布、Java 17 基线、groupId 改 tools.jackson、
JSR-310 支持内建进 databind（2.x 须单独注册 JavaTimeModule）、FAIL_ON_UNKNOWN_PROPERTIES 默认值翻转为 false、
ObjectMapper 改 Builder 不可变构造。jackson-annotations 仍停留 2.x 线（3.0 依赖 annotations 2.20）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.fasterxml.jackson.core:jackson-databind` / `com.fasterxml.jackson.module:jackson-module-parameter-names` / `com.fasterxml.jackson.datatype:jackson-datatype-jsr310` / `tools.jackson.core:jackson-databind`（3.x） | 高 |
| 注解 | `@JsonProperty` / `@JsonIgnore` / `@JsonFormat` / `@JsonTypeInfo` / `@JsonSubTypes` / `@JsonInclude` / `@JsonCreator` / `@JsonView` / `@JsonIgnoreProperties` | 高 |
| 文件 | `**/dto/**/*.java` 含 Jackson 注解 / `**/*ObjectMapper*.java` | 中（需组合注解信号） |
| 配置 | `spring.jackson.*`（serialization-inclusion / date-format / time-zone / default-property-inclusion） | 高 |
| 代码 | `new ObjectMapper(` / `JsonMapper.builder()` / `registerModule(new JavaTimeModule` / `ObjectMapper.readValue` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 jackson 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Jackson 注解使用点：`grep -rcE '@Json(Property|Ignore|Format|TypeInfo|SubTypes|Include|Creator|View|IgnoreProperties)\b' $(find … -name '*.java') | awk -F: '{s+=$2} END{print s+0}'`（计数核验基准：注解总命中数）
- ObjectMapper 实例化点：`grep -rnE 'new ObjectMapper\(|JsonMapper\.builder\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：实例化行数）
- JavaTimeModule 注册点：`grep -rnE 'JavaTimeModule|registerModule' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：注册行数）
- 多态类型点：`grep -rn '@JsonTypeInfo' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@JsonTypeInfo 出现行数）
- java.time 字段：`grep -rnE '\b(LocalDateTime|LocalDate|LocalTime|Instant|ZonedDateTime|OffsetDateTime)\s+[a-zA-Z_]' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：声明行数）
- 敏感字段：`grep -rniE '\b(private|protected)\s+String\s+(password|passwd|secret|apiKey|token)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：声明行数）
- 全局配置：`grep -rnE 'spring\.jackson\.' "${PROJECT_DIR}" --include='*.yml' --include='*.properties'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：JSR-310 时间类型在 Jackson 2.x 须注册 JavaTimeModule
- **适用版本**: Jackson 2.x 全版本（3.0 起 jsr310 支持内建进 databind，无需注册）
- **规律**: Jackson 2.x 的 `jackson-databind` 不含 `java.time` 序列化器，`LocalDateTime`/`Instant` 等字段必须 `mapper.registerModule(new JavaTimeModule())`（或 Spring Boot `spring-boot-starter-json` 自动注册）。3.0 起 JSR-310 与 ParameterNames、Optional 支持均内建。2.x 项目手写 `new ObjectMapper()` 而未注册模块时，序列化抛 `InvalidDefinitionException: Java 8 date/time type not supported`。
- **违反后果**: 运行期序列化 500；或回退为 bean 属性畸形 JSON。
- **验证方法**: 源码含 `LocalDateTime|LocalDate|Instant` 字段声明，但全项目无 `JavaTimeModule|registerModule|spring-boot-starter-json` 痕迹 → warn（确认是否 3.0 或 Spring 自动注册）。
- **对应门禁**: fw_jackson_jsr310(warn)

```verify
id: jackson-r1
cmd: 
expect: always
```

### 规律：密码/密钥字段须 @JsonIgnore 或 WRITE_ONLY
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: 实体/DTO 的 `password`/`secret`/`apiKey`/`token` 等敏感字段默认参与序列化——登录接口用 `@RequestBody` 绑定后若把同一对象回写响应，密文（甚至明文）外泄。接收侧需要、发送侧禁止的字段用 `@JsonProperty(access = JsonProperty.Access.WRITE_ONLY)`；完全不出 JSON 的用 `@JsonIgnore`。
- **违反后果**: 敏感信息泄露（CWE-200 / CWE-359），等同于 GitHub API token 泄露类事故。
- **验证方法**: 检出 `private|protected String password|passwd|secret|apiKey|token`（忽略大小写）声明行，同行或前 3 行无 `@JsonIgnore` / `WRITE_ONLY` → fail。
- **对应门禁**: fw_jackson_password(fail)

```verify
id: jackson-r2
cmd: 
expect: always
```

### 规律：@JsonTypeInfo 多态反序列化攻击面（CVE-2017-7525 类）
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: `@JsonTypeInfo(use = Id.CLASS | Id.MINIMAL_CLASS)` 把类名写进 JSON，反序列化时按客户端提交的类名实例化——等价于 `enableDefaultTyping`，即 CVE-2017-7525 系列 gadget 反序列化 RCE 根源。安全基线：(a) 禁止 `Id.CLASS/Id.MINIMAL_CLASS`，用 `Id.NAME` + `@JsonSubTypes` 白名单；(b) 必须声明 `defaultImpl` 兜住未知 type id，防止异常路径实例化意外类型。
- **违反后果**: 反序列化 RCE（CWE-502）；未知 type id 时行为不可预期。
- **验证方法**: 检出 `@JsonTypeInfo` 注解块：含 `Id.CLASS|Id.MINIMAL_CLASS` → fail；块内无 `defaultImpl` → fail（须配 @JsonSubTypes 白名单）。
- **对应门禁**: fw_jackson_polymorphic(fail)

```verify
id: jackson-r3
cmd: 
expect: always
```

### 规律：FAIL_ON_UNKNOWN_PROPERTIES 选型须显式
- **适用版本**: Jackson 2.x（默认 true）/ 3.x（默认 false，官方 wiki 已确认翻转）
- **规律**: 2.x 默认遇未知属性抛 `UnrecognizedPropertyException`——向前兼容差（对方加字段我方即 500）；3.0 起默认 false 静默忽略。跨版本迁移时该默认值翻转是隐形 breaking change。项目须显式二选一：API 边界建议 false + `@JsonIgnoreProperties(ignoreUnknown = true)` 兜底；严格契约场景保持 true 并写入测试。
- **违反后果**: 2.x→3.0 升级后未知字段从"报错"变"静默吞掉"，脏数据穿透；或 2.x 下上游加字段导致全线 500。
- **验证方法**: 项目含 Jackson 注解 DTO 但无 `FAIL_ON_UNKNOWN_PROPERTIES` 配置且无 `@JsonIgnoreProperties` → warn 提示显式选型。
- **对应门禁**: fw_jackson_unknown_props(warn)

```verify
id: jackson-r4
cmd: 
expect: always
```

### 规律：时间序列化格式须关闭 WRITE_DATES_AS_TIMESTAMPS 或显式格式
- **适用版本**: Jackson 2.x（默认开启 timestamps）/ 3.x（待验证：官方 wiki 未逐条列出该 Feature 默认值，沿用 2.x 认知）
- **规律**: `SerializationFeature.WRITE_DATES_AS_TIMESTAMPS` 默认 ON，`LocalDateTime` 序列化成 `[2026,7,17,10,30,0]` 数组或 epoch 数字。对外 API 须 `spring.jackson.serialization.write-dates-as-timestamps=false`（ISO-8601 字符串）或字段级 `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")`。
- **违反后果**: 前端/第三方解析数组型日期失败；跨端契约漂移。
- **验证方法**: 源码含 java.time 字段但无 `write-dates-as-timestamps=false` / `@JsonFormat` / `WRITE_DATES_AS_TIMESTAMPS` 配置 → warn。
- **对应门禁**: fw_jackson_dates_as_timestamps(warn)

```verify
id: jackson-r5
cmd: 
expect: always
```

### 规律：@JsonFormat pattern 须带时区/区域考虑
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: `@JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")` 解析 `Date`/`ZonedDateTime` 时未声明 `timezone` 按 JVM 默认时区——容器 UTC 与业务东八区差 8 小时。涉及时刻的 pattern 须 `timezone = "GMT+8"` 或全局 `spring.jackson.time-zone`。
- **违反后果**: 同一时刻不同副本解析结果漂移；定时任务边界错乱。
- **验证方法**: 检出 `@JsonFormat(pattern` 行不含 `timezone` → warn。
- **对应门禁**: fw_jackson_jsonformat_tz(warn)

```verify
id: jackson-r6
cmd: 
expect: always
```

### 规律：@JsonInclude(NON_NULL) 全局口径统一
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: null 字段默认输出 `"field": null`——响应体膨胀且前端须判空。口径须在全局（`spring.jackson.default-property-inclusion=non_null`）或类级 `@JsonInclude(JsonInclude.Include.NON_NULL)` 统一；禁止部分 DTO 加、部分不加造成同一 API 两种形态。
- **违反后果**: 契约不一致；前端空指针。
- **验证方法**: 项目含 Jackson DTO 但全项目无 `@JsonInclude` 且无 `default-property-inclusion` 配置 → warn 提示统一口径。
- **对应门禁**: fw_jackson_include_nonnull(warn)

```verify
id: jackson-r7
cmd: 
expect: always
```

### 规律：@JsonProperty 命名风格同类内一致
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: 同一类内 `@JsonProperty("user_name")`（snake_case）与 `@JsonProperty("userName")`（camelCase）混用会让 API 契约分裂。命名风格应全局统一——要么靠 `PropertyNamingStrategies.SNAKE_CASE` 集中生效，要么逐字段 @JsonProperty 但同一类内风格一致。
- **违反后果**: 同一响应两种命名风格，客户端建模失败。
- **验证方法**: 同一文件内同时检出 snake_case（含 `_`）与 camelCase（小写后接大写）@JsonProperty 值 → warn。
- **对应门禁**: fw_jackson_property_naming(warn)

```verify
id: jackson-r8
cmd: 
expect: always
```

### 规律：@JsonCreator 构造器参数须 @JsonProperty 或 -parameters 编译
- **适用版本**: Jackson 2.x / 3.x 全版本（3.0 起 ParameterNames 模块内建，但仍依赖 `-parameters` 编译产物）
- **规律**: `@JsonCreator` 构造器/工厂方法的参数名在默认编译下被擦除（arg0/arg1），Jackson 无法按名绑定。须逐参数 `@JsonProperty("name")` 显式声明，或编译加 `-parameters` + 注册 ParameterNamesModule（2.x）/ 内建（3.0）。不可变 DTO（record 除外）走构造器绑定时此为高发坑。
- **违反后果**: 反序列化全 null 或 `MismatchedInputException`。
- **验证方法**: 检出 `@JsonCreator` 后参数列表行（同行或后 3 行内）无 `@JsonProperty` → warn。
- **对应门禁**: fw_jackson_creator(warn)

```verify
id: jackson-r9
cmd: 
expect: always
```

### 规律：金额字段禁止 double/float 序列化
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: `double`/`float` 金额字段序列化输出二进制浮点（0.1+0.2 问题），反序列化同理失真。金额/比率/价格字段须 `BigDecimal`（必要时配合 `@JsonFormat(shape = STRING)` 防 JS 侧精度丢失）；Jackson 侧 `DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS` 可全局兜底。
- **违反后果**: 金额精度失真（CWE-681 数值转换错误），对账差分。
- **验证方法**: 检出 `(price|amount|money|fee|cost|total)` 命名的 `double|float|Double|Float` 字段 → warn。
- **对应门禁**: fw_jackson_bigdecimal(warn)

```verify
id: jackson-r10
cmd: 
expect: always
```

### 规律：ObjectMapper 线程安全须单例复用
- **适用版本**: Jackson 2.x（配置完成后线程安全）/ 3.x（Builder 不可变，天然线程安全）
- **规律**: `ObjectMapper` 配置完成后线程安全且构造成本高（序列化器缓存预热），应作为单例/Spring Bean 复用；每请求 `new ObjectMapper()` 是性能反模式（且易漏注册模块）。注意：复用前提是配置完成后不再调用 `configure()`/`registerModule()` 改状态。
- **违反后果**: 每请求重建 → 序列化器缓存失效 CPU 飙升；并发下配置中被改 → 行为随机。
- **验证方法**: `new ObjectMapper(` 出现在 ≥2 个不同文件 → warn 确认有单例封装。
- **对应门禁**: fw_jackson_mapper_singleton(warn)

```verify
id: jackson-r11
cmd: 
expect: always
```

### 规律：@JsonView 视图泄漏面须复核
- **适用版本**: Jackson 2.x / 3.x 全版本
- **规律**: `@JsonView` 依赖 Controller 返回类型标注视图类驱动序列化；`DEFAULT_VIEW_INCLUSION` 默认 ON（2.x），未标注视图的字段在**任何**视图下都输出——误以为"没标就不出"会泄漏内部字段。视图继承层级（Public extends Internal）方向写反同理泄漏。
- **违反后果**: 内部字段经公开接口外泄（CWE-200）。
- **验证方法**: 检出 `@JsonView` 使用 → warn 人工复核 DEFAULT_VIEW_INCLUSION 与视图继承方向。
- **对应门禁**: fw_jackson_jsonview(warn)

```verify
id: jackson-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_jackson_jsr310 | warn | 有 java.time 字段但无 JavaTimeModule/registerModule 痕迹 → warn（3.0/Spring 自动注册须人工确认） | JACKSON_SRC_GLOBS | — |
| fw_jackson_password | fail | String password/secret/apiKey/token 字段同行+前 3 行无 @JsonIgnore/WRITE_ONLY → fail | JACKSON_SRC_GLOBS | CWE-200/CWE-359；GB/T 34944-2017 |
| fw_jackson_polymorphic | fail | @JsonTypeInfo 块含 Id.CLASS/Id.MINIMAL_CLASS 或缺 defaultImpl → fail（CVE-2017-7525 类） | JACKSON_SRC_GLOBS | CWE-502（CVE-2017-7525）；GB/T 34944-2017 |
| fw_jackson_unknown_props | warn | 有 Jackson DTO 但无 FAIL_ON_UNKNOWN_PROPERTIES 配置且无 @JsonIgnoreProperties → warn 显式选型 | JACKSON_SRC_GLOBS | — |
| fw_jackson_dates_as_timestamps | warn | 有 java.time 字段但无 timestamps 关闭/JsonFormat 痕迹 → warn | JACKSON_SRC_GLOBS | — |
| fw_jackson_jsonformat_tz | warn | @JsonFormat(pattern) 行无 timezone → warn | JACKSON_SRC_GLOBS | — |
| fw_jackson_include_nonnull | warn | 有 Jackson DTO 但全项目无 @JsonInclude/default-property-inclusion → warn 统一口径 | JACKSON_SRC_GLOBS | — |
| fw_jackson_property_naming | warn | 同类内 snake_case 与 camelCase @JsonProperty 混用 → warn | JACKSON_SRC_GLOBS | — |
| fw_jackson_creator | warn | @JsonCreator 参数列表无 @JsonProperty → warn（参数名擦除） | JACKSON_SRC_GLOBS | — |
| fw_jackson_bigdecimal | warn | price/amount/money/fee/cost/total 命名的 double/float 字段 → warn 改 BigDecimal | JACKSON_SRC_GLOBS | CWE-681；GB/T 34944-2017 |
| fw_jackson_mapper_singleton | warn | new ObjectMapper() 出现在 ≥2 文件 → warn 单例复用 | JACKSON_SRC_GLOBS | — |
| fw_jackson_jsonview | warn | 检出 @JsonView → warn 复核 DEFAULT_VIEW_INCLUSION 与继承方向 | JACKSON_SRC_GLOBS | CWE-200；GB/T 34944-2017 |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_jackson_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/jackson.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_jackson_<rule>(fail|warn) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: jackson  requires_conf: JACKSON_SRC_GLOBS` 声明。
fixture 验证只覆盖 password + polymorphic（violating→fail），compliant 全 pass。
JACKSON_SRC_GLOBS 为空数组时所有门禁守卫跳过（pass），不误判。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| jackson × validation | 反序列化（Jackson）只做类型绑定，业务约束交 validation 层；禁止用 `@JsonCreator(required=true)` 当"必填"双重标准 | required=true 仅构造器绑定路径生效且报 MismatchedInputException（非 400 语义），与 @NotNull 口径漂移 |
| jackson × lombok | `@Data` 的 toString 含敏感字段；配合密码字段须 `@ToString(exclude="password")` 或字段级 `@ToString.Exclude` | @JsonIgnore 只挡 JSON 序列化，日志里 `log.info("{}", user)` 照样打印密码 |
| jackson × spring-data-jpa | JPA 实体懒加载关联序列化触发 N+1/懒加载异常；实体不可直接回 JSON，须 DTO 隔离或 `@JsonIgnore` 关联字段 | Open Session 关闭后序列化代理对象抛 LazyInitializationException；双向关联还会无限递归（StackOverflow） |
| jackson × spring-boot | 全局口径统一走 `spring.jackson.*` 配置而非自建 ObjectMapper Bean 覆盖——自建 Bean 会顶掉 Boot 自动配置 | Spring Boot 的 Jackson2ObjectMapperBuilder 已聚合模块注册/命名策略/时区，自建 Bean 后模块漏注册全线退化 |

<!--
无强交互的框架组合省略；本表聚焦 jackson 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| jackson-databind 2.10+ | 持续收紧 default typing 黑名单（CVE-2017-7525 系列后续 CVE 修复） | 任何形式的 default typing / Id.CLASS 都是高危面，本规则集 fw_jackson_polymorphic 适用 |
| jackson-databind 2.17 | 依赖 jackson-annotations 2.17；继续废弃 default typing API | enableDefaultTyping 全系列已废弃，勿用 |
| jackson-databind 2.18–2.23 | 2.x 现行主线（2.23 为调研时点最新线） | 规律基于 2.x 通用项；升级走 minor 兼容 |
| Jackson 3.0 | GA 2025-10-03；groupId/包名改 tools.jackson；Java 17 基线；JSR-310/ParameterNames/Optional 内建进 databind；FAIL_ON_UNKNOWN_PROPERTIES 默认翻转为 false；ObjectMapper 改 Builder 不可变构造；checked exception 改 unchecked（JacksonException）；格式自动探测移除 | 2.x→3.0 为包名级迁移（jackson-annotations 例外，仍 2.x）；未知属性行为翻转须显式选型（fw_jackson_unknown_props）；JavaTimeModule 不再需注册（fw_jackson_jsr310 仅 2.x 适用） |
| Jackson 3.0.1–3.0.4 | 补丁线（3.0.4 为 2026-01-21）；3.0 分支已随 3.1.0 发布关闭补丁 | 3.0 非 LTS，生产建议跟进 3.1（待验证：3.1 变更清单未逐条核实） |
| Spring Boot 4.x | Spring 宣布支持 Jackson 3（spring.jackson 配置体系沿用） | Boot 3.x 默认仍 Jackson 2.x；混用 2/3 在同一 classpath 时注解包名不同（annotations 共用 2.x），排错注意 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
