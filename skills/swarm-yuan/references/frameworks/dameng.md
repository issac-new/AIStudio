---
ruleset_id: dameng
适用版本: 达梦 DM8（8.1.x 全系列；2023 年 5 月后版本新增 AUTO_INCREMENT 兼容语法；DM7 差异单独标注）
最后调研: 2026-07-20（来源：https://eco.dameng.com/document/dm/zh-cn/faq/faq-sql-gramm.html ；https://eco.dameng.com/document/dm/zh-cn/faq/FAQ_FUNCTION.html ；https://eco.dameng.com/document/dm/zh-cn/faq/faq-mysql-dm8-migrate.html ；https://eco.dameng.com/community/article/6ca6b591fecb40d2941e524af5fc25c9 ；https://eco.dameng.com/community/article/6c62f049bc9776932a8dadf5142357f8 ）
深度门槛: 10
---

# 达梦 DM8 规则集

<!--
本规则集覆盖达梦 DM8（信创数据库，8.1.x 系列；版本号形如 8.1.2.192 / 8.1.3.140，
官方打包号形如 --03134284368-20250423-270902-20149）。
调研时点：2026-07-20。证据来源分两层：达梦官方 FAQ/社区（eco.dameng.com）+ 公开迁移实践复盘
（CSDN/博客园/掘金，均为 B 级权威度，多源交叉印证）；凡仅单源支撑的点已在正文标"待验证"。
DM8 提供 COMPATIBLE_MODE 实例参数（0 不兼容 / 1 SQL92 / 2 Oracle / 3 MSSQL / 4 MySQL 等），
MySQL 兼容模式只解决一部分语法，大小写、字节长度语义、保留字、自增语义不受其豁免——
本规则集默认按"非 MySQL 兼容模式"立规，兼容模式下个别 fail 可降级，见各规律正文。
DM7 不支持 AUTO_INCREMENT 语法、无 MySQL 兼容模式增强，差异在 §6 标注。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.dameng:DmJdbcDriver18` / `Dm8JdbcDriver18` / `DmDialect-for-hibernate*` / `dm-python` / `sqlalchemy-dm` | 高 |
| 配置 | `jdbc:dm://` / `dm.jdbc.driver.DmDriver` / 5236 端口数据源 | 高 |
| 文件 | `**/dm.ini` / `**/dm_svc.conf` / DDL 含 `IDENTITY(` 或 `STORAGE(` 子句 | 中（需排除他用） |
| 代码 | `ROWNUM` / `LISTAGG(` / `SET IDENTITY_INSERT` / `NEXTVAL(` / `SYSDATE` | 中（Oracle 系同源，需组合信号） |
| 注解/方言 | `org.hibernate.dialect.DmDialect` / `DmDialect-for-hibernate` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
`jdbc:dm://` 与 DmJdbcDriver 依赖为独立可定框架信号；ROWNUM/LISTAGG 与 Oracle 同源，
须与依赖/配置信号组合确认，避免 Oracle/人大金仓 Oracle 模式误激活。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- DDL 建表脚本：`grep -rlEi 'CREATE[[:space:]]+TABLE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：含 CREATE TABLE 的 .sql 文件数）
- IDENTITY 自增列：`grep -rnEi 'IDENTITY[[:space:]]*\(' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：IDENTITY 定义行数）
- 序列定义：`grep -rnEi 'CREATE[[:space:]]+SEQUENCE' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：CREATE SEQUENCE 语句数）
- 达梦数据源引用：`grep -rnE 'jdbc:dm://' "${PROJECT_DIR}" --include='*.yml' --include='*.yaml' --include='*.properties' --include='*.xml'`（计数核验基准：数据源配置行数）
- MySQL 方言残留：`grep -rnEi 'ENGINE[[:space:]]*=|AUTO_INCREMENT|ON[[:space:]]+DUPLICATE[[:space:]]+KEY|UNSIGNED' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：残留语句行数）
- 保留字风险列：`grep -rnEi '^[[:space:]]*(domain|context|percent|top|type|identity|model|dimension)[[:space:]]+(varchar|int|bigint|char|numeric|number|timestamp)' "${PROJECT_DIR}" --include='*.sql'`（计数核验基准：裸保留字列定义行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）

