---
ruleset_id: django
适用版本: Django 5.2 LTS / 6.0.x（2026-07 现行；差异单独标注）
最后调研: 2026-07-17（来源：https://www.djangoproject.com/download/ ；https://docs.djangoproject.com/en/5.2/ ；https://docs.djangoproject.com/en/6.0/ ；https://docs.djangoproject.com/en/6.0/topics/security/ ）
深度门槛: 10
---

# Django 规则集

<!--
本规则集覆盖 Django 5.2 LTS（现行 LTS，extended support 至 2028-04）与 6.0.x（2026-07 现行最新 6.0.7）。
调研时点：2026-07-17。Django 6.0 Python 支持矩阵（3.12/3.13/3.14）：待验证，未逐条核实，涉及处已标注。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `Django` / `django`（requirements.txt / pyproject.toml / Pipfile） | 高 |
| 文件 | `**/manage.py` / `**/settings.py` / `**/wsgi.py` / `**/asgi.py` | 高 |
| 代码 | `from django.` / `import django` / `django.db.models` / `models.Model` | 高 |
| 配置 | `SECRET_KEY` / `MIDDLEWARE` / `INSTALLED_APPS` / `DATABASES` / `ALLOWED_HOSTS` | 高 |
| 目录结构 | `**/migrations/`（含 `__init__.py` 与数字前缀迁移文件） | 中（需组合信号） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 django 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Model 类：`grep -rnE 'class [A-Za-z_]+\(models\.Model\)' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：Model 子类定义行数）
- 迁移文件：`find "${PROJECT_DIR}" -path '*/migrations/[0-9]*.py'`（计数核验基准：迁移文件数）
- URL 路由：`grep -rnE 'path\(|re_path\(' "${PROJECT_DIR}" --include='urls.py'`（计数核验基准：路由注册行数）
- 视图函数/类：`grep -rnE 'def [a-z_]+\(request' "${PROJECT_DIR}" --include='views.py'`（计数核验基准：视图函数数）
- 中间件配置：`grep -nE '^MIDDLEWARE' "${PROJECT_DIR}"/**/settings*.py`（计数核验基准：命中文件数）
- RunPython 数据迁移：`grep -rnE 'RunPython\(|RunSQL\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：queryset 遍历关联须 select_related / prefetch_related 消除 N+1
- **适用版本**: 全版本（5.2 LTS / 6.x 同）
- **规律**: 模板或视图循环中访问外键/多对多关联（`obj.fk.attr` / `obj.m2m.all()`）时，未优化的 queryset 每行触发一次 SQL（N+1）。单表外键用 `select_related`（JOIN），反向外键/多对多用 `prefetch_related`（二次查询 + Python 侧拼接）。列表视图、序列化器、admin list_display 是重灾区。
- **违反后果**: 列表页 N+1 → 数百次 SQL 往返，响应时间随数据量线性恶化。
- **验证方法**: `grep -rLE 'select_related|prefetch_related' $(grep -rlE '\.objects\.(all|filter|get)\(' --include='*.py')` 命中文件须人工核对是否循环访问关联 → warn。
- **对应门禁**: fw_django_nplusone(warn)

```verify
id: django-r1
cmd: grep -rLE 'select_related|prefetch_related' $(grep -rlE '\.objects\.(all|filter|get)\(' --include='*.py')
expect: hits>0
```

### 规律：多写操作须包 transaction.atomic，单请求可用 ATOMIC_REQUESTS
- **适用版本**: 全版本
- **规律**: 同一业务操作内 ≥2 次写（save/create/update/delete）须包 `with transaction.atomic():`，任一步失败整体回滚。粗粒度方案 `ATOMIC_REQUESTS=True`（每请求一事务），但长请求事务会拉长锁持有时间，推荐显式 atomic 块。atomic 嵌套形成 savepoint，内层回滚不影响外层。
- **违反后果**: 中途异常留下半提交状态（订单建了、库存没扣）。
- **验证方法**: 代码文件内写操作 ≥2 处但无 `transaction.atomic` → warn。
- **对应门禁**: fw_django_atomic(warn)

```verify
id: django-r2
cmd: 
expect: always
```

