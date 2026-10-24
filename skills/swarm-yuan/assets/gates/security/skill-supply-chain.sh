# gate: skill-supply-chain
# domain: security / enforce: advisory / tier: explicit
check_skill_supply_chain() {
  echo "=== Skill 供应链安全审计（--skill-supply-chain，advisory；cso P8 理念）==="
  # 回归#19：扫描范围默认锁定项目级 .claude/skills（PROJECT_DIR 内）。
  # 仅在项目内无此目录时兜底扫全局 ~/.claude/skills，且加 --max-count 限额防止
  # 巨型全局 skill 仓库（1G+ / 2000+ 文件）下 grep 多模式 × 全文件导致超时（60s 内必返回）。
  local skills_dir="${PROJECT_DIR:-$(pwd)}/.claude/skills"
  local scan_global=0
  if [[ ! -d "$skills_dir" ]]; then
    # 兜底：~/.claude/skills
    skills_dir="${HOME}/.claude/skills"
  fi
  if [[ ! -d "$skills_dir" ]]; then
    echo "  ℹ 无 .claude/skills 目录，Skill 供应链审计跳过"
    return 0
  fi
  [[ "$skills_dir" == "${HOME}/.claude/skills" ]] && scan_global=1
  local found=0
  # ① 恶意模式扫描（cso P8：SKILL.md 是可执行提示代码，不豁免文档文件）
  local suspicious_files=""
  local skill_f
  # 回归#19：全局兜底扫描时限额（前 200 个文件 + 单文件 grep 超时），避免 1G+ 巨型仓库超时。
  local _ssc_limit=0
  while IFS= read -r skill_f; do
    [[ -z "$skill_f" ]] && continue
    ((_ssc_limit++)); [[ $_ssc_limit -gt 200 ]] && { warn "全局 skills 超 200 文件，供应链审计仅扫前 200（其余建议单独跑 check_skill_supply_chain <目录>）"; break; }
    # 检测 eval/exec + 网络请求组合（.sh）
    if grep -qE --max-count=1 '\beval\s*\(' "$skill_f" 2>/dev/null && grep -qE --max-count=1 'curl\s|wget\s|fetch\(' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: eval+网络请求\n"
      found=1
    fi
    # 检测混淆代码（base64 解码后执行）
    if grep -qE --max-count=1 'base64.*decode.*\|.*bash|base64.*-d.*\|.*sh' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: base64 混淆执行\n"
      found=1
    fi
    # 检测硬编码外部 URL + 下载执行
    if grep -qE --max-count=1 'curl.*\|.*bash|wget.*\|.*sh' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 远程脚本下载执行\n"
      found=1
    fi
    # cso P8 补充：凭证访问模式（读 ~/.ssh ~/.aws ~/.config 敏感目录）
    if grep -qE --max-count=1 'cat\s+~/\.ssh|cat\s+~/.aws|cat\s+~/.config|source\s+~/.ssh|cat\s+~/.env' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 凭证访问（读敏感目录）\n"
      found=1
    fi
    # cso P8 补充：提示注入覆写（尝试修改系统提示/覆写 skill 文件）
    if grep -qE --max-count=1 'override.*system.*prompt|ignore.*previous.*instructions|覆写.*提示|覆盖.*system' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 提示注入覆写尝试\n"
      found=1
    fi
    # cso P8 补充：网络外联（非项目域名硬编码）
    if grep -qE --max-count=1 'https?://[a-zA-Z0-9.-]+\.(ru|tk|ml|ga|cf)' "$skill_f" 2>/dev/null; then
      suspicious_files="${suspicious_files}${skill_f}: 可疑 TLD 网络外联\n"
      found=1
    fi
  done < <(find "$skills_dir" -maxdepth 2 -type f \( -name '*.sh' -o -name '*.md' \) 2>/dev/null || true)
  if [[ -n "$suspicious_files" ]]; then
    warn "检出 Skill 供应链可疑模式（cso P8：恶意 skill 可能利用 eval/网络请求/混淆执行/凭证访问/提示注入覆写）：
$(printf '%b\n' "$suspicious_files" | head -5 | sed 's/^/    /')"
  fi
  # ② UPSTREAM.md / 许可证登记检查（warn-only）
  local upstream_count
  upstream_count=$(find "$skills_dir" -maxdepth 2 \( -name 'UPSTREAM.md' -o -name 'LICENSE' \) 2>/dev/null | wc -l | xargs || true)
  local total_skills
  total_skills=$(find "$skills_dir" -maxdepth 1 -mindepth 1 -type d 2>/dev/null | wc -l | xargs || true)
  if [[ $total_skills -gt 0 && $upstream_count -lt $total_skills ]]; then
    warn "Skills 目录有 ${total_skills} 个 skill 但仅 ${upstream_count} 个有 UPSTREAM.md/LICENSE——供应链溯源不完整"
    found=1
  fi
  [[ $found -eq 0 ]] && pass "Skill 供应链安全审计通过（无恶意模式，溯源登记完整）"
}
