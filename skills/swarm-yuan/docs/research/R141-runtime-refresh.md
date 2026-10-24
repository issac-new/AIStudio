# R141 运行时刷新 + 吸收物化 + 实栈回归轮（trade-forge，2026-10-24）

> 触发：用户指令——research 运行时更新到最新稳定版 + 差异比较与吸收优化 + 全栈回归（vuejs/elementUI/spring/mybatis/sharding-jdbc/druid/spring batch/spring boot/dubbo/rocketmq 生成技能并做典型研发工作）+ 缺陷排查修复 + 发版 GitHub + 离线包（除 npm/pip 可安装插件外）。第八轮同型例行轮。

## 一、移动面（22 行多通道查新，2026-10-24 实测；宿主克隆 8 仓同步刷新）

| 运行时 | R140 基线 | 远端最新 | 判定 |
|---|---|---|---|
| openspec | 1.14.3 | **1.15.0**（minor） | **移动·minor**（standalone 二进制安装免 Node.js+SHA256SUMS 随发/**`update --dry-run` 变更预演**（add/change/delete 三态不写入，--json 机读）/--json 命令不载 spinner/REMOVED 需求按精确名匹配 baseline；dry-run 理念本轮物化见 §三） |
| claude-code | 2.1.309 | **2.1.310**（1 patch） | **移动**（Monitor 工具与插件 monitors 在 Bedrock/Vertex/Foundry 及遥测禁用通道补齐/网关拒绝 effort beta 值去参降级重试/cleanupPeriodDays 极大值误删近期文件修复/密文本压缩舍入修复/MCP 超时 elicit 未答错误改述「勿重试」/Git Bash 缺失 hook 放行修复；live CLI 已自升 2.1.310 漂移维持零） |
| claude-mem | 15.0.1 | **15.0.2**（1 patch） | **移动**（**observer 默认禁 reasoning**——reasoning token 吃满输出预算=会话零观察，观察与推理预算隔离；finish_reason=length 空回复降级重试一次+两 Attempt 计费入账；npm=GitHub 双通道同步） |
| graphify | 0.9.94 | **v0.9.95**（21 社区 PR）+ **v1.0.0** | **移动·安全+保真 patch**（mkstemp 随机名+O_EXCL 防预埋符号链接劫持写入/类型别名四语言提取（Py/Go/C++/Rust）/C# 重载按参数数分节点/**YAML 结构化提取**（safe_load+有界 1MiB/500 pairs/depth 6+数据密集型跳过）/**EXTRACTED 虚假认证修复**（bare call 借模块同名导入被提升→降回 INFERRED：边保留认证不虚标）/SSRF 补 multicast/二进制媒体不算文本/AST cache 第四连升；**v1.0.0 异源线正式化记档**——GitHub API compare 实测与 v0.9.95 diverged（ahead 28/behind 2533），pip graphifyy 通道未跟进仍 0.9.95 双通道分裂，v8 世系判定不变） |
| ruflo | 3.59.17 | **3.61.1**（2 minor+2 patch） | **移动·实质**（**ruRE 静态逆向六工具安全边界三件套**：只解析不执行+字符串全过 AIDefence 门+screened:false 如实披露+rureFolders 白名单/symlink 全链拒/install 级写先问；**虚假成功族再四例**：prune 删光报成功/gh 失败报成功/score 0 记 0.8/`update all` 忽略 --dry-run（声明-消费对账族第八至十一例）；agentbbs `..` 路径逃逸/MCP session id 改 randomUUID/**CI：插件文件变更 plugin.json 版本必须升否则红**（与本仓 facts 机器锚同构）/TS7 native compiler） |
| gstack | tip b04cc358 | **tip 6f7488a70**（v1.91.183-185 三提交） | **移动（tip）**（**拒绝的 API key 判 INFRA 不判断言红**——被拒凭据曾伪装 131 断言失败触发整轮重跑：基础设施故障与断言失败分离/office-hours 生命周期测试改 fake timers（真实时间不可控就不测真实时间）/plan-design focus 评级平实词语） |
| diagram-design | 2.6.119 | **2.6.120**（main 0b9b10cab 两提交） | **移动·物化刷新**（取用范围一处字节差异：skills/.../mermaid_extract.py **fragment digest 区域摘要**（REGION_KEYWORDS：alt/else、par/and、critical/option+unlabeled 显式）；gates/verify-geometry.py 零变化；上游仓库级 verify-mermaid-import.py（1523 行）维持不取（R124 选型口径）；MANIFEST/facts/test-r122/capability-map 四处同步） |

零移动 15 行：codex（stable rust-v0.164.0 不变，0.165.0-alpha.1 预告线）/comet 0.5.0/gsd-core 1.18.0/ocr 1.13.3/superpowers 7.0.1/ECC 2.2.3/impeccable cli-v4.7.0/codex-security npm-v0.6.0/dsh dsh-v0.2.1-rc.3/pua 3.5.1/semantica tip 22109ee0 持平/mattpocock v1.3.1+tip 5beb35b04 持平/pi 1.4.0/codegraph 未接线/GitNexus license-risk 不追。

宿主克隆面（research/ 8 仓）：claude-code→v2.1.310、kimi-code tag/npm 2.3.1 零移动但 main +21 提交记档（**Plan mode 留给用户且每 plan 评审**/会话锁接管 exited process 遗锁/Tower per-spawn 模型选择/MCP discovery 完成前不宣告工具/TS7）、minimax tag v0.6.5/npm 0.6.12 零移动 main 新增五提交记档（**compactionTriggerAt 自动压缩触发阈值可调**/ACP launcher+不清共享 .builtin-skills/Google BYOK via Pi/M3.1 Flash 默认/OSC 7501）、multica 0.7.0 后 1 docs 提交（薄）、codex/deepseek-harness/dsh-TUI/zcode 零移动。

