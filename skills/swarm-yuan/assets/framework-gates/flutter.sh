# ruleset: flutter  requires_conf: FLUTTER_GLOBS
# gates: fw_flutter_webview_unrestricted(fail) fw_flutter_sharedprefs_secret(fail) fw_flutter_print(warn) fw_flutter_const_ctor(warn) fw_flutter_proguard(warn) fw_flutter_safe_area(warn) fw_flutter_listview_builder(warn) fw_flutter_setstate_sprawl(warn) fw_flutter_sliver(warn) fw_flutter_lints(warn)
# harvested-from: 移动端补盲（2026-07-23），规律源自 Flutter/Dart 官方文档 / webview_flutter·shared_preferences·flutter_secure_storage README / flutter_lints 官方仓库 / OWASP MASVS
_fw_flutter_check() {
  echo "  [flutter] Flutter 3.x / Dart 3 移动端规律"

  # ---------- 收集文件清单（Dart 源码 + 构建/依赖配置统一入 srcarr 后拆分） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${FLUTTER_GLOBS[@]+"${FLUTTER_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "flutter: FLUTTER_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 Dart 源码 vs 构建/依赖/分析配置
  local dartarr=() gradlearr=() pubarr=() anaarr=()
  local f t ln body
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.dart) dartarr+=("$f") ;;
      *.gradle|*.gradle.kts) gradlearr+=("$f") ;;
      pubspec.yaml) pubarr+=("$f") ;;
      analysis_options.yaml) anaarr+=("$f") ;;
    esac
  done

  # Dart 注释剥离：调公共库 _fw_strip_comments_js_head（Dart 同为 // 行注释 + /* */ 块注释；
  # 剥行首 // 与块注释行，保留行内 // 防误伤 URL 中的 https://）

  # ====================================================================
  # fw_flutter_webview_unrestricted(fail)：WebView 远程 URL 须导航限制
  # ====================================================================
  # 口径：同文件命中 WebView(|WebViewWidget(|InAppWebView( 与 https?:// 且无
  #   navigationDelegate/shouldOverrideUrlLoading/onNavigationRequest → 违规
  local wv_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE 'WebView[[:space:]]*\(|WebViewWidget[[:space:]]*\(|InAppWebView[[:space:]]*\(' || continue
    printf '%s' "$body" | grep -qE 'https?://' || continue
    if ! printf '%s' "$body" | grep -qE 'navigationDelegate|shouldOverrideUrlLoading|onNavigationRequest'; then
      ln=$(printf '%s' "$body" | grep -nE 'WebView[[:space:]]*\(|WebViewWidget[[:space:]]*\(|InAppWebView[[:space:]]*\(' | head -1 || true)
      wv_bad="${wv_bad}${t}:${ln}
"
    fi
  done
  _fw_report fail fw_flutter_webview_unrestricted "${wv_bad}" "WebView 加载远程 URL 无导航限制（任意源可注入，CWE-79/CWE-749；须 navigationDelegate/shouldOverrideUrlLoading 源校验）" "WebView 均已配导航拦截或未用远程 WebView"

  # ====================================================================
  # fw_flutter_sharedprefs_secret(fail)：shared_preferences 禁存敏感 key
  # ====================================================================
  # 口径：setString/setInt/...( 调用点起 60 字符内含敏感 key 语义（大小写不敏感）
  local sp_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    ln=$(_fw_strip_comments_js_head "$t" | grep -inE '\.set(String|Int|Bool|Double|StringList)\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' || true)
    [[ -n "$ln" ]] && sp_bad="${sp_bad}${t}:${ln}
"
  done
  _fw_report fail fw_flutter_sharedprefs_secret "${sp_bad}" "shared_preferences 明文存敏感数据（iOS plist/Android XML 未加密，CWE-312；须 flutter_secure_storage）" "凭证均走 Keychain/Keystore 安全存储"

  # ====================================================================
  # fw_flutter_print(warn)：生产代码禁裸 print()（debugPrint 豁免）
  # ====================================================================
  local pr_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    ln=$(_fw_strip_comments_js_head "$t" | grep -nE '(^|[^a-zA-Z_.])print\(' || true)
    [[ -n "$ln" ]] && pr_bad="${pr_bad}${t}:${ln}
"
  done
  _fw_report warn fw_flutter_print "${pr_bad}" "裸 print() 残留（release 日志任意可读，CWE-209/CWE-532；须 debugPrint 或 kReleaseMode 守卫，flutter_lints avoid_print）" "无裸 print() 残留"

  # ====================================================================
  # fw_flutter_const_ctor(warn)：Widget build 文件须有 const 构造痕迹（启发式）
  # ====================================================================
  local cc_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE 'Widget[[:space:]]+build' || continue
    if ! printf '%s' "$body" | grep -qE 'const[[:space:]]'; then
      cc_bad="${cc_bad}${t}
