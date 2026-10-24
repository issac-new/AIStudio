# gate: scope
# domain: process / enforce: warn / tier: core
check_scope() {
  echo "=== 改动范围检查 ==="
  local readonly_violation=0
  # 在 PROJECT_DIR 下检查 git diff，看是否有改动落在只读目录
  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    local changed; changed=$(_git_changed_files)
    # 两类工具链自有路径不属项目只读语义（列只读即每轮自干扰永久红）——
    # ① 运行时账本 .swarm-yuan/**：门禁与 hook 自写（trace/审计/flag/指纹/记忆写回），
    #    防篡改靠链式锚定与审计兜底，不靠 scope 门；
    # ② 技能资产 .claude/skills/**（含 .codex/skills）：create/upgrade/--persist 的合法写入面，
    #    防手改由 integrity-guard（deny/advisory）与升级机制守卫——分层执法，scope 不重复兜。
    changed=$(printf '%s\n' "$changed" | grep -vE '^(\.claude/skills/|\.codex/skills/|\.swarm-yuan/)' || true)
    if [[ -n "$changed" ]]; then
      for rd in ${READONLY_DIRS[@]+"${READONLY_DIRS[@]}"}; do
        [[ -z "$rd" ]] && continue
        # 只读目录可能是路径前缀（如 node_modules/ 或 upstream/）
        # R128：前缀判定改 bash 字面比较——旧版把 conf 值直接插进 ERE，目录名含 . [ + 等元字符
        # 即误配（假阳性），正则非法时 grep rc=2 被 || true 吞成「无违规」（假阴性）；conf 值是数据不是模式。
        local viol="" _ln _rdn="${rd%/}"
        while IFS= read -r _ln; do
          [[ -z "$_ln" ]] && continue
          if [[ "$_ln" == "$_rdn" || "$_ln" == "$_rdn/"* ]]; then
            viol="${viol}${viol:+$'\n'}${_ln}"
          fi
        done <<< "$changed"
        if [[ -n "$viol" ]]; then
          fail "只读目录有改动: ${rd}"
          echo "$viol" | head -10 | sed 's/^/    /'
          readonly_violation=1
        fi
      done
    fi
  else
    # 非 git 仓库：降级为检查只读目录是否有新文件（对比 gitignore 或 mtime）
    for rd in ${READONLY_DIRS[@]+"${READONLY_DIRS[@]}"}; do
      [[ -d "$rd" ]] || continue
      warn "非 git 仓库，只读目录 $rd 无法自动检测改动"
    done
  fi
  [[ $readonly_violation -eq 0 ]] && pass "只读目录无改动"
}
