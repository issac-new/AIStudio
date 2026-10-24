---
ruleset_id: sqlserver
适用版本: SQL Server 2022 / 2025（2025 已 GA，RTM 2025-11-18，2026-07 时点最新 CU7；2017/2019 仍在扩展支持，差异单独标注）
最后调研: 2026-07-17（来源：https://learn.microsoft.com/en-us/troubleshoot/sql/releases/download-and-install-latest-updates ；https://learn.microsoft.com/en-us/sql/sql-server/what-s-new-in-sql-server-2025 ；https://learn.microsoft.com/en-us/sql/t-sql/queries/hints-transact-sql-table ；https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-transaction-locking-and-row-versioning-guide ；https://learn.microsoft.com/en-us/sql/relational-databases/linked-servers/linked-servers-database-engine ）
深度门槛: 10
---

# SQL Server 规则集

<!--
本规则集覆盖 SQL Server 2022 与 2025（2026-07 时点：2025 已 GA 且最新 CU7/17.0.4065.4，2026-07-16；2022 最新 CU26；2017/2019 仍受支持，2016 及更早已出主流支持）。
调研时点：2026-07-17。SQL Server 2025 新特性（如优化锁定 optimized locking、原生 JSON 类型）对规律的影响：待验证（GA 后官方最佳实践文档沉淀中，未核实前按 2022 基线陈述并标待验证）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `mssql-jdbc`(com.microsoft.sqlserver) / `Microsoft.Data.SqlClient` / `System.Data.SqlClient` / `mssql`(npm) / `pyodbc` | 高 |
| 文件 | `**/*.sql` 内含 `WITH (NOLOCK)` / `OFFSET ... FETCH` / `[dbo].` / `sp_executesql` | 高 |
| 配置 | `jdbc:sqlserver://` / `Server=.*;Database=` 连接串 / `Initial Catalog` | 高 |
| 代码 | `CREATE PROC` / `IDENTITY(1,1)` / `NVARCHAR` / `@@ROWCOUNT` / `SET NOCOUNT ON` | 高 |
| 服务 | `docker-compose` 含 `image: mcr.microsoft.com/mssql/server` | 中（须排除仅本地开发用途） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 sqlserver 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 存储过程：`grep -rlEi 'CREATE[[:space:]]+(OR[[:space:]]+ALTER[[:space:]]+)?PROC(EDURE)?' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：含 CREATE PROC 的 .sql 文件数）
- NOLOCK 使用点：`grep -rnEi 'WITH[[:space:]]*\(NOLOCK\)' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：NOLOCK 命中行数）
- 触发器：`grep -rnEi 'CREATE[[:space:]]+TRIGGER' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：触发器定义行数）
- 动态 SQL：`grep -rnEi 'sp_executesql|EXEC[[:space:]]*\(' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：动态 SQL 行数）
- 链接服务器：`grep -rnEi 'sp_addlinkedserver|OPENQUERY|OPENROWSET' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：链接服务器调用行数）
- 数据源引用：`grep -rnE 'jdbc:sqlserver://|Initial Catalog|Data Source=' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties' --include='*.config' --include='*.json'`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：WITH (NOLOCK) 必须显式声明脏读风险，禁止用于事务一致性场景
- **适用版本**: 全版本
- **规律**: `WITH (NOLOCK)` = READ UNCOMMITTED，读到未提交数据（脏读）、同一行读两次或读不到（页拆分漂移）。只允许用于：统计报表类容忍近似值的只读查询，且必须在同文件注释显式声明"脏读风险已评估"。账务、库存、余额等一致性场景禁用；正确替代是 `READ_COMMITTED_SNAPSHOT`（行版本，快照不脏读）。
- **违反后果**: 报表金额与明细对不上；脏数据被回写引发资金事故。
- **验证方法**: 检出 `WITH (NOLOCK)` 且同文件无 `脏读|dirty` 风险声明注释 → warn。
- **对应门禁**: fw_mssql_nolock(warn)

```verify
id: sqlserver-r1
cmd: 
expect: always
```

### 规律：动态 SQL 必须参数化（sp_executesql 带参数），禁止字符串拼接（注入 + 计划缓存污染）
- **适用版本**: 全版本
- **规律**: `EXEC('SELECT ... WHERE col = ''' + @var + '''')` 字符串拼接 = SQL 注入直达（CWE-89），且每次拼接产生新 ad-hoc 计划撑爆计划缓存。必须 `EXEC sp_executesql N'SELECT ... WHERE col = @p', N'@p nvarchar(50)', @p = @var`，参数化后计划可复用。动态表名/列名用 `QUOTENAME()` 包。
- **违反后果**: SQL 注入拖库 CWE-89；计划缓存命中率为 0 → CPU 编译风暴。
- **验证方法**: 检出 `EXEC(...+...)` 拼接执行或 `SET @sql = '...' + @var` 赋拼接串 → fail。
- **对应门禁**: fw_mssql_sql_injection(fail)

