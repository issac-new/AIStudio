# ruleset: android  requires_conf: ANDROID_GLOBS
# gates: fw_android_webview_js_enabled(fail) fw_android_sharedprefs_secret(fail) fw_android_log_debug(warn) fw_android_cleartext_traffic(fail) fw_android_proguard(warn) fw_android_network_security_config(warn) fw_android_permissions(warn) fw_android_findviewbyid(warn) fw_android_room_sqlite(warn) fw_android_leakcanary(warn)
# harvested-from: （2026-07-23），规律源自 Android Security Guidelines + OWASP MASVS
_fw_android_check() {
  echo "  [android] Android 原生（Kotlin/Java）框架规律"
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${ANDROID_GLOBS[@]+"${ANDROID_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do [[ -n "$ln" ]] && srcarr+=("$ln"); done <<< "$srcs"
  [[ ${#srcarr[@]} -eq 0 ]] && { warn "android: ANDROID_GLOBS 未配置或无文件可检"; return; }

  # fw_android_webview_js_enabled(fail)：WebView 启用 JS 无 URL 审计
  local bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE 'javaScriptEnabled\s*=\s*true|setJavaScriptEnabled\(true\)' && echo "$code" | grep -qE 'loadUrl\(' && ! echo "$code" | grep -qE 'shouldOverrideUrlLoading'; then
      bad="${bad}${f}: WebView 启用 JS 但无 shouldOverrideUrlLoading 审计\n"
    fi
  done
  _fw_report fail fw_android_webview_js_enabled "$bad" "WebView 启用 JS 无 URL 审计（CWE-79 XSS 风险）" "未检出 WebView JS 启用无审计"

  # fw_android_sharedprefs_secret(fail)：SharedPreferences 存敏感数据
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    local hits
    hits=$(echo "$code" | grep -iE 'SharedPreferences.*put.*\(.*(token|password|secret|apikey|api_key|credential)' 2>/dev/null || true)
    if [[ -n "$hits" ]] && ! echo "$code" | grep -qE 'EncryptedSharedPreferences'; then
      bad="${bad}${f}: SharedPreferences 存敏感数据（无 EncryptedSharedPreferences）\n"
    fi
  done
  _fw_report fail fw_android_sharedprefs_secret "$bad" "SharedPreferences 存敏感数据（CWE-312 明文存储）" "未检出 SharedPreferences 敏感存储"

  # fw_android_log_debug(warn)：Log.d/Log.v 生产代码
  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE 'Log\.(d|v)\(' || true)
    [[ -n "$hits" ]] && bad="${bad}${f}:\n${hits}\n"
  done
  _fw_report warn fw_android_log_debug "$bad" "检出 Log.d/Log.v 生产代码（CWE-209 信息泄露）" "未检出 Log.d/Log.v"

  # fw_android_cleartext_traffic(fail)：明文 HTTP 传输
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE 'loadUrl\("http://|URL\("http://'; then
      bad="${bad}${f}: 明文 HTTP 传输\n"
    fi
    if echo "$f" | grep -qE '\.xml$' && grep -qE 'usesCleartextTraffic="true"' "$f" 2>/dev/null; then
      bad="${bad}${f}: usesCleartextTraffic=true\n"
    fi
  done
  _fw_report fail fw_android_cleartext_traffic "$bad" "明文 HTTP 传输（CWE-319）" "未检出明文传输"

  # fw_android_proguard(warn)：ProGuard/R8 混淆
  bad=""
  for f in "${srcarr[@]}"; do
    if echo "$f" | grep -qE '\.gradle(\.kts)?$' && grep -qE 'buildTypes|release' "$f" 2>/dev/null; then
      if ! grep -qE 'minifyEnabled\s+true|isMinifyEnabled\s*=\s*true' "$f" 2>/dev/null; then
        bad="${bad}${f}: release 未启用 minifyEnabled\n"
      fi
    fi
  done
  _fw_report warn fw_android_proguard "$bad" "release 未启用 ProGuard/R8 混淆" "ProGuard/R8 配置齐备或无 gradle 文件"

  # fw_android_network_security_config(warn)
  local manifest_found=0 nsc_found=0
  for f in "${srcarr[@]}"; do
    if echo "$f" | grep -qE 'AndroidManifest\.xml$'; then
      manifest_found=1
      grep -qE 'networkSecurityConfig' "$f" 2>/dev/null && nsc_found=1
    fi
  done
  if [[ $manifest_found -eq 1 && $nsc_found -eq 0 ]]; then
    warn "fw_android_network_security_config: AndroidManifest.xml 无 networkSecurityConfig 属性"
  else
    pass "fw_android_network_security_config: Network Security Config 配置齐备或无 manifest"
  fi

  # fw_android_permissions(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    if echo "$f" | grep -qE 'AndroidManifest\.xml$'; then
      local hits; hits=$(grep -E 'uses-permission.*\.(READ_CONTACTS|READ_SMS|ACCESS_FINE_LOCATION|RECORD_AUDIO|READ_EXTERNAL_STORAGE|CAMERA)' "$f" 2>/dev/null || true)
      [[ -n "$hits" ]] && bad="${bad}${f}: 危险权限 ${hits}\n"
    fi
  done
  _fw_report warn fw_android_permissions "$bad" "检出危险权限（建议最小化审查）" "权限配置合理或无 manifest"

  # fw_android_findviewbyid(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local hits; hits=$(_fw_strip_comments_c "$f" 2>/dev/null | grep -nE 'findViewById' || true)
    if [[ -n "$hits" ]] && ! echo "$hits" | grep -qE 'ViewBinding|DataBinding|findViewById.*ViewBinding'; then
      bad="${bad}${f}: findViewById 使用（建议 ViewBinding）\n"
    fi
  done
  _fw_report warn fw_android_findviewbyid "$bad" "检出 findViewById（建议 ViewBinding/DataBinding）" "未检出 findViewById"

  # fw_android_room_sqlite(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    local code; code=$(_fw_strip_comments_c "$f" 2>/dev/null || true)
    if echo "$code" | grep -qE 'SQLiteOpenHelper|SQLiteDatabase|rawQuery|execSQL' && ! echo "$code" | grep -qE 'Room|@Dao|@Entity'; then
      bad="${bad}${f}: 裸 SQLite API（建议 Room）\n"
    fi
  done
  _fw_report warn fw_android_room_sqlite "$bad" "检出裸 SQLite API（建议 Room）" "未检出裸 SQLite"

  # fw_android_leakcanary(warn)
  bad=""
  for f in "${srcarr[@]}"; do
    if echo "$f" | grep -qE '\.gradle(\.kts)?$' && grep -qE 'com\.android\.application|applicationId' "$f" 2>/dev/null; then
      if ! grep -qE 'leakcanary' "$f" 2>/dev/null; then
        bad="${bad}${f}: 无 LeakCanary 依赖\n"
      fi
    fi
  done
  _fw_report warn fw_android_leakcanary "$bad" "无 LeakCanary 内存泄漏检测" "LeakCanary 配置齐备或无 gradle"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
