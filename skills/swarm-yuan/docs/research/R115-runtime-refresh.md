# R115 运行时例行刷新轮（2026-10-15）

> 触发：用户 /goal 三目标（research 目录运行时更新到最新稳定版+差异比较+吸收+优化+回归+发版）。口径同 R113 例行轮；本轮回归样例按用户点名取**Java 企业栈全量形态**（Vue2/ElementUI + Spring Boot/Framework + MyBatis + Sharding-JDBC + Druid + Spring Batch + Dubbo + RocketMQ），该栈为**首测**。轮号位 R115。

## 一、移动面（3 移动 / 18 零移动）

| 运行时 | R114 基线 | 远端最新 | 判定 |
|---|---|---|---|
| codex-security | npm-v0.2.0 | npm-v0.3.0（tag 2026-10-14；R113 勘误记的「npm 超 GitHub 基线」差位归零） | **移动**（minor 328 提交） |
| dsh | dsh-v0.2.1-alpha.3 | dsh-v0.2.1-alpha.4（2026-10-15） | **移动**（1 alpha 89 提交） |
| semantica | tip b24e2418 | tip 815527cc（2026-10-15） | **移动**（+7 修复批，薄） |
| claude-code | npm 2.1.300 | npm 2.1.300（live CLI 同版零漂移） | 零移动 |
| codex | rust-v0.162.1 | rust-v0.162.1（0.163 全 alpha 不取） | 零移动 |
| claude-mem / comet / ECC / mattpocock-skills / pua / ruflo / superpowers / gstack / harnesseval-w / openspec / gsd-core / graphify | — | 均在最新 | 零移动（tag 口径） |
| gitnexus | v1.6.12 | v1.6.13-rc.107 全 rc 不取 | 零移动 |
| better-harness | v0.6.6 | v0.7.0-alpha2 全 alpha 不取 | 零移动 |

tag 后 tip 前进记档（tag 口径零移动的诚实注记）：ECC +889（main 无 tag 惯例）、gsd-core +29、ocr +5、comet +7、claude-mem +1、superpowers 0。

npm/pip 九通道复扫（offline-manifest ⑰ 轮）：全部追平 R115 基线（openspec 1.14.2 / codex-security 0.3.0 / ocr 1.13.0 / claude-mem 13.39.0 / gsd-core 1.17.0 / graphifyy 0.9.91 / gitnexus 1.6.12 / claude-code 2.1.300 / codex 0.162.1，npm view 与 PyPI json 实测）。

## 二、吸收（每档过决策 46 两问）

| 档 | 两问①（哪个环节缺） | 两问②（谁消费——真实触达） |
|---|---|---|
| codex-security-methodology v0.3.0 段 | 安全扫描门禁的宿主侧参照：验证输入面分离/退出码词表收敛/归属声明优先/报错根因化 | 文档正文引用（CLI 接线层第 4 对象），G15 存在性断言同锚 |
| dsh-engineering-methodology alpha.4 注记 | 宿主桥接与过程纪律参照：版本边界先于消费/静态拒止先于运行/缺失态如实呈现 | 方法论引用层（dsh 机制源档），R88/R105/R112 同构续记 |
| semantica 薄记 baseline 行 | 修复批无新机制原语（镜像只同步确认态/导出保真/测试断言执行路径） | upstream-baseline.md 行内登记（R107 先例同构），不开档 |

本轮主题会师（跨运行时观察）：

- **版本边界先于解析与应用**（dsh 宿主版本三连——先比对 host release 再解析图/跨版本插件更新不应用/版本变更提示重载）：由不同版本算出的状态不消费；判定点从「用后发现」前移到「消费入口」。与 semantica「facade 镜像仅同步已确认更新」同族——未确认/异源状态不得进入可用面。
- **结果词表收敛与诚实化**（codex-security 退出码三值化删 partial/unknown + dsh 缺失退出码不清零/中性呈现/命名随语义）：不可判定态不留词表——要么可判定、要么显式呈现缺失；删中间态优于发明中间态。
- **声明式优先于推断**（codex-security CODEOWNERS 优先 + dsh reasoning 档位从 pi-ai schema 读）：归属与能力面从声明/schema 读，推断只补缺；硬编码能力面退位。
- **静态拒止先于运行**（dsh 包源码 module-scope await 装载前拒绝）：危险形态在装载/解析期拦，运行后报错已是降级。
- **报错带根因**（codex-security config 加载失败给出原因）：坏配置报为什么，不静默——与 R114 followup「报错附 file:line」同向的第二实证。

