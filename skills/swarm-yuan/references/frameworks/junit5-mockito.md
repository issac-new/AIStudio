---
ruleset_id: junit5-mockito
适用版本: JUnit Jupiter 5.13–5.14 / JUnit 6.0–6.1（Platform 6.x，差异单独标注）/ Mockito 5.21–5.23 / spring-boot-test 3.4+（@MockitoBean）
最后调研: 2026-07-17（来源：https://github.com/junit-team/junit-framework/releases ；https://docs.junit.org/current/user-guide/ ；https://github.com/mockito/mockito/releases ；https://javadoc.io/doc/org.mockito/mockito-core/latest/org/mockito/quality/MockitoHint.html ；https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html ；https://java.testcontainers.org/）
深度门槛: 10
---

# JUnit 5 + Mockito 规则集

<!--
本规则集为 P2 框架规则集。
覆盖范围：JUnit Jupiter 5.13+ 与 6.x + Mockito 5.x（JUnit 6 需要 Mockito 5.14+ 的 mockito-junit-jupiter 支持）+ Spring Boot Test 集成。
调研时点：2026-07-17，已核对 junit-framework releases：JUnit 6.1.2 为最新（2026-07-12），5.14.4 为 5.x 最新（2026-04-26）；
mockito releases：5.23.0 为最新（2026-03-11，Android 基线 API 28+）。
JUnit 6 破坏性变更细节（包结构仍 org.junit.*，基线 Java 17）部分条目未逐条核实，标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `org.junit.jupiter:junit-jupiter` / `org.mockito:mockito-core` / `org.mockito:mockito-junit-jupiter` / `org.springframework.boot:spring-boot-starter-test` / `org.testcontainers:junit-jupiter` | 高 |
| 注解 | `@Test` / `@BeforeEach` / `@BeforeAll` / `@AfterEach` / `@ParameterizedTest` / `@ValueSource` / `@MethodSource` / `@ExtendWith` / `@Mock` / `@Spy` / `@InjectMocks` / `@MockBean` / `@MockitoBean` / `@Testcontainers` / `@Disabled` / `@DisplayName` / `@Timeout` | 高 |
| 文件 | `src/test/java/**/*Test.java` / `**/*Tests.java` / `**/*IT.java` | 高 |
| 配置 | `junit-platform.properties` / `mockito-extensions/org.mockito.plugins.MockMaker` | 中 |
| 代码 | `import org.junit.jupiter.api` / `import org.mockito` / `Mockito.when(` / `Mockito.verify(` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 junit5-mockito 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 测试类：`find "${PROJECT_DIR}" -type f \( -name '*Test.java' -o -name '*Tests.java' -o -name '*IT.java' \) -path '*/test/*'`（计数核验基准：测试文件数 = `find … | wc -l`）
- 测试方法：`grep -rcE '@Test\b|@ParameterizedTest\b' $(find … -name '*Test.java') | awk -F: '{s+=$2} END{print s+0}'`（计数核验基准：注解总命中数）
- Mock 声明：`grep -rnE '@Mock\b|@Spy\b|@InjectMocks\b|@MockBean\b|@MockitoBean\b' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：Mock 注解行数）
- stub 调用：`grep -rnE '\bwhen\(|\bgiven\(|doReturn\(|doThrow\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：stub 行数）
- verify 断言：`grep -rnE '\bverify\(' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：verify 行数）
- 参数化测试：`grep -rn '@ParameterizedTest' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：行数）
- Testcontainers：`grep -rlE '@Testcontainers|@Container' "${PROJECT_DIR}" --include='*.java'`（计数核验基准：文件数）
- 断言调用：`grep -rcE 'assert[A-Z][A-Za-z]+\(' $(find … -name '*Test.java') | awk -F: '{s+=$2} END{print s+0}'`

