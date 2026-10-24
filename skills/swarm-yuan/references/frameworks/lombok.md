---
ruleset_id: lombok
适用版本: lombok 1.18.24–1.18.46（差异单独标注；1.18.28 起支持 jakarta.annotation.Nonnull，1.18.40 起 @Jacksonized+@Accessors 联动并默认不再自动 copy Jackson 注解，1.18.44 起 @Jacksonized 双支持 Jackson2/3）
最后调研: 2026-07-17（来源：https://projectlombok.org/changelog ；https://projectlombok.org/features/Builder ；https://projectlombok.org/features/experimental/Jacksonized ；https://projectlombok.org/features/Log ；https://projectlombok.org/features/EqualsAndHashCode ；https://projectlombok.org/features/NonNull ；https://projectlombok.org/features/SneakyThrows ；https://projectlombok.org/features/Cleanup ；https://projectlombok.org/features/GetterLazy ；https://projectlombok.org/features/constructor ；https://projectlombok.org/features/Value ；https://projectlombok.org/features/val ；https://projectlombok.org/features/configuration ；https://projectlombok.org/features/delombok ；https://mapstruct.org/documentation/stable/reference/html/#lombok ；https://github.com/projectlombok/lombok/issues/1538）
深度门槛: 12
---

# Lombok 规则集

<!--
本规则集为 P1 第二批框架规则集，结构与 mybatis 规则集对齐（六节式）。
覆盖范围：Project Lombok 1.18.x（现行最新 1.18.46，2026-04-22 发布）。
调研时点：2026-07-17，已核对 lombok 官方 changelog 至 1.18.46；1.18.40 的 @Jacksonized/@Accessors 联动与默认不再 copy Jackson 注解为破坏性变更，已落入 §6。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.projectlombok:lombok` / `org.projectlombok:lombok-mapstruct-binding` | 高 |
| 注解 | `@Data` / `@Getter` / `@Setter` / `@Builder` / `@Jacksonized` / `@AllArgsConstructor` / `@NoArgsConstructor` / `@RequiredArgsConstructor` / `@Slf4j` / `@Log` / `@SneakyThrows` / `@Cleanup` / `@NonNull` / `@Value` / `@EqualsAndHashCode` / `val` / `var` | 高 |
| 配置 | `lombok.config`（含 `config.stopBubbling` / `lombok.log.fieldName` / `lombok.copyJacksonAnnotationsToAccessors` / `lombok.anyConstructor.addConstructorProperties` 等 key） | 高 |
| 代码 | `import lombok.` / `import lombok.experimental.` / `@Jacksonized` / `@SuperBuilder` / `@Accessors` / `@Locked` | 高 |
| 工具 | `java -jar lombok.jar delombok` / `lombok-maven-plugin` / `org.mapstruct:mapstruct-processor` 与 `lombok` 同 module 路径 | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 lombok 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- lombok 注解文件：`grep -rlE '@(Data|Getter|Setter|Builder|Jacksonized|AllArgsConstructor|NoArgsConstructor|RequiredArgsConstructor|Slf4j|SneakyThrows|Cleanup|NonNull|Value|EqualsAndHashCode|SuperBuilder|Accessors|Locked)\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 lombok 类注解的 .java 文件数 = `grep -l … | wc -l`）
- lombok import：`grep -rlE '^import lombok\.' "${PROJECT_DIR}" --include='*.java'`
- val/var 用法：`grep -rnE '\b(val|var)\s+[a-zA-Z_]' "${PROJECT_DIR}" --include='*.java'`
- @Slf4j/@Log 用法：`grep -rlE '@(Slf4j|Log|Log4j|Log4j2|CommonsLog|XSlf4j|JBossLog|CustomLog)\b' "${PROJECT_DIR}" --include='*.java'`
- @SneakyThrows 用法：`grep -rnE '@SneakyThrows' "${PROJECT_DIR}" --include='*.java'`
- @Cleanup 用法：`grep -rnE '@Cleanup' "${PROJECT_DIR}" --include='*.java'`
- @Builder 用法：`grep -rlE '@(Builder|SuperBuilder)\b' "${PROJECT_DIR}" --include='*.java'`
- @Getter(lazy=true)：`grep -rnE '@Getter\s*\([^)]*lazy\s*=\s*true' "${PROJECT_DIR}" --include='*.java'`
- @EqualsAndHashCode：`grep -rnE '@EqualsAndHashCode' "${PROJECT_DIR}" --include='*.java'`
- lombok.config 文件：`find "${PROJECT_DIR}" -type f -name 'lombok.config' -not -path '*/target/*'`
- delombok 调用：`grep -rnE 'lombok\.jar\s+delombok|lombok-maven-plugin|delombok' "${PROJECT_DIR}" --include='pom.xml' --include='build.gradle*' --include='*.sh'`
- MapStruct + lombok 共存：`grep -rlE 'org\.mapstruct:mapstruct' "${PROJECT_DIR}" --include='pom.xml' --include='build.gradle*'` 与 `org.projectlombok:lombok` 同项目

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：JPA @Entity 上禁用 @Data，改用 @Getter @Setter 或排除懒加载字段
- **适用版本**: lombok 1.18.x 全版本
- **规律**: `@Data` 等价于 `@Getter @Setter @RequiredArgsConstructor @ToString @EqualsAndHashCode`，会对**所有非静态非 transient 字段**生成 `toString/equals/hashCode`。在 JPA `@Entity` 上，`@OneToMany`/`@ManyToOne` 等懒加载关联字段一旦进入 `toString/equals`，会在事务外调用时触发 `LazyInitializationException` 或 N+1 查询；双向关联两侧都标 `@Data` 时 `toString/equals` 互相调用，导致 `StackOverflowError`。实体类应改用 `@Getter @Setter`，按需补 `@ToString(exclude=...)`/`@EqualsAndHashCode(of={"id"})`，或字段级 `@ToString.Exclude`/`@EqualsAndHashCode.Exclude`。
- **违反后果**: `LazyInitializationException` / N+1 查询风暴 / 双向关联 `StackOverflowError`。
- **验证方法**: 在 `LOMBOK_SRC_GLOBS` 范围内 `grep -lE '@Entity\b' *.java` 取出实体文件，再对每个实体文件 `grep -E '@Data\b'` 命中即 fail。
- **对应门禁**: fw_lombok_data_jpa(fail)

