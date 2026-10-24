# ruby fixture 说明

- 双态覆盖 4 门禁（R64 第十棒换栈演练补缺，Ruby+Bundler 生态首个规则集）：
  - `fw_ruby_hardcoded_secret`(fail)：violating 内 `client_secret = "..."` 与 `{ password: "..." }` 字面量。
  - `fw_ruby_gemfile_lock`(warn)：violating 的 Gemfile 声明 `rack`，Gemfile.lock DEPENDENCIES 未登记（内容漂移）。
  - `fw_ruby_env_key_drift`(warn)：violating 代码 `ENV["DB_PASSWORD"]` 未登记样例；样例 `DB_HOST`/`DB_PORT` 无人引用（双向差集）。
  - `fw_ruby_view_var`(warn)：violating 模板用 `@missing_var` 未见赋值；渲染侧赋值的 `@extra` 无模板引用（双向差集）。
- 断言登记：**4/4 主触发已断言**（`violating/expected-fail-ids`）+ compliant 负向断言（`compliant/expected-pass-ids`，R44-D6 变异锁）。
- compliant 态四面双向对齐：凭据 ENV 注入、lock DEPENDENCIES 登记全部 Gemfile gem、ENV 键=样例键、
  视图 @ivar=渲染侧赋值（Sinatra `erb :users_show` ↔ `views/users_show.erb`；require_relative/路由字符串等
  人工检查面留白，见 references/frameworks/ruby.md §3 规律 5/6）。
- Gemfile.lock 时间判（mtime 容差 5 秒）在本 fixture 不作主触发：双态文件同批创建且 Gemfile 先于 lock 落盘，主触发为
  内容判——时间判面向"改 Gemfile 忘 bundle install"的真实开发漂移（见 references/frameworks/ruby.md 规律 1）。