## 三、缺陷排查与修复（本轮实抓）

1. **R114 存量终态违规 7 处**（发版时未复跑 test-r68-jargon-free 所致——本轮三门禁复跑抓出）：裸轮次标记 R114/R86 ×5（capability-map CLI×5 行 / mattpocock-skills-methodology 定位行+§六标题+物化基线行 / subagent-orchestration pi 行 / task-methodology-router 可及性行）+ 变迁叙事句 2 处 + 禁用自造词「随发」×3（SKILL.md:49 / capability-map / task-router / assets/precheck.sh:1345——规范替换「不随技能分发」）。全部改写为现状描述。
2. **手抄版本行漂移 2 处**：codex-security-methodology.md 头部 v0.1.11、§十二源行 v0.1.4 → 实际基线 v0.3.0 同轮修正（「手抄数字漂移面」预警的第 N 次实证——版本类手抄行须随基线回写，self-check 的版本对账只护及 facts.conf 面）。
3. **dist/ 误跟踪治理**：R113 提交 3d17fc3 将 v2.76/2.77 两份离线包（4084 文件、约 80MB）扫入 git 跟踪（后续轮次均未跟踪、走 GitHub release 资产——R113 为误扫）。本轮 `git rm -r --cached dist/`+`.gitignore` 补 `dist/` 条目，本地文件保留、历史不重写。
4. **吸收文本自纠 2 处**：本轮新增 v0.3.0 段含禁用词「三值化」「空转」与裸 R114 引用，jargon 门禁首跑当场抓出即改（门禁有效性的无意识变异测试）。
5. 预算断言第二十八次登记：references 拷贝体积实测 562231B 超 1079B，成因=本轮吸收注记增量（3 移动运行时），561152→565248（+4KiB 沿决策 38 冻结现状+显式余量形态），facts.conf 登记。

## 四、全栈回归（Java 企业栈首测）

样例 trade-forge（/tmp/r115-sample/trade-forge，master 终态 04056d8）：trade-api（Dubbo 契约模块）+ trade-service（Spring Boot 2.7.18 + Spring Framework 5.3 + Spring Batch 4.3.10 + MyBatis starter 2.3.2 + ShardingSphere 5.2.1 分库分表 ds-{0,1}×T_ORDER_{0,1} 分片键 order_id + Druid 1.2.20 + Dubbo 3.2.10 registry N/A + RocketMQ starter 2.3.1 + H2 2.1.214 MODE=MySQL 测试态）+ trade-web（Vue 2.7.16 + Element UI 2.15.14 + Vite 5.4 + Vitest 1.6 + axios）。

**生成链全绿**：detect-frameworks 11 框架全中（用户点名栈=fixture 库全覆盖）→ 骨架（lite 档）→ --inject-frameworks 11 框架门禁注入（sha 1744594458）→ AI 填充（precheck.conf 37 变量/framework-knowledge 129 规律含证据/reference-manual 三节/SKILL meta 八件/决策 2 条链验 OK）→ --verify-completeness --strict 零占位 → --mark-active active（advisory STABILITY_WARN 6 条如实呈现——契约面无同名测试/churn 信号，属诚实降级非阻断）。

