---
ruleset_id: xxl-job
适用版本: XXL-Job 3.x（当前 3.4.x，2026-07 现行；2.x 差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/xuxueli/xxl-job/releases ；https://www.xxl-job.com/doc/ ；https://github.com/xuxueli/xxl-job ）
深度门槛: 10
---

# XXL-Job 规则集

<!--
本规则集覆盖 XXL-Job 3.x（2026-07-17 联网核实现行版本 3.4.2，2026-06-19 发布）。
2.x → 3.x 差异：3.x 官方主推 Java/SpringBoot 执行器 + 调度中心集群；GLUE 模式仍支持
（Java/Shell/Python/PHP/NodeJS/PowerShell，3.4.2 起 PowerShell GLUE 升级为 PowerShell 7）。
无法确认的点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `com.xuxueli:xxl-job-core` | 高 |
| 注解 | `@XxlJob` | 高 |
| 配置 | `xxl.job.admin.addresses` / `xxl.job.executor.*` / `xxl.job.accessToken` | 高 |
| 代码 | `XxlJobHelper` / `XxlJobExecutor` / `IJobHandler` | 高 |
| 文件 | `**/xxl-job-executor*.yml` / `**/application*.properties` 中含 `xxl.job.` 节点 | 中（需排除仅样例文档） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
依赖/注解/配置任一高置信度命中即可激活 xxl-job 规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 任务处理器：`grep -rnE '@XxlJob\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：@XxlJob 注解行数 = `grep -rE '@XxlJob\b' … | wc -l`）
- 执行器配置：`grep -rnE 'xxl\.job\.executor\.' "${PROJECT_DIR}"`（计数核验基准：配置行数）
- 调度中心地址：`grep -rnE 'xxl\.job\.admin\.addresses' "${PROJECT_DIR}"`
- accessToken 配置：`grep -rnE 'xxl\.job\.(executor\.)?accessToken' "${PROJECT_DIR}"`
- 分片使用点：`grep -rnE 'XxlJobHelper\.getShard(Index|Total)' "${PROJECT_DIR}" --include='*.java'`
- 失败上报点：`grep -rnE 'XxlJobHelper\.handle(Fail|Success)' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有构件；四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：任务处理器须幂等，重复执行无副作用
- **适用版本**: 全版本（2.x / 3.x）
- **规律**: XXL-Job 失败重试、分片广播、故障转移、手动重触发都可能导致同一任务重复执行。任务处理器（@XxlJob 方法）含写操作（insert/update/save/扣减）时须保证幂等：业务唯一键去重、状态机校验、或乐观锁版本号。非幂等任务禁止开启失败重试。
- **违反后果**: 重复执行导致重复扣款 / 重复发货 / 数据翻倍。
- **验证方法**: `grep -rlE '@XxlJob\b' --include='*.java'` 命中文件含 `insert|update|save|delete` 写操作但无 `幂等|idempot|dedup|去重|XxlJobHelper.getShardIndex` 任一幂等痕迹 → warn。
- **对应门禁**: fw_xxljob_idempotent(warn)

