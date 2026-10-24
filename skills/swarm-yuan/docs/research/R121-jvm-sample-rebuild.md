# R121 轮档：JVM 项目级回归样例重建（order-forge）

## 一、目标与背景

用户指令（2026-10-18）：「务必实施完成披露的缺口」。R120 收口时如实披露：JVM 项目级样例（order/trade-forge）自 R94/R115 后未重跑，/tmp 样例已清，必测清单（vuejs / elementui / spring framework / mybatis / spring batch / spring boot）的 JVM 四件套缺项目级覆盖。本轮以重建 order-forge 闭环该缺口——一个项目覆盖全部六项必测点。

## 二、样例重建（~/lab/order-forge，持久库）

- **后端**（Spring Boot 3.2.5 + JDK 17）：Order 领域（orderNo/customerName/amount/status 白名单）+ MyBatis XML（显式 resultMap、全 `#{}` 参数化、动态 `<where>`、分页 LIMIT/OFFSET）+ Spring Batch 5（CSV→Processor 校验→mapper 写库 chunk 50，幂等去重）+ Spring MVC（POST/GET 分页三端点 + jakarta validation）。
- **前端**（Vue3 + Vite5 + Element Plus + Pinia + axios）：列表（筛选/分页/状态标签映射）+ 创建表单（必填校验/防重提交）+ Vitest 组件测试 2 spec。
- **重建中踩坑两例（已修）**：①主类因子包放置致测试切片找不到 `@SpringBootConfiguration`（移根包）；②Boot 3 加 `@EnableBatchProcessing` 致自动配置退位、BATCH_* 元数据表不建（删注解）；③H2 显式 id 种子后自增序列不前进撞主键（`ALTER ... RESTART WITH 100`）。

## 三、生成链闭环（R118 同款九节点前半）

create 骨架 → detect-frameworks **6 框架全中**（spring-boot/spring-batch/mybatis/vue/element/jest-vitest——必测清单全覆盖）→ conf 填充（目录建模 + 21 项框架 glob）→ `--inject-frameworks`（6 框架区块）→ 框架规律库 77 条全带 file:line 证据锚点 + reference-manual §4/§6/§9 三表 → `--verify-completeness` 迭代清零占位 → `--mark-active` 激活（lite 档，3 项 STABILITY_WARN 非阻断如实知悉）。

## 四、门禁执法与缺陷修复（本轮核心价值）

真实项目首跑 `--all-full` 暴露 3 fail，逐一判定处置：

| fail | 判定 | 处置 |
|------|------|------|
| `fw_sboot_transactional_selfinvoke` | **误报**（生成器缺陷 D1）：@Transactional 方法体内 `throw new IllegalArgumentException(...)` 的构造形态被当同类方法自调用——提取端正则把 `new` 当返回类型、构造类名当方法名收入候选；命中端又以「空格+类名(」复现 | 生成器根治：检测前剥 `new Xxx(` 构造形态 + 提取端方法名限小写开头（Java 惯例，大写构造形态挡在候选外）；compliant 夹具补异常构造形态防复发；violating（this.doSave 真自调用）仍检出 |
| `fw_jest_coverage_threshold` | 真实要求 | vite.config.js 补 vitest coverage 阈值（60/60/60/50，真实数值非 grep 过线；npm test 不强制 --coverage 的取舍入决策记录） |
| spec 缺失（§5.5/§19/回滚） | 真实工作流要求 | 写 docs/specs/2026-10-18-bootstrap.md（决策记录/影响范围/§5.5 拼装声明/§19 测试左移/回滚预案） |

负面测试闭环：临时将 mapper `#{id}` 改 `${id}` → `fw_mybatis_dollar` 正确 fail（CWE-89）→ 还原回绿。负面输出暴露**缺陷 D2**：修复建议文案双引号内字面 `${}` 被 bash 展开（`bad substitution`）——生成器模板 `\${}` 转义根治 + 技能产物同步 + 模板全扫无其他同类。

conf 自洽修复：READONLY_DIRS 含 docs 与 SPEC_GLOB 冲突（R36-D10 警告），调整为可写。

## 五、验证记录（全带命令锚点）

- 后端：`cd backend && mvn test` → **8/8**（OrderMapperTest 3 + OrderImportJobTest 2 含 job 重跑幂等 + OrderControllerTest 3）；`mvn -q compile` rc=0。
- 前端：`npm run build` rc=0（4.45s）；`npm test` → **4/4**（2 spec）。
- 门禁：`precheck.sh --all-full` → **29 调用，执行 25，fail 0**（warn 34 / advisory 102 如实计数；含双栈 TEST_CMD/BUILD_CMD 执行）。
- 夹具：`run-framework-fixture.sh spring-boot` 双态 ✓（violating 检出 + compliant PASS）。
- 新回归锁：`test-r121-jvm-regression.sh` **5 断言 PASS**（异常构造不误报/夹具形态保留/注入检出/零 bad substitution/模板无未转义 suggest）。
- 语法：spring-boot.sh / precheck.sh / 测试脚本 `bash -n` + 核心脚本 shellcheck 0 error（片段按 CI 约定 bash -n 兜底）。

## 六、遗留（如实披露）

- trade-forge（ShardingSphere/Dubbo/RocketMQ/Druid 全家桶）未重建——不在必测清单内，重建成本≈R115 一个全量轮；后续按需排期。
- order-forge 样例的九节点**研发工作段**（典型任务 TDD/诊断回路，R118 Task A/B 同款）本轮未执行——本轮目标是缺口族的项目级回归闭环（生成链+门禁+真实工具链），研发工作段留待下个全量回归轮。
- `check_layer/check_contract/check_spec_first/check_branch` 4 项因项目未配置对应要素跳过（汇总如实计数）；warn 34 项含 lite 档 STABILITY_WARN 3 项（标注稳定但无同名测试文件）。
