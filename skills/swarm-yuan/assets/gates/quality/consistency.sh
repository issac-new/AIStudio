# gate: consistency
# domain: quality / enforce: advisory / tier: core
check_consistency() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_consistency" "逐文件读业务规则，对照数据勾稽核对（订单金额=Σ明细 / 库存=Σ在库+在途）；在 CONSISTENCY_DIRS 内人读 3-5 个核心文件；不要靠 grep"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
