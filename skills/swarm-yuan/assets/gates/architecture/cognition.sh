# gate: cognition
# domain: architecture / enforce: advisory / tier: arch
check_cognition() {
  # 机械计分退役（awk 数表行数给"理解"打分——五轮诊断的病灶标本：
  # 0 fail、诱导填表冒充理解）。认知框架概念不删除，落地为 AI 判断引导 + notes 留痕——
  # 概念从"要背的名词"变为"AI 判断的检查单"，被真实消费（GATE_AI_JUDGMENT 唯一模式）。
  echo "=== 认知体检（check_cognition——AI 判断引导模式）==="
  echo "  机械计分已退役：本门禁不再用 awk 数表行数给理解打分。"
  echo "  → AI 按认知框架逐维自查（对照 reference-manual.md §1-§9），每维一句判断："
  echo "    ① 概念（六阶链第 1 阶）：核心业务概念是否都有定义？术语表与代码命名一致吗？"
  echo "    ② 结构（六阶链第 2 阶）：分层/模块边界清晰吗？有没有循环依赖？"
  echo "    ③ 映射（六阶链第 4 阶）：需求→组件→测试的对应关系完整吗？"
  echo "    ④ 规律（六阶链第 5 阶）：项目的隐性规律（编排约束/数据流向）被显式记录了吗？"
  echo "    ⑤ 动力学（六维）：关键链路的速度/聚散/趋势/强度/能耗/累积量中，哪维是本项目的痛点？"
  echo "    ⑥ 稳定性（五层认知）：哪些单元禁止改/稳定/不稳定？与 git churn 信号一致吗？"
  echo "  → 判断留痕：把每维一句判断写入 ${PROJECT_DIR:-.}/.swarm-yuan/notes/cognition.md"
  echo "    （六个月后回看 = 认知基线的纵向对比，替代此前的 14/22 机械分数）"
  if [[ ! -f "${PROJECT_DIR:-.}/.swarm-yuan/notes/cognition.md" ]]; then
    warn "认知自查留痕缺失（.swarm-yuan/notes/cognition.md 不存在）——AI 完成逐维自查后写入（advisory，不阻断）"
  else
    pass "认知自查留痕存在（notes/cognition.md，${PROJECT_DIR:-.}）——纵向对比见文件历史"
  fi
  return 0
}
