---
ruleset_id: mybatis
适用版本: mybatis 3.5.10–3.5.19 / mybatis-plus 3.5.5–3.5.17 / mybatis-spring-boot-starter 3.0.x（差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/mybatis/mybatis-3/releases ；https://mybatis.org/mybatis-3/sqlmap-xml.html ；https://mybatis.org/mybatis-3/dynamic-sql.html ；https://mybatis.org/mybatis-3/configuration.html ；https://github.com/baomidou/mybatis-plus/releases ；https://baomidou.com/plugins/pagination/ ；https://baomidou.com/guides/logic-delete/ ；https://github.com/mybatis/spring-boot-starter/blob/master/mybatis-spring-boot-autoconfigure/src/main/java/org/mybatis/spring/boot/autoconfigure/MybatisProperties.java）
深度门槛: 15
---

# MyBatis 规则集

<!--
本规则集为 P1 首批框架规则集，是后续所有框架任务的完整范例。
覆盖范围：MyBatis 3.5.x（mybatis-3）+ MyBatis-Plus 3.5.x（baomidou）+ mybatis-spring-boot-starter 3.0.x。
调研时点：2026-07-17，已核对 mybatis-3 最新发布为 3.5.19（2026-01），mybatis-plus 最新为 3.5.17（2026-07-08）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.mybatis:mybatis` / `org.mybatis:mybatis-spring` / `org.mybatis.spring.boot:mybatis-spring-boot-starter` / `com.baomidou:mybatis-plus` / `com.baomidou:mybatis-plus-boot-starter` | 高 |
| 文件 | `**/resources/**/*Mapper.xml` / `**/mapper/**/*.xml` / `mybatis-config.xml` | 高 |
| 注解 | `@Mapper` / `@MapperScan` / `@Intercepts` / `@TableLogic` / `@TableName` / `@TableId` / `@TableField` | 高 |
| 配置 | `mybatis.mapper-locations` / `mybatis.type-aliases-package` / `mybatis-plus.global-config.db-config.*` / `mybatis-plus.global-config.enable-aggressive` | 高 |
| 代码 | `extends BaseMapper<` / `implements TypeHandler<` / `extends MybatisPlusInterceptor` / `SqlSessionFactoryBean` / `MapperScannerConfigurer` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 mybatis 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Mapper XML：`find "${PROJECT_DIR}" -type f -name '*Mapper.xml' -not -path '*/target/*'`（计数核验基准：XML 文件个数 = `find … | wc -l`）
- Mapper 接口：`grep -rlE '@Mapper\b|@MapperScan\b|extends BaseMapper<' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含以上任一特征行的 .java 文件数 = `grep -l … | wc -l`）
- Mapper namespace：`grep -rh '<mapper namespace=' $(find ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"} -type f -name '*Mapper.xml')`（计数核验基准：含 `<mapper namespace=` 的 XML 文件数）
- foreach 节点：`grep -rc '<foreach' $(find … -name '*Mapper.xml') | awk -F: '{s+=$2} END{print s+0}'`
- ${} 占位：`grep -rn '\${' $(find ${MYBATIS_MAPPER_DIRS[@]+"${MYBATIS_MAPPER_DIRS[@]}"} -type f -name '*.xml')`
- resultMap：`grep -rE '<resultMap\b' $(find … -name '*Mapper.xml')`
- MP Wrapper：`grep -rlE '\.last\(|\.having\(|\.apply\(' "${PROJECT_DIR}" --include='*.java'`
- 二级缓存：`grep -rn '<cache\b' $(find … -name '*Mapper.xml')`
- 分页插件注册：`grep -rn 'PaginationInnerInterceptor' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：#{} 与 ${} 分工，值参数必须用 #{} 或经白名单
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `#{name}` 生成 `PreparedStatement` 占位符，参数安全绑定；`${name}` 为原始字符串替换，无转义。凡接受用户/外部输入的值参数禁止 `${}`；仅限表名、列名、排序方向等结构性标识可用 `${}`，且必须经应用层枚举/白名单校验。
- **违反后果**: SQL 注入（CWE-89）。官方文档明确："It's not safe to accept input from a user and supply it to a statement unmodified in this way"。
- **验证方法**: 在 `MYBATIS_MAPPER_DIRS` 范围内 `grep -n '\${' *.xml`，命中行须在 `SQL_INJECTION_WHITELIST` 内（如 `ORDER BY ${orderBy}` 的 `orderBy` 在白名单），否则即违规。
- **对应门禁**: fw_mybatis_dollar(fail)

