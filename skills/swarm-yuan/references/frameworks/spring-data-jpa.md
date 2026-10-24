---
ruleset_id: spring-data-jpa
适用版本: Spring Data JPA 3.4.x–4.1.x（Spring Data 2024.1/2025.x release train，对应 Boot 3.4/4.x）+ Hibernate ORM 6.6.x–7.x（差异单独标注）
最后调研: 2026-07-17（来源：https://spring.io/projects/spring-data-jpa ；https://docs.spring.io/spring-data/jpa/reference/jpa/entity-persistence.html ；https://docs.spring.io/spring-data/jpa/reference/jpa/query-methods.html ；https://docs.spring.io/spring-data/jpa/reference/jpa/locking.html ；https://docs.spring.io/spring-data/jpa/reference/auditing.html ；https://hibernate.org/orm/releases/ ；https://docs.spring.io/spring-boot/how-to/data-access.html ）
深度门槛: 12
---

# Spring Data JPA 规则集

<!--
本规则集覆盖 Spring Data JPA 3.4.x（2024.1 train / Boot 3.4）与 4.x（2025.x train / Boot 4.x，
2026-07 调研时 spring.io 首页展示 4.1.0 为现行），底层 provider 以 Hibernate ORM 6.6/7.x 为准。
调研时点：2026-07-17。Hibernate 7.x 精确小版本与 Spring Data 2025.x train 命名：待验证（未逐条核对 release notes）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.boot:spring-boot-starter-data-jpa` / `org.springframework.data:spring-data-jpa` / `org.hibernate.orm:hibernate-core` / `jakarta.persistence:jakarta.persistence-api` | 高 |
| 注解 | `@Entity` / `@Table` / `@Id` / `@OneToMany` / `@ManyToOne` / `@Enumerated` / `@Transactional` / `@EntityGraph` / `@EnableJpaAuditing` / `@EnableJpaRepositories` | 高 |
| 配置 | `spring.jpa.*` / `spring.datasource.*` / `hibernate.*`（`open-in-view` / `ddl-auto` / `show-sql`） | 高 |
| 代码 | `extends JpaRepository<` / `extends CrudRepository<` / `EntityManager` / `@PersistenceContext` / `JpaSpecificationExecutor` | 高 |
| 文件 | `**/entity/**/*.java` / `**/repository/**/*Repository.java` | 中（需组合依赖信号） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 spring-data-jpa 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- JPA 实体：`grep -rlE '@Entity\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @Entity 的 .java 文件数）
- Repository 接口：`grep -rlE 'extends (JpaRepository|CrudRepository|PagingAndSortingRepository)<' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：文件数）
- to-many 关联：`grep -rnE '@(OneToMany|ManyToMany)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- @EntityGraph / JOIN FETCH：`grep -rnE '@EntityGraph|join fetch|JOIN FETCH' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- @Transactional 方法：`grep -rnE '@Transactional\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 审计字段：`grep -rnE '@(CreatedDate|LastModifiedDate|CreatedBy|LastModifiedBy)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 锁注解：`grep -rnE '@Lock\(|@Version\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- @Modifying 批量：`grep -rnE '@Modifying' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：to-many 关联查询须 @EntityGraph/JOIN FETCH/batch_size 防 N+1
- **适用版本**: Spring Data JPA 3.4.x–4.x / Hibernate 6.6–7.x 全版本
- **规律**: `@OneToMany`/`@ManyToMany`（默认 LAZY）在遍历关联时逐条触发 SELECT，列表场景产生 N+1。查询侧必须三选一：Repository 方法 `@EntityGraph(attributePaths=...)`、JPQL `JOIN FETCH`、或全局 `hibernate.default_batch_fetch_size`/`@BatchSize` 批取。仅声明 LAZY 不等于解决——访问时仍逐条加载。
- **违反后果**: N+1 查询风暴，列表页慢百倍以上；连接池耗尽。
- **验证方法**: 项目检出 `@(OneToMany|ManyToMany)` 但无 `@EntityGraph`/`JOIN FETCH`/`@BatchSize`/`batch_size` → warn。
- **对应门禁**: fw_jpa_nplus1(warn)

```verify
id: spring-data-jpa-r1
cmd: 
expect: always
```

