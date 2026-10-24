---
ruleset_id: mysql
适用版本: MySQL 8.4 LTS / 9.x Innovation（9.7.1 为 2026-06-16 GA 的最新 Innovation 版本；8.0 已转入维护末期，差异单独标注）
最后调研: 2026-07-17（来源：https://dev.mysql.com/doc/relnotes/mysql/9.7/en/ ；https://dev.mysql.com/doc/refman/9.7/en/innodb-locking.html ；https://dev.mysql.com/doc/refman/9.7/en/innodb-transaction-isolation-levels.html ；https://dev.mysql.com/doc/refman/8.4/en/alter-table.html ；https://dev.mysql.com/doc/refman/9.7/en/charset-unicode-utf8mb4.html ；https://dev.mysql.com/doc/refman/9.7/en/slow-query-log.html ）
深度门槛: 10
---

# MySQL 规则集

<!--
本规则集覆盖 MySQL 8.4 LTS 与 9.x Innovation（2026-07 时点最新 GA 为 9.7.1，2026-06-16 发布）。
调研时点：2026-07-17。官方文档版本选择器另出现 26.x 年号制系列条目（待验证：是否已 GA 及与 9.x 的接替关系，未核实前规律按 8.4 LTS / 9.x 陈述）。
MySQL 5.7 已 EOL（2023-10）、8.0 进入维护末期（待验证：官方 EOL 公告精确日期未联网核实），存量项目须提示升级窗口。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `mysql:mysql-connector-j` / `mysql-connector-java` / `github.com/go-sql-driver/mysql` / `mysql2`(npm) / `PyMySQL` | 高 |
| 文件 | `**/my.cnf` / `**/my.ini` / `**/schema.sql` 内含 `ENGINE=InnoDB` | 高 |
| 配置 | `jdbc:mysql://` / `spring.datasource.url.*mysql` / `[mysqld]` 配置段 | 高 |
| 代码 | `ENGINE=InnoDB` / `ALGORITHM=INSTANT` / `innodb_` 前缀参数 / `utf8mb4` | 高 |
| 服务 | `docker-compose` 含 `image: mysql:` | 中（须排除仅本地开发用途） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 mysql 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- DDL 建表脚本：`grep -rlEi 'CREATE[[:space:]]+TABLE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：含 CREATE TABLE 的 .sql 文件数）
- ALTER 变更脚本：`grep -rnEi 'ALTER[[:space:]]+TABLE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：ALTER TABLE 语句行数）
- 索引定义：`grep -rnEi '(KEY|INDEX)[[:space:]]*\(?\`|USING BTREE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：索引定义行数）
- MySQL 配置文件：`find "${PROJECT_DIR}" -name 'my.cnf' -o -name 'my.ini'`（计数核验基准：配置文件数）
- 深分页查询：`grep -rnEi 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：深分页语句行数）
- 数据源引用：`grep -rnE 'jdbc:mysql://|mysql://' "${PROJECT_DIR}" --include='*.yml' --include='*.properties' --include='*.yaml'`

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：字符集必须用 utf8mb4，禁用 utf8/utf8mb3（3 字节残缺字符集）
- **适用版本**: 全版本（utf8mb3 自 8.0.29 起 deprecated，8.4 仍可用但告警）
- **规律**: MySQL 的 `utf8` 是 `utf8mb3` 别名，每字符最多 3 字节，无法存储 emoji 与部分罕用汉字（4 字节字符直接写入报错或截断）。建库建表必须 `CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci`（8.x）或 `utf8mb4_general_ci`。官方明确 utf8mb3 已废弃，未来版本移除。
- **违反后果**: 用户昵称含 emoji 写入失败 / 静默截断数据损坏；utf8mb3 未来版本移除后迁移成本翻倍。
- **验证方法**: `grep -inE 'CHARSET[[:space:]]*=[[:space:]]*utf8([^m]|$)|CHARACTER SET[[:space:]]+utf8([^m]|$)' --include='*.sql'`（utf8mb4 不命中，utf8/utf8mb3 命中）。
- **对应门禁**: fw_mysql_charset(fail)

