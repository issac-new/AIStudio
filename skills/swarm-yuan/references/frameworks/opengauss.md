---
ruleset_id: opengauss
适用版本: openGauss 5.0/6.0 LTS（7.0.0-RC 差异单独标注；PG 协议兼容，JDBC 驱动 org.opengauss:opengauss-jdbc）
最后调研: 2026-07-23（来源：https://docs.opengauss.org ；https://gitee.com/opengauss/openGauss-server ；https://gitee.com/opengauss/openGauss-connector-jdbc ；OWASP Top 10 / CWE 标准映射）
深度门槛: 10
---

# openGauss 规则集

<!--
本规则集覆盖 openGauss（信创数据库，华为主导开源；5.0/6.0 LTS 为主线，7.0.0-RC 差异在 §6 标注）。
openGauss 与 PostgreSQL 协议兼容（5432 端口、psycopg2/PG 驱动可连），但自带增强：
MOT 内存引擎、AI 自治运维、全密态数据库、audit_trail 审计参数族。JDBC 驱动为
org.opengauss:opengauss-jdbc（fork 自 pgjdbc），URL 形如 jdbc:opengauss://host:5432/db。
本规则集聚焦"应用接入 + 服务端配置"的安全与可靠性红线（硬编码密码、明文传输、
trust 全开放、SQL 注入、多租户隔离），规则与 postgresql.md 不重复（那边管 SQL 方言，
这边管接入安全与运维配置）。
调研时点：2026-07-23。证据来源：openGauss 官方文档（docs.opengauss.org）+ OWASP/CWE 标准。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.opengauss:opengauss-jdbc`（pom.xml groupId/artifactId） | 高 |
| 依赖 | `psycopg2` / `psycopg2-binary`（requirements.txt；PG 协议兼容驱动，须与配置信号组合） | 中 |
| 配置 | `jdbc:opengauss://` / `org.opengauss.Driver` / 5432 端口数据源 | 高 |
| 文件 | `**/pg_hba.conf` / `**/postgresql.conf` 含 `audit_trail` 等 openGauss 专属参数 | 中（PG 同源，需组合信号） |
| 代码 | `psycopg2.connect(` / `DruidDataSource` + opengauss URL | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
`jdbc:opengauss://` 与 opengauss-jdbc 依赖为独立可定框架信号；psycopg2 与 PG 同源，
须与依赖/配置信号组合确认，避免纯 PostgreSQL 项目误激活。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 数据源配置：`grep -rnE 'jdbc:opengauss://|org\.opengauss\.Driver' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties' --include='*.xml' --include='*.java' --include='*.py' --include='*.go'`（计数核验基准：数据源配置行数）
- pg_hba 认证规则：`grep -rnE '^[[:space:]]*(local|host)' "${PROJECT_DIR}" --include='pg_hba.conf'`（计数核验基准：非注释认证规则行数）
- DDL 建表脚本：`grep -rlEi 'CREATE[[:space:]]+TABLE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：含 CREATE TABLE 的 .sql 文件数）
- RLS 策略：`grep -rnEi 'CREATE[[:space:]]+POLICY|ROW LEVEL SECURITY' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：RLS 策略/启用行数）
- 审计配置：`grep -rnE 'audit_trail|log_min_duration_statement|autovacuum' "${PROJECT_DIR}" --include='postgresql.conf' --include='postgresql.auto.conf'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：连接串/数据源密码禁硬编码，必须环境变量或密钥管理服务注入
- **适用版本**: 全版本
- **规律**: `jdbc:opengauss://host:5432/db?user=admin&password=xxx`、`props.setProperty("password","Admin@123")`、`psycopg2.connect(password="...")` 等写法把数据库凭证钉进源码与 git 历史。密码必须 `System.getenv`/`os.environ.get` 读取，或经 Vault/KMS/配置中心加密注入；连接串只放主机端口与参数，凭证走独立注入通道。
- **违反后果**: 凭证随仓库泄露即被拖库（CWE-798）；git 历史残留须轮换全库账号才能止损；信创等保测评直接判不合格。
- **验证方法**: 检出 `(password|passwd|pwd)="..."`（≥4 字符字面值）或 URL 内嵌 `user:pass@` / `&password=字面值` → fail。
- **对应门禁**: fw_opengauss_hardcoded_password(fail)