本轮主题观察：**预演与实际的对账**（openspec dry-run、ruflo update all 忽略 dry-run=声明不消费反例）+ **辅助通道预算隔离**（claude-mem observer reasoning 挤爆输出预算）+ **认证不虚标**（graphify EXTRACTED 借光降级、gstack INFRA 与断言分离——证据的等级与归因都不许借）。

## 二、吸收（六档过决策 46 两问）

| 档 | 落点 | 一句话主题 |
|---|---|---|
| claude-code-capabilities 2.1.310 节 | 降级通道能力对齐（企业/受限通道不是能力黑洞）/去参降级重试（按对端拒绝面门控）/审批信息含真实落点/错误信息面向消费者给行动指引 |
| code-graph-tools v0.9.95 条 | mkstemp 写入安全基线/类型别名入图谱/YAML 结构化≠全提取（数据与结构要分）/EXTRACTED 认证不虚标/SSRF multicast |
| subagent-orchestration v3.60-3.61 节 | ruRE 安全分析边界三件套（不执行/洗字符串/如实披露）/虚假成功族续案/版本锁 CI 门禁；另 kimi main 前进记档+minimax main 前进记档两节 |
| review-methodology v1.91.183-185 增量 | INFRA 与断言失败两类结论（归因错=浪费整轮重跑）/fake timers/评审措辞即接口 |
| review-methodology openspec 1.15 增量 | 变更预演先于执行（时机门与内容面互补）/基准对照精确键匹配/发布物完整性随发 |
| memory-persistence v15.0.2 行 | 观察通道与推理通道预算隔离/降级重试有界且入账/计费诚实面 |

同构不吸收（要点）：openspec standalone 二进制安装（本仓离线包通道已覆盖同构面）/ruRE CUDA 分析（无二进制分析场景）/ruflo console 页（产品面）/kimi streaming UI/impeccable 零移动。

## 三、物化（上游理念 → 生成器能力，一项）

| 能力 | 上游理念 | 实现 | 锁 |
|---|---|---|---|
| `--upgrade --dry-run` 变更预演 | openspec 1.15.0 `update --dry-run`：升级动作先预演后执行，变更面可见才可裁决 | generate-skill.sh：暂存副本走完整升级流程→diff 原件输出 add/change/delete 三态清单→丢弃暂存；暂存放系统 TMPDIR（目标目录零触碰）、不落 trace 台账（项目零写入）；`--dry-run` 单独使用 fail-closed exit 1；在途门对预演放行（零写入无斜切风险）真升级仍拦截 | test-r141 ①a-④b 十断言（旗标守卫/三态报告/零写入快照对账/无残留/预演 change 集=实际升级 change 集/在途门边界） |