```verify
id: mysql-r1
cmd: grep -inE 'CHARSET[[:space:]]*=[[:space:]]*utf8([^m]|$)|CHARACTER SET[[:space:]]+utf8([^m]|$)' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：大表深分页禁用大 OFFSET，改用游标（WHERE id > ?）或延迟关联子查询
- **适用版本**: 全版本
- **规律**: `LIMIT 100000, 10` 需扫描并丢弃前 10 万行，offset 越大越慢（O(offset)）。深分页必须改为游标分页 `WHERE id > last_id ORDER BY id LIMIT 20`，或延迟关联 `INNER JOIN (SELECT id FROM t LIMIT 100000,10) tmp USING(id)` 先取主键再回表。经验红线：offset > 10 万禁止上线。
- **违反后果**: 深翻页接口 RT 随页码线性恶化 → 慢查询打满连接池。
- **验证方法**: `grep -rnEi 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' --include='*.sql'`（offset ≥ 100000 命中）。
- **对应门禁**: fw_mysql_deep_paging(fail)

```verify
id: mysql-r2
cmd: grep -rnEi 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：事务隔离级别须显式声明（RC/RR 二选一），RR 防幻读依赖 next-key lock
- **适用版本**: 全版本
- **规律**: InnoDB 默认 REPEATABLE READ，通过 next-key lock（record lock + gap lock）在 RR 下防幻读；RC 无 gap lock、有幻读但锁竞争小、binlog 须 ROW 格式。应用必须显式选择并记录理由：`transaction-isolation=READ-COMMITTED`（高并发互联网主流）或保持 RR。禁止代码里到处 `SET SESSION TRANSACTION ISOLATION LEVEL` 隐式切换而不声明。
- **违反后果**: 隔离级别不明 → 幻读/不可重复读问题无法定性；RC + statement binlog 主从不一致。
- **验证方法**: 检出 mysql 数据源配置（`jdbc:mysql` / `[mysqld]`）但全部配置文件无 `transaction-isolation`/`transactionIsolation`/`transaction_isolation` → warn。
- **对应门禁**: fw_mysql_isolation(warn)

```verify
id: mysql-r3
cmd: 
expect: always
```

### 规律：死锁检测必须开启（innodb_deadlock_detect=ON），且全应用加锁顺序一致
- **适用版本**: 全版本（8.0.18+ 高并发可评估关闭+调低 innodb_lock_wait_timeout，须压测依据）
- **规律**: `innodb_deadlock_detect` 默认 ON，死锁发生时立即回滚代价小的事务。关闭后死锁只能等 `innodb_lock_wait_timeout`（默认 50s）超时，雪崩风险大。工程上更重要：所有事务按固定顺序访问多张表/多行（如先订单后库存），把死锁概率压到最低；`SELECT ... FOR UPDATE` 排序后加锁。
- **违反后果**: 关检测 + 默认 50s 超时 → 死锁线程挂起堆积 → 连接池耗尽。
- **验证方法**: 配置文件检出 `innodb_deadlock_detect[[:space:]]*=[[:space:]]*(OFF|0)` → warn（要求压测依据）；无配置则默认 ON 不告警。
- **对应门禁**: fw_mysql_deadlock_detect(warn)

```verify
id: mysql-r4
cmd: 
expect: always
```

### 规律：慢查询日志必须开启并设 long_query_time 阈值
- **适用版本**: 全版本
- **规律**: 生产必须 `slow_query_log=1` + `long_query_time`（互联网业务常设 0.5~1s，分析型可放宽），配合 `log_queries_not_using_indexes=1` 抓全表扫描。无慢日志 = 无性能可观测性，慢 SQL 只能靠用户投诉发现。
- **违反后果**: 慢查询无记录 → 性能问题定位靠猜；索引缺失长期无人发现。
- **验证方法**: 检出 `[mysqld]` 配置段但无 `slow_query_log` 或无 `long_query_time` → warn。
- **对应门禁**: fw_mysql_slow_log(warn)

```verify
id: mysql-r5
cmd: 
expect: always
```

### 规律：DDL 必须用 online DDL（ALGORITHM=INSTANT/INPLACE），避免 COPY
- **适用版本**: 8.0.12+（INSTANT 加列）；8.4/9.x 扩展 INSTANT 适用面（待验证：9.x 是否进一步扩大 INSTANT 场景，规律按 8.0.12+ 基线陈述）
- **规律**: `ALTER TABLE` 算法三档：`INSTANT`（仅改元数据，秒级）> `INPLACE`（重建表但不锁 DML）> `COPY`（整表拷贝+全程锁写，大表灾难）。DDL 脚本必须显式 `ALGORITHM=INSTANT` 或 `ALGORITHM=INPLACE, LOCK=NONE`，禁止 `ALGORITHM=COPY`；不支持 INSTANT 的操作（改列类型、删主键）用 pt-osc/gh-ost。
- **违反后果**: COPY 算法对大表 ALTER → 长时间锁写 → 业务停摆。
- **验证方法**: `grep -rnEi 'ALGORITHM[[:space:]]*=[[:space:]]*COPY|LOCK[[:space:]]*=[[:space:]]*EXCLUSIVE' --include='*.sql'` → warn。
- **对应门禁**: fw_mysql_online_ddl(warn)

```verify
id: mysql-r6
cmd: grep -rnEi 'ALGORITHM[[:space:]]*=[[:space:]]*COPY|LOCK[[:space:]]*=[[:space:]]*EXCLUSIVE' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：单表二级索引不可过多（写放大），建议 ≤5 个
- **适用版本**: 全版本
- **规律**: 每次 INSERT/UPDATE 都要维护全部索引（change buffer 也仅缓解非唯一索引）。索引过多 → 写放大、缓冲池被索引页挤占、优化器选错索引概率上升。单表二级索引建议 ≤5 个；低频查询走离线/从库，不为它建索引。联合索引遵循最左前缀，能合并不单建。
- **违反后果**: 写 TPS 随索引数线性下降；磁盘与 buffer pool 膨胀。
- **验证方法**: awk 统计每个 CREATE TABLE 块内非 PRIMARY 的 KEY/INDEX 行数 >5 → warn。
- **对应门禁**: fw_mysql_too_many_indexes(warn)

