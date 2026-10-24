# gate: link-depth
# domain: architecture / enforce: advisory / tier: arch
check_link_depth() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_link_depth" "挑 3 个核心用例，沿调用链逐层读代码（controller→service→repo），数层数；若 >6 层，AI 判断是否为适配层堆叠而非真实复杂度"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
