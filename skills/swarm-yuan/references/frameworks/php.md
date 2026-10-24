---
ruleset_id: php
适用版本: PHP 8.x + Composer 2.x（Laravel / Symfony / 原生 PHP 生态口径；差异单独标注）
最后调研: 2026-09-25（来源：php.net 手册与 getcomposer.org 文档口径；未逐条联网核实的版本点已标"待验证"）
深度门槛: 10
---

# PHP（Composer 生态）规则集

<!--
本规则集覆盖 PHP 8.x + Composer 2.x 生态（Laravel 10-12 / Symfony 6-7 / 原生 PHP）。
调研时点：2026-09-25，来源为 php.net 手册与 Composer 文档口径；本规则集补足 81 规则集中 PHP 生态的空白。
Laravel 风格构件（route()/view()/env()）在 Symfony/原生 PHP 中形态不同（#[Route] 属性、$_ENV、include 模板），
但双源耦合语义同构：门禁与规律按"字符串双源对账"抽象，形态差异在各条规律内标注。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | composer.json require 含 `laravel/framework` / `symfony/http-foundation` / `phpunit/phpunit` / `guzzlehttp/guzzle` / `monolog/monolog` | 高 |
| 文件 | `composer.json` / `composer.lock` / `artisan` / `**/*.php` / `**/*.blade.php` | 高 |
| 注解/属性 | `#[Route(` / `->name(` / `->middleware(` / `#[Entity]` | 中 |
| 配置 | `.env.example` / `config/*.php` / `phpunit.xml` / composer.json `autoload.psr-4` | 中 |
| 脚本调用 | `composer install` / `composer update` / `php artisan` / `vendor/bin/phpunit` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 php 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由定义：`grep -rnE 'Route::(get|post|put|delete|patch|resource)\(|->name\(|#\[Route\(' "${PROJECT_DIR}" --include='*.php'`（计数核验基准：命中行数）
- 控制器：`grep -rnE 'class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]+extends[[:space:]]+(Controller|BaseController|AbstractController)' "${PROJECT_DIR}" --include='*.php'`（计数核验基准：类声明行数）
- 视图模板：`find "${PROJECT_DIR}" -name '*.blade.php' -o -path '*/views/*' -name '*.php'`（计数核验基准：文件数）
- 中间件：`grep -rnE 'implements[[:space:]]+Middleware|->middleware\(' "${PROJECT_DIR}" --include='*.php'`（计数核验基准：命中行数）
- 数据库迁移：`find "${PROJECT_DIR}" -path '*/migrations/*' -name '*.php'`（计数核验基准：文件数）
- 配置项：`find "${PROJECT_DIR}" -path '*/config/*' -name '*.php'`（计数核验基准：文件数）
- 服务提供者：`grep -rnE 'extends[[:space:]]+ServiceProvider' "${PROJECT_DIR}" --include='*.php'`（计数核验基准：命中行数）
- env() 调用：`grep -rnE "(env|getenv)[[:space:]]*\(" "${PROJECT_DIR}" --include='*.php'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：composer.json 变更后 composer.lock 须同步更新，禁止依赖树漂移
- **适用版本**: Composer 2.x
- **规律**: composer.json 的 require/require-dev 是版本约束期望，composer.lock 锁定实际安装的依赖树。改 composer.json 不跑 `composer update`/`install` 就提交，lock 与 json 漂移——他人与生产装出的依赖树和开发环境不一致（"我这儿是好的"）。lock 必须入库，且与 json 同一提交变更。
- **违反后果**: 依赖不可复现、环境漂移引入未审计版本；供应链攻击面扩大。
- **验证方法**: composer.json require 的包名不在 composer.lock 的 packages/packages-dev name 集合，或 composer.json 修改时间新于 composer.lock → warn。
- **对应门禁**: fw_php_composer_lock(warn)

```verify
id: php-r1
cmd: 
expect: always
```

### 规律：密钥/口令禁止硬编码进 PHP 源码，须 env()/密钥管理注入
- **适用版本**: 全版本
- **规律**: `$password = "..."` / `['api_key' => '...']` / `define('APP_KEY', '...')` 一类字面量入库即泄露。凭据必须 `env('DB_PASSWORD')` 读取并经 .env（不入库）或密钥管理服务下发；轮换即换环境变量值，不动代码。
- **违反后果**: 凭据泄露、拖库/冒用（CWE-798）。
- **验证方法**: 检出（password|secret|api_key|token 等关键词）+（`=`/`=>` 后紧跟 ≥4 字符字符串字面量）且非 env()/getenv()/$_ENV/config( 注入、非占位值 → fail。
- **对应门禁**: fw_php_hardcoded_secret(fail)

```verify
id: php-r2
cmd: 
expect: always
```

### 规律：env() 键与 .env 样例键须双向对齐（双源纪律）
- **适用版本**: 全版本（Laravel/Symfony 同语义；Symfony 对应 $_ENV/%env()% ↔ .env）
- **规律**: `.env.example`（或 .env.sample/.env.template）是新人与 CI 配置环境的唯一契约。代码 `env('DB_PASSWORD')` 引用了样例未登记的键 → 按样例配环境必缺键；样例登记了代码从不读的键 → 僵尸键误导配置。两侧键集合必须双向一致。
- **违反后果**: 部署缺键返回 null 静默降级；样例漂移使环境配置不可信。
- **验证方法**: 提取 env()/getenv()/$_ENV 引用键集合与样例 `KEY=` 键集合，任一方向差集非空 → warn。
- **对应门禁**: fw_php_env_key_drift(warn)

```verify
id: php-r3
cmd: 
expect: always
```

### 规律：路由 name 字符串与 route()/to_route() 调用须双向对齐（双源纪律）
- **适用版本**: 全版本（Laravel `->name()`/`'as' =>`；Symfony `#[Route(name: ...)]` 同语义）
- **规律**: 路由名是控制器/视图/跳转与路由定义之间的字符串契约。`route('users.profile')` 引用了未定义的 name → 运行期抛 InvalidArgumentException；`->name('users.legacy')` 定义后无人引用 → 僵尸路由名（若经前端 Ziggy/JS 引用，需人工确认后豁免）。定义侧与引用侧键集合须双向一致。
- **违反后果**: 线上 500（未定义路由名跳转/生成 URL 失败）；路由表被僵尸 name 污染。
- **验证方法**: 提取 `->name('x')`/`'as' => 'x'`/`name: 'x'` 定义集合与 `route('x')`/`to_route('x')` 引用集合，任一方向差集非空 → warn。
- **对应门禁**: fw_php_route_name(warn)