"
    fi
  done
  _fw_report warn fw_flutter_const_ctor "${cc_bad}" "build 方法全文件无 const 构造（静态子树每次重建，掉帧/GC 压力；flutter_lints prefer_const_constructors）" "均有 const 构造痕迹或无 build 方法"

  # ====================================================================
  # fw_flutter_proguard(warn)：release 须 minifyEnabled true
  # ====================================================================
  local pg_bad=""
  for t in "${gradlearr[@]+"${gradlearr[@]}"}"; do
    grep -qE 'buildTypes|release' "$t" 2>/dev/null || continue
    if ! grep -qE 'minifyEnabled[[:space:]]+true' "$t" 2>/dev/null; then
      pg_bad="${pg_bad}${t}
"
    fi
  done
  _fw_report warn fw_flutter_proguard "${pg_bad}" "Android release 未启用 ProGuard/R8 混淆（Java/Kotlin 壳层与插件代码明文可还原，OWASP MASVS-RESILIENCE-2）" "release 均已 minifyEnabled true 或无 gradle 配置在扫描范围"

  # ====================================================================
  # fw_flutter_safe_area(warn)：须有 SafeArea 处理（工程级启发式）
  # ====================================================================
  local sa_hit=0
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    if _fw_strip_comments_js_head "$t" | grep -qE 'SafeArea'; then
      sa_hit=1; break
    fi
  done
  if [[ ${#dartarr[@]} -gt 0 && "$sa_hit" -eq 0 ]]; then
    warn "fw_flutter_safe_area: 工程无 SafeArea 痕迹（刘海/挖孔/手势区遮挡，iOS HIG 与 Android 15 edge-to-edge 要求）"
  else
    pass "fw_flutter_safe_area: 已接入 SafeArea 处理"
  fi

  # ====================================================================
  # fw_flutter_listview_builder(warn)：长列表须 ListView.builder 懒加载
  # ====================================================================
  local lv_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE 'ListView[[:space:]]*\(' || continue
    if ! printf '%s' "$body" | grep -qE 'ListView\.(builder|separated|custom)'; then
      ln=$(printf '%s' "$body" | grep -nE 'ListView[[:space:]]*\(' | head -1 || true)
      lv_bad="${lv_bad}${t}:${ln}
"
    fi
  done
  _fw_report warn fw_flutter_listview_builder "${lv_bad}" "ListView(children) 嫌疑承载长列表（一次性构建全部子项，首帧卡顿/内存暴涨；须 ListView.builder/separated，短静态列表可人工豁免）" "列表均走 builder 懒加载或无 ListView"

  # ====================================================================
  # fw_flutter_setstate_sprawl(warn)：单文件 setState ≥3 为状态管理失序信号
  # ====================================================================
  local ss_bad="" ss_cnt
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    ss_cnt=$(_fw_strip_comments_js_head "$t" | grep -cE 'setState\(' || true)
    if [[ "${ss_cnt:-0}" -ge 3 ]]; then
      ss_bad="${ss_bad}${t}: setState 调用 ${ss_cnt} 处
"
    fi
  done
  _fw_report warn fw_flutter_setstate_sprawl "${ss_bad}" "裸 setState 蔓延（全量子树重建失控；须 provider/riverpod/bloc/getx 结构化状态管理或拆分收敛）" "setState 均在收敛范围内"

  # ====================================================================
  # fw_flutter_sliver(warn)：复杂滚动须 Sliver，禁 shrinkWrap/嵌套滚动反模式
  # ====================================================================
  local sl_bad=""
  for t in "${dartarr[@]+"${dartarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    ln=$(printf '%s' "$body" | grep -nE 'shrinkWrap[[:space:]]*:[[:space:]]*true' || true)
    [[ -n "$ln" ]] && sl_bad="${sl_bad}${t}:${ln}
"
    if printf '%s' "$body" | grep -qE 'SingleChildScrollView' && printf '%s' "$body" | grep -qE 'ListView|GridView'; then
      sl_bad="${sl_bad}${t}: SingleChildScrollView 内嵌 ListView/GridView（嵌套滚动反模式，须 CustomScrollView + Sliver）
"
    fi
  done
  _fw_report warn fw_flutter_sliver "${sl_bad}" "shrinkWrap:true / 嵌套滚动反模式（一次性测量构建全部子项 + 手势冲突；须 CustomScrollView + SliverAppBar/SliverList/SliverGrid）" "复杂滚动均走 Sliver 或无嵌套滚动"

  # ====================================================================
  # fw_flutter_lints(warn)：pubspec/analysis_options 须接入 flutter_lints
  # ====================================================================
  local lt_bad=""
  for t in "${pubarr[@]+"${pubarr[@]}"}" "${anaarr[@]+"${anaarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    if ! grep -qE 'flutter_lints' "$t" 2>/dev/null; then
      lt_bad="${lt_bad}${t}
"
    fi
  done
  _fw_report warn fw_flutter_lints "${lt_bad}" "未接入 flutter_lints 静态分析（avoid_print/prefer_const_constructors 等静态防线缺失；pubspec 加 dev 依赖 + analysis_options include）" "flutter_lints 已接入或无依赖/分析配置在扫描范围"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
