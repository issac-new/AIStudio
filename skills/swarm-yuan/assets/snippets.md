# 代码片段与组件参数配置 (Code Snippets & Component Config)

> 对应材料 scripts §1/§3。生成目标技能时，填入项目常用代码片段、命令组合、组件参数配置。

## 常用命令组合

> 高频使用的命令组合（探查项目 scripts/Makefile 提炼）。

### 开发启动
```bash
# （填入项目实际的 dev 启动命令组合）
```

### 构建
```bash
# （填入项目实际的 build 命令组合）
```

### 测试（含覆盖率报告）
```bash
# （填入项目实际的 test 命令组合，含过滤参数与覆盖率报告产出）
# 要求：输出可被 check_test 解析（lcov/cobertura/jacoco/coverage-summary/coverage.out），
# 或显式配置 COVERAGE_REPORT 指向报告路径。
# 示例形态（按项目框架替换）：
#   npm test -- --coverage --coverageReporters=lcov        # Jest/Vitest → coverage/lcov.info
#   npx vitest run --coverage                              # Vitest
#   pytest --cov=src --cov-report=xml --cov-fail-under=80  # pytest → coverage.xml
#   mvn test jacoco:report                                 # Maven → target/site/jacoco/jacoco.xml
#   go test ./... -coverprofile=coverage.out               # Go → coverage.out
#   ./gradlew test jacocoTestReport                        # Gradle
```

### 单元测试模板
> 一个用例只验证一个行为；断言必须含具体期望值；至少覆盖正常 + 边界 + 异常。
```text
# （填入项目测试框架的单元测试骨架，含 Arrange-Act-Assert 三段与断言）
# 示例（TypeScript/Vitest）：
# describe('<unit>', () => {
#   it('<behavior> when <condition>', () => {
#     // Arrange
#     // Act
#     // Assert
#     expect(actual).toEqual(expected);
#   });
# });
```

### 接口测试模板
> 每个端点至少：正常 2xx + 鉴权失败 401/403 + 参数校验 400/422 + 不存在 404 + 冲突/幂等 409。
```text
# （填入项目 API 测试骨架，含请求构造、状态码断言、响应体断言、鉴权/校验失败用例）
# 示例（Spring MockMvc）：
# mockMvc.perform(post("/orders").contentType(APPLICATION_JSON).content(body))
#   .andExpect(status().isCreated())
#   .andExpect(jsonPath("$.id").isNotEmpty());
# 示例（supertest）：
# const res = await request(app).post('/orders').send(body);
# expect(res.status).toBe(201);
# expect(res.body.id).toBeDefined();
```

### 测试反模式（生成时删除）
```text
- 只调用不校验：test('works', () => { service.run(); })  # 零断言
- 只测正常路径：没有任何 4xx/5xx、异常、边界用例
- 聚焦测试：test.only/fdescribe/fit 提交进仓库（CI 静默漏跑其余用例）
- 快照万能：只 toMatchSnapshot 不写业务断言
- 共享可变夹具：测试顺序依赖、并行互相污染
- 只测 service 不测 controller/route：接口契约与状态码未验证
```

### 部署/发布
```bash
# （填入项目实际的 release/deploy 命令组合）
```

## 代码模板

### 新增模块/组件模板
> 探查项目代码风格，提炼新增模块的模板。

```
# （填入项目实际的模块模板，如 Vue 组件 / Python 类 / Go struct）
```

### 新增接口模板
```
# （填入项目实际的 API/路由定义模板）
```

## 组件参数配置说明

> 探查项目组件库，列出关键组件的参数配置。

### <组件名1>

| 参数 | 类型 | 默认 | 说明 |
|------|------|------|------|
| | | | |

**示例：**
```
# （填入组件使用示例）
```

### <组件名2>
（同上）

## 关节组件库

> 项目核心/关节组件（频繁组合使用的组件）的详细参数与组合方式。

### <关节组件名>

**职责：** （一句话）

**关键参数：**
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|

**组合方式：**
```
# （填入与其他组件的组合示例）
```

**注意事项：** （使用该组件的坑/约束）
