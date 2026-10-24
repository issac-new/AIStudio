# R4 · 58 框架规则三件套深度分析

> 角色：R4-框架规则库分析员 ｜ 调研日期：2026-07-20 ｜ 方法：只读静态分析 + 本地实跑复现（macOS Darwin 25.5.0，BSD grep 2.6.0-FreeBSD）
> 对象：`swarm-yuan/references/frameworks/*.md`（58 个文件 = 57 规则集 + `_template.md`）× `swarm-yuan/assets/framework-gates/*.sh`（57）× `swarm-yuan/tests/fixtures/*/`（57）
> 抽样精读 12 框架：spring-boot / vue / react / django / fastapi / kafka / redis / mysql / gorm / netty / flink / xxl-job（门禁脚本与 fixture 均实跑）

---

## 一、理念

三件套要解决的问题在《框架规则引擎设计》中写得很直白：框架适配质量"全凭生成时 AI 临场发挥，质量不可控"，须把"那次生成时 AI 认真即兴手写"的高质量产物**制度化**（`docs/2026-07-17-framework-rules-engine-design.md:11-18`）。其理念内核有三：

1. **规则即合同（Contract-first）**。每个框架的规则文件不是散文知识库，而是可被脚本机械核验的合同：frontmatter 四字段（ruleset_id / 适用版本 / 最后调研 / 深度门槛）供 `verify-framework-ruleset.sh` 解析，命名不可改（`swarm-yuan/references/frameworks/_template.md:12-27`）。
2. **写了规律就必须有执法**。"§3 每条规律必须挂门禁 id 或标注'人工检查'——不允许'写了规律但没有执法'"（`_template.md:14-16`）；NOGATE 检查由 awk 状态机逐规律小节扫描实现（`swarm-yuan/scripts/verify-framework-ruleset.sh:27-33`）。
3. **双态样本自证**。每个门禁片段配 violating/compliant 双 fixture，"断言 fail/pass 两态"（设计文档 §8.2，`docs/2026-07-17-framework-rules-engine-design.md`），使门禁逻辑本身成为可回归测试的代码。

这一理念与 GB/T 25000.51-2016《系统与软件工程 系统与软件质量要求和评价（SQuaRE）第 51 部分》对"产品质量—可测试性"的要求同向：规则可机器核验 = 质量属性可重复测量。差距在于当前核验只到"结构完备"与"出口码双态"，未到"判定正确性"（见 §五）。

## 二、功能：三件套的标准结构（回答问题①）

### 2.1 规则 md：六段式（§1–§6）+ frontmatter 四字段

以 `_template.md:1-107` 为法定结构，57 个规则集全部遵循：

| 段 | 内容 | 契约约束 | 证据 |
|---|---|---|---|
| frontmatter | ruleset_id / 适用版本 / 最后调研（日期+来源URL）/ 深度门槛 | 四字段供 verify 脚本解析；"最后调研">180 天 self-check warn | `_template.md:1-6`；`swarm-yuan/scripts/self-check.sh:437-468` |
| §1 探查信号 | 信号类型（依赖/注解/文件/配置/代码）× 模式 × 置信度表 | 由 `gen-framework-index.sh` 扫描组装进 exploration-guide.md §C+.0.5 标记区块 | `_template.md:29-44`；`swarm-yuan/scripts/gen-framework-index.sh:1-8` |
| §2 特定构件枚举 | 每类构件一条 grep/find 命令 + 计数核验基准 | 供生成侧"构件枚举计数≥实际×0.95"核验 | `_template.md:46-56`；`swarm-yuan/SKILL.md:86` |
| §3 领域规律 | ≥深度门槛条，每条五要素：适用版本/规律/违反后果/验证方法/对应门禁（或"人工检查"） | 缺"对应门禁/人工检查"→ NOGATE 不通过 | `_template.md:58-76`；`verify-framework-ruleset.sh:21-33` |
| §4 门禁清单 | id / 级别（fail/warn）/ 实现逻辑 / 依赖 conf 变量四列表 | 每条 id 须在 `<fw>.sh` 中有"实现痕迹"（grep 命中） | `_template.md:78-90`；`verify-framework-ruleset.sh:36-38` |
| §5 跨框架交互 | 交互对 × 规则 × 理由（如 mybatis×sharding 分片键） | 无强交互可留空表头 | `_template.md:92-104`；`spring-boot.md:188-200` |
| §6 版本陷阱 | 版本 × 变化 × 影响速查表 | 与探查提取的版本号区间匹配 | `_template.md:106-118`；`exploration-guide.md:545` |