**Java 栈 11 坑实录**（首测排障史，均已根治并复验）：①druid-spring-boot-starter 自动装配叠加空 dataSource 触发 MyBatis 单源条件背退→Mapper 全丢（排除 DruidDataSourceAutoConfigure，池由 ShardingSphere 按 type 内建）；②snakeyaml 1.30 vs ShardingSphere 5.2.1 Yaml 构造器需 1.33 的 setCodePointLimit→NoSuchMethodError（钉 1.33）；③H2 INIT=RUNSCRIPT 不认 classpath: scheme（Spring 语义）→建连失败引发 Druid 无限重试风暴（改模块相对文件路径）；④H2 2.x 不认 1.x 的 BIGINT IDENTITY 语法（AUTO_INCREMENT/官方 GENERATED 形态）；⑤手抄 Batch schema 缺列（JOB_CONFIGURATION_LOCATION）——改用 jar 内官方 schema-h2.sql 原文+幂等 sed，教训「框架 DDL 不手抄」；⑥head -18 截断建表语句致整脚本语法错（重组脚本，jshell 复现定位）；⑦Spring Batch 4.3 对 H2 平台生成 1.x 取序列 SQL（values next value for）→ 自定义 incrementer 工厂；⑧MODE=MySQL 下 seq.nextval（Oracle 风格）与 NEXT VALUE FOR（H2 专有）行为差异——jshell 三语法实证后选 H2 2.x 语法直连路径；⑨Batch 元数据经 ShardingSphere 代理被改写出语法错→批元数据直连 ds-0（SimpleDriverDataSource 同名 mem 库，生产同构独立 schema）；⑩广播路由需表元数据而 H2 大写存储 vs 规则小写名→查表 null NPE——全链表名大写对齐（T_ORDER）根治（分片键精确路由不依赖元数据故 INSERT/UPDATE 先行通过，该差异本身是诊断线索）；⑪有状态 ItemReader 单例缓存空游标跨执行复用→@StepScope。另两处测试面自纠：固定断言类共享 H2 内存库须 @BeforeEach 物理清场；Element UI Dialog 初始 visible=true 不触发 watcher（先关后开）；管道 tail 吞退出码两连（R114 记档坑复踩实录——加 tee 落盘修）。

**研发工作两件全绿**：
- **Task A（feature：订单按用户 ID 过滤，九节点全链）**：spec（含 §5.5 拼装合规四勾）+ tasks → TDD 双端红→绿（后端 selectByStatusAndUserId 广播过滤断言 expected [7006] was [7006,7007] 起步；前端传参用例 2 红起步）→ 后端 15/15 BUILD SUCCESS + 前端 8/8 + vite build exit 0 → precheck --all **fail 0**（首跑拦 2：spec 位置未对 SPEC_GLOB+**SQL 注入门禁真命中**——结算 writer 常量拼接 SQL，参数化根治；二跑拦 1：spec §5.5 勾选——门禁三连递进执法实证）→ --review fail 0 留痕 → merge master（d01322a）。
- **Task B（fix：状态守卫回归，诊断回路）**：注入 updateStatus 拆 fromStatus 守卫 → updateStatusGuardsTransition 立即逮住（expected 0 was 1，compare-and-set 失效）→ 守卫复位绿（exit 0）→ merge master（04056d8）。

RUNTIME-OK：后端上下文启动含 Dubbo export（injvm 消费）+ Druid 双池 + ShardingSphere 装配 + Batch 序列/元数据全链跑通；前端 vitest 8/8 + 生产构建 1.82s 成功。

## 五、实际执行记录（2026-10-15/16）

①三门禁全绿——run-sweep 复跑 **66/0**（首跑 64/2：self-check 预算断言实测 562231B 超 1079B，按第二十八次登记 561152→565248；test-r68-jargon-free 逮出 R114 存量 7 处终态违规+本轮新增 2 处禁用词当场改写）/ self-check exit 0（81/81 框架规则核验过）/ test-r68-jargon-free 17/0。②缺陷修复三件：R114 存量终态违规清剿+codex-security 手抄版本行漂移修正+dist/ 误跟踪治理（R113 提交误扫 v2.76/2.77 共 4084 文件移出索引+.gitignore 补条目）。③全栈回归（Java 企业栈首测）四链全绿（生成链/后端 mvn 15/15/前端 8/8+build/研发两件）。④发版 v2.80.0+离线安装包。
