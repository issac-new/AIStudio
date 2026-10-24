---
ruleset_id: pytest
适用版本: pytest 8.x/9.x（Python 3.8+/3.9+）
最后调研: 2026-07-17（来源：https://docs.pytest.org/en/stable/ ；https://github.com/pytest-dev/pytest/releases ；https://docs.pytest.org/en/stable/how-to/fixtures.html ；https://docs.pytest.org/en/stable/how-to/parametrize.html ）
深度门槛: 10
---

# pytest 规则集

## §1 探查信号
| 信号类型 | 模式 | 置信度 |
| 依赖 | pytest / pytest-asyncio / pytest-xdist / pytest-cov | 高 |
| 注解 | @pytest.fixture / @pytest.mark / @pytest.mark.parametrize / @pytest.skip | 高 |
| 文件 | conftest.py / pytest.ini / pyproject.toml [tool.pytest.ini_options] | 高 |
| 配置 | pytest.ini / tox.ini [pytest] / setup.cfg [tool:pytest] | 高 |

## §2 特定构件枚举
- 测试文件: find ... -name 'test_*.py' -o -name '*_test.py'
- fixture 定义: grep -rlE '@pytest\.fixture' ...
- conftest 层级: find ... -name 'conftest.py'
- 参数化测试: grep -rlE '@pytest\.mark\.parametrize' ...
- pytest 配置: find ... -name 'pytest.ini' -o -name 'pyproject.toml' -o -name 'tox.ini' -o -name 'setup.cfg'

## §3 领域规律

### 规律：fixture 作用域须匹配生命周期
- **适用版本**: 全版本
- **规律**: session 作用域 fixture 须不可变（跨测试共享只读）；可变状态须用 function 作用域
- **违反后果**: 测试间共享可变状态导致顺序依赖/偶发失败
- **验证方法**: grep -rnE '@pytest\.fixture.*session' 检查是否有可变操作（append/修改/写文件）
- **对应门禁**: fw_pytest_session_scope_mutable(fail)

```verify
id: pytest-r1
cmd: 
expect: always
```

### 规律：断言须含具体期望值
- **适用版本**: 全版本
- **规律**: assert x == y 不可仅 assert x（truthy 断言无法捕获错误值）
- **违反后果**: 测试通过但实际值错误
- **验证方法**: grep -rnE '^\s*assert\s+\w+\s*$' 测试文件
- **对应门禁**: fw_pytest_assert_truthy_only(fail)

```verify
id: pytest-r2
cmd: 
expect: always
```

### 规律：parametrize 须覆盖边界值
- **适用版本**: 全版本
- **规律**: @pytest.mark.parametrize 须含边界值（0/空/null/最大值/负数），不可仅正常值
- **违反后果**: 边界 bug 未被发现
- **验证方法**: grep -rnE '@pytest\.mark\.parametrize' 检查参数集是否含边界
- **对应门禁**: fw_pytest_parametrize_boundary(warn)

```verify
id: pytest-r3
cmd: 
expect: always
```

### 规律：conftest.py 须分层级
- **适用版本**: 全版本
- **规律**: 根 conftest 放共享 fixture；子目录 conftest 放局部 fixture；不可在测试文件内定义全局 fixture
- **违反后果**: fixture 散乱难复用
- **验证方法**: find ... -name 'conftest.py' 检查层级
- **对应门禁**: fw_pytest_conftest_hierarchy(warn)

```verify
id: pytest-r4
cmd: 
expect: always
```

### 规律：xdist 并行须保证隔离
- **适用版本**: 全版本（pytest-xdist）
- **规律**: 并行测试须用 tmp_path（每个 worker 独立）不可共享 tmpdir；不可依赖测试执行顺序
- **违反后果**: 并行测试互相干扰
- **验证方法**: grep -rnE 'tmpdir\b' 检查是否用 tmp_path 替代
- **对应门禁**: fw_pytest_xdist_isolation(warn)

```verify
id: pytest-r5
cmd: 
expect: always
```

### 规律：asyncio 须显式配置模式
- **适用版本**: pytest-asyncio 0.21+
- **规律**: asyncio_mode 须显式配置（auto/strict），不可用默认值漂移
- **违反后果**: async 测试行为不一致
- **验证方法**: grep -rnE 'asyncio_mode' 配置文件
- **对应门禁**: fw_pytest_asyncio_mode(warn)

```verify
id: pytest-r6
cmd: 
expect: always
```

