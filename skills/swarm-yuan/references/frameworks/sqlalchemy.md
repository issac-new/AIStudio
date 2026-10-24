---
ruleset_id: sqlalchemy
适用版本: SQLAlchemy 2.0.x（2026-07 现行 2.0.51；差异单独标注）
最后调研: 2026-07-17（来源：https://pypi.org/pypi/SQLAlchemy/json ；https://docs.sqlalchemy.org/en/20/ ；https://docs.sqlalchemy.org/en/20/orm/queryguide/index.html ；https://docs.sqlalchemy.org/en/20/core/pooling.html ）
深度门槛: 10
---

# SQLAlchemy 规则集

<!--
本规则集覆盖 SQLAlchemy 2.0.x（2026-07 现行 2.0.51）。2.0 起 query() 遗产 API 标记 legacy，
select() 为唯一推荐查询入口。
调研时点：2026-07-17。SQLAlchemy 2.1 破坏性变更清单：待验证（2.1 处于开发分支，未逐条核实）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `SQLAlchemy` / `sqlalchemy`（requirements.txt / pyproject.toml） | 高 |
| 代码 | `from sqlalchemy import` / `create_engine(` / `sessionmaker(` / `declarative_base` / `DeclarativeBase` | 高 |
| 代码 | `select(` + `Mapped[` / `mapped_column(` | 中（2.x 特征，需组合） |
| 文件 | `**/alembic.ini` / `**/alembic/env.py` / `**/alembic/versions/` | 高 |
| 配置 | `pool_size` / `pool_recycle` / `SQLALCHEMY_DATABASE_URI` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 sqlalchemy 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- ORM 模型：`grep -rnE 'class [A-Za-z_]+\((Base|db\.Model|DeclarativeBase)\)' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：模型类数）
- 关系定义：`grep -rnE 'relationship\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：relationship 行数）
- 引擎创建：`grep -rnE 'create_engine\(|create_async_engine\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- 会话构造：`grep -rnE 'sessionmaker\(|scoped_session\(|async_sessionmaker\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- Alembic 迁移：`find "${PROJECT_DIR}" -path '*/alembic/versions/*.py'`（计数核验基准：迁移文件数）
- 原生 SQL：`grep -rnE 'text\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：text( 命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：1.x session.query() 风格须迁移 2.x select() 查询构造
- **适用版本**: SQLAlchemy 2.0.x
- **规律**: 2.0 起 `session.query(Model)` 为 legacy API；统一入口为 `select(Model)` + `session.scalars(stmt).all()` / `session.execute(stmt)`。query() 的 `.filter_by/.one/.get` 在 2.x 均有 select 等价物（`where`、`scalar_one()`、`session.get(Model, id)`）。
- **违反后果**: 遗留 API 在后续大版本移除；新旧风格混用团队认知分裂。
- **验证方法**: 检出 `session.query(` → warn。
- **对应门禁**: fw_sa_legacy_query(warn)

```verify
id: sqlalchemy-r1
cmd: 
expect: always
```

### 规律：session 关闭/提交后访问未加载关联将抛 DetachedInstanceError
- **适用版本**: 全版本（2.0.x 同）
- **规律**: 默认 `expire_on_commit=True`，commit 后实例属性过期，访问触发懒加载；session 已 close/出 with 块时懒加载直接抛 `DetachedInstanceError`。返回 ORM 对象前须用 selectinload/joinedload 预加载全部将访问的关联，或 `expire_on_commit=False`，或只返回 DTO/标量。
- **违反后果**: 运行期 DetachedInstanceError，请求 500。
- **验证方法**: 显式 `session.close()` 或 with-Session 块内 return ORM 对象且无加载策略 → warn。
- **对应门禁**: fw_sa_detached(warn)

```verify
id: sqlalchemy-r2
cmd: 
expect: always
```

### 规律：连接池须配 pool_recycle 或 pool_pre_ping，防 wait_timeout 断连
- **适用版本**: 全版本
- **规律**: MySQL 默认 `wait_timeout=28800s`（8h），空闲连接被服务端切断后池内连接成死连接，下次检出即 `Lost connection`。`pool_recycle=1800`（小于 wait_timeout）定期重建；`pool_pre_ping=True` 检出时探活（每次 checkout 多一次轻量 ping）。生产至少配其一。
- **违反后果**: 隔夜/低峰后首批请求报错。
- **验证方法**: create_engine 无 `pool_recycle|pool_pre_ping` → warn。
- **对应门禁**: fw_sa_pool_recycle(warn)

```verify
id: sqlalchemy-r3
cmd: 
expect: always
```

### 规律：relationship 遍历须配加载策略（selectinload/joinedload/subqueryload）
- **适用版本**: 全版本
- **规律**: 默认 `lazy="select"` 每次访问关联发一条 SQL；列表遍历即 N+1。查询侧 `.options(selectinload(Order.customer))`（集合用 selectinload，多对一可用 joinedload）；或模型侧 `lazy="selectin"`。joinedload 对集合会放大行积须谨慎。
- **违反后果**: N+1 查询风暴，响应随数据量线性恶化。
- **验证方法**: 含 `relationship(` 的文件无 `selectinload|joinedload|subqueryload|lazy=` → warn。
- **对应门禁**: fw_sa_nplusone(warn)

```verify
id: sqlalchemy-r4
cmd: 
expect: always
```

### 规律：create_engine URL 禁止明文凭据，须环境变量注入
- **适用版本**: 全版本
- **规律**: `create_engine("postgresql://user:pass@host/db")` 明文口令进版本库即泄露。连接串须 `os.environ["DATABASE_URL"]` 注入或 `URL.create(...)` 组合密钥管理服务下发的字段。
- **违反后果**: 数据库凭据泄露（CWE-798），拖库风险。
- **验证方法**: 检出 `scheme://user:pass@` 字面量 → fail。
- **对应门禁**: fw_sa_engine_credentials(fail)

```verify
id: sqlalchemy-r5
cmd: 
expect: always
```

### 规律：批量插入禁 for 循环逐条 session.add，须 bulk_insert_mappings
- **适用版本**: 全版本
- **规律**: 循环 `session.add(obj)` 逐条 flush 产生 N 次 INSERT 往返。批量场景用 `session.bulk_insert_mappings(Model, rows)` / `bulk_save_objects` / 2.x `insert(Model).values(rows)`；须 ORM 事件/自增主键回取时至少 `add_all` + 单次 commit。
- **违反后果**: 批量导入耗时随 N 线性膨胀，连接占满。
- **验证方法**: 文件含 for 循环 + `.add(` 且无 `bulk_insert_mappings|bulk_save_objects|add_all(` → warn。
- **对应门禁**: fw_sa_bulk_insert(warn)

```verify
id: sqlalchemy-r6
cmd: 
expect: always
```

### 规律：写操作须有明确事务边界（commit/rollback/begin）
- **适用版本**: 全版本
- **规律**: session 默认 autobegin；写后不 commit 则连接归还时事务回滚，写入静默丢失。须 `with SessionLocal() as s: s.add(...); s.commit()`，异常路径 `s.rollback()`；或 `with session.begin():` 块自动提交/回滚。
- **违反后果**: 写入丢失难以排查；悬挂事务占锁。
- **验证方法**: 文件含 `.add(|.delete(` 但无 `.commit(|.rollback(|.begin(` → warn。
- **对应门禁**: fw_sa_transaction_boundary(warn)

```verify
id: sqlalchemy-r7
cmd: 
expect: always
```

### 规律：scoped_session 须在请求/任务边界 remove()
- **适用版本**: 全版本
- **规律**: `scoped_session` 按线程/上下文注册会话；边界结束不 `remove()` 则会话（含连接）滞留注册表，线程复用时拿到脏会话。Web 框架在 teardown 钩子 remove；任务队列在每任务 finally remove。
- **违反后果**: 连接泄漏、跨请求脏数据。
- **验证方法**: 检出 `scoped_session(` 但无 `.remove()` → warn。
- **对应门禁**: fw_sa_scoped_session(warn)

```verify
id: sqlalchemy-r8
cmd: 
expect: always
```

### 规律：ForeignKey 列须显式 index=True（PostgreSQL 不自动建索引）
- **适用版本**: 全版本
- **规律**: MySQL InnoDB 自动为 FK 建索引，PostgreSQL 不建。FK 列无索引时 JOIN 与父表删除/更新（子表反查）全表扫描。所有 `ForeignKey` 列须 `index=True` 或纳入复合索引。
- **违反后果**: PG 库 JOIN/级联删除随数据量退化为全表扫。
- **验证方法**: `ForeignKey(` 行无 `index=` → warn。
- **对应门禁**: fw_sa_fk_index(warn)

```verify
id: sqlalchemy-r9
cmd: 
expect: always
```

### 规律：schema 演进须 Alembic 迁移管理，create_all 不得替代
- **适用版本**: 全版本（Alembic 现行）
- **规律**: `Base.metadata.create_all(engine)` 只建不存在的表，不改已有表结构——列变更/索引增删全部静默跳过。生产 schema 演进必须 Alembic 版本化迁移（`alembic revision --autogenerate` + `upgrade head`），create_all 仅限测试。
- **违反后果**: 环境与模型漂移，运行期 column does not exist。
- **验证方法**: 检出 `create_all(` 且无 alembic env.py → warn。
- **对应门禁**: fw_sa_alembic(warn)

```verify
id: sqlalchemy-r10
cmd: 
expect: always
```

### 规律：连接池大小须按并发显式配置（pool_size/max_overflow）
- **适用版本**: 全版本
- **规律**: 默认 `pool_size=5`、`max_overflow=10`（共 15 连接）。worker 数 × 每 worker 并发超出即排队超时 `QueuePool limit ... overflow reached`。须按部署拓扑（gunicorn workers × 线程）显式配置并与数据库 max_connections 预算对齐。
- **违反后果**: 高并发下连接池耗尽，请求超时。
- **验证方法**: create_engine 无 `pool_size|NullPool|StaticPool` → warn。
- **对应门禁**: fw_sa_pool_size(warn)

```verify
id: sqlalchemy-r11
cmd: 
expect: always
```

### 规律：text() 原生 SQL 禁止 f-string/%/+ 拼接，须绑定参数
- **适用版本**: 全版本
- **规律**: `text(f"SELECT * FROM t WHERE x = '{x}'")` 把用户输入直接拼进 SQL。必须 `text("... WHERE x = :x").bindparams(x=value)` 或 `session.execute(text(...), {"x": value})`。列名/表名等无法绑定的位置须白名单校验。
- **违反后果**: SQL 注入（CWE-89）。
- **验证方法**: 检出 `text(f"` / `text(... % ` / `text(... + ` → fail。
- **对应门禁**: fw_sa_text_injection(fail)

```verify
id: sqlalchemy-r12
cmd: 
expect: always
```

### 规律：String 列须指定长度，跨方言才可移植
- **适用版本**: 全版本
- **规律**: 裸 `Column(String)` 在 MySQL 建表直接报错（VARCHAR 须长度），在 PG 映射为无限长 text 变体。所有 String 列须 `String(n)` 显式长度，保证跨方言可移植与索引可用性。
- **违反后果**: MySQL 部署建表失败；无长度列无法索引。
- **验证方法**: 检出 `Column(...String)` / 裸 `String,` → warn。
- **对应门禁**: fw_sa_string_length(warn)

```verify
id: sqlalchemy-r13
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
| fw_sa_legacy_query | warn | 检出 session.query( → warn 迁 2.x select() | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_detached | warn | 显式 session.close() 或 with-Session 块内 return 无加载策略 → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_pool_recycle | warn | create_engine 无 pool_recycle/pool_pre_ping → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_nplusone | warn | relationship( 文件无 selectinload/joinedload/lazy= → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_engine_credentials | fail | scheme://user:pass@ 明文连接串 → fail | SQLALCHEMY_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_sa_bulk_insert | warn | for 循环 + session.add( 无 bulk API → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_transaction_boundary | warn | .add/.delete 无 commit/rollback/begin → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_scoped_session | warn | scoped_session( 无 .remove() → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_fk_index | warn | ForeignKey( 行无 index= → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_alembic | warn | create_all( 无 alembic env.py → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_pool_size | warn | create_engine 无 pool_size → warn | SQLALCHEMY_SRC_GLOBS | — |
| fw_sa_text_injection | fail | text(f"...")/%/+ 拼接 SQL → fail | SQLALCHEMY_SRC_GLOBS | CWE-89；GB/T 38674-2020 §5.1 |
| fw_sa_string_length | warn | 裸 String 无长度 → warn | SQLALCHEMY_SRC_GLOBS | — |

<!--
门禁 id 命名规范：fw_sa_<rule>（ruleset_id 为 sqlalchemy，门禁前缀按任务约定用 fw_sa_）。
本表 13 条 id 须在 assets/framework-gates/sqlalchemy.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_sa_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: sqlalchemy  requires_conf: SQLALCHEMY_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 session 关闭后访问关联 + 明文连接串 + text(f"") 拼接 + 逐条插入 → engine_credentials/text_injection fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| sqlalchemy × flask | scoped_session 须在 teardown_appcontext remove() | 请求边界不清理 → 连接泄漏 |
| sqlalchemy × fastapi | async 路由须 AsyncSession + async engine；同步 Session 须 def 路由/线程池 | 同步 ORM 调用阻塞事件循环 |
| sqlalchemy × alembic | autogenerate 前模型须全部 import 进 env.py target_metadata | 漏 import 的模型生成 drop_table 误迁移 |
| sqlalchemy × celery | 任务内自建 sessionmaker 作用域，任务结束 remove/close | 跨任务共享 session → 脏数据 |

<!--
无强交互的框架组合省略；本表聚焦 sqlalchemy 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| SQLAlchemy 1.4 | 2.0 风格 select() 预览（future=True） | 迁移过渡期写法 |
| SQLAlchemy 2.0 | query() 转 legacy；Session.get() 替代 query.get()；autocommit 移除 | 1.x 代码须全量迁移 |
| SQLAlchemy 2.0 | 连接 URL 方言名变更（postgres:// → postgresql://） | 旧 URL 报错 |
| SQLAlchemy 2.0.51 | 2026-07 现行；2.1 破坏性变更清单待验证 | 待验证：2.1 弃用移除项未逐条核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
