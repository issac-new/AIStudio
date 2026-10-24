# R64 Ruby 换栈演练轮（第十棒）：Ruby 生态五面补齐 + 发布后独立验收勘误

> 2026-09-26，第十棒新栈。真实项目 **rack v2.2.9**（Ruby web 生态基石；Bundler + minitest）。本档由独立验收会话补记——原执行会话合入 v2.32.0（3296ad8）后未留档，且发布记录含一处数字误记（见 §五）。

## 一、演练实录（执行会话，v2.32.0 已合入）

1. 工具链：brew ruby 4.0.7 + bundler 4.0.20（系统自带 ruby 2.6 无法跑现代套件）。
2. 真实项目 rack v2.2.9 shallow clone + `bundle install`（vendor/bundle 本地缓存）→ minitest 套件可跑通。
3. 流A 生成 kb64-rack：探测信号 0 命中（Gemfile/Rakefile/*.rb 全无）→ ACTIVE_FRAMEWORKS 空 → 门禁注入跳过——五面全盲第一锤（验收会话在合入前实测锚定：`detect-frameworks` 输出"未探测到任何已知框架"）。
4. **ruby 规则集三件套**：ruby.md（11 条五要素规律：4 机械门禁 + 7 人工检查）/ ruby.sh（fw_ruby_hardcoded_secret(fail)、gemfile_lock、env_key_drift、view_var）/ 双态夹具（violating 4/4 检出、compliant 4/4 放行）/ 探测三信号（`ruby|Gemfile|file_exists`、`ruby|Rakefile|file_exists`、`ruby|*.gemspec|file_glob`）+ 索引重生成 + FACT_FRAMEWORKS 80→81 + golden 82 行零漂移。
5. 工具链四修：relations-extract Ruby 提取分支（require_relative 裸名 + `./x` 前缀双形态；gem require 不发边；vendor/bundle 排除）、conf-render Bundler 命令族嗅探（`bundle install`/`bundle exec rake`，lock 存在才 confirmed）、DIM Ruby 形态（Sinatra 路由 `get '/x' do` 形态 + *_spec.rb/test_*.rb/*_test.rb + `--include='*.rb'`）、探测接线。
6. 真实项目行为实测：rack 提取 **74 条 Ruby import 边**（验收会话复现一致：修复后 relations-extract 独立重跑恰 74 条，逐行 evidence 格式正确——D2 修复可复现性通过）；conf-render 出 `bundle install`/`bundle exec rake`。

## 二、验收会话在合入前的独立实测（五面全盲直证）

以下为验收会话在 3296ad8 合入**之前**对旧工具链的实测锚点（与执行会话结论互证）：

| 面 | 实测 |
|----|------|
| 探测 | `detect-frameworks.sh` 对 rack 输出"未探测到任何已知框架（ACTIVE_FRAMEWORKS=()）" |
| 提取 | `relations-extract.sh` 对 rack 产出 **0 边**（主循环语言分支无 Ruby） |
| DIM | `inventory-dimensions.conf` 零 Ruby 形态（controller 正则无 `--include='*.rb'`，TESTFILES 无 *_spec.rb/*_test.rb） |
| conf 嗅探 | `conf-render.sh` 无 bundle/rake 分支（生成 conf 中的 TEST_CMD/BUILD_CMD 为 AI 手填，非机器嗅探） |
| 规则集 | 80 规则集无 ruby/rails（ls 实证） |

## 三、工具链基线垫片（rack 2.2.9 跑上 Ruby 4.0 的本机事实）

rack 2.2.9（2024）早于 Ruby 4.0，本机复现基线需垫片（drill 项目 Gemfile 本地改动，不入库）：Gemfile.lock 的 BUNDLED WITH 1.17.2→4.0.20；补 `base64/logger/cgi/ostruct` 等被 Ruby 3.4+/4.0 gem 化移出默认库的标准库；stringio/minitest 升级到支持 Ruby 4.0 的版本。这些是环境垫片，非 rack 代码改动（rack 工作树 git status 仅 .claude/ 与 vendor/ 未跟踪，源码零改动）。

## 四、缺陷与处置（执行会话）

| # | 缺陷 | 处置 | 锁 |
|---|------|------|-----|
| 五面全盲 | ruby 规则集/探测/提取/嗅探/DIM 全无 | 三件套 + 四修 | 夹具双态 4/4+4/4 + L1-L5 |
| 引号坑 | Sinatra 路由模式含字面单引号，conf 双引号包裹 grep 单引号串被截断致 bash 语法错 | 模式内以 `.` 通配引号 | L4 源码锁 |

## 五、发布后独立验收（本会话，2026-09-26 晚）

按"不信自报、独立复跑"纪律对 v2.32.0 全量验收：

- [x] `verifier/v1/run-verifier.sh all` EXIT=0（含 79+1 夹具双态、CLI_AB 215 调用零 diff、golden 对账、自举闭环）。
- [x] `self-check.sh --check-only` 全绿（FACT 81 对账、G20、孤儿资产扫描零）。
- [x] `test-r64-ruby-drill-locks.sh` 5/5；`run-framework-fixture.sh ruby` 双态 PASS。
- [x] Ruby 提取可复现：relations-extract 独立重跑恰 74 边。
- [x] 收口件：README 双 badge v2.32.0、origin/main 同步、Release v2.32.0 Latest、cc-switch 实体档与本地实体 v2.32.0、分支本地/远端零残留。
- [x] **勘误**：发布记录"1152 runs/4126 assertions/0 failures"误记——复跑两次一致为 **1152 runs/4078 assertions/20 failures/0 errors/2 skips**（ruby 4.0.7）。20 个失败全部集中 Rack::Session::Cookie/Pool 规格断言，根因 Ruby 4.0 起 `Hash#inspect` 在 `=>` 两侧加空格（环境漂移，非本轮回归；rack 源码零改动可证）。CHANGELOG 与 GitHub Release 正文已同步勘误。

**留档边界（已知未修）**：rack 2.2.9 在 Ruby 4.0 下的 20 个 Session 规格失败属上游版本线问题（2.2.10+ 已修 base64/inspect 兼容），不在本轮回填；laravel/sinatra 等子规则集细分留待后续轮（composer 通道已就绪，Bundler 依赖字符串通道同理可加）。