### 规律：大小写敏感由 CASE_SENSITIVE 建库参数决定且不可改，引号小写标识符必须全链路带引号
- **适用版本**: 全版本（DM7/DM8；CASE_SENSITIVE 为 dminit 建库参数，建库后不可修改）
- **规律**: DM 标识符大小写敏感是"参数 + 双引号"双重条件：未加引号的对象名一律归一化为大写存储与匹配；一旦用双引号定义了小写对象名（如 `CREATE TABLE "users"`），此后所有访问必须带引号且大小写精确（`select * from users` 报"无效的对象名/表名"）。MySQL 迁移项目对象名多为小写：要么 DTS 迁移时不勾"保持对象名大小写"（对象名转大写，应用无引号可访问），要么接受全链路引号改造。禁止同一库内引号小写名与裸名混用。
- **违反后果**: 应用启动即报"无效的对象名/无效的列名"；MyBatis-Plus 自动加引号的列与裸写 SQL 混用 → 查询全挂；MAP 接收结果集时返回列名全大写导致 get(小写key) 取不到值。
- **验证方法**: `grep -inE 'CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?"[a-z]|^[[:space:]]*"[a-z][A-Za-z_0-9]*"[[:space:]]+[A-Za-z]' --include='*.sql'`（引号包裹的小写表名/列名命中）。
- **对应门禁**: fw_dameng_case_sensitive(fail)

```verify
id: dameng-r1
cmd: grep -inE 'CREATE[[:space:]]+TABLE[[:space:]]+(IF[[:space:]]+NOT[[:space:]]+EXISTS[[:space:]]+)?"[a-z]|^[[:space:]]*"[a-z][A-Za-z_0-9]*"[[:space:]]+[A-Za-z]' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://juejin.cn/post/7447464917043920947 ；https://www.cnblogs.com/SuperChaos/p/17480196.html ；https://blog.csdn.net/limintjhn8820/article/details/141173533 ；官方 FAQ https://eco.dameng.com/document/dm/zh-cn/faq/faq-mysql-dm8-migrate.html

### 规律：DM 保留字作裸标识符必报"语法分析出错"，须双引号或 KEYWORDS/EXCLUDE_RESERVED_WORDS 屏蔽
- **适用版本**: 全版本（DM8 各季度版本会持续新增保留字，如 2025 版新增 MODEL、DIMENSION）
- **规律**: `V$RESERVED_WORDS` 中 RESERVED='Y' 的词（高频踩中：DOMAIN、CONTEXT、PERCENT、TOP、TYPE、IDENTITY、MODEL、DIMENSION、VERIFY、REFERENCE、REF、LOGIN、OFFSET、LIMIT）作裸表名/列名 → 建表或查询报"语法分析出错"。处置三法（优先级递减）：①改名规避；②客户端 dm_svc.conf 或 JDBC URL 加 `keywords=(DOMAIN,...)` 自动加引号；③服务端 dm.ini `EXCLUDE_RESERVED_WORDS=...`（静态参数，RES_FIXED=N 才可屏蔽，重启生效，不推荐优先用）。仅改名是一次性根治；屏蔽方案随版本新增保留字反复发病。
- **违反后果**: 建库脚本执行失败；更隐蔽的是升级 DM 小版本后旧 SQL 突然报语法错（新增保留字撞名存量对象）。
- **验证方法**: 扫描 CREATE TABLE 块内列定义行首词命中保留字清单且未加双引号 → fail。
- **对应门禁**: fw_dameng_reserved_word(fail)

```verify
id: dameng-r2
cmd: 
expect: always
```

- **证据**: https://eco.dameng.com/community/article/6ca6b591fecb40d2941e524af5fc25c9 ；https://www.cnblogs.com/chuanzhang053/p/17295371.html ；https://eco.dameng.com/community/question/316a61d022f4f31d0cffd74d9a8e02f9 ；http://mp.weixin.qq.com/s?__biz=MzU2MTA2MzQyNw==&mid=2247488728&idx=1&sn=8de8db2a47e5bc155319dca94abb4cff

### 规律：MySQL DDL 方言残留（ENGINE=/反引号/UNSIGNED/ON DUPLICATE KEY/UPDATE|DELETE...LIMIT）在 DM 必报错
- **适用版本**: 全版本（MySQL 兼容模式 4 亦不豁免引擎子句与反引号外的这些残留）
- **规律**: DM 无存储引擎概念，`ENGINE=InnoDB` / `DEFAULT CHARSET=utf8` 建表子句必须删除；标识符引用用双引号而非反引号；`UNSIGNED`/`ZEROFILL` 列属性不支持；`INSERT ... ON DUPLICATE KEY UPDATE` 须改标准 `MERGE INTO`；MySQL 特有的 `UPDATE ... LIMIT n` / `DELETE ... LIMIT n` 不支持，须改 `WHERE ROWNUM <= n`。
- **违反后果**: 迁移脚本在 DM 执行报语法错误，建库即失败；UPSERT 逻辑缺失导致唯一键冲突直接抛异常。
- **验证方法**: `grep -inE 'ENGINE[[:space:]]*=[[:space:]]*[A-Za-z]|UNSIGNED([^A-Za-z_]|$)|ON[[:space:]]+DUPLICATE[[:space:]]+KEY|\`` --include='*.sql'` 及 `grep -inE '^[[:space:]]*(UPDATE|DELETE)[[:space:]].*LIMIT[[:space:]]+[0-9]+'`。
- **对应门禁**: fw_dameng_mysql_syntax(fail)

