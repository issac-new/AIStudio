---
ruleset_id: ruby
适用版本: Ruby 3.x + Bundler 2.x（Rails / Sinatra / 原生 Ruby 生态口径；差异单独标注）
最后调研: 2026-09-26（来源：ruby-lang.org 与 bundler.io 文档口径；未逐条联网核实的版本点已标"待验证"）
深度门槛: 10
---

# Ruby（Bundler 生态）规则集

<!--
本规则集覆盖 Ruby 3.x + Bundler 2.x 生态（Rails 7-8 / Sinatra 4 / 原生 Ruby）。
调研时点：2026-09-26，来源为 ruby-lang.org 与 bundler.io 文档口径；本规则集补足 81 规则集中 Ruby 生态的空白。
Rails 风格构件（render/params[_sym]/ActiveRecord）与 Sinatra 风格（erb :/params['str']）形态不同，
但双源耦合语义同构：门禁与规律按"字符串双源对账"抽象，形态差异在各条规律内标注。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | Gemfile `gem "rails"` / `gem "sinatra"` / `gem "rspec"` / `gem "puma"` / `gem "rake"` | 高 |
| 文件 | `Gemfile` / `Gemfile.lock` / `Rakefile` / `*.gemspec` / `**/*.rb` / `**/*.erb` | 高 |
| 配置 | `.env.example` / `config/*.rb` / `.rspec` / `bin/*` binstubs | 中 |
| 脚本调用 | `bundle install` / `bundle exec rake` / `bundle exec rspec` / `rackup` / `rails ` | 中 |
| DSL | `task :` / `desc "`（Rakefile）/ `get "/..." do`（Sinatra）/ `ActiveRecord::` | 中 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 ruby 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 路由定义：`grep -rnE '(get|post|put|delete|patch)[[:space:]]+["'"'"']/[^"'"'"']*["'"'"'][[:space:]]+do|match[[:space:]]+["'"'"']' "${PROJECT_DIR}" --include='*.rb'`（计数核验基准：命中行数）
- 控制器/路由处理器：`grep -rnE 'class[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*<[[:space:]]*(ApplicationController|Sinatra::Base)' "${PROJECT_DIR}" --include='*.rb'`（计数核验基准：类声明行数）
- 视图模板：`find "${PROJECT_DIR}" \( -name '*.erb' -o -path '*/views/*' \) -type f`（计数核验基准：文件数）
- Rake 任务：`grep -rnE '^[[:space:]]*(task|desc)[[:space:]]+[:'"'"']' "${PROJECT_DIR}" --include='Rakefile' --include='*.rake'`（计数核验基准：命中行数）
- 依赖声明：`grep -cE '^[[:space:]]*gem[[:space:]]+["'"'"']' "${PROJECT_DIR}/Gemfile"`（计数核验基准：命中行数）
- gemspec 清单：`find "${PROJECT_DIR}" -maxdepth 1 -name '*.gemspec'`（计数核验基准：文件数）
- ENV 调用：`grep -rnE 'ENV(\.fetch)?[[:space:]]*[\[\(]' "${PROJECT_DIR}" --include='*.rb'`（计数核验基准：命中行数）
- 元编程点：`grep -rnE 'method_missing|define_method|send[[:space:]]*\(' "${PROJECT_DIR}" --include='*.rb'`（计数核验基准：命中行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：Gemfile 变更后 Gemfile.lock 须同步更新，禁止依赖树漂移
- **适用版本**: Bundler 2.x
- **规律**: Gemfile 的 `gem "x", "~> 1.0"` 是版本约束期望，Gemfile.lock 锁定实际解析的依赖树（含传递依赖）。改 Gemfile 不跑 `bundle install`/`bundle update <gem>` 就提交，lock 与 Gemfile 漂移——他人与生产 `bundle install --deployment` 直接报错或装出不同依赖树。lock 必须入库，且与 Gemfile 同一提交变更。
- **违反后果**: 依赖不可复现、环境漂移引入未审计版本；供应链攻击面扩大。
- **验证方法**: Gemfile `gem "name"` 声明不在 Gemfile.lock 的 DEPENDENCIES 段，或 Gemfile 修改时间新于 Gemfile.lock → warn。
- **对应门禁**: fw_ruby_gemfile_lock(warn)

```verify
id: ruby-r1
cmd: 
expect: always
```

