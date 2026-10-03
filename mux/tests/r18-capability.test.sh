#!/bin/bash
# r18-capability.test.sh — R18 全量呈现配套能力端到端验证（V7.2 §9.3 R18）
# 夹具树隔离（AIPAY_SIM_ROOT 覆盖，不碰真实 SIM 根）验证三件事：
#   ①生成器渲染：r18-steps.json 三位载荷（对话全文/操作前后帧/环节效果）进 simulation-report.html，
#     载荷空步渲染诚实"未采集"章；②审计器查 8：✅ 步按步型必采矩阵打回缺失、已采步不打回；
#   ③采集器：op/effect 登记合并幂等写入（dialog 走真实 matrix，本测试不依赖网络）。
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"           # scripts/aipay/mux
FX="$(mktemp -d /tmp/r18-fixture-XXXXXX)"
RUN=20261002-v5-run7                                # 复用已注册叙事集（R17）
trap 'rm -rf "$FX"' EXIT

# ── 夹具树 ─────────────────────────────────────────────
EV="$FX/runs/$RUN/evidence"; STEPS="$EV/screenshots/steps"; mkdir -p "$STEPS"
# state：标 1-11/17/20/21/25 步为 done（覆盖三类必采步型+载荷在位步）
cat > "$FX/runs/$RUN/state.env" <<'EOF'
run_started_at=1790930955
smoke_done=1790931000
appinit_done=1790931045
people_done=1790931052
g1_frozen=1790931069
room_analysis=1790931077
dispatch_marker=1790931077
register_done=1791103481
analysis_done=1791187375
triage_done=1791187537
anexec_done=1791189818
plan_done=1791201599
g5_ready=1791270612
uat_done=1791282865
ide_done=1791283665
EOF
# 中央仓最小 git（发布基线 rev-parse 兜底）
git init -q -b main "$FX/central/aipaydev"
( cd "$FX/central/aipaydev" && git -c user.email=t@t -c user.name=t commit -q --allow-empty -m base \
  && git update-ref refs/remotes/origin/main HEAD )
# 占位截图（内容互异防同 md5 假重复告警；生成器按存在性渲染 <img>）
for pair in "ui-08b-msgcard" "ui-25-ide" "ui-25-models" "25-op1-before" "25-op1-after"; do
  printf 'PNG-fixture-%s\n' "$pair" > "$STEPS/$pair.png"
done
# R18 载荷：步 9=对话全文+效果（真文含唯一标记）；步 25=操作序列双帧
cat > "$EV/r18-steps.json" <<'EOF'
{
  "_schema": 1,
  "steps": {
    "9": {
      "dialogs": [{
        "title": "fanfan 群内需求派发（夹具）",
        "room": "!fixture:matrix.test",
        "anchor": "$FIXANCHOR",
        "messages": [
          {"sender": "fanfan", "ts": "10-03 16:51", "body": "@Orchestrator 请基于需求文档启动系统分析，证据要求：代码提交号+任务卡号。R18-FIXTURE-DIALOG-BODY 全文第一行"},
          {"sender": "fanfan-agent", "ts": "10-03 16:52", "body": "已登记协作看板主任务 t_fixture9，分解中。R18-FIXTURE-DIALOG-BODY 全文第二行"}
        ]
      }],
      "effect": {"text": "主任务卡 t_fixture9 落 fanfan-pm-plan 板", "evidence": [{"label": "卡号", "anchor": "t_fixture9"}]}
    },
    "25": {
      "ops": [{
        "title": "任务右栏跳转 IDE 工作台（夹具）",
        "entry": "#/app/board → 卡右栏 ⌨IDE（登录身份 fanfan）",
        "frames": ["25-op1-before.png", "25-op1-after.png"],
        "note": "before=看板卡抽屉；after=IDE 画布+任务简报自动展开"
      }]
    }
  }
}
EOF

# ── ① 生成器渲染断言 ───────────────────────────────────
OUT_HTML="$EV/simulation-report.html"
AIPAY_SIM_ROOT="$FX" python3 "$HERE/mx-report-gen.py" --run "$RUN" >/dev/null
[ -s "$OUT_HTML" ] || { echo "FAIL 生成器未产出报告"; exit 1; }
check() { grep -qF "$2" "$OUT_HTML" || { echo "FAIL 缺少：$2"; exit 1; }; }
check t "class=\"st-r18\""                                   # R18 区块在位
check t "R18-FIXTURE-DIALOG-BODY 全文第一行"                  # 对话全文逐字（禁截首尾）
check t "R18-FIXTURE-DIALOG-BODY 全文第二行"
check t "\$FIXANCHOR"                                         # 锚点可反查
check t "25-op1-before.png"                                   # 前后帧渲染
check t "25-op1-after.png"
check t "操作入口：#/app/board → 卡右栏 ⌨IDE"                 # 操作入口复现路径
check t "主任务卡 t_fixture9 落 fanfan-pm-plan 板"            # 环节效果实证
check t "R18 载荷未采集"                                       # 空载荷步诚实缺席章
check t "R18 全量呈现覆盖"                                     # hero 覆盖率位
echo "PASS ①生成器：对话全文/前后帧/效果/诚实缺席/覆盖位 全渲染"

# ── ② 审计器查 8 断言 ───────────────────────────────────
AUD=$(AIPAY_SIM_ROOT="$FX" python3 "$HERE/mx-report-audit.py" --run "$RUN" 2>&1 || true)
must_fail() { echo "$AUD" | grep -qF "$1" || { echo "FAIL 审计应打回：$1"; echo "$AUD"; exit 1; }; }
must_fail "R18 步 11 缺「对话全文」"       # 对话必采步 done 且无载荷 → 打回
must_fail "R18 步 8 缺「操作前后帧」"      # 操作必采步
must_fail "R18 步 7 缺「环节效果」"        # 效果必采步
must_fail "R18 步 5 三位载荷全缺"          # 其余 done 步任一位在位即可（17/21 属对话必采集走上一类文案）
if echo "$AUD" | grep -qE "R18 步 (9|25) "; then
  echo "FAIL 审计误打回已采步 9/25"; echo "$AUD"; exit 1
fi
echo "PASS ②审计：必采矩阵打回缺失步、已采步（9/25）零误报"

# ── ③ 采集器合并/幂等断言 ───────────────────────────────
AIPAY_SIM_ROOT="$FX" python3 "$HERE/r18-collect.py" --run "$RUN" effect --step 24 \
  --text "G6 复盘收官（夹具补录）" --ev "治理报告=governance-report.md@fixture" >/dev/null
AIPAY_SIM_ROOT="$FX" python3 "$HERE/r18-collect.py" --run "$RUN" op --step 26 \
  --title "报告自证（夹具）" --entry "#/evidence" --frames 26-op1-before.png 26-op1-after.png >/dev/null
python3 - "$EV/r18-steps.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
assert d['steps']['24']['effect']['evidence'][0]['anchor'] == 'governance-report.md@fixture', 'effect 未合并'
assert len(d['steps']['26']['ops']) == 1, 'op 未合并'
assert d['steps']['9']['dialogs'][0]['anchor'] == '$FIXANCHOR', '既有载荷被改写'
print('PASS ③采集器：op/effect 合并、既有载荷不动')
PY

echo "== R18 配套能力端到端 全部通过 =="
