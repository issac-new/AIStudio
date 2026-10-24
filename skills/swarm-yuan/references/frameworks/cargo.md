---
ruleset_id: cargo
适用版本: Cargo 1.70+ / Rust 2021 edition（≥1.74 cargo lints 表稳定；差异单独标注；OpenTofu 同构适用不适用，本规则集仅覆盖 Rust 生态）
最后调研: 2026-07-23（来源：https://doc.rust-lang.org/cargo/ / https://doc.rust-lang.org/rustc/lints / https://github.com/rustsec/cargo-audit / cargo-deny 官方文档）
深度门槛: 10
---

# Cargo 规则集

<!--
Rust 生态系规则集（WP-U 新增，填补 R4 §4.2「系统编程语言」缺口——此前无 Rust 生态门禁）。
判定哲学与 terraform/gin 一致：grep/awk 静态结构匹配，宁 warn 勿误判 fail；
TOML 解析用 grep 匹配字段（非 TOML 解析器，口径在「验证方法」中写明）；
.rs 源码用公共库 _fw_strip_comments_c 剥 // 注释（Rust 注释与 C 系同形态）。
-->

## §1 探查信号（→ §C+.0.5 激活依据，含置信度）

| 信号类型 | 模式 | 置信度 |
|---------|------|-------|
| 文件 | `**/Cargo.toml` | 高（Cargo 工程清单，存在即激活） |
| 文件 | `**/Cargo.lock` | 高（依赖锁文件，存在即激活） |
| 文件 | `**/src/main.rs` / `**/src/lib.rs` | 中（Rust 入口，需组合 Cargo.toml 判定） |
| 文件 | `**/*.rs`（含 src/） | 中（Rust 源码，需组合 Cargo.toml） |
| 配置 | `[package]` / `[dependencies]` / `[[bin]]` TOML 节 | 高 |
| 代码 | `use std::` / `fn main()` / `pub fn` / `impl` / `mod` | 中（Rust 语法特征） |

<!--
信号汇总由 gen-framework-index.sh 扫描本表组装入 exploration-guide.md §C+.0.5 区块。
detect 信号：Cargo.toml 文件存在即激活（R39-D1b 起 detect-frameworks.sh 支持 file_exists
型信号，Cargo.toml 存在即自动探测激活；此前仅依赖字符串匹配，Rust 项目 ACTIVE_FRAMEWORKS
恒空须手动配置——已废止）。
-->

## §2 特定构件枚举（命令 + 计数核验方式）

- Cargo.toml 清单：`find . -name Cargo.toml -not -path '*/target/*' -not -path '*/.git/*'`（计数核验基准：Cargo 工程数）
- 依赖项：`grep -rE '^[a-zA-Z_][a-zA-Z0-9_-]*[[:space:]]*=[[:space:]]*' --include='Cargo.toml' . | grep -vE '\[|^\s*#'`（计数核验基准：[dependencies] 节内依赖条目数）
- unsafe 块：`grep -rnE '\bunsafe[[:space:]]*(\{|\(|fn|impl)' --include='*.rs' .`（计数核验基准：unsafe 使用点数）
- unwrap/expect 调用：`grep -rnE '\.(unwrap|expect)\(' --include='*.rs' .`（计数核验基准：unwrap/expect 调用行数）
- profile.release 配置：`grep -rnE '\[profile\.release\]' --include='Cargo.toml' .`（计数核验基准：release profile 数）
- clippy/lints 配置：`grep -rnE '\[lints\]|clippy::|#\[warn\(clippy' --include='Cargo.toml' --include='*.rs' .`（计数核验基准：clippy/lints 配置点）

<!--
枚举该框架特有的、生成时须全量列出的构件类型（与 §C+.1-FW 各框架枚举命令段呼应）。
四要素核验"构件枚举计数≥实际×0.95"依此判定（见 verify-framework-ruleset.sh）。
Cargo 的 Cargo.toml 是 TOML 格式，本规则集用 grep 匹配字段而非 TOML 解析器，
口径：行首匹配 `[section]` / `key = value`，多行表与数组依赖可能漏检（已在验证方法中标注）。
-->

## §3 领域规律（≥ 深度门槛 条，每条五要素）

### 规律：禁用 unsafe，或须 unsafe 说明
- **适用版本**: 全版本（Rust 内存安全是核心承诺）
- **规律**: 生产代码禁用 `unsafe` 块/函数/impl。确需 unsafe（FFI / 性能关键路径）时须在 unsafe 块上方注释说明「为何安全」（safety comment），否则 clippy `unsafe` lint 报警。标准：`// SAFETY: <reason>`。
- **违反后果**: unsafe 绕过 Rust 借用检查器，引入内存安全漏洞（use-after-free / buffer overflow / 数据竞争），CWE-787 越界写入 / CWE-416 释放后重用 / CWE-415 双重释放（GB/T 22239-2019 8.1.4.4 入侵防范）。
- **验证方法**: `grep -rnE '\bunsafe[[:space:]]*(\{|\(|fn|impl)' --include='*.rs' .`（.rs 剥 // 注释后命中），且同作用域上方无 `// SAFETY:` / `// safety:` 说明 → fail
- **对应门禁**: fw_cargo_unsafe（fail 级）