```verify
id: opengauss-r1
cmd: 
expect: always
```

- **证据**: CWE-798 Use of Hard-coded Credentials；OWASP Top 10 A07:2021 Identification and Authentication Failures；openGauss 官方文档《数据库安全 > 用户权限控制》建议密码不落盘明文（https://docs.opengauss.org ）。

### 规律：生产必须连接池（Druid/HikariCP/pgbouncer），禁 DriverManager/psycopg2 裸连
- **适用版本**: 全版本
- **规律**: openGauss 每个连接对应一个 backend 线程模型（区别于 PG 进程模型，但连接建立成本同样高），`DriverManager.getConnection(...)` / `psycopg2.connect(...)` 每请求裸连会在高并发下打满 max_connections 并拖垮线程调度。Java 侧必须 Druid/HikariCP（Druid 为信创主流），Python 侧 psycopg2-pool/SQLAlchemy pool，服务端侧可叠加 pgbouncer 连接复用；池上限须与 max_connections 联调并留系统会话余量。
- **违反后果**: 并发峰值连接耗尽报"sorry, too many clients"；连接风暴雪崩，RT 毛刺。
- **验证方法**: 检出 openGauss 数据源（jdbc:opengauss:// / psycopg2.connect）但全工程无连接池信号（DruidDataSource/HikariCP/pgbouncer/maxPoolSize）→ warn。
- **对应门禁**: fw_opengauss_conn_pool(warn)

```verify
id: opengauss-r2
cmd: 
expect: always
```

- **证据**: openGauss 官方文档《开发者指南 > JDBC 开发》建议连接池管理（https://docs.opengauss.org ）；信创实践 Druid+openGauss 组合（https://gitee.com/opengauss/openGauss-connector-jdbc ）。

### 规律：SQL 禁字符串拼接，必须参数化查询（绑定变量）
- **适用版本**: 全版本
- **规律**: `"SELECT * FROM users WHERE name = '" + name + "'"`、Python f-string 拼 SQL（`f"SELECT ... {uid}"`）把用户输入直接并进 SQL 文本，openGauss 语法层不豁免注入。必须参数化：Java `PreparedStatement` + `?` 绑定，Python `cursor.execute(sql, (param,))` %s 占位，Go `db.Query(sql, $1)`。排序字段/表名等无法绑定的位置用白名单枚举映射，禁止直拼。
- **违反后果**: SQL 注入（CWE-89）——拖库、越权改写、堆叠查询破坏数据；等保/密评红线。
- **验证方法**: 检出 SQL 关键字字符串后跟 `+` 拼接（`"SELECT..." + var`）或 f-string 内嵌 SQL（`f"...SELECT..."`）→ fail。
- **对应门禁**: fw_opengauss_sql_concat(fail)

```verify
id: opengauss-r3
cmd: 
expect: always
```

- **证据**: CWE-89 SQL Injection；OWASP Top 10 A03:2021 Injection；openGauss 官方文档《SQL 参考 > PREPARE/EXECUTE》参数化执行（https://docs.opengauss.org ）。

### 规律：连接必须 SSL/TLS，sslmode=disable 禁上线（禁明文传输）
- **适用版本**: 全版本（openGauss 支持 SSL 双向认证，服务端 ssl 参数默认 on，须配证书）
- **规律**: 客户端 `sslmode=disable` / `ssl=false` 时口令与查询结果明文过网，跨机房/跨 VPC 部署等同裸奔。生产必须 `sslmode=verify-full`（或至少 require）+ `sslrootcert` 指定 CA 证书；服务端 postgresql.conf `ssl=on` 且 pg_hba 用 hostssl 强制加密通道。测试环境也不得把 disable 配置带进生产构建产物。
- **违反后果**: 凭证与数据链路窃听/中间人篡改（CWE-319）；信创密评（GM/T）不过。
- **验证方法**: 检出 `sslmode=disable` / `ssl=false` 显式配置 → fail。
- **对应门禁**: fw_opengauss_ssl_disabled(fail)

