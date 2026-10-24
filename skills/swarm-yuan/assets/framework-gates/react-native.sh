# ruleset: react-native  requires_conf: REACT_NATIVE_GLOBS
# gates: fw_react_native_webview_no_whitelist(fail) fw_react_native_asyncstorage_secret(fail) fw_react_native_console_log(warn) fw_react_native_hermes_disabled(fail) fw_react_native_proguard(warn) fw_react_native_permissions(warn) fw_react_native_safe_area(warn) fw_react_native_flatlist(warn) fw_react_native_memo(warn) fw_react_native_flipper(warn)
# harvested-from: 移动端补盲（2026-07-23），规律源自 React Native 官方文档 / react-native-webview·async-storage README / OWASP MASVS / Hermes·Flipper 官方文档
_fw_react_native_check() {
  echo "  [react-native] React Native 0.7x 移动端规律"

  # ---------- 收集文件清单（JS/TS 源码 + 构建/清单配置统一入 srcarr 后拆分） ----------
  local srcs srcarr=()
  srcs=$(_fw_resolve_globs ${REACT_NATIVE_GLOBS[@]+"${REACT_NATIVE_GLOBS[@]}"} 2>/dev/null | sort -u)
  while IFS= read -r ln; do
    [[ -n "$ln" ]] && srcarr+=("$ln")
  done <<< "$srcs"

  if [[ ${#srcarr[@]} -eq 0 ]]; then
    warn "react-native: REACT_NATIVE_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 JS/TS 源码 vs 构建/清单配置
  local jsarr=() gradlearr=() pkgarr=() manifestarr=()
  local f t ln body
  for f in "${srcarr[@]}"; do
    case "$(basename "$f")" in
      *.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs) jsarr+=("$f") ;;
      *.gradle|*.gradle.kts) gradlearr+=("$f") ;;
      package.json|Podfile) pkgarr+=("$f") ;;
      AndroidManifest.xml) manifestarr+=("$f") ;;
    esac
  done

  # JS/TS 注释剥离：调公共库 _fw_strip_comments_js_head（剥行首 // 与块注释行，
  # 保留行内 // 防误伤 URL 中的 https://）

  # ====================================================================
  # fw_react_native_webview_no_whitelist(fail)：WebView 远程 URL 须 originWhitelist
  # ====================================================================
  # 口径：同文件命中 <WebView 与 https?:// 且无 originWhitelist → 违规
  #   （本地 require/file:// 资源无 https?:// 命中，天然豁免）
  local wv_bad=""
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE '<WebView' || continue
    printf '%s' "$body" | grep -qE 'https?://' || continue
    if ! printf '%s' "$body" | grep -q 'originWhitelist'; then
      ln=$(printf '%s' "$body" | grep -nE '<WebView' | head -1 || true)
      wv_bad="${wv_bad}${t}:${ln}
"
    fi
  done
  _fw_report fail fw_react_native_webview_no_whitelist "${wv_bad}" "WebView 加载远程 URL 未配 originWhitelist（任意源可注入，CWE-79；OWASP MASVS-PLATFORM）" "WebView 均已配 originWhitelist 或未用远程 WebView"

  # ====================================================================
  # fw_react_native_asyncstorage_secret(fail)：AsyncStorage 禁存敏感 key
  # ====================================================================
  # 口径：setItem( 调用点起 60 字符内含敏感 key 语义（大小写不敏感）
  local as_bad=""
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    ln=$(_fw_strip_comments_js_head "$t" | grep -inE 'AsyncStorage\.setItem\(.{0,60}(token|password|passwd|secret|credential|api_?key|session)' || true)
    [[ -n "$ln" ]] && as_bad="${as_bad}${t}:${ln}
"
  done
  _fw_report fail fw_react_native_asyncstorage_secret "${as_bad}" "AsyncStorage 明文存敏感数据（iOS plist/Android SQLite 未加密，CWE-312；须 react-native-keychain/expo-secure-store）" "凭证均走 Keychain/Keystore 安全存储"

  # ====================================================================
  # fw_react_native_console_log(warn)：生产代码禁 console.log/info/debug
  # ====================================================================
  local cl_bad=""
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    ln=$(_fw_strip_comments_js_head "$t" | grep -nE 'console\.(log|info|debug)\(' || true)
    [[ -n "$ln" ]] && cl_bad="${cl_bad}${t}:${ln}
"
  done
  _fw_report warn fw_react_native_console_log "${cl_bad}" "console 调试输出残留（release 日志任意可读 + Hermes 字节码可见，CWE-209/CWE-532；须 __DEV__ 守卫或 babel 剥离）" "无 console 调试输出残留"

  # ====================================================================
  # fw_react_native_hermes_disabled(fail)：禁显式回退 JSC
  # ====================================================================
  local hm_bad=""
  for t in "${gradlearr[@]+"${gradlearr[@]}"}" "${pkgarr[@]+"${pkgarr[@]}"}"; do
    [[ -n "$t" ]] || continue
    ln=$(grep -inE '(hermesEnabled|enableHermes|hermes_enabled)[[:space:]]*[:=][[:space:]]*false' "$t" 2>/dev/null || true)
    [[ -n "$ln" ]] && hm_bad="${hm_bad}${t}:${ln}
"
  done
  _fw_report fail fw_react_native_hermes_disabled "${hm_bad}" "显式关闭 Hermes 回退 JSC（无字节码预编译，bundle 明文可提取，逆向面扩大；OWASP MASVS-RESILIENCE）" "Hermes 引擎启用（0.70+ 默认）或无显式关闭配置"

  # ====================================================================
  # fw_react_native_proguard(warn)：release 须 minifyEnabled true
  # ====================================================================
  local pg_bad=""
  for t in "${gradlearr[@]+"${gradlearr[@]}"}"; do
    grep -qE 'buildTypes|release' "$t" 2>/dev/null || continue
    if ! grep -qE 'minifyEnabled[[:space:]]+true' "$t" 2>/dev/null; then
      pg_bad="${pg_bad}${t}
