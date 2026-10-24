# R124 运行时刷新互补支（2026-10-20）

> 触发：用户三目标指令——research 运行时更新到最新稳定版 + 差异比较与吸收 + 全栈回归（Vue/Element Plus/Spring Framework/MyBatis/Sharding-JDBC/Druid/Spring Batch/Spring Boot/Dubbo/RocketMQ）+ 缺陷修复 + 发版/离线包。
> **双会话分流**：并行会话已完成 trade-forge JVM 全栈回归并发布 **v2.88.0**（`docs/research/R124-jvm-fullstack-regression.md`，含 druid pomga 与 method_size 目录排除等 10 项缺陷）。本档只记本支独有面：v2.87.0 之后的 8 个运行时新移动、commerce-forge 第二全栈样例、D3-D5 locale/预算修复；D1/D2 本支独立复现，合并时采用 v2.88.0 的更完整方案，不重复登记。发版 v2.88.1。

## 一、移动面

| 运行时 | R123 基线 | 远端最新（2026-10-20 实测） | 判定 |
|---|---|---|---|
| claude-code | 2.1.303 | npm **2.1.304**；archive tag v2.1.304；live CLI 同版 | **移动**（29 项：审批裁决人 `decider:"person"`/只读 `e.isReadOnly`/被跳过 hook 可见/后台不可绕过 max-turns/失败热重载保留旧版/恢复前成本披露/`rm -r` 挂载盘提示补全；入 claude-code-capabilities v2.1.304 节） |
| ruflo | 3.57.0 | npm **3.57.2**；GitHub v3.57.2 | **移动**（假成功清剿/终态归还资源/显式路径裁决；入 subagent-orchestration v3.57.2 段） |
| codex-security | 0.4.0 | npm **0.5.0**；GitHub npm-v0.5.0 | **移动**（时间预算分阶段约束/宿主 validate+classify/证据完整性/用量下限/删 preflight；入 codex-security-methodology v0.5.0 节） |
| ocr | 1.13.1 | GitHub **v1.13.2**（2026-10-20T03:17Z）；live CLI 1.13.2；npm 1.13.2 | **移动**（Shader/Nushell/PowerShell 审查语言 + `scan --path` 文件系统解析并拒绝不存在路径；入 review-methodology R124 增量；修正表行 latest 列长期滞后） |
| impeccable | cli-v4.6.0 | **cli-v4.7.0**（2026-10-19） | **移动**（桌面/WebView CDP 检测面 + engine 0.1.16 排版检查；入 frontend-design-methodology 十三B） |
| gstack | main 6a4ab69dc | main **85b0f531f**（17 提交，v1.91.162） | **移动**（no-findings 只算结论/Dart+Flutter scope/嵌套仓可扫/故障隔离/Bun 入口忽略被审仓配置；入 review-methodology R124 增量） |
| mattpocock-skills | main 49dd158（tag v1.3.1） | main **5beb35b04**（tag 仍 v1.3.1） | **移动（tip）**（in-progress/chief-of-staff 记忆 dated+commit-cited wiki；物化不取，只吸收方法层——入 mattpocock-skills-methodology §七） |
| diagram-design | main 550fd66 / 2.6.110 | main **f2f4d49ea / 2.6.115** | **移动**（Mermaid 头行分号保真/SVG 条件样式与动画命名空间/不可支持嵌套写前 exit 2；运行时整目录刷新，入 diagram-production-methodology 七A） |

零移动 14 行：openspec 1.14.3 / codex 0.163.0（0.164 全 alpha 不取）/ comet 0.4.5 / gsd-core 1.18.0 / claude-mem 14.0.1 / graphify 0.9.92 / superpowers 7.0.0 / ECC 2.2.3 / dsh dsh-v0.2.1-rc.2 / pua 3.5.1 / semantica v0.7.0（tip 34359a1dd 持平）/ pi 1.3.0 / codegraph v1.6.2（watch 未接线）/ GitNexus 1.6.12。

live CLI：claude **2.1.304**（npm i -g 本轮同步，允许 postinstall 后原生二进制恢复）、codex 0.163.0（=最新 stable）、ocr 1.13.2、claude-mem 12.4.7（安装态滞后，记档）、ruflo 3.56.10（安装态滞后，记档）。