```verify
id: lombok-r1
cmd: grep -lE '@Entity\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Slf4j 与手写 LoggerFactory.getLogger 不可同文件共存
- **适用版本**: lombok 1.18.x 全版本（`@Slf4j` 默认生成 `private static final Logger log = LoggerFactory.getLogger(当前类.class)`；`lombok.log.fieldName` 默认 `log`）
- **规律**: `@Slf4j` 已经生成名为 `log` 的静态 Logger 字段；若同文件再手写 `private static final Logger log = LoggerFactory.getLogger(...)` 或 `LoggerFactory.getLogger` 赋值给其他字段，会导致 (a) 字段重复声明编译错，或 (b) 第二个 Logger 实例绕过统一日志口径，日志名/级别不一致。二选一：要么 `@Slf4j` + 直接用 `log`，要么全手写不挂 `@Slf4j`。如需自定义 topic，用 `@Slf4j(topic="...")`。
- **违反后果**: 编译错 `variable log is already defined` 或双 Logger 实例导致日志口径分裂。
- **验证方法**: `grep -lE '@Slf4j\b' *.java` 取文件，对这些文件再 `grep -E 'LoggerFactory\.getLogger'` 命中即 fail。
- **对应门禁**: fw_lombok_slf4j_dup(fail)

```verify
id: lombok-r2
cmd: grep -lE '@Slf4j\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Builder 用于 Jackson 反序列化须配 @Jacksonized 或 @NoArgsConstructor + @AllArgsConstructor
- **适用版本**: lombok 1.18.x 全版本（`@Jacksonized` 自 1.18.14 起；1.18.40 起联动 `@Accessors(fluent=true)`；1.18.44 起双支持 Jackson2/3，未配置 `lombok.jacksonized.jacksonVersion` 时 emit warning）
- **规律**: `@Builder` 贴在类上等价于隐式追加 package-private 的 `@AllArgsConstructor(access=PACKAGE)`，**只生成全参构造、不生成无参构造**。Jackson 默认反序列化需要 no-args 构造或 builder 协议；裸 `@Builder` 会让 Jackson 报 `InvalidDefinitionException: Cannot construct instance of ... No default constructor`。三种合规写法：(a) `@Jacksonized @Builder`（推荐，自动生成 `@JsonDeserialize(builder=...)` + `@JsonPOJOBuilder(withPrefix="")`）；(b) `@Builder @NoArgsConstructor @AllArgsConstructor`；(c) 显式 `@JsonDeserialize(builder=XBuilder.class)` + 手写 builder 协议。
- **违反后果**: Jackson 反序列化运行期 `InvalidDefinitionException`，DTO/REST 接口 400/500。
- **验证方法**: `grep -lE '@Builder\b' *.java` 取文件，对这些文件检查是否同时满足"`@Jacksonized` 出现" 或 "`@NoArgsConstructor` 且 `@AllArgsConstructor`" 或 "`@JsonDeserialize(builder="`"；都不满足 → warn（建议补 `@Jacksonized`）。
- **对应门禁**: fw_lombok_builder_jackson(warn)

```verify
id: lombok-r3
cmd: grep -lE '@Builder\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@RequiredArgsConstructor 用于构造注入时须显式标 final 依赖并避免循环依赖
- **适用版本**: lombok 1.18.x 全版本；Spring 4.3+ 单构造器默认 autowire
- **规律**: `@RequiredArgsConstructor` 只为**未初始化的 final 字段**和 `@NonNull` 字段生成构造参数——这是 Spring 构造注入的惯用写法。但 Spring 6 默认禁用循环依赖（`spring.main.allow-circular-references=false`），若两个 Bean 互相 `final` 引用对方，启动期 `BeanCurrentlyInCreationException`。`@Autowired` 字段注入虽能绕过循环依赖，但 Spring 官方与 IDE 一致推荐构造注入（不可变、易测、显式契约）。规律：所有协作者均声明为 `private final` + `@RequiredArgsConstructor`；循环依赖须重构（抽公共逻辑/接口/`@Lazy`），不得回退字段注入。
- **违反后果**: 启动期 `BeanCurrentlyInCreationException`；或回退字段注入后失去不可变性与可测性。
- **验证方法**: 检测两个类互为 final 字段类型 + 双方均带 `@RequiredArgsConstructor`/`@AllArgsConstructor` → warn（提示重构或加 `@Lazy`）。机械静态扫描难断循环，本门禁仅对"单类 final 字段类型引用了同样带 @RequiredArgsConstructor 的另一个本模块类且对方也声明了对本类 final 字段"的明显互引场景 warn，其余提示人工核实。
- **对应门禁**: fw_lombok_requiredargs_circular(warn)

