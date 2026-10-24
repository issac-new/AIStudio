# gate: pr-quality
# domain: quality / enforce: advisory / tier: explicit
check_pr_quality() {

  if [[ "$_AI_JUDGMENT" == "1" ]]; then
    _ai_hint "check_pr_quality" "AI 看 git diff 三指标：①是否超过 500 行（建议拆 PR）②是否含 >3 个无关改动 ③重复模式（同一文件改 3+ 处相似逻辑）；给一句判断"
  return 0
  fi
  # 机械分支已随 GATE_AI_JUDGMENT 恒 1 退役删除（D1 落地化——AI 判断引导为唯一模式）

}
