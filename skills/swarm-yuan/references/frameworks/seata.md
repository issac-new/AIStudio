---
ruleset_id: seata
适用版本: Apache Seata 2.x（现行线，官方文档默认版本 2.6，GA 时点待验证；1.x 差异单独标注）
最后调研: 2026-07-17（来源：https://seata.apache.org/blog/ ；https://seata.apache.org/docs/ ）
深度门槛: 10
---

# Seata 规则集

<!--
本规则集覆盖 Apache Seata 2.x（2026-07 时点官方站点文档默认版本 v2.6，2.x 为现行主版本线；2.6 GA 具体日期未联网核实，标待验证）。
调研时点：2026-07-17。AT/TCC/Saga/XA 四模式语义按 2.x 文档陈述；1.x 配置键差异见 §6。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `io.seata:seata-spring-boot-starter` / `org.apache.seata:seata-spring-boot-starter` / `seata-all` / `seata-saga` | 高 |
| 注解 | `@GlobalTransactional` / `@GlobalLock` / `@TwoPhaseBusinessAction` / `@LocalTCC` | 高 |
| 文件 | `**/undo_log.sql` / `**/seata.conf` / `**/registry.conf` / `**/file.conf` / `**/*statemachine*.json` | 中（需排除他用） |
| 配置 | `seata.tx-service-group` / `seata.service.vgroup-mapping` / `seata.application-id` / `seata.data-source-proxy-mode` / `seata.registry.*` | 高 |
| 代码 | `RootContext.getXID` / `RootContext.bind` / `DataSourceProxy` / `GlobalTransactionScanner` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 seata 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 全局事务入口：`grep -rlE '@GlobalTransactional\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 @GlobalTransactional 的 .java 文件数）
- TCC 参与者：`grep -rlE '@TwoPhaseBusinessAction\b|@LocalTCC\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：TCC 文件数）
- @GlobalLock 使用点：`grep -rnE '@GlobalLock\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@GlobalLock 行数）
- XID 手工绑定点：`grep -rnE 'RootContext\.(bind|getXID)' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：RootContext 操作行数）
- undo_log 建表脚本：`find "${PROJECT_DIR}" -name '*undo_log*' -o -name '*.sql' | xargs grep -lE 'undo_log' 2>/dev/null`（计数核验基准：含 undo_log 的 SQL 文件数）
- Saga 状态机定义：`grep -rlE '"CompensateState"|"ServiceTask".*"StateName"' "${PROJECT_DIR}" --include='*.json'`（计数核验基准：状态机 json 数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：@GlobalTransactional 禁止与本地事务 @Transactional 同边界混用
- **适用版本**: Seata 2.x / 1.x
- **规律**: 全局事务方法上叠加 Spring 本地 `@Transactional`，本地事务在全局事务提交前先提交，全局回滚时本地已提交的数据无法回滚（AT undo_log 只在代理连接提交前生成）。@GlobalTransactional 方法本身开启事务语义，不得再标 @Transactional；须拆边界：全局事务方法调用独立的本地事务方法。
- **违反后果**: 全局回滚覆盖不了本地已提交数据 → 分布式数据不一致。
- **验证方法**: 同一 .java 文件同时检出 `@GlobalTransactional` 与 `@Transactional` → fail（人工确认是否同方法/同类混用）。
- **对应门禁**: fw_seata_local_tx_mixed(fail)

```verify
id: seata-r1
cmd: 
expect: always
```

### 规律：TCC 须开启 TCC Fence 防空回滚/幂等/悬挂
- **适用版本**: Seata 2.x（1.4+ 引入 useTCCFence）
- **规律**: TCC 三大坑：空回滚（try 未执行 cancel 先执行，须判空回滚）、幂等（网络重试导致 cancel/commit 重复）、悬挂（cancel 先于 try 到达，try 随后执行造成资源悬挂）。Seata `useTCCFence=true`（@TwoPhaseBusinessAction）用 tcc_fence_log 表统一解决三问题，生产必须开启；关闭时须自行在业务代码实现三道防线。
- **违反后果**: 无 fence → 空回滚报错 / 重复扣减 / 资源悬挂。
- **验证方法**: 检出 `@TwoPhaseBusinessAction` 行未含 `useTCCFence[[:space:]]*=[[:space:]]*true` → fail。
- **对应门禁**: fw_seata_tcc_fence(fail)