```verify
id: opengauss-r4
cmd: 
expect: always
```

- **证据**: CWE-319 Cleartext Transmission of Sensitive Information；openGauss 官方文档《数据库安全 > 通信加密》SSL 配置（https://docs.opengauss.org ）。

### 规律：pg_hba.conf 禁 trust 认证全开放，须 scram-sha-256 + hostssl 收敛
- **适用版本**: 全版本（openGauss 默认口令认证 sha256，兼容 md5/scram-sha-256；md5 已不推荐）
- **规律**: pg_hba.conf 中 `host all all 0.0.0.0/0 trust` 表示任意来源免密直连——这在容器化/云环境等于把数据库挂到公网。认证方式必须 scram-sha-256（或 sha256），禁 trust 于任何 host 行（含 local 行生产同样不建议）；CIDR 按应用网段收敛禁 0.0.0.0/0；远程访问用 hostssl 行强制 SSL；md5 残留须升级（口令哈希强度不足）。
- **违反后果**: 未授权访问（CWE-306）——免密拖库、勒索投毒；等保基线直接判高风险。
- **验证方法**: pg_hba.conf 检出 `host` 开头行含 `trust` → fail。
- **对应门禁**: fw_opengauss_pg_hba_trust(fail)

```verify
id: opengauss-r5
cmd: 
expect: always
```

- **证据**: CWE-306 Missing Authentication for Critical Function；openGauss 官方文档《数据库安全 > 客户端接入认证》pg_hba.conf 配置（https://docs.opengauss.org ）。

### 规律：必须开启审计日志（audit_trail），覆盖登录与 DDL/DML 关键操作
- **适用版本**: 全版本（audit_trail 取值 none/os/xml/csvlog；3.0 起审计参数族完善）
- **规律**: openGauss 审计默认关（audit_trail=none），无审计则入侵溯源与合规审计（等保 2.0 三级要求审计记录留存 ≥6 个月）无从谈起。生产 postgresql.conf 必须 `audit_trail=os`（或 xml/csvlog），并按需开 `audit_system_object`/`audit_dml_state`/`audit_login_logout` 细粒度项；审计目录须独立权限并外送 SIEM 防篡改。
- **违反后果**: 安全事件无法溯源定责（CWE-778 日志不足）；等保测评缺项。
- **验证方法**: 工程内含 postgresql.conf 但全部无 `audit_trail`/`pgaudit` 配置 → warn。
- **对应门禁**: fw_opengauss_audit_log(warn)

```verify
id: opengauss-r6
cmd: 
expect: always
```

- **证据**: CWE-778 Insufficient Logging；openGauss 官方文档《数据库安全 > 审计》audit_trail 参数族（https://docs.opengauss.org ）；GB/T 22239-2019 等保 2.0 安全审计要求。

### 规律：多租户表必须 row-level security（RLS）隔离，禁裸租户字段约定
- **适用版本**: 1.1.0+ 支持 RLS（CREATE POLICY / ALTER TABLE ... ENABLE ROW LEVEL SECURITY）
- **规律**: 多租户表只加 `tenant_id` 列、靠应用层 WHERE 自觉过滤，任何一处漏写即跨租户读/写。openGauss 原生 RLS：`ALTER TABLE t ENABLE ROW LEVEL SECURITY` + `CREATE POLICY p ON t USING (tenant_id = current_setting('app.tenant_id'))`，把隔离收敛到数据库层，应用经会话变量声明租户身份。超管/维护账号须显式 BYPASS 审计。
- **违反后果**: 跨租户数据泄露/篡改（CWE-639 基于用户密钥的授权绕过）；SaaS 场景致命。
- **验证方法**: DDL 检出 `tenant_id` 列但全工程无 `CREATE POLICY`/`ROW LEVEL SECURITY` → warn。
- **对应门禁**: fw_opengauss_rls(warn)

```verify
id: opengauss-r7
cmd: 
expect: always
```

- **证据**: CWE-639 Authorization Bypass Through User-Controlled Key；openGauss 官方文档《SQL 参考 > CREATE POLICY》行级访问控制（https://docs.opengauss.org ）。

