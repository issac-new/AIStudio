---
ruleset_id: typeorm
适用版本: TypeORM 0.3.x（维护线，2026-07 最新 0.3.31）/ 1.x（v1.0.0 GA 2026-05-19，最新 1.1.0 2026-07-13；breaking 细节待验证，差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/typeorm/typeorm/releases ；https://typeorm.io/docs/advanced-topics/migrations/ ；https://typeorm.io/ ）
深度门槛: 10
---

# TypeORM 规则集

<!--
本规则集以 TypeORM 0.3.x（DataSource API 线）为主体。2026-07-17 联网核实 GitHub releases：
v1.0.0 于 2026-05-19 GA（含 breaking changes 与 0.3.x 升级指南），1.1.0 为 latest（2026-07-13），
0.3.x 维护线同日发 0.3.31（backport 修复）。v1 breaking 细节（官方升级指南正文）未成功联网核实，
相关规律按 0.3.x 行为陈述并标"待验证"。核心机理：迁移不可变、synchronize 生产禁用、
N+1 与 relations、事务 QueryRunner/回调 EntityManager、@Transaction 装饰器 0.3.x 已废弃。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `package.json` 含 `"typeorm"` / `"@nestjs/typeorm"` / `"typeorm-naming-strategies"` | 高 |
| 注解/装饰器 | `@Entity` / `@Column` / `@PrimaryGeneratedColumn` / `@ManyToOne` / `@OneToMany` / `@Index` | 高 |
| 文件 | `**/data-source.ts` / `**/ormconfig.json` / `**/migrations/*.ts`（含 `MigrationInterface`） | 中（migrations 目录须组合 MigrationInterface 确认） |
| 配置 | `new DataSource({...})` / `createConnection(` / `synchronize:` / `migrationsRun:` | 高 |
| 代码 | `getRepository(` / `createQueryBuilder(` / `QueryRunner` / `EntityManager` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 typeorm 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 实体类：`grep -rlE '@Entity\b' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：含 @Entity 的 .ts 文件数）
- 迁移类：`grep -rlE 'MigrationInterface' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：迁移文件数）
- 关联装饰器：`grep -rnE '@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：关联声明行数）
- 事务块：`grep -rnE '\.transaction\(|startTransaction' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：事务调用行数）
- 查询构建器：`grep -rnE 'createQueryBuilder\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：QB 调用行数）
- DataSource 配置：`grep -rlnE 'new DataSource\(|createConnection\(' "${PROJECT_DIR}" --include='*.ts'`（计数核验基准：数据源配置文件数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：synchronize 生产必须 false（schema 漂移即数据事故）
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `synchronize: true` 让 TypeORM 启动时按实体定义自动 ALTER 库表。生产开启后，实体字段删除/类型修改直接 DROP COLUMN/改类型，数据不可恢复。生产必须 `synchronize: false` + 迁移驱动 schema 演进（`migrationsRun: true` 或 CI 执行 `migration:run`）。
- **违反后果**: 启动即删列丢数据 CWE-672；多实例滚动发布时新旧代码争抢改表 → 结构漂移。
- **验证方法**: `grep -rnE 'synchronize[[:space:]]*:[[:space:]]*true' --include='*.ts'` 命中 → fail。
- **对应门禁**: fw_typeorm_synchronize_prod(fail)

```verify
id: typeorm-r1
cmd: grep -rnE 'synchronize[[:space:]]*:[[:space:]]*true' --include='*.ts' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：已执行迁移不可手改，schema 修正必须新增迁移
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: TypeORM 以 `migrations` 表记录已执行迁移（按 timestamp 排序）。手改已执行迁移文件不会重跑（记录已存在），导致不同环境 schema 不一致；改 timestamp 重命名则在新环境重复执行冲突。任何 schema 修正必须 `migration:generate`/手写新迁移。
- **违反后果**: 环境间 schema 漂移（开发库与生产库结构不一致）；回滚脚本与实际结构错位。
- **验证方法**: 人工检查（`git log --follow migrations/` 确认已合入主干并发布的迁移文件无后续修改；`typeorm migration:show` 核对执行记录）。
- **对应门禁**: 人工检查

```verify
id: typeorm-r2
cmd: 
expect: always
```