### 2.2 门禁片段 .sh：头注释三行 + 单函数约定

57 个片段结构高度统一（实测逐一核对）：

- 第 1 行 `# ruleset: <id>  requires_conf: VAR1 VAR2 ...`（conf 变量约定式命名 `<RULESET_ID>_<VAR>`，连字符转下划线全大写，由 precheck.conf 框架适配段提供，见 `swarm-yuan/assets/precheck.conf:83-87`）；
- 第 2 行 `# gates: fw_<id>_<rule>(fail|warn) ...`（与 md §4 表一一对应）；
- 第 3 行 `# harvested-from: <批次/来源>（2026-07-17）`（溯源标注，全部 57 片段均有）；
- 函数体 `_fw_<id>_check()`（连字符转下划线），如 `_fw_spring_boot_check()`（`swarm-yuan/assets/framework-gates/spring-boot.sh:4`）、`_fw_xxl_job_check()`（`xxl-job.sh:4`）；
- 片段经 `generate-skill.sh --inject-frameworks` 注入 precheck.sh 的 `# >>> swarm-yuan:framework-gates >>>` 标记区块（`swarm-yuan/assets/precheck.sh:2514-2515`；`swarm-yuan/scripts/generate-skill.sh:212-227`），由 `check_framework()` 按 ACTIVE_FRAMEWORKS 动态分发（`declare -f` 探测，缺失即 fail，`precheck.sh:2491-2512`）。

片段内部汇报有三种风格，**不统一**：
- `_fw_report <级别> <id> <违规明细> <违规说明> <通过说明>`（公共库，`precheck.sh:2608-2613`）——spring-boot 14 门禁中 11 处使用；
- 直接 `pass/warn/fail "<id>: ..."`——vue.sh 全用此风格（`vue.sh:12-89`）；
- 空输入兜底：`[[ ${#srcarr[@]} -eq 0 ]] && pass "...跳过"`（spring-boot 风格）vs `warn "...未配置或无文件可检"; return`（kafka/redis/xxl-job 等 47 个片段的整体兜底）。

### 2.3 fixture 双态结构

`tests/fixtures/<fw>/{violating,compliant}/` 各含一份 `precheck.conf`（`__REPO_ROOT__` 占位符机器无关化）+ 最小违例/合规样本文件（`swarm-yuan/tests/run-framework-fixture.sh:9-20`）。运行器逻辑：

- violating 期望退出码非 0（任一 fail 门禁触发即满足），compliant 期望退出码 0（`run-framework-fixture.sh:21-24`）；
- violating 的 precheck.conf 头注释声明"主触发"门禁意图，如 spring-boot："@Transactional 同类自调用 + Actuator exposure.include=* + javax import → fail"（`swarm-yuan/tests/fixtures/spring-boot/violating/precheck.conf:1`）。

### 2.4 索引与校验工具链

- `scripts/gen-framework-index.sh`：扫描 57 个 md 的 §1 表，幂等重写 `exploration-guide.md` 的 `# >>> framework-signal-index >>>` 区块（实测位于 `swarm-yuan/references/exploration-guide.md:265-543`，约 276 行信号）；self-check 会 regen 比对漂移（`self-check.sh:539-551`）。
- `scripts/verify-framework-ruleset.sh`：四要素机械核验——规律数≥门槛（:16-19）、NOGATE（:27-33）、§4 id⊆片段（:36-38）、函数存在+bash -n 语法+禁 declare-A（:40-44）、fixture 双态（:46-53）。**实测 57/57 全部通过**（2026-07-20 本机逐一运行）。
- CI 接线：`.github/workflows/ci.yml:14-50` 两个 Job 分别跑 verify 全量与 fixture 双态全量。