```verify
id: dameng-r3
cmd: grep -inE 'ENGINE[[:space:]]*=[[:space:]]*[A-Za-z]|UNSIGNED([^A-Za-z_]|$)|ON[[:space:]]+DUPLICATE[[:space:]]+KEY|`' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://blog.csdn.net/weixin_39495005/article/details/155937957 ；https://blog.csdn.net/MmmSC/article/details/157652921 ；https://my.oschina.net/emacs_7996326/blog/19349646

### 规律：ROWNUM 过滤只能 <=/<，直接 ROWNUM > n / BETWEEN 恒为空集，深翻页必须子查询包装
- **适用版本**: 全版本
- **规律**: ROWNUM 伪列从 1 开始、随结果集行输出递增分配，`WHERE ROWNUM > 10`（或 `ROWNUM BETWEEN 11 AND 20`）因第一行 ROWNUM=1 不满足条件即被丢弃、后续行永远轮不到 → 恒返回空集。翻页必须包装：`SELECT * FROM (SELECT ROWNUM rn, t.* FROM (...) t WHERE ROWNUM <= :end) WHERE rn > :start`，或直接用 DM8 原生 `LIMIT m OFFSET n` / `OFFSET n ROWS FETCH NEXT m ROWS ONLY`。DM8 四种分页语法（TOP / LIMIT / FETCH NEXT / ROWNUM）中 ROWNUM 是兼容老系统的最后选择。
- **违反后果**: 翻页接口静默返回空列表，测试小数据量时不暴露（第一页 ROWNUM<=n 正常），上线翻到第二页即"丢数据"。
- **验证方法**: `grep -inE 'ROWNUM[[:space:]]*(>=?|BETWEEN[[:space:]])' --include='*.sql'`（ROWNUM <= / < 为合法用法不命中）。
- **对应门禁**: fw_dameng_rownum(fail)

```verify
id: dameng-r4
cmd: grep -inE 'ROWNUM[[:space:]]*(>=?|BETWEEN[[:space:]])' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: http://blog.csdn.net/qq_27756951/article/details/149009641 ；https://ask.csdn.net/questions/8829228

### 规律：GROUP_CONCAT 在 DM 不存在，须改 LISTAGG（或 WM_CONCAT）
- **适用版本**: 全版本
- **规律**: MySQL `GROUP_CONCAT(col)` 在 DM 报"无法解析的成员访问表达式[GROUP_CONCAT]"。官方推荐替代：`LISTAGG(col, ',') WITHIN GROUP (ORDER BY col)`（Oracle 标准语法，可排序）；`WM_CONCAT(col)` 可用但不保证顺序。注意 LISTAGG 无 GROUP_CONCAT 的 DISTINCT 直写与 SEPARATOR 子句，DISTINCT 须子查询先去重；结果长度受 VARCHAR 上限约束，超长须 CAST 为 CLOB。
- **违反后果**: 聚合查询直接报错，接口 500。
- **验证方法**: `grep -inE 'GROUP_CONCAT[[:space:]]*\(' --include='*.sql'`。
- **对应门禁**: fw_dameng_group_concat(fail)

```verify
id: dameng-r5
cmd: grep -inE 'GROUP_CONCAT[[:space:]]*\(' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://eco.dameng.com/document/dm/zh-cn/faq/FAQ_FUNCTION.html ；https://www.cnblogs.com/bugfdj/p/18547505 ；https://wenku.csdn.net/answer/6uh11hf0j8

