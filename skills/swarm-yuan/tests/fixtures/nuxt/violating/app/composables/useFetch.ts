// violating fixture 追加（2026-07-20 P1 唤醒）：
// composables/ 导出与 Nuxt 内置 useFetch 同名（覆盖内置自动导入致行为异常）
// → fw_nuxt_autoimport_conflict(fail)
export function useFetch() {
  return null;
}