## 三、设计原理

1. **种子→实例化两段式**。范式侧 md 是"规律种子"；生成时 AI 逐条用项目代码验证后实例化为目标 skill 的 `framework-knowledge.md`（成立→附"证据:"字段；不成立→剔除记原因；版本区间外→标"待验证"），见 `swarm-yuan/references/domain-knowledge.md:390` 与 SKILL.md Step 12（`swarm-yuan/SKILL.md:86`）。范式核验（verify-framework-ruleset.sh）与生成核验（Step 12 四要素）是**两套不同集合**（`domain-knowledge.md:392`）。
2. **约定优于配置的分发**。`check_framework` 不含任何框架 if 分支，纯靠 `_fw_<id>_check` 命名约定 + `declare -f` 动态分发（`precheck.sh:2491-2512`），新增框架零改 precheck.sh——符合开闭原则。
3. **零回归回灌**。ncwk-dev 手写的 7 个框架函数原样收割为片段种子，回灌时同名片段等价替换，"只允许增多不允许减少"（设计文档 §4.3）。
4. **三平台铁律**。verify 显式禁止 `declare -A`（`verify-framework-ruleset.sh:44`）；公共注释剥离器按"57 片段嵌套函数体逐字节比对"聚类为 C 系等家族（`precheck.sh:2543-2560` 注释）。
5. **fail-open 防御的已知边界**。审计已确认三件套数量 1:1:1、57/57 fixture 绿（`docs/2026-07-20-audit-optimization-decisions.md:8`），并修复了注入缺闭标记的 fail-open 删除风险（同文 :20）。但本轮分析发现新的防御缺口（见 §五）。

## 四、证据：质量一致性、覆盖分布、边界重叠（回答问题②③④）

### 4.1 ② 框架间质量一致性：结构高度统一，深度与证据分层不齐

**统一执行良好的部分**（全量 57 框架机械核对，2026-07-20）：

- 结构完备率 100%：57/57 均有 §1 信号（3-5 行）、§2 构件枚举（3-12 类）、§5 交互（2-6 对）、§6 版本陷阱（2-14 行）；§3 全部规律五要素齐全（"验证方法"缺失数=0，逐文件 awk 核验）。
- 深度门槛三档：**46 个=10、7 个=12（lombok/mapstruct/sharding/spring-batch/spring-cloud/spring-data-jpa/spring-security）、4 个=15（spring-boot/mybatis/vue/react）**（46+7+4=57，`_template.md` 的"深度门槛: 10"不计入）；规律数全部达标（verify 57/57 通过）。
- 门禁 id 三向一致：md §4 全部 id 在对应 .sh 中 grep 命中（缺失数=0）；`# gates:` 头注释与 §4 表集合一致。
- 规律总数约 730 条（57 文件合计 10962 行）；门禁总数 **676 个 = fail 124（18.3%）+ warn 552（81.7%）**（按 57 个 `# gates:` 头注释统计）。

**不一致的部分**：