```verify
id: php-r4
cmd: 
expect: always
```

### 规律：视图变量与控制器传参须双向对齐（双源纪律）
- **适用版本**: 全版本（Blade `{{ $var }}`；原生 PHP `<?= $var ?>`/`echo $var` 同语义）
- **规律**: 模板 `{{ $user }}` 使用的变量必须在 `view('x', ['user' => ...])`/`compact('user')`/`->with('user', ...)` 传参集合中，否则渲染 Notice/空白输出；控制器传了模板从不使用的变量（如 `'extra'`）→ 僵尸视图参数，掩盖真实传参契约。两侧须双向对齐（Blade 内置 `$loop/$errors/$slot` 等与 `as $x` 局部绑定豁免）。
- **违反后果**: 未定义变量输出空白（数据丢失难察觉）；传参契约漂移（重构改名后模板静默失效）。
- **验证方法**: 提取模板 `$var` 使用集合与控制器传参键集合，双向差集非空（豁免内置/局部绑定）→ warn。
- **对应门禁**: fw_php_view_var(warn)

```verify
id: php-r5
cmd: 
expect: always
```

### 规律：config() 键字符串与 config/*.php 返回数组须双向对齐（双源纪律）
- **适用版本**: 全版本
- **规律**: `config('app.locale')` 的键字符串与 `config/app.php` 返回数组的 `'locale' =>` 键是双源。键改名只改一侧 → config() 返回 null 静默降级；config 数组里的键无人读 → 死配置误导调优。`config:cache` 后错误键更难排查。
- **违反后果**: 配置静默失效（null 兜底掩盖）；配置文件膨胀出无人消费项。
- **验证方法**: 提取 `config('file.key')` 键对与 `config/<file>.php` 返回数组顶层键，双向差集非空 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r6
cmd: 
expect: always
```

### 规律：$request->input()/query()/route() 参数字符串须与表单/API 契约对账
- **适用版本**: 全版本
- **规律**: `$request->input('user_id')` 的参数名字符串与表单字段、API 契约（OpenAPI/前端请求体）是双源。契约改名只改一侧 → 静默取到 null（Laravel 不报错）；且 `input()` 返回未校验数据，须 FormRequest/Validator 校验后再用。
- **违反后果**: 参数漂移取 null 静默写坏数据；未校验输入扩大注入面（CWE-20）。
- **验证方法**: 提取 `input()/query()/route()/get()` 参数字符串与表单/OpenAPI 字段名清单双向对账，差集非空 → 人工确认；同文件有 input( 但无 validate/FormRequest → 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r7
cmd: 
expect: always
```