<!--
枚举该框架特有、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：断言禁止仅 assertNotNull——须含具体期望值
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: `assertNotNull(result)` 只证明"没返回 null"，对业务正确性零保障——方法返回空对象/错误对象照样绿。每个 @Test 须至少一条带具体期望值的断言（`assertEquals(expected, actual)` / `assertThrows` / AssertJ `assertThat(x).isEqualTo(...)`）或行为验证 `verify(...)`；assertNotNull 只能作为前置补充。
- **违反后果**: 测试形同虚设，回归保护为零（"绿条幻觉"）。
- **验证方法**: 逐测试文件统计：`assertNotNull(` 计数 > 0 且其他断言（assertEquals/assertTrue/assertThrows/assertThat/verify 等）计数 == 0 → fail。
- **对应门禁**: fw_junit_assertnotnull_only(fail)

```verify
id: junit5-mockito-r1
cmd:
expect: always
```

### 规律：@MockBean/@MockitoBean 污染 Spring 上下文缓存
- **适用版本**: Spring Boot 3.3 及以前 @MockBean / Spring Boot 3.4+（Spring Framework 6.2）@MockitoBean（@MockBean 已废弃）
- **规律**: `@MockBean`/`@MockitoBean` 会让 Spring TestContext 为每个不同 mock 组合重建 ApplicationContext（缓存 key 含 mock 定义）——多个测试类各自声明不同 @MockBean 组合时上下文爆炸，套件时长指数增长；且 mock 状态跨方法残留须 `@DirtiesContext` 或每次重建。选型：(a) 能不用 Spring 上下文的纯单测用 `@ExtendWith(MockitoExtension.class)` + `@Mock`（无上下文成本）；(b) 必须用 @MockBean 时全项目统一基类收敛组合。
- **违反后果**: 测试套件上下文重建 N 次（分钟级拖慢 CI）；mock 残留致测试相互污染。
- **验证方法**: 检出 `@MockBean|@MockitoBean` 的文件无 `@DirtiesContext` 且非统一基类 → warn 提示人工确认上下文缓存策略。
- **对应门禁**: fw_junit_mockbean_context(warn)

```verify
id: junit5-mockito-r2
cmd:
expect: always
```

### 规律：@Transactional 测试默认回滚，真实提交须显式
- **适用版本**: Spring Test 5.x–6.x / 7.x（@Transactional 测试语义）
- **规律**: 测试方法/类上的 `@Transactional` 由 TestContext 在每个测试后**默认回滚**——这是特性（隔离脏数据）而非 bug。陷阱有二：(a) 测试内触发异步/新线程逻辑读不到未提交数据（回滚前提下的"假失败"）；(b) 误加 `@Commit`/`@Rollback(false)` 后脏数据残留库中，污染后续测试与共享库。真实提交必须显式并配合 `@Sql` 清理。
- **违反后果**: 共享测试库脏数据累积；异步逻辑测试结果与生产相反。
- **验证方法**: 检出 `@Commit` 或 `@Rollback(false)` → warn 确认真实提交意图与清理策略。
- **对应门禁**: fw_junit_transactional_rollback(warn)

```verify
id: junit5-mockito-r3
cmd:
expect: always
```

### 规律：Mockito strict stubs——无用 stub 必须删除
- **适用版本**: Mockito 2.x–5.x（MockitoExtension 默认 STRICT_STUBS）
- **规律**: `@ExtendWith(MockitoExtension.class)` 默认 `Strictness.STRICT_STUBS`：声明了但从未被调用的 stub（`when(...)`）在测试结束时抛 `UnnecessaryStubbingException`。这是特性——逼你删掉复制粘贴残留的假 stub。禁止用 `Strictness.LENIENT` 或 `Mockito.lenient()` 全局压掉；确有个别 stub 跨方法共享时对单条 stub 用 `lenient().when(...)` 精准豁免。
- **违反后果**: LENIENT 全局化后 stub 失配（参数写错）静默——mock 返回 null 而测试照绿。
- **验证方法**: 检出 `Strictness.LENIENT` 或 `lenient()` 使用 → warn 确认是否精准豁免。
- **对应门禁**: fw_junit_strict_stubs(warn)