```verify
id: seata-r2
cmd: 
expect: always
```

### 规律：TCC commit/cancel 方法名须显式声明并与签名一致
- **适用版本**: Seata 2.x / 1.x
- **规律**: `@TwoPhaseBusinessAction` 默认 `commitMethod="commit"`、`rollbackMethod="rollback"`。不显式声明时方法名漂移（重构改名）导致二阶段调用 NoSuchMethodError 静默失败。须显式 `commitMethod`/`rollbackMethod` 并保证方法签名与 BusinessActionContext 参数一致。
- **违反后果**: 方法名漂移 → 二阶段调用失败，一阶段资源悬挂。
- **验证方法**: 检出 `@TwoPhaseBusinessAction` 未含 `commitMethod`/`rollbackMethod` 显式声明 → warn。
- **对应门禁**: fw_seata_tcc_method_explicit(warn)

```verify
id: seata-r3
cmd: 
expect: always
```

### 规律：AT 模式每个分支库必须建 undo_log 表
- **适用版本**: Seata 2.x / 1.x
- **规律**: AT 模式回滚依赖 undo_log（before image/after image）。每个接入全局事务的数据库都必须建 undo_log 表（表结构随版本有差异，2.x 字段以官方 script 为准）。漏建则分支提交时插入 undo_log 失败，全局事务直接异常。
- **违反后果**: 分支提交报错 / 回滚无依据 → 数据不一致。
- **验证方法**: 检出 @GlobalTransactional 或 seata AT 配置，但工程中无 `undo_log` 建表 SQL → warn。
- **对应门禁**: fw_seata_undo_log(warn)

```verify
id: seata-r4
cmd: 
expect: always
```

### 规律：@GlobalTransactional 须显式 timeoutMills，全局事务超时与锁持有联动
- **适用版本**: Seata 2.x / 1.x
- **规律**: 全局事务超时（`timeoutMills`，默认 60s，待验证 2.x 是否调整默认值）到期后 TC 回滚全局事务并释放全局锁。不显式配置时，长事务占锁阻塞其他事务；过短则正常业务被回滚。`rollbackOnly`/`noRollbackFor` 须按业务显式声明。
- **违反后果**: 超时不当 → 锁阻塞雪崩或业务被误回滚。
- **验证方法**: 检出 `@GlobalTransactional` 未含 `timeoutMills` → warn。
- **对应门禁**: fw_seata_global_timeout(warn)

```verify
id: seata-r5
cmd: 
expect: always
```

### 规律：AT 全局锁防脏写，全局事务外写操作须 @GlobalLock
- **适用版本**: Seata 2.x / 1.x
- **规律**: AT 模式全局锁只拦截全局事务内的写。全局事务外的写（无 @GlobalTransactional）可绕过全局锁直接改同一行，造成脏写（全局回滚后覆盖外部新值）。事务外写须 `@GlobalLock` + `SELECT ... FOR UPDATE` 触发全局锁查询。
- **违反后果**: 事务外写绕过全局锁 → 脏写，回滚数据覆盖新值。
- **验证方法**: 检出含 `UPDATE|DELETE` SQL（@Update/@Delete 或字符串）的类既无 @GlobalTransactional 也无 @GlobalLock，而工程存在全局事务 → warn。
- **对应门禁**: fw_seata_dirty_write(warn)

```verify
id: seata-r6
cmd: 
expect: always
```

### 规律：@GlobalLock 须配 FOR UPDATE 查询，否则不触发全局锁检查
- **适用版本**: Seata 2.x / 1.x
- **规律**: `@GlobalLock` 本身不抢锁，须方法内执行 `SELECT ... FOR UPDATE`（代理数据源改写为全局锁查询）才生效。只标注解不做 FOR UPDATE 查询 = 无防护。
- **违反后果**: 误以为有锁保护 → 脏写/脏读。
- **验证方法**: 检出 `@GlobalLock` 但同文件无 `for update|FOR UPDATE` → warn。
- **对应门禁**: fw_seata_global_lock(warn)