```verify
id: xxl-job-r1
cmd: grep -rlE '@XxlJob\b' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：执行器 accessToken 须显式配置为强随机值，禁止空/默认值
- **适用版本**: 2.1+（accessToken 引入）/ 3.x
- **规律**: 执行器与调度中心通讯鉴权依赖 `xxl.job.executor.accessToken`（执行器侧）与 `xxl.job.accessToken`（调度中心侧）。官方默认值为 `default_token`，空值表示不校验。生产必须双侧配置一致的强随机 token；空/默认 token 下任何可访问执行器端口者都可触发任务执行、下发 GLUE 代码。
- **违反后果**: 未授权触发任务 / GLUE 远程代码执行（CWE-306 缺失认证、CWE-798 硬编码凭据）。
- **验证方法**: `grep -rnE 'xxl\.job\.(executor\.)?accessToken'` 值为空、`default_token`、`xxl-job` 等弱值 → fail；含 xxl-job-core 依赖但完全无 accessToken 配置 → warn。
- **对应门禁**: fw_xxljob_access_token(fail)

```verify
id: xxl-job-r2
cmd: grep -rnE 'xxl\.job\.(executor\.)?accessToken' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：路由策略须按场景选型，大数据量任务用分片广播
- **适用版本**: 全版本
- **规律**: 路由策略在调度中心控制台配置：FIRST（第一个，默认）/LAST/ROUND/CONSISTENT_HASH/分片广播（SHARDING_BROADCAST）/故障转移（FAILOVER）/忙碌转移（BUSYOVER）。批量数据处理任务须用分片广播（全部执行器各处理 1/N 数据）；高可用场景用故障转移；单机执行器下 ROUND/FIRST 无差别。大数据量任务用默认 FIRST 会造成单机热点。
- **违反后果**: 批量任务单机热点，处理超时；或多机重复处理同一批数据。
- **验证方法**: 任务方法含批量处理特征（`for|while|page|batch|List<`）但无 `XxlJobHelper.getShardIndex` 分片痕迹 → warn 提示评估分片广播。
- **对应门禁**: fw_xxljob_route_strategy(warn)

```verify
id: xxl-job-r3
cmd: 
expect: always
```

### 规律：分片广播须用 shardIndex % shardTotal 取模分发数据
- **适用版本**: 全版本
- **规律**: 分片广播下每个执行器通过 `XxlJobHelper.getShardIndex()`（从 0 开始）与 `getShardTotal()` 获取分片参数，数据分发须按 `id % shardTotal == shardIndex`（或等价的 hash 取模）过滤。仅取 shardIndex 而不取模会导致全部执行器处理全量数据。
- **违反后果**: N 个执行器重复处理全量数据 → 副作用放大 N 倍。
- **验证方法**: 检出 `getShardIndex` 但同方法内无 `%` 取模或 `getShardTotal` → warn。
- **对应门禁**: fw_xxljob_shard_consistency(warn)

```verify
id: xxl-job-r4
cmd: 
expect: always
```

### 规律：任务失败须显式上报，禁止吞异常
- **适用版本**: 全版本
- **规律**: 任务执行结果由返回值/异常决定：@XxlJob 方法内捕获异常后若不 `throw`、`XxlJobHelper.handleFail(...)` 或返回 `ReturnT.FAILED`（2.x 旧 API），调度中心会误判为成功，失败重试与告警失效。catch 块为空或仅打印日志即吞异常。
- **违反后果**: 失败被静默吞掉，调度中心显示成功，业务数据缺失无人发现。
- **验证方法**: @XxlJob 类内 `catch` 块体无 `throw|handleFail|FAILED` → warn。
- **对应门禁**: fw_xxljob_fail_retry(warn)

```verify
id: xxl-job-r5
cmd: 
expect: always
```

### 规律：GLUE 代码注入面须收敛，禁止执行外部输入拼装代码
- **适用版本**: 全版本（3.4.2 起 PowerShell GLUE 升级为 PowerShell 7）
- **规律**: GLUE 模式允许在调度中心在线编辑并下发代码到执行器动态编译执行，本身是设计功能，但工程侧若自建动态执行（`GroovyClassLoader.parseClass`、`ScriptEngine.eval`、`Runtime.exec` 拼接任务参数）把外部输入当代码执行，等价于开放 RCE 面。任务参数（XxlJobHelper.getJobParam）必须当数据校验，禁止拼入命令/脚本执行。
- **违反后果**: 远程代码执行 CWE-94 / 命令注入 CWE-78。
- **验证方法**: 检出 `GroovyClassLoader|ScriptEngine.*eval|Runtime\.getRuntime\(\)\.exec` 且附近存在 `getJobParam` → fail；仅存在动态执行 API → warn 人工确认输入可信。
- **对应门禁**: fw_xxljob_glue_injection(fail)

```verify
id: xxl-job-r6
cmd: 
expect: always
```

