---
ruleset_id: jest-vitest
适用版本: Vitest 3.x/4.x（4.x 现行；Jest 兼容模式差异单独标注）
最后调研: 2026-07-17（来源：https://vitest.dev/ ；https://vitest.dev/guide/ ；https://vitest.dev/api/ ；https://vitest.dev/guide/mocking.html ；https://vitest.dev/guide/snapshot.html ）
深度门槛: 10
---

# Jest/Vitest 规则集

<!--
本规则集覆盖 Vitest 3.x/4.x（截至 2026-07 现行 4.x）与 Jest 兼容模式差异。调研时点：2026-07-17。
Vitest 与 Vite 共享配置，API 与 Jest 高度兼容但非全等（vi.fn vs jest.fn、vi.hoisted 提升）。
无法确认的版本点已标"待验证"，不臆造。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 依赖 | `vitest` 包（package.json devDependencies）/ `@vitest/coverage-v8` / `@vitest/ui` / `jest` | 高 |
| 文件 | `vitest.config.ts` / `vitest.config.js` / `jest.config.*` / `vite.config.*` 含 `test:` | 高 |
| 代码 | `from 'vitest'` / `import { describe, it, expect, vi }` / `vi.fn(` / `vi.mock(` / `jest.fn(` | 高 |
| 测试文件 | `**/__tests__/**/*.test.ts` / `**/*.spec.ts` / `**/*.bench.ts` | 高 |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 assets/framework-signals.md（guide §C+.0.5 仅留指针）。
detect 信号命中任一高置信度行即可激活 jest-vitest 框架规则集。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- 测试文件：`find "${PROJECT_DIR}" -type f \( -name '*.test.ts' -o -name '*.spec.ts' \) -not -path '*/node_modules/*'`（计数核验基准：测试文件数）
- 测试用例：`grep -rnE '\b(describe|it|test)\(' "${PROJECT_DIR}" --include='*.test.ts' --include='*.spec.ts'`（计数核验基准：用例调用行数）
- mock 调用：`grep -rnE '\b(vi|jest)\.(mock|fn|spyOn)\(' "${PROJECT_DIR}" --include='*.test.ts'`（计数核验基准：mock 调用行数）
- 快照断言：`grep -rnE 'toMatchSnapshot\(|toMatchInlineSnapshot\(' "${PROJECT_DIR}" --include='*.test.ts'`（计数核验基准：快照断言行数）

<!--
枚举该框架特有的、生成时须全量列出的构件类型；与 §C+.1-FW 各框架枚举命令段呼应。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：测试位置须与 vitest.config include 一致
- **适用版本**: Vitest 3.x/4.x
- **规律**: 测试文件须放在 `__tests__/*.test.ts` 或 `*.spec.ts` 约定位置，且与 `vitest.config` 的 `include` glob 一致。位置不一致会导致测试不被收集（静默漏跑）。
- **违反后果**: 测试文件不被收集、CI 静默漏跑、覆盖率失真。
- **验证方法**: 测试文件路径不含 test/spec/__tests__ → warn；config 无 include 约定 → warn。
- **对应门禁**: fw_jest_test_location(warn)

```verify
id: jest-vitest-r1
cmd: 
expect: always
```

### 规律：跨变量引用 mock 须用 vi.hoisted 提升
- **适用版本**: Vitest 3.x/4.x
- **规律**: `vi.mock('mod', () => factory)` 会被提升到文件顶部（类似 Jest hoisting），factory 内引用外部变量会因变量未初始化抛 ReferenceError。须用 `vi.hoisted(() => ({ ... }))` 提升变量，再在 factory 内引用。
- **违反后果**: mock factory ReferenceError、测试启动即崩溃。
- **验证方法**: 检出 `vi.mock(` 含 factory 箭头函数但无 `vi.hoisted(` → warn。
- **对应门禁**: fw_jest_mock_hoisted(warn)

```verify
id: jest-vitest-r2
cmd: 
expect: always
```