```verify
id: seata-r7
cmd: 
expect: always
```

### 规律：跨服务调用须确认 XID 透传，分支事务才注册
- **适用版本**: Seata 2.x / 1.x
- **规律**: 分支事务注册依赖 XID 经 RPC 上下文透传（Feign/Dubbo 集成模块自动透传；裸 RestTemplate/自研 RPC 须手工 `RootContext.getXID()` 绑定到请求头）。XID 断链时下游操作不注册分支，不受全局锁保护，回滚不覆盖。
- **违反后果**: 分支不注册 → 全局回滚漏数据。
- **验证方法**: @GlobalTransactional 方法所在工程检出 `RestTemplate|WebClient|FeignClient|DubboReference` 远程调用且无 seata 对应集成依赖/手工 RootContext 绑定 → warn 人工确认。
- **对应门禁**: fw_seata_branch_register(warn)

```verify
id: seata-r8
cmd: 
expect: always
```

### 规律：Saga 状态机每个正向节点须配补偿节点
- **适用版本**: Seata 2.x / 1.x（seata-saga）
- **规律**: Saga 模式长事务靠状态机编排，每个 ServiceTask 正向节点须 `CompensateState` 补偿节点（`Catch`/`CompensateTrigger`），漏配则该步失败后整个流程无法回退。补偿逻辑须幂等。
- **违反后果**: 部分步骤失败无补偿 → 长事务半成品状态。
- **验证方法**: 检出 Saga 状态机 json 无 `Compensate|compensate` → warn。
- **对应门禁**: fw_seata_saga_compensation(warn)

```verify
id: seata-r9
cmd: 
expect: always
```

### 规律：XA 模式须全部数据源代理，混合代理破坏隔离
- **适用版本**: Seata 2.x / 1.x
- **规律**: XA 模式 `seata.data-source-proxy-mode=XA`（或 DataSourceProxyXA 手工代理）依赖数据库 XA 协议持锁至二阶段。同一工程部分数据源走 AT、部分走 XA、部分不代理，未代理的写绕过全局锁。模式选定后须全量数据源统一代理。
- **违反后果**: 未代理数据源绕过全局锁 → 脏写 / 回滚遗漏。
- **验证方法**: 检出 `data-source-proxy-mode[[:space:]]*[:=][[:space:]]*XA` 或 `DataSourceProxyXA` → warn 人工确认全量代理。
- **对应门禁**: fw_seata_xa_proxy(warn)

```verify
id: seata-r10
cmd: 
expect: always
```

### 规律：AT 模式须显式开启数据源自动代理
- **适用版本**: Seata 2.x / 1.x（spring-boot-starter）
- **规律**: AT 模式须代理 DataSource 才能拦截 SQL 生成 undo_log 与全局锁查询。starter 默认 `@EnableAutoDataSourceProxy`（`seata.enable-auto-data-source-proxy=true` 默认 true，待验证 2.x 默认值）。显式关闭（false）或手工配置数据源 Bean 绕过 starter 时，AT 静默失效。
- **违反后果**: 数据源未代理 → AT 完全不生效且无报错。
- **验证方法**: 检出 @GlobalTransactional 但配置 `enable-auto-data-source-proxy[[:space:]]*[:=][[:space:]]*false` 或检出 `DataSourceProxy` 手工包装 → warn/fail 提示。
- **对应门禁**: fw_seata_at_datasource_proxy(warn)

```verify
id: seata-r11
cmd: 
expect: always
```

