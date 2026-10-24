# ruleset: cargo  requires_conf: CARGO_GLOBS
# gates: fw_cargo_unsafe(fail) fw_cargo_unwrap_expect(warn) fw_cargo_lockfile(warn) fw_cargo_git_deps(fail) fw_cargo_release_profile(warn) fw_cargo_lints_config(warn) fw_cargo_allow_warnings(fail) fw_cargo_panic_abort(warn) fw_cargo_license_check(warn) fw_cargo_audit(warn)
# harvested-from: 新增（2026-07-23），规律源自 doc.rust-lang.org/cargo / rustc lints / cargo-audit / cargo-deny 官方文档
_fw_cargo_check() {
  echo "  [cargo] Cargo 1.70+ / Rust 2021 edition 框架规律"

  # ---------- 收集源文件清单（Cargo.toml + .rs + 配置统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${CARGO_GLOBS[@]+"${CARGO_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "cargo: CARGO_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Cargo.toml vs .rs 源码 vs 其他配置（deny.toml / audit.toml / .cargo/config.toml）
  local cargoarr=() rsarr=() cfgarr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      Cargo.toml) cargoarr+=("$f") ;;
      *.rs) rsarr+=("$f") ;;
      deny.toml|audit.toml|.clippy.toml|config.toml) cfgarr+=("$f") ;;
      *.yml|*.yaml|*.sh) cfgarr+=("$f") ;;
    esac
  done

  # .rs 源码注释剥离：Rust 注释与 C 系同形态（// 行内 + /* */ 块），用公共库 _fw_strip_comments_c
  # Cargo.toml 注释剥离：TOML 用 # 行内注释，用 _fw_strip_comments_cfg（剔 # 行）
  # Cargo.toml 行级 awk 跟踪 [section] 节，在 [profile.release] / [dependencies] 节内匹配字段

  local t ln

  # ====================================================================
  # fw_cargo_unsafe(fail)：禁用 unsafe 或须 SAFETY 说明
  # ====================================================================
  # 口径：.rs 剥 // 注释后命中 unsafe 块/函数/impl，且同文件无 // SAFETY: 说明 → fail
  local unsafe_bad=""
  for t in "${rsarr[@]+"${rsarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    # 命中 unsafe 块/函数/impl
    local ucode
    ucode=$(_fw_strip_comments_c "$t" 2>/dev/null)
    [[ -z "$ucode" ]] && continue
    local ulines
    ulines=$(printf '%s\n' "$ucode" | grep -nE '\bunsafe[[:space:]]*(\{|\(|fn|impl)' || true)
    [[ -z "$ulines" ]] && continue
    # 同文件无 SAFETY 说明 → fail
    if ! printf '%s\n' "$ucode" | grep -qE '//[[:space:]]*SAFETY:|//safety:'; then
      unsafe_bad="${unsafe_bad}${t}: unsafe 无 SAFETY 说明:
${ulines}
"
    fi
  done
  _fw_report fail fw_cargo_unsafe "$unsafe_bad" "检出 unsafe 块/函数/impl 且无 // SAFETY: 说明（unsafe 绕过借用检查，CWE-787/416/415 内存安全漏洞；GB/T 22239-2019 8.1.4.4）" "无 unsafe 或 unsafe 均附 SAFETY 说明"

  # ====================================================================
  # fw_cargo_unwrap_expect(warn)：生产代码禁 unwrap()/expect()
  # ====================================================================
  # 口径：.rs 剥注释后命中 .unwrap()/.expect()，剔除 tests/ 目录与 #[cfg(test)] 模块 → warn
  # 启发式：文件路径含 /tests/ 或文件内 #[cfg(test)] 出现在 unwrap 前 → 豁免（简化口径）
  local unwrap_bad=""
  for t in "${rsarr[@]+"${rsarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    # tests/ 目录豁免（_fw_resolve_globs 对 CARGO_GLOBS="tests/**/*.rs" 解出
    # 相对路径 "tests/xxx.rs"——原 case 只有 */tests/*（绝对/带前缀形态）时相对路径漏豁免）
    case "$t" in
      */tests/*|*/test/*|tests/*|test/*|*_test.rs|*test.rs) continue ;;
    esac
    local rcode
    rcode=$(_fw_strip_comments_c "$t" 2>/dev/null)
    [[ -z "$rcode" ]] && continue
    # 剔除 #[cfg(test)] 模块后的命中（awk 状态机：#[cfg(test)] 后到对应 } 跳过）
    local filtered
    filtered=$(printf '%s\n' "$rcode" | awk '
      /^#\[cfg\(test\)\]/ { intest=1; depth=0; next }
      intest && /\{/ { depth++; next }
      intest && /\}/ { if (depth==0) intest=0; else depth--; next }
      !intest { print }
    ' || true)
    ln=$(printf '%s\n' "$filtered" | grep -nE '\.(unwrap|expect)\(' || true)
    [[ -n "$ln" ]] && unwrap_bad="${unwrap_bad}${t}:${ln}
"
  done
  _fw_report warn fw_cargo_unwrap_expect "$unwrap_bad" "生产代码 .unwrap()/.expect()（panic on None/Err 致进程崩溃，CWE-755；GB/T 22239-2019 8.1.4.5，须用 ? 或 match 处理）" "生产代码无 unwrap/expect 或已用 ? 处理"

  # ====================================================================
  # fw_cargo_lockfile(warn)：依赖须锁定，Cargo.lock 须提交
  # ====================================================================
  # 口径：Cargo.toml 所在目录无 Cargo.lock → warn（文件级启发式，workspace 根的 lock 可能漏检）
  local lock_bad=""
  for t in "${cargoarr[@]+"${cargoarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    local cdir
    cdir="$(cd "$(dirname "$t")" && pwd)"
    if [[ ! -f "${cdir}/Cargo.lock" ]]; then
      lock_bad="${lock_bad}${t}
"
    fi
  done
  _fw_report warn fw_cargo_lockfile "$lock_bad" "Cargo.toml 工程目录无 Cargo.lock（构建不可复现，供应链漂移风险，CWE-1357；GB/T 22239-2019 8.1.4.3）" "各工程均有 Cargo.lock"

  # ====================================================================
  # fw_cargo_git_deps(fail)：禁用 git 依赖
  # ====================================================================
  # 口径：Cargo.toml 内命中 git = "..." → fail（行级匹配，[dependencies] 节内即报）
  local git_bad=""
  for t in "${cargoarr[@]+"${cargoarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    ln=$(_fw_strip_comments_cfg "$t" | grep -nE 'git[[:space:]]*=[[:space:]]*"' || true)
    [[ -n "$ln" ]] && git_bad="${git_bad}${t}:${ln}
"
  done
  _fw_report fail fw_cargo_git_deps "$git_bad" "Cargo.toml 命中 git 依赖（git 依赖不可复现、可被篡改，CWE-1357 供应链风险；须用 crates.io version= 约束）" "无 git 依赖"

  # ====================================================================
  # fw_cargo_release_profile(warn)：须配 [profile.release] opt-level/lto
  # ====================================================================
  # 口径：Cargo.toml 无 [profile.release] 节，或节内无 opt-level/lto → warn
  local rel_bad=""
  for t in "${cargoarr[@]+"${cargoarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    # awk 跟踪 [profile.release] 节（到下一个 [ 开头或 EOF）
    local in_rel has_opt=0 has_lto=0
    in_rel=$(_fw_strip_comments_cfg "$t" | awk '
      /^\[profile\.release\]/ { inrel=1; next }
      /^\[/ { inrel=0; next }
      inrel && /opt-level/ { o=1 }
      inrel && /lto/ { l=1 }
      END { print o+0 " " l+0 }
    ' || true)
    has_opt="${in_rel%% *}"
    has_lto="${in_rel##* }"
    if [[ "$has_opt" -eq 0 || "$has_lto" -eq 0 ]]; then
      rel_bad="${rel_bad}${t}（opt-level=${has_opt}, lto=${has_lto}）
"
    fi
  done
  _fw_report warn fw_cargo_release_profile "$rel_bad" "[profile.release] 缺 opt-level 或 lto（生产构建未深度优化，体积大运行慢；GB/T 25000.51-2016 性能效率）" "release profile 已配 opt-level + lto"

  # ====================================================================
  # fw_cargo_lints_config(warn)：须配 [lints] 或 clippy 配置
  # ====================================================================
  # 口径：Cargo.toml 无 [lints] 节且无 clippy 字段，且项目无 .clippy.toml → warn
  local lints_bad=""
  local has_clippy_file=0
  for t in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    case "$(basename "$t")" in
      .clippy.toml|clippy.toml) has_clippy_file=1 ;;
    esac
  done
  for t in "${cargoarr[@]+"${cargoarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    if ! _fw_strip_comments_cfg "$t" | grep -qE '^\[lints\]|clippy'; then
      if [[ "$has_clippy_file" -eq 0 ]]; then
        lints_bad="${lints_bad}${t}
"
      fi
    fi
  done
  _fw_report warn fw_cargo_lints_config "$lints_bad" "Cargo.toml 无 [lints]/clippy 且无 .clippy.toml（默认 lint 宽松，代码质量漂移；GB/T 25000.51-2016 可维护性）" "已配 [lints] 或 .clippy.toml"

  # ====================================================================
  # fw_cargo_allow_warnings(fail)：禁用 #![allow(warnings)]
  # ====================================================================
  # 口径：.rs 剥注释后命中 #![allow(warnings)] / #![allow(dead_code)] → fail
  local aw_bad=""
  for t in "${rsarr[@]+"${rsarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    ln=$(_fw_strip_comments_c "$t" | grep -nE '#!\[allow\(warnings\)\]|#!\[allow\(dead_code\)\]' || true)
    [[ -n "$ln" ]] && aw_bad="${aw_bad}${t}:${ln}
"
  done
  _fw_report fail fw_cargo_allow_warnings "$aw_bad" "检出 #![allow(warnings)] 全局抑制（掩盖所有 lint，代码腐化不可控；GB/T 25000.51-2016）" "无全局 allow(warnings)"

  # ====================================================================
  # fw_cargo_panic_abort(warn)：release 须配 panic = "abort"
  # ====================================================================
  # 口径：[profile.release] 节无 panic = "abort" → warn（前提：已有 release 节）
  local panic_bad=""
  for t in "${cargoarr[@]+"${cargoarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    # 先确认有 [profile.release] 节
    if ! _fw_strip_comments_cfg "$t" | grep -qE '^\[profile\.release\]'; then
      panic_bad="${panic_bad}${t}（无 [profile.release] 节）
"
      continue
    fi
    # awk 跟踪 [profile.release] 节内是否含 panic = "abort"
    local has_panic=0
    has_panic=$(_fw_strip_comments_cfg "$t" | awk '
      /^\[profile\.release\]/ { inrel=1; next }
      /^\[/ { inrel=0; next }
      inrel && /panic[[:space:]]*=[[:space:]]*"abort"/ { p=1 }
      END { print p+0 }
    ' || true)
    if [[ "$has_panic" -eq 0 ]]; then
      panic_bad="${panic_bad}${t}（无 panic = \"abort\"）
"
    fi
  done
  _fw_report warn fw_cargo_panic_abort "$panic_bad" "release profile 缺 panic = \"abort\"（默认 unwind 致二进制大、panic 后析构链引入二次错误；GB/T 22239-2019 8.1.4.5）" "release 已配 panic = abort"

  # ====================================================================
  # fw_cargo_license_check(warn)：须配 cargo-deny 或 cargo-license
  # ====================================================================
  # 口径：项目无 deny.toml 且 Cargo.toml 无 cargo-deny/cargo-license 引用 → warn
  # 原实现只在 CARGO_GLOBS 文件集内
  # 找 deny.toml——deny.toml 不在默认 CARGO_GLOBS（"Cargo.toml" "src/**/*.rs"）时恒漏检，
  # 合规项目误报。对齐 ruleset cargo.md §3 规律 9 口径：全仓 find deny.toml（cwd=PROJECT_DIR）。
  local has_deny_file=0 has_license_ref=0
  if find . -name 'deny.toml' -not -path '*/target/*' -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null | grep -q .; then
    has_deny_file=1
  fi
  for t in "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    case "$(basename "$t")" in
      deny.toml) has_deny_file=1 ;;
    esac
  done
  for t in "${cargoarr[@]+"${cargoarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_strip_comments_cfg "$t" | grep -qE 'cargo-deny|cargo-license|cargo deny' && has_license_ref=1
  done
  if [[ "$has_deny_file" -eq 0 && "$has_license_ref" -eq 0 ]]; then
    warn "fw_cargo_license_check: 无 deny.toml 且无 cargo-deny/cargo-license 引用（依赖许可证未检，GPL/AGPL 传染风险；CWE-1357）"
  else
    pass "fw_cargo_license_check: 已配 cargo-deny 或 cargo-license"
  fi

  # ====================================================================
  # fw_cargo_audit(warn)：须配 cargo-audit 安全扫描
  # ====================================================================
  # 口径：项目无 cargo-audit 引用（Cargo.toml/CI/README 均算）→ warn
  # 引用面按 ruleset 口径扩展到 README*/docs/*.md/.github/*（原只扫
  # CARGO_GLOBS 文件集，README 写明 "cargo audit" 的合规项目恒误报）+ 全仓 find audit.toml。
  local has_audit=0
  find . -name 'audit.toml' -not -path '*/target/*' -not -path '*/.git/*' 2>/dev/null | grep -q . && has_audit=1
  for t in "${cargoarr[@]+"${cargoarr[@]}"}" "${cfgarr[@]+"${cfgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    _fw_strip_comments_cfg "$t" | grep -qE 'cargo-audit|cargo audit|audit\.toml' && has_audit=1
  done
  if [[ "$has_audit" -eq 0 ]]; then
    # README/docs/.github 引用兜底（规则集口径"CI 配置/README 均算"）
    if find . -maxdepth 3 -type f \( -name 'README*' -o -path './.github/*' -o -path './docs/*' \) \
        -not -path '*/target/*' -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null \
        | LC_ALL=C grep -E '(README|\.md|\.yml|\.yaml)$' 2>/dev/null \
        | xargs grep -lE 'cargo-audit|cargo audit' 2>/dev/null | grep -q .; then
      has_audit=1
    fi
  fi
  if [[ "$has_audit" -eq 0 ]]; then
    warn "fw_cargo_audit: 无 cargo-audit 引用（依赖 CVE 未扫描，CWE-1104 未维护第三方组件；GB/T 22239-2019 8.1.4.3）"
  else
    pass "fw_cargo_audit: 已配 cargo-audit"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