### 规律：to-many 关联禁止 FetchType.EAGER（笛卡尔积爆炸）
- **适用版本**: Spring Data JPA 3.4.x–4.x / Hibernate 6.6–7.x 全版本
- **规律**: `@OneToMany(fetch = FetchType.EAGER)`/`@ManyToMany(fetch = FetchType.EAGER)` 让每次加载实体都 JOIN 出全量关联；两个以上 EAGER to-many 会产生笛卡尔积 `MultipleBagFetchException`（Hibernate 直接报错）或内存爆炸。JPA 规范 to-many 默认 LAZY，应保持默认。
- **违反后果**: `MultipleBagFetchException: cannot simultaneously fetch multiple bags`；OOM；全表 JOIN。
- **验证方法**: `grep -rnE '@(OneToMany|ManyToMany)\([^)]*FetchType\.EAGER' *.java`，命中即 warn。
- **对应门禁**: fw_jpa_eager_to_many(warn)

```verify
id: spring-data-jpa-r2
cmd: grep -rnE '@(OneToMany|ManyToMany)\([^)]*FetchType\.EAGER' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：open-in-view（OSIV）反模式，生产必须显式 false
- **适用版本**: Spring Boot 2.x–4.x（`spring.jpa.open-in-view` 默认 true，启动日志自带 WARN）
- **规律**: OSIV 把 EntityManager 绑定到整个请求生命周期：视图渲染/序列化阶段的每个懒加载访问都发 SQL，且数据库连接在整个请求期被占用。Boot 默认 true 仅为开发便利，官方启动日志即警告。生产须 `spring.jpa.open-in-view: false` 并把所有懒加载访问收敛进 `@Transactional` 边界或用 EntityGraph 一次性取回。
- **违反后果**: 连接池在高并发下耗尽；序列化触发隐式 N+1；事务边界失控。
- **验证方法**: 配置 `open-in-view: true` → warn；JPA 项目无 `open-in-view: false` 显式配置 → warn（默认 true）。
- **对应门禁**: fw_jpa_osiv(warn)

```verify
id: spring-data-jpa-r3
cmd: 
expect: always
```

### 规律：查询方法须 @Transactional(readOnly=true) 关闭脏检查
- **适用版本**: Spring Data JPA 3.4.x–4.x / Hibernate 6.6–7.x 全版本
- **规律**: 只读查询走普通 `@Transactional` 时 Hibernate 对托管实体做 dirty checking（快照比对），纯查询场景白白消耗内存与 CPU。`@Transactional(readOnly=true)` 设 `FlushMode.MANUAL` + 跳过快照，且让数据源路由（读写分离）识别只读。方法名 find/get/list/query/search/count 语义为查询，须 readOnly。
- **违反后果**: 大结果集查询内存翻倍（快照）；读写分离场景误路由到主库。
- **验证方法**: 含 `@Transactional` 的 Service 文件内有 find/get/list/query/search 方法但全文无 `readOnly` → warn。
- **对应门禁**: fw_jpa_readonly(warn)

```verify
id: spring-data-jpa-r4
cmd: 
expect: always
```

### 规律：@CreatedDate/@LastModifiedDate 审计字段须 @EnableJpaAuditing + AuditingEntityListener
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: `@CreatedDate`/`@LastModifiedDate`/`@CreatedBy`/`@LastModifiedBy` 由 `AuditingEntityListener` 在 persist/update 时填充，而该监听器仅在 (a) 配置类 `@EnableJpaAuditing` 且 (b) 实体 `@EntityListeners(AuditingEntityListener.class)`（或继承含该注解的基类）时注册。缺任一则审计字段永远 null，且不报任何错。
- **违反后果**: 审计列全 NULL；合规审计失效（静默）。
- **验证方法**: 项目检出审计注解但无 `@EnableJpaAuditing` → warn。
- **对应门禁**: fw_jpa_auditing(warn)

```verify
id: spring-data-jpa-r5
cmd: 
expect: always
```

### 规律：悲观锁 @Lock(PESSIMISTIC_WRITE) 须配锁超时防死锁堆积
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: `@Lock(LockModeType.PESSIMISTIC_WRITE)` 发 `SELECT ... FOR UPDATE`，行锁持有至事务结束。不配 `jakarta.persistence.lock.timeout`（@QueryHints）时锁等待无限期，并发下互相等待成死锁/锁堆积。且悲观锁必须在 `@Transactional` 内执行（无事务直接 `TransactionRequiredException`）。
- **违反后果**: 死锁 / 锁等待堆积拖垮 DB；无事务调用直接异常。
- **验证方法**: 检出 `@Lock(...PESSIMISTIC...)` 但同文件无 `lock.timeout`/`@QueryHints` → warn。
- **对应门禁**: fw_jpa_pessimistic_lock(warn)

```verify
id: spring-data-jpa-r6
cmd: 
expect: always
```

### 规律：乐观锁 @Version 须处理冲突异常，不可裸奔
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: `@Version` 字段让 UPDATE 带版本条件（`where id=? and version=?`），版本不匹配抛 `ObjectOptimisticLockingFailureException`（Spring 包装）/`OptimisticLockException`（JPA 原生）。业务层必须捕获并转译为"并发修改，请重试"语义或自动重试；不处理则 500 直达用户，且批量场景下异常定位困难。
- **违反后果**: 并发更新冲突以 500 暴露；用户无重试提示。
- **验证方法**: 项目检出 `@Version` 但无 `OptimisticLock` 异常处理痕迹 → warn。
- **对应门禁**: fw_jpa_optimistic_lock(warn)

```verify
id: spring-data-jpa-r7
cmd: 
expect: always
```

### 规律：save() 对 detached 实体是 merge 语义，手工 setId 须明确意图
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: `SimpleJpaRepository.save()` 按 ID 是否为空分流：新实体（ID null 或 `@Version` 为 0）走 `em.persist`，已带 ID 的走 `em.merge`——merge 会先 SELECT 再 UPDATE，且用传入实体的**全字段覆盖** DB 行（未赋值的字段变 null）。手工 `setId(x)` 后 save 做"部分更新"是经典误用，须改 `findById` 后在托管实体上改字段，或用 `@DynamicUpdate`/显式 merge。
- **违反后果**: 部分字段被 null 覆盖（数据丢失）；每次"更新"多一次 SELECT。
- **验证方法**: 同文件检出 `.setId(` 与 `.save(` → warn（人工确认是否 detached merge 误用）。
- **对应门禁**: fw_jpa_save_merge(warn)

```verify
id: spring-data-jpa-r8
cmd: 
expect: always
```

### 规律：懒加载关联须在事务边界内访问，否则 LazyInitializationException
- **适用版本**: Spring Data JPA 3.4.x–4.x / Hibernate 6.6–7.x 全版本
- **规律**: LAZY 关联（to-many 默认）的初始化依赖存活 Session。OSIV 关闭后，事务外访问 `order.getItems().size()` 抛 `LazyInitializationException: could not initialize proxy - no Session`。修法：访问点收进 `@Transactional` 内 / EntityGraph 一次取回 / DTO 投影。不可为省事重开 OSIV（见 fw_jpa_osiv）。
- **违反后果**: 运行期 LazyInitializationException；或为规避而重开 OSIV 引入连接耗尽。
- **验证方法**: 检出 to-many 关联 + 配置 `open-in-view: false` + 全项目无 `@Transactional` → warn（事务边界缺失）。
- **对应门禁**: fw_jpa_lazy_exception(warn)

```verify
id: spring-data-jpa-r9
cmd: 
expect: always
```

### 规律：@Modifying 批量更新绕过持久化上下文，须 clearAutomatically
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: `@Modifying @Query("update ...")` 直接发 SQL 到 DB，**不经过**持久化上下文——一级缓存中的托管实体仍是旧值，后续 `findById` 命中缓存读到脏数据。须 `@Modifying(clearAutomatically = true)`（执行后清上下文），需要回填时再 `flushAutomatically = true`。批量删除同理。
- **违反后果**: 批量更新后同事务读到旧值（脏读于自身）。
- **验证方法**: 检出 `@Modifying` 但同文件无 `clearAutomatically`/`flushAutomatically` → warn。
- **对应门禁**: fw_jpa_modifying(warn)

```verify
id: spring-data-jpa-r10
cmd: 
expect: always
```

### 规律：实体 equals/hashCode 用业务键，禁用 lombok @Data 全字段（含懒加载关联）
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: 实体上 `@Data`/`@EqualsAndHashCode`（全字段）会把懒加载关联拉进 `equals/hashCode/toString`：equals 触发 N+1，双向关联致 `toString` 栈溢出，且实体跨持久化状态字段值变化导致 hashCode 不稳定（HashSet 丢元素）。正解：用不变业务键（自然键/订单号）手写 equals/hashCode，或 `@EqualsAndHashCode(onlyExplicitlyIncluded=true)` + 业务键 `@Include`。
- **违反后果**: N+1 / StackOverflowError / HashSet 语义错乱。
- **验证方法**: 含 `@Entity` 的文件同时含 `@Data` 或 `@EqualsAndHashCode` 且无 `exclude`/`onlyExplicitlyIncluded` → warn。
- **对应门禁**: fw_jpa_equals_hashcode(warn)

```verify
id: spring-data-jpa-r11
cmd: 
expect: always
```

### 规律：@Enumerated 必须 EnumType.STRING，禁止默认 ORDINAL
- **适用版本**: JPA 全版本（Jakarta Persistence 3.x）
- **规律**: `@Enumerated` 缺省 `EnumType.ORDINAL` 存枚举**序号**（0,1,2...）。枚举常量顺序调整/中间插入即全表数据错位（NEW=0,PAID=1 变 PAID=0,NEW=1），且 DB 里无数义可读性。必须 `@Enumerated(EnumType.STRING)` 存枚举名；存量 ORDINAL 迁移须数据订正脚本。
- **违反后果**: 枚举重排 → 存量数据静默错位（数据完整性灾难）。
- **验证方法**: `grep -rnE '@Enumerated' *.java | grep -v 'EnumType.STRING'`，命中即 fail。
- **对应门禁**: fw_jpa_enum_ordinal(fail)

```verify
id: spring-data-jpa-r12
cmd: grep -rnE '@Enumerated' --include='*.java' "${PROJECT_DIR}" | grep -v 'EnumType.STRING'
expect: hits>0
```

### 规律：列表查询接口须 Pageable 分页，禁止无界 List 全量加载
- **适用版本**: Spring Data JPA 3.4.x–4.x 全版本
- **规律**: Repository 派生查询 `List<Order> findByStatus(...)` 不带 `Pageable` 时按条件全量加载，数据量增长即 OOM/慢查询。对外/列表场景必须 `Page<T> findByX(..., Pageable pageable)` 或 `Slice<T>`（不要 count 时用 Slice）；确需全量的内部小表须在方法注释说明。
- **违反后果**: 大表全量加载 OOM；接口响应时间随数据量线性劣化。
- **验证方法**: Repository 文件中 `List<...> (find|get|query|list|search)Xxx(...)` 方法签名无 `Pageable` 参数 → warn。
- **对应门禁**: fw_jpa_pagination(warn)

```verify
id: spring-data-jpa-r13
cmd: 
expect: always
```

### 规律：@Query JPQL 实体名/字段名是字符串引用，改实体必同步（横向清剿轮）
- **适用版本**: Spring Data JPA 3.x/4.x 全版本
- **规律**: `@Query("select o from Order o where o.status = ?1")` 中的实体名（Order）与字段名（o.status）是对 @Entity 类与属性的字符串引用——JPQL 在容器启动创建 repository proxy 时才解析，编译期完全不校验。实体重命名后 @Query 内旧名漂移，IDE 重构也不跟进注解字符串。字段级引用（o.status）须入 §8 字段级映射台账；字段暴露于 API JSON 时同查契约面（前端调用点/契约测试/fixtures，spec 四查④——R59 清剿）。
- **违反后果**: 启动期 IllegalArgumentException（org.hibernate.hql.internal.ast.QuerySyntaxException）或更隐蔽的运行期语义漂移；CI 不跑容器测试则上线才炸。
- **验证方法**: 提取 @Query 值内 from/join 后的实体名词，逐一在源码集中定位 <Entity>.java，失配即 warn（字段级静态解析成本高，台账覆盖）。
- **对应门禁**: fw_jpa_jpql_entity(warn)

```verify
id: spring-data-jpa-r14
cmd: 
expect: always
```

<!--
共 14 条规律（≥12 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_jpa_nplus1 | warn | 有 @(OneToMany\|ManyToMany) 但无 @EntityGraph/JOIN FETCH/@BatchSize/batch_size → warn N+1 (CWE-1049) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_eager_to_many | warn | @(OneToMany\|ManyToMany)(...FetchType.EAGER 命中 → warn 笛卡尔积 (CWE-400) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_osiv | warn | open-in-view=true → warn；JPA 项目无 open-in-view: false 显式配置 → warn（默认 true）(n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_readonly | warn | 含 @Transactional + find/get/list/query/search 方法但全文无 readOnly → warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_auditing | warn | 有 @CreatedDate 等审计注解但无 @EnableJpaAuditing → warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_pessimistic_lock | warn | @Lock(...PESSIMISTIC...) 无 lock.timeout/@QueryHints → warn 死锁风险 (CWE-667) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_optimistic_lock | warn | 有 @Version 但无 OptimisticLock 异常处理 → warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_save_merge | warn | 同文件 .setId( 与 .save( 并存 → warn detached merge 覆盖语义 (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_lazy_exception | warn | to-many + open-in-view: false + 全项目无 @Transactional → warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_modifying | warn | @Modifying 无 clearAutomatically/flushAutomatically → warn 上下文脏读 (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_equals_hashcode | warn | @Entity + @Data/@EqualsAndHashCode（无 exclude/onlyExplicitlyIncluded）→ warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_enum_ordinal | fail | @Enumerated 未带 EnumType.STRING → fail（ORDINAL 重排错位）(n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_pagination | warn | Repository 中 List<...> find/get/query/list/search 方法无 Pageable → warn (n/a) | SPRINGJPA_SRC_GLOBS |
| fw_jpa_jpql_entity | warn | @Query JPQL from/join 实体名在源码集中定位，失配即 warn | SPRINGJPA_SRC_GLOBS | —（JPQL↔实体一致性） |

<!--
门禁 id 命名规范：fw_jpa_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/spring-data-jpa.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_jpa_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: spring-data-jpa  requires_conf: SPRINGJPA_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 @OneToMany 无 @EntityGraph（N+1 warn）+ @Enumerated 无类型（ORDINAL fail 主触发）；compliant 用 @EntityGraph + EnumType.STRING + open-in-view:false + @EnableJpaAuditing 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| spring-data-jpa × lombok | @Entity 禁 @Data 全字段（含懒加载关联进 equals/toString）；用 @Getter/@Setter + 业务键 equals | 见 fw_jpa_equals_hashcode：N+1/栈溢出/hashCode 不稳定 |
| spring-data-jpa × spring-security | 审计 @CreatedBy/@LastModifiedBy 须 `AuditorAware` 从 SecurityContextHolder 取当前用户；须 @EnableJpaAuditing(auditorAwareRef=...) | 无 AuditorAware 时 @CreatedBy 永远 null |
| spring-data-jpa × mapstruct | 实体转 DTO 在事务外进行时，未初始化的 LAZY 关联映射会抛 LazyInitializationException；DTO 投影优先于实体映射 | MapStruct 生成代码遍历 getter，触发懒加载；须 EntityGraph 或 DTO 投影 |
| spring-data-jpa × sharding-jdbc/shardingsphere | @Modifying 批量 UPDATE/DELETE 的 WHERE 须含分片键；@Lock(PESSIMISTIC_WRITE) 在分库下锁不跨库生效 | 分片键缺失触发全库广播；悲观锁仅锁单库行 |
| spring-data-jpa × mybatis | 混合使用时同一聚合根的写路径二选一（JPA 或 MyBatis），避免双写路径缓存不一致 | Hibernate 一级/二级缓存感知不到 MyBatis 直写的 SQL |

<!--
无强交互的框架组合省略；本表聚焦 spring-data-jpa 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Spring Boot 2.x | `spring.jpa.open-in-view` 默认 true（沿用至今） | OSIV 反模式默认开启，须显式 false |
| Spring Data JPA 3.0（2022.0 train） | javax → jakarta 命名空间迁移终态 | `javax.persistence.*` 全部失效，须 `jakarta.persistence.*` |
| Spring Data JPA 3.2 | 派生查询支持 `ScrollPosition` 游标滚动；`@Query` SpEL 增强 | 深分页可用 keyset 滚动替代 offset |
| Spring Data JPA 3.4（2024.1 train） | 对应 Boot 3.4；Hibernate 6.6；`Limit`/`First` 派生关键字增强 | 旧 `findTop10By` 语义不变 |
| Spring Data JPA 4.0（2025.x train） | 对应 Boot 4.0；Hibernate ORM 7.x（待验证精确小版本）；jakarta 终态 | 待验证：Hibernate 7 行为差异（如 `hibernate.query.null_comparison` 默认收紧）须人工核对迁移指南 |
| Spring Data JPA 4.1 | 现行版本（2026-07 调研时 spring.io 首页展示 4.1.0）；具体变更点待验证（未逐条核对 release notes） | 待验证：规律按 3.4/4.x 通用面陈述，4.1 特有变更须人工核实 |
| Hibernate ORM 7.x | `hibernate.id.sequence_increment_size` 等默认值调整（待验证）；Jakarta Persistence 3.2 对齐 | 待验证：序列/标识生成行为差异须回归测试 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