| 维度 | 现状 | 证据 |
|---|---|---|
| 证据引用（CWE/CVE） | 模板仅要求"尽量挂 CWE/官方 issue/CVE"（软约束）。**20/57 框架零 CWE 引用**（含 fastapi/flink/kafka/react/spring-data-jpa 等）；仅 3 个文件引 CVE（jackson/quartz/sharding）。spring-security 最多（14 处 CWE） | `_template.md:66`；逐文件 `grep -oE 'CWE-[0-9]+'` 统计 |
| 规律→门禁转化率 | 悬殊：spring-boot 15 规律→14 门禁（93%）；**vue 17 规律→仅 7 门禁，11 条标"人工检查"**（转化率 41%）；elasticjob/quartz 各 5 条人工检查；redis/nextjs/nestjs/react 各 4 条 | `swarm-yuan/references/frameworks/vue.md:15-18`（自述"语义/上下文相关规律难以机械 grep"） |
| 空输入语义 | 47 个片段整体 `warn+return`；但 spring-boot 等文件内部又逐门禁 `pass"...跳过"`，两种语义混存于同一文件 | `spring-boot.sh:27-29` vs `kafka.sh:14-17` |
| 汇报风格 | `_fw_report` 与直接 pass/warn/fail 混用（极端值：sentinel.sh 仅 1 处 _fw_report、37 处直接调用；celery.sh 1 处 vs 26 处） | 逐文件 grep 计数 |
| opt-in 开关门禁 | vue/koa 共约 9 个门禁受 `VUE_REQUIRE_SCRIPT_SETUP="1"` 类开关控制，conf 不开即静默不检 | `vue.sh:12,23,29`；`koa.sh:1` |
| 文件内注释漂移 | vue.md 头部注释称"§4 门禁清单的 5 条 id"，实际 §4 有 7 条（5 vue + 2 pinia 合并后未同步） | `vue.md:15` vs `vue.md` §4 表 |

### 4.2 ③ 技术域覆盖分布与 2026 缺口

按设计文档 §6 分组实测核对（合计 57）：

| 域 | 框架 | 数量 |
|---|---|---|
| Java 核心 | spring-boot, spring-cloud, spring-security, spring-batch, spring-data-jpa, mybatis, lombok, mapstruct, validation, jackson, junit5-mockito | 11 |
| Java 分布式/中间件 | sharding, dubbo, seata, sentinel, nacos, xxl-job, elasticsearch, netty | 8 |
| 数据集成/流计算 | kettle, flink, paimon | 3 |
| MQ/缓存/调度 | rocketmq, kafka, rabbitmq, redis, quartz, elasticjob | 6 |
| 数据库 | mysql, postgresql, sqlserver | 3 |
| Node 后端 | express, koa, nestjs, fastify, typeorm, prisma | 6 |
| Python | django, flask, fastapi, sqlalchemy, celery, pytest | 6 |
| Go | gin, gorm | 2 |
| 前端核心 | vue, react, angular, nextjs, nuxt | 5 |
| 前端 UI/工程 | element, antd, naiveui, vite, webpack, tailwind | 6 |
| 前端测试 | jest-vitest | 1 |

特征：**Java（22）+ 国内阿里系中间件浓度高**（dubbo/seata/sentinel/nacos/xxl-job/elasticjob/rocketmq/sharding），Python/Node 均衡，Go 仅 2 个，测试域 3 个（junit5-mockito/pytest/jest-vitest）。

按 2026 年主流技术栈看，缺口（57 个 md 全文检索确认零覆盖）：

1. **AI/LLM 工程栈（最大缺口）**：无 LangChain/LlamaIndex/vLLM/RAG 管线/prompt 管理/LLM 评估/向量库（milvus/pgvector/qdrant）/MCP 相关规则集。2026 年 LLM 应用已是研发主流场景，而本项目自身即 AI 生成工具。
2. **Rust**：零覆盖（tokio/axum/cargo clippy 规范均无）。
3. **Go 云原生**：仅 gin/gorm 两个 Web/ORM 库；缺 kubernetes client-go/operator-sdk、grpc-go、ent、cobra。
4. **移动端**：零覆盖（Android/KMP、iOS SwiftUI、Flutter、React Native、HarmonyOS ArkTS）。
5. **信创栈**：零覆盖（openEuler/openGauss、达梦 DM8、人大金仓 KingbaseES、OceanBase、TDSQL、东方通 TongWeb、麒麟 OS 适配）。若对标国家/行业合规场景（如政务、金融信创目录），这是硬性缺口。
6. **IaC/交付工程**：无 Dockerfile/docker-compose/Kubernetes YAML/Helm/Terraform 规则集——而"研发范式"产物的可部署性恰是验收高发区。
7. **可观测性**：无 OpenTelemetry/SkyWalking/Prometheus 客户端规范（通用门禁 --shift-left 有监控左移但无框架级）。
8. **其他长尾**：GraphQL/gRPC 协议层、Pulsar、Doris/StarRocks/ClickHouse/Iceberg、Svelte/Solid/Astro/Rspack、zustand/redux-toolkit、Bun/Deno。
9. **生命周期风险**：kettle 已停止活跃演进（设计文档自述"重点标注 Pentaho CE 9.x 与 Hop 分叉"），占据数据集成 1/3 名额；elasticjob 社区活跃度低。