### 规律：快照须治理，禁无脑 --update
- **适用版本**: Vitest 3.x/4.x / Jest
- **规律**: `toMatchSnapshot` 快照须定期评审、人工确认变更合理。CI 须 `--ci` 防止生成新快照（失败即卡）。`vitest -u` 无脑更新会掩盖回归。inline snapshot 更易评审。
- **违反后果**: 无脑更新快照掩盖回归、快照与实现脱节。
- **验证方法**: 检出 `toMatchSnapshot(`/`toMatchInlineSnapshot(` → warn 提示治理。
- **对应门禁**: fw_jest_snapshot_governance(warn)

```verify
id: jest-vitest-r3
cmd: 
expect: always
```

### 规律：须配覆盖率阈值门禁
- **适用版本**: Vitest 3.x/4.x（`@vitest/coverage-v8`）；Jest 29.x（`coverageThreshold`）
- **规律**: Vitest 的 `coverage.thresholds` 或 Jest 的 `coverageThreshold` 须配 lines/functions/branches/statements 阈值（如 80%），低于阈值 CI 失败。无阈值则覆盖率无门禁，回归无感知。
- **违反后果**: 覆盖率下滑无感知、测试债累积。
- **验证方法**: config 无 `thresholds`/`coverage.thresholds`/`coverageThreshold` → fail。
- **对应门禁**: fw_jest_coverage_threshold(fail)

```verify
id: jest-vitest-r4
cmd: 
expect: always
```

### 规律：Vitest 须用 vi.* API，禁残留 Jest API
- **适用版本**: Vitest 3.x/4.x
- **规律**: Vitest 提供 `vi.fn`/`vi.mock`/`vi.spyOn`/`vi.useFakeTimers` 替代 Jest 的 `jest.*`。残留 `jest.fn(` 等仅兼容模式可用，非兼容模式运行期 undefined。
- **违反后果**: jest.* undefined 运行期报错、兼容模式不稳定。
- **验证方法**: 检出 `jest.fn(`/`jest.mock(` 等 → warn。
- **对应门禁**: fw_jest_jest_fn_to_vi(warn)

```verify
id: jest-vitest-r5
cmd: 
expect: always
```

### 规律：须显式配置 environment（jsdom/happy-dom/node）
- **适用版本**: Vitest 3.x/4.x
- **规律**: `environment` 默认 `node`，DOM 测试（document/window）须显式 `jsdom` 或 `happy-dom`（更快）。未配置则 DOM API undefined。
- **违反后果**: DOM 测试 document undefined、运行期报错。
- **验证方法**: config 无 `environment:` → warn。
- **对应门禁**: fw_jest_environment(warn)

```verify
id: jest-vitest-r6
cmd: 
expect: always
```

### 规律：DOM 环境须配 setupFiles 引入 jest-dom
- **适用版本**: Vitest 3.x/4.x + @testing-library
- **规律**: DOM 环境须配 `setupFiles: ['./tests/setup.ts']`，setup 内 `import '@testing-library/jest-dom'` 扩展 matcher（toBeInTheDocument 等）。未引入则自定义 matcher undefined。
- **违反后果**: jest-dom matcher undefined、断言失败。
- **验证方法**: DOM 环境（jsdom/happy-dom）无 setupFiles → warn。
- **对应门禁**: fw_jest_setup_files(warn)

```verify
id: jest-vitest-r7
cmd: 
expect: always
```

### 规律：禁开 globals: true，推荐显式 import
- **适用版本**: Vitest 3.x/4.x
- **规律**: `globals: true` 把 describe/it/expect 注入全局作用域，污染全局、ESLint 需额外配置。推荐显式 `import { describe, it, expect } from 'vitest'`，类型与静态分析更准。
- **违反后果**: 全局污染、ESLint 报未定义、IDE 类型提示弱。
- **验证方法**: 检出 `globals: true` → warn。
- **对应门禁**: fw_jest_globals(warn)

```verify
id: jest-vitest-r8
cmd: 
expect: always
```

### 规律：in-source testing 须用 if(import.meta.vitest) 隔离
- **适用版本**: Vitest 3.x/4.x
- **规律**: 在源码内联测试（in-source testing）须用 `if (import.meta.vitest)` 包裹测试块，生产构建时 Vite 会 tree-shake 剔除。未隔离会把测试代码打进生产 bundle。
- **违反后果**: 生产 bundle 含测试代码、体积膨胀、源码泄漏。
- **验证方法**: config `include` 含 `src/`（in-source）→ warn 提示隔离。
- **对应门禁**: fw_jest_in_source(warn)

