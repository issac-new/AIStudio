# R124 JVM 全家桶全栈回归 + 生成器缺陷根治轮（trade-forge，2026-10-20）

> 触发：用户指令（research 运行时更新到最新稳定版 + 差异比较 + 吸收优化 + 全栈回归：vuejs/elementUI/spring/mybatis/sharding-jdbc/druid/spring batch/spring boot/dubbo/rocketmq 生成技能并做典型研发工作 + 缺陷排查修复 + 发版 GitHub + 离线包（除 npm/pip 可安装插件外））。
> **双会话分流说明**：本会话的运行时刷新面（6 移动吸收五档 + 基线表六行 + 离线清单三行 + test-r118 硬编码版本钉根治，检查点提交 7bed359）被并行会话以「R123 双会话接力」合流并发为 **v2.87.0**（含 ncwk 深读面与 sample-forge 回归），其移动面/吸收表见 `R123-runtime-refresh.md`。本档只记本会话**独有**的后半程：trade-forge 全家桶样例 + 生成链 + 研发工作段 + 实抓的 10 项生成器缺陷根治 + 离线包 `--no-vendor`，让位升版为 **v2.88.0**。
> 开工前欠账：R122（v2.86.0）此前只写了 CHANGELOG 未打 tag/未推送——本会话补推 main + 打 tag `v2.86.0`（GitHub release 随后由并行会话补建）。

## 一、运行时面（指针）

6 移动 / 16 零移动的核对、吸收五档与基线六行已随 7bed359 并入 v2.87.0，细节见 `docs/research/R123-runtime-refresh.md`。本会话据此吸收在后半程直接消费的两条：**gsd-core v1.18.0「构建失败不算 RED」**（Task A 先铺签名无行为再写测试，红灯来自断言失败）与 **claude-mem v14「agent 报 done≠人确认」**（Task A/B 审查留痕由独立审查签字）。

## 二、缺陷排查与修复（本轮实抓 10 项，全部根治 + 机器锁）

