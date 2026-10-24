---
ruleset_id: flask
适用版本: Flask 3.1.x（2026-07 现行 3.1.3；差异单独标注）
最后调研: 2026-07-17（来源：https://pypi.org/pypi/Flask/json ；https://flask.palletsprojects.com/en/stable/ ；https://flask.palletsprojects.com/en/stable/patterns/appfactories/ ；https://flask.palletsprojects.com/en/stable/blueprints/ ）
深度门槛: 10
---

# Flask 规则集

<!--
本规则集覆盖 Flask 3.1.x（2026-02-19 发布 3.1.3，2026-07 现行）。
调研时点：2026-07-17。Flask 3.x 要求 Python 3.9+；async 视图支持依赖 asgiref（待验证：3.1 是否调整 async 依赖策略，未逐条核实）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `Flask` / `flask`（requirements.txt / pyproject.toml） | 高 |
| 代码 | `from flask import` / `Flask(__name__)` / `@app.route` / `Blueprint(` | 高 |
| 文件 | `**/app.py`（含 Flask 实例化） / `**/wsgi.py` / `**/create_app` 工厂 | 中（需组合信号） |
| 配置 | `SECRET_KEY` / `app.config` / `FLASK_APP` / `SQLALCHEMY_DATABASE_URI` | 高 |
| 脚本调用 | `flask run` / `gunicorn .* :app` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 flask 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由：`grep -rnE '@[A-Za-z_]+\.route\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：路由装饰器行数）
- 蓝图定义：`grep -rnE 'Blueprint\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：Blueprint( 命中行数）
- 蓝图注册：`grep -rnE 'register_blueprint\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：注册行数）
- 错误处理器：`grep -rnE 'errorhandler|register_error_handler' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- Flask 实例/工厂：`grep -rnE 'Flask\(__name__\)|def create_app' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）
- 会话构造：`grep -rnE 'scoped_session\(|sessionmaker\(' "${PROJECT_DIR}" --include='*.py'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：SECRET_KEY 禁止硬编码，必须环境变量注入
- **适用版本**: 全版本（3.1.x 同）
- **规律**: Flask `SECRET_KEY` 用于会话 Cookie 签名（itsdangerous）。硬编码进版本库即泄露签名能力，攻击者可伪造任意会话。必须 `os.environ["FLASK_SECRET_KEY"]` 注入，轮换使全部会话失效。
- **违反后果**: 会话伪造、账户接管（CWE-798）。
- **验证方法**: `app.secret_key = "<字面量>"` / `SECRET_KEY = "<字面量>"` 且行内无 os.environ/getenv → fail。
- **对应门禁**: fw_flask_secret_key(fail)

```verify
id: flask-r1
cmd: 
expect: always
```

### 规律：禁 app.run(debug=True) 上生产，Werkzeug 调试器可致 RCE
- **适用版本**: 全版本
- **规律**: `debug=True` 开启 Werkzeug 交互调试器，浏览器内可执行任意 Python（PIN 保护可被读文件/社工绕过）。生产用 gunicorn/uwsgi 起服务，`app.run()` 仅限本地且 debug=False。
- **违反后果**: 远程代码执行（CWE-94）、堆栈泄露（CWE-489）。
- **验证方法**: 检出 `app.run(debug=True)` / `app.debug = True` → fail。
- **对应门禁**: fw_flask_debug(fail)

```verify
id: flask-r2
cmd: 
expect: always
```

### 规律：须注册统一错误处理器，异常不得直出默认 500 页
- **适用版本**: 全版本
- **规律**: 未捕获异常默认返回 HTML 500 页（含堆栈线索于 debug 场景）。API 服务须 `@app.errorhandler(Exception)` / `register_error_handler` 统一返回 JSON 错误体并记日志，区分 4xx/5xx。
- **违反后果**: 错误响应格式不一致；敏感堆栈信息泄露。
- **验证方法**: 检出路由但全工程无 `errorhandler|register_error_handler` → warn。
- **对应门禁**: fw_flask_errorhandler(warn)

```verify
id: flask-r3
cmd: 
expect: always
```

### 规律：蓝图模块禁止反向 import 应用模块，避免循环导入
- **适用版本**: 全版本
- **规律**: 蓝图文件 `from app import app` 而 app.py 又 import 蓝图注册 → 循环 ImportError。正解：应用工厂 `create_app()` 内注册蓝图，蓝图内用 `current_app` / `flask.g` 延迟引用应用对象。
- **违反后果**: 启动期 ImportError / 属性半初始化。
- **验证方法**: 含 `Blueprint(` 的文件检出 `from app import` / `from main import` → warn。
- **对应门禁**: fw_flask_blueprint_circular(warn)

