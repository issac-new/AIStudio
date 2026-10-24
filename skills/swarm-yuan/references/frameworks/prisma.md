---
ruleset_id: prisma
适用版本: Prisma 6.x（维护线，2026-07 最新 6.19.3）/ 7.x（现行主线，2026-07 核实 latest 7.8.0；v7 breaking 差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/prisma/prisma/releases ；https://www.prisma.io/docs/orm/more/upgrade-guides/upgrading-versions/upgrading-to-prisma-7 ；https://www.prisma.io/docs/orm/prisma-client/queries/transactions ；https://www.prisma.io/docs/orm/prisma-client/queries/raw-database-access/raw-queries ）
深度门槛: 10
---

# Prisma 规则集

<!--
本规则集覆盖 Prisma 6.x/7.x。2026-07-17 联网核实 GitHub releases：7.8.0 为 latest 主线，
6.x 仅维护性补丁（6.19.3）。v7 关键 breaking（官方升级指南已核实）：
prisma-client 新 provider（Rust-free，output 必填）、driver adapters 必填、中间件 $use 移除
（改 Client Extensions $extends）、prisma.config.ts 成默认配置位、ESM-only、Node ≥20.19。
事务/原始查询/迁移机理按 6.x/7.x 共有行为陈述。无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `package.json` 含 `"prisma"` / `"@prisma/client"` / `"@prisma/adapter-*"` | 高 |
| 文件 | `**/schema.prisma` / `**/prisma/migrations/*/migration.sql` / `**/prisma.config.ts` | 高 |
| 配置 | `datasource db {` / `generator client {` / `model ` 块 | 高 |
| 代码 | `new PrismaClient(` / `prisma.$transaction(` / `prisma.$queryRaw` / `$extends(` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 prisma 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 数据模型：`grep -rnE '^model[[:space:]]+[A-Z]' "${PROJECT_DIR}" --include='*.prisma'`（计数核验基准：model 块数）
- 迁移目录：`find "${PROJECT_DIR}" -type f -name 'migration.sql' -path '*migrations*'`（计数核验基准：migration.sql 文件数）
- 交互式事务：`grep -rnE '\$transaction\(\s*async' "${PROJECT_DIR}" --include='*.ts' --include='*.js'`（计数核验基准：交互式事务调用行数）
- 原始查询：`grep -rnE '\$(queryRaw|executeRaw|queryRawUnsafe|executeRawUnsafe)' "${PROJECT_DIR}" --include='*.ts' --include='*.js'`（计数核验基准：原始查询调用行数）
- 关联定义：`grep -rnE '@relation\(' "${PROJECT_DIR}" --include='*.prisma'`（计数核验基准：@relation 行数）
- 索引定义：`grep -rnE '@@index|@@unique|@unique' "${PROJECT_DIR}" --include='*.prisma'`（计数核验基准：索引声明行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：生产部署用 prisma migrate deploy，禁止 migrate dev
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `migrate dev` 是开发命令——检测漂移、可能提示 reset（交互式）、生成新迁移、（v6）自动 generate/seed。生产/CI 必须 `migrate deploy`：仅按迁移历史应用未执行迁移，无交互、不生成、漂移即报错。部署脚本（Dockerfile/CI）出现 `migrate dev` 属红线。
- **违反后果**: 生产容器启动时 migrate dev 触发 reset 提示挂死或漂移误判；意外清库风险 CWE-672。
- **验证方法**: `grep -rnE 'prisma migrate dev' Dockerfile* *.sh` 命中 → fail。
- **对应门禁**: fw_prisma_migrate_deploy(fail)