### 规律：必须配置慢查询日志（log_min_duration_statement）
- **适用版本**: 全版本（PG 兼容参数族）
- **规律**: 不配 `log_min_duration_statement` 则慢 SQL 无落点，性能劣化只能靠业务投诉发现。生产建议 `log_min_duration_statement=1000`（1s，按 SLA 收紧），配套 `log_statement=none` 避免全量刷盘；慢日志须接入采集（filebeat/fluent-bit）并定期 TOP-N 治理。全量审计 DML 与慢日志二选一，防 I/O 打满。
- **违反后果**: 慢查询长期潜伏，连接池被长尾请求拖死；性能问题定位周期从分钟级变天级。
- **验证方法**: 工程内含 postgresql.conf 但全部无 `log_min_duration_statement` → warn。
- **对应门禁**: fw_opengauss_slow_log(warn)

```verify
id: opengauss-r8
cmd: 
expect: always
```

- **证据**: openGauss 官方文档《管理员指南 > 配置运行参数 > 错误报告和日志》（https://docs.opengauss.org ）。

### 规律：Java 侧必须 PreparedStatement，禁 createStatement 裸语句执行
- **适用版本**: 全版本（opengauss-jdbc 全系列）
- **规律**: 即使做了参数化"拼装转义"，`Statement.executeQuery("...")` 走裸文本协议，转义遗漏即注入；且每次执行重新硬解析，无法复用执行计划。必须 `conn.prepareStatement(sql)` + setXxx 绑定——openGauss-jdbc 对 PreparedStatement 支持 prepared 计划缓存（prepareThreshold），高频 SQL 性能同步受益。本规律是规律 3 的 Java 落地形态：拼接直接 fail，裸 Statement 未拼接亦 warn 提示改造。
- **违反后果**: SQL 注入面残留（CWE-89 变体）；执行计划无法缓存，CPU 白耗。
- **验证方法**: 检出 `createStatement()` → warn 改 PreparedStatement。
- **对应门禁**: fw_opengauss_statement(warn)

```verify
id: opengauss-r9
cmd: 
expect: always
```

- **证据**: CWE-89；openGauss-connector-jdbc 文档 PreparedStatement 用法（https://gitee.com/opengauss/openGauss-connector-jdbc ）。

### 规律：禁关闭 autovacuum，须定期 VACUUM/ANALYZE 保统计信息与空间回收
- **适用版本**: 全版本（MOT 内存表不适用，行存表适用）
- **规律**: openGauss 行存基于 MVCC（USTORE/ASTORE 双引擎），更新/删除产生死元组，`autovacuum=off` 会让表与索引持续膨胀、统计信息腐化 → 执行计划劣化。禁止全局关 autovacuum；批量导入临时 `ALTER TABLE ... (autovacuum_enabled=false)` 后必须恢复并手工 `VACUUM ANALYZE`；高更新表调低 autovacuum 触发阈值而非关闭。
- **违反后果**: 表膨胀数倍、查询计划失真全表扫描；磁盘打满实例宕机。
- **验证方法**: postgresql.conf 检出 `autovacuum=off` → warn。
- **对应门禁**: fw_opengauss_autovacuum(warn)

```verify
id: opengauss-r10
cmd: 
expect: always
```

- **证据**: openGauss 官方文档《管理员指南 > 例行维护》VACUUM/ANALYZE（https://docs.opengauss.org ）。