### 规律：CsrfViewMiddleware 不得移除，@csrf_exempt 仅限跨域 API 等已评估场景
- **适用版本**: 全版本
- **规律**: `django.middleware.csrf.CsrfViewMiddleware` 默认在 MIDDLEWARE 中，对所有 POST/PUT/DELETE 表单请求校验 CSRF token。移除中间件或在视图上滥用 `@csrf_exempt` 会打开 CSRF 攻击面。仅当接口走 token 认证（无 Cookie 会话）时才可豁免。
- **违反后果**: 跨站请求伪造（CWE-352），攻击者借用户会话发起非预期操作。
- **验证方法**: settings 含 MIDDLEWARE 但无 CsrfViewMiddleware，或代码检出 `@csrf_exempt` → warn。
- **对应门禁**: fw_django_csrf(warn)

```verify
id: django-r3
cmd: 
expect: always
```

### 规律：RunPython/RunSQL 数据迁移须提供反向操作，否则迁移不可回滚
- **适用版本**: 全版本
- **规律**: `migrations.RunPython(forward)` 无 `reverse_code`、`RunSQL(sql)` 无 `reverse_sql` 时，`migrate <app> <previous>` 回退直接抛 `IrreversibleError`。数据迁移必须成对写正反向函数；确无反向可用 `RunPython.noop` 显式标注。
- **违反后果**: 生产发布失败需回退 schema 时卡在数据迁移，被迫手工修库。
- **验证方法**: 迁移文件含 `RunPython(` 但无 `reverse_code`/`RunPython.noop` → warn。
- **对应门禁**: fw_django_migration_irreversible(warn)

```verify
id: django-r4
cmd: 
expect: always
```

### 规律：settings 须按环境拆分（base/dev/prod），禁止单文件 if 分支切换
- **适用版本**: 全版本
- **规律**: 单一 `settings.py` 用 `if DEBUG:` / 环境字符串分支切换配置，环境间差异不可审计、易把 dev 配置带进 prod。推荐 `settings/` 包：`base.py`（公共）+ `dev.py` / `prod.py`（`from .base import *` 覆盖），由 `DJANGO_SETTINGS_MODULE` 选择。
- **违反后果**: 环境配置串台（如 prod 用了 dev 的 DEBUG/数据库），配置漂移不可追溯。
- **验证方法**: 存在 `settings.py` 但无 `settings/base.py` → warn。
- **对应门禁**: fw_django_settings_split(warn)

```verify
id: django-r5
cmd: 
expect: always
```

### 规律：SECRET_KEY 禁止硬编码，必须经环境变量/密钥管理注入
- **适用版本**: 全版本
- **规律**: `SECRET_KEY` 用于会话签名、密码重置 token、CSRF 加密签名。硬编码进版本库即等价泄露；须 `os.environ["DJANGO_SECRET_KEY"]` 注入，泄露后须轮换（轮换使现有会话失效）。startproject 生成的 `django-insecure-...` 前缀 key 仅限本地开发。
- **违反后果**: 攻击者伪造会话/签名 cookie 接管任意账户（CWE-798）。
- **验证方法**: `SECRET_KEY = "<字面量>"` 且行内无 os.environ/getenv → fail。
- **对应门禁**: fw_django_secret_key(fail)

```verify
id: django-r6
cmd: 
expect: always
```

### 规律：生产设置禁 DEBUG=True 硬编码（dev/local/test 设置文件例外）
- **适用版本**: 全版本
- **规律**: `DEBUG=True` 时 Django 输出完整堆栈 + settings 摘要的错误页（泄露路径、配置、SQL），且静态文件处理不走安全路径。生产 settings 必须 `DEBUG = False` 或环境驱动（默认 False）。dev.py/local.py/test.py 例外。
- **违反后果**: 错误页泄露内部配置与代码路径（CWE-489），辅助攻击者定向打击。
- **验证方法**: 非 dev/local/test 设置文件检出 `DEBUG = True` 字面量 → fail。
- **对应门禁**: fw_django_debug(fail)

```verify
id: django-r7
cmd: 
expect: always
```

