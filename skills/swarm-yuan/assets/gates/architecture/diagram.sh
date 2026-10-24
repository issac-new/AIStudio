# gate: diagram
# domain: architecture / enforce: warn / tier: arch
check_diagram() {
  # 客观契约机械查，主观质量 AI 检查单——两层都跑，不再二选一。
  # 机械层只判可机检的硬契约（单文件安全/可访问 SVG/远程资源/脚本策略/viewBox），
  # 不判断“这张图是否值得画、是否好看”；后者留给下面的 AI 检查单与视觉审查留痕。
  # enforce 层在 precheck.sh _ENFORCE_OVERRIDE 登记为 warn（2026-10-19 R122）：
  # 0 fail 的静态分类来自旧实现未执行检查，硬契约违约应阻断 standard+ 交付。
  local _dc _dc_out _dc_rc
  _dc=""
  if [[ -f "$(dirname "$0")/diagram-check.sh" ]]; then
    _dc="$(dirname "$0")/diagram-check.sh"
  elif [[ -f "$(dirname "$0")/../scripts/diagram-check.sh" ]]; then
    _dc="$(dirname "$0")/../scripts/diagram-check.sh"
  fi

  echo "=== 图表生产检查（check_diagram）==="
  if [[ -n "$_dc" ]]; then
    _dc_rc=0
    _dc_out=$(PROJECT_DIR="${PROJECT_DIR:-.}" bash "$_dc" --all 2>&1) || _dc_rc=$?
    printf '%s\n' "$_dc_out"
    if [[ "$_dc_rc" -ne 0 ]]; then
      fail "图表结构自检发现违例（修复后重跑；DIAGRAM_ENFORCE=0 仅降级为警告）"
    else
      pass "图表结构自检通过（或未发现图表产物）"
    fi
  else
    warn "diagram-check.sh 未随技能分发，机械检查降级为 AI 检查单"
  fi

  echo "  → AI 检查单（主观质量，机械层不替你判断）："
  echo "    ① 这张图是否值得画？三列表格或一段话能否替代？"
  echo "    ② 选型是否先语义模式后视觉类型？是否读了所选 type-*.md？"
  echo "    ③ 是否 ≤9 节点 / ≤12 箭头 / ≤2 强调色？超出是否拆图？"
  echo "    ④ 图与代码/配置事实是否一致（每个节点有锚点，无凭空补件）？"
  echo "    ⑤ 390px 与桌面宽度、打印、reduced-motion 下是否仍可读？"
  echo "    → 判断留痕：${PROJECT_DIR:-.}/.swarm-yuan/notes/diagram.md"
  echo "    → 方法与运行时：references/diagram-production-methodology.md + runtime/diagram-design/"
}