```verify
id: sqlserver-r2
cmd: 
expect: always
```

### 规律：大批量 UPDATE/DELETE 必须分批提交，防行锁升级为表锁
- **适用版本**: 全版本（锁升级阈值约 5000 行锁；2025 优化锁定的影响待验证）
- **规律**: 单事务锁超阈值即锁升级（行锁→表锁），全表阻塞。批量作业必须 `WHILE 1=1 BEGIN DELETE TOP (5000) ... IF @@ROWCOUNT = 0 BREAK END` 分批，每批独立事务。单事务内 DML 语句成堆（≥10 条无 TOP/WHILE 分批痕迹）即触发本门禁核对。
- **违反后果**: 一条全量 UPDATE 把核心业务表锁成只读 → 全站超时。
- **验证方法**: 文件含 `BEGIN TRAN` 且 DML 行数 ≥10 但无 `TOP`/`WHILE` 分批 → warn。
- **对应门禁**: fw_mssql_batch(warn)

```verify
id: sqlserver-r3
cmd: 
expect: always
```

### 规律：事务隔离级别须显式声明（默认 RC，SNAPSHOT/SERIALIZABLE 按需）
- **适用版本**: 全版本
- **规律**: 默认 READ COMMITTED（阻塞读写互等）。读写并发高的库应开 `READ_COMMITTED_SNAPSHOT ON`（行版本读不阻塞写）；`SNAPSHOT` 隔离须显式 `SET TRANSACTION ISOLATION LEVEL SNAPSHOT` 且数据库级允许。事务代码不显式声明隔离级别 = 默认 RC 被隐式依赖，运维改库级设置即行为漂移。
- **违反后果**: 隐式依赖默认级别 → 环境差异导致偶发阻塞/幻读，排查无门。
- **验证方法**: 文件含 `BEGIN TRAN` 但全仓库无 `SET TRANSACTION ISOLATION LEVEL` → warn。
- **对应门禁**: fw_mssql_isolation(warn)

```verify
id: sqlserver-r4
cmd: 
expect: always
```

### 规律：链接服务器（Linked Server）必须最小权限，禁止高权限贯通
- **适用版本**: 全版本
- **规律**: `sp_addlinkedserver` 建立的链接服务器若映射高权限账号，应用侧一次注入即可跨服务器执行（`OPENQUERY`/四段名直达），横向移动第一通道。必须：映射只读低权限登录、禁用 `rpc out`（除非确需远程执行）、`Data Access` 按需。审计 `OPENQUERY`/`OPENROWSET` 全部调用点。
- **违反后果**: 单点注入 → 跨库跨服务器拖数 CWE-89/CWE-732。
- **验证方法**: 检出 `sp_addlinkedserver|OPENQUERY|OPENROWSET` → warn 人工核对映射账号权限与 rpc out 设置。
- **对应门禁**: fw_mssql_linked_server(warn)

```verify
id: sqlserver-r5
cmd: 
expect: always
```

### 规律：禁止 SELECT *，索引覆盖用 INCLUDE 列防 Key Lookup
- **适用版本**: 全版本
- **规律**: `SELECT *` 使非聚集索引必然缺列 → Key Lookup 回聚集索引（随机 IO），且加列即隐式改返回结构。高频查询的非聚集索引须 `INCLUDE (col1, col2)` 覆盖 SELECT 列（INCLUDE 列不进键、不排序、代价低）。SELECT 列枚举是覆盖索引生效前提。
- **违反后果**: 每条查询 N 次 Key Lookup → IO 放大一个量级。
- **验证方法**: `grep -rnEi 'SELECT[[:space:]]*\*[[:space:]]+FROM' --include='*.sql'` → warn。
- **对应门禁**: fw_mssql_select_star(warn)