```verify
id: prisma-r1
cmd: grep -rnE 'prisma migrate dev' --include='Dockerfile*' --include='*.sh' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：已应用迁移不可手改，修正必须新增迁移
- **适用版本**: Prisma 6.x / 7.x
- **规律**: Prisma 以 `_prisma_migrations` 表记录已应用迁移的 checksum。手改已应用迁移文件导致 checksum 不匹配，`migrate deploy` 报 P3009（failed migration）/漂移告警。schema 修正必须 `migrate dev --name` 新增迁移；已失败迁移按 `migrate resolve` 流程处置。
- **违反后果**: 部署时 checksum 校验失败阻断发布；环境间 schema 漂移。
- **验证方法**: 人工检查（`git log prisma/migrations/` 确认已发布迁移无后续修改；`prisma migrate status` 核对）。
- **对应门禁**: 人工检查

```verify
id: prisma-r2
cmd: 
expect: always
```

### 规律：交互式 $transaction 必须显式 timeout/maxWait（默认 5s/2s 易踩）
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `prisma.$transaction(async (tx) => {...})` 交互式事务默认 `maxWait=2000`（排队等连接 2s）、`timeout=5000`（事务总时长 5s），超时回滚报 P2028。长事务（批量写/跨表一致性）必须显式 `{ timeout, maxWait }` 并按隔离级别需求配 `isolationLevel`。
- **违反后果**: 高并发下批量操作大面积超时回滚 → 业务失败率飙升。
- **验证方法**: 含 `$transaction(async` 的文件未含 `timeout:` → warn。
- **对应门禁**: fw_prisma_transaction_timeout(warn)

```verify
id: prisma-r3
cmd: 
expect: always
```

### 规律：循环内 await prisma.* 是 N+1，须 include/select 或批量查询
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `for (const x of list) { await prisma.post.findMany({ where: { userId: x.id } }) }` 是经典 N+1。正解：单次 `findMany({ include: { posts: true } })`（JOIN/单查取关联）、`select` 裁剪字段、或 `in: ids` 批量查后内存分组。`Promise.all` 并发查询缓解延迟但仍是 N 次 SQL，数据量大时压垮连接池。
- **违反后果**: 列表页 1+N 次 SQL，连接池耗尽、延迟雪崩。
- **验证方法**: 同一文件含 `for (` 且含 `await prisma.` → warn 人工确认循环内查询。
- **对应门禁**: fw_prisma_n1_loop(warn)

```verify
id: prisma-r4
cmd: 
expect: always
```

### 规律：$queryRawUnsafe/字符串拼接原始查询 = SQL 注入面，必须 tagged template 参数化
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `$queryRaw\`...${var}\`` tagged template 会把插值参数化为绑定变量（安全）；而 `$queryRawUnsafe(str)`、`$queryRaw('...' + var)` 直接拼接进 SQL。动态表名/列名场景须 `Prisma.sql\`...\`` + `Prisma.raw`（白名单后）或 `Prisma.join`。
- **违反后果**: SQL 注入 CWE-89（拖库/越权/写破坏）。
- **验证方法**: `grep -rnE '\$(queryRawUnsafe|executeRawUnsafe)'` 命中，或 `\$(queryRaw|executeRaw)\(` 同行含 `+` 拼接 → fail。
- **对应门禁**: fw_prisma_queryraw_injection(fail)

```verify
id: prisma-r5
cmd: grep -rnE '\$(queryRawUnsafe|executeRawUnsafe)' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：连接池 connection_limit 须按部署形态配置（serverless 冷启动红线）
- **适用版本**: Prisma 6.x / 7.x（v7 driver adapters 池行为随驱动，待验证各 adapter 默认）
- **规律**: 连接池大小经 datasource url 参数 `connection_limit` 控制（v6 默认 num_cpus×2+1）。实例数×connection_limit ≤ 库 max_connections。serverless（Lambda/云函数）每冷启动新建 client → 连接爆炸，须 `connection_limit=1` 或外部连接池（PgBouncer/Accelerate Data Proxy）。v7 driver adapters 池配置下沉到底层驱动（如 pg Pool），默认行为与 v6 不同（待验证各 adapter 默认值）。
- **违反后果**: 连接数超库上限 → 全量请求拒绝；serverless 并发冷启动瞬间打满连接。
- **验证方法**: 全部源码未检出 `connection_limit` → warn。
- **对应门禁**: fw_prisma_connection_limit(warn)

```verify
id: prisma-r6
cmd: 
expect: always
```

### 规律：对外暴露的主键避免 autoincrement 可枚举，用 uuid/cuid
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `Int @id @default(autoincrement())` 主键顺序可枚举——URL 里暴露即被遍历爬取/推断业务量（IDOR 面）。对外 API 暴露的资源主键用 `String @id @default(uuid())`/`cuid()`；自增 id 可作内部聚簇键但不出接口。
- **违反后果**: 资源被顺序遍历爬取 CWE-639；业务量可推断。
- **验证方法**: schema 检出 `Int[[:space:]]+@id[[:space:]]+@default\(autoincrement\(\)\)` → warn。
- **对应门禁**: fw_prisma_id_strategy(warn)

```verify
id: prisma-r7
cmd: 
expect: always
```

### 规律：@relation 必须显式 onDelete/onUpdate 参照动作，禁止依赖默认
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `@relation(fields: [authorId], references: [id])` 不显式声明 `onDelete` 时按数据库默认（通常 NoAction/Restrict）——父记录删除被拒或行为因库而异。须按业务显式：`Cascade`（从属随主删）/`SetNull`（保留孤儿置空，字段须可选）/`Restrict`。
- **违反后果**: 删除行为跨库不一致；误配 Cascade 级联误删；NoAction 导致删除 500。
- **验证方法**: schema 中 `@relation(` 行未含 `onDelete` → warn。
- **对应门禁**: fw_prisma_relation_cascade(warn)

```verify
id: prisma-r8
cmd: 
expect: always
```

### 规律：关系标量外键与高频过滤字段须 @@index
- **适用版本**: Prisma 6.x / 7.x
- **规律**: Prisma 不自动为 `@relation(fields: [userId])` 的关系标量建索引（部分库 InnoDB 会自动建，Postgres 不会）。按 `where: { userId }` 反查无索引走全表扫描。须显式 `@@index([userId])`；高频过滤/排序字段同理。
- **违反后果**: 关联反查全表扫描，慢查询拖垮库。
- **验证方法**: schema 含 `@relation(fields:` 但无 `@@index` → warn。
- **对应门禁**: fw_prisma_relation_index(warn)

```verify
id: prisma-r9
cmd: 
expect: always
```

### 规律：中间件 $use 已移除（v7），软删除/审计逻辑改 Client Extensions $extends
- **适用版本**: Prisma 7.x 移除；6.x 已 deprecated（v7 升级指南已核实）
- **规律**: Prisma v7 移除 client 中间件 API（`prisma.$use`），官方替代为 Client Extensions（`$extends`）的 query 组件。软删除（delete→update 置 deletedAt）、审计字段自动填充、读写分离路由都应经 `$extends` 实现。新代码禁止 `$use`。
- **违反后果**: 升级 v7 编译/运行失败；$use 链式中间件性能差且顺序敏感。
- **验证方法**: `grep -rnE '\.\$use\(' --include='*.ts' --include='*.js'` 命中 → warn。
- **对应门禁**: fw_prisma_middleware_removed(warn)

```verify
id: prisma-r10
cmd: grep -rnE '\.\$use\(' --include='*.ts' --include='*.js' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：模型须含 createdAt/updatedAt 审计字段（@default(now())/@updatedAt）
- **适用版本**: Prisma 6.x / 7.x
- **规律**: 业务表（除纯关联表/日志表）应声明 `createdAt DateTime @default(now())` 与 `updatedAt DateTime @updatedAt`，由 Prisma 自动维护。应用层手填存在时钟漂移与遗漏。
- **违反后果**: 审计时间缺失/不准 → 追溯无据。
- **验证方法**: 含 `model ` 块的 schema 未含 `createdAt|updatedAt` → warn。
- **对应门禁**: fw_prisma_audit_fields(warn)

```verify
id: prisma-r11
cmd: 
expect: always
```

### 规律：generator 必须显式 output 输出路径（v7 强制）
- **适用版本**: Prisma 7.x 强制；6.x 建议（v7 升级指南已核实）
- **规律**: v7 新 `prisma-client` provider（Rust-free）要求 `output` 必填——client 不再默认生成进 node_modules，须指定如 `output = "../src/generated/prisma"`，import 路径同步指向自定义输出。v6 的 `prisma-client-js` 默认 node_modules 行为在 v7 废止。
- **违反后果**: v7 下 generate 报错；或生成位置与 import 路径不一致 → 运行期模块找不到。
- **验证方法**: schema `generator` 块未含 `output` → warn。
- **对应门禁**: fw_prisma_generator_output(warn)

```verify
id: prisma-r12
cmd: 
expect: always
```

### 规律：生产禁止 log: ['query'] 全量查询日志
- **适用版本**: Prisma 6.x / 7.x
- **规律**: `new PrismaClient({ log: ['query'] })` 打印每条 SQL 及参数——生产日志量爆炸且泄露查询中的敏感值。生产用 `['warn', 'error']`；慢查询排查走 `log: [{ emit: 'event', level: 'query' }]` 事件按需采样。
- **违反后果**: 敏感查询值入日志 CWE-532；日志成本爆炸。
- **验证方法**: `grep -rnE "log[[:space:]]*:[[:space:]]*\[[^]]*'query'" --include='*.ts' --include='*.js'` 命中 → warn。
- **对应门禁**: fw_prisma_query_log(warn)

```verify
id: prisma-r13
cmd: grep -rnE "log[[:space:]]*:[[:space:]]*\[[^]]*'query'" --include='*.ts' --include='*.js' "${PROJECT_DIR}"
expect: hits>0
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id 或"人工检查"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_prisma_migrate_deploy | fail | Dockerfile/*.sh 检出 prisma migrate dev → fail 生产禁 dev 迁移 | PRISMA_SRC_GLOBS | CWE-672 |
| fw_prisma_transaction_timeout | warn | 含 $transaction(async 文件无 timeout: → warn 默认 5s 超时风险 | PRISMA_SRC_GLOBS | — |
| fw_prisma_n1_loop | warn | 同文件 for( + await prisma. → warn 循环内查询 N+1 | PRISMA_SRC_GLOBS | — |
| fw_prisma_queryraw_injection | fail | $queryRawUnsafe/$executeRawUnsafe 或 $queryRaw(...) 同行 + 拼接 → fail SQL 注入 CWE-89 | PRISMA_SRC_GLOBS | CWE-89；GB/T 38674-2020 §5.1 |
| fw_prisma_connection_limit | warn | 全部源码未检出 connection_limit → warn 池未规划 | PRISMA_SCHEMA_GLOBS PRISMA_SRC_GLOBS | — |
| fw_prisma_id_strategy | warn | Int @id @default(autoincrement()) → warn 主键可枚举 CWE-639 | PRISMA_SCHEMA_GLOBS | CWE-639 |
| fw_prisma_relation_cascade | warn | @relation( 行无 onDelete → warn 参照动作未显式 | PRISMA_SCHEMA_GLOBS | — |
| fw_prisma_relation_index | warn | 含 @relation(fields: 无 @@index → warn 外键无索引 | PRISMA_SCHEMA_GLOBS | — |
| fw_prisma_middleware_removed | warn | 检出 .$use( → warn v7 已移除中间件 | PRISMA_SRC_GLOBS | — |
| fw_prisma_audit_fields | warn | 含 model 块无 createdAt/updatedAt → warn | PRISMA_SCHEMA_GLOBS | — |
| fw_prisma_generator_output | warn | generator 块无 output → warn v7 必填 | PRISMA_SCHEMA_GLOBS | — |
| fw_prisma_query_log | warn | log: ['query'] → warn 生产查询日志泄露 CWE-532 | PRISMA_SRC_GLOBS | CWE-532 |

<!--
门禁 id 命名规范：fw_prisma_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/prisma.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_prisma_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: prisma  requires_conf: PRISMA_SCHEMA_GLOBS PRISMA_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含手改已应用迁移（证据件）+ $queryRawUnsafe 拼接 + 循环 N+1
+ Dockerfile migrate dev → migrate_deploy/queryraw_injection fail 主触发（2/2 已断言）；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| prisma × nestjs | PrismaService 须 onModuleInit $connect + enableShutdownHooks | 进程退出不断开连接 → 连接泄漏 |
| prisma × fastify/express | PrismaClient 单例挂载（装饰器/模块单例），禁止每请求 new PrismaClient | 每请求建 client → 连接池爆炸 |
| prisma × serverless 框架 | serverless 部署须 connection_limit=1 或 Accelerate/PgBouncer | 冷启动并发建连打满库 |
| prisma × zod | DTO 校验用 zod（prisma-zod-generator 等派生 schema），勿把 Prisma 模型类型直接当输入类型 | 输入白名单与持久化模型须解耦 CWE-20 |

<!--
本表聚焦 prisma 生态内高频组合；无强交互的框架组合省略。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Prisma 7.0 | prisma-client 新 provider（Rust-free）；output 必填；driver adapters 必填；中间件 $use 移除；prisma.config.ts 默认；ESM-only；Node ≥20.19（v7 升级指南 2026-07 核实） | v6 → v7 须改 generator/import/adapter/中间件；MongoDB v7 暂不支持（须留 v6） |
| Prisma 7.x | 7.8.0 为 latest 主线（2026-07-17 核实 GitHub releases） | 新项目直接上 7.x |
| Prisma 6.x | 维护线（6.19.3 为 2026-07 最新补丁），仅安全/修复 | 无新特性；规划升 7 |
| Prisma 6.x → 7.x | datasource 块 url/directUrl 弃用 → 移入 prisma.config.ts；env 不再自动加载（须 dotenv） | 升级后 CLI 读不到 DATABASE_URL |
| 交互式事务 | 默认 maxWait=2s / timeout=5s，超时 P2028 | 长事务必须显式 timeout |
| migrate dev vs deploy | dev 交互式、漂移检测、（v6）自动 generate/seed；deploy 仅应用、无交互 | 生产用 dev → reset 提示挂死/清库风险 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
