# ruleset: ruby  requires_conf: RUBY_SRC_GLOBS RUBY_ENV_SAMPLE_GLOBS RUBY_VIEW_GLOBS
# gates: fw_ruby_hardcoded_secret(fail) fw_ruby_gemfile_lock(warn) fw_ruby_env_key_drift(warn) fw_ruby_view_var(warn)
# harvested-from: 换栈演练补缺（2026-09-26），规律源自 ruby-lang.org 与 bundler.io 文档口径（未逐条核实点见 references/frameworks/ruby.md §6 待验证标注）
_fw_ruby_check() {
  echo "  [ruby] Ruby 3.x + Bundler 2.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${RUBY_SRC_GLOBS[@]+"${RUBY_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "ruby: RUBY_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # ---------- 视图模板清单（可空：对应门禁跳过）----------
  local views vwarr=()
  views=$(_fw_resolve_globs ${RUBY_VIEW_GLOBS[@]+"${RUBY_VIEW_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && vwarr+=("$ln")
  done <<< "$views"

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Ruby 系 # 行注释）。
  # 容忍面：=begin/=end 块注释与 "#{}" 插值会被截断——误报/漏报面为注释与插值里
  # 写密钥样例等边角，人工核验可辨（与 php 片段对 # 注释的容忍口径一致）

  # ====================================================================
  # fw_ruby_hardcoded_secret(fail)：密钥/口令禁止硬编码进源码
  # ====================================================================
  local sec_bad="" f ln
  for f in "${srcarr[@]}"; do
    ln=$(_fw_strip_comments_hash "$f" \
       | grep -niE "(password|passwd|secret|api[_-]?key|app[_-]?key|private[_-]?key|auth[_-]?token|client[_-]?secret|access[_-]?token)" \
       | grep -E "(=>|[A-Za-z0-9_][[:space:]]*(:|=))[[:space:]]*[\"'][^\"']{4,}[\"']" \
       | grep -viE "ENV\[|ENV\.fetch|example|placeholder|changeme|change[_-]?me|your[_-]|\*{3,}" || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${f}:${ln}
"
  done
  _fw_report fail fw_ruby_hardcoded_secret "$sec_bad" "Ruby 源码硬编码密钥/口令字面量（入库即泄露，CWE-798）" "无硬编码密钥/口令字面量"

  # ====================================================================
  # fw_ruby_gemfile_lock(warn)：Gemfile 变更后 lock 须同步（内容 + 时间双判）
  # ====================================================================
  local gf="${PROJECT_DIR:-.}/Gemfile" gl="${PROJECT_DIR:-.}/Gemfile.lock"
  if [[ ! -f "$gf" ]]; then
    pass "fw_ruby_gemfile_lock: 无 Gemfile，跳过"
  elif ! grep -qE '^[[:space:]]*gem[[:space:]]+["'"'"']' "$gf" 2>/dev/null; then
    pass "fw_ruby_gemfile_lock: Gemfile 无 gem 依赖声明（gemspec 驱动项目），跳过"
  elif [[ ! -f "$gl" ]]; then
    warn "fw_ruby_gemfile_lock: Gemfile 声明依赖但 Gemfile.lock 缺失（依赖树不可复现，lock 须入库并与 Gemfile 同步变更）"
  else
    local lock_bad="" jg lg gname
    # Gemfile 侧：gem "name" 声明的裸名（group 块/平台条件均计入——lock DEPENDENCIES 同样全量登记）
    jg=$(grep -oE '^[[:space:]]*gem[[:space:]]+["'"'"'][A-Za-z0-9_.-]+' "$gf" 2>/dev/null \
        | grep -oE '[A-Za-z0-9_.-]+$' || true)
    # lock 侧：DEPENDENCIES 段的裸名（段头/下一段头之间，缩进行首词）
    lg=$(awk '
      /^DEPENDENCIES[[:space:]]*$/ { indep=1; next }
      indep && /^[^[:space:]]/ { indep=0 }
      indep && /^[[:space:]]+[A-Za-z0-9_.-]+/ { print $1 }
    ' "$gl" 2>/dev/null || true)
    while IFS= read -r gname; do
      [[ -z "$gname" ]] && continue
      printf '%s\n' "$lg" | grep -qxF "$gname" || lock_bad="${lock_bad}Gemfile 声明的 ${gname} 不在 Gemfile.lock DEPENDENCIES（Gemfile 变更后 lock 未更新）
"
    done <<< "$jg"
    # 时间判：Gemfile 修改时间显著新于 lock → 变更未同步（5 秒容忍 checkout 先后差）
    local gt lt
    gt=$(stat -c %Y "$gf" 2>/dev/null || stat -f %m "$gf" 2>/dev/null || echo 0)
    lt=$(stat -c %Y "$gl" 2>/dev/null || stat -f %m "$gl" 2>/dev/null || echo 0)
    case "$gt" in ''|*[!0-9]*) gt=0 ;; esac
    case "$lt" in ''|*[!0-9]*) lt=0 ;; esac
    if [[ "$gt" -gt "$((lt + 5))" ]]; then
      lock_bad="${lock_bad}Gemfile 修改时间新于 Gemfile.lock（变更后未跑 bundle install/update 同步）
"
    fi
    _fw_report warn fw_ruby_gemfile_lock "$lock_bad" "Gemfile 与 Gemfile.lock 漂移（依赖树不可复现）" "Gemfile 与 Gemfile.lock 同步"
  fi

  # ====================================================================
  # fw_ruby_env_key_drift(warn)：ENV 引用键 ↔ .env 样例键 双源对齐
  # ====================================================================
  local samp_files=() sfs
  sfs=$(_fw_resolve_globs ${RUBY_ENV_SAMPLE_GLOBS[@]+"${RUBY_ENV_SAMPLE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && samp_files+=("$ln")
  done <<< "$sfs"
  if [[ ${#samp_files[@]} -eq 0 ]]; then
    pass "fw_ruby_env_key_drift: 无 .env 样例文件（RUBY_ENV_SAMPLE_GLOBS），跳过"
  else
    local samp="" used="" env_bad="" k
    samp=$(grep -hE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "${samp_files[@]}" 2>/dev/null \
           | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=.*//' | sort -u || true)
    for f in "${srcarr[@]}"; do
      used="${used}$(_fw_strip_comments_hash "$f" \
        | grep -oE 'ENV\[[[:space:]]*["'"'"'][A-Za-z_][A-Za-z0-9_]*|ENV\.fetch\([[:space:]]*["'"'"'][A-Za-z_][A-Za-z0-9_]*' \
        | grep -oE '[A-Za-z_][A-Za-z0-9_]*$' || true)
"
    done
    used=$(printf '%s\n' "$used" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$samp" | grep -qxF "$k" \
        || env_bad="${env_bad}ENV 引用键 ${k} 未登记于 .env 样例（按样例配置必缺键，ENV[] 返 nil 静默降级）
"
    done <<< "$used"
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$used" | grep -qxF "$k" \
        || env_bad="${env_bad}样例键 ${k} 无 ENV[]/ENV.fetch 引用（僵尸键/双源漂移）
"
    done <<< "$samp"
    _fw_report warn fw_ruby_env_key_drift "$env_bad" "ENV 引用键与 .env 样例双源漂移（样例是环境配置唯一契约）" "ENV 引用键与 .env 样例双向对齐"
  fi

  # ====================================================================
  # fw_ruby_view_var(warn)：模板 @ivar 使用 ↔ 渲染侧 @ivar= 赋值 双源对齐
  # ====================================================================
  if [[ ${#vwarr[@]} -eq 0 ]]; then
    pass "fw_ruby_view_var: 无视图模板（RUBY_VIEW_GLOBS），跳过"
  else
    local passed="" used_v="" vlocs="" view_bad="" j
    # 赋值侧：含渲染调用（render / erb : / erb (）的源文件里抽 @ivar = 赋值
    # （Rails 隐式渲染无 render 字样——action 内赋值不进本侧，走僵尸侧人工核；
    #   缺失侧以"全源文件 @ivar= 并集"兜底，防隐式渲染控制器漏配）
    local anyassign=""
    for f in "${srcarr[@]}"; do
      anyassign="${anyassign}$(_fw_strip_comments_hash "$f" \
        | grep -oE '@[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[^=]' \
        | grep -oE '@[A-Za-z_][A-Za-z0-9_]*' | sed 's/^@//' || true)
"
      if grep -qE 'render|erb[[:space:]]*[:(]' "$f" 2>/dev/null; then
        passed="${passed}$(_fw_strip_comments_hash "$f" \
          | grep -oE '@[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[^=]' \
          | grep -oE '@[A-Za-z_][A-Za-z0-9_]*' | sed 's/^@//' || true)
"
      fi
    done
    passed=$(printf '%s\n' "$passed" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    anyassign=$(printf '%s\n' "$anyassign" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    # 使用侧：模板 @ivar + 模板内就地赋值（<% @x = ... %>）豁免
    for f in ${vwarr[@]+"${vwarr[@]}"}; do
      used_v="${used_v}$(_fw_strip_comments_hash "$f" | grep -oE '@[A-Za-z_][A-Za-z0-9_]*' | sed 's/^@//' || true)
"
      vlocs="${vlocs}$(_fw_strip_comments_hash "$f" \
        | grep -oE '@[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[^=]' \
        | grep -oE '@[A-Za-z_][A-Za-z0-9_]*' | sed 's/^@//' || true)
"
    done
    used_v=$(printf '%s\n' "$used_v" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    vlocs=$(printf '%s\n' "$vlocs" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      # Rails/Sinatra 框架内部 ivar 豁免（@_ 前缀内部变量）
      case "$j" in _*) continue ;; esac
      printf '%s\n' "$vlocs" | grep -qxF "$j" && continue
      printf '%s\n' "$anyassign" | grep -qxF "$j" && continue
      view_bad="${view_bad}视图实例变量 @${j} 未见任何源文件赋值（渲染时 nil，NoMethodError on nil/空白输出）
"
    done <<< "$used_v"
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      printf '%s\n' "$used_v" | grep -qxF "$j" \
        || view_bad="${view_bad}渲染侧赋值 @${j} 无任何模板引用（僵尸传参，掩盖真实视图契约）
"
    done <<< "$passed"
    _fw_report warn fw_ruby_view_var "$view_bad" "erb 视图 @ivar 与渲染侧赋值双源漂移" "视图 @ivar 与渲染侧赋值双向对齐"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/ruby.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
