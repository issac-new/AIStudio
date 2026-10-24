# R140 运行时刷新 + 吸收物化 + 实栈回归轮（trade-forge，2026-10-24）

> 触发：用户指令——research 运行时更新到最新稳定版 + 差异比较与吸收优化 + 全栈回归（vuejs/elementUI/spring/mybatis/sharding-jdbc/druid/spring batch/spring boot/dubbo/rocketmq 生成技能并做典型研发工作）+ 缺陷排查修复 + 发版 GitHub + 离线包（除 npm/pip 可安装插件外）。

## 一、移动面（22 行多通道查新，2026-10-24 实测；宿主克隆 8 仓同步刷新）

| 运行时 | R132/R137 基线 | 远端最新 | 判定 |
|---|---|---|---|
| codex | rust-v0.163.0 | **rust-v0.164.0**（330 提交，stable 2026-10-23） | **移动·实质 minor**（插件 hook 审批绑定内容指纹/代理间消息 hooks/观察型 hooks/失败压缩不留部分摘要/resume 恢复线程设置/受管配置来源 fail-closed；R132「0.164 全 alpha 不取」口径失效；入 codex-methodology R140 段；归档仓 checkout rust-v0.164.0；live CLI 0.163.0 滞后一版升级窗口待用户） |
| claude-code | 2.1.306 | **2.1.309**（307/308/309） | **移动**（safety_event 拦截遥测/HTTP MCP 幂等门控重试/无人值守快速失败第二例/沙箱外执行修复/Bash 权限三旁路补全/sed -i 真实执行；入 claude-code-capabilities 2.1.307-309 节；live CLI 已自升 2.1.309 零漂移；归档仓 checkout v2.1.309） |
| comet | 0.4.5 | **0.5.0**（minor，#491 主体） | **移动**（升级门=在途任务先收口/恢复先决=旧执行确认全停/eval 产物拒符号链接不完整不计分/SDK 化；入 subagent-orchestration comet 节；**升级门理念本轮物化**见 §三） |
| codex-security | 0.5.1 | **0.6.0**（19 提交，2026-10-22） | **移动·minor**（厂商报告导入分离账本/严重度多数票评审失败不回退不存部分票/hosted 修复 CLI 化+static 验证作用域声明；入 codex-security-methodology v0.6.0 节） |
| pi | 1.3.0 | **1.4.0**（81 提交） | **移动**（摘要预算自适应模型上限/饱和=排队/恢复配对不变量/grep 不继承 RIPGREP_CONFIG_PATH；project trust 门零演化实测；机制源未接线维持记档） |
| dsh | rc.2 | **dsh-v0.2.1-rc.3**（6 提交 640 文件，机制面零变化） | **移动·薄**（models 列表降级保真/不能服务模型网络 I/O 前拒/失败归因请求面；入 dsh-engineering-methodology 注记） |
| graphify | 0.9.93 | **v0.9.94**（35 提交 19 社区 PR） | **移动·实质 patch**（摄取安全前置校验+重定向全程复检/MCP 拒近似匹配给候选/解析不猜测三族/T-SQL 独立一遍/设计性跳过与失败性跳过分账；**v1.0.0 异源诱取第十三例**实测 merge-base exit=1 两线 81a43f0 分叉；入 code-graph-tools v0.9.94 条） |
| ruflo | 3.59.8 | **3.59.17**（9 patch） | **移动·修复族**（**声明面-消费面对账族四版七实证**：camelCase 存键 kebab 读键=旗标从未生效，含 update --public-key 从未加载密钥=签名验证从未运行/分页后计数第 6-7 例/锁活性 recent≠live/恢复误删 pair 先查捆绑消费方；入 subagent-orchestration v3.59 节注记） |
| superpowers | 7.0.0 | **v7.0.1**（2 提交形式薄方法论实质轮） | **移动**（**20k 压缩截断防线**：宿主压缩后重挂载技能在 20000 字符处截断、7.0.0 实测 subagent-driven-development 32,577B；对策=references 按需读+体积守门测试；brainstorming 先挖后问 24/24→3/24；入 subagent-orchestration v7.0.1 段；**体积防线本轮物化**见 §三） |
| gstack | b616d6c53 | **b04cc358**（v1.91.174-182 九提交） | **移动（tip）**（契约指纹忽略编译产物 shebang 噪声+读兼容迁移/flaky 台账保留失败断言第三例/工作流无 token 扫描 fail；入 review-methodology R140 增量） |
| semantica | 769ff036f | **22109ee0**（10 提交，pillow 公告处置主线） | **移动（tip）**（解码围栏：allowlist 按内容探测+检查消费同一快照 TOCTOU 围栏/豁免生命周期两端：授予带可达性论证+修复一可装即删/暴露面按真实解码路径/Cypher 引号缺失=关系永不匹配；入 exploration-guide R140 增量） |
| ocr | 1.13.2 | **1.13.3** | **移动·薄**（空 code_comment 批如实报告/MCP tools/list 分页；只升表行） |