归档仓：`ncwk/upstream/claude-code` checkout v2.1.304；`swarm-yuan/research/` 建立 claude-code/codex/deepseek-harness/dsh-TUI/kimi-code/minimax-code/multica/zcode 八条 symlink（gitignored），指向归档 clone，供源码阅读与版本核对。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| claude-code-capabilities v2.1.304 | **审批裁决归属需结构化**（decider person：无人可问即拒）+**只读能力声明**（isReadOnly）+**钩子跳过可见**（被跳过必须记录）+**运行预算不可被编排穿透** | 目标技能宿主 hooks/子代理调度/门禁失败披露；R124 节 |
| subagent-orchestration v3.57.2 | **成功文案须由效果派生**（假成功清剿三连）+**终态归还资源**（索引/槽位/临时文件）+**显式路径裁决与项目作用域** | 编排器/memory/策略账本；R124 段 |
| codex-security-methodology v0.5.0 | **时间预算按阶段声明约束力**（advisory vs 强制）+**证据核验与严重度裁决分离**+**修复输入须完整证据**+**用量下限口径** | 安全扫描/证据门禁；R124 节 |
| review-methodology R124 增量 | **no-findings 只在评审执行后成立**+**语言/框架进入 scope**+**单点故障不阻塞全局**+**执行入口忽略被审仓配置**+**扫描路径必须存在**（ocr） | 独立审查节点/评审门禁；R124 增量 |
| frontend-design-methodology 十三B | **检测面覆盖真实窗口形态**（浏览器/桌面 CDP）+**检测器版本化** | 前端审查；R124 节 |
| mattpocock-skills-methodology §七 | **记忆按日期归档 + 结论带提交引用**（无锚记忆优先复核） | 知识生命周期/memory-writeback；R124 节 |
| diagram-production-methodology 七A | **导入保真覆盖单行紧凑写法**+**导出保留条件语义**+**不可支持形态写前失败** | 图表生产/导出；R124 节 |
| review-methodology ocr 行 | **语言审查面扩展**+**缺失路径不得当空扫描** | ocr 5 维审查消费面；R124 增量 |

本轮主题观察：**“执行过”与“成功”分离**（claude-code 钩子跳过可见 + ruflo 假成功清剿 + gstack no-findings 只算结论 + ocr 路径必须存在）——证据链从“调用发生”推进到“效果被观测”；**授权/预算/证据的结构化**（decider/时间预算/完整 sealed findings）同向。

## 三、全栈回归样例 commerce-forge

样例 `/Users/cuishi/lab/commerce-forge`：后端 Spring Boot 3.5.16 + MyBatis 3.0.5 + ShardingSphere-JDBC 5.5.3（t_order/t_order_item 按 user_id 分表，t_dict 广播）+ Druid 1.2.24 + Spring Batch 5.2（独立原生 H2 元数据源）+ Dubbo 3.3.6（profile）+ RocketMQ client 5.5.1（profile）+ H2；前端 Vue 3.5 + Element Plus 2.11 + Pinia 3 + Vite 7 + Vitest 3。基线后端 18/18、前端 7/7、双端 build。

**生成链**：detect-frameworks 初跑 10 框架（漏 druid）→ 修复信号后 11 框架全中（spring-boot/spring-batch/mybatis/dubbo/rocketmq/sharding/vue/element/vite/jest-vitest/druid）→ standard 骨架 → `--inject-frameworks`（11 框架，区块 sha=476053696）→ AI 填充（framework-knowledge 11 框架 129 条规律全带证据 / codebase+dev-guide+reference-manual+recipes+workflow+release / decisions.jsonl 2 条含 Generator defect 修复）→ `--verify-completeness --strict` 零占位 → `--mark-active`（框架 glob + spec-first 联动全过）。

**Task A（feature：订单金额区间筛选）**：后端 `OrderQuery.minAmount/maxAmount` + XML 下推 + Service 倒置校验；前端 Element Plus 两个 `el-input-number` + 组件/store/API 测试。红测（后端编译失败 + 前端 API 断言失败）→ 绿：后端 20/20、前端 11/11、双端 build。

**Task B（fix/test：批量导入幂等）**：新增“同一 CSV 重复导入”用例（第二次导入走存在性更新）；注入“忽略存在性检查”缺陷后，测试精确报 `DuplicateKeyException`（T_ORDER_0 主键冲突）且 job FAILED；复位后全绿。证明测试对真实缺陷有咬合力。