### 规律：密钥/口令禁止硬编码进 Ruby 源码，须 ENV/Rails credentials 注入
- **适用版本**: 全版本
- **规律**: `client_secret = "..."` / `{ password: "..." }` / `:api_key => "..."` / `API_KEY = "..."` 一类字面量入库即泄露。凭据必须 `ENV["DB_PASSWORD"]`/`ENV.fetch("KEY")` 读取并经 .env（不入库）或 `rails credentials` 加密下发；轮换即换环境变量值，不动代码。
- **违反后果**: 凭据泄露、拖库/冒用（CWE-798）。
- **验证方法**: 检出（password/secret/api_key/token 等关键词）+（`=`/`:`/`=>` 后紧跟 ≥4 字符字符串字面量）且非 ENV[]/ENV.fetch 注入、非占位值 → fail。
- **对应门禁**: fw_ruby_hardcoded_secret(fail)

```verify
id: ruby-r2
cmd: 
expect: always
```

### 规律：ENV 引用键与 .env 样例键须双向对齐（双源纪律）
- **适用版本**: 全版本（Rails/Sinatra 同语义；dotenv/Rails dotenv 均以样例为契约）
- **规律**: `.env.example`（或 .env.sample/.env.template）是新人与 CI 配置环境的唯一契约。代码 `ENV["DB_PASSWORD"]` 引用了样例未登记的键 → 按样例配环境必缺键（ENV[] 返 nil 静默降级）；样例登记了代码从不读的键 → 僵尸键误导配置。两侧键集合必须双向一致。
- **违反后果**: 部署缺键返 nil 静默降级（NilClassError 运行期才炸）；样例漂移使环境配置不可信。
- **验证方法**: 提取 ENV[]/ENV.fetch() 引用键集合与样例 `KEY=` 键集合，任一方向差集非空 → warn。
- **对应门禁**: fw_ruby_env_key_drift(warn)

```verify
id: ruby-r3
cmd: 
expect: always
```

### 规律：erb 视图实例变量与控制器 @ivar 赋值须双向对齐（双源纪律）
- **适用版本**: 全版本（Rails `@user = ...` 隐式传给 `app/views/**/*.erb`；Sinatra `erb :tpl` 同读 @ivar）
- **规律**: 模板 `<%= @user %>` 使用的实例变量必须在渲染它的控制器/路由块 `@user = ...` 赋值集合中，否则渲染 NilClass 报错或输出空白；控制器赋了模板从不使用的 `@extra` → 僵尸传参，掩盖真实视图契约。两侧须双向对齐（模板内 `<% @x = ... %>` 就地赋值与 `@_` 前缀框架内部 ivar 豁免）。
- **违反后果**: 未赋值 ivar 运行期 NoMethodError on nil；视图契约漂移（重构改名后模板静默失效）。
- **验证方法**: 提取模板 `@ivar` 使用集合与渲染侧 `@ivar =` 赋值集合，双向差集非空（豁免就地赋值/内部前缀）→ warn。
- **对应门禁**: fw_ruby_view_var(warn)

```verify
id: ruby-r4
cmd: 
expect: always
```

