# ruleset: harmonyos  requires_conf: HARMONYOS_SRC_GLOBS
# gates: fw_harmonyos_napi_bridge(fail) fw_harmonyos_native_mem(fail) fw_harmonyos_permission(fail) fw_harmonyos_ability_lifecycle(warn) fw_harmonyos_arkts_strict(warn) fw_harmonyos_main_thread(warn) fw_harmonyos_cross_ref(warn) fw_harmonyos_cmake_link(warn) fw_harmonyos_state_decorator(warn) fw_harmonyos_concurrency_err(warn)
# harvested-from: 2026-08-26，规律源自 HarmonyOS NEXT NDK/ArkTS/权限/Ability 官方文档
_fw_harmonyos_check() {
  echo "  [harmonyos] HarmonyOS NEXT 框架规律"

  local files
  files=$(_fw_resolve_globs ${HARMONYOS_SRC_GLOBS[@]+"${HARMONYOS_SRC_GLOBS[@]}"} 2>/dev/null | sort -u)
  if [[ -z "$files" ]]; then
    warn "harmonyos: HARMONYOS_SRC_GLOBS 未配置或无文件可检"
    return
  fi
  local fa=()
  while IFS= read -r ln; do [[ -n "$ln" ]] && fa+=("$ln"); done <<< "$files"
  if [[ ${#fa[@]} -eq 0 ]]; then
    warn "harmonyos: HARMONYOS_SRC_GLOBS 未配置或无文件可检"
    return
  fi

  # 拆分 ArkTS / native / cmake / json5
  local ets_arr=() cpp_arr=() cmake_arr=() json5_arr=()
  local f
  for f in "${fa[@]}"; do
    case "$f" in
      *.ets|*.ts) ets_arr+=("$f") ;;
      *.cpp|*.c|*.h) cpp_arr+=("$f") ;;
      *CMakeLists.txt) cmake_arr+=("$f") ;;
      *.json5) json5_arr+=("$f") ;;
    esac
  done

  # 合并文本
  local ets_src="" cpp_src="" json5_src=""
  # 注释剥离：注释里的 any/napi_create_reference 等词不得触发门禁（误报根治）
  [[ ${#ets_arr[@]} -gt 0 ]] && ets_src=$(cat "${ets_arr[@]}" 2>/dev/null | sed -E 's#(^|[[:space:]])//.*#\1#' || true)
  [[ ${#cpp_arr[@]} -gt 0 ]] && cpp_src=$(cat "${cpp_arr[@]}" 2>/dev/null | sed -E 's#(^|[[:space:]])//.*#\1#' || true)
  [[ ${#json5_arr[@]} -gt 0 ]] && json5_src=$(cat "${json5_arr[@]}" 2>/dev/null || true)

  # ====================================================================
  # fw_harmonyos_napi_bridge(fail)：native 导出但无 napi 注册
  # CWE-476：ArkTS 调用未注册符号崩溃
  # ====================================================================
  local has_native_export has_napi_reg
  has_native_export=$(printf '%s\n' "$cpp_src" | grep -nE 'napi_|NAPI|#include <napi' 2>/dev/null || true)
  has_napi_reg=$(printf '%s\n' "$cpp_src" | grep -nE 'napi_module|napi_define_properties|napi_export' 2>/dev/null || true)
  if [[ -n "$has_native_export" && -z "$has_napi_reg" ]]; then
    _fw_report fail fw_harmonyos_napi_bridge "$has_native_export" "检出 native napi 调用但无 napi_module/napi_define_properties 注册（ArkTS 调用崩溃 CWE-476）" "native 已通过 napi 注册导出"
  else
    pass "fw_harmonyos_napi_bridge: native 已通过 napi 注册或无 native 代码"
  fi

  # ====================================================================
  # fw_harmonyos_native_mem(fail)：malloc/new 无配对 free/delete
  # CWE-401：内存泄漏
  # ====================================================================
  local alloc_cnt free_cnt
  alloc_cnt=$(printf '%s\n' "$cpp_src" | grep -cE '\bmalloc\(|\bnew[[:space:]]+[A-Za-z]|new\[' 2>/dev/null || true)
  free_cnt=$(printf '%s\n' "$cpp_src" | grep -cE '\bfree\(|\bdelete[[:space:]]|delete\[\]|napi_delete_reference' 2>/dev/null || true)
  if [[ "${alloc_cnt:-0}" -gt "${free_cnt:-0}" ]]; then
    _fw_report fail fw_harmonyos_native_mem "$cpp_src" "native 分配(${alloc_cnt}) > 释放(${free_cnt})（malloc/new 未配对 free/delete，CWE-401 内存泄漏）" "native 分配与释放配对"
  else
    pass "fw_harmonyos_native_mem: native 分配与释放配对"
  fi

  # ====================================================================
  # fw_harmonyos_permission(fail)：受限 API 但 module.json5 未声明权限
  # CWE-285：不当授权
  # ====================================================================
  local uses_restricted has_perm_decl
  uses_restricted=$(printf '%s\n' "$ets_src" | grep -nE 'getLocation|camera|fileIO|requestPermissionsFromUser|abilityAccessCtrl' 2>/dev/null || true)
  has_perm_decl=$(printf '%s\n' "$json5_src" | grep -nE 'requestPermissions|ohos\.permission' 2>/dev/null || true)
  if [[ -n "$uses_restricted" && -z "$has_perm_decl" ]]; then
    _fw_report fail fw_harmonyos_permission "$uses_restricted" "代码用受限 API 但 module.json5 未声明对应权限（授权失败 CWE-285）" "已声明权限或无受限 API 调用"
  else
    pass "fw_harmonyos_permission: 已声明权限或无受限 API 调用"
  fi

  # ====================================================================
  # fw_harmonyos_ability_lifecycle(warn)：onCreate 无 onDestroy 释放
  # ====================================================================
  local has_oncreate has_ondestroy
  has_oncreate=$(printf '%s\n' "$ets_src" | grep -nE 'onCreate|onForeground' 2>/dev/null || true)
  has_ondestroy=$(printf '%s\n' "$ets_src" | grep -nE 'onDestroy|onBackground' 2>/dev/null || true)
  if [[ -n "$has_oncreate" && -z "$has_ondestroy" ]]; then
    warn "fw_harmonyos_ability_lifecycle: 检出 onCreate/onForeground 但无 onDestroy/onBackground 释放（资源泄漏 CWE-404）"
  else
    pass "fw_harmonyos_ability_lifecycle: 生命周期回调配对"
  fi

  # ====================================================================
  # fw_harmonyos_arkts_strict(warn)：ArkTS 用 any 逃逸类型
  # ====================================================================
  local any_use
  any_use=$(printf '%s\n' "$ets_src" | grep -nE 'as any|: any|any\[|\bany\b' 2>/dev/null || true)
  if [[ -n "$any_use" ]]; then
    warn "fw_harmonyos_arkts_strict: 检出 any/as any 逃逸 ArkTS 严格类型（运行时类型错误 CWE-704）"
  else
    pass "fw_harmonyos_arkts_strict: 未用 any 逃逸类型"
  fi

  # ====================================================================
  # fw_harmonyos_main_thread(warn)：主线程重计算
  # ====================================================================
  local heavy_loop
  heavy_loop=$(printf '%s\n' "$ets_src" | grep -nE 'for[[:space:]]*\(.*\).*\{|while[[:space:]]*\(|syncConnect|readSync' 2>/dev/null || true)
  if [[ -n "$heavy_loop" ]]; then
    warn "fw_harmonyos_main_thread: 检出主线程循环/同步 IO（须 TaskPool/Worker 异步，否则 UI 卡顿 CWE-400）"
  else
    pass "fw_harmonyos_main_thread: 主线程无重计算"
  fi

  # ====================================================================
  # fw_harmonyos_cross_ref(warn)：napi_create_reference 无 napi_delete_reference
  # ====================================================================
  local ref_create ref_delete
  ref_create=$(printf '%s\n' "$cpp_src" | grep -cE 'napi_create_reference|napi_create_threadsafe_function' 2>/dev/null || true)
  ref_delete=$(printf '%s\n' "$cpp_src" | grep -cE 'napi_delete_reference|napi_release_threadsafe_function' 2>/dev/null || true)
  if [[ "${ref_create:-0}" -gt "${ref_delete:-0}" ]]; then
    warn "fw_harmonyos_cross_ref: napi_create_reference(${ref_create}) > napi_delete_reference(${ref_delete})（跨界引用泄漏）"
  else
    pass "fw_harmonyos_cross_ref: 跨界引用配对"
  fi

  # ====================================================================
  # fw_harmonyos_cmake_link(warn)：CMakeLists 用 NDK 库但未链接
  # ====================================================================
  local cmake_uses_ndk cmake_links
  cmake_uses_ndk=$(printf '%s\n' "$([[ ${#cmake_arr[@]} -gt 0 ]] && cat "${cmake_arr[@]}" 2>/dev/null || true)" | grep -nE 'ace_napi|native_buffer|libace' 2>/dev/null || true)
  cmake_links=$(printf '%s\n' "$([[ ${#cmake_arr[@]} -gt 0 ]] && cat "${cmake_arr[@]}" 2>/dev/null || true)" | grep -nE 'target_link_libraries' 2>/dev/null || true)
  if [[ -n "$cmake_uses_ndk" && -z "$cmake_links" ]]; then
    warn "fw_harmonyos_cmake_link: CMakeLists 引用 NDK 库但无 target_link_libraries（链接失败 CWE-754）"
  else
    pass "fw_harmonyos_cmake_link: 已链接 NDK 库或无 CMake 引用"
  fi

  # ====================================================================
  # fw_harmonyos_state_decorator(warn)：@Component 内改普通变量无 @State/@Prop
  # ====================================================================
  local has_component has_decorator
  has_component=$(printf '%s\n' "$ets_src" | grep -nE '@Component|struct .* \{' 2>/dev/null || true)
  has_decorator=$(printf '%s\n' "$ets_src" | grep -nE '@State|@Prop|@Link|@Provide|@Consume' 2>/dev/null || true)
  if [[ -n "$has_component" && -z "$has_decorator" ]]; then
    warn "fw_harmonyos_state_decorator: 检出 @Component 但无 @State/@Prop 状态装饰器（UI 不刷新）"
  else
    pass "fw_harmonyos_state_decorator: 状态管理装饰器已用"
  fi

  # ====================================================================
  # fw_harmonyos_concurrency_err(warn)：TaskPool/Worker 无异常捕获
  # ====================================================================
  local has_taskpool has_trycatch
  has_taskpool=$(printf '%s\n' "$ets_src" | grep -nE 'TaskPool|execute|Worker|postMessage' 2>/dev/null || true)
  has_trycatch=$(printf '%s\n' "$ets_src" | grep -nE 'try[[:space:]]*\{|catch|onError|\.catch' 2>/dev/null || true)
  if [[ -n "$has_taskpool" && -z "$has_trycatch" ]]; then
    warn "fw_harmonyos_concurrency_err: 检出 TaskPool/Worker 但无异常捕获（后台任务静默失败 CWE-755）"
  else
    pass "fw_harmonyos_concurrency_err: 并发任务已异常捕获"
  fi
}