**Task C（fix：状态流转守卫）**：仅允许 `CREATED → PAID/CANCELLED`；`PAID/CANCELLED` 再流转返回 409（`ApiExceptionHandler` 新增 `IllegalStateException` 映射）。后端 24/24。

**门禁**：`precheck.sh --all` fail 0；`--all-full` 50 门禁 fail 0（29 调用/27 执行/2 未配置跳过，35 warn/5 advisory），11 框架门禁全部通过（sharding 9 项含 UPDATE 分片键/广播只读/排序分页分片键；dubbo 13 项；rocketmq 10 项；mybatis 15 项；spring-boot 13 项；spring-batch 13 项；vue 5 项；element 12 项；vite 7 项；jest-vitest 6 项；druid 4 项）。前端覆盖率阈值已入 `vite.config.js`（lines/statements 80、branches 70、functions 75），`vitest run --coverage` 通过（89.08/87.17/78.94/89.08）。RUNTIME-OK。

## 四、缺陷排查与修复

1. **D1/D2（与 v2.88.0 重叠，本支独立复现）**：D1 detect-frameworks 漏探裸坐标 `com.alibaba:druid`；D2 method_size 扫进 `node_modules`（commerce-forge 前端 101 条第三方方法噪音）。v2.88.0 已分别用 **pomga 成对精确匹配**（避免误伤 org.apache.druid）与 **两处 find 排除 node_modules/target/dist/build/vendor/.venv/venv** 根治；本支合并时采用该方案并删去临时的宽 `druid|druid|pom` 信号与重复态6，commerce-forge 复跑 11 框架/告警清零确认。
3. **D3 self-check 认知层数检查在 C locale 下误报**（生成器）：`[5五５]` 字节类在 C locale 不匹配多字节“五”，且中文数字类会把“第”的尾字节带入匹配；合法“五层认知基底”被判漂移。修复：只扫 ASCII 数字计数形态 `[0-9]+层认知(框架|基底)`，过滤 `^5层`；self-check RC=0。
4. **D4 gate-rules 多字节分隔符在 C locale 下截断**（生成器，sweep 实抓）：`sed 's/→.*$//'` / `sed 's/[；;]...替代...//'` 按字节匹配，中文 justification 变 `M-oM-<...` 乱码，`test-gate-rules` 态15b 失败。修复：改用 bash 参数展开按字面分隔符切分，locale 无关；态15b 转绿。
5. **D5 预算/版本口径漂移**（文档）：references 吸收增量 608634B 超原预算 598016B；按决策 38 逐例登记上调 614400B（+16KiB），同步 facts.conf/README/four-theories/test-doc-numbers；ocr 表行 latest 列长期停在 1.12.13，同轮修正为 1.13.2。

## 五、完整回归（生成器侧）

- 本支合并前 `run-sweep.sh`：73 通过 / 1 失败（`test-gate-rules` 态15b，D4 修复后单测转绿）；合并 v2.88.0 后在合并态重跑 sweep，作为 v2.88.1 的权威结果（详见 §六）。
- 单点已跑：`test-detect-frameworks` PASS（含新态6）、`test-r122-diagram-capability` 35 ok/0 fail、`self-check --check-only` RC=0、`test-doc-numbers` 124/0、`test-r68-jargon-free` 17/0、`test-r118-release-hardening` PASS。
- verifier/v1 all、三条 e2e（注入链路/生成产物 mark-active/字段变更传播）在 sweep 内全绿。

## 六、实际执行记录（2026-10-20）

1. 运行时：更新 claude-code live CLI/归档到 2.1.304；diagram-design 整目录刷新到 2.6.115；research 目录 symlink 落位。
2. 吸收：8 档 references 增量；基线表 8 移动/14 零移动；offline-manifest 同步 claude-code/codex-security/ocr。
3. 回归：commerce-forge 生成链 + Task A/B/C；后端 24/24、前端 11/11、双端 build、precheck --all/--all-full fail 0、RUNTIME-OK。
4. 缺陷：D1-D5 全部修复并追加回归锁（D1 态6、D3/D4 单测/sweep 复跑）。
5. 合并 v2.88.0（trade-forge 轮）→ 解决 CHANGELOG/gates-warn 冲突，采用 pomga/目录排除方案 → 合并态三门禁 + sweep → 发版 **v2.88.1** + `--no-vendor` 离线包（见 CHANGELOG）。