```verify
id: mysql-r7
cmd: 
expect: always
```

### 规律：高频查询须用覆盖索引减少回表，禁止 SELECT *
- **适用版本**: 全版本
- **规律**: 二级索引叶子存主键值，查询列不在索引内须回表（随机 IO）。高频 SQL 应让 SELECT 列 ⊆ 索引列（覆盖索引，Extra=Using index）。`SELECT *` 必然破坏覆盖索引、放大网络与内存，且表加列即隐式变更返回结构。查询必须列名枚举。
- **违反后果**: 回表随机 IO → QPS 天花板骤降；SELECT * 把新增大字段（如 TEXT）拖进每次查询。
- **验证方法**: `grep -rnEi 'SELECT[[:space:]]*\*[[:space:]]+FROM' --include='*.sql'` → warn。
- **对应门禁**: fw_mysql_select_star(warn)

```verify
id: mysql-r8
cmd: grep -rnEi 'SELECT[[:space:]]*\*[[:space:]]+FROM' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：LIKE 前置通配符（'%abc'）使索引失效，须改全文索引或搜索引擎
- **适用版本**: 全版本
- **规律**: B-Tree 索引按前缀有序，`LIKE 'abc%'` 可走索引范围扫描，`LIKE '%abc'` / `'%abc%'` 前置通配导致全表扫描。含前置通配的模糊查询必须改用 FULLTEXT 索引（ngram 插件支持中文）或 Elasticsearch。高频查询字段必须确认 EXPLAIN 实际走索引（type 列 ref/range/eq_ref）。
- **违反后果**: 模糊查询全表扫描 → 大表直接雪崩。
- **验证方法**: `grep -rnEi "LIKE[[:space:]]+'%" --include='*.sql'` → warn。
- **对应门禁**: fw_mysql_like_wildcard(warn)

```verify
id: mysql-r9
cmd: grep -rnEi "LIKE[[:space:]]+'%" --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：禁止隐式逗号 JOIN，必须显式 INNER JOIN 并让小表驱动大表
- **适用版本**: 全版本
- **规律**: `FROM a, b WHERE ...` 隐式连接可读性差、易漏连接条件变笛卡尔积，且无法表达驱动顺序意图。必须显式 `INNER JOIN ... ON ...`；MySQL 优化器走 nested-loop join，被驱动表（内表）的连接列必须有索引——小表驱动大表时内表扫描次数 = 外表行数。8.0.18+ hash join 仅覆盖无索引等值连接兜底，不是不建索引的理由。
- **违反后果**: 漏 ON 条件 → 笛卡尔积扫爆；内表无索引 → O(外×内) 全扫。
- **验证方法**: `grep -rnEi 'FROM[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*,[[:space:]]*[a-zA-Z_]' --include='*.sql'` → warn。
- **对应门禁**: fw_mysql_implicit_join(warn)

