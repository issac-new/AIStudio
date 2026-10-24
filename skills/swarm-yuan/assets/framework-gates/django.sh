# ruleset: django  requires_conf: DJANGO_SRC_GLOBS
# gates: fw_django_nplusone(warn) fw_django_atomic(warn) fw_django_csrf(warn) fw_django_migration_irreversible(warn) fw_django_settings_split(warn) fw_django_secret_key(fail) fw_django_debug(fail) fw_django_allowed_hosts(warn) fw_django_password_hasher(warn) fw_django_raw_sql(fail) fw_django_middleware_order(warn) fw_django_static_root(warn) fw_django_session_cookie(warn) fw_django_migration_drift(warn)
# harvested-from: P4（2026-07-17），规律源自 Django 5.2 LTS / 6.0 官方文档（https://docs.djangoproject.com/）
_fw_django_check() {
  echo "  [django] Django 5.2 LTS / 6.x 框架规律"

  # ---------- 收集源文件清单（Python 源文件统一入 srcarr） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${DJANGO_SRC_GLOBS[@]+"${DJANGO_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "django: DJANGO_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分：迁移文件 / 设置文件 / 普通代码文件
  local migarr=() setarr=() codearr=()
  local f
  for f in "${srcarr[@]}"; do
    case "$f" in
      */migrations/*.py) migarr+=("$f") ;;
      */settings.py|*/settings/*.py) setarr+=("$f") ;;
      *.py) codearr+=("$f") ;;
    esac
  done

  # 代码正文过滤：调公共库 _fw_strip_comments_hash（Python 系，剔 # 注释）

  # ====================================================================
  # fw_django_nplusone(warn)：queryset 遍历须 select_related/prefetch_related
  # ====================================================================
  local np_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}"; do
    if grep -qE '\.objects\.(all|filter|get)\(' "$f" 2>/dev/null \
       && ! grep -qE 'select_related|prefetch_related' "$f" 2>/dev/null; then
      np_bad="${np_bad}${f}
"
    fi
  done
  _fw_report warn fw_django_nplusone "$np_bad" "检出 ORM 查询但无 select_related/prefetch_related（循环访问关联将 N+1）" "ORM 查询均带加载优化或无查询"

  # ====================================================================
  # fw_django_atomic(warn)：多写操作须 transaction.atomic
  # ====================================================================
  local at_bad="" cnt
  for f in "${codearr[@]+"${codearr[@]}"}"; do
    cnt=$(_fw_strip_comments_hash "$f" | grep -cE '\.(save|create|bulk_create|update|delete)\(' 2>/dev/null || true)
    cnt=${cnt:-0}
    if [[ "$cnt" -ge 2 ]] && ! grep -qE 'transaction\.atomic|with atomic\(' "$f" 2>/dev/null; then
      at_bad="${at_bad}${f}（写操作 ${cnt} 处）
"
    fi
  done
  _fw_report warn fw_django_atomic "$at_bad" "多写操作未包 transaction.atomic（中途失败留半态）" "多写操作均有事务边界或无多写"

  # ====================================================================
  # fw_django_csrf(warn)：CsrfViewMiddleware 缺失 / @csrf_exempt 滥用
  # ====================================================================
  local csrf_bad="" has_mw=0
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if grep -qE '^MIDDLEWARE[[:space:]]*=' "$f" 2>/dev/null; then
      has_mw=1
      if ! grep -qE 'CsrfViewMiddleware' "$f" 2>/dev/null; then
        csrf_bad="${csrf_bad}${f}: MIDDLEWARE 缺 CsrfViewMiddleware
"
      fi
    fi
  done
  local exempt_hit=""
  if [[ ${#codearr[@]} -gt 0 ]]; then
    exempt_hit=$(grep -rlE '@csrf_exempt' "${codearr[@]}" 2>/dev/null || true)
  fi
  [[ -n "$exempt_hit" ]] && csrf_bad="${csrf_bad}${exempt_hit}: 使用 @csrf_exempt（须确认跨域场景必要性）
"
  if [[ -n "$csrf_bad" ]]; then
    warn "fw_django_csrf: CSRF 防护缺失或被豁免（CWE-352）:
${csrf_bad}"
  else
    if [[ "$has_mw" -eq 1 ]]; then
      pass "fw_django_csrf: CsrfViewMiddleware 在位且无 csrf_exempt"
    else
      pass "fw_django_csrf: 无 MIDDLEWARE 定义，跳过"
    fi
  fi

  # ====================================================================
  # fw_django_migration_irreversible(warn)：RunPython/RunSQL 无反向操作
  # ====================================================================
  local mig_bad=""
  for f in "${migarr[@]+"${migarr[@]}"}"; do
    if grep -qE 'RunPython\(' "$f" 2>/dev/null \
       && ! grep -qE 'reverse_code|RunPython\.noop' "$f" 2>/dev/null; then
      mig_bad="${mig_bad}${f}: RunPython 无 reverse_code（迁移不可回滚）
"
    fi
    if grep -qE 'RunSQL\(' "$f" 2>/dev/null \
       && ! grep -qE 'reverse_sql|RunSQL\.noop' "$f" 2>/dev/null; then
      mig_bad="${mig_bad}${f}: RunSQL 无 reverse_sql（迁移不可回滚）
"
    fi
  done
  _fw_report warn fw_django_migration_irreversible "$mig_bad" "数据迁移不可回滚（生产回退将失败）" "数据迁移均有反向操作或无迁移"

  # ====================================================================
  # fw_django_settings_split(warn)：settings 多环境拆分
  # ====================================================================
  local single_settings=0 split_ok=0
  for f in "${srcarr[@]}"; do
    case "$f" in
      */settings.py) single_settings=1 ;;
      */settings/base.py) split_ok=1 ;;
    esac
  done
  if [[ "$split_ok" -eq 1 ]]; then
    pass "fw_django_settings_split: settings 包已拆分（base/dev/prod）"
  elif [[ "$single_settings" -eq 1 ]]; then
    warn "fw_django_settings_split: 单一 settings.py 未按环境拆分（建议 settings/base.py + dev.py + prod.py）"
  else
    pass "fw_django_settings_split: 未检出 settings，跳过"
  fi

  # ====================================================================
  # fw_django_secret_key(fail)：SECRET_KEY 禁止硬编码
  # ====================================================================
  local sk_bad=""
  for f in "${srcarr[@]}"; do
    # 测试夹具豁免（test_settings.py 硬编码 SECRET_KEY 是测试标配，对齐 fw_django_debug 豁免口径）
    case "$f" in *test*.py|*/tests/*|*/test/*) continue ;; esac
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE 'SECRET_KEY[[:space:]]*=[[:space:]]*["'"'"']' 2>/dev/null \
       | grep -vE 'os\.environ|getenv|env\(|config\(' || true)
    [[ -n "$ln" ]] && sk_bad="${sk_bad}${f}:${ln}
"
  done
  _fw_report fail fw_django_secret_key "$sk_bad" "SECRET_KEY 硬编码（泄露即可伪造会话/签名，CWE-798）" "SECRET_KEY 经环境变量注入"

  # ====================================================================
  # fw_django_debug(fail)：生产配置禁 DEBUG=True（dev/local/test 设置例外）
  # ====================================================================
  local dbg_bad=""
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    case "$(basename "$f")" in
      *dev*.py|*local*.py|*test*.py) continue ;;
    esac
    if _fw_strip_comments_hash "$f" | grep -qE '^DEBUG[[:space:]]*=[[:space:]]*\(?[[:space:]]*True'; then
      dbg_bad="${dbg_bad}${f}: DEBUG = True 硬编码
"
    fi
  done
  _fw_report fail fw_django_debug "$dbg_bad" "生产设置 DEBUG=True（堆栈/配置泄露 + 静态文件不安全，CWE-489）" "生产设置无 DEBUG=True 硬编码"

  # ====================================================================
  # fw_django_allowed_hosts(warn)：ALLOWED_HOSTS 空或 ['*']
  # ====================================================================
  local ah_bad=""
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if grep -qE 'ALLOWED_HOSTS[[:space:]]*=[[:space:]]*\[[[:space:]]*\]' "$f" 2>/dev/null \
       || grep -qE "ALLOWED_HOSTS[[:space:]]*=[[:space:]]*\[[[:space:]]*['\"]\*['\"]" "$f" 2>/dev/null; then
      ah_bad="${ah_bad}${f}
"
    fi
  done
  _fw_report warn fw_django_allowed_hosts "$ah_bad" "ALLOWED_HOSTS 为空或 ['*']（Host 头攻击风险）" "ALLOWED_HOSTS 收敛或未硬编码"

  # ====================================================================
  # fw_django_password_hasher(warn)：禁用弱哈希（MD5/SHA1/Unsalted）
  # ====================================================================
  local ph_bad=""
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if grep -qE 'PASSWORD_HASHERS' "$f" 2>/dev/null \
       && grep -qE 'MD5PasswordHasher|SHA1PasswordHasher|UnsaltedMD5|UnsaltedSHA1' "$f" 2>/dev/null; then
      ph_bad="${ph_bad}${f}: PASSWORD_HASHERS 含弱哈希（MD5/SHA1）
"
    fi
  done
  _fw_report warn fw_django_password_hasher "$ph_bad" "弱密码哈希算法（须 PBKDF2/Argon2/bcrypt，CWE-327）" "无弱哈希配置"

  # ====================================================================
  # fw_django_raw_sql(fail)：raw/cursor.execute 禁止字符串拼接 SQL
  # ====================================================================
  local raw_bad=""
  for f in "${codearr[@]+"${codearr[@]}"}"; do
    local ln
    ln=$(_fw_strip_comments_hash "$f" | grep -nE '(execute|raw)\(f["'"'"']|execute\([^)]*%[[:space:]]|execute\([^)]*\+[[:space:]]*[a-zA-Z_]' 2>/dev/null || true)
    [[ -n "$ln" ]] && raw_bad="${raw_bad}${f}:${ln}
"
  done
  _fw_report fail fw_django_raw_sql "$raw_bad" "原生 SQL 字符串拼接（SQL 注入，CWE-89；须参数化 %s 占位）" "无拼接式原生 SQL"

  # ====================================================================
  # fw_django_middleware_order(warn)：SecurityMiddleware 须在 MIDDLEWARE 首位
  # ====================================================================
  local mo_bad=""
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if ! grep -qE '^MIDDLEWARE[[:space:]]*=' "$f" 2>/dev/null; then
      continue
    fi
    # 取 MIDDLEWARE 列表首个中间件条目
    local first_mw
    first_mw=$(awk '/^MIDDLEWARE[[:space:]]*=/ { inlist=1; next }
      inlist && /django\.middleware|django\.contrib/ { print; exit }
      inlist && /^]/ { exit }' "$f" 2>/dev/null | tr -d "[:space:]'\",")
    if [[ -n "$first_mw" ]] && ! printf '%s' "$first_mw" | grep -qE 'SecurityMiddleware'; then
      mo_bad="${mo_bad}${f}: 首位中间件为 ${first_mw}（SecurityMiddleware 须首位）
"
    fi
  done
  _fw_report warn fw_django_middleware_order "$mo_bad" "SecurityMiddleware 未在首位（安全头须最先施加）" "中间件顺序合理或无 MIDDLEWARE"

  # ====================================================================
  # fw_django_static_root(warn)：生产须配 STATIC_ROOT + collectstatic
  # ====================================================================
  local st_hit=0
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if grep -qE '^STATIC_ROOT[[:space:]]*=' "$f" 2>/dev/null; then
      st_hit=1
      break
    fi
  done
  if [[ ${#setarr[@]} -eq 0 ]]; then
    pass "fw_django_static_root: 无 settings，跳过"
  elif [[ "$st_hit" -eq 1 ]]; then
    pass "fw_django_static_root: STATIC_ROOT 已配置"
  else
    warn "fw_django_static_root: settings 无 STATIC_ROOT（生产 collectstatic 无法汇聚静态文件）"
  fi

  # ====================================================================
  # fw_django_session_cookie(warn)：SESSION_COOKIE_SECURE / CSRF_COOKIE_SECURE
  # ====================================================================
  local sc_hit=0
  for f in "${setarr[@]+"${setarr[@]}"}"; do
    if grep -qE 'SESSION_COOKIE_SECURE|CSRF_COOKIE_SECURE' "$f" 2>/dev/null; then
      sc_hit=1
      break
    fi
  done
  if [[ ${#setarr[@]} -eq 0 ]]; then
    pass "fw_django_session_cookie: 无 settings，跳过"
  elif [[ "$sc_hit" -eq 1 ]]; then
    pass "fw_django_session_cookie: 安全 Cookie 已配置"
  else
    warn "fw_django_session_cookie: 未设 SESSION_COOKIE_SECURE/CSRF_COOKIE_SECURE（HTTPS 下 Cookie 明文传输风险）"
  fi

  # ====================================================================
  # fw_django_migration_drift(warn)：模型↔迁移漂移（漏改字段的姊妹缺陷）
  # models.py 含 models.Model 子类但全仓无迁移文件 = 漏 makemigrations 信号（表结构与
  # 代码漂移，运行期才 OperationalError）。有迁移的项目提示跑 --check 复核增量漂移。
  # ====================================================================
  local model_cnt=0
  model_cnt=$(grep -rlE 'class[[:space:]]+[A-Za-z_]+\(.*models\.Model\)' "${codearr[@]+"${codearr[@]}"}" 2>/dev/null | grep -c . || true)
  if [[ "${model_cnt:-0}" -eq 0 ]]; then
    pass "fw_django_migration_drift: 无 Django Model，跳过"
  elif [[ ${#migarr[@]} -eq 0 ]]; then
    warn "fw_django_migration_drift: 检出 ${model_cnt} 个 Model 文件但 0 迁移文件（漏 makemigrations：表结构与代码漂移，运行期 OperationalError；跑 python manage.py makemigrations --check 验证）"
  else
    # 增量漂移真判——实跑 makemigrations --check --dry-run（不产文件）。
    # manage.py 形态可实跑；可复用 app 形态（无 manage.py）依赖 DJANGO_SETTINGS_MODULE，
    # 不实跑仅诚实提示（fail-open，同框架门禁降级口径）。
    local _mig_root="${PROJECT_DIR:-.}" _mig_out=""
    if [[ -f "$_mig_root/manage.py" ]] && command -v python3 >/dev/null 2>&1; then
      _mig_out=$(cd "$_mig_root" && python3 manage.py makemigrations --check --dry-run 2>&1)
      local _mig_rc=$?
      if [[ $_mig_rc -eq 0 ]]; then
        pass "fw_django_migration_drift: ${model_cnt} Model / ${#migarr[@]} 迁移，makemigrations --check 实跑无增量漂移"
      elif [[ $_mig_rc -eq 1 ]]; then
        warn "fw_django_migration_drift: makemigrations --check 实跑报模型↔迁移增量漂移（模型改了没跑迁移——先跑 makemigrations 再提交）：$(printf '%s' "$_mig_out" | tail -2 | tr '\n' ' ')"
      else
        warn "fw_django_migration_drift: makemigrations --check 未能实跑（rc=$_mig_rc，环境/设置不可用）——${model_cnt} Model / ${#migarr[@]} 迁移计数通过，增量判别未覆盖"
      fi
    else
      pass "fw_django_migration_drift: ${model_cnt} Model 文件配 ${#migarr[@]} 迁移文件（无可实跑 manage.py——可复用 app 形态，增量判别未覆盖：改模型后手工跑 makemigrations --check）"
    fi
  fi

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