```verify
id: mybatis-r1
cmd: grep -n '\${' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Mapper 接口 ↔ XML namespace 必须一一绑定
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: 每个 `@Mapper` / `@MapperScan` / `extends BaseMapper<>` 接口（含完全限定名）必须有同名 `<mapper namespace="完全限定名">` 的 XML 对应；反之每个 mapper XML 的 namespace 必须能在源码中找到对应接口，避免"接口声明了但 XML 缺失"或"XML 孤儿"导致 `BindingException: Invalid bound statement`。
- **违反后果**: 启动期/运行期 `org.apache.ibatis.binding.BindingException: Invalid bound statement (not found)`，MyBatis-Plus 项目还会出现 BaseMapper 默认方法缺失。
- **验证方法**: `mcnt = grep -lE '@Mapper|extends BaseMapper' $(MYBATIS_SRC_GLOBS)` 的文件数；`xcnt = grep -l '<mapper namespace=' $(MYBATIS_MAPPER_DIRS)/*.xml` 的文件数；当 `MYBATIS_SRC_GLOBS` 非空时要求 `mcnt == xcnt`。
- **对应门禁**: fw_mybatis_binding(fail)

```verify
id: mybatis-r2
cmd: mcnt = grep -lE '@Mapper|extends BaseMapper' $(MYBATIS_SRC_GLOBS)
expect: hits>0
```

### 规律：`<foreach>` IN 列表须人工确认 size 上限
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `<foreach>` 用于构造 IN 列表（`collection/item/index/open/close/separator`）。MyBatis 官方 dynamic-sql 文档未提供 size 上限指引，但 MySQL `max_allowed_packet`、Oracle `1000 项 IN 限制`、PostgreSQL `65535` 参数上限都会在 size 过大时报错或 OOM。生成代码须对每个 `<foreach>` 标注"需上层做分批（典型阈值 1000/批）"。
- **违反后果**: 运行期 `Packet too large` / `ORA-01795` / OOM / 超长 SQL 执行计划退化。
- **验证方法**: `grep -c '<foreach' *.xml` 命中即 warn（提示人工确认分批策略），不 fail（阈值因库而异）。
- **对应门禁**: fw_mybatis_foreach(warn)

```verify
id: mybatis-r3
cmd: grep -c '<foreach' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：MyBatis-Plus 分页必须用 Page 对象 + PaginationInnerInterceptor
- **适用版本**: mybatis-plus 3.5.x 全版本
- **规律**: MP 分页是物理分页，须 (a) 注册 `MybatisPlusInterceptor` 并 `addInnerInterceptor(new PaginationInnerInterceptor(DbType.MYSQL))`，(b) 调用方传入 `IPage/Page` 对象作为 Mapper 方法首参；否则 `selectList` 不会自动加 LIMIT，全表加载。
- **违反后果**: 内存溢出 / DB 端大结果集；分页失效返回全量数据。
- **验证方法**: 在源码中检测 `extends BaseMapper` 项目里 `selectList(` 行附近未出现 `Page` 参数 → warn（人工核实是否有意为之）。
- **对应门禁**: fw_mybatis_plus_page(warn)

```verify
id: mybatis-r4
cmd: 
expect: always
```

### 规律：MP 3.5.x 单数据库应显式声明 DbType
- **适用版本**: mybatis-plus 3.5.5+（推荐项，官方文档措辞"建议单一数据库类型的均设置 dbType"）
- **规律**: `PaginationInnerInterceptor` 有无参构造与 `PaginationInnerInterceptor(DbType)` 两种。多数据源场景用无参让插件自动方言推断；单数据源场景官方文档建议显式传 `DbType.MYSQL`/`DbType.POSTGRE_SQL` 等，避免自动推断失败导致分页 SQL 错误。
- **违反后果**: 方言自动推断失败 → 生成错误分页 SQL（如对 Oracle 用了 LIMIT）→ 运行期 SQL 异常。
- **验证方法**: 源码 `grep -n 'PaginationInnerInterceptor' *.java`，若仅 `new PaginationInnerInterceptor()` 无参且非多数据源项目 → warn（提示加 DbType）。
- **对应门禁**: fw_mybatis_plus_dbtype(warn)

```verify
id: mybatis-r5
cmd: grep -n 'PaginationInnerInterceptor' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：resultMap 嵌套 select 须防 N+1
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `<association select="…">` / `<collection select="…">` 触发嵌套查询，列表场景下会产生 N+1 查询。官方文档明确警告："will not perform well for large data sets or lists" 和 "could result in hundreds or thousands of SQL statements"。须改用 nested result（JOIN 一次性取回）或显式 `fetchType="lazy"` + 业务侧避免立即遍历。
- **违反后果**: N+1 查询风暴，列表场景慢百倍以上。
- **验证方法**: `grep -rnE '<(association|collection)[^>]*\bselect=' *.xml`，命中即 warn（提示核对是否列表场景）。
- **对应门禁**: fw_mybatis_nplus1(warn)

```verify
id: mybatis-r6
cmd: grep -rnE '<(association|collection)[^>]*\bselect=' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：resultMap id 标签不可省略
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: 多行 JOIN 结果靠 `<id>` 判定对象唯一性去重。官方文档："specifying identifier properties prevents severe performance costs" 且嵌套映射缺 `<id>` 会出现对象重复、性能退化。
- **违反后果**: 嵌套结果集对象重复 / 内存膨胀 / 去重失败。
- **验证方法**: 对含 `<resultMap>` 的 XML，每个 `<resultMap>` 体须含 `<id ` 或显式注释说明无主键。
- **对应门禁**: fw_mybatis_resultmap_id(warn)

```verify
id: mybatis-r7
cmd: 
expect: always
```

### 规律：`<if test="">` OGNL 空串/0 陷阱
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: OGNL 中 `<if test="status != null and status != ''">` 对数值类型永远不进 `''` 分支（数值与空串比较被 OGNL 当作 0）；字符串为空才该判空，数值应仅判 `!= null`。
- **违反后果**: 数值字段为 0 时被误判为"空"而漏拼条件，SQL 缺 WHERE 导致全表更新/查询。
- **验证方法**: `grep -rnE '<if test="[^"]*!= *'"'' *.xml`，命中即 warn 提示复核参数类型。
- **对应门禁**: fw_mybatis_ognl_empty(warn)

```verify
id: mybatis-r8
cmd: grep -rnE '<if test="[^"]*!= *'"'' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：动态表名/列名只能用 ${} 且必须枚举校验
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: 表名、列名、排序方向无法用 `#{}` 参数化（JDBC 不支持占位符出现在这些位置），必须 `${}`；但所有 `${}` 须在应用层做枚举/白名单校验（如 `if (!ALLOWED_COLUMNS.contains(col)) throw`），绝不可直接转发用户输入。
- **违反后果**: SQL 注入 CWE-89。
- **验证方法**: 与规律1同一机制——所有 `${}` 必须命中 `SQL_INJECTION_WHITELIST`。
- **对应门禁**: fw_mybatis_dollar(fail)

```verify
id: mybatis-r9
cmd: 
expect: always
```

### 规律：useGeneratedKeys 批量插入受限
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `useGeneratedKeys="true" keyProperty="id"` 仅对单条 INSERT 或 MySQL 多值 `INSERT … VALUES (...),(...)` 生效回填主键；对 Oracle 等使用 `<foreach>` 拼多条独立 INSERT 时回填行为不保证。批量插入推荐 MyBatis-Plus `BaseMapper.insertBatch` 或 `SqlSession` 批处理 + `rewriteBatchedStatements=true`。
- **违反后果**: 批量插入后实体无主键 / 部分驱动报 `Generated keys not requested`。
- **验证方法**: `grep -rn 'useGeneratedKeys' *.xml` 命中行附近若同时有 `<foreach>` 且驱动非 MySQL → warn。
- **对应门禁**: fw_mybatis_generatedkeys(warn)

```verify
id: mybatis-r10
cmd: grep -rn 'useGeneratedKeys' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：`<select>` 不可同时声明 resultType 与 resultMap
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: 单条 `<select>` 只能取其一：`resultType` 用于简单自动映射；`resultMap` 用于复杂映射。两者并存在不同版本下行为不一致（旧版以 resultType 为准、新版以 resultMap 为准），属配置反模式。
- **违反后果**: 映射行为不可预期，跨版本升级易出 bug。
- **验证方法**: `grep -rnE '<select[^>]*\bresultType=[^>]*\bresultMap=' *.xml` 命中即 fail。
- **对应门禁**: fw_mybatis_select_dup_result(fail)

```verify
id: mybatis-r11
cmd: grep -rnE '<select[^>]*\bresultType=[^>]*\bresultMap=' --include='*.xml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：`#{param}` NULL 值须显式 jdbcType 防 TypeHandler 失配
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: 当参数可能为 NULL 时，`#{name}` 在某些 jdbcType 下会以默认 TypeHandler 处理 NULL，导致 `SQLException: Invalid column type`（Oracle 尤为敏感）。推荐 `#{name, jdbcType=VARCHAR}` 等显式 jdbcType。官方配置文档："MyBatis therefore uses the combination javaType=…, jdbcType=null to choose a TypeHandler."
- **违反后果**: Oracle 等库对 NULL 参数报 `Invalid column type`。
- **验证方法**: 检查参数是否可能为 NULL（业务层 nullable）且 `#{name}` 未带 `jdbcType` → warn。
- **对应门禁**: fw_mybatis_jdbc_type(warn)

```verify
id: mybatis-r12
cmd: 
expect: always
```

### 规律：二级缓存跨 namespace 关联须 cache-ref 或禁用
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `<cache/>` 作用于当前 namespace；当 `<association>`/`<collection>` 跨 namespace 取数据时，被关联 namespace 的 DML 不会自动刷本 namespace 缓存，导致脏读。官方文档建议跨 namespace 共享缓存用 `<cache-ref namespace="…"/>`，或干脆在多表关联场景禁用二级缓存。
- **违反后果**: 关联表更新后读到旧关联对象。
- **验证方法**: 含 `<cache/>` 的 namespace 同时出现 `association`/`collection select=` 引用其他 namespace → warn。
- **对应门禁**: fw_mybatis_cache_dirty(warn)

```verify
id: mybatis-r13
cmd: 
expect: always
```

### 规律：MP 逻辑删除须全局配置 + SQL 不得手写 deleted 条件
- **适用版本**: mybatis-plus 3.5.x 全版本
- **规律**: 逻辑删除由 MP 拦截器在所有 select/update/delete 自动追加 `deleted=0` 条件。手写 SQL 中再写 `deleted` 条件会与拦截器叠加造成 `deleted=0 and deleted=0`，或反之绕过拦截。须 (a) `mybatis-plus.global-config.db-config.logic-delete-field=deleted`，(b) 实体字段 `@TableLogic`，(c) 业务 SQL 不重复出现 deleted 条件。
- **违反后果**: 逻辑删除条件叠加或绕过；查询到已删数据。
- **验证方法**: 配置项缺失或 XML/Wrapper 中手写 `deleted=` 条件 → warn。
- **对应门禁**: fw_mybatis_logic_delete(warn)

```verify
id: mybatis-r14
cmd: 
expect: always
```

### 规律：MP Wrapper last()/having()/apply() 字符串列名注入面
- **适用版本**: mybatis-plus 3.5.x 全版本（3.5.7 起 `UpdateWrapper` 新增 `checkSqlInjection` 可选）
- **规律**: `QueryWrapper.last("limit 1")` / `.having("sum > {0}", val)` / `.apply("status = {0}", val)` 接受原始 SQL 片段，参数化部分安全但 SQL 结构部分等同于 `${}`。3.5.7 引入 `UpdateWrapper.checkSqlInjection(true)` 开启字符串注入检查；建议所有 Wrapper 字符串 API 都开启。
- **违反后果**: 调用方误传用户输入到 `last()` 等方法 → SQL 注入 CWE-89。
- **验证方法**: `grep -rnE '\.(last|having|apply)\([^)]' *.java` 命中即 warn 提示核对参数来源。
- **对应门禁**: fw_mybatis_wrapper_injection(warn)

```verify
id: mybatis-r15
cmd: grep -rnE '\.(last|having|apply)\([^)]' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：mybatis-spring-boot-starter mapperLocations 须显式配置
- **适用版本**: mybatis-spring-boot-starter 3.0.x
- **规律**: 官方 `MybatisProperties.mapperLocations` 字段无默认值（源码 `private String[] mapperLocations;` 无 `@Value` 默认），若不配置 `mybatis.mapper-locations` 则不扫描任何 XML，Mapper 接口与 XML 绑定失效。典型配置：`mybatis.mapper-locations=classpath*:mapper/**/*.xml`。
- **违反后果**: 启动期不报错，但运行期 `BindingException: Invalid bound statement (not found)`。
- **验证方法**: `application*.yml` 缺 `mybatis.mapper-locations` 且 `*Mapper.xml` 存在 → warn。
- **对应门禁**: fw_mybatis_mapper_locations(warn)

```verify
id: mybatis-r16
cmd: 
expect: always
```

### 规律：多数据源下 SqlSessionFactory 须物理隔离
- **适用版本**: mybatis-spring / mybatis-plus 3.5.x 全版本
- **规律**: 多数据源场景每个 DataSource 须独立 `SqlSessionFactoryBean` + 独立 `MapperScannerConfigurer`（或用 `dynamic-datasource` / MP `@DS` 路由）。共用一个 SqlSessionFactory 会因 Configuration 单例导致 mapper statement 注册冲突或路由错乱。
- **违反后果**: 跨库 Mapper 误路由 / Configuration 冲突。
- **验证方法**: 多个 `DataSource` Bean 共用同一 `SqlSessionFactory` Bean → warn。
- **对应门禁**: fw_mybatis_multi_ds_isolation(warn)

```verify
id: mybatis-r17
cmd: 
expect: always
```

### 规律：TypeHandler 注册须 XML 或 @MappedTypes 全覆盖
- **适用版本**: mybatis 3.5.x 全版本（3.4.0+ 起单一 TypeHandler 可作为某 Java 类型默认）
- **规律**: 自定义 `TypeHandler` 须在 `<typeHandlers>` 显式 `<typeHandler handler="…"/>` 或 `<package name="…"/>` 自动扫描（自动扫描时 jdbcType 只能用注解声明）。漏注册时 MyBatis 退回内置 TypeHandler，枚举/JSON 等自定义类型映射错乱。mybatis-spring-boot-starter 下也支持 `mybatis.type-handlers-package` 扫描。
- **违反后果**: 自定义类型未走自定义 TypeHandler，序列化/反序列化错乱（如 JSON 字段退回字符串）。
- **验证方法**: 自定义 TypeHandler 类存在但 mybatis-config.xml / 配置中未注册 → warn。
- **对应门禁**: fw_mybatis_typehandler(warn)

```verify
id: mybatis-r18
cmd: 
expect: always
```

### 规律：resultMap property 与实体字段必须同步（字符串耦合，编译/启动零校验）
- **适用版本**: mybatis 3.5.x 全版本
- **规律**: `resultMap` 的 `property="x"` 是对实体字段的**字符串引用**——实体改字段名后 XML 不同步，编译不报错、启动不报错，运行期该列静默丢值（column 映射不上 → 字段 null）。改实体字段的完整同步面 = resultMap property + SQL 列清单 + 批处理 reader SQL 列 + `@TableField` + DDL 迁移；影响面反查必须查 `relations.jsonl` 的 `data-mapping`/`mapper-binding` 边（Java import 边查不到 XML）。判定宽松：property 词在实体（含一层父类）任意出现即算同步——重命名后旧词完全消失才 fail。
- **违反后果**: 运行期静默数据丢失（字段恒 null / 更新漏列），无异常栈，靠业务对账才能发现。
- **验证方法**: 对每个 `<resultMap type="X">` 提取全部 `property=`，逐一在 X.java（及其 extends 父类）词边界 grep；实体无法唯一定位（同名类多文件）时跳过（机械不猜）。
- **对应门禁**: fw_mybatis_field_sync(fail)

```verify
id: mybatis-r19
cmd: 
expect: always
```

<!--
共 19 条规律（≥15 门槛）。每条规律均挂门禁 id 或人工检查，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_mybatis_dollar | fail | XML 中 `${}` 命中行必须落入 SQL_INJECTION_WHITELIST，否则 SQL 注入风险 | MYBATIS_MAPPER_DIRS SQL_INJECTION_WHITELIST | CWE-89（SQL 注入，Top25:2025 #2） |
| fw_mybatis_binding | fail | MYBATIS_SRC_GLOBS 非空时 Mapper 接口数(mcnt) = XML namespace 数(xcnt)；空 SRC_GLOBS 跳过 | MYBATIS_MAPPER_DIRS MYBATIS_SRC_GLOBS | —（绑定一致性） |
| fw_mybatis_foreach | warn | 存在 `<foreach>` 即提示人工确认 IN 列表分批上限 | MYBATIS_MAPPER_DIRS | CWE-770（IN 列表无上限，资源分配无节制） |
| fw_mybatis_plus_page | warn | MP 项目（检出 `extends BaseMapper`）中 `selectList(` 行附近无 Page → warn | MYBATIS_MAPPER_DIRS MYBATIS_SRC_GLOBS | —（分页契约） |
| fw_mybatis_plus_dbtype | warn | `PaginationInnerInterceptor()` 无参且非多数据源 → warn 显式 DbType | MYBATIS_SRC_GLOBS | —（方言配置一致性） |
| fw_mybatis_nplus1 | warn | `<association select=` / `<collection select=` 命中即 warn 核对列表场景 | MYBATIS_MAPPER_DIRS | CWE-400（嵌套 select 逐行查询，资源消耗放大） |
| fw_mybatis_resultmap_id | warn | 含 `<resultMap>` 的 XML 中每个 resultMap 须含 `<id` | MYBATIS_MAPPER_DIRS | —（映射一致性） |
| fw_mybatis_ognl_empty | warn | `<if test="…!= ''">` 命中提示复核参数类型 | MYBATIS_MAPPER_DIRS | —（逻辑陷阱） |
| fw_mybatis_generatedkeys | warn | `useGeneratedKeys` + `<foreach>` 多值插入 → 提示驱动兼容 | MYBATIS_MAPPER_DIRS | —（驱动兼容） |
| fw_mybatis_select_dup_result | fail | `<select>` 同行同时声明 resultType 与 resultMap → fail | MYBATIS_MAPPER_DIRS | —（行为跨版本不一致） |
| fw_mybatis_jdbc_type | warn | 可空参数 `#{name}` 未带 `jdbcType` → warn | MYBATIS_MAPPER_DIRS | —（类型失配防护） |
| fw_mybatis_cache_dirty | warn | 含 `<cache/>` 且跨 namespace select 关联 → warn 脏读风险 | MYBATIS_MAPPER_DIRS | —（缓存一致性） |
| fw_mybatis_logic_delete | warn | MP 项目 XML/Wrapper 手写 `deleted=` → warn 拦截器叠加 | MYBATIS_MAPPER_DIRS MYBATIS_SRC_GLOBS | —（拦截器叠加） |
| fw_mybatis_wrapper_injection | warn | `.last(`/`.having(`/`.apply(` 命中 → warn 核对参数来源 | MYBATIS_SRC_GLOBS | CWE-89（Wrapper 字符串拼接注入面） |
| fw_mybatis_mapper_locations | warn | 配置缺 `mybatis.mapper-locations` 且有 Mapper.xml → warn | MYBATIS_MAPPER_DIRS | —（装配完整性） |
| fw_mybatis_multi_ds_isolation | warn | 多 DataSource 共用 SqlSessionFactory → warn | MYBATIS_SRC_GLOBS | —（隔离配置） |
| fw_mybatis_typehandler | warn | 自定义 TypeHandler 类存在但未注册 → warn | MYBATIS_SRC_GLOBS | —（注册完整性） |
| fw_mybatis_field_sync | fail | resultMap `property=` 词在 `type` 实体（含一层父类）词边界零出现 → fail（漏改字段：改实体字段名未同步 XML） | MYBATIS_MAPPER_DIRS MYBATIS_SRC_GLOBS | —（字段级映射一致性，漏改字段防线） |

<!--
门禁 id 命名规范：fw_mybatis_<rule>（rule 全小写下划线）。
本表 18 条 id 须在 assets/framework-gates/mybatis.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_mybatis_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: mybatis  requires_conf: VAR1 VAR2` 声明。
fixture 验证覆盖 dollar/binding/select_dup_result/field_sync 四 fail（violating：${col} 未白名单 + 接口数≠namespace 数 + resultType/resultMap 并存 + resultMap property 引用实体已改名旧字段；expected-fail-ids 4/4 已登记）；compliant 全 pass（实体+接口+resultMap 全同步正路径，含一层父类解析）。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| mybatis × sharding-jdbc/shardingsphere | DML 的 WHERE 必须含分片键；Mapper 接口避免跨库 JOIN | 分片键缺失触发全库广播路由，分库 JOIN 不支持；ShardingSphere 拦截器在 MyBatis Executor 之前改写 SQL，依赖 WHERE 含分片键 |
| mybatis × lombok | 实体上 `@Data` 须排除懒加载关联字段（`@Data @EqualsAndHashCode(exclude={"lazyField"})` 或字段级 `@Getter(lazy=true)`） | 懒加载字段在 `toString/equals` 序列化时被强制触发 → N+1 / Session 已关闭异常；lombok `@Getter(lazy=true)` 返回的是 `Optional` 包装 |
| mybatis × spring-boot | `@MapperScan(basePackages=…)` 与 `@Mapper` 二选一，不重复扫描；`@MapperScan` 优先（批量） | 两者并存会让同一接口被重复注册为 Bean，Spring 报 `BeanDefinitionStoreException`；`@MapperScan` 一次性扫包，`@Mapper` 逐个标注，二选一即可 |
| mybatis-plus × dynamic-datasource | `@DS("slave")` 标注在 Service/Mapper 方法上；分页插件的 DbType 与多数据源项保持一致或用无参构造 | `@DS` AOP 在 MP 插件执行前切换 DataSource；分页插件需感知当前方言，多数据源下用无参 `PaginationInnerInterceptor()` 自动推断 |
| mybatis × spring-cloud | 多服务共用同一 Mapper 接口包名时，`@MapperScan` 须加 `basePackages` 显式区分 | 否则跨服务 Bean 扫描冲突，启动期 `ConflictingBeanDefinitionException` |

<!--
无强交互的框架组合省略；本表聚焦 mybatis 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| mybatis 3.5.10 | `<idArg />` 可列在 `<arg />` 之后；新增 `argNameBasedConstructorAutoMapping` | 构造器映射顺序约束放宽；旧代码顺序不一致不影响 |
| mybatis 3.5.11 | 修 OGNL 调继承方法抛 `IllegalArgumentException`；修 `returnInstanceForEmptyRow` 不作用于构造器自动映射 | `<if test="">` 表达式行为稳定；空行映射更一致 |
| mybatis 3.5.12 | 修"按名引用集合参数失败"；新增按 namespace+id 解析 resultType | `<foreach collection="list">` 行为稳定；可省略 resultType |
| mybatis 3.5.13 | 修属性 getter 返回类型不同时 resultType 无法解析 | 接口/抽象基类 getter 返回类型差异不再影响映射 |
| mybatis 3.5.14 | 修 Discriminator 不作用于构造器映射；修匿名枚举不使用注册 TypeHandler | 自定义枚举 TypeHandler 须核实是否生效 |
| mybatis 3.5.16 | 安全修复：阻止 Invocation 被易受攻击应用使用 | 影响 `${}` 表达式安全收紧，部分 OGNL 调用受限 |
| mybatis 3.5.17 | NClobTypeHandler 改用 national charset 方法 | NCLOB 列映射行为变化，需回归 |
| mybatis 3.5.18 | automapping 错误改抛有用异常替代 `IndexOutOfBoundsException` | 排错信息更友好，旧依赖异常类型的测试须调整 |
| mybatis 3.5.19 | 回退 3.5.18 引入的 #3349 回归 | 若已升级到 3.5.18 须跟进 3.5.19 |
| mybatis-plus 3.5.6 | 升级 mybatis 至 3.5.16；`sqlFirst`/`sqlComment` 不再转义（须手动转义） | MP Wrapper 的 `last()` 注入面扩大——规律 fw_mybatis_wrapper_injection 适用 |
| mybatis-plus 3.5.7 | `BaseMapper` 新增批量操作与 InsertOrUpdate 方法；逻辑删除默认支持填充；`UpdateWrapper` 增 `checkSqlInjection` | 批量插入不必再手写 foreach；逻辑删除字段填充逻辑变化；Wrapper 注入检查可选开启 |
| mybatis-plus 3.5.8 | jsqlParser 升至 5.0（待验证：具体 API 改名/字段可见性变化未联网核实 release notes） | jsqlParser 5.0 解析行为变化可能影响 MP Wrapper SQL 生成；API 名/字段变化待人工核实 release notes |
| mybatis-plus 3.5.10 | 待验证：未联网核实 release notes，沿用 3.5.8 起的迁移趋势 | 旧 API 迁移（须人工核实 3.5.10 具体变更） |
| mybatis-plus 3.5.17 | 最新发布（2026-07-08） | 待验证：本版无破坏性变更清单公开，规律基于 3.5.x 通用项 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