零移动 10 行：openspec 1.14.3 / claude-mem 15.0.1 / gsd-core 1.18.0 / ECC 2.2.3 / impeccable cli-v4.7.0 / pua 3.5.1 / mattpocock v1.3.1（tip 5beb35b04 持平）/ diagram-design 2.6.115→**2.6.119 仅升锚**（取用范围零字节差异：skills/ 整目录+verify-geometry.py+LICENSE 与 2.6.115 逐字节相同，版本号在 plugin manifest——不取清单内）/ codegraph watch 未接线 / GitNexus license-risk 不追。

宿主克隆面（research/ 8 仓）：claude-code→v2.1.309、codex→rust-v0.164.0、deepseek-harness→rc.3、kimi-code→**2.3.1**（实质 minor：**hooks cwd 修复为项目目录**——本仓 L1 渲染命令用绝对路径（ta_hook_path 解析），不受 cwd 语义变化影响，接线核对无需改动；dangerous_command_guard=false 关闭面扩大到全部内建确认守卫=「升级即隐式放宽」第三例，入 claude-code-capabilities 跨宿主题条目；**Tower**=worktree+只读 reviewer+只合并过检查分支的宿主化编排实证，入 subagent-orchestration）、multica→v0.7.0、dsh-TUI v0.16.1/minimax/zcode 零移动。**minimax 勘误**：v0.7.0 不存在（git tag 与 GitHub releases 止于 v0.6.5；npm @minimax-ai/code 已到 0.6.12——tag 滞后 npm 七 patch 通道分裂记档，克隆维持 v0.6.5 tag 口径；main 面 Plugin V1 包契约+零依赖校验器+测试向量三件套为宿主集成面实质新增，记档不吸收）。

live CLI：claude 2.1.309（零漂移）/ codex 0.163.0（滞后 0.164.0 一版，升级窗口待用户）。

本轮主题观察：**「声明面-消费面」对账**（ruflo 旗标键失配族七实证+签名验证从未运行、kimi dangerous_command_guard 关闭面扩大、codex 受管配置来源 fail-closed——配置/旗标声称的支持与实际消费之间的缝，是配置型系统的共性缺陷面）+ **截断与失能线**（superpowers 20k 截断、pi 摘要固定上限挤爆、codex 失败压缩污染历史——上界与失败中间态的治理）。

## 二、吸收（八档过决策 46 两问）

| 档 | 落点 | 一句话主题 |
|---|---|---|
| codex-methodology R140 段 | hooks 审批绑定内容指纹（反哺激活门禁：技能内容变更须重过门禁）/失败压缩不留部分摘要（执行过≠成功第三波）/resume 恢复线程设置（恢复保真族扩到模型设置） |
| claude-code-capabilities 2.1.307-309 节 | safety_event 拦截遥测/幂等门控重试/跨工具按效果路径统一执法/kimi 升级即放宽第三例 |
| codex-security-methodology v0.6.0 节 | 多数票裁决失败不回退继承值（把不确定性伪装成结论）/厂商证据分离账本/验证模式作用域声明 |
| code-graph-tools v0.9.94 条 | 摄取安全前置+重定向复检/MCP 拒近似匹配给候选/解析不猜测/v1.0.0 异源第十三例 |
| subagent-orchestration v7.0.1 段+v3.59 注记+comet 节+kimi Tower 记档 | 20k 截断防线/声明-消费对账陷阱清单/升级门与恢复先决/worktree+只读 reviewer 编排不变量 |
| review-methodology R140 增量 | 契约指纹排除编译噪声（语义变更 vs 构建噪声）/flaky 台账保留失败断言 |
| exploration-guide R140 增量 | 校验与消费同一快照（TOCTOU 围栏）/豁免生命周期三件套 |
| dsh-engineering-methodology 注记 | models 列表降级保真+不能服务模型网络 I/O 前拒 |