### 规律：mock 须清理
- **适用版本**: 全版本
- **规律**: mocker.patch / monkeypatch 须在 fixture 中清理（或用 monkeypatch 自动清理），不可在测试体内 patch 不清理
- **违反后果**: mock 泄漏到其他测试
- **验证方法**: grep -rnE 'mocker\.patch|monkeypatch' 检查是否在 fixture 中
- **对应门禁**: fw_pytest_mock_cleanup(warn)

```verify
id: pytest-r7
cmd: 
expect: always
```

### 规律：skip/xfail 须注明原因
- **适用版本**: 全版本
- **规律**: @pytest.mark.skip / @pytest.mark.xfail 须有 reason 参数
- **违反后果**: 跳过的测试无人追查
- **验证方法**: grep -rnE '@pytest\.mark\.(skip|xfail)\s*\(' 检查是否含 reason=
- **对应门禁**: fw_pytest_skip_reason(warn)

```verify
id: pytest-r8
cmd: 
expect: always
```

### 规律：测试命名须规范
- **适用版本**: 全版本
- **规律**: 测试函数须以 test_ 开头；测试类须以 Test 开头且无 __init__
- **违反后果**: 测试不被 pytest 发现
- **验证方法**: grep -rnE '^def [a-z]' 测试文件检查非 test_ 开头
- **对应门禁**: fw_pytest_naming(warn)

```verify
id: pytest-r9
cmd: 
expect: always
```

### 规律：测试不可依赖执行顺序
- **适用版本**: 全版本
- **规律**: 测试须独立可乱序执行，不可依赖前一个测试的副作用
- **违反后果**: 顺序变化致测试失败
- **验证方法**: 人工检查（grep 全局变量修改/文件写入后后续测试读取）
- **对应门禁**: 人工检查

```verify
id: pytest-r10
cmd: 
expect: always
```

### 规律：覆盖率须设目标
- **适用版本**: 全版本（pytest-cov）
- **规律**: 须配置 --cov-fail-under 阈值，无阈值则覆盖率无门禁
- **违反后果**: 覆盖率逐步下降无人管
- **验证方法**: 查 pytest.ini/pyproject.toml/setup.cfg/tox.ini 是否含 `cov-fail-under`/`fail_under`（阈值通常在配置而非测试源码）
- **对应门禁**: fw_pytest_coverage_threshold(fail)

```verify
id: pytest-r11
cmd: 
expect: always
```

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量 / 标准映射（CWE/GB））
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | 标准映射（CWE/GB） |
|---------|------|---------|---------|---------|
| fw_pytest_session_scope_mutable | fail | session fixture 含可变操作（append/写文件）→ fail | PYTEST_TEST_GLOBS | — |
| fw_pytest_assert_truthy_only | fail | 仅 assert x（无 == / != / in / is）→ fail | PYTEST_TEST_GLOBS | — |
| fw_pytest_parametrize_boundary | warn | @parametrize 存在但无边界值信号（0/None/空/max）→ warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_conftest_hierarchy | warn | 无 conftest.py 但有 @pytest.fixture → warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_xdist_isolation | warn | 用 tmpdir（非 tmp_path）→ warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_asyncio_mode | warn | async 测试存在但无 asyncio_mode 配置 → warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_mock_cleanup | warn | mocker.patch 在测试体内（非 fixture）→ warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_skip_reason | warn | @skip/@xfail 无 reason= → warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_naming | warn | 测试函数非 test_ 开头 → warn | PYTEST_TEST_GLOBS | — |
| fw_pytest_coverage_threshold | fail | pytest.ini/pyproject/setup.cfg/tox.ini 与测试源均无 cov-fail-under/fail_under → fail | PYTEST_TEST_GLOBS | — |

<!--
标准映射列 2026-07-20 P1 补登：CWE 取自本文件 §3/门禁输出口径与通行分类，GB 条款沿用 references/standards-compliance.md §D 口径，无明确映射标 —。
-->

## §5 跨框架交互
| 交互对 | 规则 | 理由 |
| pytest × celery | celery 任务测试须用 eager 模式（task_always_eager=True） | 避免测试依赖 broker |
| pytest × django | 须用 pytest-django 的 django_db fixture | 避免 Django ORM 测试事务冲突 |
| pytest × fastapi | 用 httpx.AsyncClient + ASGITransport（TestClient 已 deprecated in 0.100+） | 防 starlette 升级后 fixture 失效 |
| pytest × sqlalchemy | 用 pytest-sqlalchemy 或 scoped_session fixture | 防 session 跨测试污染事务 |

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
| pytest 8.0 | tmpdir 弃用警告强化 | 须迁 tmp_path |
| pytest 9.0 | 待验证：具体 breaking 未联网核实 | 待验证 |