```verify
id: junit5-mockito-r4
cmd:
expect: always
```

### 规律：@ParameterizedTest 须覆盖边界值
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: 参数化测试的价值在边界（0、-1、null、空串、最大值），只传单个正常值的 `@ValueSource(ints = 1)` 与单测无差别还多一层间接。来源注解数据点须含边界集；null/empty 输入用 `@NullSource`/`@EmptySource`/`@NullAndEmptySource` 显式覆盖（@ValueSource 不支持 null）。
- **违反后果**: 边界缺陷漏测；参数化沦为形式。
- **验证方法**: 检出 `@ValueSource` 行无逗号（单值）→ warn 提示补边界值。
- **对应门禁**: fw_junit_parameterized_boundary(warn)

```verify
id: junit5-mockito-r5
cmd:
expect: always
```

### 规律：@BeforeAll 必须 static（非 PER_CLASS 生命周期）
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: 默认 `TestInstance.Lifecycle.PER_METHOD` 下，每个测试方法新建测试类实例，`@BeforeAll`/`@AfterAll` 必须是 `static`（否则启动报错）；非 static 仅 `@TestInstance(Lifecycle.PER_CLASS)` 下合法。生成代码默认 static；用 PER_CLASS 须明确理由（如 @BeforeAll 建容器）。
- **违反后果**: `PreconditionViolationException: @BeforeAll method must be static` 启动即失败。
- **验证方法**: 检出 `@BeforeAll` 但其后 3 行内方法声明无 `static` 且类无 `PER_CLASS` → warn。
- **对应门禁**: fw_junit_beforeall_static(warn)

```verify
id: junit5-mockito-r6
cmd:
expect: always
```

### 规律：@Disabled 必须注明原因
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: `@Disabled` 不带说明的测试是"静默坟场"——半年后没人知道是环境限制、未修 bug 还是临时绕过。必须 `@Disabled("原因 + issue 链接 + 责任人")`；CI 侧应定期盘点 Disabled 数量趋势。
- **违反后果**: 禁用测试腐烂，覆盖 silently 缩水。
- **验证方法**: 检出裸 `@Disabled`（无括号原因串）→ warn。
- **对应门禁**: fw_junit_disabled_reason(warn)

```verify
id: junit5-mockito-r7
cmd:
expect: always
```

### 规律：测试命名与 @DisplayName 规范
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: 测试方法名表达"场景_期望"（如 `find_shouldThrow_whenIdNotExists` 或 shouldXxxWhenYyy），禁止 `test1`/`testFind2` 类无语义名；类或方法级 `@DisplayName` 提供中文/自然语言描述（CI 报告可读）。二者至少居其一，全项目口径统一。
- **违反后果**: 失败报告无法定位业务语义；测试即文档失效。
- **验证方法**: 含 `@Test` 的文件零 `@DisplayName` → warn 提示补描述（人工确认命名风格）。
- **对应门禁**: fw_junit_naming(warn)

```verify
id: junit5-mockito-r8
cmd:
expect: always
```

### 规律：@Testcontainers 容器生命周期 static 共享
- **适用版本**: Testcontainers 1.17+（junit-jupiter 集成）
- **规律**: `@Container` 标注在**实例字段**上时每测试方法起停一次容器（分钟级开销）；标注在 `static` 字段上时全类共享一次。数据库容器几乎总应 static；需要每方法隔离的场景用 `@DirtiesContext` 或显式 `container.stop()` 管理。注意 static 容器在 PER_METHOD 下也由 Jupiter 扩展正确管理。
- **违反后果**: 每方法重启容器，CI 时长爆炸。
- **验证方法**: 检出 `@Testcontainers` 但无 `static` 容器声明 → warn。
- **对应门禁**: fw_junit_testcontainers(warn)

```verify
id: junit5-mockito-r9
cmd:
expect: always
```