```verify
id: lombok-r4
cmd: 
expect: always
```

### 规律：@EqualsAndHashCode 继承体系须显式声明 callSuper
- **适用版本**: lombok 1.18.x 全版本
- **规律**: `@EqualsAndHashCode` 默认 `callSuper=warn`（继承非 Object 类时 emit warning）；不显式声明则在生成方法中**不调用** `super.equals/hashCode`，导致子类 equals 漏掉父类字段。继承有状态父类须显式 `@EqualsAndHashCode(callSuper=true)`；纯组合或父类无状态可 `callSuper=false`（仍需显式以消除 warn）。`lombok.equalsAndHashCode.callSuper` config key 默认 `warn`，可改 `call`/`skip`。
- **违反后果**: 子类相等性漏判父类字段；HashSet/HashMap 桶定位错乱。
- **验证方法**: `grep -rnE '@EqualsAndHashCode\b' *.java`，对每条命中检查是否带 `callSuper=` 参数；缺省且所在类 `extends` 非 Object 类 → warn。
- **对应门禁**: fw_lombok_equals_callsuper(warn)

```verify
id: lombok-r5
cmd: grep -rnE '@EqualsAndHashCode\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@EqualsAndHashCode/@ToString 须排除 JPA 懒加载关联字段
- **适用版本**: lombok 1.18.x 全版本（`exclude`/`of` 参数自 1.16.22 起标 deprecated，推荐 `@EqualsAndHashCode.Exclude`/`@ToString.Exclude` 字段级注解；`cacheStrategy` 自 1.18.16 起）
- **规律**: 与规律1同源问题——若坚持在 `@Entity` 上用 `@EqualsAndHashCode`，必须用 `exclude={...}` 或字段级 `@EqualsAndHashCode.Exclude` 排除 `@OneToMany`/`@ManyToOne`/`@ManyToMany`/`@OneToOne(fetch=LAZY)` 字段；否则 equals/hashCode 触发懒加载。`@ToString` 同理须 `exclude` 或 `@ToString.Exclude`。`cacheStrategy` 仅对**不可变**对象使用，实体类（JPA 可变）禁用 `cacheStrategy`。
- **违反后果**: `LazyInitializationException`；hashCode 在懒加载前后变化导致 HashSet 桶丢失对象。
- **验证方法**: `grep -lE '@EqualsAndHashCode\b' *.java` 取文件，对这些文件同时检出 `@OneToMany|@ManyToOne|@ManyToMany|@OneToOne` 且 `@EqualsAndHashCode` 行无 `exclude=`/`of=`/`@EqualsAndHashCode.Exclude` 字段级标记 → warn。
- **对应门禁**: fw_lombok_equals_lazy(warn)

```verify
id: lombok-r6
cmd: grep -lE '@EqualsAndHashCode\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@SneakyThrows 须限定 IO/反序列化等狭窄场景，不得滥用隐藏受检异常
- **适用版本**: lombok 1.18.x 全版本
- **规律**: `@SneakyThrows` 通过 `Lombok.sneakyThrow(e)` 绕过编译期检查异常校验，"在 JVM 字节码层所有异常都可抛"。官方明确警告 "should not use without some deliberation" 且 "impossible to catch sneakily thrown checked types directly"——调用方写不出对应的 `catch` 块。合规场景：① lambda/Stream 内抛受检异常（标准函数式接口签名不允许）；② 反序列化/IO 工具方法（已 wrap 为统一运行期异常）。**禁用于** 业务 Service/Controller 公开方法（破坏契约、吞噬异常）。优先 `throws` 声明或 wrap 为业务运行期异常。
- **违反后果**: 调用方无法 catch；异常流断裂；单元测试漏覆盖受检异常路径。
- **验证方法**: `grep -rnE '@SneakyThrows' *.java`，命中行所在方法若属于 `Service|Controller|Facade|Api` 命名类 → warn；其余（util/lambda/stream）pass。
- **对应门禁**: fw_lombok_sneaky_throws(warn)