```verify
id: cargo-r1
cmd: grep -rnE '\bunsafe[[:space:]]*(\{|\(|fn|impl)' --include='*.rs' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：禁用 unwrap()/expect() 在生产代码
- **适用版本**: 全版本
- **规律**: 生产代码禁用 `.unwrap()` / `.expect()`（panic on None/Err）。须用 `?` 操作符或 `match` / `if let` / `unwrap_or` / `unwrap_or_else` 处理 `Option`/`Result`。测试代码（`#[cfg(test)]` / `tests/` 目录）可豁免。
- **违反后果**: None/Err 时进程 panic，单请求崩溃影响全局（非 Rust 的 panic=abort 模式下还直接杀进程）；生产环境不可恢复（CWE-755 异常处理不当；GB/T 22239-2019 8.1.4.5 可用性）。
- **验证方法**: `grep -rnE '\.(unwrap|expect)\(' --include='*.rs' .`（.rs 剥注释后命中），剔除 `#[cfg(test)]` 模块与 `tests/` 目录文件 → warn
- **对应门禁**: fw_cargo_unwrap_expect（warn 级）

```verify
id: cargo-r2
cmd: grep -rnE '\.(unwrap|expect)\(' --include='*.rs' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：依赖须锁定版本，Cargo.lock 须提交
- **适用版本**: 全版本
- **规律**: 二进制 crate 须提交 `Cargo.lock`；库 crate 建议 `cargo publish` 时锁版本约束（`version = "1.2.3"` 精确或 `"^1.2"` 范围）。`Cargo.lock` 入库保证构建可复现，避免依赖漂移引入供应链风险。
- **违反后果**: 不提交 Cargo.lock 时 `cargo build` 每次拉最新符合范围的依赖，构建不可复现，CI 与本地行为漂移；供应链攻击面扩大（如依赖被投毒）（CWE-1357 依赖控制不充分；GB/T 22239-2019 8.1.4.3 恶意代码防范）。
- **验证方法**: `find . -name Cargo.toml -not -path '*/target/*'` 命中的工程目录内无 `Cargo.lock` → warn（口径：文件级启发式，Cargo.lock 可能在 workspace 根）
- **对应门禁**: fw_cargo_lockfile（warn 级）

```verify
id: cargo-r3
cmd: find "${PROJECT_DIR}" -name Cargo.toml -not -path '*/target/*'
expect: hits>0
```

### 规律：禁用 git 依赖，用 crates.io 版本
- **适用版本**: 全版本
- **规律**: `[dependencies]` 内禁用 `xxx = { git = "..." }` 形式，须用 `xxx = "1.2.3"` / `xxx = { version = "1.2.3" }`（crates.io 版本）。git 依赖不可复现（commit 可变）、无法被 crates.io 缓存、构建慢。
- **违反后果**: git 依赖指向的 commit 可被强制推送篡改，供应链安全风险（CWE-1357）；构建依赖网络可达性，CI 离线失败；版本不可追溯。
- **验证方法**: `grep -rnE 'git[[:space:]]*=[[:space:]]*"' --include='Cargo.toml' .`（在 [dependencies] 节内命中 → fail；口径：行级匹配，git = 出现在任意依赖行即报）
- **对应门禁**: fw_cargo_git_deps（fail 级）

```verify
id: cargo-r4
cmd: grep -rnE 'git[[:space:]]*=[[:space:]]*"' --include='Cargo.toml' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：须配 [profile.release] opt-level / lto
- **适用版本**: 全版本
- **规律**: `Cargo.toml` 须配置 `[profile.release]` 含 `opt-level`（建议 3 或 "z" 嵌入式）与 `lto`（建议 true 或 "thin"），优化生产构建体积与性能。默认 release 仅 opt-level=3 无 lto，未深度优化。
- **违反后果**: 生产构建未优化致二进制体积大、运行慢；嵌入场景超 Flash 容量；与竞品（C/C++ -O3 -flto）性能差距大（对应 GB/T 25000.51-2016 性能效率要求）。
- **验证方法**: 检出 Cargo.toml 但无 `[profile.release]` 节，或节内无 `opt-level` / `lto` → warn
- **对应门禁**: fw_cargo_release_profile（warn 级）

```verify
id: cargo-r5
cmd: 
expect: always
```