同构不吸收（要点）：codex 企业 MCP 认证族（无宿主代理面）/comet Any·Dashboard·SDK（产品面）/pi schema 派生配置文档（facts+渲染已是等价实践）/gstack 工作流 token 扫描（self-check 扫机器锚同构已覆盖）/semantica 测试断言调用面（R115 已覆盖）/minimax Plugin V1 契约（生成产物是技能目录非插件包）/dsh 导航 UI。

## 三、物化（上游理念 → 生成器能力，两项）

| 能力 | 上游理念 | 实现 | 锁 |
|---|---|---|---|
| 生成物 SKILL.md 20k 硬顶 | superpowers 7.0.1：宿主压缩后重挂载技能在 20000 字符处截断、其后内容整会话消失；上游对策=references 按需读+体积守门测试 | `FACT_SKILLMD_BYTES_HARD_CAP=20000`（facts.conf）+ gen-e2e §7.6b 硬顶断言（两档防线：预算 11392 可按先例再登记，硬顶锚宿主行为不可越——超线须裁正文或移 references/） | test-r140 ①a-①e（含变异：硬顶改 4096 后判定翻转） |
| --upgrade 在途状态门 | comet 0.5.0 升级门：升级即破坏性变更，在途任务先收口（Native/Classic 升级前须完成并归档） | generate-skill.sh 升级分支前置检查：项目 `.swarm-yuan/state.yaml` phase ∈ {design,build,verify,operate} → exit 2 点名 change/phase 与解除路径；open/archive/无状态放行；`SWARM_YUAN_UPGRADE_ALLOW_INFLIGHT=1` 显式豁免 | test-r140 ②b-②e 四态矩阵 |

kimi L1 hooks 接线核对（2.3.0 hooks cwd 修复的连带核验）：渲染命令 `bash "<绝对路径>" --host kimi`（ta_hook_path 解析绝对路径）——cwd 语义变化不影响，零改动。

## 四、实栈回归（trade-forge 十框架场景）

### 4.1 全新生成（Step 1-13 真实执行）

框架检测 10/10（spring-boot/spring-batch/mybatis/dubbo/rocketmq/sharding/vue/element/jest-vitest/druid）；骨架生成 → 三路探查+工具链（relations-extract/framework-evidence/inventory-verify）→ 真值填充 14 文件（REST 端点 6+Dubbo 方法 2+MQ tag 2+Batch job 1、实体 9、mapper 语句 9、前端视图 2/store 1/api 5、测试后端 30 @Test/前端 19 it()、框架规律 127 条行号核验）→ verify-completeness --strict 零占位符 → mark-active → --all-full fail 1（branch 环境项，决策留痕）/warn 25/advisory 4。inventory-verify 12 维 ratio 1.00、HALLUCINATION 0。

### 4.2 缺陷排查与修复（真实填充轮实抓 7 项：5 根治 + 2 处置 + 1 勘误）