```verify
id: lombok-r7
cmd: grep -rnE '@SneakyThrows' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Cleanup 与 try-with-resources 选型，新代码优先 try-with-resources
- **适用版本**: lombok 1.18.x 全版本；Java 7+ 起 try-with-resources 为语言特性
- **规律**: `@Cleanup` 生成 `try/finally` 调 `close()`，但官方承认两个缺陷：(a) 清理方法抛异常会**掩盖原异常**（"the original exception is hidden by the cleanup call"），(b) 多资源嵌套 `try/finally` 深、关闭顺序敏感。Java 7+ 的 try-with-resources 用 suppressed exception 保留主异常、自动逆序关闭、可声明多个资源。规律：JDK 7+ 项目新代码**禁用 `@Cleanup`** 改 try-with-resources；老代码改造时一并迁移。仅 legacy/JDK 6 项目可用 `@Cleanup`。
- **违反后果**: 异常被 close() 异常掩盖，排错困难；多资源关闭顺序错乱。
- **验证方法**: `grep -rnE '@Cleanup' *.java` 命中即 warn（提示改 try-with-resources），不 fail（legacy 项目可能合理）。
- **对应门禁**: fw_lombok_cleanup(warn)

```verify
id: lombok-r8
cmd: grep -rnE '@Cleanup' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：lombok val/var 与 Java 10+ var 选型，新代码优先 Java 原生 var
- **适用版本**: lombok `val` 自 0.10 起；`var` 自 1.18.22 起（`val` 等价于 `final var`）；Java 10+ 原生 `var`
- **规律**: lombok `val`/`var` 是**局部变量**推断，不能用于字段；`val` 生成的变量自动 `final`，`var` 非 final。Java 10+ 原生 `var` 已覆盖大部分场景。规律：① JDK 10+ 项目**禁用** lombok `val`/`var`，改 Java 原生 `var`（如需 final 显式写 `final var`）；② `val` 推断对复合类型取最接近公共父类而非接口（`? extends HashSet : ArrayList` 推断为 `AbstractCollection` 而非 `Serializable`），易踩坑；③ JDK 8/9 项目可用 lombok `val`/`var` 但 IDE/可读性边界须团队约定。
- **违反后果**: 双套 var 并存可读性下降；复合类型推断结果与预期不符导致 API 误用。
- **验证方法**: `grep -rnE '\bval\s+[a-zA-Z_]|\bvar\s+[a-zA-Z_]' *.java` 且 `import lombok.var`/`import lombok.val` 存在 → warn（提示改 Java 原生 var 或复核）。
- **对应门禁**: fw_lombok_val_usage(warn)