### 规律：@Mock vs @Spy 选型——默认 @Mock
- **适用版本**: Mockito 5.x 全版本
- **规律**: `@Spy` 包装真实对象、未 stub 的方法走真实实现——测试语义暧昧（一半真一半假），且 spy 对 final 方法/构造副作用敏感。默认用 `@Mock`（全替身）；仅遗留代码无法注入依赖时用 `@Spy` 做"接缝"，并在注释说明。`@Spy` 上的 stub 用 `doReturn(...).when(spy)` 语法（避免 `when(spy.x())` 触发真实调用）。
- **违反后果**: 测试混入真实逻辑，失败定位困难；when(spy.x()) 触发真实方法副作用。
- **验证方法**: 检出 `@Spy` → warn 人工确认部分 mock 意图。
- **对应门禁**: fw_junit_mock_vs_spy(warn)

```verify
id: junit5-mockito-r10
cmd:
expect: always
```

### 规律：verify 须显式次数断言
- **适用版本**: Mockito 5.x 全版本
- **规律**: `verify(mock).call()` 等价 `times(1)` 但读性差；协作断言须显式：`verify(mock, times(1)).save(any())` / `verifyNoInteractions(mock)` / `verifyNoMoreInteractions(mock)` 收尾防"多调了没发现"。禁止只 stub 不 verify 的交互型测试（那是 stub 型测试，须用返回值断言兜底）。
- **违反后果**: 多余/缺失协作调用漏检（如重复发送 MQ）。
- **验证方法**: 检出 `verify(` 行不含 `times|never|atLeast|atMost|only` → warn。
- **对应门禁**: fw_junit_verify_times(warn)

```verify
id: junit5-mockito-r11
cmd:
expect: always
```

### 规律：测试不可依赖执行顺序
- **适用版本**: JUnit 5.x / 6.x 全版本
- **规律**: Jupiter 故意不保证方法执行顺序（跨类/跨方法）。`@TestMethodOrder(OrderAnnotation.class)` + `@Order(n)` 合法化顺序依赖，几乎总是坏味道——顺序依赖意味着共享可变状态，测试不再独立。正确做法：每个测试自带夹具（@BeforeEach 重建）；确有状态的端到端流程用 `@Nested` + `@TestInstance(PER_CLASS)` 显式建模。
- **违反后果**: 并行执行/随机排序后测试随机失败；单跑与全量结果不一致。
- **验证方法**: 检出 `@TestMethodOrder` 或 `@Order(` → warn。
- **对应门禁**: fw_junit_test_order(warn)

```verify
id: junit5-mockito-r12
cmd:
expect: always
```

### 规律：慢测试须 @Timeout 兜底，禁止裸 Thread.sleep
- **适用版本**: JUnit 5.x / 6.x 全版本（@Timeout 内建）
- **规律**: 异步等待用 `Thread.sleep(3000)` 既慢又脆（CI 慢机器上偶发失败）。正确姿势：(a) 等待条件用 Awaitility `await().atMost(...).until(...)`；(b) 每个可能挂起的测试加 `@Timeout(10)`（秒）防 CI 死等；(c) @Timeout 默认在测试线程内中断，I/O 阻塞不可中断时用 `ThreadMode.SEPARATE_THREAD`。
- **违反后果**: 测试挂起拖死 CI 流水线；sleep 时长不足偶发失败。
- **验证方法**: 测试文件检出 `Thread.sleep` → warn 改 Awaitility/@Timeout。
- **对应门禁**: fw_junit_timeout(warn)

```verify
id: junit5-mockito-r13
cmd:
expect: always
```