### 规律：任务超时与阻塞处理策略须按业务显式配置
- **适用版本**: 全版本
- **规律**: 任务超时时间（秒，0 为不限制）与阻塞处理策略（单机串行 SERIAL_EXECUTION / 丢弃后续调度 DISCARD_LATER / 覆盖之前调度 COVER_EARLY）均在调度中心控制台按任务配置。长耗时任务须设超时防线程堆积；周期短于执行耗时的任务禁止"覆盖之前调度"（会杀死执行中任务）。
- **违反后果**: 无超时 → 线程堆积拖垮执行器；覆盖策略误杀执行中任务 → 数据不一致。
- **验证方法**: 控制台配置不可机械核验 → 人工检查（核对长耗时任务已设超时、短周期任务阻塞策略为丢弃后续或单机串行）。
- **对应门禁**: 人工检查

```verify
id: xxl-job-r7
cmd: 
expect: always
```

### 规律：调度中心须集群部署，执行器 admin.addresses 配多地址
- **适用版本**: 全版本
- **规律**: 调度中心（xxl-job-admin）无状态可集群部署（共用同一 MySQL 库，通过数据库锁保证调度唯一性）。执行器 `xxl.job.admin.addresses` 支持逗号分隔多地址轮询注册/心跳，单地址在调度中心重启/漂移时执行器失联。
- **违反后果**: 调度中心单点故障 → 全量任务停调；执行器注册失败静默无任务。
- **验证方法**: `xxl.job.admin.addresses` 值不含逗号（单地址）→ warn 提示生产须多地址。
- **对应门禁**: fw_xxljob_schedule_ha(warn)

```verify
id: xxl-job-r8
cmd: 
expect: always
```

### 规律：执行器注册须 appname 唯一且显式配置
- **适用版本**: 全版本
- **规律**: 执行器自动注册以 `xxl.job.executor.appname` 为分组标识，同 appname 多实例自动聚合成执行器组。appname 缺失则自动注册不可用（退化为手动录入执行器地址）；不同业务共用同一 appname 会导致任务被路由到错误执行器。
- **违反后果**: 任务路由到无对应 handler 的执行器 → 调度失败；或注册不上静默无调度。
- **验证方法**: 含 xxl-job-core 依赖但配置无 `xxl.job.executor.appname` → warn。
- **对应门禁**: fw_xxljob_executor_registry(warn)

```verify
id: xxl-job-r9
cmd: 
expect: always
```

### 规律：任务日志须走 XxlJobHelper.log，禁止 System.out
- **适用版本**: 全版本
- **规律**: 调度中心"查看执行日志"读取执行器日志文件（`xxl.job.executor.logpath` 目录下按调度日志 id 存储），只有 `XxlJobHelper.log(...)` 输出的内容会进入该文件并被调度中心拉取。`System.out.println` 只进 stdout，调度中心看不到，排障断链。3.4.2 修复了 RollingLog 越权查看问题，日志文件权限仍须最小化。
- **违反后果**: 调度中心日志为空，线上任务排障只能靠登机器翻 stdout。
- **验证方法**: @XxlJob 类内检出 `System\.out\.print` → warn；logpath 未配 → warn（默认路径随容器易失）。
- **对应门禁**: fw_xxljob_log_collection(warn)

```verify
id: xxl-job-r10
cmd: 
expect: always
```

### 规律：任务依赖（父子任务）设计须防级联雪崩
- **适用版本**: 2.x / 3.x（子任务触发机制）
- **规律**: XXL-Job 支持父任务成功后触发子任务（子任务 ID 配置）。多级依赖链须限制深度（≤3 级，经验值）并评估级联失败影响；禁止环状依赖（A 触发 B、B 触发 A），调度中心不做环检测（待验证 3.x 是否新增环检测，按无防护处理）。
- **违反后果**: 环状依赖 → 任务无限循环触发；深层级联 → 上游抖动全链路放大。
- **验证方法**: 依赖关系存于调度中心数据库，不可机械核验 → 人工检查（梳理依赖图确认无环、深度 ≤3）。
- **对应门禁**: 人工检查

```verify
id: xxl-job-r11
cmd: 
expect: always
```

