---
ruleset_id: kettle
适用版本: Pentaho Data Integration（Kettle）CE 9.x（9.3.0.0-428 为 CE 终态下载版；PDI 11 已发布、以商业版为主导）/ Apache Hop 2.x 分叉（2026-06 最新 2.18.1，差异单独标注）
最后调研: 2026-07-17（来源：https://pentaho.com/pentaho-developer-edition/ ；https://hop.apache.org/ ；https://github.com/pentaho/pentaho-kettle ；https://help.pentaho.com/Documentation/11.0/Products/Carte ）
深度门槛: 10
---

# Kettle（Pentaho Data Integration）规则集

<!--
本规则集覆盖 Pentaho Data Integration（Kettle）CE 9.x（2026-07 时点官网 Developer Edition 仍提供 9.3.0.0-428 /
9.2.0.0-290 下载，为 CE 事实终态）与 PDI 11（2026-07 时点官网主推 pdi-ce-11.0.0.1-259.zip，Developer Edition
标注 Non-Production Use Only）。Apache Hop 为 Kettle 原班人马分叉，2026-06-18 发布 2.18.1，活跃维护。
调研时点：2026-07-17。PDI CE 9.x 官方 EOL 公告未联网检索到，EOL 状态标"待验证"；不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `pentaho-kettle:kettle-core` / `kettle-engine` / `pentaho:pdi` | 高 |
| 注解 | `@Step` / `@JobEntry`（Kettle 插件注解） | 中（仅插件开发项目出现） |
| 文件 | `**/*.kjb` / `**/*.ktr` / `kettle.properties` / `carte-config*.xml` / `slave-server-config*.xml` / `pwd/kettle.pwd` | 高 |
| 配置 | `<transformation>` / `<job>` 根元素 / `<connection>` 块 / `<transversion>` | 高 |
| 脚本调用 | `pan.sh` / `kitchen.sh` / `carte.sh` / `spoon.sh` 命令行调用 | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 kettle 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 转换定义（.ktr）：`find "${PROJECT_DIR}" -type f -name '*.ktr'`（计数核验基准：.ktr 文件数 = `find … | wc -l`）
- 作业定义（.kjb）：`find "${PROJECT_DIR}" -type f -name '*.kjb'`（计数核验基准：.kjb 文件数）
- 数据库连接定义：`grep -rn '<connection>' "${PROJECT_DIR}" --include='*.ktr' --include='*.kjb'`（计数核验基准：connection 块数）
- 转换步骤：`grep -rn '<step>' "${PROJECT_DIR}" --include='*.ktr'`（计数核验基准：step 块数）
- 作业 entry：`grep -rn '<entry>' "${PROJECT_DIR}" --include='*.kjb'`（计数核验基准：entry 块数）
- Carte 子服务器配置：`find "${PROJECT_DIR}" -type f \( -name 'carte-config*.xml' -o -name 'slave-server-config*.xml' -o -name 'kettle.pwd' \)`（计数核验基准：Carte 配置文件数）
- 执行脚本调用：`grep -rnE 'pan\.sh|kitchen\.sh|carte\.sh' "${PROJECT_DIR}" --include='*.sh'`（计数核验基准：调用行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：数据库连接密码禁止明文，须 Encr 加密或走 JNDI
- **适用版本**: PDI CE 9.x / PDI 11 / Apache Hop 2.x（Hop 变量语法差异另注）
- **规律**: .ktr/.kjb 中 `<connection>` 块的 `<password>` 明文保存口令，而 kjb/ktr 纳入 git 后即永久泄露。Kettle 内置混淆加密：密文以 `Encrypted ` 前缀存储（`Encr.bat/sh` 或 `encr.sh -kettle <password>` 生成，2be98afc86aa7f2e4bb18bd63c99dbdde 即空串密文）。更优解是连接改 JNDI（`<access>JNDI</access>`）或密码引用变量 `${DB_PASSWORD}` 外置到 kettle.properties / 环境变量。
- **违反后果**: 口令随 XML 入 git 永久泄露（CWE-312 / CWE-798），数据库被未授权访问。
- **验证方法**: `grep -rnE '<password>[^<]+</password>' --include='*.ktr' --include='*.kjb'` 值非 `Encrypted` 前缀且非 `${...}` 变量 → fail。
- **对应门禁**: fw_kettle_password_encr(fail)