| 编号 | 缺陷 | 根因 | 根治 | 锁 |
|---|---|---|---|---|
| D1 | `test-r118-release-hardening` 用 `claude-mem@13.40.0` 硬编码构造失败场景，清单升版即失配；`--allow-partial` 用例探针从未真触达（假绿） | 测试与清单版本耦合 | 从 `offline-manifest.conf` 动态取 spec；新增 2f「场景确有缺件登记」 | test-r118 2a-2f |
| D2 | detect-frameworks 漏探裸坐标 `com.alibaba:druid`（ShardingSphere 底层池/手工 Bean 主流形态，trade-forge 9/10 框架） | pom 桶是 groupId/artifactId 各自成行的子串包含；三旧信号均不中；裸名 `druid` 子串会误伤 Apache Druid `org.apache.druid:druid-*` | 新增 `pomga` 桶：`<dependency>` 的 groupId:artifactId 成对精确匹配（parent/本项目坐标/plugin 不入桶）；信号 `druid\|com.alibaba:druid\|pomga` | test-detect-frameworks 态6 正负 + test-r123 态2 |
| D3 | `fw_dubbo_version_required` 把 Javadoc 注释里的 `@DubboService` 字样当注解 | 命中行未剥注释 | `_fw_dubbo_anno_lines`：`*`/`/*`/`//` 开头行不算注解行（保留行号） | test-r123 态1a |
| D4 | `fw_dubbo_timeout_idempotent` 显式 `retries = 0` 仍报「未显式声明」 | else 分支只认 retries>0；合规夹具 Javadoc 声称已声明而代码缺失——warn 级误报从未被双态夹具抓住（warn 盲区） | 三态：>0 warn / =0 pass / 未声明 warn；夹具补 `retries = 0` | test-r123 态1b |
| D5 | `fw_dubbo_registry` 不认 Spring Boot 嵌套 `registry:`/`address: N/A` | 只认扁平 `dubbo.registry.address=` 与带 scheme 的 YAML | 同文件 `registry:` 块 + 任意非空 `address:` 视为已配置（N/A 是显式的无注册中心直连声明）；夹具加 application.yml 嵌套态 | test-r123 态1c/1d |
| D6 | `check_method_size` 扫进 `frontend/node_modules`（95 条第三方噪音；R121 「advisory 102」同源） | 两处 find 不排依赖目录 | 排除 node_modules/target/dist/build/vendor/.venv/venv（对齐 detect-frameworks 惯例） | test-r123 态6 合成项目正负 |
| D7 | `fw_element_on_demand_import` 把具名 `import { ElMessage }`（正是按需形态）当全量 import | 正则 `from 'element-plus'` 不分形态 | 只匹配默认 import / `import * as` / 副作用 import | test-r123 态3a/3b |
| D8 | `fw_element_imperative_api` 对已 import 的 ElMessage 使用行报「未 import」 | 多行 grep 结果只给首行加文件名前缀，续行 `34:ElMessage…` 被 `cut -d:` 当成文件名 "34" 去 grep | 逐行 `sed "s\|^\|file:\|"`；import 语句自身不算用例行 | test-r123 态3c |
| D9 | `fw_jest_mock_hoisted` 对不引用外部变量的自包含工厂也报警（每个现代 Vitest 测试都中） | 只看「有 vi.mock 箭头工厂且无 vi.hoisted」 | 只在工厂体引用模块顶层（第 0 列）const/let/var 时报警；扫描窗 vi.mock( 到第 0 列 `})` 收口，括号配平的单行只看本行 | test-r123 态4a/4b（夹具 violating 顶层 mockReturn 仍报） |
| D10 | `fw_sharding_key_in_dml`/`order_merge` 漏报：`ORDER BY created_at, order_id` 里的列名被当「带分片键」 | 判据=列名在块内出现 | 谓词位置判据：WHERE 段内 `key =/IN/BETWEEN/<=/>=/<>/!=/</>`；SET/ORDER BY/select 列表不算 | test-r123 态5a-5d（ORDER BY 掩盖报 / WHERE 谓词不报 / SET 子句键报 / 谓词 UPDATE 不报） |

接受的 warn（非缺陷，设计局限或项目选择，如实计数）：mybatis `ognl_empty`（XML 无字段类型信息，字符串 `!= ''` 正确）/ `jdbc_type`（H2/MySQL 无需）；element `i18n_no_hardcode_cn`（项目不做 i18n）/ `form_item_prop`（按钮容器无 prop）；jest `test_location/setup_files/globals/bench/typecheck`（配置建议）；sharding `order_merge`（无分片键列表查询=读路径全路由归并，显式接受）。

## 三、全栈回归（trade-forge，JVM 全家桶 + Vue3/Element Plus）

**样例**（~/lab/trade-forge，持久库，master 6 提交）：backend Spring Boot 3.2.5/JDK 17——ShardingSphere-JDBC 5.5.3（ds_0/ds_1 × t_trade_order_0/1，order_id 两级 INLINE 路由，SNOWFLAKE 兜底 + 应用侧雪花 ID，t_dict 广播，SINGLE defaultDataSource）+ Druid 1.2.20 底层池（initialSize/minIdle/maxActive/keepAlive/filters stat,wall/慢 SQL 三参数）+ MyBatis 3.0.3（显式 resultMap/record constructor/全 #{}）+ Spring Batch 5.1（独立 H2 元数据库 + DefaultBatchConfiguration 子类接管 + 守卫式自建 schema）+ Dubbo 3.2.10（registry N/A、port -1、qos 关、`@DubboService(version,timeout,retries=0)`、契约 DTO Serializable）+ RocketMQ spring 2.3.1（KEYS=orderNo、maxReconsumeTimes/consumeThreadNumber/enableMsgTrace 显式、消费幂等双闸；test 态排除自动配置 + mock 模板）；frontend Vue3 + Vite5 + Element Plus + Pinia + Vitest（字典驱动状态标签、推进按钮条件渲染、orderId 全程字符串）。

**构建期实录坑（全部进 framework-knowledge.md 规律/spec 决策）**：① ShardingSphere 5.5.3 驱动 URL `classpath:` 装载器已不存在（`infra/url/type` 仅 etcd/zookeeper）→ 改 `YamlShardingSphereDataSourceFactory`；② `!SHARDING`/`!BROADCAST` 标签、Standalone 模式、JDBC 持久化仓、ALL_PERMITTED 鉴权、sql92/mysql 方言解析器——共七构件在上游 `shardingsphere-jdbc` POM 里全是 test scope，应用须显式依赖（六层运行期 SPI 报错逐层定位）；③ Boot 3.2.5 BOM 钉 commons-lang3 3.13，ShardingSphere 需 ≥3.18（`Strings` 类）；④ Boot 3.2 无 `@BatchTransactionManager`（3.3 才有）且 `initialize-schema` 初始化器与自定义 DefaultBatchConfiguration 并存时不保证先行（BadSqlGrammar）→ 守卫式自建 schema；⑤ `@EnableDubbo` 挂启动类会击穿 `@WebMvcTest` 切片（RPC 扫描拉进提供端）→ 独立 `DubboConfig`；⑥ Dubbo 契约 record 未 `Serializable`——injvm 按引用传递掩盖，fastjson2 告警实测，真远程必炸。

**基线**：后端 20/20（分片路由**物理直查**断言 orderId 4/5/6/7 落四节点 + 逻辑 roundtrip + 带键 UPDATE 影响 1 行 + 广播表读 + Batch 导入/重跑幂等 + MQ 生产契约 KEYS 头 + 消费三投一效 + Dubbo injvm 往返 + 契约 DTO 序列化往返）+ 前端 4/4 + `vite build` rc 0。

**生成链**：detect-frameworks 10 框架（D2 修后含 druid）→ lite 骨架 → `--inject-frameworks`（最终 sha 369227557）→ conf 31 变量（目录模型 + 27 框架变量；两个合法空数组补注释）→ framework-knowledge 119 条规律全带 file:line（spring-boot 16/spring-batch 12/mybatis 15/dubbo 11/rocketmq 11/sharding 14/vue 15/element 10/jest-vitest 10/druid 10）→ reference-manual §4 29 行/§6 13 行/§9 7 行 → SKILL.md meta（命令速查/DoD/反借口表/假设清单）→ decisions.jsonl 3 条（哈希链 OK）→ `--verify-completeness --strict` 零占位 → `--mark-active` active（inventory-verify 全维度 1.00，STABILITY_WARN 5 条入口类如实）。

**门禁执法**：首跑 `--all-full` fail 1=分支守卫（样例在 master 开发，真实要求）→ 切 feat 分支 fail 0；advisory 101→5（D6 修后）；dubbo warn 3→0（D3-D5）；element 4→2、jest 6→5（D7-D9）；sharding 0→1 warn（D10 修后 `selectPage` 全路由归并如实呈现）。10 框架逐框 fail 0。

**Task A（feature：金额区间筛选 minAmount/maxAmount，双端）**：proposal → spec（决策 3 条/影响范围/§5.5 复用 5 单元/§19 RED 设计/回滚）→ state-machine open→design→build → **先铺签名无行为再写测试**（红灯=断言失败：区间过滤返回多余行 / min>max 返回 200）→ GREEN（XML 两段 `<if>` 与 count 同构 / Query.validate / 控制器透传）后端 23/23 → 前端 RED（输入框不存在）→ GREEN（store 两字段 / api 透传 / 两个 el-input-number）5/5 + build → `--all-full` fail 0 → ⑦审查发现 `validate()` 仅控制器调用、Service.list 其他调用方可绕过 → 下沉 Service（控制器保留快速失败）→ review 落盘 → verify(pass+证据)→archive → `merge --no-ff`。

**Task B（fix：诊断回路）**：注入 A `#{status}→${status}`：`fw_mybatis_dollar` 静态 fail（CWE-89）+ 2 用例报错（H2 拒绝裸标识符 `SET status = PAID`）——双层咬住，门禁更早且对数值型 `${}` 唯一有效；注入 B 放开 CLOSED 终态（`CLOSED→{PAID}`）：**23/23 全绿零咬住**——状态机转移表无直接探针（控制器测试 mock 了 Service）→ 补 `TradeOrderServiceTest` 4 用例（每边/跳级/终态/非法目标）→ 注入态 `closedIsTerminalAndCannotBeReopened` 1 failed 精确命中 → 还原 27/27；顺带暴露 `TradeEventProducerTest` 跨用例脆断（缓存上下文共享 mock 模板，verify 默认 times(1)）→ `@BeforeEach clearInvocations`（不放宽为 atLeastOnce）；生产代码零改动；`--all-full` fail 0 → merge --no-ff。

RUNTIME-OK：后端 27/27 + 前端 5/5 + vite build rc 0 + `--all-full` fail 0（warn 31 / advisory 5 如实计数）。

## 四、实际执行记录（2026-10-19 → 2026-10-20）

①欠账补齐（push main + tag v2.86.0）→ ②基线核对四通道 → ③吸收五档 + 基线六行 + 清单三行 + D1 根治 + 预算第三十一次登记 → 提交 7bed359（**此提交被并行会话接力合流入 v2.87.0**）→ ④trade-forge 样例构建（六层依赖陷阱实录）基线 20/20+4/4 → ⑤生成链 10 框架 active → ⑥D2–D10 实抓根治 + 夹具锁 → 提交 49747a3 → ⑦Task A/B 九节点 → ⑧`test-r124-jvm-regression` 25 断言 + `--no-vendor` 离线包能力 → ⑨三门禁（jargon 17/0、self-check rc 0、doc-numbers 124/124、run-sweep 单实例 74 通过 / 0 失败——首跑被版本三面同步守卫拦住 README badge 未升，补升后通过；复跑末步 self-check 进程被宿主 SIGTERM 中断，同一提交态单跑 rc 0 补证）→ ⑩收口时发现 origin/main 已被并行会话推进（v2.87.0 已 tag+release，main 工作区有对方未提交改动）→ 中止 rebase，从 origin/main 开 `feat/r124-jvm-regression` 重放独有改动（预算取对方 598016/584KiB、LOC 取本会话 7041、轮档与测试改名 R124）→ 复跑三门禁 → 经本地临时分支 `--no-ff` 合并后推 origin/main（不触碰对方在途工作区）→ tag v2.88.0 → 离线包（全量 + `--no-vendor`）→ GitHub release v2.88.0。

未做（如实披露）：源码包 release（gstack/superpowers/ECC 的 vYYYYMMDD-src）本轮未重打——三者中仅 gstack tip 前移 +25 且为方法论引用层，self-check `install_from_src_release` 回退最近的 v20261017-src 可用；trade-forge 的 `.swarm-yuan/notes/cognition.md` 认知自查留痕与 SOR/GLOSSARY/STORE_DIR 三个可选配置未补（advisory 如实计数 5）。
