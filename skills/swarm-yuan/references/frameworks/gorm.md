---
ruleset_id: gorm
适用版本: GORM v1.25.x ~ v1.31.x（v1.31.2 为 2026-07 调研时点最新稳定版；1.25+ 差异单独标注）
最后调研: 2026-07-17（来源：https://github.com/go-gorm/gorm/releases ；https://gorm.io/docs/ ；https://gorm.io/docs/delete.html ；https://gorm.io/docs/transactions.html ）
深度门槛: 10
---

# GORM 规则集

<!--
本规则集覆盖 GORM v1.25.x ~ v1.31.x。v1.31.2 为调研时点最新稳定版。
调研时点：2026-07-17。软删除（gorm.DeletedAt 自动过滤 deleted_at IS NULL、Unscoped 绕过）
出自官方 docs/delete.html；嵌套事务/Save Point/Rollback To 在官方 Overview 与 transactions 文档列明。
无法联网核实的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `gorm.io/gorm` / `gorm.io/driver/mysql` / `gorm.io/driver/postgres` / `gorm.io/driver/sqlite` / `gorm.io/driver/sqlserver` | 高 |
| 文件 | `**/go.mod` 含 `gorm.io/gorm` | 高 |
| 配置 | 无独立配置文件（DSN 走代码/env） | — |
| 代码 | `gorm.Open(` / `gorm.DB` / `db.AutoMigrate(` / `db.Preload(` / `db.Transaction(` / `db.Model(` / `db.Create(` / `db.First(` / `db.Find(` / `gorm.Model` / `gorm.DeletedAt` / `errors.Is(err, gorm.ErrRecordNotFound)` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 gorm 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 模型结构体：`grep -rnE 'type[[:space:]]+[A-Z][A-Za-z0-9_]*[[:space:]]+struct' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：struct 定义数；含 gorm 标签的为 GORM 模型子集）
- Preload 调用：`grep -rnE '\.Preload\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：Preload 行数，用于 N+1 风险评估对比）
- 事务块：`grep -rnE '\.Transaction\(|\.Begin\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：事务块数）
- AutoMigrate 调用：`grep -rnE '\.AutoMigrate\(' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：AutoMigrate 调用数）
- 连接池配置：`grep -rnE 'SetMaxOpenConns|SetMaxIdleConns|SetConnMaxLifetime' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：连接池配置行数）
- 软删除字段：`grep -rnE 'gorm\.DeletedAt' "${PROJECT_DIR}" --include='*.go'`（计数核验基准：软删除模型数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：关联查询须用 Preload/Joins，禁用循环内逐条查询（N+1）
- **适用版本**: GORM v1.25+ 全版本
- **规律**: 遍历主列表后逐条 `db.First(&child, parent.ChildID)` 或 `db.Find(&items, "parent_id = ?", parent.ID)` 会产生 N+1 查询（1 次主查询 + N 次子查询）。须用 `db.Preload("Child").Find(&parents)` 一次性加载，或 `db.Joins("Child")` 用 JOIN。N+1 在 N 大时查询数线性膨胀，DB 压力与延迟激增。
- **违反后果**: 查询数线性膨胀 → DB 连接耗尽、RT 飙升、慢查询日志爆炸。
- **验证方法**: 检出 `for ... range` 循环体内含 `db.First(`/`db.Find(`/`db.Where(` 查询调用，且同文件无 `Preload(`/`Joins(` → fail。
- **对应门禁**: fw_gorm_n_plus_one(fail)

```verify
id: gorm-r1
cmd: 
expect: always
```

### 规律：嵌套事务依赖 SavePoint，禁用手动 Begin 嵌套
- **适用版本**: GORM v1.25+ 全版本
- **规律**: GORM `db.Transaction(func(tx *gorm.DB) error { ... })` 嵌套调用时自动用 SavePoint（内层失败 RollbackTo SavePoint，外层仍可继续/回滚）。手动 `db.Begin()` 嵌套不支持 SavePoint，内层 Rollback 会回滚整个外层事务。生产须统一用 `Transaction` 闭包，禁用手动 `Begin/Commit/Rollback` 嵌套。
- **违反后果**: 手动 Begin 嵌套 → 内层回滚污染外层事务，部分提交/全回滚语义错乱。
- **验证方法**: 检出 `\.Begin\(` 且同文件存在嵌套 `Transaction(` 调用，或 `Begin(` 后无配对 `Commit(`/`Rollback(` → warn。
- **对应门禁**: fw_gorm_nested_transaction(warn)

```verify
id: gorm-r2
cmd: 
expect: always
```

### 规律：软删除须用 gorm.DeletedAt，查询自动过滤已删除记录
- **适用版本**: GORM v1.25+ 全版本
- **规律**: 模型含 `gorm.DeletedAt` 字段后，`db.Delete(&model, id)` 不物理删除而是 `UPDATE SET deleted_at = now()`，所有 `Find/First/Where` 自动追加 `WHERE deleted_at IS NULL`。须用 `Unscoped()` 才能查到已删除记录。自定义软删除字段（非 `gorm.DeletedAt`）不会自动过滤，须显式 WHERE，易漏。
- **违反后果**: 自定义软删除字段无自动过滤 → 已删除记录泄漏到查询结果；误用 `Unscoped()` → 软删除失效。
- **验证方法**: 检出模型含 `DeletedAt` 字段但类型非 `gorm.DeletedAt`（如 `time.Time`/`*time.Time` 且无 `gorm.DeletedAt` 嵌入）且无 `WHERE deleted_at` 显式过滤 → warn。
- **对应门禁**: fw_gorm_soft_delete(warn)

```verify
id: gorm-r3
cmd: 
expect: always
```

### 规律：生产须配连接池 SetMaxOpenConns/SetMaxIdleConns/SetConnMaxLifetime
- **适用版本**: GORM v1.25+ 全版本（搭配 database/sql）
- **规律**: `gorm.Open` 返回的 `*gorm.DB` 须 `sqlDB, _ := db.DB(); sqlDB.SetMaxOpenConns(N); sqlDB.SetMaxIdleConns(M); sqlDB.SetConnMaxLifetime(d)`。不配则用 database/sql 默认（MaxOpenConns=0=无限制、MaxIdleConns=2），高并发下要么打爆 DB 连接数要么 idle 连接过少反复建连。
- **违反后果**: 连接数失控 → DB 连接被打爆（Too many connections）；或 idle 过少 → 反复 TCP/TLS 握手延迟。
- **验证方法**: 检出 `gorm.Open(` 但同项目无 `SetMaxOpenConns` → fail。
- **对应门禁**: fw_gorm_conn_pool(fail)

```verify
id: gorm-r4
cmd: 
expect: always
```

### 规律：SQL 审计须用 DryRun Session 预生成 SQL，禁用直接打印
- **适用版本**: GORM v1.25+ 全版本
- **规律**: `db.Session(&gorm.Session{DryRun: true}).Find(&model).Statement.SQL.String()` 可在 DryRun 模式下生成 SQL 不执行，用于审计/慢 SQL 排查。生产用 `logger.Default.LogMode(logger.Warn)` 控制日志级别，禁用 `LogMode(logger.Info)` 打印全部 SQL（含参数值，敏感信息泄露 + 日志量爆炸）。
- **违反后果**: LogMode(Info) → 敏感参数（手机号/密码 hash）进日志 CWE-532；日志量爆炸。
- **验证方法**: 检出 `LogMode[[:space:]]*\([[:space:]]*logger\.Info` 或 `LogMode[[:space:]]*\([[:space:]]*logger\.Silent` → warn（Silent 会吞错误）。
- **对应门禁**: fw_gorm_dryrun_audit(warn)

```verify
id: gorm-r5
cmd: 
expect: always
```

### 规律：模型约定嵌入 gorm.Model（ID/CreatedAt/UpdatedAt/DeletedAt）
- **适用版本**: GORM v1.25+ 全版本
- **规律**: GORM 约定主键 `ID`、创建时间 `CreatedAt`、更新时间 `UpdatedAt`（自动维护）、软删除 `DeletedAt`。嵌入 `gorm.Model` 一次性获得四字段。自定义主键须 `gorm:"primaryKey"` 显式声明，否则 GORM 按 `ID` 约定找不到主键。`UpdatedAt` 自动更新，手动 set 会被覆盖。
- **违反后果**: 无主键 → `First` 查询用 `ORDER BY id LIMIT 1` 找不到主键报错；无 CreatedAt/UpdatedAt → 缺审计时间。
- **验证方法**: 检出 GORM 模型结构体（含 `gorm:"` 标签）但既无 `gorm.Model` 嵌入、无 `ID` 字段、也无 `gorm:"primaryKey"` 标签 → warn。
- **对应门禁**: fw_gorm_model_convention(warn)

```verify
id: gorm-r6
cmd: 
expect: always
```

### 规律：生产禁用 AutoMigrate 做表结构变更，须用 migration 工具
- **适用版本**: GORM v1.25+ 全版本
- **规律**: `db.AutoMigrate(&Model{})` 只能加列/加索引/加表，不能删列/改类型/改约束，且无回滚。生产用它做表结构变更会导致：多实例并发迁移竞态、迁移失败留半拉子表、无法 review/回滚。生产须用独立 migration 工具（golang-migrate / atlas / goose）或 DBA 审核 SQL。AutoMigrate 仅适合 dev/test。
- **违反后果**: 生产 AutoMigrate 竞态 → 表结构不一致；失败无回滚 → 半拉子表。
- **验证方法**: 检出 `AutoMigrate(` 调用且文件路径含 `main.go`/`cmd/`/`server/`（生产入口）→ warn；或同项目无 migration 目录且 AutoMigrate 在非 _test.go → warn。
- **对应门禁**: fw_gorm_automigrate_prod(warn)

```verify
id: gorm-r7
cmd: 
expect: always
```

### 规律：批量插入须用 CreateInBatches，禁用循环单条 Create
- **适用版本**: GORM v1.25+ 全版本
- **规律**: 循环 `for _, m := range items { db.Create(&m) }` 产生 N 次 INSERT，往返延迟线性累加。须 `db.CreateInBatches(items, 1000)` 分批插入（每批一条 INSERT 多 VALUES）。单批过大（>数千行）会触发 `max_allowed_packet` 或参数绑定上限，须控制 batch size（1000 量级）。
- **违反后果**: 循环单条 Create → N 次 RTT，批量导入耗时从秒级到分钟级。
- **验证方法**: 检出 `for ... range` 循环体内含 `\.Create\(` 单条插入，且同项目无 `CreateInBatches(` → warn。
- **对应门禁**: fw_gorm_batch_insert(warn)

```verify
id: gorm-r8
cmd: 
expect: always
```

### 规律：查询单条须用 First，空结果须用 errors.Is(err, gorm.ErrRecordNotFound)
- **适用版本**: GORM v1.25+ 全版本
- **规律**: `db.First(&model, id)` 找不到记录返回 `gorm.ErrRecordNotFound`，须 `errors.Is(err, gorm.ErrRecordNotFound)` 判断"无记录"（业务上常为正常态），不应作为 error 上抛。`Find` 无记录不报错（返回空切片）。误用 `Find` 取单条无法区分"无记录"与"有多条取首条"。
- **违反后果**: ErrRecordNotFound 未判断 → 空记录当 500 报错；误用 Find 取单条 → 多条记录静默取首条。
- **验证方法**: 检出 `\.First\(` 但同项目无 `ErrRecordNotFound` → warn。
- **对应门禁**: fw_gorm_record_not_found(warn)

```verify
id: gorm-r9
cmd: 
expect: always
```

### 规律：索引须显式 gorm:"index" 标签，禁用依赖 AutoMigrate 自动建索引
- **适用版本**: GORM v1.25+ 全版本
- **规律**: 高频查询字段（外键、状态、时间范围）须显式 `gorm:"index"` 或 `gorm:"index:idx_name"` 标签声明索引。仅靠 AutoMigrate 自动建索引（只对外键建索引）会漏掉业务查询字段，导致全表扫描。复合索引须 `gorm:"index:idx_name,priority:1"` 指定列顺序。
- **违反后果**: 漏索引 → 查询全表扫描，表大了之后慢查询。
- **验证方法**: 检出 `db.Where(` 查询字段，但对应模型字段无 `gorm:"index` 标签 → warn（启发式，仅提示高频字段）。
- **对应门禁**: fw_gorm_index(warn)

```verify
id: gorm-r10
cmd: 
expect: always
```

### 规律：错误处理须区分 ErrRecordNotFound 与真实 DB 错误
- **适用版本**: GORM v1.25+ 全版本
- **规律**: `db.Error` 涵盖所有 DB 错误（连接断开、约束冲突、死锁等），须区分处理：`ErrRecordNotFound` 是业务态，`ErrDuplicatedKey` 须翻译为"已存在"，`ErrInvalidDB/连接错误`须重试或熔断。一刀切 `if err != nil { return 500 }` 会把"无记录"当 500。
- **违反后果**: 无记录当 500 → 前端误显示系统错误；死锁不当重试 → 用户偶发失败。
- **验证方法**: 检出 `db.Error` 或 `if err != nil` 紧邻 GORM 查询，但同项目无 `ErrRecordNotFound`/`ErrDuplicatedKey` 判断 → warn。
- **对应门禁**: fw_gorm_error_handling(warn)

```verify
id: gorm-r11
cmd: 
expect: always
```

### 规律：关联模式须显式声明外键与引用，禁用依赖 GORM 约定推断歧义
- **适用版本**: GORM v1.25+ 全版本
- **规律**: `belongs_to`/`has_many`/`has_one`/`many2many` 关联须显式 `gorm:"foreignKey:XXX;references:YYY"` 声明外键与引用字段。依赖 GORM 约定（如 `UserID` 推断 `User.ID`）在多外键或非标准命名时产生歧义，Preload 加载错关联。
- **违反后果**: 关联推断歧义 → Preload 加载错误关联数据。
- **验证方法**: 检出模型结构体含多个以 `ID` 结尾的字段（潜在多外键）但关联字段无 `foreignKey:` 标签 → warn。
- **对应门禁**: fw_gorm_association(warn)

```verify
id: gorm-r12
cmd: 
expect: always
```

### 规律：命名约定表名蛇形复数，自定义须 TableName() 全局一致
- **适用版本**: GORM v1.25+ 全版本
- **规律**: GORM 默认表名蛇形复数（`User` → `users`）。自定义表名须实现 `TableName() string` 接口或 `gorm.Config{NamingStrategy: schema.NamingStrategy{TablePrefix: "t_"}}`。混用（部分模型 TableName 部分 prefix）会导致表名不一致、查询错表。
- **违反后果**: 表名不一致 → 查询错表 / 表不存在。
- **验证方法**: 检出 `TableName()` 方法但同项目无 `NamingStrategy` 配置，或检出 `NamingStrategy` 配置但部分模型仍手写 `TableName()` → warn。
- **对应门禁**: fw_gorm_naming(warn)

```verify
id: gorm-r13
cmd: 
expect: always
```

<!--
共 13 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_gorm_n_plus_one | fail | for-range 循环内 db.First/Find/Where 且无 Preload/Joins → fail | GORM_SRC_GLOBS | — |
| fw_gorm_nested_transaction | warn | Begin( 嵌套或无配对 Commit/Rollback → warn | GORM_SRC_GLOBS | — |
| fw_gorm_soft_delete | warn | 软删除字段非 gorm.DeletedAt 且无显式 WHERE → warn | GORM_SRC_GLOBS | — |
| fw_gorm_conn_pool | fail | gorm.Open( 无 SetMaxOpenConns → fail | GORM_SRC_GLOBS | CWE-770 |
| fw_gorm_dryrun_audit | warn | LogMode(logger.Info/Silent) → warn | GORM_SRC_GLOBS | CWE-532；GB/T 38674-2020 §5.4 |
| fw_gorm_model_convention | warn | GORM 模型无主键声明 → warn | GORM_SRC_GLOBS | — |
| fw_gorm_automigrate_prod | warn | AutoMigrate( 在生产入口/非测试 → warn | GORM_SRC_GLOBS | — |
| fw_gorm_batch_insert | warn | for-range 内 Create( 单条且无 CreateInBatches → warn | GORM_SRC_GLOBS | — |
| fw_gorm_record_not_found | warn | First( 无 ErrRecordNotFound 判断 → warn | GORM_SRC_GLOBS | — |
| fw_gorm_index | warn | Where( 查询字段对应模型字段无 gorm:index → warn | GORM_SRC_GLOBS | — |
| fw_gorm_error_handling | warn | db.Error 无 ErrRecordNotFound/ErrDuplicatedKey 判断 → warn | GORM_SRC_GLOBS | — |
| fw_gorm_association | warn | 多 ID 字段关联无 foreignKey 标签 → warn | GORM_SRC_GLOBS | — |
| fw_gorm_naming | warn | TableName 与 NamingStrategy 混用 → warn | GORM_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_gorm_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/gorm.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_gorm_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: gorm  requires_conf: GORM_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 for-range 内 Find（N+1）+ AutoMigrate 在 main.go + gorm.Open 无连接池 → n_plus_one/automigrate_prod/conn_pool 主触发；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| gorm × gin | 查询须 `db.WithContext(c.Request.Context())`，请求取消时 DB 查询自动取消 | 否则客户端断开后 DB 查询仍跑，浪费连接池 |
| gorm × mysql | DSN 须 `parseTime=true&loc=Local&charset=utf8mb4`，否则时间解析错乱 | 默认不 parse time，`time.Time` 字段读出零值 |
| gorm × redis | 缓存写入须在事务 commit 后，禁用事务内写缓存 | 事务回滚后缓存已写 → 缓存与 DB 不一致 |
| gorm × sharding | 分片表查询 WHERE 须含分片键，Preload 须走分片路由 | 否则跨库广播扫描 |

<!--
无强交互的框架组合省略；本表聚焦 gorm 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| GORM v1.25.0 | `clause.OnConflict` 稳定；`CreateInBatches` 支持 Returning（待验证具体引入版本） | 规律照旧 |
| GORM v1.30.x | `Schema` 解析性能优化；`dryrun` 模式 SQL 拼接修正（待验证具体版本号） | 待验证：v1.30 具体子版本号 |
| GORM v1.31.0 | `clause.Returning` 与 `CreateInBatches` 配合 panic 修复（v1.31.2 fix） | v1.31.0/1.31.1 用 CreateInBatches+Returning 须升级到 1.31.2 |
| GORM v1.31.2 | 调研时点最新稳定版（2026-07） | 规律照旧 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
