---
ruleset_id: elasticsearch
适用版本: Elasticsearch 9.x（当前 9.4.x，2026-07 现行；8.x 差异单独标注；7.x 仅作陷阱提示）
最后调研: 2026-07-17（来源：https://www.elastic.co/docs/release-notes/elasticsearch ；https://www.elastic.co/docs/reference/elasticsearch/clients/java/ ；https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html ）
深度门槛: 10
---

# Elasticsearch 规则集

<!--
本规则集覆盖 Elasticsearch 9.x（2026-07-17 联网核实现行版本 9.4.3）与官方 Java API Client
（co.elastic.clients:elasticsearch-java，8.x 起取代已废弃的 RestHighLevelClient）。
8 → 9 关键差异：mapping type 早已于 7.x 移除，9.x 全面移除残留 type API；kNN/dense_vector 默认开启；
部分 7.x 客户端 API 在 9 服务端彻底不可用（具体清单待验证，按"不兼容"陈述并标待验证）。
无法确认的点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `co.elastic.clients:elasticsearch-java` / `org.elasticsearch.client:elasticsearch-rest-high-level-client` / `org.springframework.data:spring-data-elasticsearch` | 高 |
| 配置 | `spring.elasticsearch.*` / `elasticsearch.hosts` / `index.max_result_window` / `index.refresh_interval` | 高 |
| 代码 | `ElasticsearchClient` / `RestClient` / `RestHighLevelClient` / `SearchRequest` / `BulkRequest` / `@Document` | 高 |
| 注解 | `@Document` / `@Field`（spring-data-elasticsearch） | 中（需排除其他同名注解） |
| 文件 | `**/elasticsearch*.yml` / `**/*mapping*.json` 中含 `"mappings"` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
依赖/代码任一高置信度命中即可激活 elasticsearch 规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 搜索调用点：`grep -rnE '\.search\(|SearchRequest|SearchResponse' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 批量写入点：`grep -rnE 'BulkRequest|\.bulk\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 深分页点：`grep -rnE '\.from\(|"from"[[:space:]]*:' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：命中行数）
- 聚合构建点：`grep -rnE 'AggregationBuilders|\.aggregations\(' "${PROJECT_DIR}" --include='*.java'`
- scroll 使用点：`grep -rnE 'SearchScrollRequest|\.scroll\(' "${PROJECT_DIR}" --include='*.java'`
- 客户端构建点：`grep -rnE 'RestClient\.builder|ElasticsearchClient\(' "${PROJECT_DIR}" --include='*.java'`

<!--
枚举该框架特有构件；四要素核验"构件枚举计数≥实际×0.95"依此判定。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：深分页必须用 search_after，禁止 from+size 超过 max_result_window
- **适用版本**: 全版本（7/8/9）
- **规律**: 默认 `index.max_result_window=10000`，`from+size` 超过该值直接报错；即使调大窗口，深分页每页都要在协调节点堆内排序 from+size 条，内存开销线性增长。超过 1 万条的翻页/导数必须改用 `search_after`（实时翻页，配合 PIT）或 `scroll`（批量导出场景，9.x 已不推荐用于实时翻页）。
- **违反后果**: 深分页请求拖垮协调节点堆内存 → GC 频繁 / 节点 OOM；超窗直接 400 报错。
- **验证方法**: `grep -rnE '\.from\([0-9]{5,}|"from"[[:space:]]*:[[:space:]]*[0-9]{5,}'` 命中（from≥10000）→ fail；from≥1000 → warn 提示 search_after。
- **对应门禁**: fw_es_deep_pagination(fail)

```verify
id: elasticsearch-r1
cmd: grep -rnE '\.from\([0-9]{5,}|"from"[[:space:]]*:[[:space:]]*[0-9]{5,}' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：wildcard 查询禁止前缀通配（* 开头）
- **适用版本**: 全版本
- **规律**: `wildcard` 查询以 `*` 或 `?` 开头时无法利用倒排索引，退化为全字段逐个 term 匹配（近似全表扫描）。必须前缀模糊时用 ngram/edge_ngram 索引或 `match_phrase_prefix`/`search_as_you_type` 替代。`query_string` 查询同理禁止 `*abc` 写法（`allow_leading_wildcard` 默认 true，9.x 是否调整待验证）。
- **违反后果**: 单查询扫全索引，CPU 打满，集群级联抖动。
- **验证方法**: `grep -rnE 'wildcardQuery\([^)]*"\*|"wildcard"[^}]*"value"[^}]*"\*|queryStringQuery\("[^"]*\*'` 命中 → fail。
- **对应门禁**: fw_es_wildcard_prefix(fail)

```verify
id: elasticsearch-r2
cmd: grep -rnE 'wildcardQuery\([^)]*"\*|"wildcard"[^}]*"value"[^}]*"\*|queryStringQuery\("[^"]*\*' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：批量写入须权衡 refresh_interval，导入期可临时置 -1
- **适用版本**: 全版本
- **规律**: 默认 `refresh_interval=1s`，每秒生成 segment 并refresh，高吞吐写入下 refresh 开销显著。批量导入（reindex/离线灌数）期间设 `index.refresh_interval=-1` 关闭 refresh，导入完成后恢复并 `_forcemerge`；在线写入按延迟容忍度调至 5s~30s。refresh_interval 与一致性权衡：调大则写入到可见的延迟变大。
- **违反后果**: 默认 1s + 大批量写入 → segment 风暴、merge 压力、写入吞吐腰斩。
- **验证方法**: 检出 `BulkRequest|.bulk(` 批量写入但全仓无 `refresh_interval` 配置 → warn 提示权衡。
- **对应门禁**: fw_es_refresh_interval(warn)

```verify
id: elasticsearch-r3
cmd: 
expect: always
```

### 规律：bulk 须控批次与并发，处理 EsRejectedExecutionException 背压
- **适用版本**: 全版本
- **规律**: bulk 单次批次建议 5~15MB 或 1000~5000 条（官方经验区间），过大压内存、过小吞吐低。线程池满时服务端返回 `EsRejectedExecutionException`（HTTP 429），客户端必须退避重试（指数 backoff），否则数据丢失。Java API Client 提供 BulkIngester 助手封装背压。
- **违反后果**: 无背压重试 → 429 时整批丢弃数据丢失；批次失控 → 节点 bulk 队列堆积拒绝写入。
- **验证方法**: 检出 `BulkRequest|.bulk(` 但同文件无 `EsRejectedExecutionException|Backoff|Retry|BulkIngester` → warn。
- **对应门禁**: fw_es_bulk_backpressure(warn)

```verify
id: elasticsearch-r4
cmd: 
expect: always
```

### 规律：mapping 字段数须防爆炸，显式收敛 total_fields.limit
- **适用版本**: 全版本
- **规律**: 默认 `index.mapping.total_fields.limit=1000`。把动态实体/日志 KV 整体塞进 ES 会让字段数随 key 膨胀，mapping 变大导致集群状态膨胀、每个节点堆内常驻 mapping 副本。生产索引须显式设 total_fields.limit 并按业务压扁结构（flattened 类型或键值对数组）。
- **违反后果**: mapping 爆炸 → 集群状态超大、master 发布慢、节点 OOM；超 limit 写入直接报错。
- **验证方法**: 检出 `"mappings"` 或 `index.mapping` 相关文件但无 `total_fields.limit` → warn。
- **对应门禁**: fw_es_mapping_explosion(warn)

```verify
id: elasticsearch-r5
cmd: 
expect: always
```

### 规律：生产索引动态 mapping 须收敛为 false 或 strict
- **适用版本**: 全版本
- **规律**: 默认 `dynamic=true`，未知字段自动建 mapping，与字段爆炸互为因果。生产索引须 `"dynamic":"strict"`（未知字段拒绝写入）或 `"false"`（不索引仅存 _source），配合显式 mapping 评审。日期/数字自动检测（dynamic_date_formats/numeric_detection）亦须按业务确认。
- **违反后果**: 上游脏字段写入 → mapping 无序膨胀，查询 mapping 冲突（同一字段不同类型）。
- **验证方法**: `grep -rnE '"dynamic"[[:space:]]*:[[:space:]]*"?true'` 命中 → warn；检出 mappings 文件但无 dynamic 声明 → warn。
- **对应门禁**: fw_es_dynamic_mapping(warn)

```verify
id: elasticsearch-r6
cmd: grep -rnE '"dynamic"[[:space:]]*:[[:space:]]*"?true' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：精确过滤条件须放 filter 上下文，避免无谓 score 计算
- **适用版本**: 全版本
- **规律**: bool 查询中 `must`/`should` 子句参与相关性打分，`filter` 子句不打分且结果可缓存（filter context 有 bitset 缓存）。term/terms/range/exists 等精确过滤放 `must` 会白白计算 score 且无法缓存，应全部放 `filter`；仅全文匹配（match/match_phrase）留 `must`。
- **违反后果**: 高 QPS 下 CPU 浪费 30%+（经验值），缓存失效放大延迟。
- **验证方法**: `grep -rnE '\.must\((QueryBuilders\.)?(termQuery|termsQuery|rangeQuery|existsQuery)'` 命中 → warn。
- **对应门禁**: fw_es_filter_context(warn)

```verify
id: elasticsearch-r7
cmd: grep -rnE '\.must\((QueryBuilders\.)?(termQuery|termsQuery|rangeQuery|existsQuery)' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：聚合嵌套深度与 terms size 须收敛
- **适用版本**: 全版本
- **规律**: 多层嵌套 bucket 聚合（terms → terms → terms）内存开销随每层 size 乘积膨胀，单请求可打爆节点堆（`search.max_buckets` 默认 65535 限制桶总数，8.x+ 生效）。生产聚合嵌套 ≤2~3 层，terms 显式设 size（默认 10），禁止 size=0/超大 size 取全量桶（9.x 中 size 语义以官方文档为准，待验证上限默认值变化）。
- **违反后果**: 聚合请求超 max_buckets 报错，或节点 OOM。
- **验证方法**: 单文件 `.subAggregation` 出现 ≥3 次 → warn 提示嵌套深度；`AggregationBuilders.terms` 未设 size 待人工核对。
- **对应门禁**: fw_es_agg_depth(warn)

```verify
id: elasticsearch-r8
cmd: 
expect: always
```

### 规律：时序索引必须配置 ILM（Index Lifecycle Management）
- **适用版本**: 8.x / 9.x（ILM 早已取代 Curator）
- **规律**: 日志/监控等日期模式索引（logs-2026.07.17）必须挂 ILM policy 管理 rollover（按大小/年龄滚新索引）、warm/cold 分层与到期删除，否则索引无限增长。数据流（data stream）+ ILM 是 8/9 推荐形态。代码中按日期拼索引名但仓内无任何 ILM/lifecycle 配置即裸奔。
- **违反后果**: 索引只增不减 → 磁盘打满集群只读（flood_stage watermark 触发 index.blocks.read_only_allow_delete）。
- **验证方法**: 检出日期模式索引名（`-[0-9]{4}\.[0-9]{2}|IndexRequest\("[a-z_]+-[0-9]{4}`）但全仓无 `ilm|LifecyclePolicy|lifecycle` → warn。
- **对应门禁**: fw_es_ilm(warn)

```verify
id: elasticsearch-r9
cmd: 
expect: always
```

### 规律：reindex 须显式处理版本冲突（conflicts=proceed 或按序覆盖）
- **适用版本**: 全版本
- **规律**: `_reindex` 默认遇到目标索引已存在同 _id 文档即中止（version conflict）。迁移/重建索引时须明确策略：`conflicts=proceed` 跳过冲突继续（须业务上可接受旧值留存），或设 `op_type=create` 仅补缺，或用外部版本号保证新覆盖旧。脚本侧调用须显式声明，禁止裸调。
- **违反后果**: reindex 中途 abort，数据迁移半成品；或静默跳过冲突文档造成新旧不一致。
- **验证方法**: 检出 `_reindex` 调用但同行/同文件无 `conflicts` → warn。
- **对应门禁**: fw_es_reindex_conflict(warn)

```verify
id: elasticsearch-r10
cmd: 
expect: always
```

### 规律：scroll 上下文必须显式释放（ClearScroll）
- **适用版本**: 全版本（9.x 实时翻页推荐 search_after+PIT，scroll 仅限导出）
- **规律**: scroll 快照在服务端持有 segment 引用与搜索上下文直到过期（scroll 参数如 1m），批量导出完成或异常退出都必须 `ClearScrollRequest`/`clearScroll` 显式释放。只依赖超时会累积上下文（每 scroll 一份），高并发导出拖垮节点。PIT 同理用 deletePit 释放。
- **违反后果**: scroll 上下文堆积 → 堆内存上涨、segment 无法合并删除、磁盘膨胀。
- **验证方法**: 检出 `SearchScrollRequest|\.scroll\(` 但同文件无 `ClearScroll|clearScroll` → warn。
- **对应门禁**: fw_es_scroll_release(warn)

```verify
id: elasticsearch-r11
cmd: 
expect: always
```

### 规律：8/9 已移除 RestHighLevelClient 与 mapping type，须迁移 elasticsearch-java
- **适用版本**: 8.x / 9.x
- **规律**: `RestHighLevelClient` 7.15 起废弃、8.x 彻底移除；官方客户端为 `co.elastic.clients:elasticsearch-java`。mapping type（`_doc` 之外的自定义 type、`include_type_name`）7.x 起废弃、8/9 彻底移除，代码中出现即不兼容 8+ 集群。9.x 对 7.x 旧客户端兼容性不保证（待验证具体断点，按不兼容处理）。
- **违反后果**: 客户端 API 不存在编译/运行失败；type 相关请求被 8/9 集群拒绝。
- **验证方法**: `grep -rnE 'RestHighLevelClient|include_type_name'` 命中 → warn 迁移；检出非 _doc type 使用 → warn。
- **对应门禁**: fw_es_version_compat(warn)

```verify
id: elasticsearch-r12
cmd: grep -rnE 'RestHighLevelClient|include_type_name' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：Java Client 连接池与超时须显式配置
- **适用版本**: 8.x / 9.x（elasticsearch-java 基于 RestClient）
- **规律**: 底层 `RestClient` 默认连接池（`setMaxConnTotal=30`/`setMaxConnPerRoute=10`，Apache HC 默认值，9.x 客户端是否调整待验证）对高并发服务偏小；socket/connect 超时默认过长。生产须按 QPS 显式配置 `setMaxConnTotal/PerRoute`、connect/socket timeout，并启用节点嗅探或故障转移（多 node 列表）。
- **违反后果**: 连接池耗尽请求排队超时；单节点故障无转移。
- **验证方法**: 检出 `RestClient.builder` 但同文件无 `setMaxConnTotal|setMaxConnPerRoute|RequestConfig|setConnectTimeout` → warn。
- **对应门禁**: fw_es_connection_pool(warn)

```verify
id: elasticsearch-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛），全部挂门禁 id，无游离规律。
verify-framework-ruleset.sh 扫描每条规律体内"对应门禁/人工检查"关键字，本文件全覆盖。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|------------|
| fw_es_deep_pagination | fail | from≥10000（Java/JSON）→ fail；from≥1000 → warn 提示 search_after | ES_SRC_GLOBS | CWE-400（堆内存随翻页深度线性膨胀） |
| fw_es_wildcard_prefix | fail | wildcard/query_string 查询值以 * 开头 → fail | ES_SRC_GLOBS | CWE-400（前缀通配退化为全 term 扫描） |
| fw_es_refresh_interval | warn | 检出 bulk 写入但全仓无 refresh_interval → warn | ES_SRC_GLOBS | —（写入可见性权衡） |
| fw_es_bulk_backpressure | warn | BulkRequest 文件无 429 退避/重试/BulkIngester → warn | ES_SRC_GLOBS | CWE-755（429 异常未处理，整批丢弃） |
| fw_es_mapping_explosion | warn | 有 mappings 相关文件但无 total_fields.limit → warn | ES_SRC_GLOBS | CWE-770（字段数无上限） |
| fw_es_dynamic_mapping | warn | dynamic=true 显式检出，或 mappings 无 dynamic 声明 → warn | ES_SRC_GLOBS | —（mapping 收敛） |
| fw_es_filter_context | warn | must 内放 term/terms/range/exists → warn | ES_SRC_GLOBS | —（打分上下文误用） |
| fw_es_agg_depth | warn | 单文件 subAggregation ≥3 次 → warn 嵌套过深 | ES_SRC_GLOBS | CWE-770（bucket 按层乘积膨胀） |
| fw_es_ilm | warn | 日期模式索引名但全仓无 ilm/lifecycle → warn | ES_SRC_GLOBS | —（生命周期管理） |
| fw_es_reindex_conflict | warn | _reindex 调用无 conflicts 声明 → warn | ES_SRC_GLOBS | —（冲突策略声明） |
| fw_es_scroll_release | warn | scroll 使用无 ClearScroll → warn | ES_SRC_GLOBS | CWE-772（scroll 上下文未释放） |
| fw_es_version_compat | warn | RestHighLevelClient/include_type_name 命中 → warn 迁移 | ES_SRC_GLOBS | —（客户端迁移） |
| fw_es_connection_pool | warn | RestClient.builder 无连接池/超时配置 → warn | ES_SRC_GLOBS | —（池化配置） |

<!--
门禁 id 命名规范：fw_es_<rule>。
上表 13 条 id 在 assets/framework-gates/elasticsearch.sh 中均有同名实现；片段头 `# gates:` 与本表一致。
fixture 验证覆盖：violating 含 from(50000) 深分页 + wildcardQuery 前缀 * → fw_es_deep_pagination/fw_es_wildcard_prefix fail 主触发（expected-fail-ids 2/2 已登记）；compliant 用 search_after + filter 上下文精确查询 → 全 pass。
CWE/GB 映射列说明（P1-1 补录，2026-07-20）：
- CWE 编号依据 MITRE CWE 词典与 CWE Top 25:2025（R8 §⑨）；「—」为工程一致性/性能契约类规律，无对应 CWE 弱点类，归 ISO/IEC 5055:2021 性能/可靠性度量面（138 弱点经 CWE 对齐，见 standards-compliance.md §E.1）。
- GB/T 34944-2017（Java，9 大类 44 种）/ GB/T 34946-2017（C#）总则 §5 要求 SAST 扫描 + 人工复核 + 测试四件套；本表作用于源码的门禁即该流程的词法层 SAST 面（R8 §⑥）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| elasticsearch × spring-boot | spring.elasticsearch.* 配置须与 spring-data-elasticsearch 版本对齐 ES 服务端主版本 | 客户端与服务端跨大版本协议不保证兼容 |
| elasticsearch × mybatis | ES 与 DB 双写须定主从（DB 主 ES 从，CDC/消息同步），禁止业务代码双写 | 双写无事务，失败即数据不一致 |
| elasticsearch × xxl-job | 定时批量重建索引任务须走 reindex + alias 切换，禁止删索引重建 | 别名切换零停机；删索引重建有查询空窗 |

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| ES 7.x | mapping type 废弃（_doc 唯一）；RestHighLevelClient 末期 | type 相关代码须清理 |
| ES 8.0 | 移除 mapping type；RestHighLevelClient 移除；search.max_buckets 默认 65535 强制 | 7→8 升级须客户端迁移 elasticsearch-java；聚合超限报错 |
| ES 8.x | data stream + ILM 成为时序推荐形态；PIT 取代 scroll 实时翻页 | scroll 仅限批量导出 |
| ES 9.0 | 全面移除残留 type API；kNN/dense_vector 默认开启；旧客户端兼容断点（待验证清单） | 待验证：9.0 breaking changes 明细以官方 migration 文档为准 |
| ES 9.4 | 2026-07 现行 9.4.3 | 规律按 9.x 陈述，版本特性以官方 release notes 为准 |