```verify
id: jest-vitest-r9
cmd: 
expect: always
```

### 规律：性能敏感模块须配 benchmark 基准
- **适用版本**: Vitest 3.x/4.x（`bench` API）
- **规律**: 性能敏感模块（解析/序列化/算法）须配 `.bench.ts` 基准测试，防性能回归。Vitest 内置 `bench` API，与测试同配置。
- **违反后果**: 性能回归无感知、线上慢查询。
- **验证方法**: config 无 `bench` 配置 → warn。
- **对应门禁**: fw_jest_bench(warn)

```verify
id: jest-vitest-r10
cmd: 
expect: always
```

### 规律：类型测试须启用 typecheck
- **适用版本**: Vitest 3.x/4.x
- **规律**: 类型断言测试（`expectTypeOf`）须在 config 启用 `typecheck: { enabled: true }`，否则类型测试不执行。类型测试可捕获泛型/条件类型回归。
- **违反后果**: 类型测试不执行、类型回归无感知。
- **验证方法**: config 无 `typecheck` → warn。
- **对应门禁**: fw_jest_typecheck(warn)

```verify
id: jest-vitest-r11
cmd: 
expect: always
```

### 规律：vitest.config include 须明确 custom 测试入口
- **适用版本**: Vitest 3.x/4.x（vitest 随 jest-vitest 合并管理，原 vitest 规则集已并入）
- **规律**: 项目若有 custom 测试入口（非默认 `**/*.test.ts` 约定，如自定义脚本、集成测试目录），须在 `vitest.config` 的 `include` 显式列出，避免遗漏收集。本规律与 `fw_jest_test_location` 语义重叠（test_location 已检 include test/spec 一致性），不单独新增门禁，统一由 `fw_jest_test_location` 覆盖；config 含 `custom` 字样作为额外置信信号。
- **违反后果**: custom 测试入口未纳入 include → 测试不执行、CI 绿但回归无感知。
- **验证方法**: `VITEST_CONFIG_FILE` 指向配置文件，`grep -qE "custom" "$VITEST_CONFIG_FILE"` 校验是否声明 custom 入口；未声明 → warn（见 fw_jest_test_location）。
- **对应门禁**: 见 fw_jest_test_location（语义合并，不新增门禁）

```verify
id: jest-vitest-r12
cmd: grep -qE "custom" "$VITEST_CONFIG_FILE"
expect: hits>0
```

### 规律：禁在只读 upstream 目录新增测试文件
- **适用版本**: Vitest 3.x/4.x（按仓库只读区声明实例化）
- **规律**: 若仓库存在只读上游快照目录（以该项目 AGENTS.md/CLAUDE.md 声明为准），快照内自带测试不算本仓违规——检测须 prune 快照子包、仅查快照目录直属文件，以捕获未来直接在快照顶层新增测试的真实违规。**实例锚点（迁移须调整）**：本条按 ncwk 仓库契约实例化（`upstream/` 子目录全为只读第三方快照：element-web/hermes-agent/hermes-studio/research 等）；迁移到其他仓库时须按该仓库的只读目录约定调整 prune 路径，非通用 Vitest 规律。
- **违反后果**: 在只读 upstream 新增测试 → 污染只读快照、与上游同步时冲突丢失。
- **验证方法**: `VITEST_FORBIDDEN_UPSTREAM_TEST` 设正则后，`find . \( -path ./node_modules -o -path "./upstream/*" \) -prune -o -name "*.test.ts" -print | grep -E "$VITEST_FORBIDDEN_UPSTREAM_TEST"` 检出 upstream 直属测试文件 → fail。
- **对应门禁**: fw_jest_no_upstream_test(fail)

```verify
id: jest-vitest-r13
cmd: find "${PROJECT_DIR}" \( -path ./node_modules -o -path "./upstream/*" \) -prune -o -name "*.test.ts" -print | grep -E "$VITEST_FORBIDDEN_UPSTREAM_TEST"
expect: hits>0
```