<!--
共 10 条规律（=10 门槛）对应 10 个门禁 id，全部挂门禁 id，无游离规律、无"人工检查"。
fail 4 条：hardcoded_password / sql_concat / ssl_disabled / pg_hba_trust。
warn 6 条：conn_pool / audit_log / rls / slow_log / statement / autovacuum。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_opengauss_hardcoded_password | fail | password="..."/URL user:pass@/&password=字面值 → fail | OPENGAUSS_GLOBS | CWE-798 |
| fw_opengauss_sql_concat | fail | SQL 关键字字符串 + 拼接 / f-string 内嵌 SQL → fail | OPENGAUSS_GLOBS | CWE-89 |
| fw_opengauss_ssl_disabled | fail | sslmode=disable / ssl=false → fail 禁明文传输 | OPENGAUSS_GLOBS | CWE-319 |
| fw_opengauss_pg_hba_trust | fail | pg_hba.conf host 行含 trust → fail 免密全开放 | OPENGAUSS_GLOBS | CWE-306 |
| fw_opengauss_conn_pool | warn | 有 openGauss 数据源但无连接池信号 → warn | OPENGAUSS_GLOBS | CWE-400 |
| fw_opengauss_audit_log | warn | postgresql.conf 无 audit_trail → warn 须开审计 | OPENGAUSS_GLOBS | CWE-778；GB/T 22239 |
| fw_opengauss_rls | warn | DDL 含 tenant_id 但无 CREATE POLICY/RLS → warn | OPENGAUSS_GLOBS | CWE-639 |
| fw_opengauss_slow_log | warn | postgresql.conf 无 log_min_duration_statement → warn | OPENGAUSS_GLOBS | — |
| fw_opengauss_statement | warn | createStatement() → warn 改 PreparedStatement | OPENGAUSS_GLOBS | CWE-89 |
| fw_opengauss_autovacuum | warn | autovacuum=off → warn 禁全局关自动清理 | OPENGAUSS_GLOBS | — |

<!--
门禁 id 命名规范：fw_opengauss_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/opengauss.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_opengauss_<rule>(fail|warn) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: opengauss  requires_conf: OPENGAUSS_GLOBS` 声明。
fixture 验证覆盖：violating 含 URL 硬编码密码 + sslmode=disable + SQL 拼接 + createStatement
+ pg_hba trust + 无审计/慢日志 + autovacuum=off → hardcoded_password/sql_concat/ssl_disabled/
pg_hba_trust 四个 fail 主触发（expected-fail-ids 已登记）；compliant 修正后 exit 0。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| opengauss × mybatis | Mapper XML 中 `${}` 拼接仍按 SQL 注入红线禁用（同 mybatis 规则集）；参数一律 #{} 绑定 | 字符串拼接绕过参数化 → SQL 注入 CWE-89，与本集 fw_opengauss_sql_concat 联动 |
| opengauss × spring-boot | datasource 必须 driver-class-name=org.opengauss.Driver + jdbc:opengauss://；密码经 ${ENV} 占位 | 错配 postgresql 驱动在 openGauss 增强语法上行为差异；密码占位防 CWE-798 |
| opengauss × druid | Druid 为信创主流连接池，须配 maxActive 与 openGauss max_connections 联调，开 testWhileIdle 探活 | 无探活时空闲连接被服务端超时回收，业务拿到死连接报错 |
| opengauss × flyway/liquibase | 变更脚本禁含 trust 放开、禁关 autovacuum 的"运维便利"语句；RLS 策略入版本化迁移 | 与 fw_opengauss_pg_hba_trust/autovacuum/rls 联动，防 CI 迁移把红线配置带进生产 |

<!--
本表聚焦信创迁移高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| openGauss 3.0/3.1 | 审计参数族完善（audit_trail + audit_* 细粒度项） | 更早版本审计能力弱，fw_opengauss_audit_log 按现行参数族陈述 |
| openGauss 5.0 LTS（2023-03） | 资源池化架构、全密态增强；opengauss-jdbc 独立演进 | 驱动与服务端版本须配套（官网兼容矩阵） |
| openGauss 6.0 LTS（2024-03） | USTORE 引擎默认化推进、AI 自治（DBMind）增强 | autovacuum 行为与 3.x 有差异，阈值调优以 6.0 文档为准 |
| openGauss 7.0.0-RC（2025-03） | 向量引擎（DataVec）融合、oGEngine 演进 | RLS/审计参数名如调整须重估本集规律 |
| MySQL 兼容（dolphin 插件） | B 兼容性插件提供 MySQL 协议/语法兼容 | 兼容模式下部分 PG 系参数语义差异，迁移项目须实测复核 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的
版本号匹配本表，落在受影响区间的项目须额外提示。
-->