```verify
id: lombok-r9
cmd: grep -rnE '\bval\s+[a-zA-Z_]|\bvar\s+[a-zA-Z_]' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Getter(lazy=true) 须评估双重检查锁开销与字段 mangling 副作用
- **适用版本**: lombok 1.18.x 全版本（1.18.32 修复表达式含 `value` 变量的 bug）
- **规律**: `@Getter(lazy=true)` 生成 `AtomicReference` + `synchronized` 双重检查锁，字段**类型被改写为 `AtomicReference`**（"mangled into an AtomicReference"），官方明确"should never refer to the field directly"。适用场景：值**昂贵且不总会被访问**；不适用：① 值几乎总被访问（直接初始化更省）；② 字段需被反射直接读（被 mangling 后行为异常）；③ 实体可变对象（cacheStrategy 同理禁用）。规律：用 `@Getter(lazy=true)` 必须只通过 getter 访问，且配 review 该字段是否真值得懒加载。
- **违反后果**: `AtomicReference` 内存/锁开销；反射直接读字段得到 `AtomicReference` 而非原值；并发场景过度同步。
- **验证方法**: `grep -rnE '@Getter\s*\([^)]*lazy\s*=\s*true' *.java` 命中即 warn（提示核对访问方式与必要性）。
- **对应门禁**: fw_lombok_getter_lazy(warn)

```verify
id: lombok-r10
cmd: grep -rnE '@Getter\s*\([^)]*lazy\s*=\s*true' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@NonNull 与 jakarta.validation @NotNull 分工，不可互相替代
- **适用版本**: lombok 1.18.x 全版本（lombok `@NonNull` 自早版本；jakarta.annotation.Nonnull 自 1.18.28 支持；Bean Validation 与 lombok 独立）
- **规律**: lombok `@NonNull` **生成运行期 null 检查代码**（默认抛 `NullPointerException`，可配 `lombok.nonNull.exceptionType=IllegalArgumentException|JDK|Guava|Assertion`），在方法/构造器入口立即失败；jakarta.validation `@NotNull` 是**声明式约束**，由 Hibernate Validator 等 Bean Validation runtime 在对象图校验阶段触发（如 Spring `@Valid` HTTP 请求绑定）。两者**不冗余**：`@NonNull` 守方法入口，`@NotNull` 守 DTO 边界校验。规律：① 业务方法参数用 `@NonNull`（fail-fast）；② HTTP/Service 边界 DTO 字段用 `@NotNull` + `@Valid`；③ 同一字段若同时需要两层防护，两注解都标，但不得只用 `@NonNull` 替代 `@NotNull`（lombok 不接入 Bean Validation pipeline）。`lombok.addNullAnnotations` config key 可额外生成 jspecify/checkerframework 等 nullity 注解。
- **违反后果**: 只标 `@NonNull` 的 DTO 字段绕过 `@Valid` 校验，请求体 null 字段直接进 Service 层抛 NPE 而非 400。
- **验证方法**: 对 `@Valid` 标注的 DTO 类，检查其字段若标 `@NonNull`（lombok）但缺 `@NotNull`（jakarta.validation.constraints）→ warn。
- **对应门禁**: fw_lombok_nonnull_validation(warn)