### 规律：tx-service-group 与 vgroup-mapping 须与 TC 集群一致
- **适用版本**: Seata 2.x / 1.x
- **规律**: 客户端 `seata.tx-service-group` 经 `seata.service.vgroup-mapping.<group>=<cluster>` 映射到 TC 集群。group 与 mapping 缺失/不一致时 TM/RM 注册失败（常见报错 no available service）。`seata.application-id` 须唯一标识应用。多环境配置须按环境区分。
- **违反后果**: TM/RM 注册失败 → 全局事务无法开启，启动或首调用报错。
- **验证方法**: 检出 seata 依赖/@GlobalTransactional 但配置无 `tx-service-group` 或无 `vgroup-mapping` → warn。
- **对应门禁**: fw_seata_tm_rm_register(warn)

```verify
id: seata-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_seata_local_tx_mixed | fail | 同文件检出 @GlobalTransactional + @Transactional → fail (n/a) | SEATA_SRC_GLOBS |
| fw_seata_tcc_fence | fail | @TwoPhaseBusinessAction 无 useTCCFence=true → fail (n/a) | SEATA_SRC_GLOBS |
| fw_seata_tcc_method_explicit | warn | @TwoPhaseBusinessAction 无显式 commitMethod/rollbackMethod → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_undo_log | warn | 有全局事务但工程无 undo_log SQL → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_global_timeout | warn | @GlobalTransactional 无 timeoutMills → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_dirty_write | warn | 事务外 UPDATE/DELETE 类无 @GlobalLock（工程存在全局事务）→ warn (CWE-362) | SEATA_SRC_GLOBS |
| fw_seata_global_lock | warn | @GlobalLock 无 FOR UPDATE 查询 → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_branch_register | warn | 全局事务工程检出裸远程调用无 XID 绑定迹象 → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_saga_compensation | warn | Saga 状态机 json 无 Compensate → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_xa_proxy | warn | 检出 XA 代理配置 → warn 人工确认全量代理 (n/a) | SEATA_SRC_GLOBS |
| fw_seata_at_datasource_proxy | warn | enable-auto-data-source-proxy=false 或手工 DataSourceProxy → warn (n/a) | SEATA_SRC_GLOBS |
| fw_seata_tm_rm_register | warn | 有 seata 使用但无 tx-service-group/vgroup-mapping → warn (n/a) | SEATA_SRC_GLOBS |

<!--
门禁 id 命名规范：fw_seata_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/seata.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_seata_<rule>(fail|warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: seata  requires_conf: SEATA_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 @GlobalTransactional 与 @Transactional 混用（local_tx_mixed fail 主触发）+ TCC 无 useTCCFence（tcc_fence fail 次触发）；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| seata × spring-cloud | 全局事务跨 Feign 调用须确认 XID 经请求头透传（seata 集成模块自动，裸 RestTemplate 须手工） | XID 断链导致分支不注册 |
| seata × dubbo | Dubbo 调用 XID 经 attachment 透传（集成模块自动；自研过滤器须 RootContext.bind） | 同上 |
| seata × mybatis | AT 模式代理数据源须位于 MyBatis SqlSessionFactory 上游 | 否则 SQL 不经代理，undo_log 不生成 |
| seata × spring-boot | 多数据源须逐个代理，主从/读写分离场景确认写库被代理 | 未代理数据源绕过全局锁 |

<!--
本表聚焦 seata 生态内高频组合；无强交互的组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Seata 1.4 | 引入 useTCCFence（TCC Fence 防三坑） | 1.4 之前须业务自实现空回滚/幂等/悬挂防护 |
| Seata 1.5 | 配置键统一 seata.* 前缀（spring-boot-starter） | 旧 spring.cloud.alibaba.seata.* 键失效 |
| Seata 2.0 | 包名/org 迁移 apache（io.seata → org.apache.seata 渐进） | 依赖坐标随版本核对，混用坐标导致类冲突 |
| Seata 2.x | 文档默认版本 2.6（GA 时点待验证）；undo_log 表结构以官方 script 为准 | 待验证：2.x 各 minor undo_log 字段差异，建表脚本按所用版本取 |
| Seata 全版本 | @GlobalTransactional 默认 timeoutMills=60000（待验证 2.x 是否调整） | 长事务须显式 timeoutMills |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