### 规律：ALLOWED_HOSTS 禁止空列表硬编码或 ['*']，须收敛为具体域名
- **适用版本**: 全版本
- **规律**: DEBUG=False 时 Django 校验 Host 头是否在 `ALLOWED_HOSTS`。`['*']` 关闭校验，放开 Host 头攻击（缓存投毒、密码重置链接域名伪造）。须列具体域名/子域通配（`.example.com`），或经环境变量注入。
- **违反后果**: Host 头攻击 → 密码重置邮件指向攻击者域名，窃取重置 token。
- **验证方法**: `ALLOWED_HOSTS = []` 或 `ALLOWED_HOSTS = ['*']` → warn。
- **对应门禁**: fw_django_allowed_hosts(warn)

```verify
id: django-r8
cmd: 
expect: always
```

### 规律：PASSWORD_HASHERS 禁止 MD5/SHA1 弱哈希，优先 Argon2/PBKDF2
- **适用版本**: 全版本（5.x 默认 PBKDF2，推荐 Argon2 需装 argon2-cffi）
- **规律**: `PASSWORD_HASHERS` 首项决定新密码哈希算法。`MD5PasswordHasher`/`SHA1PasswordHasher`/`UnsaltedMD5*` 仅为遗留迁移保留，不得作为首项。列表含旧算法仅用于自动升级（登录时重哈希）。
- **违反后果**: 弱哈希被彩虹表/GPU 暴破秒破（CWE-327）。
- **验证方法**: PASSWORD_HASHERS 配置块含 MD5/SHA1/Unsalted 哈希器 → warn。
- **对应门禁**: fw_django_password_hasher(warn)

```verify
id: django-r9
cmd: 
expect: always
```

### 规律：raw()/cursor.execute() 禁止 f-string/%/+ 拼接 SQL，必须参数化
- **适用版本**: 全版本
- **规律**: `Model.objects.raw(f"...{x}")` / `cursor.execute("..." % x)` 把用户输入直接拼进 SQL。必须用参数化：`raw("... WHERE id = %s", [x])` / `execute("... WHERE id = %s", [x])`。能用 ORM 表达的查询不走 raw SQL。
- **违反后果**: SQL 注入（CWE-89），拖库/越权读写。
- **验证方法**: 检出 `(execute|raw)(f"` / `execute(... % ` / `execute(... + ` → fail。
- **对应门禁**: fw_django_raw_sql(fail)

```verify
id: django-r10
cmd: 
expect: always
```

### 规律：MIDDLEWARE 顺序敏感，SecurityMiddleware 须居首位
- **适用版本**: 全版本
- **规律**: 中间件按 MIDDLEWARE 列表顺序处理请求、逆序处理响应。`SecurityMiddleware`（安全头/HSTS）须在首位，保证安全头施加于所有响应（含后续中间件短路返回的响应）；`SessionMiddleware` 须在 `AuthenticationMiddleware` 前；`CommonMiddleware` 尽量靠前。
- **违反后果**: 安全头缺失于短路响应 / 认证中间件取不到 session → 行为异常。
- **验证方法**: MIDDLEWARE 列表首个中间件非 SecurityMiddleware → warn。
- **对应门禁**: fw_django_middleware_order(warn)

```verify
id: django-r11
cmd: 
expect: always
```

### 规律：生产须配 STATIC_ROOT + collectstatic，由 Web 服务器/whitenoise 供静态文件
- **适用版本**: 全版本
- **规律**: DEBUG=False 时 Django 不再提供静态文件。必须 `STATIC_ROOT` 指向收集目录，部署期 `collectstatic` 汇聚，由 nginx/whitenoise/CDN 提供。无 STATIC_ROOT 则 collectstatic 报错、生产静态 404。
- **违反后果**: 生产静态文件全 404，页面无样式/脚本。
- **验证方法**: settings 存在但无 `STATIC_ROOT` 定义 → warn。
- **对应门禁**: fw_django_static_root(warn)

```verify
id: django-r12
cmd: 
expect: always
```

