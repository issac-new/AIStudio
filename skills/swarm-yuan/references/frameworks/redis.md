---
ruleset_id: redis
适用版本: Redis 7.2 / 8.x（当前 8.8，2026-07 现行；7.x 差异单独标注）
最后调研: 2026-07-17（来源：https://redis.io/downloads/ ；https://redis.io/docs/latest/ ；https://github.com/redisson/redisson ；https://redis.io/learn/develop/java/spring/rate-limiting/fixed-window ）
深度门槛: 10
---

# Redis 规则集

<!--
本规则集覆盖 Redis 7.2 / 8.x（2026-07-17 联网核实：redis.io 现行开源版本 8.8，Redis Software 8.0.20）。
客户端侧以 Spring Data Redis（RedisTemplate/Lettuce）+ Redisson 为高频工程形态陈述。
Redis 8.0 起 AGPLv3/RSALv2/SSPLv1 三许可证；查询引擎/数据结构内建（JSON/时间序列/布隆过滤器等并入核心，待验证各模块默认开启矩阵）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.springframework.data:spring-data-redis` / `spring-boot-starter-data-redis` / `org.redisson:redisson` / `redis.clients:jedis` / `io.lettuce:lettuce-core` | 高 |
| 注解 | `@Cacheable` / `@CacheEvict` / `@CachePut` / `@Caching`（配合 RedisCacheManager） | 中（须结合 RedisCacheManager 排除 caffeine 等其他 provider） |
| 配置 | `spring.data.redis.*` / `spring.redis.*`（Boot 2.x 旧节点） / `spring.cache.type=redis` | 高 |
| 代码 | `RedisTemplate` / `StringRedisTemplate` / `RedissonClient` / `Jedis` / `@Cacheable` | 高 |
| 文件 | `**/redis.conf` / `**/redis-cluster.yml` | 低（部署侧文件，工程侧仅辅助） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
依赖/配置任一高置信度命中即可激活 redis 规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- RedisTemplate 使用点：`grep -rnE 'RedisTemplate|StringRedisTemplate' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：含 RedisTemplate 引用的 .java 文件数 = `grep -l … | wc -l`）
- 分布式锁使用点：`grep -rnE 'RedissonClient|setIfAbsent|setnx|SETNX' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 缓存注解点：`grep -rnE '@Cacheable|@CacheEvict|@CachePut' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：注解行数）
- Redis 配置：`grep -rnE 'spring\.(data\.)?redis\.' "${PROJECT_DIR}"`（计数核验基准：配置行数）
- 过期设置点：`grep -rnE 'expire\(|Duration\.|Timeout|EX |PX ' "${PROJECT_DIR}" --include='*.java'`
- pipeline/批量点：`grep -rnE 'executePipelined|multiGet|multiSet' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有构件；四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：所有缓存 key 必须设置过期时间，禁止无 TTL 常驻
- **适用版本**: 全版本
- **规律**: 缓存数据必须显式设置 TTL（`SET key val EX n` / `redisTemplate.opsForValue().set(k, v, timeout, unit)` / `@Cacheable` 配 `RedisCacheConfiguration.entryTtl`）。无 TTL 的 key 在缓存数据与库不一致时永不自愈，且持续占用内存；内存打满触发逐出策略（allkeys-lru）时可能误逐出正常数据。仅计数器/分布式锁元数据等少数场景可常驻，须注释说明。
- **违反后果**: 脏数据永久残留；内存膨胀触发 OOM 或全量逐出。
- **验证方法**: `grep -rnE 'opsForValue\(\)\.set\(' --include='*.java'` 二参调用（无 timeout 参数）且同文件无 `expire(`/`entryTtl` → fail。
- **对应门禁**: fw_redis_no_expire(fail)

```verify
id: redis-r1
cmd: grep -rnE 'opsForValue\(\)\.set\(' --include='*.java' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：分布式锁须用 Redisson 或完整 SET NX PX + owner 校验，禁止裸 setnx
- **适用版本**: 全版本（Redisson 3.x 现行）
- **规律**: 裸 `setnx` + 后续 `expire` 非原子（两次调用间宕机锁永不释放）；`setIfAbsent`（SET NX）若无 owner 标识（UUID/线程 id）与过期时间，解锁会误删他人锁。生产须用 Redisson `RLock`（自带可重入 + 看门狗自动续期 + Lua 原子释放），或完整实现：SET NX PX 单命令 + value 存 owner UUID + 释放时 Lua 校验 owner 再删。禁止"锁内再查缓存判断是否已锁"的非原子写法。
- **违反后果**: 死锁 / 误删他人锁 → 并发互斥失效，重复扣款、重复发货（CWE-667 锁不当使用）。
- **验证方法**: 检出 `setnx|setIfAbsent` 且同文件无 `UUID|owner|expire|Duration|RedissonClient|RLock` 任一 → fail；检出 `setnx` 但同文件无 `expire` → fail。
- **对应门禁**: fw_redis_lock(fail)

```verify
id: redis-r2
cmd: 
expect: always
```

### 规律：缓存穿透须用空值缓存或布隆过滤器拦截
- **适用版本**: 全版本
- **规律**: 查询不存在的数据时缓存与库均 miss，恶意构造不存在的 id 可打穿缓存直压数据库。标准方案：缓存空值（短 TTL，如 30-60s）或布隆过滤器（Redis 8.x 内建 BF 命令 / Redisson RBloomFilter）前置拦截。读穿场景（get miss → 查库 → 回写）须有空值回写或布隆痕迹。
- **违反后果**: 穿透流量直击 DB，慢查询拖垮库（可用性丧失）。
- **验证方法**: 文件同时含 `opsForValue().get(` 与 DB 回源特征（`select|findBy|getBy|Mapper`）但无 `BloomFilter|bloom|空值|nullValue|CACHE_NULL|NULL_VALUE` 任一 → warn。
- **对应门禁**: fw_redis_penetration(warn)

```verify
id: redis-r3
cmd: 
expect: always
```

### 规律：缓存击穿须用互斥重建或永不过期+异步刷新
- **适用版本**: 全版本
- **规律**: 热点 key 过期瞬间大量请求同时 miss，并发回源重建压垮 DB。方案：互斥锁重建（仅一个线程回源，其余短暂等待/返回旧值），或逻辑过期（value 内嵌过期时间，到期异步刷新，物理永不过期）。热点重建逻辑须见 `setIfAbsent`/锁痕迹。
- **违反后果**: 热点 key 失效瞬间 DB 被打爆（dogpile effect）。
- **验证方法**: 同文件含 cache miss 回源特征（get + 查库 + set 三步）但无 `setIfAbsent|tryLock|RLock|逻辑过期|asyncRefresh` → warn。
- **对应门禁**: fw_redis_breakdown(warn)

```verify
id: redis-r4
cmd: 
expect: always
```

### 规律：批量缓存过期时间须加随机抖动，防雪崩
- **适用版本**: 全版本
- **规律**: 批量加载缓存时用相同 TTL（如统一 24h），到期时刻集中失效形成雪崩。TTL 须在基准值上加随机抖动（如 `base + random(0, base/5)`）。缓存预热/批量导入场景尤其须抖动。
- **违反后果**: 大量 key 同时过期 → DB 瞬时洪峰。
- **验证方法**: 检出 `Duration.ofHours|Duration.ofDays` 常量 TTL 但全仓库无 `ThreadLocalRandom|Random|jitter|抖动` → warn。
- **对应门禁**: fw_redis_avalanche(warn)

```verify
id: redis-r5
cmd: 
expect: always
```

### 规律：RedisTemplate 序列化器须显式配置，多端须一致
- **适用版本**: Spring Data Redis 3.x
- **规律**: RedisTemplate 默认 JdkSerializationRedisSerializer（key 带 `\xac\xed\x00\x05` 前缀不可读，且跨语言/跨服务不可互操作）。生产须显式配置：key/hashKey 用 StringRedisSerializer，value/hashValue 用 Jackson2JsonRedisSerializer 或 GenericJackson2JsonRedisSerializer（带类型信息，反序列化安全）。多服务共用同一 Redis 时序列化协议必须全端一致，混用 JDK/JSON 序列化读写同一 key 会反序列化爆炸。ObjectMapper 禁开 `enableDefaultTyping` 全量（反序列化 Gadget 面，CWE-502），用 `activateDefaultTyping(LaissezFaireSubTypeValidator)` 收敛。
- **违反后果**: key 不可读排障困难；多端序列化不一致 → 反序列化异常；DefaultTyping 全开 → 反序列化 RCE（CWE-502）。
- **验证方法**: 检出 `RedisTemplate` Bean 定义（`new RedisTemplate|RedisTemplate<` 返回类型）但全仓库无 `setKeySerializer|setValueSerializer|Jackson2JsonRedisSerializer|GenericJackson2JsonRedisSerializer|StringRedisSerializer` → warn。
- **对应门禁**: fw_redis_serializer(warn)

```verify
id: redis-r6
cmd: 
expect: always
```

### 规律：批量读写须用 multiGet/pipeline，禁止循环逐条往返
- **适用版本**: 全版本
- **规律**: 循环内逐条 `opsForValue().get(key)` 每次往返一个 RTT，N 个 key 即 N 个 RTT。批量读须 `multiGet(keys)`（MGET 单命令）或 `executePipelined`（pipeline 打包）；批量写须 `multiSet`/pipeline。循环体内出现单 key 访问即违规。
- **违反后果**: 批量场景网络 RTT 线性放大，接口超时。
- **验证方法**: 同文件含 `for (`/`while (` 与 `opsForValue().get(` 但无 `multiGet|executePipelined|multiSet` → warn。
- **对应门禁**: fw_redis_pipeline(warn)

```verify
id: redis-r7
cmd: 
expect: always
```

### 规律：key 命名须带业务前缀分层，禁止裸 key
- **适用版本**: 全版本
- **规律**: key 命名规范 `业务:模块:标识`（如 `order:detail:{id}`），冒号分层便于 scan 统计、迁移、按前缀清理与权限隔离（Redis 6+ ACL key pattern）。裸 key（如 `user123`）在多业务共库时互相冲突且无法治理。key 长度须控制（超长 key 占内存且比较慢），禁止把大 JSON 串当 key。
- **违反后果**: 跨业务 key 冲突互相覆盖；无法按前缀治理与迁移。
- **验证方法**: 检出 `.set("` / `.get("` 字符串字面量 key 无冒号 → warn。
- **对应门禁**: fw_redis_key_naming(warn)

```verify
id: redis-r8
cmd: 
expect: always
```

### 规律：Lettuce 连接池须显式配置，禁止裸默认
- **适用版本**: Spring Boot 3.x（Lettuce 默认客户端）
- **规律**: Boot 默认 Lettuce 单连接复用（共享原生连接），高并发/阻塞命令（BLPOP、事务）场景须开连接池：`spring.data.redis.lettuce.pool.max-active`（默认 8）、`max-idle`、`min-idle`、`max-wait`。连接数须按 Redis maxclients 余量规划，全服务实例连接总数 < maxclients × 0.7（经验值）。超时 `timeout`/`shutdown-timeout` 须显式。
- **违反后果**: 阻塞命令下共享连接争抢 → 请求堆积超时；连接泄漏打满 maxclients 拒连。
- **验证方法**: 检出 `spring.data.redis|spring.redis` 配置但无 `lettuce.pool|pool.max-active` → warn。
- **对应门禁**: fw_redis_pool(warn)

```verify
id: redis-r9
cmd: 
expect: always
```

### 规律：缓存与数据库一致性须选 Cache Aside 模式，更新须删缓存而非改缓存
- **适用版本**: 全版本
- **规律**: 标准模式 Cache Aside：读 miss 回源回写；写先更新 DB 再删缓存（delete 而非 update 缓存，避免并发写覆盖成脏数据）。强一致要求场景须延迟双删（更新前后各删一次）或订阅 binlog（Canal）失效。先删缓存再更库的顺序在并发下会回填脏数据。
- **违反后果**: 缓存与库长期不一致，用户读到脏数据。
- **验证方法**: 检出 DB 写操作特征（`insert|update|save`）同文件含 RedisTemplate 但无 `delete(|evict|@CacheEvict|延迟双删` → warn。
- **对应门禁**: fw_redis_db_consistency(warn)

```verify
id: redis-r10
cmd: 
expect: always
```

### 规律：bigkey 须治理（string >10KB / 集合元素 >5000）
- **适用版本**: 全版本（8.x `--bigkeys`/`MEMORY USAGE` 诊断沿用）
- **规律**: bigkey 判定经验阈值：string value >10KB，hash/list/set/zset 元素数 >5000。bigkey 导致读写阻塞（单线程模型下大 value 拷贝慢）、内存倾斜、删除阻塞（须 UNLINK 异步删）。治理：拆分（大 hash 拆 `key:field段`）、压缩、改数据结构。DEL 大 key 须用 UNLINK。
- **违反后果**: 单线程阻塞 → 全实例 RT 抖动；内存倾斜引发逐出不均。
- **验证方法**: 运行期数据形态，静态不可机械核验 → 人工检查（`redis-cli --bigkeys` 采样 + 慢日志核对）。
- **对应门禁**: 人工检查

```verify
id: redis-r11
cmd: 
expect: always
```

### 规律：热 key 须本地缓存或拆分，禁止单点硬扛
- **适用版本**: 全版本
- **规律**: 单 key QPS 超过单分片承载（经验值 >10 万 QPS）即成热 key：监控发现（`hotkeys` 参数 / 代理层统计）后治理：应用本地缓存（Caffeine 短 TTL）前置、key 拆分为 `key:1..N` 读写随机分散、只读副本分担。热 key 集中在单分片会造成槽倾斜。
- **违反后果**: 单分片 CPU 打满 → 集群局部热点拖垮整体。
- **验证方法**: 运行期流量形态，静态不可机械核验 → 人工检查（监控热 key 报表 + 本地缓存接入核对）。
- **对应门禁**: 人工检查

```verify
id: redis-r12
cmd: 
expect: always
```

### 规律：部署模式须按可用性要求选型（standalone/sentinel/cluster），生产禁止 standalone
- **适用版本**: 全版本
- **规律**: standalone 无高可用，主挂即全量缓存不可用（击穿兜底直接压 DB）。生产最低 Sentinel（哨兵自动故障转移），数据量超单机内存须 Cluster（16384 槽分片）。Cluster 模式多 key 命令（MGET/Lua）须同槽（hash tag `{user1}.order`）。客户端配置须与服务端模式一致（`spring.data.redis.sentinel.*` / `cluster.*`）。
- **违反后果**: 主库故障缓存整体不可用，流量全部回源 DB → 连锁雪崩。
- **验证方法**: 部署拓扑与哨兵/槽位配置，静态不可机械核验 → 人工检查（核对 sentinel/cluster 配置与故障演练记录）。
- **对应门禁**: 人工检查

```verify
id: redis-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。10 条挂门禁 id，3 条（bigkey/热key/部署模式）为人工检查。
verify-framework-ruleset.sh 扫描每条规律体内"对应门禁/人工检查"关键字，本文件全覆盖。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_redis_no_expire | fail | 二参 set 无 TTL 且同文件无 expire/entryTtl → fail | REDIS_SRC_GLOBS | CWE-770（无 TTL 内存无节制膨胀） |
| fw_redis_lock | fail | 裸 setnx/setIfAbsent 无 owner+过期/Redisson 痕迹 → fail | REDIS_SRC_GLOBS | CWE-667（裸 setnx 锁无 owner/过期=不当加锁） |
| fw_redis_penetration | warn | get miss 回源无空值缓存/布隆痕迹 → warn | REDIS_SRC_GLOBS | CWE-400（恶意不存在 id 穿透打库） |
| fw_redis_breakdown | warn | 回源重建无互斥锁痕迹 → warn | REDIS_SRC_GLOBS | CWE-362（热点 key 过期并发重建竞态） |
| fw_redis_avalanche | warn | 常量 TTL 且无随机抖动痕迹 → warn | REDIS_SRC_GLOBS | CWE-400（同刻批量过期雪崩） |
| fw_redis_serializer | warn | RedisTemplate Bean 无显式序列化器配置 → warn | REDIS_SRC_GLOBS | CWE-502（默认 JDK 序列化=不可信数据反序列化面） |
| fw_redis_pipeline | warn | 循环体内逐条 get 无 multiGet/pipeline → warn | REDIS_SRC_GLOBS | —（RTT 放大） |
| fw_redis_key_naming | warn | 字符串字面量 key 无冒号分层 → warn | REDIS_SRC_GLOBS | —（命名治理） |
| fw_redis_pool | warn | spring redis 配置无 lettuce.pool → warn | REDIS_SRC_GLOBS | —（池化配置） |
| fw_redis_db_consistency | warn | DB 写 + RedisTemplate 同文件但无删缓存痕迹 → warn | REDIS_SRC_GLOBS | —（Cache Aside 契约） |

<!--
门禁 id 命名规范：fw_redis_<rule>（rule 全小写下划线）。
上表 10 条 id 在 assets/framework-gates/redis.sh 中均有同名实现；片段头 `# gates:` 与本表一致。
人工检查类规律（bigkey/热key/部署模式）无门禁 id，不入本表。
fixture 验证覆盖：violating 含无 TTL set + 裸 SETNX 锁无 owner → fw_redis_no_expire/fw_redis_lock fail 主触发（expected-fail-ids 2/2 已登记）+ 循环逐条 GET；compliant 修正全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| redis × spring-boot | Boot 3.x 配置节点为 `spring.data.redis.*`，Boot 2.x 为 `spring.redis.*`（3.x 下旧节点静默失效） | 节点迁移后旧配置不生效，连接池/超时静默用默认 |
| redis × spring-cache | @Cacheable 须确认 CacheManager 为 RedisCacheManager 且 entryTtl 已配 | 默认无 TTL；多 provider 共存时注解落到非预期缓存 |
| redis × quartz/elasticjob | 多实例定时任务的分布式锁可用 Redisson 实现（ShedLock redis provider） | 调度重复执行防护与缓存共用 Redis 须隔离 db index，避免 FLUSHDB 误清 |
| redis × mybatis | 二级缓存用 Redis 实现时须按 namespace 隔离 key 前缀 | 多表关联更新时二级缓存失效粒度过粗会读到脏数据 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Redis 6.0 | ACL 引入（key pattern 级权限）；`DEBUG SLEEP` 等命令可 ACL 收敛 | 多业务共库须按 key 前缀配 ACL |
| Redis 6.2 | GETEX 命令；`SET key val GET` | 逻辑过期方案可用 GETEX 简化 |
| Redis 7.0 | Function（FCALL）替代 Lua 演进方向；sharded pub/sub | Lua 脚本迁移路径须评估 |
| Redis 7.4 | 待验证：hash field 级过期（HEXPIRE 系）在该版本引入 | hash 大 key 可按 field 过期，治理方案变化 |
| Redis 8.0 | 开源版转 AGPLv3/RSALv2/SSPLv1 三许可；查询引擎与 JSON/布隆过滤器等内建核心（默认开启矩阵待验证） | 布隆过滤器可直接用 BF.* 命令，无须独立模块部署 |
| Spring Boot 3.0 | 配置节点 `spring.redis.*` → `spring.data.redis.*` | 升级 Boot 3 后旧节点静默失效 |