### 4.3 ④ 框架门禁与 27 通用门禁的边界与重叠

**边界（架构上清晰）**：

- `check_framework` 是 27 门禁之一（`precheck.sh:254` ALL_GATES_FULL 末位；`--framework` flag，`precheck.sh:257`），676 个框架门禁全部作为其子门禁存在；不在核心 10 中，默认 `--all` 不执行，只在 `--all-full` 或显式 `--framework` 时运行（对照 `swarm-yuan/SKILL.md:84` 的两阶段运行法）。
- 分工原则：通用门禁 = 技术无关不变量（分支/敏感信息/测试/安全基线）；框架门禁 = 框架惯用法语义，且仅在 ACTIVE_FRAMEWORKS 激活 + requires_conf 配置后才生效。
- 激活侧有漏配探针：ACTIVE_FRAMEWORKS 为空但存在 `*Mapper.xml` → warn"疑似漏配 mybatis"（`precheck.sh:2494-2500`）——但仅 mybatis 一例，其余 56 框架无漏配探针。

**重叠（实测确认的双报风险）**：

| 通用门禁 | 框架门禁 | 重叠点 |
|---|---|---|
| `check_sensitive`（`precheck.sh:371` 起，通用口令正则 `password\s*[:=]` 等） | nacos/spring-cloud `config_encrypt`、django `secret_key`、kettle 明文密码 | 同一处明文口令可被两个规则 id 重复报告；通用正则不懂 `${ENV_VAR}` 占位符语义，框架门禁懂——可能出现通用 fail 与框架 pass 的矛盾判定 |
| `check_security`（OWASP 扫描含 `v-html\|dangerouslySetInnerHTML\|innerHTML` 拼接，`precheck.sh:1180` 附近） | vue `fw_vue_vhtml_sanitize`、react XSS 相关 | 通用要求"拼接上下文"，框架要求"同文件含 sanitize 模式"，口径不同 |
| `check_security` SQL 拼接模式 | mybatis `fw_mybatis_dollar`（含 SQL_INJECTION_WHITELIST 白名单，`mybatis.sh:44`） | 白名单只被框架门禁消费；通用门禁可能把白名单内 ORDER BY ${col} 报为违规 |
| `check_test`（动态跑 TEST_CMD，`precheck.sh:358-368`） | pytest/jest-vitest/junit5-mockito（静态配置/断言模式） | 互补，无重叠 |
| `check_deps`（版本基线比对 codebase.md） | xxl-job `version_align`、spring-cloud release train 对齐 | 互补（通用管"变没变"，框架管"对不对齐"） |
| `check_frontend`（组件深度/props/CSS） | react/vue 惯用法门禁 | 互补分层 |

### 4.4 ⑤ fixture 测试完备性：双态绿 ≠ 判定路径覆盖

**机制性缺陷（根因）**：运行器只断言退出码（`run-framework-fixture.sh:21-24`），且 `warn()` 不置 FAIL（`precheck.sh:241-242`）。由此三条推论：

1. **violating 侧**：任一 fail 门禁触发即通过，其余 fail 门禁全部"沉睡"也不被发现；
2. **compliant 侧**：只证明无 fail 误报；warn 级门禁在合规样本上误报完全不可见；
3. **warn 级门禁整体无测试**：552 个 warn 门禁的触发路径没有任何断言（violating 不查、compliant 不查）。