### 规律：覆盖率须由 Jacoco 采集并设最低阈值
- **适用版本**: JUnit 5.x / 6.x + JaCoCo 0.8.x
- **规律**: Maven/Gradle 须启用 JaCoCo 并声明最低覆盖率（`jacocoTestCoverageVerification` 的 `minimum.value` 或 Gradle `violationRules`），CI 执行 `check`/`jacocoTestCoverageVerification`。只有报告没有阈值 = 覆盖率无门禁。
- **违反后果**: 覆盖率持续下滑无人感知；新增代码零测试也能合入。
- **验证方法**: 查 pom.xml/build.gradle(.kts) 是否含 jacoco 与 minimum/verification 阈值；运行时阈值由 `check_test` 的 `COVERAGE_MIN` 统一核验。
- **对应门禁**: fw_junit_coverage_threshold(warn)

```verify
id: junit5-mockito-r14
cmd:
expect: always
```

### 规律：Controller 须有接口层测试，不能只测 service
- **适用版本**: JUnit 5.x + Spring Boot Test（MockMvc/WebTestClient/TestRestTemplate）
- **规律**: 存在 `@RestController`/`@Controller` 时，测试源须含接口层测试信号（MockMvc/WebTestClient/TestRestTemplate/@SpringBootTest），并断言状态码与错误路径。只测 service 会漏参数绑定、序列化、过滤器/鉴权、异常映射。
- **违反后果**: 接口契约、状态码、鉴权失败路径无回归保护；service 单测全绿但接口已坏。
- **验证方法**: `grep -rl '@RestController|@Controller'` 检出控制器；测试源无 MockMvc/WebTestClient/TestRestTemplate/@SpringBootTest → warn。
- **对应门禁**: fw_junit_controller_api_test(warn)

```verify
id: junit5-mockito-r15
cmd:
expect: always
```