## 四、实栈回归（trade-forge 十框架场景，技能自 R141 生成器全新生成）

### 4.1 全新生成（Step 1-13 真实执行）

框架检测 10/10（spring-boot/spring-batch/mybatis/dubbo/rocketmq/sharding/vue/element/jest-vitest/druid）；删除旧技能→全新生成（draft 门+断点续传面）→真值回填（precheck.conf 真值/patch 层/PROJECT_SPECIFIC 8 件+framework-knowledge 127 条+USER_FILLABLE 3 件，SKILL.md 置 draft 走 mark-active 三道关）→verify-completeness --strict 零占位符→mark-active 激活（STABILITY_WARN 6 条 advisory 与 R140 基线一致）→--all-full fail 2（branch=master 保护+review-record 任务前置空缺，均为任务前态非缺陷）。

### 4.2 缺陷排查与修复（实抓 1 族根治 + 2 处置 + 1 观察）

| 编号 | 缺陷 | 根因 | 处置 | 锁 |
|---|---|---|---|---|
| D1 | 决策/trace 账本写错侧：R140 会话曾把 D-140-01/02/03 三条决策写进技能侧 `.swarm-yuan/`（正本=项目侧），全新生成技能时碎片被清=证据链断 | trace-log.sh `STATE_DIR` 回退 `$(pwd)`：独立调用+PROJECT_DIR 未导出+CWD 在技能目录内 → 逐字落 pwd | **根治**：PROJECT_DIR 四级解析（--project-dir>env>同目录 precheck.conf>CWD 在 `*/.<host>/skills/<name>` 内上溯项目根>逐字兜底）；state-machine.sh cwd 回退同条带上溯（R126 两侧一致契约延续） | test-r141 ⑤a-⑤d 四断言（无 conf CWD 上溯/conf 优先/项目根不回归/state-machine 两侧一致）+ 四变体手工实测+验链 |
| 处置1 | 生成后 --all-full 首跑 review-record fail（references/review-record.md 任务产物空缺） | ⑦节点审查产物是任务级证据，新技能生成后自然空缺 | 属预期：随真实任务补（任务一/二均已落三要素） |
| 处置2 | spec §5.5 拼装合规声明勾选缺位 fail | spec 模板要求勾选清单 | 任务内补齐（复用既有稳定单元表+四勾选） |
| 观察 | 技能侧 .swarm-yuan 碎片（decisions 2.7K/trace 954B/project-knowledge 1.8K）与项目侧正本（16.5K/176K）并存 | D1 同根因的历史产物 | D-140-0x 三条已并回项目正本（验链 OK）；碎片不复活 |

### 4.3 典型研发工作（两项，九节点全流程；TDD RED→GREEN 实录）

**任务一（fix 并发：CAS 状态流转根治，R140 登记项 T2-D1 收口）**：判向依据的状态进写入条件（Mapper 新原语 `updateStatusIfCurrent`：`UPDATE ... WHERE order_id=? AND status=?` 受影响行数裁决）——消费端与同步路径「读→判向→写」竞态窗口构造性封闭；CAS 0 行重读三分支（等值幂等返回/仍前向可达以重读态重试一次/不可达同步路径异常消费端跳过）。RED 实录=编译红（原语不存在）；后端 **49→45/45**（任务一 39+6：MapperTest CAS 跨库/ConsumerTest 乱序+可达重试/ServiceTest 三分支）+门禁 --all-full **fail 0**/warn 23/advisory 4（feat 分支终态）；九节点产物齐（proposal/spec+§5.5/§19 矩阵/tasks/两份审查三要素）；合入 b5235b6+归档 98a82b7。项目侧登记：消费端与 Service 裁决同形异构（通道语义刻意不同，观察）、裸 updateStatus 收敛后无生产调用方（保留原语）。

**任务二（fix 校验：后端金额容量镜像，R140 登记项收口）**：CreateRequest.amount 补 `@Digits(10,2)`+`@DecimalMax("9999999999.99")`（与前端 AMOUNT_MAX 同源=schema-shard.sql DECIMAL(12,2) 容量）——超上限/三位小数从落库 500 变输入 400（RED 3 红实录：现状放行直连 API 可绕前端直击 DB 溢出）。后端 **49/49**（45+4）+门禁 fail 0/warn 23/advisory 3；合入 525a1b6+归档 886105c/e3581e6。

