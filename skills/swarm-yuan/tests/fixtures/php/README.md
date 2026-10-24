# php fixture 说明

- 双态覆盖 5 门禁（R62 第九棒换栈演练补缺，PHP+composer 生态首个规则集）：
  - `fw_php_hardcoded_secret`(fail)：violating 内 `$clientSecret = "..."` 与 `['password' => 'SuperSecret2024!']` 字面量。
  - `fw_php_composer_lock`(warn)：violating 的 composer.json require 含 `guzzlehttp/guzzle`，composer.lock 未登记（内容漂移）。
  - `fw_php_env_key_drift`(warn)：violating 代码 `env('DB_PASSWORD')` 未登记样例；样例 `DB_HOST`/`DB_PORT` 无人引用（双向差集）。
  - `fw_php_route_name`(warn)：violating 引用 `route('users.profile')` 未定义；定义的 `users.legacy` 无人引用（双向差集）。
  - `fw_php_view_var`(warn)：violating 模板用 `$missingVar` 未传参；传参 `extra` 模板未用（双向差集）。
- 断言登记：**5/5 主触发已断言**（`violating/expected-fail-ids`）+ compliant 负向断言（`compliant/expected-pass-ids`，R44-D6 变异锁）。
- compliant 态五面双向对齐：凭据 env() 注入、lock 登记全部 require 包、env() 键=样例键、
  路由 name 定义=引用、模板变量=传参（含 `$request->input()` 人工检查面留白）。
- composer.lock 时间判（mtime 容差 5 秒）在本 fixture 不作主触发：双态文件同批创建，主触发为内容判——
  时间判面向"改 json 忘 update"的真实开发漂移（见 references/frameworks/php.md 规律 1）。