### 规律：BOOLEAN/ENUM 列类型 DM 不支持，须改 BIT / VARCHAR+CHECK
- **适用版本**: 全版本
- **规律**: DM 无布尔类型，官方 FAQ 明确用 `BIT` 类型替代（MySQL 的 `TINYINT(1)` 布尔约定迁移时同样改 BIT）；MySQL `ENUM('a','b')` 不支持，DTS 评估建议转 VARCHAR/CHAR 并配 CHECK 约束。`DATETIME` 类型可用（含 `DATETIME(6)` 精度），不属本条。
- **违反后果**: 建表报"非法参数/语法分析出错"；布尔语义被错存成数值后应用层 true/1 判定口径漂移。
- **验证方法**: `grep -inE '[[:space:]]+BOOLEAN([[:space:],)]|$)|[[:space:]]+ENUM[[:space:]]*\(' --include='*.sql'`。
- **对应门禁**: fw_dameng_unsupported_type(fail)

```verify
id: dameng-r6
cmd: grep -inE '[[:space:]]+BOOLEAN([[:space:],)]|$)|[[:space:]]+ENUM[[:space:]]*\(' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://eco.dameng.com/document/dm/zh-cn/faq/faq-sql-gramm.html ；https://blog.csdn.net/kuyxerp/article/details/154186918

### 规律：IDENTITY 自增列禁止显式赋值，须 SET IDENTITY_INSERT ... ON 且列名列表齐全
- **适用版本**: 全版本
- **规律**: 含 `IDENTITY(seed,increment)` 列的表，INSERT 时对该列显式赋值会报"仅当指定列列表，且 SET IDENTITY_INSERT 为 ON 时，才能对自增列赋值"。正确姿势：`SET IDENTITY_INSERT <表> ON;` → INSERT（列名列表必须显式含该自增列）→ 会话结束或设新表时自动还原 OFF；一个会话同时只能有一张表 ON。另注意：IDENTITY 列插 0 报错（AUTO_INCREMENT 列插 0 受 NO_AUTO_VALUE_ON_ZERO 控制）；自增值一经生成不回滚，业务不得依赖其连续性；每表至多一个自增列；TRUNCATE 不重置自增当前值。
- **违反后果**: 数据初始化/迁移脚本大批量失败；手工补数后自增值从错误起点继续，主键冲突。
- **验证方法**: 提取含 IDENTITY 定义的表名集合，检出对同名表 `INSERT INTO t (ID, ...)`（首列 ID）且同文件无 `SET IDENTITY_INSERT` → fail（启发式：自增列按 ID 命名约定）。
- **对应门禁**: fw_dameng_identity_insert(fail)

```verify
id: dameng-r7
cmd: 
expect: always
```

- **证据**: https://eco.dameng.com/document/dm/zh-cn/faq/faq-sql-gramm.html ；https://eco.dameng.com/community/article/6c62f049bc9776932a8dadf5142357f8 ；https://www.cnblogs.com/skyheaving/p/12639913.html

### 规律：驱动必须是 dm.jdbc.driver.DmDriver + DmJdbcDriver18，且驱动版本须与服务端匹配
- **适用版本**: DM8（DmJdbcDriver18 对应 JDK8；15/16/17 分别对应 JDK1.5/1.6/1.7 老工程）
- **规律**: 达梦不兼容 MySQL 线协议，`jdbc:mysql://` + `com.mysql.cj.jdbc.Driver` 连 5236 端口必报"不支持的数据库类型"——必须 `jdbc:dm://host:5236[/DB]?schema=XXX` + `dm.jdbc.driver.DmDriver`。JDBC 驱动小版本须与服务端打包版本匹配（实证：服务端 20240715 版需驱动 8.1.3.149，旧驱动连不上或报"无效的列名"）；Hibernate 须配 `org.hibernate.dialect.DmDialect`（或按 hibernate 版本选 DmDialect-for-hibernate5.x/6.x 包），且一个工程只能存在一个驱动版本，多版本共存冲突。
- **违反后果**: 应用启动失败或元数据读取错乱（JPA "无效的列名"）；驱动/服务端错版本组合出现随机性协议错误。
- **验证方法**: 同一配置文件检出 `jdbc:dm://` 与 `com.mysql` 驱动类共存 → fail（fw_dameng_driver）；构建文件检出 `Dm(8)?JdbcDriver1[0-7]` 旧驱动 → warn（fw_dameng_driver_version）。
- **对应门禁**: fw_dameng_driver(fail) / fw_dameng_driver_version(warn)

