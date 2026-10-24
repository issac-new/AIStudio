---
ruleset_id: c-cpp
适用版本: C11 / C++17+
最后调研: 2026-07-23（来源：SEI CERT C/C++ Coding Standard + CWE）
深度门槛: 10
---
## §1 探查信号
| 信号类型 | 模式 | 置信度 |
|---|---|---|
| 文件 | `CMakeLists.txt` 或 `Makefile` | 高 |
| 文件 | `*.c` / `*.cpp` / `*.h` / `*.hpp` | 高 |
| 依赖 | `*.cpp` 含 `#include <iostream>` | 中 |

## §2 特定构件枚举
- C 源文件：`find . -name '*.c' -not -path '*/build/*'`
- C++ 源文件：`find . -name '*.cpp' -not -path '*/build/*'`
- 头文件：`find . -name '*.h' -o -name '*.hpp'`

## §3 领域规律（≥ 深度门槛 条，每条五要素 + 证据）
### 规律：禁用 strcpy/strcat/sprintf
- **适用版本**: 全版本
- **规律**: 须用 strncpy/snprintf 替代，防缓冲区溢出。
- **违反后果**: 缓冲区溢出（CWE-120/676）。
- **验证方法**: `strcpy(` 或 `strcat(` 或 `sprintf(` 命中 → fail。
- **对应门禁**: fw_ccpp_unsafe_str(fail)

```verify
id: c-cpp-r1
cmd: 
expect: always
```

### 规律：禁用 gets()
- **适用版本**: C11 已移除
- **规律**: gets() 无长度限制，须用 fgets()。
- **违反后果**: 缓冲区溢出（CWE-242）。
- **验证方法**: `gets(` 命中 → fail。
- **对应门禁**: fw_ccpp_gets(fail)

```verify
id: c-cpp-r2
cmd: 
expect: always
```

### 规律：禁 malloc 无 free
- **适用版本**: 全版本
- **规律**: 每个 malloc 须有对应 free，建议用 RAII/智能指针。
- **违反后果**: 内存泄漏（CWE-401）。
- **验证方法**: `malloc(` 命中但同文件无 `free(` → warn。
- **对应门禁**: fw_ccpp_memleak(warn)

```verify
id: c-cpp-r3
cmd: 
expect: always
```

### 规律：禁 printf 格式串拼接
- **适用版本**: 全版本
- **规律**: 须用 `printf("%s", str)`，禁 `printf(str)`。
- **违反后果**: 格式串漏洞（CWE-134）。
- **验证方法**: `printf(` 参数为变量（非格式串字面量） → warn。
- **对应门禁**: fw_ccpp_format_str(warn)

```verify
id: c-cpp-r4
cmd: 
expect: always
```

### 规律：须用 RAII/智能指针
- **适用版本**: C++11+
- **规律**: 禁裸 new/delete，须用 unique_ptr/shared_ptr。
- **违反后果**: 内存泄漏/双重释放。
- **验证方法**: `new ` 命中但无 `unique_ptr|shared_ptr` → warn。
- **对应门禁**: fw_ccpp_raii(warn)

```verify
id: c-cpp-r5
cmd: 
expect: always
```

### 规律：须配 const correctness
- **适用版本**: 全版本
- **规律**: 成员函数/参数须加 const。
- **违反后果**: 意外修改。
- **验证方法**: 无 `const` 关键字的 .cpp 文件 → warn。
- **对应门禁**: fw_ccpp_const(warn)

```verify
id: c-cpp-r6
cmd: 
expect: always
```

### 规律：须用 nullptr（禁 NULL/0）
- **适用版本**: C++11+
- **规律**: 须用 nullptr，禁 NULL 或 0 作为指针。
- **违反后果**: 类型安全/重载歧义。
- **验证方法**: `= NULL` 或 `= 0` 作为指针赋值 → warn。
- **对应门禁**: fw_ccpp_nullptr(warn)

```verify
id: c-cpp-r7
cmd: 
expect: always
```

### 规律：须用 static_cast（禁 C 风格强转）
- **适用版本**: C++11+
- **规律**: 禁 `(int*)x` C 风格强转，须用 static_cast/reinterpret_cast。
- **违反后果**: 类型安全（CWE-704）。
- **验证方法**: C 风格强转 `(int|char|void|double)\*` 命中 → warn。
- **对应门禁**: fw_ccpp_static_cast(warn)

```verify
id: c-cpp-r8
cmd: 
expect: always
```

### 规律：须配 clang-tidy
- **适用版本**: 全版本
- **规律**: 项目须配 .clang-tidy 静态分析。
- **违反后果**: 代码质量退化。
- **验证方法**: 无 .clang-tidy 文件 → warn。
- **对应门禁**: fw_ccpp_clang_tidy(warn)

```verify
id: c-cpp-r9
cmd: 
expect: always
```

### 规律：须用 std::string（禁 char* 字符串操作）
- **适用版本**: C++11+
- **规律**: 须用 std::string，禁裸 char* 字符串操作。
- **违反后果**: 缓冲区溢出/内存管理复杂。
- **验证方法**: `char\s*\*` 字符串操作且无 `std::string` → warn。
- **对应门禁**: fw_ccpp_std_string(warn)

```verify
id: c-cpp-r10
cmd: 
expect: always
```

## §4 门禁清单
| 门禁 id | 级别 | 实现逻辑 | 依赖变量 | CWE/GB 映射 |
|---|---|---|---|---|
| fw_ccpp_unsafe_str | fail | strcpy/strcat/sprintf → fail | C_CPP_GLOBS | CWE-120/676 |
| fw_ccpp_gets | fail | gets( → fail | C_CPP_GLOBS | CWE-242 |
| fw_ccpp_memleak | warn | malloc 无 free → warn | C_CPP_GLOBS | CWE-401 |
| fw_ccpp_format_str | warn | printf(变量) → warn | C_CPP_GLOBS | CWE-134 |
| fw_ccpp_raii | warn | new 无智能指针 → warn | C_CPP_GLOBS | — |
| fw_ccpp_const | warn | 无 const → warn | C_CPP_GLOBS | — |
| fw_ccpp_nullptr | warn | NULL/0 指针 → warn | C_CPP_GLOBS | — |
| fw_ccpp_static_cast | warn | C 风格强转 → warn | C_CPP_GLOBS | CWE-704 |
| fw_ccpp_clang_tidy | warn | 无 .clang-tidy → warn | C_CPP_GLOBS | — |
| fw_ccpp_std_string | warn | char* 无 std::string → warn | C_CPP_GLOBS | — |

## §5 跨框架交互规则
无已知强交互。

## §6 版本陷阱速查
| 版本 | 变化 | 影响 |
|---|---|---|
| C11 | gets() 移除 | 旧代码须迁移 fgets |
| C++17 | std::optional | 替代裸指针 nullable |
