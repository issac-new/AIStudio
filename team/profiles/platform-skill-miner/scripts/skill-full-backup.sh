#!/bin/bash
# skill-full-backup.sh — orchestrator skills 全量备份（FDE-GAP3-FU / t_4b9158c0）
# 背景：演练 #1 (t_90ef5b62) 实锤 curator_backups 仅覆盖 ~10/328 skill，
#       本脚本提供真实全量备份。tar -L 解引用 symlink（28/30 顶层项为软链，
#       不 -L 则备份的是悬空指针）。
# 目标：外部盘 /Volumes/nvme2230（系统卷常近满，禁止在系统卷放大副本）
# 保留：最近 14 份（每日 1 份 = 2 周窗口）
set -euo pipefail

SRC="$HOME/.hermes/profiles/orchestrator/skills"
DEST="/Volumes/nvme2230/hermes-backups/skills"
KEEP=14

# 外部盘未挂载 → 静默失败并留痕（cron 下不弹错）
if [ ! -d "/Volumes/nvme2230" ]; then
  echo "$(date -u +%FT%TZ) SKIP: /Volumes/nvme2230 not mounted" >> "$HOME/.hermes/logs/skill-backup.log"
  exit 0
fi

mkdir -p "$DEST" "$HOME/.hermes/logs"
TS=$(date -u +%Y-%m-%dT%H-%M-%SZ)
TMP_OUT="$HOME/.hermes/tmp-skill-backup-$$.tar.gz"

# 打包到临时文件（系统卷短暂停留 12MB，随即移走）——规避 tar 直写外盘的锁问题
tar -cLzf "$TMP_OUT" -C "$HOME/.hermes/profiles/orchestrator" \
  --exclude='skills/.curator_backups' skills

mv "$TMP_OUT" "$DEST/orch-skills-$TS.tar.gz"

# manifest（sha256 + 条目统计 + patch-watchdog 命中自检）
ENTRIES=$(tar tzf "$DEST/orch-skills-$TS.tar.gz" | wc -l | tr -d ' ')
SKILL_MD=$(tar tzf "$DEST/orch-skills-$TS.tar.gz" | grep -c '/SKILL.md$' || true)
PW=$(tar tzf "$DEST/orch-skills-$TS.tar.gz" | grep -c 'patch-watchdog' || true)
SHA=$(shasum -a 256 "$DEST/orch-skills-$TS.tar.gz" | awk '{print $1}')

cat > "$DEST/orch-skills-$TS.manifest.json" <<EOF
{
  "created_utc": "$TS",
  "source": "$SRC",
  "artifact": "$DEST/orch-skills-$TS.tar.gz",
  "entries": $ENTRIES,
  "skill_md_count": $SKILL_MD,
  "patch_watchdog_present": $([ "$PW" -gt 0 ] && echo true || echo false),
  "sha256": "$SHA",
  "excludes": [".curator_backups"],
  "dereference_symlinks": true,
  "reason": "FDE-GAP3-FU full skill backup (drill #1 blind-spot fix, t_4b9158c0)"
}
EOF

# 轮转：保留最近 KEEP 份
ls -1t "$DEST"/orch-skills-*.tar.gz | tail -n +$((KEEP+1)) | while read -r old; do
  rm -f "$old" "${old%.tar.gz}.manifest.json"
done

echo "$(date -u +%FT%TZ) OK entries=$ENTRIES skill_md=$SKILL_MD patch_watchdog=$PW sha=${SHA:0:16}" \
  >> "$HOME/.hermes/logs/skill-backup.log"