### 规律：PHPDoc @param/@return 类型与实现签名须一致（双源纪律）
- **适用版本**: PHP 7.x（类型不完整靠文档）/ 8.x（原生类型为主，文档为辅）
- **规律**: PHPDoc `@param string $id` 与签名 `function f(int $id)` 是双源。文档漂移误导静态分析（PHPStan/Psalm）与 IDE 补全，重构改类型时按旧文档写的调用方全错。原生类型是事实源时文档不得矛盾；无原生类型的参数文档是唯一契约，必须准确。
- **违反后果**: 静态分析漏报/误报；调用方按错误类型编码（类型错误运行期才炸）。
- **验证方法**: 同一函数的 `@param <type> $<name>` 与签名参数类型/顺序逐一对比，不一致 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r8
cmd: 
expect: always
```

### 规律：PSR-4 命名空间与目录结构、composer.json autoload 映射须三方一致（双源纪律）
- **适用版本**: 全版本（Composer PSR-4 autoload）
- **规律**: `namespace App\Models;` ↔ `app/Models/User.php` ↔ composer.json `autoload.psr-4` 的 `"App\\": "app/"` 映射是三方契约。任一错位 → `Class "App\Models\User" not found`（`dump-autoload` 不报错，运行期才炸）；大小写不一致在 Linux 生产才暴露（macOS 大小写不敏感掩盖）。
- **违反后果**: 类加载失败 500；开发/生产行为不一致（大小写面）。
- **验证方法**: 抽查 `namespace` 声明与文件相对 psr-4 根的目录路径是否逐段一致（含大小写）→ 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r9
cmd: 
expect: always
```

### 规律：composer scripts 命令与实际入口/CI 调用须对账（双源纪律）
- **适用版本**: Composer 2.x
- **规律**: `composer.json` scripts 段的命令字符串（`phpunit`/`php artisan migrate`）与真实入口（vendor/bin/phpunit 存在、artisan 存在、CI 调用的 script 名）是双源。命令改名只改一侧 → CI 静默跑空或报 command not found；script 引用不存在的脚本文件 → 发布流程断裂。
- **违反后果**: CI/发布流程静默失效（测试 0 个也绿）；部署脚本断链。
- **验证方法**: 抽取 scripts 段命令名与被调用脚本路径，逐条核对入口存在且 CI 调用名与定义名一致 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r10
cmd: 
expect: always
```

### 规律：视图禁 {!! $var !!} 原样输出/echo 拼接用户输入，绕过 Blade 转义即 XSS
- **适用版本**: 全版本（Blade `{{ }}` 默认转义 e()；原生 PHP 须 htmlspecialchars）
- **规律**: `{{ $x }}` 自动 htmlspecialchars；`{!! $x !!}` 与 `<?= $x ?>`/`echo $x` 原样输出。用户可控内容进入这些路径即反射/存储 XSS。必须原样输出的受信 HTML（如 Markdown 渲染结果）须先经 HTMLPurifier 类白名单净化。
- **违反后果**: XSS 会话窃取/页面篡改（CWE-79）。
- **验证方法**: 模板检出 `{!! $var !!}` / `<?= $var ?>` / `echo $var` 且变量源自请求 → 人工确认净化链路。
- **对应门禁**: 人工检查

```verify
id: php-r11
cmd: 
expect: always
```

### 规律：生产部署须 composer install --no-dev 且 --optimize-autoloader，require-dev 禁入生产
- **适用版本**: Composer 2.x
- **规律**: `composer install` 默认装 require-dev（phpunit/ide-helper/debug 工具）——生产镜像带调试依赖即扩大攻击面与体积。部署必须 `composer install --no-dev --optimize-autoloader --classmap-authoritative`，并以 `composer validate` + lock 校验护航。
- **违反后果**: 调试/测试工具暴露在生产（CWE-1104 口径）；autoload 性能劣化。
- **验证方法**: Dockerfile/部署脚本检出 `composer install` 无 `--no-dev`，或 production 配置未排除 dev 依赖 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: php-r12
cmd: 
expect: always
```

