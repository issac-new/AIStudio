---
ruleset_id: mapstruct
适用版本: MapStruct 1.6.x（现行稳定 1.6.3，2026-07 调研；1.7.0.Beta 预发布差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/mapstruct/mapstruct/releases ；https://mapstruct.org/documentation/stable/reference/html/ ；https://mapstruct.org/documentation/stable/reference/html/#lombok ；https://mapstruct.org/documentation/stable/reference/html/#mapping-collections ；https://github.com/projectlombok/lombok （lombok-mapstruct-binding 发布方））
深度门槛: 12
---

# MapStruct 规则集

<!--
本规则集覆盖 MapStruct 1.6.x（2026-07 调研时 GitHub releases 标记 1.6.3 为 Latest stable；
1.7.0.Beta1/Beta2 为预发布，GA 时点待验证）。
MapStruct 是编译期 annotation processor 代码生成器，风险面集中在"静默行为"：
默认 unmappedTargetPolicy=IGNORE 漏映射不报错、与 Lombok 共存时 processor 顺序敏感、@MappingTarget null 覆盖语义。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.mapstruct:mapstruct` / `org.mapstruct:mapstruct-processor` / `org.projectlombok:lombok-mapstruct-binding` | 高 |
| 注解 | `@Mapper` / `@MapperConfig` / `@Mapping` / `@MappingTarget` / `@Named` / `@InheritConfiguration` / `@InheritInverseConfiguration` / `@IterableMapping` | 高 |
| 配置 | `annotationProcessorPaths`（含 mapstruct-processor） / `mapstruct.defaultComponentModel` / `mapstruct.unmappedTargetPolicy` 编译参数 | 高 |
| 代码 | `import org.mapstruct.` / `Mappers.getMapper(` / `ReportingPolicy` / `CycleAvoidingStrategy` | 高 |
| 文件 | `**/mapper/**/*Mapper.java` / `**/mapstruct/**/*.java` | 中（需组合依赖信号） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 mapstruct 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Mapper 接口：`grep -rlE '^[[:space:]]*@Mapper([[:space:]]*\(|[[:space:]]*$)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @Mapper 注解行的 .java 文件数）
- @MapperConfig：`grep -rlE '@MapperConfig' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：文件数）
- @Mapping 映射声明：`grep -rnE '@Mapping\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- @MappingTarget 更新方法：`grep -rnE '@MappingTarget' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- @Named 自定义方法：`grep -rnE '@Named\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 循环引用防护：`grep -rnE 'CycleAvoidingStrategy' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- processor 配置：`grep -rnE 'mapstruct-processor|lombok-mapstruct-binding' "${PROJECT_DIR}" --include='pom.xml' --include='*.gradle*'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：unmappedTargetPolicy 必须显式 ERROR，防静默漏映射
- **适用版本**: MapStruct 1.6.x 全版本（默认 IGNORE 自早期版本延续至今）
- **规律**: MapStruct 默认 `unmappedTargetPolicy = ReportingPolicy.IGNORE`：目标对象新增字段而映射未更新时**编译无任何提示**，运行期字段永远 null。须在每个 @Mapper 或全局 @MapperConfig 显式 `unmappedTargetPolicy = ReportingPolicy.ERROR`，让漏映射在编译期即失败；确需忽略的字段用 `@Mapping(target="x", ignore=true)` 显式声明（把"忽略"从静默变显式）。
- **违反后果**: DTO 字段静默漏映射 → 前端/下游拿到 null 字段，排错成本极高（生成代码无运行时校验）。
- **验证方法**: 含 `@Mapper` 的文件无 `unmappedTargetPolicy`，且项目无带 `unmappedTargetPolicy` 的 `@MapperConfig` → fail。
- **对应门禁**: fw_mapstruct_unmapped_target(fail)

```verify
id: mapstruct-r1
cmd: 
expect: always
```

### 规律：与 Lombok 共存必须 lombok-mapstruct-binding，否则生成代码拿不到 getter/setter
- **适用版本**: MapStruct 1.3+ × Lombok 1.18.16+（Lombok 1.18.16 起强制 binding）
- **规律**: Lombok 1.18.16 起与 MapStruct 共存必须加 `org.projectlombok:lombok-mapstruct-binding` 依赖——它协调两个 annotation processor 的生成顺序与可见性。缺失时 MapStruct 在 Lombok 生成 getter/setter/constructor 之前运行，报 `No property named "x" exists` 或静默跳过映射。
- **违反后果**: 编译失败或字段映射缺失（取决于 processor 命中顺序，CI 与本地可能不一致）。
- **验证方法**: 构建文件同时检出 `lombok` 与 `mapstruct` 但无 `lombok-mapstruct-binding` → fail。
- **对应门禁**: fw_mapstruct_lombok_binding(fail)

```verify
id: mapstruct-r2
cmd: 
expect: always
```

### 规律：Maven annotationProcessorPaths 中 Lombok 必须先于 mapstruct-processor
- **适用版本**: MapStruct 1.6.x × Maven compiler plugin 全版本
- **规律**: `annotationProcessorPaths` 声明顺序即 processor 注册顺序，Lombok path 必须先于 mapstruct-processor（且推荐 lombok → lombok-mapstruct-binding → mapstruct-processor 三段序）。顺序颠倒时 MapStruct 先跑，看不到 Lombok 生成的方法。Gradle 由 lombok-mapstruct-binding 自动协调，无此顺序问题。
- **违反后果**: 编译报属性不存在/映射缺失；换机器构建结果漂移。
- **验证方法**: pom.xml `annotationProcessorPaths` 块内 mapstruct-processor 行号 < lombok 行号 → warn。
- **对应门禁**: fw_mapstruct_processor_order(warn)

```verify
id: mapstruct-r3
cmd: 
expect: always
```

### 规律：@MappingTarget 更新语义下 null 值会覆盖目标，须 NullValuePropertyMappingStrategy
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `void update(Dto dto, @MappingTarget Entity e)` 更新方法默认把源对象 **null 字段也拷贝**到目标（目标已有值被 null 抹掉）。PATCH 语义（只更新非 null 字段）须 `nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE`（@Mapper/@MapperConfig/@Mapping 三级可配）。注意该策略对 @MappingTarget 与新建映射语义不同，需按方法粒度确认。
- **违反后果**: 部分更新接口把未传字段置 null → 数据丢失。
- **验证方法**: 含 `@MappingTarget` 的 Mapper 文件无 `NullValuePropertyMappingStrategy` → warn。
- **对应门禁**: fw_mapstruct_mapping_target_null(warn)

```verify
id: mapstruct-r4
cmd: 
expect: always
```

### 规律：双向/循环引用映射须 CycleAvoidingStrategy，禁无限递归
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: A 引用 B、B 引用 A（如 Order↔Customer 双向关联），MapStruct 生成 `aToB(bToA(aToB(...)))` 无限递归代码——编译能过，运行期 StackOverflowError。须 (a) `uses = CycleAvoidingStrategy.class`（@Context 跟踪已映射对象），或 (b) 打破环（单向 DTO 不映射回链）。`uses =` 互相引用的两个 Mapper 是典型信号。
- **违反后果**: 运行期 StackOverflowError；深度嵌套时栈爆。
- **验证方法**: Mapper A `uses = BMapper.class` 且 BMapper `uses = AMapper.class` → warn。
- **对应门禁**: fw_mapstruct_cycle(warn)

```verify
id: mapstruct-r5
cmd: 
expect: always
```

### 规律：Spring 项目 @Mapper 须 componentModel = "spring"，走 DI 而非 Mappers.getMapper
- **适用版本**: MapStruct 1.6.x × Spring 全版本
- **规律**: `@Mapper` 缺省 `componentModel = "default"`，生成类无 Spring 注解，只能 `Mappers.getMapper(X.class)` 静态获取——无法注入依赖（如自定义 @Named 方法所在的 Spring Bean、转换服务）。Spring 项目须 `componentModel = "spring"`（或 @MapperConfig 全局设），生成 @Component 实现走构造器注入。混用 default + spring 模型会拿不到注入的自定义转换器。
- **违反后果**: 自定义转换逻辑依赖 Spring Bean 时 NPE；两套获取方式并存维护混乱。
- **验证方法**: 含 `@Mapper` 的文件无 `componentModel` → warn。
- **对应门禁**: fw_mapstruct_component_model(warn)

```verify
id: mapstruct-r6
cmd: 
expect: always
```

### 规律：@Mapping(ignore = true) 必须显式记录原因
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `unmappedTargetPolicy=ERROR` 下每个忽略字段都要写 `@Mapping(target="x", ignore=true)`。这些 ignore 是"有意不映射"的声明，须同行注释说明原因（如 `// id 由 DB 生成`、`// 敏感字段不下发`）。无注释的 ignore 在 review 中无法区分"有意"与"漏配"，后续字段语义变化时易被误删。
- **违反后果**: 忽略意图失传；字段演进时误删必要 ignore 或误留危险 ignore（如 password 字段本应永远 ignore）。
- **验证方法**: `grep -rnE 'ignore[[:space:]]*=[[:space:]]*true'` 命中即 warn（人工确认每处有原因注释）。
- **对应门禁**: fw_mapstruct_ignore_reason(warn)

```verify
id: mapstruct-r7
cmd: grep -rnE 'ignore[[:space:]]*=[[:space:]]*true' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@Named 自定义映射方法必须线程安全
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `@Named("methodName")` 自定义方法被生成的 Mapper 实现调用，Mapper 实现单例（spring 模型下 Spring 单例，default 模型下 Mappers 缓存单例）→ 多线程并发执行。@Named 方法内使用 `SimpleDateFormat`（非线程安全）等可变成员字段会串数据。须用 `DateTimeFormatter`/局部变量/无状态实现。
- **违反后果**: 并发下日期/格式串号（CWE-362 竞态）；偶发解析异常。
- **验证方法**: 含 `@Named` 的文件同时含 `SimpleDateFormat` → warn。
- **对应门禁**: fw_mapstruct_named_threadsafe(warn)

```verify
id: mapstruct-r8
cmd: 
expect: always
```

### 规律：expression = "java(...)" 注入面与可测试性差，须收敛
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `@Mapping(target="x", expression = "java(...)")` 把任意 Java 代码内嵌进注解字符串：无编译期类型检查以外的保障、重构不可追踪、单测不可达（生成代码内联）。表达式中拼接请求/DTO 字段做 SQL/路径/命令场景构成注入面。能用 `qualifiedByName`+@Named 方法就不用 expression；必须用时表达式只做纯函数转换。
- **违反后果**: 重构断裂不可见；注入面（视表达式内容，CWE-94 代码注入）。
- **验证方法**: `grep -rnE 'expression[[:space:]]*=' *.java` 命中即 warn（人工核表达式内容）。
- **对应门禁**: fw_mapstruct_expression(warn)

```verify
id: mapstruct-r9
cmd: grep -rnE 'expression[[:space:]]*=' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：@InheritConfiguration/@InheritInverseConfiguration 误用面
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `@InheritConfiguration` 继承**同名同签名**正向方法的 @Mapping；`@InheritInverseConfiguration` 从反向方法继承并**自动反转** source/target——但嵌套属性、ignore、expression 不会按直觉反转（ignore 不继承、嵌套路径反产出错）。常见误用：两个方法字段集不完全镜像时反 inheritance 静默丢映射。继承配置只用于严格镜像的正反方法对。
- **违反后果**: 反向映射静默漏字段/错配（与 unmappedTargetPolicy=ERROR 叠加时可部分暴露）。
- **验证方法**: `grep -rnE '@Inherit(Inverse)?Configuration'` 命中即 warn（人工核对正反方法字段镜像性）。
- **对应门禁**: fw_mapstruct_inherit(warn)

```verify
id: mapstruct-r10
cmd: grep -rnE '@Inherit(Inverse)?Configuration' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：嵌套属性映射点语法须确认中间对象初始化
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `@Mapping(target = "address.city", source = "city")` 点语法映射嵌套目标：MapStruct 生成 `if (target.getAddress() == null) target.setAddress(new Address())` 中间对象创建逻辑——但目标为更新场景（@MappingTarget）且中间对象已有值时，未映射的嵌套字段保留旧值（部分覆盖语义）；且中间类型无无参构造时编译失败。反向（`source = "address.city"`）源中间对象为 null 时生成 null 检查链。
- **违反后果**: 更新场景嵌套对象字段被意外保留/覆盖；无无参构造编译失败。
- **验证方法**: `grep -rnE 'target[[:space:]]*=[[:space:]]*"[A-Za-z0-9_]+\.'` 命中即 warn（人工确认中间对象生命周期）。
- **对应门禁**: fw_mapstruct_nested(warn)

```verify
id: mapstruct-r11
cmd: grep -rnE 'target[[:space:]]*=[[:space:]]*"[A-Za-z0-9_]+\.' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：集合映射元素类型转换须 @IterableMapping 显式声明
- **适用版本**: MapStruct 1.6.x 全版本
- **规律**: `List<Target> map(List<Source> src)` 集合方法自动按元素映射生成循环。当元素映射本身需要 @Mapping 配置（忽略字段/qualifiedByName）时，须在集合方法上加 `@IterableMapping(elementTargetType = ..., qualifiedByName = ...)` 指定元素级配置；否则元素走默认映射，配置静默不生效。元素类型推断失败（泛型擦除）时必须 `elementTargetType`。
- **违反后果**: 元素级映射配置静默不生效 → 集合元素字段错配。
- **验证方法**: Mapper 文件检出 `List<X> m(List<Y>` 形态集合方法但无 `@IterableMapping` → warn。
- **对应门禁**: fw_mapstruct_collection_element(warn)

```verify
id: mapstruct-r12
cmd: 
expect: always
```

### 规律：@Builder.Default / @Value 不可变对象与 MapStruct 兼容面
- **适用版本**: MapStruct 1.3+（builder 支持）× Lombok @Builder
- **规律**: MapStruct 1.3 起支持 builder 映射，但 `@Builder.Default` 字段在 MapStruct 调用 builder 时**默认值不生效**（MapStruct 逐字段 set，未映射字段拿到的是 builder 零值而非 @Builder.Default 值）；`@Value` 不可变类须 constructor 注入（MapStruct 1.4+ 支持构造器映射，`@Default` 注解指定构造器）。集合型 @Builder.Default 字段在映射后变 null 是高频坑。
- **违反后果**: 默认值字段映射后为 null/零值；不可变类映射失败。
- **验证方法**: 项目（MapStruct 激活）检出 `@Builder.Default` → warn。
- **对应门禁**: fw_mapstruct_builder_default(warn)

```verify
id: mapstruct-r13
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
| fw_mapstruct_unmapped_target | fail | @Mapper 文件无 unmappedTargetPolicy 且无全局 @MapperConfig 带该属性 → fail | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_lombok_binding | fail | 构建文件含 lombok + mapstruct 但无 lombok-mapstruct-binding → fail | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_processor_order | warn | pom annotationProcessorPaths 内 mapstruct-processor 先于 lombok → warn | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_mapping_target_null | warn | @MappingTarget 文件无 NullValuePropertyMappingStrategy → warn null 覆盖 | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_cycle | warn | A uses=BMapper 且 B uses=AMapper → warn CycleAvoidingStrategy | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_component_model | warn | @Mapper 无 componentModel → warn Spring 项目须 "spring" DI | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_ignore_reason | warn | ignore = true 命中 → warn 人工确认原因注释 | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_named_threadsafe | warn | @Named + SimpleDateFormat 同文件 → warn 线程安全 | MAPSTRUCT_SRC_GLOBS | CWE-362；GB/T 34944-2017 |
| fw_mapstruct_expression | warn | expression = 命中 → warn 人工核表达式内容 | MAPSTRUCT_SRC_GLOBS | CWE-94；GB/T 34944-2017 |
| fw_mapstruct_inherit | warn | @InheritConfiguration/@InheritInverseConfiguration 命中 → warn 镜像核对 | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_nested | warn | target = "a.b" 点语法命中 → warn 中间对象生命周期 | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_collection_element | warn | List<X> m(List<Y>) 集合方法无 @IterableMapping → warn 元素配置 | MAPSTRUCT_SRC_GLOBS | — |
| fw_mapstruct_builder_default | warn | @Builder.Default 检出 → warn 默认值在 builder 映射不生效 | MAPSTRUCT_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_mapstruct_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/mapstruct.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_mapstruct_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: mapstruct  requires_conf: MAPSTRUCT_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 @Mapper 无 unmappedTargetPolicy=ERROR（unmapped_target fail）+ pom lombok+mapstruct 无 binding（lombok_binding fail）；compliant 用 ReportingPolicy.ERROR + binding + lombok 先序 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| mapstruct × lombok | 必须 lombok-mapstruct-binding + annotationProcessorPaths 中 lombok 先序；@Builder.Default 默认值在映射中不生效 | Lombok 1.18.16 起强制 binding；processor 顺序决定生成代码可见性 |
| mapstruct × spring-boot/spring-data-jpa | @Mapper(componentModel="spring") 走 DI；实体转 DTO 在事务外进行时 LAZY 关联触发 LazyInitializationException | 生成代码遍历 getter 初始化懒加载代理；须 EntityGraph 或 DTO 投影 |
| mapstruct × spring-security | UserDetails/实体转 DTO 须显式 ignore 敏感字段（password/authorities），配合 unmappedTargetPolicy=ERROR 防反向泄露 | 默认 IGNORE 策略下敏感字段改名后静默漏映射/误映射 |
| mapstruct × spring-data-jpa 审计 | 更新方法 @MappingTarget 不得覆盖 @CreatedDate/@CreatedBy（须 ignore + NullValuePropertyMappingStrategy.IGNORE） | 否则 DTO null 值抹掉审计字段 |

<!--
无强交互的框架组合省略；本表聚焦 mapstruct 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| MapStruct 1.3 | 引入 builder 映射支持（含 Lombok @Builder） | @Builder 目标类可映射；@Builder.Default 坑同步引入 |
| MapStruct 1.4 | 构造器映射支持（不可变对象/@Value）；`@Condition` 引入 | 不可变 DTO 可映射；@MappingTarget 条件更新可声明式 |
| MapStruct 1.5 | `@SubclassMapping`/`@NestedTargetObject`；`unmappedSourcePolicy` 可配 | 源侧漏映射也可收紧（source 政策独立于 target） |
| MapStruct 1.6.0 | `@Mapping` 内 `constant`/`expression` 校验收紧；Kotlin kapt/ksp 兼容改进（待验证：逐条 release notes 未核全） | 旧宽松表达式可能编译失败 |
| MapStruct 1.6.3 | 现行稳定（GitHub releases Latest 标记，2026-07 调研） | 规律以 1.6.x 行为为准 |
| MapStruct 1.7.0.Beta | 预发布（Beta1/Beta2 存在，GA 时点待验证）；Jakarta 新注解处理对齐（待验证） | 待验证：升级前须人工核对 migration notes |
| Lombok 1.18.16 | 与 MapStruct 共存强制 lombok-mapstruct-binding | 无 binding 即编译/映射失败（fw_mapstruct_lombok_binding） |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