### 规律：require_relative 按"当前文件"解析路径，文件移动/改名须全量对账引用
- **适用版本**: Ruby 1.9+（require_relative 语义：相对 `__dir__` 而非 $LOAD_PATH/cwd）
- **规律**: `require_relative 'helper'` 解析基准是所在文件目录，`require 'helper'` 走 $LOAD_PATH。移动/重命名文件只改一处 → 部署启动即 LoadError（开发目录结构巧合相同时本地还能跑）。gem 代码必须用 `require`（lib 结构进 $LOAD_PATH），应用/脚本代码用 `require_relative`，混用是目录耦合信号。
- **违反后果**: 启动/首次加载即 LoadError；路径重构面全量断裂。
- **验证方法**: 抽查每条 `require_relative 'x'` 相对当前文件解析的 .rb 是否存在；存在 `require '<本应用相对路径形态>'` 的混用 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r5
cmd: 
expect: always
```

### 规律：Sinatra 风格路由字符串与跳转/前端引用须双向对账（双源纪律）
- **适用版本**: Sinatra 4.x（Rails 对应 `get "users/index"` 字符串 DSL / `redirect_to path_helper` 同语义）
- **规律**: `get "/users/:id" do` 的路径字符串与 `redirect "/users"` 跳转、前端 `<a href>`/fetch 调用、`params["id"]` 参数键是字符串契约。路由改路径只改一侧 → 跳转 404；`params[:id]` 与 `params["id"]` 键型混用（Sinatra params 是 String 键）→ 取 nil 静默降级。
- **违反后果**: 线上 404/静默 nil；路由表与前端契约漂移。
- **验证方法**: 提取路由定义路径集合与 redirect/前端引用路径集合双向对账，差集非空 → 人工确认；同文件 `params[:` 与 `params["` 混用 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r6
cmd: 
expect: always
```

### 规律：Hash 键 String/Symbol 双形态是跨边界契约，禁无对账混用（双源纪律）
- **适用版本**: 全版本（Ruby 3.x Hash 仍区分键型；Rails params/symbolize_names 是转换点）
- **规律**: `params[:user_id]`（Symbol 键）与 `JSON.parse(json)` 返回的 `{"user_id" => ...}`（String 键）是同义不同型双源。跨边界取键只在一侧改型 → 返 nil 静默降级；`fetch` 无默认值才炸。JSON 入口须显式 `symbolize_names: true` 或统一键型约定，并与消费侧对账。
- **违反后果**: 静默 nil 写坏数据；键型漂移在重构后爆发（难溯源）。
- **验证方法**: 同一 JSON 来源的取键点抽检键型一致性；`JSON.parse` 无 symbolize_names 且下游用 Symbol 键取值 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r7
cmd: 
expect: always
```

### 规律：Rake 任务名字符串与 CI/部署脚本调用须双向对账（双源纪律）
- **适用版本**: Rake 13.x
- **规律**: Rakefile 的 `task :db_seed` 定义与 CI/部署脚本里 `bundle exec rake db:migrate db_seed` 调用是双源。任务改名只改一侧 → CI 报 "Don't know how to build task"；定义了无人调用的任务 → 僵尸任务误导排障入口。`desc` 缺失还使 `rake -T` 不可见（暗任务）。
- **违反后果**: CI/发布流程断裂；任务表被僵尸任务污染。
- **验证方法**: 提取 Rakefile `task :name` 定义集合与脚本/CI 里 `rake <name>` 调用集合双向对账，差集非空 → 人工确认；有 task 无 desc → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r8
cmd: 
expect: always
```

### 规律：入口命令须 bundle exec（或 binstub）护航，禁裸调 ruby/rake/rspec
- **适用版本**: Bundler 2.x
- **规律**: 裸 `rake`/`rspec`/`ruby app.rb` 用系统 gem 而非 Gemfile.lock 锁定版本——开发机碰巧同版本能跑，CI/生产装出另一棵树。脚本/Procfile/Dockerfile CMD 必须 `bundle exec <cmd>` 或用 `bin/` binstub（Bundler 生成的 shebang 护航），且 `bundle install` 前 Gemfile.lock 须在位（`--deployment` 语义）。
- **违反后果**: "我这儿是好的"环境漂移；依赖版本分叉引发不可复现失败。
- **验证方法**: 部署/CI 脚本与 Procfile 检出 rake/rspec/ruby 调用无 bundle exec/binstub 前缀 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r9
cmd: 
expect: always
```

### 规律：gem 版本号三源（version.rb/gemspec/Gemfile）须单一事实源（双源纪律）
- **适用版本**: 全版本（gemspec ↔ lib/<gem>/version.rb ↔ Gemfile/gemspec 双源）
- **规律**: gem 项目的版本常在 `lib/foo/version.rb`（`VERSION = "1.2.3"`）、`foo.gemspec`（`spec.version = Foo::VERSION` 或硬编码字符串）、Gemfile 引用三处表达。发版只改 version.rb 而 gemspec 硬编码旧值 → 打出的 gem 版本漂移；Gemfile.lock 的 BUNDLED WITH 与本地 Bundler 大版本漂移则锁文件互斥。版本号必须单源（require version.rb），其余位置引用不复制。
- **违反后果**: 发布版本与源码版本不一致；lock 与 Bundler 版本互斥导致 install 失败。
- **验证方法**: gemspec 内出现与 version.rb 不同的版本字符串字面量 → 人工确认；`VERSION = "..."` 出现多处 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r10
cmd: 
expect: always
```

### 规律：method_missing 元编程须配 respond_to_missing?，禁动态方法名吞错
- **适用版本**: 全版本（Ruby 3.x 未改语义）
- **规律**: 重写 `method_missing` 而不重写 `respond_to_missing?` → `respond_to?(:x)` 为 false 但调用成功（鸭子类型检查失真）；无白名单兜底的 method_missing 把拼写错误方法名也吞进动态分发 → typo 变成诡异 NoMethodError 深处才炸，且调用关系对 grep/静态分析不可见。动态方法名须经白名单（`KNOWN_METHODS.include?(name)`）或 `define_method` 显式注册。
- **违反后果**: duck typing 判定失真；typo 静默进动态路径难排障。
- **验证方法**: 检出 `def method_missing` 无同文件 `respond_to_missing?` → 人工确认；method_missing 体内无白名单/raise 兜底 → 人工确认。
- **对应门禁**: 人工检查

```verify
id: ruby-r11
cmd: 
expect: always
```

<!--
共 11 条规律（≥10 门槛）。4 条挂机械门禁、7 条挂人工检查，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_ruby_hardcoded_secret | fail | password/secret/api_key/token 关键词 + `=`/`:`/`=>` 字符串字面量且非 ENV[]/ENV.fetch 注入、非占位值 → fail | RUBY_SRC_GLOBS | CWE-798；GB/T 34944-2017 6.2.6.3 口径（口令硬编码） |
| fw_ruby_gemfile_lock | warn | Gemfile 有 gem 声明但 lock 缺失 / gem 名不在 lock DEPENDENCIES / Gemfile mtime 新于 lock → warn | （PROJECT_DIR 根 Gemfile/Gemfile.lock） | — |
| fw_ruby_env_key_drift | warn | ENV[]/ENV.fetch() 键 ↔ .env 样例键 双向差集非空 → warn | RUBY_SRC_GLOBS RUBY_ENV_SAMPLE_GLOBS | — |
| fw_ruby_view_var | warn | 模板 @ivar 使用 ↔ 渲染侧 @ivar= 赋值 双向差集非空（豁免就地赋值/@_ 内部前缀）→ warn | RUBY_SRC_GLOBS RUBY_VIEW_GLOBS | — |

<!--
门禁 id 命名规范：fw_ruby_<rule>（rule 全小写下划线）。
本表 4 条 id 须在 assets/framework-gates/ruby.sh 中有同名实现痕迹（grep 命中）。
标准映射列 2026-09-26 登记：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
片段头注释 `# gates: fw_ruby_<rule>(warn|fail) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: ruby  requires_conf: RUBY_SRC_GLOBS RUBY_ENV_SAMPLE_GLOBS RUBY_VIEW_GLOBS` 声明。
fixture 验证覆盖：violating 含 硬编码密钥 + Gemfile.lock 内容漂移 + ENV 键漂移 + 视图 @ivar 漂移 → 4 门禁全主触发；
compliant 四面双向对齐全 pass（tests/fixtures/ruby/ 双态 + expected-fail-ids / expected-pass-ids）。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| ruby × mysql/postgresql | ActiveRecord 查询禁字符串插值（`where("name = '#{x}'")`），须参数绑定 `where(name: x)`/占位符 | SQL 注入（CWE-89） |
| ruby × redis | 缓存值禁对不可信输入 Marshal.load 反序列化 | 反序列化对象注入（CWE-502） |
| ruby × dockerfile | 镜像内 `bundle config set --local path vendor/bundle` + `bundle install --without development test`，禁 vendor 带开发依赖入产 | 依赖面扩大（CWE-1104 口径） |
| ruby × kubernetes | ENTRYPOINT/CMD 须 `bundle exec` 形态，Secret 注入走 ENV 而非打进镜像 | 环境漂移 + 凭据入镜像层（CWE-798 口径） |
| ruby × react/vue | 前端引用的路由路径/接口路径与 Sinatra/Rails 路由定义双源同步（路由改名联动前端） | 路由字符串契约跨栈漂移即 404 |

<!--
无强交互的框架组合省略；本表聚焦 ruby 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Ruby 3.0 | 位置参数与关键字参数分离（`def m(**kw)` 与末位 hash 传参不再互通）；`Pattern matching` 转正 | 升级回归面：kwargs 边界行为须逐处核（2.7 有 deprecation 缓冲） |
| Ruby 3.1 | Hash#except 入核心；error_highlight；`YJIT` 需显式构建开启 | 小步升级；debug gem 替代 lib/debug |
| Ruby 3.2 | Data 不可变值类；Regexp.timeout；匿名参数转发 `*`/`**`；YJIT 生产可用 | 结构体场景可迁移 Data；正则 DoS 面有了超时阀 |
| Ruby 3.3 | Prism 解析器合入（编译期可选）；RJIT 实验性替代 MJIT | MJIT 用户须迁移评估（RJIT 尚实验性） |
| Ruby 3.4 | 2024-12 发布：`it` 块参数、Modular GC（RC）、chilled string 字面量改冻结预警 | 无 `frozen_string_literal: true` 魔法注释的文件里改字符串字面量开始收 deprecation 警告（待验证：冻结默认化的最终版本节奏） |
| Ruby 3.5 | 待验证（按一年一版节奏 2025-12 预期发布，具体变更未逐条核实） | 待验证 |
| Bundler 2.x | lock 与 Gemfile 严格对账（`--deployment`/`--local` fail-closed）；并行安装 | CI 须先提交 lock 再 install；老 `--path` 语义迁移 `bundle config set path` |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