**自成长反馈回路**：project-fingerprint --write 落新基线（skel_cksum 299240357，c79d7ef）；接口面零变化（reference-manual §6.1 无需演化）。

**任务族小结**：两任务后端 49/49、门禁终态均 fail 0、九节点产物与状态机归档全链两例实证；生成器缺陷 1 族根治（D1）+2 处置；项目侧登记 3 项（同形异构观察/裸 updateStatus 保留/customerName 空格另立）。

### 4.4 并行会话事件实录（处置预案依据）

本会话 worktree（chore/r141-runtime-refresh）在 14:47 被另一 zcode 会话写入两笔提交（18aec00/37774d1）——内容=本会话在途改动的 checkpoint 化（基线表/吸收/dry-run 实现/test-r141 前身）+对方增量（usage-manual dry-run 段/tests/index.tsv 登记）。核对：generate-skill.sh HEAD 含本会话 dry-run 实现原样（7 处 DRY_RUN 标记）、无冲突、origin 未动。处置：按 R124「对方消费本会话 worktree」预案——不重置不删提交，在其上继续（bb72322 D1 修复叠加）；收口前复查分支无新增外来提交。

## 五、发版与离线包

- 版本 v2.95.0（CHANGELOG/根 README badge/技能 README badge 三面同步）。
- 最终 sweep 全绿（锁测试 117 个含 test-r141）+ verifier-all + self-check 一致性。
- 发版序：tag 先行（git describe 推版本）→ GitHub Release v2.95.0 → 离线双包（novendor + everything——npm/pip 通道件走目标机源；everything 另带 docs+MIT 源码包）+ SHA256SUMS；offline-manifest 三行钉随发（openspec 1.15.0/claude-mem 15.0.2/graphifyy 0.9.95）。
## 六、并行会话同轮实录（trade-forge 隔离副本，R141 双活合流）

本轮存在两个会话并行执行同号 R141（R126/R131 模式重演，处置见 §4.4）。并行侧在 trade-forge 的独立克隆副本上完成另一组实栈回归，实抓三项（与 §4.2 的 D1 互补）：

| 编号 | 现象 | 根因 | 处置 |
|---|---|---|---|
| R141-X1 | 克隆项目内跑门禁，覆盖率检查读**原目录** jacoco.xml | precheck.conf 的 PROJECT_DIR 是 AUTO:detected 旧绝对路径，--upgrade 保留用户配置时未刷新 | **根治**：升级流程新增 _relocate_project_root（技能目录在新项目根内时刷新 conf/SKILL.md/5 操作档；历史证据不动；外部 target-dir 只告警）。test-r141-relocate 11 断言 |
| R141-X2 | 跨分片汇总 3 行只算 2 行 | COALESCE(SUM(amount),0) 被 ShardingSphere 归并器视为普通表达式，丢失跨表合并 | **根治**：sql 改原生 SUM、空值 Service 归一；sharding 规则库 +第 15 条；fw_sharding_unsupported_sql 增检测；夹具双态锁 |
| R141-X3 | 后端全量 49 errors（JaCoCo Unsupported class file major version 71） | 环境 Maven 跑 JDK 27，JaCoCo 0.8.12 不支持 | 环境前提登记（JDK 17 运行），非产品缺陷 |

并行侧任务结果：fix status-retry-idempotency（同目标状态重试幂等，51/51，门禁 fail 0）；feature trade-summary（GET /api/trades/summary+前端汇总卡，后端 55/55、前端 29/29，门禁 fail 0）；升级预演十框架实测：首轮 change 14/add 1/delete 1，实际升级后复演 change 2/add 1/delete 1（仅版本戳/effects），零写入承诺成立。

双活合流口径：基线表/吸收/物化=两会话同内容取一并集；实抓缺陷 D1（账本落点）+X1（项目根重定位）+X2（sharding 归并）三项各自独立根治；CHANGELOG/evolution 决策（54/55/56）三决策并立。
