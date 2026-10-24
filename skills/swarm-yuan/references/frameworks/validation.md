---
ruleset_id: validation
适用版本: Jakarta Validation 3.1 / Hibernate Validator 9.0–9.1（Jakarta EE 11，Java 17+）/ Spring Boot 3.x–4.x @Validated（差异单独标注）
最后调研: 2026-07-17（来源：https://hibernate.org/validator/releases/ ；https://docs.jboss.org/hibernate/stable/validator/reference/en-US/html_single/ ；https://jakarta.ee/specifications/bean-validation/3.1/jakarta-validation-spec-3.1 ；https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html）
深度门槛: 10
---

# Validation（Jakarta Validation / Hibernate Validator）规则集

<!--
本规则集为 P2 框架规则集。
覆盖范围：Jakarta Validation 3.1 API（jakarta.validation.*）+ Hibernate Validator 9.0/9.1 实现 + Spring @Validated 集成。
调研时点：2026-07-17，已核对 hibernate.org/validator/releases：9.1 为最新 stable（2026-07-06），9.0（2025-06-13）起
进入 limited-support；两者均实现 Jakarta Validation 3.1、目标 Jakarta EE 11、Java 17 基线。
9.1 "introduces new constraints"（具体新约束清单未逐条核实，标"待验证"），不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.hibernate.validator:hibernate-validator` / `org.springframework.boot:spring-boot-starter-validation` / `jakarta.validation:jakarta.validation-api` | 高 |
| 注解 | `@NotNull` / `@NotBlank` / `@NotEmpty` / `@Size` / `@Pattern` / `@Email` / `@Valid` / `@Validated` / `@GroupSequence` / `@DecimalMin` / `@DecimalMax` / `@Future` / `@Past` | 高 |
| 文件 | `**/dto/**/*.java` 中含约束注解 / `**/*Validator.java` 实现 `ConstraintValidator` | 中（需组合注解信号） |
| 配置 | `spring.mvc.problemdetails.enabled` / `validation` 相关 `MessageSource` bean | 低（仅辅助） |
| 代码 | `implements ConstraintValidator<` / `extends AbstractAssert`（误用排除） / `MethodArgumentNotValidException` / `HandlerMethodValidationException` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 validation 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 约束注解使用点：`grep -rcE '@(NotNull|NotBlank|NotEmpty|Size|Pattern|Email|Min|Max|DecimalMin|DecimalMax|Future|Past|Positive|Negative)\b' $(find ${VALIDATION_SRC_DIRS[@]+"${VALIDATION_SRC_DIRS[@]}"} -name '*.java') | awk -F: '{s+=$2} END{print s+0}'`（计数核验基准：约束注解总命中数）
- 自定义 ConstraintValidator：`grep -rlE 'implements ConstraintValidator<' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含该行的 .java 文件数）
- 自定义约束注解：`grep -rlE '@Constraint\(validatedBy' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @Constraint 元注解的 .java 文件数）
- 级联校验点：`grep -rn '@Valid\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@Valid 出现行数）
- 分组序列：`grep -rn '@GroupSequence\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@GroupSequence 出现行数）
- 分组定义：`grep -rnE 'groups\s*=' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：groups= 出现行数）
- 统一异常处理：`grep -rlE '@(RestControllerAdvice|ControllerAdvice)' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：嵌套对象字段须 @Valid 级联校验
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: 规范明确：引用类型字段（嵌套 DTO/值对象）只有标注 `@Valid` 才会级联校验其内部约束；未标注时嵌套对象上的 `@NotBlank` 等约束静默失效。Spring MVC 中 `@RequestBody @Valid` 仅校验首层，嵌套层必须各自 `@Valid`。
- **违反后果**: 嵌套对象约束被跳过，脏数据穿透到业务层（CWE-20 输入验证不当）。
- **验证方法**: 对字段行匹配 `private|protected` + 自定义大写开头类型（`*DTO/*Dto/*Form/*Request/*VO/*Item` 后缀），检查同行或前 3 行是否出现 `@Valid`；缺失即违规候选。
- **对应门禁**: fw_validation_cascade(warn)

```verify
id: validation-r1
cmd: 
expect: always
```

### 规律：分组序列 @GroupSequence 顺序即短路语义
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: `@GroupSequence({BasicChecks.class, AdvancedChecks.class})` 按声明顺序逐组校验，前一组有违例即短路不再执行后续组。与 `@Validated(GroupA.class)` 按需分组不同，序列内 Default 组若出现必须放首位或改用接口重定义默认组，否则抛 `GroupDefinitionException`。
- **违反后果**: 校验顺序错乱导致"昂贵校验先于廉价校验执行"或分组遗漏；`GroupDefinitionException` 启动/运行期异常。
- **验证方法**: `grep -rn '@GroupSequence'` 命中即提示人工确认组顺序与 Default 组位置。
- **对应门禁**: fw_validation_groupsequence(warn)

```verify
id: validation-r2
cmd: grep -rn '@GroupSequence' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：自定义 ConstraintValidator 必须线程安全（单例复用）
- **适用版本**: Hibernate Validator 6.x–9.x 全版本（官方 reference "The ConstraintValidator instance is shared and must be thread-safe" 语义）
- **规律**: 每个约束注解对应的 `ConstraintValidator` 实例由 ValidatorFactory 缓存复用、多线程并发调用 `isValid()`。实现类禁止声明可变实例字段（如 `private int count;` 做跨调用状态）；仅允许 `static final` 常量或 `initialize()` 赋值的不可变配置（且 initialize 后不再写）。
- **违反后果**: 并发校验下状态串扰，校验结果随机错误；难以复现（CWE-362 竞态条件）。
- **验证方法**: 检出 `implements ConstraintValidator<` 的类，扫描其 `private|protected` 实例字段（排除含 `static` 或 `final` 的行），命中即可变状态，fail。
- **对应门禁**: fw_validation_validator_threadsafe(fail)

```verify
id: validation-r3
cmd: 
expect: always
```

### 规律：@Validated 类级 vs 方法级语义不同
- **适用版本**: Spring Framework 5.x–7.x（spring-context @Validated）
- **规律**: Spring `@Validated` 是 `jakarta.validation.Validated` 的变体支持 groups。标注在**类上**（Spring Bean）时开启**方法级校验**（MethodValidationInterceptor，对全部 public 方法的参数/返回值按 groups 校验）；标注在 `@RequestMapping` **方法参数上**时仅对触发该参数的校验解析。类级带 groups 会影响该 Bean 所有 public 方法——服务类上滥用会导致内部调用也被拦截。
- **违反后果**: 分组意外作用于全部方法 → 内部调用校验失败抛 `ConstraintViolationException`；或误以为参数级 @Validated(groups) 生效而实际未拦截。
- **验证方法**: `grep -rn '@Validated('`（带分组参数）命中即提示人工确认标注位置是类级还是参数级。
- **对应门禁**: fw_validation_validated_scope(warn)

```verify
id: validation-r4
cmd: grep -rn '@Validated(' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：String 字段非空校验用 @NotBlank，不用 @NotNull
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: `@NotNull` 仅拒绝 null，空串 `""` 与全空白 `"   "` 均通过；`@NotEmpty` 拒绝 null 与空串但放行空白串；`@NotBlank` 拒绝 null/空串/空白串（`CharSequence#chars` 全非空白判定）。字符串业务字段（姓名/标题/编码）几乎总要 `@NotBlank`（可叠加 `@Size` 控长度）；`@NotNull` 留给非字符串引用类型（Long/Integer/枚举/嵌套对象）。
- **违反后果**: `""` 或 `"   "` 穿透进库，唯一索引冲突 / 展示乱码 / 下游 trim 后空指针。
- **验证方法**: 检出 `@NotNull` 后 3 行内（或同行）声明 `String` 字段的位置，命中即 fail（选型错误）。
- **对应门禁**: fw_validation_notnull_notblank(fail)

```verify
id: validation-r5
cmd: 
expect: always
```

### 规律：@Size 与 @Column(length=) 分层一致
- **适用版本**: Jakarta Validation 3.x + JPA 3.x（jakarta.persistence）
- **规律**: `@Column(length=64)` 是 DDL 层约束（建表 VARCHAR(64)），运行期 INSERT 超长由 DB 抛 `Data truncation`；`@Size(max=64)` 是入口层校验，在 HTTP 边界即拦截。两层须同时声明且数值一致——只有 @Column 没有 @Size 时，超长值直达 DB 报错而不是 400。
- **违反后果**: 超长输入触发 500（DB 异常）而非 400（校验失败）；错误信息泄露 SQL 细节。
- **验证方法**: 检出含 `@Column(length` 的实体文件内无 `@Size` 出现 → warn 提示补入口层校验并核对数值一致。
- **对应门禁**: fw_validation_size_column(warn)

```verify
id: validation-r6
cmd: 
expect: always
```

### 规律：@Pattern 正则须防 ReDoS
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: `@Pattern(regexp=...)` 直接编译进 `java.util.regex.Pattern`，Java 正则引擎为回溯型。嵌套量词（`(a+)+`、`(.*)*`、`(x|y)+z` 类歧义交替）对恶意输入呈指数回溯。用户可控字段的 regexp 禁止嵌套量词；复杂规则改自定义 ConstraintValidator 内做长度预检 + 分步匹配。
- **违反后果**: 正则 DoS（CWE-1333 / CWE-400），单请求打满 CPU。
- **验证方法**: `grep -rn '@Pattern'` 行内检出 `+)+` / `*)+` / `+)*` / `*)*` 嵌套量词形态 → warn 人工复核回溯风险。
- **对应门禁**: fw_validation_pattern_redos(warn)

```verify
id: validation-r7
cmd: grep -rn '@Pattern' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Email 默认宽松度须知晓
- **适用版本**: Hibernate Validator 8.x–9.x（@Email 为 HV 专有约束，非规范内）
- **规律**: `@Email` 默认 regexp 宽松——允许 `a@b`（无 TLD）、本地部分特殊字符等，仅排除明显非法形态。注册/通知等场景须叠加 `@Pattern` 收紧或 `@Email(regexp=..., flags=...)`；并且 @Email 放行空串与 null（须与 @NotBlank 组合）。
- **违反后果**: 伪邮箱入库，邮件通道投递失败 / 账号找回被劫持到 `a@b` 类无效地址。
- **验证方法**: 检出无 `regexp` 属性的裸 `@Email` → warn 提示确认宽松度是否可接受。
- **对应门禁**: fw_validation_email_lax(warn)

```verify
id: validation-r8
cmd: 
expect: always
```

### 规律：@Future/@Past 系时区与时钟源
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: `@Future/@FutureOrPresent/@Past/@PastOrPresent` 以**校验执行时刻的 JVM 默认时区 Clock** 比较；`LocalDate` 无时刻信息，`@Future` 对"今天"判定依赖 JVM 默认时区，容器 UTC 与业务东八区差 8 小时会错判。分布式多副本时钟漂移亦影响秒级边界。对时区敏感场景实现 `ClockProvider` 注入业务时钟。
- **违反后果**: 边界时刻校验结果随部署时区漂移；"今天到期"判断在 UTC 容器内错误。
- **验证方法**: 检出 `@Future|@FutureOrPresent|@Past|@PastOrPresent` 使用 → warn 提示确认 JVM 时区与 ClockProvider。
- **对应门禁**: fw_validation_temporal_tz(warn)

```verify
id: validation-r9
cmd: 
expect: always
```

### 规律：@DecimalMin/@DecimalMax 目标字段须 BigDecimal
- **适用版本**: Jakarta Validation 3.x / Hibernate Validator 8.x–9.x 全版本
- **规律**: `@DecimalMin("0.01")` 在 `double/float/Double/Float` 字段上按二进制浮点比较，`0.1+0.2=0.30000000000000004` 类误差使边界值（如恰好等于 min）判定不稳定。金额/比率字段必须 `BigDecimal`（规范对 BigDecimal/BigInteger/CharSequence/long/int 有精确语义）；double 字段上的十进制边界校验属选型错误。
- **违反后果**: 边界金额误拒/误放；财务对账分差。
- **验证方法**: 检出 `@DecimalMin|@DecimalMax` 后 3 行内（或同行）声明 `double|float|Double|Float` 字段 → warn 改 BigDecimal。
- **对应门禁**: fw_validation_decimal_bigdecimal(warn)

```verify
id: validation-r10
cmd: 
expect: always
```

### 规律：嵌套集合元素校验用容器元素约束 List<@Valid Item>
- **适用版本**: Jakarta Validation 2.0+（容器元素约束）/ Hibernate Validator 6.x–9.x
- **规律**: 自 Bean Validation 2.0 起支持容器元素约束：`List<@NotBlank String>`、`List<@Valid ItemDTO>`。仅字段级 `@Valid`（`@Valid private List<ItemDTO> items;`）在 HV 中也能级联，但**元素本身的约束**（如 `@NotBlank String`）只能写在类型参数位置；`@Valid` 同时标注字段与类型参数位置是推荐写法，防止某些路径（如方法返回值容器）漏级联。
- **违反后果**: 集合内元素约束静默跳过，非法元素穿透。
- **验证方法**: 检出 `private|protected` + `List<|Set<|Collection<|Map<` + 自定义大写类型，且行内与前置 3 行均无 `@Valid`（类型参数位也无）→ warn。
- **对应门禁**: fw_validation_nested_collection(warn)

```verify
id: validation-r11
cmd: 
expect: always
```

### 规律：校验失败须统一异常处理 @ControllerAdvice
- **适用版本**: Spring MVC 5.x–7.x / Spring Boot 3.x–4.x
- **规律**: `MethodArgumentNotValidException`（@RequestBody 校验失败）、`HandlerMethodValidationException`（Spring 6.1+ 方法校验）、`ConstraintViolationException`（服务层方法校验）须由 `@RestControllerAdvice` 统一转换为 400 + 字段级错误明细（建议 RFC 7807 ProblemDetail）。缺省时 Spring 默认错误体无字段定位信息，且 ConstraintViolationException 会冒泡成 500。
- **违反后果**: 客户端拿不到字段级错误；服务层校验失败变 500 泄露内部信息。
- **验证方法**: 项目存在约束注解使用但无 `@RestControllerAdvice|@ControllerAdvice` 类处理上述三类异常 → warn。
- **对应门禁**: fw_validation_advice(warn)

```verify
id: validation-r12
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
| fw_validation_cascade | warn | 自定义类型（*DTO/*Form/*Request/*VO/*Item 后缀）字段同行+前 3 行无 @Valid → warn | VALIDATION_SRC_GLOBS | CWE-20；GB/T 34944-2017 |
| fw_validation_groupsequence | warn | 存在 @GroupSequence 即提示人工确认组顺序与 Default 组位置 | VALIDATION_SRC_GLOBS | — |
| fw_validation_validator_threadsafe | fail | ConstraintValidator 实现类含非 static/final 实例字段 → fail（单例复用须无状态） | VALIDATION_SRC_GLOBS | CWE-362；GB/T 34944-2017 |
| fw_validation_validated_scope | warn | @Validated(…) 带分组命中 → warn 确认类级/参数级语义 | VALIDATION_SRC_GLOBS | — |
| fw_validation_notnull_notblank | fail | @NotNull 同行或后 3 行内声明 String 字段 → fail（应 @NotBlank） | VALIDATION_SRC_GLOBS | — |
| fw_validation_size_column | warn | 含 @Column(length=) 的实体文件无 @Size → warn 分层一致 | VALIDATION_SRC_GLOBS | — |
| fw_validation_pattern_redos | warn | @Pattern 行检出嵌套量词（+)+ 等）→ warn ReDoS 复核 | VALIDATION_SRC_GLOBS | CWE-1333/CWE-400；GB/T 34944-2017 |
| fw_validation_email_lax | warn | 裸 @Email（无 regexp 属性）→ warn 确认宽松度 | VALIDATION_SRC_GLOBS | — |
| fw_validation_temporal_tz | warn | @Future/@Past 系使用 → warn 确认 JVM 时区/ClockProvider | VALIDATION_SRC_GLOBS | — |
| fw_validation_decimal_bigdecimal | warn | @DecimalMin/@DecimalMax 作用于 double/float 字段 → warn 改 BigDecimal | VALIDATION_SRC_GLOBS | — |
| fw_validation_nested_collection | warn | List/Set/Collection/Map<自定义类型> 字段行内+前 3 行无 @Valid → warn | VALIDATION_SRC_GLOBS | — |
| fw_validation_advice | warn | 有约束注解使用但无 Advice 类处理校验异常 → warn | VALIDATION_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_validation_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/validation.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_validation_<rule>(fail|warn) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: validation  requires_conf: VALIDATION_SRC_GLOBS` 声明。
fixture 验证只覆盖 notnull_notblank + validator_threadsafe（violating→fail），compliant 全 pass。
VALIDATION_SRC_GLOBS 为空数组时所有门禁守卫跳过（pass），不误判。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| validation × spring-data-jpa | 实体 `@Column(length=n)` 与入口 DTO `@Size(max=n)` 数值须一致；实体本身不重复声明入口约束（JPA 实体校验由 pre-persist 事件触发，属最后防线） | 双层语义不同：@Size 拦在 HTTP 边界返 400，@Column 仅 DDL；不一致时 400/500 行为分裂 |
| validation × spring-boot | `spring-boot-starter-validation` 须显式引入（2.3+ 起不再随 web starter 传递）；方法级校验要求类上 `@Validated` | 缺 starter 时所有约束注解静默无效——无 Bean Validator 在 classpath，Spring 不装配 LocalValidatorFactoryBean |
| validation × jackson | 反序列化层（Jackson）只负责类型转换，业务约束交给 validation 层；不要为"必填"在 Jackson 侧用 `required=true` 与 @NotNull 双重标准 | `JsonCreator(required=true)` 仅对构造器绑定生效且报 MismatchedInputException（非 400 语义），两套必填口径会漂移 |
| validation × lombok | `@Data`/`@Builder` 类上约束注解照常生效；但 `@NonNull`（lombok）与 `@NotNull`（jakarta）不可混用——lombok 生成的是运行期 NPE 检查 | lombok @NonNull 在构造/setter 抛 NPE（500 语义），jakarta @NotNull 走校验体系（400 语义），混用导致错误响应不一致 |

<!--
无强交互的框架组合省略；本表聚焦 validation 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Jakarta Validation 3.0 | 包名 javax.validation → jakarta.validation | 混依赖（javax 与 jakarta 并存）时约束静默失效——注解对不上实现 |
| Jakarta Validation 3.1 | Jakarta EE 11 组件升级；记录（record）组件内建约束支持澄清 | record 组件约束走构造器参数注解位，生成代码注意注解位置 |
| Hibernate Validator 8.0 | Jakarta EE 10 基线，Java 11+ | 旧 javax 项目须整体迁移 jakarta 命名空间 |
| Hibernate Validator 9.0 | Jakarta EE 11 / Java 17 基线；新增 @KorRRN、@BitcoinAddress 约束；移除 Security Manager 支持；引入 BOM | Java 11 项目不可升级 9.x；新约束可用但注意非规范内（HV 专有） |
| Hibernate Validator 9.1 | 最新 stable（2026-07-06）：性能改进、新约束（待验证：具体新约束清单未逐条核实 release notes）、文档主题更新、依赖升级 | 升级前人工核实 9.1 release notes；本规则集规律基于 3.1 规范通用项，不受 9.1 新增影响 |
| Spring Framework 6.1 | 新增 HandlerMethodValidationException（方法校验失败专用异常） | @ControllerAdvice 须同时处理 MethodArgumentNotValidException 与 HandlerMethodValidationException 两类 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