```verify
id: flask-r4
cmd: 
expect: always
```

### 规律：SQLAlchemy 会话须绑定请求生命周期，teardown 时 remove
- **适用版本**: 全版本（Flask-SQLAlchemy 3.x 或裸 SQLAlchemy）
- **规律**: `scoped_session` 按线程隔离会话；请求结束不 `remove()` 则连接滞留连接池直至耗尽。裸用 SQLAlchemy 须 `@app.teardown_appcontext` 内 `session.remove()`；Flask-SQLAlchemy 已内置 teardown。
- **违反后果**: 连接泄漏、池耗尽、跨请求脏数据。
- **验证方法**: 检出 `scoped_session/sessionmaker` 但无 `teardown_appcontext` / `.remove()` → warn。
- **对应门禁**: fw_flask_session_teardown(warn)

```verify
id: flask-r5
cmd: 
expect: always
```

### 规律：应用须用 create_app 工厂模式，禁顶层全局 app 直建
- **适用版本**: 全版本
- **规律**: 顶层 `app = Flask(__name__)` 全局单例使测试无法隔离配置、扩展初始化时机失控、import 即副作用。工厂模式 `def create_app(config=None)` 内实例化 + 初始化扩展 + 注册蓝图，`flask --app 'module:create_app()' run` 启动。
- **违反后果**: 测试配置污染生产实例；扩展初始化顺序错乱。
- **验证方法**: 检出 `Flask(__name__)` 但无 `def create_app` → warn。
- **对应门禁**: fw_flask_app_factory(warn)

```verify
id: flask-r6
cmd: 
expect: always
```

### 规律：连接 URI 禁止明文凭据，须环境变量/密钥管理注入
- **适用版本**: 全版本
- **规律**: `SQLALCHEMY_DATABASE_URI = "postgresql://user:pass@host/db"` 明文入库即泄露。须 `os.environ["DATABASE_URL"]` 注入或经密钥管理服务下发。
- **违反后果**: 数据库凭据泄露（CWE-798），拖库风险。
- **验证方法**: 检出 `scheme://user:pass@` 字面量 URI → fail。
- **对应门禁**: fw_flask_db_credentials(fail)

```verify
id: flask-r7
cmd: 
expect: always
```

### 规律：请求数据须 Schema 校验（pydantic/marshmallow），禁止裸用 request 数据
- **适用版本**: 全版本
- **规律**: `request.get_json()` / `request.form[...]` 返回未校验数据，类型/边界/注入面全裸奔。须 pydantic BaseModel 或 marshmallow Schema 校验后再用，校验失败返回 400。
- **违反后果**: 类型混乱 500、注入攻击面扩大。
- **验证方法**: 文件含 `request.get_json()/request.form[` 但无 `validate|Schema|pydantic|marshmallow` → warn。
- **对应门禁**: fw_flask_request_validation(warn)

```verify
id: flask-r8
cmd: 
expect: always
```

### 规律：JSON 响应须 jsonify（或返回 dict），禁 return json.dumps
- **适用版本**: Flask 1.1+（dict 直返自动 jsonify）/ 3.1.x
- **规律**: `return json.dumps(data)` 的 Content-Type 是 text/html，客户端解析歧义且被当 HTML 时放大 XSS 面。须 `jsonify(data)` 或直接 `return data`（Flask 自动序列化 dict + 正确 mimetype）。
- **违反后果**: 响应 mimetype 错误，下游解析异常 / XSS 辅助面。
- **验证方法**: 检出 `return json.dumps(` → warn。
- **对应门禁**: fw_flask_json_response(warn)

```verify
id: flask-r9
cmd: 
expect: always
```

### 规律：Markup/render_template_string 拼接用户输入绕过自动转义
- **适用版本**: 全版本
- **规律**: Jinja2 默认自动转义；`Markup(user_input)` / `render_template_string(f"...{input}")` / 模板 `|safe` 显式关闭转义。用户输入进入这些路径即存储/反射 XSS。
- **违反后果**: XSS（CWE-79），会话窃取/页面篡改。
- **验证方法**: 检出 `Markup(` / render_template_string 拼接 → warn。
- **对应门禁**: fw_flask_xss(warn)

```verify
id: flask-r10
cmd: 
expect: always
```

### 规律：CORS 禁 origins=* 全开放，须白名单收敛
- **适用版本**: flask-cors 全版本
- **规律**: `CORS(app)` 默认对所有路由开放 `*` 来源；配合 Cookie 会话（supports_credentials）时任意站点可携带凭据跨域读写。须 `CORS(app, origins=["https://trusted.example"])` 白名单，credentials 场景严禁通配。
- **违反后果**: 跨域数据窃取 / CSRF 面放大。
- **验证方法**: `CORS(` 且 origins 为 `*` 或裸 `CORS(app)` → warn。
- **对应门禁**: fw_flask_cors(warn)