```verify
id: mysql-r10
cmd: grep -rnEi 'FROM[[:space:]]+[a-zA-Z_][a-zA-Z0-9_]*[[:space:]]*,[[:space:]]*[a-zA-Z_]' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：ORDER BY RAND() 禁止上线（EXPLAIN 必现 filesort + 全扫）
- **适用版本**: 全版本
- **规律**: `ORDER BY RAND() LIMIT n` 对全表每行生成随机数再 filesort，EXPLAIN 必现 `type=ALL + Using filesort`，大表单次即秒级。随机取样应改用：主键区间随机（`WHERE id >= (RAND()*max) LIMIT n`）、预计算随机列加索引、或应用层随机。上线 SQL 的 EXPLAIN 不允许 type=ALL / Using filesort / Using temporary 出现在大表节点。
- **违反后果**: 随机推荐类接口直接打满 CPU；filesort 大结果集撑爆 sort_buffer / 临时表。
- **验证方法**: `grep -rnEi 'ORDER[[:space:]]+BY[[:space:]]+RAND[[:space:]]*\(' --include='*.sql'` → warn。
- **对应门禁**: fw_mysql_order_rand(warn)

```verify
id: mysql-r11
cmd: grep -rnEi 'ORDER[[:space:]]+BY[[:space:]]+RAND[[:space:]]*\(' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：事务必须短平快，禁止长事务（锁占用 + MVCC undo 膨胀）
- **适用版本**: 全版本
- **规律**: 长事务持有行锁阻塞并发写；RR 下一致性读视图阻止 undo log  purge → 历史版本膨胀（ibdata 暴涨）；`autocommit=0` 让每条 SELECT 都隐式开事务，是长事务最常见来源。禁止事务内：RPC 调用、sleep、人工交互、大循环。批量任务分批提交，单批 ≤1000 行。
- **违反后果**: 锁等待堆积、undo 表空间膨胀撑爆磁盘、主从延迟（大事务 binlog 串行回放）。
- **验证方法**: 配置文件检出 `autocommit[[:space:]]*=[[:space:]]*0` 或 SQL 脚本事务体内含 `SLEEP(` → warn。
- **对应门禁**: fw_mysql_long_tx(warn)