### 规律：relations eager: true 触发隐式 JOIN，N+1 须改用显式 relations/leftJoinAndSelect
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: 关联声明 `eager: true` 时每次 find 自动 JOIN 该关联——多层 eager 产生笛卡尔放大与 N+1 变种。默认应懒加载（不 eager），按查询场景用 `find({ relations: [...] })` 或 QueryBuilder `leftJoinAndSelect` 显式取数。循环内逐个 `entity.relation` await 是经典 N+1。
- **违反后果**: 列表页 1 次请求放大为 1+N 次 SQL；eager 链多层嵌套 → JOIN 行数爆炸拖垮库。
- **验证方法**: `grep -rnE 'eager[[:space:]]*:[[:space:]]*true' --include='*.ts'` 命中 → warn。
- **对应门禁**: fw_typeorm_eager_n1(warn)

```verify
id: typeorm-r3
cmd: grep -rnE 'eager[[:space:]]*:[[:space:]]*true' --include='*.ts' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：事务内必须使用回调注入的 EntityManager / QueryRunner，禁止混用全局 manager/getRepository
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `dataSource.transaction(async (manager) => {...})` 内必须用回调参数 `manager` 执行全部 SQL；混用 `dataSource.manager`/`getRepository()`（走全局连接）会绕过事务——这些写入不参与 commit/rollback。手动 QueryRunner 场景同理：必须 `queryRunner.manager`，且 `connect/startTransaction/commitTransaction/release` 配对（finally release）。
- **违反后果**: 部分写入逃逸事务 → 回滚后数据不一致（无多漏错重之"错"）；QueryRunner 未 release → 连接泄漏池耗尽。
- **验证方法**: 同一文件同时含 `.transaction(`/`startTransaction` 与 `getRepository(`/`dataSource.manager.` → warn 人工确认事务内未混用全局连接。
- **对应门禁**: fw_typeorm_transaction_runner(warn)

```verify
id: typeorm-r4
cmd: 
expect: always
```

### 规律：@Transaction/@TransactionManager/@TransactionRepository 装饰器已废弃，禁止新代码使用
- **适用版本**: TypeORM 0.3.x 起废弃；1.x 已移除（待验证：v1 移除时点依 v1.0.0 breaking 说明，未联网核实细节）
- **规律**: 0.3.0 起 `@Transaction()` 方法装饰器、`@TransactionManager()`/`@TransactionRepository()` 参数装饰器废弃，官方替代为 `dataSource.transaction()` 显式回调。v1.0.0（2026-05-19 GA）含 breaking changes，废弃 API 移除属预期（待验证具体清单）。
- **违反后果**: 升级 v1 直接编译失败；废弃 API 无维护。
- **验证方法**: `grep -rnE '@Transaction\(|@TransactionManager|@TransactionRepository' --include='*.ts'` 命中 → warn。
- **对应门禁**: fw_typeorm_transaction_decorator(warn)

```verify
id: typeorm-r5
cmd: grep -rnE '@Transaction\(|@TransactionManager|@TransactionRepository' --include='*.ts' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：懒加载关联（Promise<T> 类型）须防序列化泄露与忘 await
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: 关联属性声明为 `Promise<User>` 即懒加载——访问须 await，且 JSON.stringify 实体时懒加载字段序列化为 `{}`（Promise 无自有可枚举属性），接口静默丢字段。HTTP 层直接返回实体的项目慎用懒加载关联。
- **违反后果**: 响应丢关联字段（前端拿不到数据且无报错）；忘 await 把 Promise 当对象用 → undefined 行为。
- **验证方法**: `grep -rnE '@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(' --include='*.ts' -A3 | grep 'Promise<'` 命中 → warn。
- **对应门禁**: fw_typeorm_lazy_relation(warn)

```verify
id: typeorm-r6
cmd: grep -rnE '@(ManyToOne|OneToMany|OneToOne|ManyToMany)\(' --include='*.ts' -A3 "${PROJECT_DIR}" | grep 'Promise<'
expect: hits>0
```

### 规律：外键列须 @Index 显式索引（TypeORM 不自动为关联建索引）
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `@ManyToOne` 生成的外键列默认不带索引（部分数据库如 Postgres 不自动建 FK 索引）。按关联反查（`WHERE post.userId = ?`）走全表扫描。高频反查的关联列须 `@Index()` 或类级 `@Index(['userId'])`。
- **违反后果**: 关联反查全表扫描，数据量上去后慢查询拖垮库。
- **验证方法**: 含 `@ManyToOne` 的实体文件未含 `@Index` → warn。
- **对应门禁**: fw_typeorm_fk_index(warn)

```verify
id: typeorm-r7
cmd: 
expect: always
```

### 规律：分页禁止 offset/limit 配 JOIN 取实体（行级截断错位），须 take/skip 或 findAndCount
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: QueryBuilder 的 `.offset()/.limit()` 直接译为 SQL OFFSET/LIMIT，作用于 JOIN 后的行集——一对多 JOIN 时一个实体占多行，按行截断导致实体被切碎/条数错误。实体分页用 `.take()/.skip()`（TypeORM 转为子查询/按实体分页）或 `findAndCount({ take, skip })`。
- **违反后果**: 分页数据缺漏/重复（无多漏错重之"漏"与"重"）；总数与实际页内容对不上。
- **验证方法**: 同一文件同时含 `.offset(`/`.limit(` 与 `leftJoin|innerJoin` → warn。
- **对应门禁**: fw_typeorm_pagination_offset(warn)

```verify
id: typeorm-r8
cmd: 
expect: always
```

### 规律：实体声明 @DeleteDateColumn 后禁止物理 .delete()，须 softDelete/recover
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `@DeleteDateColumn` 使实体支持软删除（`softDelete()` 置删除时间，`find` 默认过滤已删）。此时调用 `.delete()` 仍物理删行——审计与恢复能力失效，且关联实体的软删一致性被破坏。
- **违反后果**: 应可恢复的审计数据被物理删除；软删/物理删混用导致统计口径不一。
- **验证方法**: 存在 `@DeleteDateColumn` 实体且源码检出 `.delete(` 调用 → warn。
- **对应门禁**: fw_typeorm_soft_delete(warn)

```verify
id: typeorm-r9
cmd: 
expect: always
```

### 规律：审计字段用 @CreateDateColumn/@UpdateDateColumn 声明，禁止应用层手填
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: 创建/更新时间应声明 `@CreateDateColumn`/`@UpdateDateColumn` 由 ORM 自动维护（数据库时区统一）。应用层手填 `new Date()` 存在应用服务器时钟漂移与遗漏。含 @Entity 的实体（除纯关联表）应有审计字段。
- **违反后果**: 审计时间缺失/不准 → 问题追溯无据；多时区部署时间错乱。
- **验证方法**: 含 `@Entity` 的文件未含 `@CreateDateColumn|@UpdateDateColumn` → warn。
- **对应门禁**: fw_typeorm_audit_columns(warn)

```verify
id: typeorm-r10
cmd: 
expect: always
```

### 规律：连接池须显式配置（poolSize/extra），默认池不适配生产并发
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `new DataSource({...})` 默认连接池（如 pg 默认 10）未按应用并发与库 max_connections 规划。生产须按实例数×poolSize ≤ 库容量配置（`poolSize` 或驱动级 `extra: { max }`），并配 `connectTimeoutMS`/`extra.idleTimeoutMillis` 防连接僵死。
- **违反后果**: 并发高峰连接耗尽请求排队超时；或多实例总连接超库上限拒绝连接。
- **验证方法**: 检出 `new DataSource(|createConnection(` 但无 `poolSize|extra` → warn。
- **对应门禁**: fw_typeorm_pool(warn)

```verify
id: typeorm-r11
cmd: 
expect: always
```

### 规律：QueryBuilder where 禁止字符串插值/拼接，必须参数绑定
- **适用版本**: TypeORM 0.3.x / 1.x
- **规律**: `.where(\`name = '${name}'\`)` 模板插值直接进 SQL → 注入。必须参数绑定：`.where('name = :name', { name })`。第二参参数对象里的模板值（如 `{ kw: \`%${q}%\` }`）是绑定值，不是注入。原生 `query()` 同理用 `$1/$2` 占位。`orderBy` 字段名不可绑定参数，须白名单枚举。
- **违反后果**: SQL 注入 CWE-89（拖库/越权/写破坏）。
- **验证方法**: `grep -rnE '\.(where|orWhere|andWhere)\([[:space:]]*\`[^\`]*\$\{' --include='*.ts'` 命中（首参反引号模板插值）→ fail；参数对象模板值不算。
- **对应门禁**: fw_typeorm_qb_injection(fail)

```verify
id: typeorm-r12
cmd: grep -rnE '\.(where|orWhere|andWhere)\([[:space:]]*`[^`]*\$\{' --include='*.ts' "${PROJECT_DIR}"
expect: hits>0
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_typeorm_synchronize_prod | fail | synchronize: true 字面量 → fail 生产自动改表 | TYPEORM_SRC_GLOBS | CWE-672 |
| fw_typeorm_eager_n1 | warn | 关联 eager: true → warn 隐式 JOIN/N+1 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_transaction_runner | warn | 同文件事务调用 + getRepository/dataSource.manager → warn 混用全局连接 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_transaction_decorator | warn | @Transaction/@TransactionManager/@TransactionRepository → warn 已废弃 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_lazy_relation | warn | 关联属性 Promise&lt;T&gt; 懒加载 → warn 序列化丢字段 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_fk_index | warn | 实体含 @ManyToOne 无 @Index → warn 外键无索引 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_pagination_offset | warn | 同文件 .offset/.limit + Join → warn 行级截断错位 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_soft_delete | warn | 有 @DeleteDateColumn 且检出 .delete( → warn 物理删绕过软删 | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_audit_columns | warn | 实体无 @CreateDateColumn/@UpdateDateColumn → warn | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_pool | warn | new DataSource/createConnection 无 poolSize/extra → warn | TYPEORM_SRC_GLOBS | — |
| fw_typeorm_qb_injection | fail | where/orWhere/andWhere 首参反引号模板插值 ${} → fail SQL 注入 CWE-89（参数对象模板值安全） | TYPEORM_SRC_GLOBS | CWE-89；GB/T 38674-2020 §5.1 |

<!--
门禁 id 命名规范：fw_typeorm_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/typeorm.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_typeorm_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: typeorm  requires_conf: TYPEORM_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 synchronize: true + QB 模板插值 + 手改已执行迁移（证据文件）
→ synchronize_prod/qb_injection fail 主触发（2/2 已断言）；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| typeorm × nestjs | @nestjs/typeorm 的 TypeOrmModule.forRoot 与 data-source.ts 双数据源配置须同源（迁移 CLI 用 data-source.ts，运行时用 forRoot） | 双配置漂移 → 迁移与运行时 schema 不一致 |
| typeorm × fastify/express | DataSource 须在路由可用前 initialize（启动钩子 await），禁止 handler 内 new DataSource | 每请求建连接池 → 连接耗尽 |
| typeorm × class-validator | 实体 @Column 约束（length/nullable）与 DTO class-validator 规则须一致 | 校验口径不一 → DB 层 500 或脏数据入库 |
| typeorm × sharding（中间件分片） | 分库分表场景禁用跨库 JOIN 关联与 synchronize | 跨库 JOIN 不可达；synchronize 只改当前连接库 |

<!--
本表聚焦 typeorm 生态内高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| TypeORM 0.3.0 | DataSource 替代 Connection/createConnection 旧 API；@Transaction 系列装饰器废弃；repository API 变更 | 旧 0.2.x 代码须迁移 DataSource；装饰器事务须改显式回调 |
| TypeORM 0.3.x | 维护线（2026-07-13 发 0.3.31，backport v1 修复） | 无新特性，仅修复；新项目直接上 1.x |
| TypeORM 1.0.0 | 2026-05-19 GA，含 breaking changes 与 0.3.x 升级指南（细节待验证：官方升级指南正文未成功联网核实） | 升级前须逐条核对官方升级指南；废弃 API（@Transaction 等）预期移除 |
| TypeORM 1.1.0 | 2026-07-13 latest（2026-07-17 核实 GitHub releases） | 规律按 0.3.x 行为陈述，v1 差异待验证后补充 |
| migrationsRun: true | 启动即跑未执行迁移 | 滚动发布多实例并发跑迁移 → 须 CI 单点执行或加锁 |
| take/skip vs offset/limit | take/skip 按实体分页（生成子查询），offset/limit 按行 | JOIN 场景误用 offset/limit 分页数据错乱 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