<!--
共 12 条规律（≥10 门槛）。5 条挂机械门禁、7 条挂人工检查，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_php_hardcoded_secret | fail | password/secret/api_key/token 关键词 + `=`/`=>` 字符串字面量且非 env()/config( 注入、非占位值 → fail | PHP_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_php_composer_lock | warn | composer.json require 有依赖但 lock 缺失 / require 包名不在 lock / json mtime 新于 lock → warn | （PROJECT_DIR 根 composer.json/composer.lock） | — |
| fw_php_env_key_drift | warn | env()/getenv()/$_ENV 键 ↔ .env 样例键 双向差集非空 → warn | PHP_SRC_GLOBS PHP_ENV_SAMPLE_GLOBS | — |
| fw_php_route_name | warn | route()/to_route() 引用名 ↔ ->name()/as/name: 定义名 双向差集非空 → warn | PHP_SRC_GLOBS PHP_ROUTE_GLOBS | — |
| fw_php_view_var | warn | 模板 $var 使用 ↔ view()/compact()/->with() 传参 双向差集非空（豁免内置/局部绑定）→ warn | PHP_SRC_GLOBS PHP_VIEW_GLOBS | — |

<!--
门禁 id 命名规范：fw_php_<rule>（rule 全小写下划线）。
本表 5 条 id 须在 assets/framework-gates/php.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-09-25 登记：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_php_<rule>(warn|fail) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: php  requires_conf: PHP_SRC_GLOBS PHP_ENV_SAMPLE_GLOBS PHP_VIEW_GLOBS PHP_ROUTE_GLOBS` 声明。
fixture 验证覆盖：violating 含 硬编码密钥 + composer.lock 内容漂移 + env() 键漂移 + 路由 name 漂移 + 视图变量漂移 → 5 门禁全主触发；
compliant 五面双向对齐全 pass（tests/fixtures/php/ 双态 + expected-fail-ids / expected-pass-ids）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| php × mysql/postgresql | 查询须 PDO 预处理参数绑定，禁字符串拼接进 SQL（whereRaw/DB::raw 拼用户输入即注入面） | SQL 注入（CWE-89） |
| php × redis | 会话/缓存值禁对不可信输入 unserialize | 反序列化对象注入（CWE-502） |
| php × nginx | php-fpm upload_max_filesize/post_max_size 须 ≤ nginx client_max_body_size | 超限上传被 nginx 先行截断返 413，报错指向错误层 |
| php × dockerfile | 镜像内 `composer install --no-dev --optimize-autoloader`，禁 vendor 带开发依赖入产 | 依赖面扩大（CWE-1104 口径） |
| php × vue/react | 前端引用的路由名/接口路径经 Ziggy/OpenAPI 双源同步（路由 name 改名联动前端） | 路由 name 字符串契约跨栈漂移即 404 |

<!--
无强交互的框架组合省略；本表聚焦 php 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| PHP 8.0 | 联合类型/命名参数/构造器属性提升/Attribute 注解；`0 == "foo"` 比较语义变更（改 false）；@ 不再静默致命错误 | 升级回归面：松比较与错误处理行为须逐处核 |
| PHP 8.1 | enum/readonly 属性/never 类型；敏感参数 #[SensitiveParameter] | 新语法可读性收益；readonly 二次赋值抛 Error（对照手册 readonly 语义） |
| PHP 8.2 | 动态属性弃用（须声明或 #[AllowDynamicProperties]）；readonly 类；常量 trait | 旧代码大量弃用警告，升 8.2 前清零 |
| PHP 8.3 | 类型常量/json_validate/#[\Override]；json_encode 默认值调整 | 小步升级；Override 注解可补契约检查 |
| PHP 8.4 | 属性钩子（property hooks）/非对称可见性/new MyClass()->method() 免括号链 | 语法升级面（2024-11 发布） |
| PHP 8.5 | 待验证（按一年一版节奏 2025-11 预期发布，具体变更未逐条核实） | 待验证 |
| Composer 2.0 | 2020-10 发布；插件 API v2、平台包校验收紧、并行下载 | 老 Composer 1 插件不兼容须升级 |
| Composer 2.3+ | 运行要求 PHP 7.2.5+（待验证具体下限）；插件授权确认（allow-plugins）显式化 | 未声明 allow-plugins 的插件被静默禁用 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