```verify
id: mysql-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_mysql_charset | fail | DDL 检出 CHARSET=utf8/utf8mb3（非 utf8mb4）→ fail | MYSQL_SQL_GLOBS MYSQL_SCHEMA_GLOBS | —（字符集工程约束） |
| fw_mysql_deep_paging | fail | LIMIT/OFFSET 偏移量 ≥ 100000 → fail | MYSQL_SQL_GLOBS | CWE-400（O(offset) 扫描丢弃，资源消耗） |
| fw_mysql_isolation | warn | 检出 mysql 数据源但无 transaction-isolation 显式配置 → warn | MYSQL_SQL_GLOBS | —（隔离级别显式化） |
| fw_mysql_deadlock_detect | warn | innodb_deadlock_detect=OFF/0 → warn 要求压测依据 | MYSQL_SQL_GLOBS | —（可用性权衡） |
| fw_mysql_slow_log | warn | [mysqld] 段缺 slow_query_log/long_query_time → warn | MYSQL_SQL_GLOBS | CWE-778（无慢日志=性能事件无记录） |
| fw_mysql_online_ddl | warn | ALGORITHM=COPY 或 LOCK=EXCLUSIVE → warn | MYSQL_SCHEMA_GLOBS | —（可用性规律） |
| fw_mysql_too_many_indexes | warn | 单 CREATE TABLE 块非 PRIMARY KEY/INDEX 行 >5 → warn | MYSQL_SCHEMA_GLOBS | —（写放大） |
| fw_mysql_select_star | warn | SELECT * FROM → warn 破坏覆盖索引 | MYSQL_SQL_GLOBS | —（性能规律） |
| fw_mysql_like_wildcard | warn | LIKE '% 前置通配 → warn 索引失效 | MYSQL_SQL_GLOBS | —（索引失效） |
| fw_mysql_implicit_join | warn | FROM a, b 隐式逗号连接 → warn | MYSQL_SQL_GLOBS | —（笛卡尔积风险） |
| fw_mysql_order_rand | warn | ORDER BY RAND() → warn filesort 全扫 | MYSQL_SQL_GLOBS | —（filesort 全扫） |
| fw_mysql_long_tx | warn | autocommit=0 或事务内 SLEEP( → warn 长事务 | MYSQL_SQL_GLOBS | —（MVCC 膨胀） |

<!--
门禁 id 命名规范：fw_mysql_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/mysql.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_mysql_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: mysql  requires_conf: MYSQL_SQL_GLOBS MYSQL_SCHEMA_GLOBS` 声明。
fixture 验证覆盖：violating 含 CHARSET=utf8 + LIMIT 100000,10 深分页 + SELECT * 前置通配 LIKE → charset/deep_paging fail 主触发（expected-fail-ids 2/2 已登记）；compliant 修正后全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| mysql × mybatis | MyBatis `${}` 拼接 ORDER BY/表名须白名单，参数一律 #{} | 字符串拼接绕过参数化 → SQL 注入 CWE-89 |
| mysql × sharding | 分库分表后 DML WHERE 必须含分片键；深分页跨分片归并更禁大 offset | 无分片键 → 全分片广播扫描 |
| mysql × spring-boot | spring.datasource 必须配连接池（HikariCP 默认）且 maxLifetime < wait_timeout | 连接存活超 MySQL wait_timeout → 拿死连接报错 |
| mysql × flyway/liquibase | 变更脚本必须可重入且 DDL 标 ALGORITHM | 与 online DDL 规律联动，防 CI 跑 COPY 锁表 |

<!--
本表聚焦 mysql 生态内高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| MySQL 8.0.12 | ALGORITHM=INSTANT 引入（加列秒级） | 8.0.12 前加列只能 INPLACE/COPY，DDL 规律按版本分层 |
| MySQL 8.0.18 | hash join 引入；EXPLAIN ANALYZE 可用 | 无索引等值连接有兜底，但内表索引规律不变 |
| MySQL 8.0.29 | utf8mb3 显式 deprecated | utf8/utf8mb3 检出告警级别可升 fail |
| MySQL 8.4 LTS | 默认认证插件 mysql_native_password 移除（改 caching_sha2_password） | 老客户端连不上；驱动须升级 |
| MySQL 9.x | Innovation 季度发布（9.7.1 为 2026-06 GA）；26.x 年号制系列出现在文档选择器（待验证 GA 状态） | 待验证：9.x→26.x 接替关系未联网核实，升级窗口须人工确认 |
| MySQL 5.7 | 已 EOL（2023-10） | 存量 5.7 项目须提示立即规划升级 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