**实测覆盖数据**（2026-07-20 本机复刻运行器逻辑、捕获 `--framework` 实际输出，57 框架全量）：

- violating fixture 实际触发的 fail 门禁合计 **88/124 = 71.0%**；**34/57 框架的 fail 门禁被 fixture 全覆盖**，其余 23 个框架存在从未被 fixture 触发的 fail 门禁（典型：nuxt 2/6、nextjs 2/5、spring-security 3/5、gin 2/4、spring-boot 1/3、mybatis 1/3、rocketmq 1/3、sqlserver 1/3、vue 1/3、xxl-job 1/2）。
- warn 门禁触发数以 django/mysql/fastapi/netty 为多（fixture 样本较厚），但多数框架 warn 触发为个位数。
- 唯一存在"按门禁 id 断言"的测试是 e2e：`tests/e2e/run-e2e.sh:35-53` 断言 mybatis/lombok/spring-batch/sharding 各 1 个指定 fail id 出现在输出中——57 框架中仅 4 个享此待遇。

**实证案例：spring-boot 三处失守（本报告新发现，2026-07-20 实跑复现）**

fixture 注释承诺 3 个 fail 触发，实测仅 `fw_sboot_jakarta_migration` 触发：

1. `fw_sboot_transactional_selfinvoke`（fail）与 `fw_sboot_proxy_bean_methods`（warn）**在 macOS 上沉睡**：方法名提取正则含字符类 `[A-Za-z0-9_<>,.\[\] ]`，`\[\]` 转义在 BSD grep 2.6.0-FreeBSD 下解析失败 → `tx_methods` 提取为空 → 门禁恒 pass（`spring-boot.sh:36-38,123-125`；本机隔离测试：`echo '    public void doSave(String order) {' | grep -oE '<该正则>'` 返回空，rc=1）。**CI（ubuntu GNU grep）不发病**——平台相关沉睡，本地 macOS 开发与 CI 判定结果不一致。
2. `fw_sboot_actuator_expose`（fail）**对惯用 YAML 失效（平台无关）**：门禁只匹配点号单行 `management.endpoints.web.exposure.include`（`spring-boot.sh:191`），而 violating fixture 的 application.yml 用的是 Spring 惯用的嵌套 YAML（`management:\n  endpoints:\n    web:\n      exposure:\n        include: '*'`）→ 判定为"已收敛"，漏报。fixture 测试仍整体通过，因为 jakarta 门禁兜底。
3. 启示性事实：该框架的 verify 四要素核验、CI fixture 双态**全绿**——结构核验与出口码断言都无法发现上述两处问题。

## 五、对 swarm-yuan 的启示（对标行业/国家质量标准的升级建议）

按优先级排列（P0 = 阻断级，直接影响"满足行业及国家质量/安全标准"目标）：