<!--
共 13 条规律（≥10 门槛，vitest 合并后 +2）。11 条挂 jest-vitest 门禁，1 条折叠进 fw_jest_test_location（不新增门禁），1 条新增 fw_jest_no_upstream_test(fail)。
每条规律均挂门禁 id 或"见 <门禁>"，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE / GB 映射 |
|---------|------|---------|---------|--------------|
| fw_jest_test_location | warn | 测试文件不在 test/spec/__tests__ → warn | VITEST_TEST_GLOBS VITEST_CONFIG_GLOBS | — |
| fw_jest_mock_hoisted | warn | vi.mock factory 无 vi.hoisted → warn | VITEST_TEST_GLOBS | — |
| fw_jest_snapshot_governance | warn | 快照断言 → warn 治理提示 | VITEST_TEST_GLOBS | — |
| fw_jest_coverage_threshold | fail | 无 coverage.thresholds / coverageThreshold 的数值阈值（lines/branches/functions/statements: N）→ fail；仅装 @vitest/coverage 插件不算 | VITEST_CONFIG_GLOBS | — |
| fw_jest_jest_fn_to_vi | warn | 残留 jest.fn/jest.mock → warn | VITEST_TEST_GLOBS | — |
| fw_jest_environment | warn | 无 environment 配置 → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_setup_files | warn | DOM 环境无 setupFiles → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_globals | warn | globals: true → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_in_source | warn | in-source 未隔离 → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_bench | warn | 无 benchmark 配置 → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_typecheck | warn | 无 typecheck → warn | VITEST_CONFIG_GLOBS | — |
| fw_jest_no_upstream_test | fail | VITEST_FORBIDDEN_UPSTREAM_TEST 正则检出 upstream 直属测试文件 → fail（ncwk 仓库契约，prune upstream/<子包>/） | VITEST_FORBIDDEN_UPSTREAM_TEST | — |

<!--
门禁 id 命名规范：fw_jest_<rule>（rule 全小写下划线）。
本表 12 条 id（11 原有 + 1 vitest 合并的 no_upstream_test）须在 assets/framework-gates/jest-vitest.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_jest_<rule>(fail/warn) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: jest-vitest  requires_conf: VITEST_CONFIG_GLOBS VITEST_TEST_GLOBS VITEST_CONFIG_FILE VITEST_FORBIDDEN_UPSTREAM_TEST` 声明。
fixture 验证覆盖：violating 含无覆盖率阈值 + 残留 jest.fn + globals:true + upstream/ 直属测试文件
→ coverage_threshold/no_upstream_test fail 主触发（2/2 已断言）；compliant 全 pass（upstream/ 仅子包嵌套测试）。
2026-07-20 沉睡修复：no_upstream_test 的 find prune 由 `-path "./upstream/*"` 改 `-path "./upstream/*/*"`
（原写法把 upstream/ 直属文件一并剪掉，门禁永不命中；修复前后合成样本对照见 tests/fixtures/jest-vitest/README.md），
pass/fail 输出行未动。
vitest 合并自原独立 vitest.sh（harvested-from: ncwk-dev precheck.sh:2633-2654），原 include_custom 规律折叠进 fw_jest_test_location，原 no_upstream_test 改名 fw_jest_no_upstream_test 保留 fail 级。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| jest-vitest × vite | vitest.config 须复用 vite alias | 否则测试内 alias 解析与构建不一致 |
| jest-vitest × vue | 组件测试须 @vue/test-utils + happy-dom/jsdom | 否则 SFC 挂载失败 |
| jest-vitest × react | 组件测试须 @testing-library/react + jsdom | 否则 JSX 渲染失败 |
| jest-vitest × typescript | 类型测试须 typecheck.enabled + tsconfig 一致 | 否则 expectTypeOf 不执行 |

<!--
无强交互的框架组合省略；本表聚焦 jest-vitest 生态内高频组合。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Vitest 2.0 | 默认 unmock 全局，须显式 vi.mock | 旧 Jest 自动 mock 行为不兼容 |
| Vitest 3.0 | pool 默认 forks（非 threads） | 隔离行为变化，线程敏感测试须调整 |
| Vitest 3.0 | vi.hoisted 稳定（mock 提升标准） | factory 引用变量须 hoisted |
| Vitest 4.0 | coverage.thresholds 结构调整（待验证） | 待验证：旧阈值路径须人工核实 |
| Vitest 4.0 | typecheck 默认行为变化（待验证） | 待验证：4.x typecheck 默认是否启用须人工核实 |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