### 规律：xxl-job-core 版本须与调度中心主版本对齐
- **适用版本**: 全版本
- **规律**: 执行器 `xxl-job-core` 客户端与调度中心（xxl-job-admin）存在通讯协议约束，跨大版本（执行器 2.x 连调度中心 3.x）不保证兼容。生产须保持同一大版本，升级先升调度中心再滚动升执行器。
- **违反后果**: 心跳/回调协议不兼容 → 执行器注册失败或执行结果丢失。
- **验证方法**: 检出 `xxl-job-core` 版本号 < 3.x → warn 人工核对调度中心版本。
- **对应门禁**: fw_xxljob_version_align(warn)

```verify
id: xxl-job-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。10 条挂门禁 id，2 条（超时阻塞策略、任务依赖）为人工检查。
verify-framework-ruleset.sh 扫描每条规律体内"对应门禁/人工检查"关键字，本文件全覆盖。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_xxljob_idempotent | warn | @XxlJob 类含写操作但无幂等痕迹 → warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_access_token | fail | accessToken 为空/default_token/弱值 → fail；无配置 → warn | XXLJOB_SRC_GLOBS | CWE-306/CWE-798；GB/T 34944-2017 §6.2.6.3（口令硬编码） |
| fw_xxljob_route_strategy | warn | 批量特征任务无分片痕迹 → warn 评估分片广播 | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_shard_consistency | warn | 用 getShardIndex 但未取模/无 getShardTotal → warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_fail_retry | warn | catch 块吞异常（无 throw/handleFail/FAILED）→ warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_glue_injection | fail | 动态执行 API + getJobParam 同文件 → fail；仅动态执行 → warn | XXLJOB_SRC_GLOBS | CWE-94/CWE-78；GB/T 34944-2017 |
| fw_xxljob_schedule_ha | warn | admin.addresses 单地址 → warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_executor_registry | warn | 有 xxl-job 依赖但无 executor.appname → warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_log_collection | warn | 任务类用 System.out 或 logpath 未配 → warn | XXLJOB_SRC_GLOBS | — |
| fw_xxljob_version_align | warn | xxl-job-core 版本 < 3.x → warn 核对调度中心版本 | XXLJOB_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_xxljob_<rule>（ruleset_id xxl-job 连字符去后为 xxljob，与函数 _fw_xxl_job_check 对应）。
上表 10 条 id 在 assets/framework-gates/xxl-job.sh 中均有同名实现；片段头 `# gates:` 与本表一致。
人工检查类规律（超时阻塞策略、任务依赖）无门禁 id，不入本表。
fixture 验证覆盖：violating 含 accessToken 空值 → fw_xxljob_access_token fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| xxl-job × spring-boot | @XxlJob 处理器须为 Spring Bean（@Component）由容器管理 | 非 Bean 方法不会被 XxlJobSpringExecutor 扫描注册 |
| xxl-job × mybatis | 分片任务 Mapper 查询须按 shardIndex%shardTotal 过滤 | 否则分片广播下全表重复扫描 |
| xxl-job × spring-security | 执行器内嵌服务端口（默认 9999）须在 SecurityFilterChain 中由 accessToken 保护而非会话认证 | 执行器端点走 token 鉴权，误配会话拦截导致调度中心回调 401 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| XXL-Job 2.1 | 引入 accessToken 通讯鉴权 | 2.1 以下无鉴权机制，升级须双侧同步配置 token |
| XXL-Job 2.4 | 执行器默认端口 / GLUE 沙箱加固（具体点待验证） | 待验证：升级时核对 GLUE 黑名单变化 |
| XXL-Job 3.0 | 调度中心/执行器协议演进；官方主推新部署形态 | 执行器 core 须与调度中心同大版本 |
| XXL-Job 3.4.1 | 任务参数长度上限提至 2048；XSS 防护增强 | 超长参数任务在旧版本被截断 |
| XXL-Job 3.4.2 | PowerShell GLUE 升级为 PowerShell 7；RollingLog 越权查看修复 | 旧版 Windows GLUE 脚本语法差异；建议升级修日志越权 |