```verify
id: dameng-r8
cmd: 
expect: always
```

- **证据**: https://www.cnblogs.com/mmsBlog/p/18406704 ；https://blog.csdn.net/chenyu940415/article/details/107712510 ；https://blog.csdn.net/qq_38584262/article/details/141884631 ；https://www.ewbang.com/community/article/details/1000177258.html

### 规律：AUTO_INCREMENT 仅 2023-05 后版本兼容，跨版本脚本应显式 IDENTITY
- **适用版本**: DM8 2023 年 5 月后版本新增 AUTO_INCREMENT 兼容语法（默认等价 IDENTITY(1,1)）；DM7 及更早 DM8 版本不支持
- **规律**: `id INT AUTO_INCREMENT PRIMARY KEY` 在新版 DM8 可执行，但旧版报语法错；且 AUTO_INCREMENT 插 0 行为受会话参数 NO_AUTO_VALUE_ON_ZERO（默认 1：插 0 自动取自增值）控制，与 IDENTITY 插 0 直接报错语义不同。迁移脚本应统一显式 `IDENTITY(1,1)`，或确认目标环境版本 ≥2023-05 打包。
- **违反后果**: 同一建库脚本在客户现场（旧版 DM8）执行失败；插 0 语义差异导致测试/生产行为不一致。
- **验证方法**: `grep -inE 'AUTO_INCREMENT' --include='*.sql'` → warn 提示版本区间与语义差异。
- **对应门禁**: fw_dameng_auto_increment(warn)

```verify
id: dameng-r9
cmd: grep -inE 'AUTO_INCREMENT' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://eco.dameng.com/document/dm/zh-cn/faq/faq-sql-gramm.html ；https://huaweicloud.csdn.net/63356f18d3efff3090b56c70.html

### 规律：事务隔离默认 READ COMMITTED；REPEATABLE READ 需服务端参数开启，SERIALIZABLE 必须配重试
- **适用版本**: 全版本
- **规律**: DM8 默认隔离级别 READ COMMITTED（语句级快照，与 MySQL 默认 RR 不同——MySQL 迁来依赖 RR 语义的应用必须显式 `SET TRANSACTION ISOLATION LEVEL` 或连接串配置）。REPEATABLE READ 需 dm.ini `ENABLE_REPEATABLEREAD=1` 才生效，否则静默回退 RC（待验证：该参数名源自单篇 Dify 适配文，建议以 V$DM_INI 实测复核）。SERIALIZABLE 下写-写冲突会抛"串行化事务被打断"错误，应用必须捕获并重试；语句末尾 `WITH UR` 可临时脏读。高并发 OLTP 推荐保持 RC。
- **违反后果**: 按 RR 假设写的余额扣减逻辑在 RC 下出现不可重复读异常；SERIALIZABLE 无重试 → 并发下事务随机失败。
- **验证方法**: 检出 `jdbc:dm://` 数据源配置但全部配置文件无 `isolation` 显式设置 → warn。
- **对应门禁**: fw_dameng_isolation(warn)

```verify
id: dameng-r10
cmd: 
expect: always
```

- **证据**: https://blog.csdn.net/qq_37358909/article/details/152039307 ；https://ascendai.csdn.net/69d4d74a72111d255bf7ea79 ；https://blog.csdn.net/ProceSeed/article/details/160588373