### 规律：HTTPS 站点须设 SESSION_COOKIE_SECURE 与 CSRF_COOKIE_SECURE
- **适用版本**: 全版本
- **规律**: `SESSION_COOKIE_SECURE=True` / `CSRF_COOKIE_SECURE=True` 使 Cookie 仅经 HTTPS 传输。生产 HTTPS 站点缺省（False）时 Cookie 可经明文 HTTP 泄露被截获。配合 `SECURE_HSTS_SECONDS`、`SECURE_SSL_REDIRECT` 构成传输安全基线。
- **违反后果**: 会话 Cookie 经明文链路被中间人截获 → 会话劫持。
- **验证方法**: settings 存在但无 SESSION_COOKIE_SECURE/CSRF_COOKIE_SECURE → warn。
- **对应门禁**: fw_django_session_cookie(warn)

```verify
id: django-r13
cmd: 
expect: always
```

### 规律：模型↔迁移漂移——改模型必生成迁移（横向清剿轮）
- **适用版本**: 全版本
- **规律**: models.py 字段变更后不跑 `makemigrations`，表结构与代码即漂移：迁移文件不报错、测试库按迁移建表，生产运行期才 OperationalError（未知列/缺列）。这是"漏改字段"的姊妹缺陷——模型是代码侧字段声明，迁移是 schema 侧字符串化快照（CreateModel(fields=[...]) 内字段名同样是对模型字段的字符串引用）。
- **违反后果**: 部署后运行期 OperationalError；多环境迁移状态不一致难排查。
- **验证方法**: 检出 Model 文件但 0 迁移文件 → warn（漏 makemigrations 信号）；已有迁移的项目提示跑 `python manage.py makemigrations --check` 复核增量（静态无法判定漂移增量）。
- **对应门禁**: fw_django_migration_drift(warn)

```verify
id: django-r14
cmd: 
expect: always
```

<!--
共 14 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_django_nplusone | warn | .objects.all/filter/get 查询文件无 select_related/prefetch_related → warn | DJANGO_SRC_GLOBS | — |
| fw_django_atomic | warn | 单文件写操作（save/create/update/delete/bulk_create）≥2 处且无 transaction.atomic → warn | DJANGO_SRC_GLOBS | — |
| fw_django_csrf | warn | MIDDLEWARE 缺 CsrfViewMiddleware 或检出 @csrf_exempt → warn | DJANGO_SRC_GLOBS | CWE-352 |
| fw_django_migration_irreversible | warn | RunPython 无 reverse_code/RunPython.noop 或 RunSQL 无 reverse_sql → warn | DJANGO_SRC_GLOBS | — |
| fw_django_settings_split | warn | 存在 settings.py 但无 settings/base.py → warn 建议多环境拆分 | DJANGO_SRC_GLOBS | — |
| fw_django_secret_key | fail | SECRET_KEY 字面量硬编码（非 os.environ/getenv）→ fail | DJANGO_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_django_debug | fail | 非 dev/local/test 设置文件 DEBUG = True 字面量 → fail | DJANGO_SRC_GLOBS | CWE-489 |
| fw_django_allowed_hosts | warn | ALLOWED_HOSTS = [] 或 ['*'] → warn | DJANGO_SRC_GLOBS | — |
| fw_django_password_hasher | warn | PASSWORD_HASHERS 含 MD5/SHA1/Unsalted → warn | DJANGO_SRC_GLOBS | CWE-327；GB/T 34944-2017 6.2.6.7 口径（危险加密算法） |
| fw_django_raw_sql | fail | execute/raw 以 f-string、%、+ 拼接 SQL → fail | DJANGO_SRC_GLOBS | CWE-89；GB/T 38674-2020 §5.1 |
| fw_django_middleware_order | warn | MIDDLEWARE 首个中间件非 SecurityMiddleware → warn | DJANGO_SRC_GLOBS | — |
| fw_django_static_root | warn | settings 无 STATIC_ROOT → warn | DJANGO_SRC_GLOBS | — |
| fw_django_session_cookie | warn | settings 无 SESSION_COOKIE_SECURE/CSRF_COOKIE_SECURE → warn | DJANGO_SRC_GLOBS | CWE-614 |
| fw_django_migration_drift | warn | Model 文件数 vs migrations/ 文件数：有模型零迁移即 warn；有迁移提示 --check 复核 | DJANGO_SRC_GLOBS | —（模型↔schema 一致性） |

