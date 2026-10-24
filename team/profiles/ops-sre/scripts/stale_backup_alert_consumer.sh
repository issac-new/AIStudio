#!/bin/bash
# stale_backup_alert_consumer.sh — STALE_BACKUP 告警 token 消费方（t_a6609a0b）
#
# 背景：tupang-auto-push.sh 与 dr_drill_cron.sh 在备份失效时写 STALE_BACKUP
# 标记行到日志，但全机此前无任何消费方 —— 09-02 push 断链一个月静默的根因
# 就是「告警写了没人看」。本脚本是消费侧：时间窗去重检出 → stdout 输出
# （cron no_agent 模式 stdout 即投递消息，deliver=weixin）。
#
# 写入侧契约（只读不改）：日志行格式 "YYYY-MM-DD HH:MM:SS ... STALE_BACKUP ..."
# 去重：水位文件记录已告警的最大时间戳，只告更新行；另设 24h 下界，
# 老于 24h 的积压行不再重放。
# 退出码：0=健康静默（无输出无投递）；2=检出告警（stdout=告警文本）
# 邮件腿（t_a6609a0b run58 addendum）：weixin 会话未激活期间（iLink 要求用户先发
# 消息）告警同步经 SMTP 直达用户邮箱；通路与夜间报告管道同源（~/.hermes/.env
# EMAIL_SMTP_*，收件人 EMAIL_HOME_ADDRESS）。邮件失败不改退出码（cron stdout
# 投递仍是主路径），仅 stderr 留痕。
export LC_ALL=C

LOGS=(
  "$HOME/.hermes/logs/tupang-auto-push.log"
  "$HOME/.hermes/logs/dr-drill-cron.log"
)
STATE_DIR="$HOME/.hermes/profiles/ops-sre/state"
WM="$STATE_DIR/stale_backup_consumer.watermark"
mkdir -p "$STATE_DIR"

WM_VAL="1970-01-01 00:00:00"
[ -f "$WM" ] && WM_VAL=$(cat "$WM" 2>/dev/null)
CUTOFF=$(date -v-24H '+%F %T' 2>/dev/null || date -d '24 hours ago' '+%F %T')

NEW_WM="$WM_VAL"
N=0
ALERT=""
for LOG in "${LOGS[@]}"; do
  [ -f "$LOG" ] || continue
  while IFS= read -r line; do
    ts=${line:0:19}
    case "$ts" in
      ????-??-??\ ??:??:??) ;;        # 形如时间戳才参与判定（4位年）
      *) continue ;;
    esac
    [ "$ts" \> "$CUTOFF" ] || [ "$ts" = "$CUTOFF" ] || continue
    [ "$ts" \> "$WM_VAL" ] || continue
    ALERT="${ALERT}$(printf '%s\n' "🚨 [$(basename "$LOG")] $line")"$'\n'
    N=$((N+1))
    [ "$ts" \> "$NEW_WM" ] && NEW_WM="$ts"
  done < <(grep 'STALE_BACKUP' "$LOG" 2>/dev/null)
done

if [ "$N" -gt 0 ]; then
  echo "🔔 STALE_BACKUP 备份失效告警：检出 ${N} 条未消费标记行（$(date '+%F %T')）"
  echo "----------"
  printf '%s' "$ALERT"
  echo "----------"
  echo "含义：备份 push/演练链路报失效。runbook：查 tupang-auto-push.log 尾部与 dr-drill 最新报告（workspace life-workbench/gap_workspaces/）。"

  # ---- 邮件腿：同一告警文本同步发 SMTP（失败不阻断 stdout 投递主路径）----
  python3 - "$ALERT" <<'PYEOF' 1>&2
import os, sys, ssl, smtplib, time
from email.mime.text import MIMEText
from email.header import Header
from email.utils import formataddr
alert = sys.argv[1]
env = {}
for line in open(os.path.expanduser('~/.hermes/.env')):
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
host, port = env['EMAIL_SMTP_HOST'], int(env.get('EMAIL_SMTP_PORT', '465'))
user, pwd = env['EMAIL_ADDRESS'], env['EMAIL_PASSWORD']
to = env.get('EMAIL_HOME_ADDRESS') or '<dad-wechat-id>@im.wechat'
body = f"STALE_BACKUP 告警（消费方 stale_backup_alert_consumer.sh，{time.strftime('%F %T')}）\n\n{alert}\n\n-- Hermes SRE 消费方 cron（t_a6609a0b 邮件腿）"
msg = MIMEText(body, 'plain', 'utf-8')
msg['From'] = formataddr((str(Header('Hermes SRE', 'utf-8')), user))
msg['To'] = to
msg['Subject'] = Header(f'[备份告警] STALE_BACKUP 检出 {alert.count(chr(10))} 条未消费标记行', 'utf-8')
ctx = ssl.create_default_context()
with smtplib.SMTP_SSL(host, port, context=ctx, timeout=30) as s:
    s.login(user, pwd)
    s.sendmail(user, [to], msg.as_string())
print(f"[email-leg] sent -> {to}")
PYEOF
  # 邮件腿结果已在 stderr 留痕；不改变退出码与 stdout

  printf '%s' "$NEW_WM" > "$WM"
  exit 2
fi
# 健康即静默：stdout 空 → cron no_agent 不投递
exit 0