| 编号 | 缺陷 | 根因 | 处置 |
|---|---|---|---|
| G-D1 | mine-habits.sh 写 PROJECT_DIR（探查越界） | — | **勘误不成立**：`--out` 选项本就在位（mine-habits.sh:23），默认落盘+路径披露是文档化设计；代理报告未核对选项面 |
| G-D2 | precheck fail 后写 PROJECT_DIR/.swarm-yuan/.gate-fail-flag | — | **属设计**：fail-gate-hook 据此放行/拦截 Write/Edit 的契约面；绿态覆盖式运行自动清除（precheck.sh R126 逻辑），非缺陷 |
| G-D3 | temp target-dir 部署形态门禁文件锚失效：CWD=PROJECT_DIR 使 references/ 相对解析落到项目根或 .claude/skills 旧技能 glob（review-record 误报 missing 需绝对路径覆盖、domain 读到旧技能 reference-manual 判缺段） | SKILL_DIR 未全局注入，仅 check_review 局部回退 | **根治**：precheck.sh 在 _CONF_DIR 后注入 `SKILL_DIR="${SKILL_DIR:-$_CONF_DIR/..}"`；domain.sh reference-manual 候选列首位加技能根 | test-r140 ③a/③b/③c（诱饵双放不命中）+ trade-forge 实路径复验 |
| G-D4 | check_domain 客观规律扫描吞构建产物（frontend/coverage/sorter.js 的 innerHTML 被计违规） | _scan_src 排除词表只有 test/mock/node_modules 等 | **根治**：四条扫描线词表补 `coverage\|dist\|target` | test-r140 ④ + 实路径 coverage 零命中 |
| G-D5 | --all-full 全局 SILENT=1 吞 warn 输出但 WARN_COUNT 照加（28 warn 日志零 ⚠ 行，汇总与输出不可对账） | SILENT 本意压未配置噪音，误伤实质 warn 可见性 | **根治**：汇总段新增压缩披露行「⚠ 压缩明细：N 条 warn 未逐条显示（单跑该门禁或 --all 可见明细）」（沿 WP-S1 跳过披露同款） | test-r140 ⑤ + 实路径 25 warn 披露一致 |
| G-D6a | check_upstream_baseline 目标技能侧无 docs/upstream-baseline.md 时 warn「属正常」计入 WARN_COUNT | — | **评估后不改**：注释明示 golden 口径依赖（执行统计与历史 golden 一致），消息已自述正常；改判 skip 需 golden 三态联动、收益低 |
| G-D6b | framework-evidence 证据台账把 backend/target/classes、frontend/coverage 产物副本算 hits（mybatis-r10/element-r1 证据落在产物上，虚增命中误导实例化） | 证据净化过滤器缺 target/coverage 两词 | **根治**：过滤器 alternation 补 `target\|coverage` | test-r140 ⑥ |
| G-D7 | 同门禁族两套文件名口径互相矛盾：check_review 今日留痕自定命名 YYYY-MM-DD.md，check_review_record 只认 *review*/*评审*——按姊妹口径命名的真实记录（trade-forge docs/reviews/2026-10-20.md）反判 missing | 两检查独立演化未对账 | **根治**：review-record.sh find 接受 `20XX-XX-XX*.md` 日期命名；三要素内容检查不放松（缺要素仍 fail） | test-r140 ⑦a/⑦b + trade-forge 实路径复验（含两份历史记录补显式评审人/日期/结论字段） |

### 4.3 典型研发工作（三项，九节点全流程；技能自 R140 生成器全新生成并激活）

**任务一（feature 全链：交易日报聚合端点）**：GET /api/trades/daily-report?days=N（1-30 越界 400）双端交付，GROUP BY DATE 跨 ShardingSphere 分片归并（MapperTest 同日跨 ds0/ds1 实测）+空日补零升序+前端 getDailyReport。拼装 stats 先例零新文件零新依赖（源码+测试 +202 行）。TDD RED 实录（编译红/getDailyReport is not a function）。后端 36/36+前端 21/21+双端构建 rc 0+启动冒烟 RUNTIME-OK（MQ 写路径无 broker 未冒烟披露）。门禁 --all-full **fail 0**/warn 25/advisory 3（首轮 master 开发 check_branch fail→feat 分支+--no-ff 合入消除）；九节点产物齐（proposal/spec/tasks/review-record/docs reviews 三要素留痕）；状态机归档。**实抓生成器两缺陷**：T1-D1 `_default_conf` 无条件置空 SPEC_FILE/CHANGE_IMPACT_FILE（环境通道死代码——修复=条件赋值，与 GATE_RUNS_DIR「先捕获」先例同款问题的就地根治）、T1-D2 `_find_spec_file` glob 序取首个（多 spec 项目永远查最旧——修复=取最新 mtime，spec-first 发现逻辑关键路径）。项目侧发现登记：无 broker 直启失败（T1-D4 项目特性）、reference-manual 接口清单 6→7 过时（T1-D6 留自成长链）、vitest clearAllMocks 不清 once 队列（T1-D5 并入任务三根治）。