1. **P0 · fixture 断言升级到门禁级**：run-framework-fixture.sh 增加第三态断言——violating 须输出 fixture conf 声明的每个"主触发"门禁 id（照 e2e `run-e2e.sh:47-53` 模式推广到 57 框架）；compliant 增加"零 warn"可选严格模式。否则 GB/T 25000.51-2016 意义上的"功能正确性"无证据链，"57/57 绿"是弱断言。当前 36/124 个 fail 门禁（29%）无触发证据。
2. **P0 · 修复实证沉睡门禁**：`spring-boot.sh` 两处 `\[\]` 字符类改 POSIX 写法（`[...]<>,.[]...` 或去掉方括号）；`fw_sboot_actuator_expose` 增加嵌套 YAML 解析（或显式声明仅支持 properties/点号 yml 并在 md §3 验证方法中同步）。同步在 `docs/2026-07-20-audit-optimization-decisions.md` 的"沉睡门禁"清单中登记。注意遵循"不贸然唤醒"原则（`docs/paradigm-decisions.md:31-36` 引用的教训）——先补 fixture 断言再修，修复后 spring-boot violating 应从 1 fail 变 3 fail，须评估对存量项目的误报冲击。
3. **P1 · 跨平台正则基线**：CI 增加 macOS runner（或 BSD grep 容器）跑 fixture 双态——当前 CI 仅 Linux（`.github/workflows/ci.yml`），平台相关沉睡门禁不可见。verify-framework-ruleset.sh 可增加"正则可移植性"静态检查（禁 `\[\]`、禁 GNU-only `-P/-z`，对照审计已知的 `grep -rzoP` 问题，`docs/2026-07-20-audit-optimization-decisions.md:37`）。
4. **P1 · 证据字段分级制度化**：把"违反后果挂 CWE/CVE/官方 issue"从"尽量"升级为分档硬约束——fail 级规律必须挂至少一条外部权威引用（CWE 优先），warn 级可选；verify 脚本增 NOEVID 检查。当前 20/57 框架零 CWE，对标 OWASP/CWE 及 GB/T 30279-2020《信息安全技术 网络安全漏洞管理》的漏洞分类引用习惯。
5. **P1 · "人工检查"转化率设下限**：vue 41%（7/17）是离群点（次低 elasticjob 58%）。建议深度门槛之外增设"门禁转化率 ≥60%"或要求人工检查规律在 dev-guide §10 约束段强制落地（SKILL.md Step 12 要素④已有 ≥3 条约束的要求，可挂钩）。
6. **P2 · 覆盖缺口补盲**：优先 AI/LLM 工程栈（与项目自身定位最相关）、信创数据库/中间件（达梦/人大金仓/OceanBase/openGauss，对标行业合规）、IaC（Dockerfile/K8s/Helm）。每个新规则集按 `_template.md` 走全流程（设计文档 §5.3 已预留"长尾框架贡献引导"机制）。Go 云原生与移动端视目标用户群决策。
7. **P2 · 边界消重**：明确"通用门禁报存在、框架门禁报语义"的口径——check_sensitive 命中行若同时被框架 config_encrypt 门禁判定为占位符合规，应去重或以框架判定为准；在 SKILL.md 或 precheck.sh 注释中写明优先级，避免双报与矛盾判定。
8. **P2 · 小修**：vue.md:15 头部注释"5 条"改"7 条"；空输入语义统一为一种（建议 warn+return，与 47 个片段多数派一致）；漏配探针从 mybatis 一例推广到高置信度信号（如 `@SpringBootApplication`、`*.vue`、`go.mod`）。
9. **P3 · 生命周期管理**：kettle/elasticjob 等低活跃框架在 frontmatter 增"维护状态"字段；self-check 的时效检查（>180 天 warn，`self-check.sh:455-467`）可扩展为"上游 EOL 检查"（对照 endoflife.date，kafka.md 调研来源已用该站）。

---

## 附：本报告关键实测命令与数据快照（2026-07-20）

- verify 全量：`for f in references/frameworks/*.md; do bash scripts/verify-framework-ruleset.sh <id>; done` → **57/57 通过**。
- fixture 全量（本机）：`bash tests/run-framework-fixture.sh <id>` 抽样 12 框架全绿；CI 57/57 绿（审计文档 :27 复核口径一致）。
- 门禁统计：57 个 `# gates:` 头注释合计 676 id（fail 124 / warn 552）。
- 深度门槛分布：`grep '^深度门槛:' references/frameworks/*.md`（排除 `_template.md`）→ 10×46，12×7，15×4。
- fail 触发覆盖：复刻运行器捕获 `--framework` 输出 → 88/124（71.0%），34/57 框架全覆盖。
- spring-boot 沉睡复现：`grep -oE '\b(public|protected|private)?[[:space:]]*(static[[:space:]]+)?[A-Za-z_][A-Za-z0-9_<>,.\[\] ]*[[:space:]]+([a-zA-Z_][a-zA-Z0-9_]*)\('` 对 `'    public void doSave(String order) {'` 在 BSD grep 下返回空（rc=1）。