```verify
id: flask-r11
cmd: 
expect: always
```

### 规律：登录/认证路由必须限流，防暴破撞库
- **适用版本**: 全版本（flask-limiter 3.x）
- **规律**: `/login`、`/auth/token` 等凭证校验端点无限流即可无限暴破。须 flask-limiter 按 IP/账户维度限流（如 5 次/分钟），并配合延迟递增与锁定策略。
- **违反后果**: 口令暴破、撞库攻击。
- **验证方法**: 检出登录路由但无 `Limiter|flask_limiter` → warn。
- **对应门禁**: fw_flask_ratelimit(warn)

```verify
id: flask-r12
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
| fw_flask_secret_key | fail | SECRET_KEY/app.secret_key 字面量硬编码（非环境注入）→ fail | FLASK_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_flask_debug | fail | app.run(debug=True)/app.debug=True → fail | FLASK_SRC_GLOBS | CWE-489；CWE-94 |
| fw_flask_errorhandler | warn | 有路由但无 errorhandler/register_error_handler → warn | FLASK_SRC_GLOBS | CWE-209 |
| fw_flask_blueprint_circular | warn | 蓝图文件 from app/main import → warn 循环导入 | FLASK_SRC_GLOBS | — |
| fw_flask_session_teardown | warn | scoped_session/sessionmaker 无 teardown/remove → warn | FLASK_SRC_GLOBS | — |
| fw_flask_app_factory | warn | Flask(__name__) 无 create_app 工厂 → warn | FLASK_SRC_GLOBS | — |
| fw_flask_db_credentials | fail | scheme://user:pass@ 明文 URI → fail | FLASK_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_flask_request_validation | warn | request.get_json/form 无 validate/Schema → warn | FLASK_SRC_GLOBS | — |
| fw_flask_json_response | warn | return json.dumps( → warn 须 jsonify | FLASK_SRC_GLOBS | — |
| fw_flask_xss | warn | Markup(/render_template_string 拼接 → warn | FLASK_SRC_GLOBS | CWE-79；GB/T 38674-2020 §5.1 |
| fw_flask_cors | warn | CORS origins=* 或裸 CORS(app) → warn | FLASK_SRC_GLOBS | CWE-942 |
| fw_flask_ratelimit | warn | 登录路由无 Limiter → warn | FLASK_SRC_GLOBS | CWE-307；GB/T 22239-2019 7.1.4.1 b) 口径（登录失败处理） |

<!--
门禁 id 命名规范：fw_flask_<rule>（rule 全小写下划线）。
本表 12 条 id 须在 assets/framework-gates/flask.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_flask_<rule>(warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: flask  requires_conf: FLASK_SRC_GLOBS` 声明。
fixture 验证覆盖：violating 含 SECRET_KEY 硬编码 + debug=True + 明文 DB URI + 无错误处理 + 蓝图循环导入 → secret_key/debug/db_credentials fail 主触发；compliant 全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| flask × sqlalchemy | scoped_session 须在 teardown_appcontext remove；Flask-SQLAlchemy 已内置 | 裸用 SQLAlchemy 无 teardown → 连接泄漏 |
| flask × celery | 视图内重任务推 Celery；任务内访问 current_app 须推入 app_context | 请求外用 current_app 抛 RuntimeError |
| flask × gunicorn | 生产 gunicorn 起服务，worker 数按 CPU 配置；禁 flask run 上生产 | 开发服务器单线程不安全不稳定 |
| flask × jinja2 | 模板渲染保持自动转义，禁全局关闭 autoescape | 关闭转义全站 XSS 面打开 |

<!--
无强交互的框架组合省略；本表聚焦 flask 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Flask 2.0 | 弃用 before_first_request 行为变更预告；async 视图支持 | 启动初始化须移 create_app |
| Flask 2.2 | 移除 before_first_request；嵌套蓝图 | 旧初始化代码报错须迁移 |
| Flask 2.3 | 移除大量 2.x 弃用 API（如 app.before_first_request 正式删除） | 升级前清弃用警告 |
| Flask 3.0 | 要求 Python 3.8+；Werkzeug 3 / Jinja2 3.1；移除 flask.globals 旧别名 | 依赖联动升级 |
| Flask 3.1 | 2024-11 发布（3.1.3 于 2026-02-19）；async 支持经 asgiref（待验证具体策略调整） | 待验证：3.1 async 依赖与 CLI 行为差异未逐条核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