### 规律：MySQL 函数 IFNULL/NOW/DATE_FORMAT 在非兼容模式报错，统一改 NVL/CURRENT_TIMESTAMP/TO_CHAR
- **适用版本**: 全版本（COMPATIBLE_MODE=4 MySQL 兼容模式下部分函数可用，但不可依赖实例参数）
- **规律**: `IFNULL(a,b)` → `NVL(a,b)`（或标准 `COALESCE`）；`NOW()` → `CURRENT_TIMESTAMP` / `SYSDATE`；`DATE_FORMAT(d,'%Y-%m-%d')` → `TO_CHAR(d,'YYYY-MM-DD')`。同一 SQL 要在 MySQL/DM 双跑时，应收敛到双方共有的标准函数（COALESCE、CURRENT_TIMESTAMP），不要在代码里按库分叉拼接。
- **违反后果**: 非兼容模式实例执行报"无法解析的成员访问表达式"，功能直接不可用。
- **验证方法**: `grep -inE 'IFNULL[[:space:]]*\(|NOW[[:space:]]*\(\)|DATE_FORMAT[[:space:]]*\(' --include='*.sql'` → warn。
- **对应门禁**: fw_dameng_mysql_func(warn)

```verify
id: dameng-r11
cmd: grep -inE 'IFNULL[[:space:]]*\(|NOW[[:space:]]*\(\)|DATE_FORMAT[[:space:]]*\(' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://www.cnblogs.com/SuperChaos/p/17480196.html ；https://blog.csdn.net/weixin_39495005/article/details/155937957

### 规律：空字符串不等于 NULL，判空必须 IS NULL / IS NOT NULL
- **适用版本**: 全版本
- **规律**: DM 默认区分空串与 NULL（与 Oracle 的"空串即 NULL"不同），MySQL 迁来的 `WHERE col = ''` / `col != ''` 判空写法在 DM 语义下行为空集/非预期：NULL 行既不等于 '' 也不等于任何值。判空统一 `col IS NULL`；判"空串或 NULL"须 `(col IS NULL OR col = '')` 显式双条件。
- **违反后果**: 查询静默少返回 NULL 行，数据对不上且无报错。
- **验证方法**: `grep -inE "(=|<>|!=)[[:space:]]*''" --include='*.sql'` → warn。
- **对应门禁**: fw_dameng_empty_string(warn)

```verify
id: dameng-r12
cmd: grep -inE "(=|<>|!=)[[:space:]]*''" --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: https://ask.csdn.net/questions/8829228 ；https://blog.csdn.net/LogicGlow/article/details/157817719

### 规律：VARCHAR 长度默认按字节（LENGTH_IN_CHAR=0），UTF8 下 1 汉字占 3 字节
- **适用版本**: 全版本（LENGTH_IN_CHAR/UNICODE_FLAG 为 dminit 建库参数，建库后不可改）
- **规律**: 实例默认 `LENGTH_IN_CHAR=0`：VARCHAR(n) 按字节计，UTF8 字符集下 1 汉字 3 字节 → MySQL VARCHAR(10) 迁到 DM 同长度只能存 3 个汉字，报"列[NAMES]长度超出定义"。处置：①建库时 `LENGTH_IN_CHAR=1`（按字符放大存储：UTF8 下实际字节 = 定义长度×4）；②DDL 按 ×3 放大列长。注意 LENGTH_IN_CHAR=1 时存储字节上限 8188 不变；客户端 characterEncoding/NLS 参数不改变服务端长度语义。新版有废弃该参数动向（待验证：仅单源，规律按现行两参数陈述）。
- **违反后果**: 中文数据写入截断或报错，且只在真实中文数据到达时暴露，测试英文数据全绿。
- **验证方法**: 配置文件检出 `LENGTH_IN_CHAR[[:space:]]*=[[:space:]]*0` 显式字节模式 → warn 提示核对短 VARCHAR 中文容量；无配置时规律正文提示默认即 0。
- **对应门禁**: fw_dameng_varchar_length(warn)

```verify
id: dameng-r13
cmd: 
expect: always
```

- **证据**: https://blog.csdn.net/qq_42818496/article/details/140525144 ；https://ask.csdn.net/questions/9482915 ；https://devpress.csdn.net/v1/article/detail/136715307

### 规律：JDBC URL 应显式 schema=，用户即模式、跨模式访问须带前缀
- **适用版本**: 全版本
- **规律**: DM 中用户与模式默认同名绑定，`jdbc:dm://host:5236` 不显式指定 schema 时默认落在登录用户同名模式下；访问其他模式对象必须 `模式名.对象名` 全限定。多模块共用一库时（如 NACOS 模式、业务模式分离），URL 显式 `?schema=NACOS` 可避免初始化脚本落到 SYSDBA 模式下的高发事故。
- **违反后果**: 表建到 SYSDBA 模式下，应用按业务模式访问报"无效的表或视图名"。
- **验证方法**: 配置文件检出 `jdbc:dm://` 但全文件无 `schema=` → warn。
- **对应门禁**: fw_dameng_schema(warn)