```verify
id: lombok-r11
cmd: 
expect: always
```

### 规律：lombok.config 须项目根目录集中管控并 stopBubbling
- **适用版本**: lombok 1.18.x 全版本
- **规律**: `lombok.config` 是分层配置，子目录配置覆盖父目录。多模块项目若无根 `lombok.config` + `config.stopBubbling=true`，各模块各自默认值漂移会导致 `lombok.copyJacksonAnnotationsToAccessors`（1.18.40 破坏性变更后默认 false）、`lombok.equalsAndHashCode.callSuper`、`lombok.log.fieldName`、`lombok.anyConstructor.addConstructorProperties`（MapStruct 集成必需）等 key 行为不一致。规律：① 项目根放 `lombok.config` 且首行 `config.stopBubbling = true`；② 显式声明与默认值不同的所有 key；③ CI 校验 `lombok.config` 存在且 key 集合稳定。
- **违反后果**: 同一项目不同模块 lombok 生成代码行为不一致；升级 lombok 版本后默认值变化静默生效。
- **验证方法**: 项目根（PROJECT_DIR 顶层）无 `lombok.config` 文件，或存在但无 `config.stopBubbling` → warn。
- **对应门禁**: fw_lombok_config(warn)

```verify
id: lombok-r12
cmd: 
expect: always
```

### 规律：lombok 与 MapStruct 同 module 共存须配置 addConstructorProperties 与 processor 顺序
- **适用版本**: lombok 1.18.x + MapStruct 1.5.x+（MapStruct 官方文档 §14.2 明确要求 lombok 与 MapStruct 协同配置）
- **规律**: MapStruct 是另一 annotation processor，需在 lombok 生成代码后看到构造器/getter/setter。MapStruct 官方要求：(a) `lombok.anyConstructor.addConstructorProperties = true`（让 lombok 给构造器生成 `@ConstructorProperties`，MapStruct 据此选构造器）；(b) lombok annotation processor 须**先于** MapStruct processor 运行（Maven 用 `annotationProcessorPaths` 顺序控制，Gradle 同理）；(c) lombok 与 MapStruct 版本组合须兼容（issue #1538 修复后 lombok 1.16.16+ 与 MapStruct 1.5.x+ 协同稳定）。规律：项目同时引入 `org.projectlombok:lombok` 与 `org.mapstruct:mapstruct-processor` 时，必须 (a)(b)(c) 三项齐备。
- **违反后果**: MapStruct 找不到构造器，生成空 mapper 或编译错 `unknown property`；增量编译时序错乱。
- **验证方法**: pom.xml/build.gradle 同时检出 `lombok` 与 `mapstruct` 依赖，但 `lombok.config` 缺 `lombok.anyConstructor.addConstructorProperties=true` → warn。
- **对应门禁**: fw_lombok_mapstruct(warn)