```verify
id: kettle-r1
cmd: grep -rnE '<password>[^<]+</password>' --include='*.ktr' --include='*.kjb' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Carte 远程执行必须改默认口令，cluster/cluster 禁止上线
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: Carte 子服务器默认鉴权文件 `pwd/kettle.pwd` 内置 `cluster: cluster` 弱口令，carte-config.xml / slave-server-config.xml 中 `<username>cluster</username><password>cluster</password>` 为出厂默认。Carte 暴露 HTTP 远程执行接口（可下发任意转换/作业执行 = 远程命令执行），默认口令上线等价于 RCE 后门。必须改强口令 + 网络层限制（防火墙/反向代理鉴权）。
- **违反后果**: 未授权远程执行 ETL 作业 → 数据窃取 / 主机命令执行（CWE-1391 弱默认凭据）。
- **验证方法**: Carte 配置文件检出 `<username>cluster</username>` 与 `<password>cluster</password>` 同现，或 kettle.pwd 含 `cluster: cluster` → fail。
- **对应门禁**: fw_kettle_carte_default_auth(fail)

```verify
id: kettle-r2
cmd: 
expect: always
```

### 规律：kjb/ktr 必须纳入 git 版本管控，XML 可读性支持 diff review
- **适用版本**: 全版本
- **规律**: .kjb/.ktr 是纯 XML，可读可 diff，必须纳入 git 管控并走代码评审；Spoon 保存前关闭"另存为时清除步骤性能快照"之外的易变属性，减少无意义 diff。禁止仅以 Spoon 客户端本地文件或共享目录传递作业定义——无版本、无审计、无回滚。
- **违反后果**: 生产作业被悄悄改坏无法回溯；多人协作互相覆盖。
- **验证方法**: `git -C "${PROJECT_DIR}" ls-files '*.kjb' '*.ktr'` 计数为 0 而工作区存在 kjb/ktr → warn。
- **对应门禁**: fw_kettle_git_versioned(warn)

```verify
id: kettle-r3
cmd: 
expect: always
```

### 规律：阻塞型步骤（Blocking Step / Sort rows）须评估内存与行分发
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: `BlockingStep` 缓存全部输入行直至流干才放行，大表直接 OOM；`SortRows` 默认排序目录在临时盘、缓存行数（sort size，默认 100 万行在内存，待验证：9.x 默认值）超限写盘。行分发（copy/distribute）与步骤并行度（change number of copies）不当会造成下游饥饿或内存翻倍。大流转须改用数据库排序（ORDER BY）、流式步骤或调高 JVM 堆。
- **违反后果**: 转换中途 OOM 或磁盘爆量，ETL 窗口超时。
- **验证方法**: .ktr 检出 `<type>BlockingStep</type>` 或 `<type>SortRows</type>` → warn 人工确认数据量与内存配置。
- **对应门禁**: fw_kettle_blocking_step(warn)

```verify
id: kettle-r4
cmd: 
expect: always
```

### 规律：作业须配失败邮件/告警 entry，失败不得静默
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: .kjb 作业入口须含失败路径告警：`MAIL` entry（或 HTTP/脚本 entry 接企业告警）挂在失败 hop（红色 error hop）上；`SPECIAL` entry 的失败重跑策略须明确。仅有成功路径的作业在 kitchen.sh 调度下失败静默，数据未到账无人知晓。
- **违反后果**: ETL 失败静默数天 → 报表缺数 / 下游用脏数据决策。
- **验证方法**: .kjb 含 `<entries>` 但无 `<type>MAIL</type>` → warn。
- **对应门禁**: fw_kettle_failure_mail(warn)

```verify
id: kettle-r5
cmd: 
expect: always
```

### 规律：环境特有值（主机/路径/账号）禁止硬编码，须变量化并明确作用域
- **适用版本**: PDI CE 9.x / PDI 11 / Apache Hop 2.x
- **规律**: Kettle 变量作用域三层：`kettle.properties`（用户级）、命名参数（job/trans 级）、环境变量（JVM 级）。环境特有值（IP、绝对路径 `/home/etl/...`、`C:\...`、数据库账号）必须变量化 `${VAR}`，否则跨环境（dev/test/prod）部署即失效或误连生产。硬编码 IP 更是直接绑定单机房。
- **违反后果**: 测试作业误连生产库；换部署环境全部作业失效。
- **验证方法**: .ktr/.kjb 检出 `<server>` 值为 IP 字面量，或 `/home/|/opt/|C:\\` 绝对路径字面量 → warn。
- **对应门禁**: fw_kettle_variable_scope(warn)

```verify
id: kettle-r6
cmd: 
expect: always
```

### 规律：生产日志级别收敛 Basic，Rowlevel/Debug 仅限排障
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: .ktr/.kjb 中 `<loglevel>` 或 kitchen.sh `-level=` 取值 Error/Minimal/Basic/Detailed/Debug/Rowlevel。Rowlevel 打印每行数据（含敏感字段）且日志量爆炸，Debug/Detailed 也远超生产所需。生产固定 Basic（或 Minimal），排障临时调高级别后必须回收。
- **违反后果**: 敏感数据（身份证/手机号）落日志（CWE-532）；磁盘被日志打满。
- **验证方法**: 检出 `<loglevel>Detailed</loglevel>|<loglevel>Debug</loglevel>|<loglevel>Rowlevel</loglevel>` → warn。
- **对应门禁**: fw_kettle_log_level(warn)

```verify
id: kettle-r7
cmd: 
expect: always
```

### 规律：数据库连接须用连接池或 JNDI，禁用每行一连接
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: Kettle 连接默认无池化；高频转换每步一连接会打满数据库 max_connections。`<connection>` 应启用连接池（Spoon 连接配置 Connection Pooling 页签，落盘为 `<pooling>` 属性）或改 JNDI（`<access>JNDI</access>`）由容器托管。步骤"使用唯一连接"（unique connections）开多份物理连接时更须池化兜底。
- **违反后果**: 数据库连接数打满 → 全库雪崩；短连接风暴增加 RT。
- **验证方法**: .ktr 含 `<connection>` 但无 `<pooling>` 且 `<access>` 非 JNDI → warn。
- **对应门禁**: fw_kettle_connection_pool(warn)

```verify
id: kettle-r8
cmd: 
expect: always
```

### 规律：多表写入转换须明确事务边界（转换级 vs 作业级）
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: Kettle 事务粒度：转换级由 `<unique_connections>N</unique_connections>`（默认）共享单连接、整体提交/回滚；`unique_connections=Y` 每步独立连接 = 无统一事务。作业级无事务概念，跨转换一致性须用"阻塞数据直到步骤完成"+ 补偿设计。含 ≥2 个 TableOutput/Insert/Update 的转换若开 unique_connections=Y，部分提交即成脏数据。
- **违反后果**: 多表写入部分提交 → 数据不一致且无告警。
- **验证方法**: .ktr 检出 ≥2 个 `<type>TableOutput</type>` 且 `<unique_connections>Y</unique_connections>` → warn。
- **对应门禁**: fw_kettle_transaction(warn)

```verify
id: kettle-r9
cmd: 
expect: always
```

### 规律：PDI CE 9.x 已至终态，新项目须评估 Apache Hop 或 PDI 11
- **适用版本**: PDI CE 9.x
- **规律**: Pentaho 官方主推 PDI 11（2026-07 时点官网主推 11.0.0.1-259），CE 9.x（9.3.0.0-428）仍提供下载但为旧线（官方 EOL 公告未检索到，EOL 状态待验证）；Kettle 原班人马分叉 Apache Hop（2026-06 最新 2.18.1，活跃维护，元数据模型重构、支持 Beam/Spark/Flink 运行时）。存量 9.x 工程须评估：锁 9.x 维稳 / 升 PDI 11 / 迁 Hop（Hop 提供 kettle 导入工具，但插件与脚本步骤需人工复核，差异待验证）。
- **违反后果**: 停留在无维护版本 → 安全补丁断供 / 新驱动不兼容。
- **验证方法**: .ktr/.kjb 检出 `<transversion>9.` 或 `<transversion>8.` → warn 记录迁移评估结论。
- **对应门禁**: fw_kettle_hop_migration(warn)

```verify
id: kettle-r10
cmd: 
expect: always
```

### 规律：写入步骤须定义错误处理策略（跳过错误行 vs 中止）
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: TableOutput/Insert/Update 等写入步骤默认遇错即中止转换（跳过的行数无记录）。须显式配错误处理：步骤右键"定义错误处理"（落盘 `<error_handling>` 块）把错误行路由到错误表/文件并记录原因码，或明确接受"中止"语义并配作业级告警。静默"忽略错误"勾选项（`<skip_errors>` 类属性）禁用于生产。
- **违反后果**: 整批中止 → ETL 窗口超时；或错误行静默丢弃 → 数据缺失无感知。
- **验证方法**: .ktr 检出 `<type>TableOutput</type>` 但无 `<error_handling>` → warn。
- **对应门禁**: fw_kettle_error_handling(warn)

```verify
id: kettle-r11
cmd: 
expect: always
```

### 规律：Carte 集群/远程执行配置须外置且最小权限
- **适用版本**: PDI CE 9.x / PDI 11
- **规律**: carte-config.xml / slave-server-config.xml 属于部署环境配置，口令必须变量化（`${CARTE_PASSWORD}` 或 Encr 密文），`<masters>`/`<slaveserver>` 主机名不得硬编码 IP；Carte 服务账号最小权限（仅 ETL 所需库表），OS 层以低权限用户运行 carte.sh。配置文件与 kjb/ktr 同入 git 时，密文与明文口令的检查同 fw_kettle_password_encr。
- **违反后果**: Carte 配置随仓库泄露 → 集群拓扑与凭据全暴露；root 跑 carte → RCE 影响扩大。
- **验证方法**: Carte 配置文件检出明文 `<password>` 值非 `Encrypted`/`${` 前缀 → fail（并入 fw_kettle_carte_default_auth 的 fail 语义，默认口令优先按默认口令报）。
- **对应门禁**: fw_kettle_carte_default_auth(fail)

```verify
id: kettle-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_kettle_password_encr | fail | kjb/ktr 中 `<password>` 值非 Encrypted 前缀且非 ${ 变量 → fail 明文口令 | KETTLE_JOB_GLOBS | CWE-312；CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_kettle_carte_default_auth | fail | Carte 配置 cluster/cluster 默认口令或明文 slaveserver 口令 → fail | KETTLE_JOB_GLOBS | CWE-1391；GB/T 22239-2019 7.1.4.2 口径（默认账户/默认口令） |
| fw_kettle_git_versioned | warn | 工作区有 kjb/ktr 但 git ls-files 无跟踪 → warn | KETTLE_JOB_GLOBS | — |
| fw_kettle_blocking_step | warn | ktr 检出 BlockingStep/SortRows → warn 内存评估 | KETTLE_JOB_GLOBS | — |
| fw_kettle_failure_mail | warn | kjb 含 entries 但无 MAIL entry → warn 失败静默 | KETTLE_JOB_GLOBS | — |
| fw_kettle_variable_scope | warn | ktr/kjb 检出 server IP 字面量或 /home/ /opt/ C:\ 路径字面量 → warn | KETTLE_JOB_GLOBS | — |
| fw_kettle_log_level | warn | loglevel 为 Detailed/Debug/Rowlevel → warn | KETTLE_JOB_GLOBS | CWE-532；GB/T 38674-2020 §5.4 |
| fw_kettle_connection_pool | warn | ktr 有 connection 但无 pooling 且 access 非 JNDI → warn | KETTLE_JOB_GLOBS | — |
| fw_kettle_transaction | warn | ≥2 个 TableOutput 且 unique_connections=Y → warn 事务边界 | KETTLE_JOB_GLOBS | — |
| fw_kettle_hop_migration | warn | transversion 9.x/8.x → warn 评估 Hop/PDI 11 迁移 | KETTLE_JOB_GLOBS | — |
| fw_kettle_error_handling | warn | TableOutput 无 error_handling 块 → warn | KETTLE_JOB_GLOBS | — |

<!--
门禁 id 命名规范：fw_kettle_<rule>（rule 全小写下划线）。
本表 11 条 id（12 条规律中"Carte 配置外置"与"默认口令"共挂 fw_kettle_carte_default_auth）
须在 assets/framework-gates/kettle.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_kettle_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: kettle  requires_conf: KETTLE_JOB_GLOBS` 声明。
fixture 验证覆盖：violating 含 .ktr 明文数据库密码 + carte-config.xml 默认 cluster/cluster 口令
→ password_encr / carte_default_auth 双 fail 主触发；compliant 用 Encrypted 密文 + 改口令 → 全 pass。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| kettle × mybatis | ETL 写入目标库若同时被 Java 服务 MyBatis 读写，双方须共用同一套字符集与时区连接参数 | 否则批量导入后应用读出乱码/时间偏移 |
| kettle × spring-batch | 同库批处理不要混用 Kettle 与 Spring Batch 写同表，锁与事务边界语义不同 | 混合写入死锁与重复行难排查 |
| kettle × xxl-job | kitchen.sh 由 xxl-job 调度时须捕获退出码并转发告警，不得仅看调度成功 | kitchen 进程级失败 xxl-job 默认只认退出码 |
| kettle × netty | Carte 远程执行走 HTTP，不经自定义 Netty 层；自研 Netty 数据通道才需同时遵守两套规律 | 无默认强交互 |

<!--
无强交互的框架组合省略；本表聚焦 kettle 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| PDI CE 8.x | 旧 UI/仓库格式；9.x 打开 8.x ktr 基本兼容但反向不可 | 混版本团队须统一 Spoon 版本 |
| PDI CE 9.x（9.3.0.0-428） | CE 事实终态下载版；EOL 公告未检索到（待验证） | 安全补丁断供风险，触发 fw_kettle_hop_migration 评估 |
| PDI 11（11.0.0.1-259） | 2026-07 官网主推；Developer Edition 标注 Non-Production Use Only | 生产用须商业授权；CE 定位变化须法务确认 |
| Apache Hop 2.x（2.18.1） | Kettle 分叉：元数据驱动、工作流/流水线概念重命名、变量语法差异 | kettle 导入工具转换后插件/脚本步骤须人工复核（差异待验证） |
| Carte 9.x | 默认 pwd/kettle.pwd 内置 cluster: cluster | 出厂弱口令，fw_kettle_carte_default_auth 主查 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