### 规律：须配 [lints] 或 clippy 配置
- **适用版本**: Cargo ≥1.74（[lints] 表稳定）/ 全版本（.clippy.toml / cargo.toml [lints.clippy]）
- **规律**: 须在 `Cargo.toml` 配 `[lints]` 节（`[lints.rust]` / `[lints.clippy]`）或 `.clippy.toml`，启用 `unsafe_code = "deny"` / `clippy::all = "warn"` 等。仅依赖默认 lint 不够，须显式收紧。
- **违反后果**: 默认 lint 宽松，unsafe/unwrap/clippy 警告被忽略，代码质量漂移；无强制 lint 则 PR 审查负担大（GB/T 25000.51-2016 可维护性）。
- **验证方法**: 检出 Cargo.toml 但无 `[lints]` 节且无 `clippy` 字段且无 `.clippy.toml` 文件 → warn
- **对应门禁**: fw_cargo_lints_config（warn 级）

```verify
id: cargo-r6
cmd: 
expect: always
```

### 规律：禁用 #![allow(warnings)]
- **适用版本**: 全版本
- **规律**: 源码内禁用 `#![allow(warnings)]` / `#![allow(dead_code)]` 全局抑制警告。须逐条 `#![warn(clippy::xxx)]` / `#![deny(unsafe_code)]` 精确控制。全局 allow(warnings) 掩盖所有 lint，等同于关闭质量门禁。
- **违反后果**: 所有编译器/clippy 警告被静默，dead_code / unused / unreachable_code 累积，代码腐化不可控（GB/T 25000.51-2016 可维护性）。
- **验证方法**: `grep -rnE '#!\[allow\(warnings\)\]|#!\[allow\(dead_code\)\]' --include='*.rs' .`（.rs 剥注释后命中 → fail）
- **对应门禁**: fw_cargo_allow_warnings（fail 级）

```verify
id: cargo-r7
cmd: grep -rnE '#!\[allow\(warnings\)\]|#!\[allow\(dead_code\)\]' --include='*.rs' "${PROJECT_DIR}"
expect: hits>0
```

### 规律：须配 panic = "abort"（release）
- **适用版本**: 全版本
- **规律**: `[profile.release]` 须设 `panic = "abort"`，使 panic 时直接终止进程而非 unwind 栈。理由：①减小二进制体积（省 unwind 表）；②防 panic 后继续执行（unwind 可能执行析构函数引入二次错误）；③嵌入式/服务端 panic 应直接崩让 supervisor 重启。
- **违反后果**: 默认 panic=unwind 致二进制体积大（嵌入式超容量）；panic 后析构链执行引入二次错误；进程未崩溃重启卡在异常态（GB/T 22239-2019 8.1.4.5 可用性——异常须快速恢复）。
- **验证方法**: 检出 `[profile.release]` 节但节内无 `panic[[:space:]]*=[[:space:]]*"abort"` → warn
- **对应门禁**: fw_cargo_panic_abort（warn 级）

```verify
id: cargo-r8
cmd: 
expect: always
```

### 规律：依赖须检查许可证，配 cargo-deny 或 cargo-license
- **适用版本**: 全版本
- **规律**: 须配置 `cargo-deny`（`deny.toml` 配置许可证白名单/黑名单）或 `cargo-license` 检查依赖许可证，禁止引入 GPL/AGPL 等传染性许可证到商业项目。CI 须跑 `cargo deny check licenses`。
- **违反后果**: 引入 GPL/AGPL 依赖致整个产品被迫开源，商业风险（CWE-1357 依赖控制；GB/T 22239-2019 8.1.4.3 供应链合规）。
- **验证方法**: `find . -name 'deny.toml' -not -path '*/target/*'`（应非空），或 Cargo.toml 内含 `cargo-deny` / `.cargo/config.toml` 含 license 配置；均无 → warn
- **对应门禁**: fw_cargo_license_check（warn 级）

```verify
id: cargo-r9
cmd: find "${PROJECT_DIR}" -name 'deny.toml' -not -path '*/target/*'
expect: hits>0
```

### 规律：须配 cargo audit，安全漏洞扫描
- **适用版本**: 全版本（cargo-audit 由 RustSec 维护）
- **规律**: 须配置 `cargo-audit`（`cargo install cargo-audit` + CI 跑 `cargo audit`），扫描 Cargo.lock 中依赖的已知 CVE（RustSec Advisory Database）。CI 须在依赖变更时触发审计。
- **违反后果**: 依赖含已知 CVE 未被发现，被利用致漏洞（CWE-1104 使用未维护的第三方组件；GB/T 22239-2019 8.1.4.3 恶意代码防范 / 8.1.4.4 入侵防范）。
- **验证方法**: 检出 Cargo.toml 工程但项目内无 `cargo-audit` / `cargo audit` / `audit.toml` / `.cargo/audit.toml` 引用（CI 配置/README/Cargo.toml dev-dependencies 均算）→ warn
- **对应门禁**: fw_cargo_audit（warn 级）