<!--
共 15 条规律（≥10 门槛）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---------|------|---------|---------|---------|
| fw_junit_assertnotnull_only | fail | 测试文件 assertNotNull 计数>0 且其他断言/verify 计数==0 → fail | JUNIT_SRC_GLOBS | — |
| fw_junit_mockbean_context | warn | @MockBean/@MockitoBean 文件无 @DirtiesContext → warn 确认上下文缓存策略 | JUNIT_SRC_GLOBS | — |
| fw_junit_transactional_rollback | warn | 检出 @Commit/@Rollback(false) → warn 确认真实提交+清理 | JUNIT_SRC_GLOBS | — |
| fw_junit_strict_stubs | warn | 检出 Strictness.LENIENT/lenient() → warn 须精准豁免 | JUNIT_SRC_GLOBS | — |
| fw_junit_parameterized_boundary | warn | @ValueSource 单值（无逗号）→ warn 补边界值 | JUNIT_SRC_GLOBS | — |
| fw_junit_beforeall_static | warn | @BeforeAll 后方法声明无 static 且无 PER_CLASS → warn | JUNIT_SRC_GLOBS | — |
| fw_junit_disabled_reason | warn | 裸 @Disabled（无原因串）→ warn | JUNIT_SRC_GLOBS | — |
| fw_junit_naming | warn | 含 @Test 的文件零 @DisplayName → warn 命名/描述规范 | JUNIT_SRC_GLOBS | — |
| fw_junit_testcontainers | warn | @Testcontainers 但无 static 容器声明 → warn 生命周期 | JUNIT_SRC_GLOBS | — |
| fw_junit_mock_vs_spy | warn | 检出 @Spy → warn 确认部分 mock 意图 | JUNIT_SRC_GLOBS | — |
| fw_junit_verify_times | warn | verify( 行无 times/never/atLeast/atMost/only → warn | JUNIT_SRC_GLOBS | — |
| fw_junit_test_order | warn | 检出 @TestMethodOrder/@Order( → warn 顺序依赖 | JUNIT_SRC_GLOBS | — |
| fw_junit_timeout | warn | 测试文件检出 Thread.sleep → warn 改 Awaitility/@Timeout | JUNIT_SRC_GLOBS | — |
| fw_junit_coverage_threshold | warn | 构建文件无 Jacoco 或 Jacoco 无最低阈值 → warn | JUNIT_SRC_GLOBS | — |
| fw_junit_controller_api_test | warn | 有 @RestController/@Controller 但测试源无 MockMvc/WebTestClient/TestRestTemplate/@SpringBootTest → warn | JUNIT_SRC_GLOBS | — |

<!--
CWE/GB 映射列（2026-07-20 P1 补）：仅登记仓库内已有证据（.sh 告警文案/§3 违反后果）的弱点映射；— = 质量/规范类门禁，无 CWE 直挂。GB/T 34944-2017 为 Java 语言源代码漏洞测试规范。
门禁 id 命名规范：fw_junit_<rule>（ruleset 为 junit5-mockito，id 前缀按任务约定用 fw_junit_）。
本表 15 条 id 须在 assets/framework-gates/junit5-mockito.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_junit_<rule>(fail|warn) ...` 与本表 id 集合一致。
依赖变量在片段头注释 `# ruleset: junit5-mockito  requires_conf: JUNIT_SRC_GLOBS` 声明。
fixture 验证只覆盖 assertnotnull_only（violating→fail，另含 @MockBean 未清理 warn），compliant 全 pass。
JUNIT_SRC_GLOBS 为空数组时所有门禁守卫跳过（pass），不误判。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| junit5-mockito × spring-boot | 纯单测用 `@ExtendWith(MockitoExtension.class)`（无 Spring 上下文）；只有需要上下文/切片测试才用 `@SpringBootTest`/`@WebMvcTest` | @SpringBootTest 拉起全上下文秒级启动，全项目混用会让单测套件从秒级变分钟级 |
| junit5-mockito × spring-data-jpa | Repository 层测试用 `@DataJpaTest`（H2/Testcontainers），不 mock 自己拥有的 Repository；mock 留给外部服务 | mock 自己的 JPA 查询等于测试 mock 本身，SQL/JPQL 正确性零覆盖 |
| junit5-mockito × mybatis | Mapper 测试用 `@MybatisTest` 或 Testcontainers 真实库，禁止 mock SqlSession | mock SqlSession 只验证了 stub 本身 |
| junit5-mockito × validation | 约束注解测试直接 `validator.validate(dto)`（无需 Spring），断言 violation 的 propertyPath 与 message | 只断言"有违例"不定位字段，约束写错字段名照样绿 |
| junit5-mockito × testcontainers | 容器镜像版本与生产对齐（mysql:8.4 等固定 tag，禁用 latest）；static 容器共享 | latest 漂移致 CI 不可复现；非 static 容器每方法起停拖垮套件 |

<!--
无强交互的框架组合省略；本表聚焦测试生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| JUnit 5.13 | 待验证：具体变更未逐条核实 release notes（5.13.x 系列为 2025 年发布线） | 升级前人工核实 docs.junit.org 对应 release notes |
| JUnit 5.14.x | 5.x 最新线（5.14.4，2026-04-26）；Platform 1.14.x | 5.x 停留在维护态，新特性流向 6.x |
| JUnit 6.0 | Platform/Jupiter/Vintage 版本号对齐 6.x；基线 Java 17（待验证：完整破坏性清单未逐条核实）；包名仍 org.junit.* | Spring Boot 3.x 用户升级前核实 Boot 管理的 junit 版本兼容；Mockito 须 5.14+ |
| JUnit 6.1.x | 最新线（6.1.2，2026-07-12） | 调研时点最新；新项目可直接采用 |
| Mockito 5.x | 默认 mockmaker 为 subclass（mockmaker-inline 已于 5.x 合并为默认——inline 自 Mockito 5 起默认） | final 类/方法默认可 mock，旧 mockito-extensions 配置须清理 |
| Mockito 5.23.0 | 最新（2026-03-11）；Android 基线提升到 API 28+（breaking） | Android 项目 <API 28 须停留 5.22 或升级 minSdk |
| Spring Boot 3.4 / Framework 6.2 | `@MockBean`/`@SpyBean` 废弃，新增 `@MockitoBean`/`@MockitoSpyBean` | 迁移期两者并存须统一；fw_junit_mockbean_context 对两者同检 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