<!--
门禁 id 命名规范：fw_django_<rule>（rule 全小写下划线）。
本表 13 条 id 须在 assets/framework-gates/django.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_django_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: django  requires_conf: DJANGO_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 N+1 查询 + SECRET_KEY 硬编码 + DEBUG=True + f-string 拼接 SQL → secret_key/debug/raw_sql fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| django × sqlalchemy | Django ORM 与 SQLAlchemy 混用时须分库路由或明确归属，禁止双 ORM 写同一表无协调 | 双写无统一事务边界 → 数据不一致 |
| django × celery | 视图内重任务须推 Celery，禁止请求线程内长耗时处理 | 请求超时 + worker 线程耗尽 |
| django × drf（djangorestframework） | DRF serializer 循环访问关联同样须 select_related/prefetch_related；queryset 优化在 view 层完成 | serializer 层无法优化 ORM 查询 |
| django × whitenoise | STATIC_ROOT 由 WhiteNoiseMiddleware 服务时须紧随 SecurityMiddleware | 中间件顺序错误则静态响应无安全头 |

<!--
无强交互的框架组合省略；本表聚焦 django 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Django 3.2 | DEFAULT_AUTO_FIELD 引入，默认 BigAutoField 须显式声明 | 旧项目升级产生全量主键迁移警告 |
| Django 4.0 | pytz 时区弃用改 zoneinfo；django.utils.timezone.utc 移除 | 时区比较代码须迁移 |
| Django 4.1 | CSRF 校验引入 Origin 头检查（CSRF_TRUSTED_ORIGINS 须带 scheme） | 反向代理后 HTTPS 站点 403 须配 trusted origins |
| Django 5.0 | 要求 Python 3.10+；移除大量 4.x 前弃用 API | 升级前须清弃用警告 |
| Django 5.2 LTS | 现行 LTS（2025-04 发布，extended support 至 2028-04） | 生产推荐基线 |
| Django 6.0 | 2025-12 发布；Python 支持矩阵（3.12/3.13/3.14）待验证 | 待验证：6.0 具体 Python 版本矩阵与破坏性变更清单未逐条核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->


## 字符串耦合面清单（R60 执勤实弹十六类——机械提取盲区，改名/改格式必查）

Django 生态的"编译不校验"字符串耦合面（对照 MyBatis XML 家族；relations-extract 只提 Python import 边，以下靠本清单人工反查）：

| # | 耦合面 | 典型锚点 |
|---|--------|---------|
| 1 | 模板名字符串 | `render("todo/*.html")` vs templates/ 实存 |
| 2 | URL 路由名 | 模板 `{% url 'name' %}` / `reverse()` ↔ urls.py `name=` |
| 3 | 模板字段引用 | `{{ obj.field }}` ↔ models 字段（改名即运行时坏） |
| 4 | POST 参数名 | `request.POST['k']` ↔ 模板 `name="k"` |
| 5 | view context 键 | `render(..., {"k": v})` ↔ 模板 `{{ k }}` |
| 6 | 手写表单 input | include 模板手写 input ↔ view 读点 |
| 7 | CSV 列头 | importer 列头 ↔ 样例 CSV ↔ README |
| 8 | 工厂/夹具字段 | factory-boy/hopper 命令 ↔ 模型 |
| 9 | admin 注册字符串 | `list_display/search_fields` ↔ 模型字段 |
| 10 | settings 键 | defaults.py ↔ README ↔ `{% settings_value %}` |
| 11 | 邮件线程 ID 格式 | 生成侧 ↔ 解析侧正则（双边字符串） |
| 12 | 迁移字段名 ↔ models | 双源（makemigrations --check 未接线，A8） |
| 13 | `{% static %}` 路径 | 指向实存静态文件 |
| 14 | related_name 字符串 | 反向访问器名 ↔ 用点 |
| 15 | upload_to 路径模板 | 存储路径 ↔ 下载/清理逻辑 |
| 16 | unique_together | ↔ upsert/去重逻辑 |

用法：spec 四查①（字段/数据变更前置查询）在 Django 项目按本清单逐面反查；其他栈的等价清单见对应 frameworks/<id>.md（若无，按本表形态为该栈建立）。