```verify
id: cargo-r10
cmd: 
expect: always
```

<!--
共 10 条规律（= 门槛 10）。每条规律均挂门禁 id，无游离规律。
verify-framework-ruleset.sh 会扫描每个"### 规律"小节体内"对应门禁/人工检查"关键字，缺失则 NOGATE 报错。
-->

## §4 门禁清单（id / 级别 / 实现逻辑 / 依赖 conf 变量）

| 门禁 id | 级别 | 实现逻辑 | 依赖变量 |
|---------|------|---------|---------|
| fw_cargo_unsafe | fail | .rs 命中 unsafe 块/函数且无 SAFETY 说明 → fail | CARGO_GLOBS |
| fw_cargo_unwrap_expect | warn | .rs 命中 .unwrap()/.expect()（剔除 tests）→ warn | CARGO_GLOBS |
| fw_cargo_lockfile | warn | Cargo.toml 工程目录无 Cargo.lock → warn | CARGO_GLOBS |
| fw_cargo_git_deps | fail | Cargo.toml [dependencies] 内命中 git = "..." → fail | CARGO_GLOBS |
| fw_cargo_release_profile | warn | Cargo.toml 无 [profile.release] 或缺 opt-level/lto → warn | CARGO_GLOBS |
| fw_cargo_lints_config | warn | Cargo.toml 无 [lints] 节且无 clippy 配置 → warn | CARGO_GLOBS |
| fw_cargo_allow_warnings | fail | .rs 命中 #![allow(warnings)] → fail | CARGO_GLOBS |
| fw_cargo_panic_abort | warn | [profile.release] 节无 panic = "abort" → warn | CARGO_GLOBS |
| fw_cargo_license_check | warn | 无 deny.toml 且无 cargo-license 配置 → warn | CARGO_GLOBS |
| fw_cargo_audit | warn | 无 cargo-audit 引用 → warn | CARGO_GLOBS |

<!--
门禁 id 命名规范：fw_cargo_<rule>（rule 全小写下划线）。
本表 10 条 id 须在 assets/framework-gates/cargo.sh 中有同名实现痕迹（grep 命中）。
片段头注释 `# gates: fw_cargo_<rule>(...) ...` 与本表 id 集合应一致。
依赖变量在片段头注释 `# ruleset: cargo  requires_conf: CARGO_GLOBS` 声明。
fixture 验证覆盖：violating/Cargo.toml 有 git 依赖 + violating/src/main.rs 有 unwrap + allow(warnings)
→ git_deps/allow_warnings fail 主触发（2/2 已断言）；compliant 修正后全 pass。
-->

## §5 跨框架交互规则

| 交互对 | 规则 | 理由 |
|-------|------|------|
| cargo × opentelemetry | Rust OTel SDK（`opentelemetry` crate）须在 release profile 配 lto 优化 | OTel SDK 调用频繁，lto 优化降低运行时开销 |
| cargo × terraform | Rust 工具若以 IaC 部署，Cargo.lock 须与 Terraform state 同等入库管理 | Rust 二进制可复现构建 + IaC 可复现部署，缺一不可 |
| cargo × 通用 check_sensitive | 通用门禁扫密钥模式覆盖 .rs 与 Cargo.toml | 本规则集不重复扫密钥，仅报 Rust 语义（unsafe/unwrap），密钥字面量由通用门禁报 |

<!--
无强交互的框架组合省略；本表聚焦 cargo 与常用框架的组合约束。
-->

## §6 版本陷阱速查

| 版本 | 变化 | 影响 |
|------|------|------|
| Cargo 1.74 | `[lints]` 表稳定（之前需 [features] 或外部 clippy 配置） | 新项目应优先用 [lints] 节；旧项目 [features] 方式仍兼容 |
| Cargo 1.70 | `cargo --locked` 强制用 Cargo.lock | CI 应用 --locked 保证可复现构建；不用则可能更新 lock |
| Rust 2021 edition | `panic = "abort"` 行为稳定；prelude 新增 `TryFrom`/`TryInto` | edition 2018 项目升级须注意 panic 行为 |
| cargo-audit 0.18+ | 支持 advisory 数据库离线模式 | 离线 CI 须 `cargo audit -f advisories.json` |
| cargo-deny 0.14+ | `deny.toml` schema 变更（[licenses] allow/deny 字段） | 旧 deny.toml 须迁移 schema |

<!--
记录已知版本陷阱（deprecation / breaking change / 行为差异），生成时按 ACTIVE_FRAMEWORKS 提取的版本号匹配本表，落在受影响区间的项目须额外提示。
-->