```verify
id: lombok-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥12 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_lombok_data_jpa | fail | LOMBOK_SRC_GLOBS 非空时，含 `@Entity` 的 .java 文件若同时含 `@Data` → fail | LOMBOK_SRC_GLOBS | — |
| fw_lombok_slf4j_dup | fail | 含 `@Slf4j` 的 .java 文件若同时含 `LoggerFactory.getLogger` → fail | LOMBOK_SRC_GLOBS | — |
| fw_lombok_builder_jackson | warn | 含 `@Builder` 的 .java 文件若缺 `@Jacksonized`/`@NoArgsConstructor`+`@AllArgsConstructor`/`@JsonDeserialize(builder=` → warn | LOMBOK_SRC_GLOBS | — |
| fw_lombok_requiredargs_circular | warn | 两类互引 final 字段且均带 `@RequiredArgsConstructor`/`@AllArgsConstructor` → warn 提示重构 | LOMBOK_SRC_GLOBS | — |
| fw_lombok_equals_callsuper | warn | `@EqualsAndHashCode` 无 `callSuper=` 且所在类 `extends` 非 Object → warn | LOMBOK_SRC_GLOBS | — |
| fw_lombok_equals_lazy | warn | `@EqualsAndHashCode` 无 `exclude=`/`of=` 且类含 `@OneToMany`/`@ManyToOne`/`@ManyToMany`/`@OneToOne` → warn | LOMBOK_SRC_GLOBS | — |
| fw_lombok_sneaky_throws | warn | `@SneakyThrows` 命中且所在类名含 Service/Controller/Facade/Api → warn | LOMBOK_SRC_GLOBS | — |
| fw_lombok_cleanup | warn | `@Cleanup` 命中即 warn 改 try-with-resources | LOMBOK_SRC_GLOBS | — |
| fw_lombok_val_usage | warn | `val`/`var` 声明 + `import lombok.val`/`var` → warn 改 Java 原生 var | LOMBOK_SRC_GLOBS | — |
| fw_lombok_getter_lazy | warn | `@Getter(... lazy=true ...)` 命中即 warn 核对访问方式与必要性 | LOMBOK_SRC_GLOBS | — |
| fw_lombok_nonnull_validation | warn | `@Valid` DTO 类字段标 lombok `@NonNull` 但缺 jakarta `@NotNull` → warn | LOMBOK_SRC_GLOBS | — |
| fw_lombok_config | warn | PROJECT_DIR 根无 `lombok.config` 或无 `config.stopBubbling` → warn | PROJECT_DIR | — |
| fw_lombok_mapstruct | warn | pom/build 同时检出 lombok 与 mapstruct 但 `lombok.config` 缺 `lombok.anyConstructor.addConstructorProperties` → warn | PROJECT_DIR LOMBOK_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_lombok_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/lombok.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_lombok_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: lombok  requires_conf: VAR1 VAR2` 声明。
fixture 验证只覆盖 data_jpa（violating→fail）+ 其余 warn/pass（compliant 全 pass）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| lombok × jpa/hibernate | `@Entity` 上禁用 `@Data`；用 `@Getter @Setter` + 字段级 `@ToString.Exclude`/`@EqualsAndHashCode.Exclude` 排除懒加载关联 | 懒加载字段进 `toString/equals` 触发 `LazyInitializationException` 或 N+1；双向关联双方 `@Data` 致 `StackOverflowError` |
| lombok × jackson | `@Builder` 用于反序列化须配 `@Jacksonized` 或 `@NoArgsConstructor + @AllArgsConstructor`；1.18.44+ 需配 `lombok.jacksonized.jacksonVersion` 选 Jackson2/3 | 裸 `@Builder` 仅生成 package-private 全参构造，Jackson 反序列化失败 `InvalidDefinitionException` |
| lombok × spring | 构造注入用 `@RequiredArgsConstructor` + `private final` 协作者；Spring 6 默认 `allow-circular-references=false`，循环依赖须重构或 `@Lazy` | 构造注入不可变、可测、显式契约；字段注入回退破坏不可变性 |
| lombok × mapstruct | 同 module 共存须 `lombok.anyConstructor.addConstructorProperties=true` + lombok processor 先于 mapstruct processor | MapStruct 据 `@ConstructorProperties` 选构造器；processor 顺序错致 mapper 生成空/编译错 |
| lombok × bean-validation | lombok `@NonNull`（方法入口 fail-fast）≠ jakarta `@NotNull`（DTO 边界 `@Valid`）；同字段可双标但不可互替 | `@NonNull` 生成代码在方法入口抛 NPE；`@NotNull` 由 Hibernate Validator 在 `@Valid` 时触发，二者 pipeline 不同 |
| lombok × spring-boot-starter | starter 引入 lombok 时 scope 用 `provided`/`optional=true`，避免传递到运行期 classpath | lombok 是编译期工具，运行期不应携带，否则与其他依赖版本冲突 |

<!--
无强交互的框架组合省略；本表聚焦 lombok 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| lombok 1.18.24 | `@Accessors(makeFinal=true)` 生效；`@ToString.onlyExplicitlyIncluded` config key；delombok `@Builder.Default` 代码生成修复；`@Log` 可贴 inner enum/record | 老配置迁移：makeFinal 改变 setter 签名 |
| lombok 1.18.28 | 支持 `jakarta.annotation.Nonnull`（区别于 jakarta.validation.constraints.NotNull）；Eclipse/VSCode 忽略 `lombok.config` 修复 | jakarta namespace 迁移（Spring 6/Jakarta EE 9+）可标 `@NonNull` |
| lombok 1.18.30 | 初始 JDK21 支持；模块系统 split-package 修复；extension method 在 record 中可用 | JDK21 项目须升级到此版以上 |
| lombok 1.18.32 | 引入 `@Locked`（"Like @Synchronized but with java.util.concurrent.locks locks"）；初始 JDK22；`@Getter(lazy=true)` 修复含 `value` 变量表达式 bug；record 内嵌无需显式 `static` | 用 `@Locked` 替代手写 `ReentrantLock`；`@Getter(lazy=true)` 含 value 变量场景须升级 |
| lombok 1.18.34 | **破坏性变更**：`@lombok.Generated` 默认添加到生成方法/类型，"may result in accidentally increasing your test coverage percentage"；`lombok.onX.flagUsage=WARNING` 真正生成 warning；`@SuperBuilder` 泛型数组类型修复 | 测试覆盖率统计变化（JaCoCo 须核实 `@Generated` exclusion 配置）；onX 配置生效 |
| lombok 1.18.36 | JDK23 支持；Eclipse + jasperreports-maven-plugin 编译修复 | JDK23 项目须升级 |
| lombok 1.18.38 | JDK24 支持；JSpecify nullity 注解支持（`lombok.addNullAnnotations=jspecify`）；Eclipse "negative length" 修复 | JSpecify 集成；多 nullity flavor 可选 |
| lombok 1.18.40 | **破坏性变更**：lombok 不再自动 copy Jackson 注解到 accessor（1.18.16–1.18.38 行为变更），恢复需 `lombok.copyJacksonAnnotationsToAccessors=true`；`@Jacksonized`+`@Accessors(fluent=true)` 自动生成 `@JsonProperty`；JDK25 支持 | 升级 1.18.40 须回归 Jackson 序列化；fluent accessor 与 Jackson 配合改善 |
| lombok 1.18.42 | `@Log` 系列（含 `@Slf4j`）支持改 access level，默认仍 `private`；JDK25 Netbeans/ErrorProne javadoc 解析修复 | `@Slf4j` 可标 `protected`/`public` 供子类用 |
| lombok 1.18.44 | `@Jacksonized` 双支持 Jackson2/3，未配 `lombok.jacksonized.jacksonVersion` 时 emit warning；JDK25 `val`/`@ExtensionMethod` javac 误报修复；`@Jacksonized`+transient 字段不再被序列化 | Jackson3 迁移期须显式配 jacksonVersion；transient 序列化行为修正 |
| lombok 1.18.46 | JDK26 支持；Spring Tools Suite 5 支持；`@Jacksonized` 不再因 `@JsonIgnore` 停止生成 `@JsonProperty`；`@Jacksonized`+fluent Eclipse 修复；Jackson3 收尾 | 最新发布（2026-04-22）；Jackson 集成进一步完善 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
1.18.40 的 copyJacksonAnnotationsToAccessors 默认值变更与 1.18.34 的 @lombok.Generated 默认添加为两次破坏性变更，升级路径须显式核对。
-->
