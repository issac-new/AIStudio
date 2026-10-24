# ruleset: dotnet  requires_conf: DOTNET_GLOBS
# gates: fw_dotnet_sql_injection(fail) fw_dotnet_password_hash(fail) fw_dotnet_cors(fail) fw_dotnet_https(warn) fw_dotnet_auth(warn) fw_dotnet_async(warn) fw_dotnet_di(warn) fw_dotnet_logging(warn) fw_dotnet_ef_migration(warn) fw_dotnet_nullable(warn)
# harvested-from: 语言生态补强（2026-07-23），规律源自 OWASP .NET 安全指南 + Microsoft Secure Coding Guidelines for .NET
_fw_dotnet_check() {
  echo "  [dotnet] .NET / C# 框架规律"
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${DOTNET_GLOBS[@]+"${DOTNET_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do [[ -n "$ln" ]] && srcarr+=("$ln"); done <<< "$srcs"
  [[ ${#srcarr[@]} -eq 0 ]] && { warn "dotnet: DOTNET_GLOBS 未配置或无文件可检"; return; }

  # fw_dotnet_sql_injection(fail)
  local bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    local hits; hits=$(echo "$code" | grep -nE 'ExecuteSqlRaw.*\$"|\$".*SELECT|\$".*INSERT|\$".*WHERE|CommandText.*\$"|CommandText.*\+' 2>/dev/null || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report fail fw_dotnet_sql_injection "$bad" "SQL 拼接注入风险（CWE-89）" "未检出 SQL 拼接"

  # fw_dotnet_password_hash(fail)
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -iE 'password\s*=\s*[^"]|^.*(password|Password)\s*=\s*[a-zA-Z_]' 2>/dev/null | grep -q . && ! echo "$code" | grep -qiE 'Hash|BCrypt|PBKDF2|Argon2'; then
      bad="${bad}${f}: 密码明文赋值无哈希\n"
    fi
  done
  _fw_report fail fw_dotnet_password_hash "$bad" "密码明文存储（CWE-916）" "未检出密码明文存储"

  # fw_dotnet_cors(fail)
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE 'AllowAnyOrigin' && echo "$code" | grep -qE 'AllowCredentials'; then
      bad="${bad}${f}: AllowAnyOrigin + AllowCredentials（CWE-942）\n"
    fi
  done
  _fw_report fail fw_dotnet_cors "$bad" "CORS AllowAnyOrigin+AllowCredentials（CWE-942）" "CORS 配置正确"

  # fw_dotnet_https(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE 'Configure\b|WebHost' && ! echo "$code" | grep -qE 'UseHttpsRedirection'; then
      bad="${bad}${f}: 无 UseHttpsRedirection\n"
    fi
  done
  _fw_report warn fw_dotnet_https "$bad" "无 HTTPS 重定向（CWE-319）" "HTTPS 配置正确"

  # fw_dotnet_async(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE '\.Result\b|\.Wait\(\)' || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report warn fw_dotnet_async "$bad" ".Result/.Wait() 死锁风险（CWE-833）" "async/await 使用正确"

  # fw_dotnet_di(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE 'new\s+HttpClient\s*\(\)|new\s+DbContext\s*\(' || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report warn fw_dotnet_di "$bad" "直接 new 服务实例（建议 DI 注入）" "DI 使用正确"

  # fw_dotnet_logging(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE 'Console\.(WriteLine|Write)\(' || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report warn fw_dotnet_logging "$bad" "Console.WriteLine 生产代码（CWE-209）" "未检出 Console.WriteLine"

  # fw_dotnet_nullable(warn)
  # 原循环内 `.cs$` continue 守卫
  # 在 csproj 检查之前——.csproj 文件根本进不了循环体，`<Nullable>enable</Nullable>`（SDK
  # 现代项目的主流启用方式）是死代码，门禁对标准启用的项目恒误报。修：csproj 走独立 find
  # 兜底（全工程，排除 bin/obj；不依赖 DOTNET_GLOBS 是否收录 .csproj——扫描面与 cargo
  # deny.toml 兜底同哲学），.cs 文件保留 #nullable enable 指令路径。
  # R102 兜底改双通道（原 `find .` cwd 相对两坑：precheck cd PROJECT_DIR 后 fixture 语料
  # 越界命中他语料 csproj；软链部署 find 不下钻符号链接致兜底失明误报）：通道一自源目录
  # 上溯至 PROJECT_DIR 查 *.csproj（覆盖 csproj 在 .cs 祖先目录的标准布局）；通道二源目录
  # 子树 find（排除口径同上）。语义收紧到「与扫描源同工程」，越界与失明同时消除。
  bad=""
  local has_nullable=0
  for f in "${srcarr[@]}"; do
    echo "$f" | grep -qE '\.cs$' || continue
    _fw_strip_comments_c "$f" 2>/dev/null | grep -qE '#nullable enable' && has_nullable=1
  done
  if [[ $has_nullable -eq 0 ]]; then
    local _d _up _lv _csproj
    for f in "${srcarr[@]}"; do
      [[ $has_nullable -eq 1 ]] && break
      echo "$f" | grep -qE '\.cs$' || continue
      _d=$(dirname "$f")
      # 通道一：源目录逐级上溯至 PROJECT_DIR（含）查 *.csproj（层级上限 20 防环）
      _up="$_d"; _lv=0
      while [[ -n "$_up" && "$_up" != "/" && $_lv -lt 20 ]]; do
        for _csproj in "$_up"/*.csproj; do
          [[ -f "$_csproj" ]] && grep -qE '<Nullable>enable</Nullable>' "$_csproj" 2>/dev/null && { has_nullable=1; break; }
        done
        [[ $has_nullable -eq 1 ]] && break
        [[ -n "${PROJECT_DIR:-}" && "$_up" == "${PROJECT_DIR%/}" ]] && break
        _up=$(dirname "$_up"); _lv=$((_lv+1))
      done
      [[ $has_nullable -eq 1 ]] && break
      # 通道二：源目录子树 find *.csproj（排除 bin/obj 等构建产物，口径同上）
      while IFS= read -r _csproj; do
        [[ -n "$_csproj" ]] && grep -qE '<Nullable>enable</Nullable>' "$_csproj" 2>/dev/null && { has_nullable=1; break; }
      done <<< "$(find "$_d" -name '*.csproj' -not -path '*/bin/*' -not -path '*/obj/*' -not -path '*/.git/*' -not -path '*/node_modules/*' 2>/dev/null)"
    done
  fi
  [[ $has_nullable -eq 0 ]] && warn "fw_dotnet_nullable: 未启用 nullable 引用类型（CWE-476）" || pass "fw_dotnet_nullable: nullable 引用类型已启用"

  # fw_dotnet_auth(warn) + fw_dotnet_ef_migration(warn) - simplified
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE '\[Http(Get|Post|Put|Delete)' && ! echo "$code" | grep -qE '\[Authorize\]'; then
      bad="${bad}${f}: 端点无 [Authorize]\n"
    fi
  done
  _fw_report warn fw_dotnet_auth "$bad" "端点无 [Authorize]（CWE-306）" "身份验证配置正确"

  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE 'ExecuteSqlRaw.*CREATE\s+TABLE' || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report warn fw_dotnet_ef_migration "$bad" "裸 SQL 迁移（建议 EF Core Migrations）" "EF Core 迁移使用正确"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