```verify
id: dameng-r14
cmd: 
expect: always
```

- **证据**: https://segmentfault.com/a/1190000045065218 ；https://www.ewbang.com/community/article/details/1000177258.html

### 规律：深分页大 OFFSET 同样禁上线（≥10 万），改游标 WHERE id > ?
- **适用版本**: 全版本
- **规律**: DM8 原生 `LIMIT m OFFSET n` 与 MySQL 同构，大 offset 同样 O(offset) 扫描丢弃前 N 行；经验红线 offset > 10 万禁止上线，改游标 `WHERE id > :last ORDER BY id LIMIT 20` 或子查询先取主键再回表。ROWNUM 包装分页只是语法兼容，不改变扫描成本。
- **违反后果**: 深翻页 RT 随页码线性恶化，慢查询打满连接池。
- **验证方法**: `grep -inE 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' --include='*.sql'` → warn。
- **对应门禁**: fw_dameng_deep_paging(warn)

```verify
id: dameng-r15
cmd: grep -inE 'LIMIT[[:space:]]+[0-9]{6,}[[:space:]]*,|OFFSET[[:space:]]+[0-9]{6,}' --include='*.sql' "${PROJECT_DIR}"
expect: hits>0
```

- **证据**: http://blog.csdn.net/qq_27756951/article/details/149009641 ；https://wenku.csdn.net/answer/6v55vowx9d