**任务二（fix 路由：MQ 消费幂等）**：取证收敛三场景（同进程重复已防/重启后迟到重投回退状态真缺陷/账本无 TTL 无界增长），第二闸改状态机方向判定（复用 TRANSITIONS 单一事实源，等值/回退/非法一律幂等跳过）+第一闸 Set→TTL 账本（1h+容量 10k 惰性清理）。RED 实录+**双注入变异咬合**（方向判定回退→仅回退用例红；TTL 失效→仅 TTL 用例红；双复原全绿）。后端 39/39（jacoco 84.1%→85%）+前端 21/21；门禁 fail 0/warn 22/advisory 3（新增 fw_sboot 双构造器 warn 已消除）；归档。**实抓门禁基建一缺陷**：T2-D3 shift-left plan 发现死清单（候选全模板且模板必被排除→「未找到 plan」恒 warn——修复=.swarm-yuan/tasks.md 候选首位承载 §20 执法，无 tasks.md 项目口径不变）。项目侧登记：并发乱序竞态（T2-D1 后续条件 UPDATE/CAS 根治）、orderId 不一致防御缺口（T2-D2 当前无可达输入）。

**任务三（前端路由：表单校验+测试基建卫生）**：TradeCreate.vue 金额校验谓词单一事实源（必填/正数/两位小数/上限 9999999999.99——锚点=DB 列 DECIMAL(12,2) 容量）同驱 el-form rules 与 formValid 禁用态；T1-D5 根治=全局 afterEach(restoreAllMocks)（三探针实测选型：mockReset 会抹 vi.fn 工厂实现、mockRestore 清 once 队列且恢复原始实现）+mock 卫生互咬回归用例。RED 先行 4 红（含 H2 'LEAKED'→'orig' 队列泄漏实录）。npm test 27/27（既有 21 零修改）+build rc 0；门禁 fail 0/warn 22/advisory 3（check_branch 直接通过未动用豁免）；浏览器走查两帧实录（超上限禁用/合法解禁，RUNTIME-OK）；归档 486e433。项目侧登记：后端无 @DecimalMax（另立加固）、customerName 纯空格宽松（另立）。

**自成长反馈回路（实弹）**：project-fingerprint --write 落基线（94 文件/skel_cksum 548017376）+ 无变化 diff 感知验证；T1-D6 内容演化同步——reference-manual §6.1 接口清单 6→7（daily-report 入册）。

**任务族小结**：三任务后端 39/39、前端 27/27、双端构建 rc 0、门禁终态均 fail 0；九节点产物与状态机归档全链三例实证；生成器缺陷累计 8 项根治（G-D3/D4/D5/D6b/G-D7/T1-D1/T1-D2/T2-D3）+2 处置 +1 勘误；项目侧登记 7 项（broker 依赖/并发乱序竞态/orderId 防御/@DecimalMax/空格校验/IAB 时序观察/日志见各任务报告）。

## 五、发版与离线包

- 版本 v2.94.0（CHANGELOG/根 README badge/技能 README badge 三面同步，r75 L10 锁）。
- 最终 sweep 6/6 全绿：锁测试 116 个 + e2e 三链（注入/生成/字段变更）+ verifier-all（81 夹具双态等）+ self-check 一致性。
- 发版序：tag 先行（git describe 推版本）→ GitHub Release v2.94.0（notes 取 CHANGELOG 节）→ 离线双包（novendor + everything——npm/pip 通道件一律走目标机源安装不入包，everything 另带 docs+MIT 源码包）+ SHA256SUMS。
- sweep 过程修复：r133 走源断言版本钉随 offline-manifest 升级（comet 0.5.0/graphifyy 0.9.94）、README 双 badge v2.94.0。
