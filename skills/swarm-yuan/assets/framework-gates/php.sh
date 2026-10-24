# ruleset: php  requires_conf: PHP_SRC_GLOBS PHP_ENV_SAMPLE_GLOBS PHP_VIEW_GLOBS PHP_ROUTE_GLOBS
# gates: fw_php_hardcoded_secret(fail) fw_php_composer_lock(warn) fw_php_env_key_drift(warn) fw_php_route_name(warn) fw_php_view_var(warn)
# harvested-from: 换栈演练补缺（2026-09-25），规律源自 php.net 手册与 Composer 2 文档口径（未逐条核实点见 references/frameworks/php.md §6 待验证标注）
_fw_php_check() {
  echo "  [php] PHP 8.x + Composer 2.x 框架规律"

  # ---------- 收集源文件清单 ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${PHP_SRC_GLOBS[@]+"${PHP_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "php: PHP_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # ---------- 视图模板 / 路由定义清单（可空：对应门禁跳过）----------
  local views varr=()
  views=$(_fw_resolve_globs ${PHP_VIEW_GLOBS[@]+"${PHP_VIEW_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && varr+=("$ln")
  done <<< "$views"

  local rts rtarr=()
  rts=$(_fw_resolve_globs ${PHP_ROUTE_GLOBS[@]+"${PHP_ROUTE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && rtarr+=("$ln")
  done <<< "$rts"

  # 代码正文过滤：调公共库 _fw_strip_comments_c_inline（C 系，剔 // 与 /* */；
  # PHP 的 # 注释罕见，容忍不剔——误报面为注释里写密钥样例，人工核验可辨）

  # ====================================================================
  # fw_php_hardcoded_secret(fail)：密钥/口令禁止硬编码进源码
  # ====================================================================
  local sec_bad="" f ln
  for f in "${srcarr[@]}"; do
    ln=$(_fw_strip_comments_c_inline "$f" \
       | grep -niE "(password|passwd|secret|api[_-]?key|app[_-]?key|private[_-]?key|auth[_-]?token|client[_-]?secret)" \
       | grep -E "(=>|[A-Za-z0-9_][[:space:]]*=)[[:space:]]*[\"'][^\"']{4,}[\"']" \
       | grep -viE "env\(|getenv\(|\\\$_ENV|\\\$_SERVER|config\(|example|placeholder|changeme|change[_-]?me|your[_-]|\*{3,}" || true)
    [[ -n "$ln" ]] && sec_bad="${sec_bad}${f}:${ln}
"
  done
  _fw_report fail fw_php_hardcoded_secret "$sec_bad" "PHP 源码硬编码密钥/口令字面量（入库即泄露，CWE-798）" "无硬编码密钥/口令字面量"

  # ====================================================================
  # fw_php_composer_lock(warn)：composer.json 变更后 lock 须同步（内容 + 时间双判）
  # ====================================================================
  local cj="${PROJECT_DIR:-.}/composer.json" cl="${PROJECT_DIR:-.}/composer.lock"
  if [[ ! -f "$cj" ]]; then
    pass "fw_php_composer_lock: 无 composer.json，跳过"
  elif ! grep -qE '"(require|require-dev)"[[:space:]]*:' "$cj" 2>/dev/null; then
    pass "fw_php_composer_lock: composer.json 无 require/require-dev 依赖声明，跳过"
  elif [[ ! -f "$cl" ]]; then
    warn "fw_php_composer_lock: composer.json 声明依赖但 composer.lock 缺失（依赖树不可复现，lock 须入库并与 json 同步变更）"
  else
    local lock_bad="" jp lp jname
    # json 侧：require/require-dev 段内的 vendor/package 键（平台包 php/ext-* 无斜杠天然排除）
    jp=$(awk '
      /"require(-dev)?"[[:space:]]*:/ { inreq=1; next }
      inreq && /^[[:space:]]*}/ { inreq=0 }
      inreq {
        if (match($0, /"[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*"/))
          print substr($0, RSTART+1, RLENGTH-2)
      }' "$cj" 2>/dev/null || true)
    # lock 侧：packages/packages-dev 的 name 字段
    lp=$(grep -oE '"name"[[:space:]]*:[[:space:]]*"[^"]+"' "$cl" 2>/dev/null | sed -E 's/.*"([^"]+)"[[:space:]]*$/\1/' || true)
    while IFS= read -r jname; do
      [[ -z "$jname" ]] && continue
      printf '%s\n' "$lp" | grep -qxF "$jname" || lock_bad="${lock_bad}composer.json require 的 ${jname} 不在 composer.lock（json 变更后 lock 未更新）
"
    done <<< "$jp"
    # 时间判：json 修改时间显著新于 lock → 变更未同步（5 秒容忍 checkout 先后差）
    local jt lt
    jt=$(stat -c %Y "$cj" 2>/dev/null || stat -f %m "$cj" 2>/dev/null || echo 0)
    lt=$(stat -c %Y "$cl" 2>/dev/null || stat -f %m "$cl" 2>/dev/null || echo 0)
    case "$jt" in ''|*[!0-9]*) jt=0 ;; esac
    case "$lt" in ''|*[!0-9]*) lt=0 ;; esac
    if [[ "$jt" -gt "$((lt + 5))" ]]; then
      lock_bad="${lock_bad}composer.json 修改时间新于 composer.lock（变更后未跑 composer update/install 同步）
"
    fi
    _fw_report warn fw_php_composer_lock "$lock_bad" "composer.json 与 composer.lock 漂移（依赖树不可复现）" "composer.json 与 composer.lock 同步"
  fi

  # ====================================================================
  # fw_php_env_key_drift(warn)：env() 键 ↔ .env 样例键 双源对齐
  # ====================================================================
  local samp_files=() sfs
  sfs=$(_fw_resolve_globs ${PHP_ENV_SAMPLE_GLOBS[@]+"${PHP_ENV_SAMPLE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && samp_files+=("$ln")
  done <<< "$sfs"
  if [[ ${#samp_files[@]} -eq 0 ]]; then
    pass "fw_php_env_key_drift: 无 .env 样例文件（PHP_ENV_SAMPLE_GLOBS），跳过"
  else
    local samp="" used="" env_bad="" k
    samp=$(grep -hE '^[[:space:]]*(export[[:space:]]+)?[A-Za-z_][A-Za-z0-9_]*=' "${samp_files[@]}" 2>/dev/null \
           | sed -E 's/^[[:space:]]*(export[[:space:]]+)?//; s/=.*//' | sort -u || true)
    for f in "${srcarr[@]}"; do
      used="${used}$(_fw_strip_comments_c_inline "$f" \
        | grep -oE '(env|getenv)[[:space:]]*\([[:space:]]*["'"'"'][A-Za-z_][A-Za-z0-9_]*|\$_ENV\[[[:space:]]*["'"'"'][A-Za-z_][A-Za-z0-9_]*' \
        | grep -oE '[A-Za-z_][A-Za-z0-9_]*$' || true)
"
    done
    used=$(printf '%s\n' "$used" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$samp" | grep -qxF "$k" \
        || env_bad="${env_bad}env() 引用键 ${k} 未登记于 .env 样例（按样例配置必缺键）
"
    done <<< "$used"
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$used" | grep -qxF "$k" \
        || env_bad="${env_bad}样例键 ${k} 无 env()/getenv() 引用（僵尸键/双源漂移）
"
    done <<< "$samp"
    _fw_report warn fw_php_env_key_drift "$env_bad" "env() 键与 .env 样例双源漂移（样例是环境配置唯一契约）" "env() 键与 .env 样例双向对齐"
  fi

  # ====================================================================
  # fw_php_route_name(warn)：路由 name 定义 ↔ route()/to_route() 引用 双源对齐
  # ====================================================================
  if [[ ${#rtarr[@]} -eq 0 ]]; then
    pass "fw_php_route_name: 无路由定义文件（PHP_ROUTE_GLOBS），跳过"
  else
    local defs="" uses="" route_bad=""
    # 定义侧：->name('x') / 'as' => 'x' / #[Route(name: 'x')]
    for f in ${rtarr[@]+"${rtarr[@]}"}; do
      defs="${defs}$(_fw_strip_comments_c_inline "$f" \
        | grep -oE '[-]>name\([[:space:]]*["'"'"'][A-Za-z0-9_.-]+|["'"'"']as["'"'"'][[:space:]]*=>[[:space:]]*["'"'"'][A-Za-z0-9_.-]+|name:[[:space:]]*["'"'"'][A-Za-z0-9_.-]+' \
        | grep -oE '[A-Za-z0-9_.-]+$' || true)
"
    done
    defs=$(printf '%s\n' "$defs" | grep -E '^[A-Za-z0-9_.-]+$' | sort -u || true)
    # 引用侧：route('x') / to_route('x') / redirect()->route('x')（to_route 内嵌 route( 天然覆盖）
    for f in "${srcarr[@]}"; do
      uses="${uses}$(_fw_strip_comments_c_inline "$f" \
        | grep -oE '[Rr]oute[[:space:]]*\([[:space:]]*["'"'"'][A-Za-z0-9_.-]+' \
        | grep -oE '[A-Za-z0-9_.-]+$' || true)
"
    done
    for f in ${varr[@]+"${varr[@]}"}; do
      uses="${uses}$(_fw_strip_comments_c_inline "$f" \
        | grep -oE '[Rr]oute[[:space:]]*\([[:space:]]*["'"'"'][A-Za-z0-9_.-]+' \
        | grep -oE '[A-Za-z0-9_.-]+$' || true)
"
    done
    uses=$(printf '%s\n' "$uses" | grep -E '^[A-Za-z0-9_.-]+$' | sort -u || true)
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$defs" | grep -qxF "$k" \
        || route_bad="${route_bad}route()/to_route() 引用路由名 ${k} 未在路由定义中出现（运行期抛 InvalidArgumentException）
"
    done <<< "$uses"
    while IFS= read -r k; do
      [[ -z "$k" ]] && continue
      printf '%s\n' "$uses" | grep -qxF "$k" \
        || route_bad="${route_bad}路由名 ${k} 已定义但无 route() 引用（僵尸 name；如经前端 Ziggy/JS 引用可豁免）
"
    done <<< "$defs"
    _fw_report warn fw_php_route_name "$route_bad" "路由 name 字符串双源漂移" "路由 name 定义与引用双向对齐"
  fi

  # ====================================================================
  # fw_php_view_var(warn)：模板 $var ↔ 控制器传参 双源对齐
  # ====================================================================
  if [[ ${#varr[@]} -eq 0 ]]; then
    pass "fw_php_view_var: 无视图模板（PHP_VIEW_GLOBS），跳过"
  else
    local passed="" pv pc pw used_v="" locs="" view_bad="" j
    # 传参侧：含 view(/compact(/->with( 的源文件里抽 'key' => / compact('key') / ->with('key'
    for f in "${srcarr[@]}"; do
      if grep -qE 'view\(|compact\(|[-]>with\(' "$f" 2>/dev/null; then
        pv=$(_fw_strip_comments_c_inline "$f" \
          | grep -oE '["'"'"'][A-Za-z_][A-Za-z0-9_]*["'"'"'][[:space:]]*=>' \
          | sed -E 's/["'"'"']//g; s/[[:space:]]*=>//' || true)
        pc=$(_fw_strip_comments_c_inline "$f" \
          | grep -oE 'compact\([^)]*\)' | grep -oE '["'"'"'][A-Za-z_][A-Za-z0-9_]*["'"'"']' \
          | sed -E 's/["'"'"']//g' || true)
        pw=$(_fw_strip_comments_c_inline "$f" \
          | grep -oE '[-]>with\([[:space:]]*["'"'"'][A-Za-z_][A-Za-z0-9_]*' \
          | grep -oE '[A-Za-z_][A-Za-z0-9_]*$' || true)
        passed="${passed}${pv}
${pc}
${pw}
"
      fi
    done
    passed=$(printf '%s\n' "$passed" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    # 使用侧：模板 $var + 局部绑定（as $x / $x = 赋值）豁免
    for f in ${varr[@]+"${varr[@]}"}; do
      used_v="${used_v}$(_fw_strip_comments_c_inline "$f" | grep -oE '\$[A-Za-z_][A-Za-z0-9_]*' | sed 's/^\$//' || true)
"
      locs="${locs}$(_fw_strip_comments_c_inline "$f" \
        | grep -oE '\bas[[:space:]]+\$[A-Za-z_][A-Za-z0-9_]*|\$[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[^=]' \
        | sed -E 's/.*\$//; s/[[:space:]]*=.*//' || true)
"
    done
    used_v=$(printf '%s\n' "$used_v" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    locs=$(printf '%s\n' "$locs" | grep -E '^[A-Za-z_][A-Za-z0-9_]*$' | sort -u || true)
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      # Blade/框架内置视图变量豁免（$loop/$errors/$slot 等）
      case " loop errors slot message exception this __env app auth request session csrf_token cookie view " in
        *" ${j} "*) continue ;;
      esac
      printf '%s\n' "$locs" | grep -qxF "$j" && continue
      printf '%s\n' "$passed" | grep -qxF "$j" \
        || view_bad="${view_bad}模板变量 ${j} 未见控制器传参（未定义变量输出 Notice/空白）
"
    done <<< "$used_v"
    while IFS= read -r j; do
      [[ -z "$j" ]] && continue
      printf '%s\n' "$used_v" | grep -qxF "$j" \
        || view_bad="${view_bad}传参 ${j} 无模板引用（僵尸视图参数）
"
    done <<< "$passed"
    _fw_report warn fw_php_view_var "$view_bad" "视图变量与控制器传参双源漂移" "视图变量与控制器传参双向对齐"
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/php.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