"
    fi
  done
  _fw_report warn fw_react_native_proguard "${pg_bad}" "Android release 未启用 ProGuard/R8 混淆（APK 类名明文可还原，OWASP MASVS-RESILIENCE-2）" "release 均已 minifyEnabled true 或无 gradle 配置在扫描范围"

  # ====================================================================
  # fw_react_native_permissions(warn)：危险权限最小化审查
  # ====================================================================
  local pm_bad=""
  for t in "${manifestarr[@]+"${manifestarr[@]}"}"; do
    ln=$(grep -nE 'android\.permission\.(READ_SMS|SEND_SMS|READ_CONTACTS|WRITE_CONTACTS|RECORD_AUDIO|CAMERA|ACCESS_FINE_LOCATION|READ_CALL_LOG|BODY_SENSORS)' "$t" 2>/dev/null || true)
    [[ -n "$ln" ]] && pm_bad="${pm_bad}${t}:${ln}
"
  done
  _fw_report warn fw_react_native_permissions "${pm_bad}" "危险权限须逐项业务依据（GB/T 35273-2020 最小必要；Play 政策最小权限；无依据移除）" "无危险权限或均已最小化登记"

  # ====================================================================
  # fw_react_native_safe_area(warn)：须有 SafeArea 处理（工程级启发式）
  # ====================================================================
  local sa_hit=0
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    if _fw_strip_comments_js_head "$t" | grep -qE 'SafeAreaView|SafeAreaProvider|useSafeAreaInsets|react-native-safe-area-context'; then
      sa_hit=1; break
    fi
  done
  if [[ ${#jsarr[@]} -gt 0 && "$sa_hit" -eq 0 ]]; then
    warn "fw_react_native_safe_area: 工程无 SafeAreaView/SafeAreaProvider/useSafeAreaInsets 痕迹（刘海屏/灵动岛/手势区遮挡，iOS HIG 与 Android 15 edge-to-edge 要求）"
  else
    pass "fw_react_native_safe_area: 已接入 SafeArea 处理"
  fi

  # ====================================================================
  # fw_react_native_flatlist(warn)：长列表须 FlatList 非 ScrollView
  # ====================================================================
  local fl_bad=""
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE '<ScrollView' || continue
    if ! printf '%s' "$body" | grep -qE 'FlatList|SectionList|VirtualizedList|FlashList'; then
      ln=$(printf '%s' "$body" | grep -nE '<ScrollView' | head -1 || true)
      fl_bad="${fl_bad}${t}:${ln}
"
    fi
  done
  _fw_report warn fw_react_native_flatlist "${fl_bad}" "ScrollView 嫌疑承载长列表（全量渲染 JS 线程阻塞/内存暴涨；须 FlatList/SectionList 虚拟化，短静态布局可人工豁免）" "列表均走虚拟化组件或无 ScrollView"

  # ====================================================================
  # fw_react_native_memo(warn)：导出组件须有 memo 化痕迹（启发式）
  # ====================================================================
  local mm_bad=""
  for t in "${jsarr[@]+"${jsarr[@]}"}"; do
    body=$(_fw_strip_comments_js_head "$t")
    printf '%s' "$body" | grep -qE 'export[[:space:]]+(default[[:space:]]+)?function[[:space:]]+[A-Z]|export[[:space:]]+const[[:space:]]+[A-Z]' || continue
    if ! printf '%s' "$body" | grep -qE 'React\.memo|[^a-zA-Z]memo\(|useMemo|useCallback'; then
      mm_bad="${mm_bad}${t}
"
    fi
  done
  _fw_report warn fw_react_native_memo "${mm_bad}" "导出组件无 React.memo/useMemo/useCallback 痕迹（父渲染级联重渲掉帧；启发式，人工复核是否纯静态页）" "组件均有 memo 化痕迹或无导出组件"

  # ====================================================================
  # fw_react_native_flipper(warn)：package.json 须有 Flipper 调试工具链
  # ====================================================================
  local fp_bad=""
  for t in "${pkgarr[@]+"${pkgarr[@]}"}"; do
    case "$(basename "$t")" in
      package.json) ;;
      *) continue ;;
    esac
    if ! grep -qiE 'flipper' "$t" 2>/dev/null; then
      fp_bad="${fp_bad}${t}
"
    fi
  done
  _fw_report warn fw_react_native_flipper "${fp_bad}" "package.json 无 Flipper 依赖（网络/布局/存储调试无工具链；RN 0.74+ 须手动集成 react-native-flipper）" "Flipper 已接入或无 package.json 在扫描范围"

### AI 自查段（仅注释，不改动函数体）
# 违规行定位：本函数内各门禁分支的 fail/warn 由 pass/fail/warn 宏直接上报，
#   命中行即对应 pass/fail/warn 调用所在行；定位方法：grep -nE 'fail "fw_|warn "fw_' <file>。
# 优先级建议：fail 级（数据/安全不可逆后果）须 AI 亲自核验修复后复跑；warn 级评估后采纳。
# 门禁 id 映射：本函数覆盖的 fw_<id> 与 references/frameworks/<id>.md §4 一一对应；
#   沉睡门禁检查：声明 id 须全部被 pass/fail/warn 任一分支命中，否则为未唤醒死门禁。
}