<!--
共 15 条规律（≥10 门槛）对应 16 个门禁 id（驱动规律一条挂 fail+warn 双 id），
全部挂门禁 id，无游离规律、无"人工检查"。
fail 8 条：case_sensitive / reserved_word / mysql_syntax / rownum / group_concat / unsupported_type / identity_insert / driver。
warn 8 条：driver_version / auto_increment / isolation / mysql_func / empty_string / varchar_length / schema / deep_paging。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_dameng_case_sensitive | fail | DDL 检出 `CREATE TABLE "小写"` 或列定义行 `"小写"` 引号标识符 → fail | DAMENG_SCHEMA_GLOBS |
| fw_dameng_reserved_word | fail | 列定义行首词裸用保留字（domain/context/percent/top/type/identity/model/dimension/verify/reference/ref/login/offset/limit）→ fail | DAMENG_SCHEMA_GLOBS |
| fw_dameng_mysql_syntax | fail | ENGINE=/反引号/UNSIGNED/ON DUPLICATE KEY/UPDATE\|DELETE...LIMIT → fail | DAMENG_SQL_GLOBS DAMENG_SCHEMA_GLOBS |
| fw_dameng_rownum | fail | ROWNUM > / >= / BETWEEN → fail（恒空集） | DAMENG_SQL_GLOBS |
| fw_dameng_group_concat | fail | GROUP_CONCAT( → fail（DM 无此函数） | DAMENG_SQL_GLOBS |
| fw_dameng_unsupported_type | fail | BOOLEAN/ENUM 列类型 → fail（改 BIT / VARCHAR+CHECK） | DAMENG_SCHEMA_GLOBS |
| fw_dameng_identity_insert | fail | 对 IDENTITY 表显式 ID 首列 INSERT 且同文件无 SET IDENTITY_INSERT → fail | DAMENG_SQL_GLOBS DAMENG_SCHEMA_GLOBS |
| fw_dameng_driver | fail | 同配置文件 jdbc:dm:// 与 com.mysql 驱动类共存 → fail | DAMENG_SQL_GLOBS |
| fw_dameng_driver_version | warn | Dm(8)?JdbcDriver1[0-7] 旧驱动 → warn 须 DmJdbcDriver18 且版本匹配服务端 | DAMENG_SQL_GLOBS |
| fw_dameng_auto_increment | warn | AUTO_INCREMENT → warn（2023-05 前版本不支持；插 0 语义差异） | DAMENG_SCHEMA_GLOBS |
| fw_dameng_isolation | warn | jdbc:dm:// 数据源无显式 isolation 配置 → warn | DAMENG_SQL_GLOBS |
| fw_dameng_mysql_func | warn | IFNULL(/NOW()/DATE_FORMAT( → warn 改 NVL/CURRENT_TIMESTAMP/TO_CHAR | DAMENG_SQL_GLOBS |
| fw_dameng_empty_string | warn | =/<>/!= '' 判空 → warn 改 IS NULL | DAMENG_SQL_GLOBS |
| fw_dameng_varchar_length | warn | LENGTH_IN_CHAR=0 显式配置 → warn 字节语义中文容量 | DAMENG_SQL_GLOBS |
| fw_dameng_schema | warn | jdbc:dm:// 无 schema= → warn 默认同名模式风险 | DAMENG_SQL_GLOBS |
| fw_dameng_deep_paging | warn | LIMIT/OFFSET ≥ 10 万深分页 → warn 改游标 | DAMENG_SQL_GLOBS |

<!--
门禁 id 命名规范：fw_dameng_<rule>（rule 全小写下划线）。
本表 16 条 id 须在 assets/framework-gates/dameng.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_dameng_<rule>(fail|warn) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: dameng  requires_conf: DAMENG_SQL_GLOBS DAMENG_SCHEMA_GLOBS` 声明。
fixture 验证覆盖：violating 含引号小写标识符 + 保留字裸列 + ENGINE=InnoDB + ROWNUM> + GROUP_CONCAT +
BOOLEAN + IDENTITY 显式赋值 + com.mysql 驱动 → 8 个 fail 全触发（expected-fail-ids 已登记）；
compliant 修正后 exit 0。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| dameng × mybatis | Mapper XML 中 `${}` 拼接仍按 SQL 注入红线禁用（同 mybatis 规则集）；对象名不加引号依赖 KEYWORDS 屏蔽保留字 | 字符串拼接绕过参数化 → SQL 注入 CWE-89；屏蔽参数须写入 dm_svc.conf 或 URL |
| dameng × spring-boot | datasource 必须 driver-class-name=dm.jdbc.driver.DmDriver + jdbc:dm:// + schema= 显式；JPA 须 database-platform=org.hibernate.dialect.DmDialect | MySQL 驱动连 5236 报"不支持的数据库类型"；无 DmDialect 报 unable to determine dialect |
| dameng × spring-data-jpa | GenerationType.IDENTITY 主键策略须配 hibernate.id.new_generator_mappings=false | 新版生成器映射按序列解析 IDENTITY → 主键生成错乱（实证：无效的列名报错） |
| dameng × flyway/liquibase | 变更脚本不得含 MySQL 方言残留（ENGINE=/反引号/ON DUPLICATE KEY），DDL 须 DM 原生 | 与 fw_dameng_mysql_syntax 联动，防 CI 迁移脚本在 DM 实例执行失败 |
| dameng × seata | undo_log 表字段 CONTEXT 撞 DM 保留字，须双引号或 KEYWORDS 屏蔽（Seata 2.2.0 实证） | 异步清理 undo 日志 SQL 被 DM 语法校验拒绝 → 分布式事务残留 |

<!--
本表聚焦信创迁移高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| DM8 2023-05 后打包版 | 新增 AUTO_INCREMENT 兼容语法（默认等价 IDENTITY(1,1)） | fw_dameng_auto_increment 仅 warn；更早版本直接语法报错 |
| DM8 8.1.2.x ↔ 8.1.3.x 驱动 | 驱动小版本须与服务端打包版本匹配（实证 20240715 服务端需 8.1.3.149） | fw_dameng_driver_version 提示核对 |
| DM8 各季度版 | 持续新增保留字（2025 版新增 MODEL、DIMENSION） | 升级小版本后存量对象名可能突然撞保留字；fw_dameng_reserved_word 清单须随版本扩充 |
| DM8（LENGTH_IN_CHAR 参数） | 新版有废弃该参数动向（待验证：仅单源） | fw_dameng_varchar_length 规律按现行参数陈述，废弃后须重估 |
| DM7 | 无 AUTO_INCREMENT 语法；无 MySQL 兼容模式增强 | DM7 项目 AUTO_INCREMENT 直接 fail 级处理 |
| 达梦 8.6 | 版本号首位为行业类型标识而非新旧（8.a.b.c 中 b.c 才是版本信息，原厂确认） | 版本区间匹配不可按 8.6>8.1 臆断，须以打包号/编译日期为准 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的
版本号匹配本表，落在受影响区间的项目须额外提示。
-->