```verify
id: sqlserver-r6
cmd: grep -rnEi 'SELECT[[:space:]]*\*[[:space:]]+FROM' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：死锁追踪必须开启（trace flag 1222 或 Extended Events），且加锁顺序全应用一致
- **适用版本**: 全版本（1204/1222 为传统 trace flag，XE system_health 已默认抓死锁图）
- **规律**: 死锁发生后无追踪 = 只能凭时间点猜。必须开 trace flag 1222（ERRORLOG 输出死锁图）或确认 `system_health` XE 会话在线（默认开）。工程预防：所有事务按固定顺序访问表（先主表后明细表），`UPDLOCK, HOLDLOCK` 组合控制读改竞态。
- **违反后果**: 死锁频发但无图可查 → 长期靠重试硬扛。
- **验证方法**: 存在 mssql 配置文件但无 `1222|deadlock|system_health` 任一引用 → warn。
- **对应门禁**: fw_mssql_deadlock_trace(warn)

```verify
id: sqlserver-r7
cmd: 
expect: always
```

### 规律：分页用 OFFSET FETCH，禁用 ROW_NUMBER 双层嵌套分页
- **适用版本**: 2012+（OFFSET FETCH 自 2012 引入）
- **规律**: `ROW_NUMBER() OVER (ORDER BY x)` 套子查询再 BETWEEN 分页，要写两层嵌套且优化器难消掉整个窗口计算；`ORDER BY x OFFSET @n ROWS FETCH NEXT @m ROWS ONLY` 直白且走 Top N 排序。深分页（offset 大）同 MySQL 一样退化，须游标（keyset pagination，`WHERE id > @last`）。
- **违反后果**: 可读性差 + 执行计划多一层 Spool/Sequence Project → 深页接口慢。
- **验证方法**: 检出 `ROW_NUMBER` → warn 核对是否用于分页场景。
- **对应门禁**: fw_mssql_pagination(warn)

```verify
id: sqlserver-r8
cmd: 
expect: always
```

### 规律：GRANT EXECUTE 禁止授给 public，存储过程权限最小化
- **适用版本**: 全版本
- **规律**: `GRANT EXECUTE TO public` = 库内任何登录都能执行该过程（含 guest 上下文），越权执行直达。必须按角色授权：`CREATE ROLE app_executor; GRANT EXECUTE ON SCHEMA::dbo TO app_executor`，账号入角色。应用连接账号本身不授 db_owner。
- **违反后果**: 低权限账号执行管理类存储过程 → 越权 CWE-862。
- **验证方法**: `GRANT EXECUTE ... TO public`（大小写不敏感）→ fail。
- **对应门禁**: fw_mssql_sp_grant_public(fail)

```verify
id: sqlserver-r9
cmd: 
expect: always
```

### 规律：触发器慎用——禁止在触发器内做重活/外部调用
- **适用版本**: 全版本
- **规律**: 触发器在触发语句的事务内同步执行，里面跑多行 UPDATE/调 CLR/发邮件 = 把每次 DML 拉长，锁持有时间放大，死锁图复杂化。审计类轻触发器可接受；重逻辑改： Service Broker/变更数据捕获（CDC）/应用层事件。检出触发器即提示人工核对体量。
- **违反后果**: 触发器级联 → 简单 INSERT 变成秒级事务；排查时"看不到的代码"是盲区。
- **验证方法**: `CREATE TRIGGER` → warn 人工核对触发器体量与必要性。
- **对应门禁**: fw_mssql_trigger(warn)

```verify
id: sqlserver-r10
cmd: 
expect: always
```

### 规律：UPDATE/DELETE 必须带 WHERE，无条件 DML 禁上线
- **适用版本**: 全版本
- **规律**: 单行 UPDATE/DELETE 语句缺 WHERE = 全表改写/清空，且触发行锁升级（与分批规律联动）。批量变更须 WHERE 限定 + TOP 分批；清表用 `TRUNCATE TABLE`（DDL 级、最小日志）。
- **违反后果**: 漏 WHERE → 全表数据损毁；大表无 WHERE DML → 锁升级全表阻塞。
- **验证方法**: 单行 `UPDATE ... SET ...;` / `DELETE FROM ...;` 不含 WHERE → fail。
- **对应门禁**: fw_mssql_dml_nowhere(fail)

```verify
id: sqlserver-r11
cmd: 
expect: always
```

### 规律：TempDB 须按核数配比多数据文件并预置大小
- **适用版本**: 全版本（2016+ 安装器已默认引导多文件）
- **规律**: 单 TempDB 数据文件在高并发下 PFS/GAM/SGAM 页争抢（PAGELATCH_UP 等待）。按 min（核数， 8) 个等大文件起步，预置固定大小 + 相同自动增长步长（防按比例增长失衡）；TempDB 与业务库分盘。
- **违反后果**: 并发高峰 PAGELATCH 等待 → 全实例吞吐腰斩。
- **验证方法**: 人工检查（`sys.master_files` 核对 tempdb 文件数与增长配置；等待统计查 PAGELATCH_UP）。
- **对应门禁**: 人工检查

```verify
id: sqlserver-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛），其中 11 条挂门禁、1 条人工检查，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_mssql_nolock | warn | WITH (NOLOCK) 且同文件无脏读风险声明 → warn | MSSQL_SQL_GLOBS | —（脏读一致性权衡） |
| fw_mssql_sql_injection | fail | EXEC(...+...) 拼接执行 / 拼接赋 SQL 串 → fail | MSSQL_SQL_GLOBS | CWE-89（SQL 注入，Top25:2025 #2） |
| fw_mssql_batch | warn | BEGIN TRAN + DML ≥10 行且无 TOP/WHILE 分批 → warn | MSSQL_SQL_GLOBS | —（锁升级） |
| fw_mssql_isolation | warn | 含 BEGIN TRAN 但无 SET TRANSACTION ISOLATION LEVEL → warn | MSSQL_SQL_GLOBS | —（显式声明） |
| fw_mssql_linked_server | warn | sp_addlinkedserver/OPENQUERY/OPENROWSET → warn 核对权限 | MSSQL_SQL_GLOBS | CWE-732（高权限映射=横向移动通道） |
| fw_mssql_select_star | warn | SELECT * FROM → warn 覆盖索引失效/Key Lookup | MSSQL_SQL_GLOBS | —（Key Lookup） |
| fw_mssql_deadlock_trace | warn | mssql 配置存在但无 1222/deadlock/system_health 引用 → warn | MSSQL_SQL_GLOBS | CWE-778（死锁无图可查=事件无记录） |
| fw_mssql_pagination | warn | ROW_NUMBER( 分页模式 → warn 建议 OFFSET FETCH | MSSQL_SQL_GLOBS | —（分页形态） |
| fw_mssql_sp_grant_public | fail | GRANT EXECUTE TO public → fail 越权 | MSSQL_SQL_GLOBS | CWE-862（缺失授权，Top25:2025 #4） |
| fw_mssql_trigger | warn | CREATE TRIGGER → warn 核对体量 | MSSQL_SQL_GLOBS | —（持锁放大） |
| fw_mssql_dml_nowhere | fail | 单行 UPDATE/DELETE 无 WHERE → fail | MSSQL_SQL_GLOBS | —（数据完整性） |

<!--
门禁 id 命名规范：fw_mssql_<rule>（rule 全小写下划线）。
本表 11 条 id 须在 assets/framework-gates/sqlserver.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_mssql_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: sqlserver  requires_conf: MSSQL_SQL_GLOBS MSSQL_SCHEMA_GLOBS` 声明（本规则集门禁均作用于 MSSQL_SQL_GLOBS，SCHEMA 变量保留给 DDL 侧扩展与 §C+.1-FW 枚举）。
fixture 验证覆盖：violating 含 NOLOCK 无脏读声明 + 大批量事务无分批 + 字符串拼接 EXEC + GRANT EXECUTE TO public + 无 WHERE 全表 DELETE → sql_injection/sp_grant_public/dml_nowhere 三 fail 主触发（expected-fail-ids 3/3 已登记）；compliant 修正后全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| sqlserver × mybatis | Mapper XML 中 `${}` 拼接同 EXEC 拼接，须白名单 + 参数 #{} | 拼接入口从存储过程移到应用侧，注入面不变 CWE-89 |
| sqlserver × spring-boot | spring.datasource 连接池 maxLifetime < SQL Server 连接空闲回收；Hikari 池大小按核数收敛 | 池连接被服务端先回收 → 拿死连接；池 oversized → 会话内存膨胀 |
| sqlserver × flyway/liquibase | 迁移脚本须设 `SET XACT_ABORT ON` + 显式事务边界 | SQL Server DDL 多数可事务化，XACT_ABORT OFF 时部分错误不回滚 → 半迁移态 |
| sqlserver × redis | 缓存失效不能依赖触发器直推（触发器重活禁忌），走应用层双写/CDC | 触发器内调外部服务把 DML 事务拉长 |

<!--
本表聚焦 sqlserver 生态内高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| SQL Server 2012 | OFFSET FETCH 引入 | 2012 前只能 ROW_NUMBER 分页；规则按 OFFSET FETCH 陈述 |
| SQL Server 2016 | TempDB 安装期多文件引导；Query Store | 老版本 TempDB 单文件默认 → PAGELATCH 争抢高发 |
| SQL Server 2017 | 2028 年前扩展支持内；Linux 版首版 | 2017 项目须提示升级窗口 |
| SQL Server 2019 | Intelligent Query Processing 起步；UTF-8 排序规则 | 规律基线不受影响 |
| SQL Server 2022 | Parameter Sensitive Plan 优化；ledger 表 | PSP 缓解参数嗅探，但参数化规律不变 |
| SQL Server 2025 | 已 GA（RTM 2025-11-18，CU 月度节奏，2026-07 为 CU7）；优化锁定 optimized locking（待验证：对锁升级阈值规律的影响未核实） | 待验证：优化锁定 GA 后默认行为与分批规律的关系须复核官方文档 |
| SQL Server 2016 及更早 | 已出主流支持 | 存量项目须提示立即规划升级 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
