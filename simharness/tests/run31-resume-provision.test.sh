#!/bin/bash
# run31-resume-provision.test.sh — 断点闸前定位与 agent 快照内容面指纹守门
# 覆盖：run31 后段键齐但 G2/close/plan 缺位仍回 archgate；显式起点优先；docs-only
# 提交/脏态不换键不重灌；运行源码与补丁真实内容变化换键并重灌。
set -uo pipefail
export LC_ALL=C
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fails=0
ok() { echo "PASS $*"; }
bad() { echo "FAIL $*"; fails=1; }
expect_eq() { # <actual> <expected> <label>
  [[ "$1" == "$2" ]] && ok "$3" || bad "$3（实际=$1 期望=$2）"
}

T="$(mktemp -d)"
trap 'rm -rf "$T"' EXIT
STATE="$T/state.env"
source "$HERE/mux/mx-recovery-lib.sh"

write_complete_state() {
  cat > "$STATE" <<'EOF'
smoke_done=1
appinit_done=1794900000
people_done=1794900001
ba_dm_marker=$event-ba
g1_frozen=1794900002
room_analysis=!room:matrix.test
dispatch_marker=$event-dispatch
register_done=1
analysis_done=1
triage_done=1
anexec_done=1
review_done=1
g2_arch_pass=1794900003
close_done=1
plan_done=1
devimpl_done=1
g3_code_pass=1794900004
defect_done=1
testpass_done=1
g4_pass=1794900005
ready_done=1
g5_ready=1794900006
release_done=1
uat_done=1794900007
workmgr_done=1794900008
audit_done=1794900009
retro_done=1794900010
ide_done=1
report_done=1794900011
EOF
}
remove_keys() { # <key-regex>：保留其他键，构造断点事故形态
  grep -vE "^($1)=" "$STATE" > "$STATE.next" && mv "$STATE.next" "$STATE"
}
expect_resume() { # <expected> <label>
  expect_eq "$(mx_resume_start_step "$STATE")" "$1" "$2"
}

expect_eq "$(mx_resume_start_step "$T/not-created/state.env")" "smoke" "净环境 state.env 缺席=smoke"
: > "$STATE"
expect_resume smoke "空 state.env 不跳前段"
write_complete_state
remove_keys 'g2_arch_pass|close_done|plan_done'
expect_resume archgate "run31 后段键全齐但 G2/close/plan 缺位=archgate"
write_complete_state
remove_keys 'close_done'
expect_resume close "G2 已过而 close 缺位=close"
write_complete_state
remove_keys 'plan_done'
expect_resume plan "close 已过而 plan 缺位=plan"
write_complete_state
remove_keys 'devimpl_done|g3_code_pass'
expect_resume devimpl "plan 已过而开发/G3 缺位=devimpl"
write_complete_state
remove_keys 'testpass_done|g4_pass'
expect_resume testpass "测试/G4 缺位=testpass"
write_complete_state
remove_keys 'uat_done'
expect_resume uat "uat_done 与 uat_conditional 均缺=uat"
write_complete_state
remove_keys 'uat_done|workmgr_done'
printf 'uat_conditional=1794900007\n' >> "$STATE"
expect_resume workmgr "uat_conditional 是有效 UAT 终态"
write_complete_state
remove_keys 'g2_arch_pass'
printf 'g2_arch_pass=\n' >> "$STATE"
expect_resume archgate "空值 G2 键不算过闸"
write_complete_state
expect_resume report "全部关键键齐全=report（监督器按 report_done 自退）"

for f in "$HERE/mux/mx-run.sh" "$HERE/mux/run-driver-supervisor.sh"; do
  grep -q 'if \[\[ -z "\$START_STEP" \]\]' "$f" \
    && ok "$(basename "$f") 仅缺省计算起点，显式 --start-step 优先" \
    || bad "$(basename "$f") 缺省起点守卫缺失"
  if grep -q 'START_STEP="devimpl"' "$f"; then
    bad "$(basename "$f") 仍硬编码 devimpl 缺省"
  else
    ok "$(basename "$f") 无 devimpl 硬编码缺省"
  fi
done

# 提取真实供给函数与复制原语；不 source 全库，避免测试创建运行目录或挂全局 trap。
for fn in _mx_provenance mx_agent_source_content_fp mx_agent_patch_content_fp mx_agent_provision_key mx_provision_agent_src; do
  FN="$(sed -n "/^${fn}()/,/^}/p" "$HERE/mux/mx-lib.sh")"
  [[ -n "$FN" ]] || { echo "FAIL 提取 $fn 失败"; exit 1; }
  eval "$FN"
done
FN="$(sed -n '/^mxp_copy_git_tracked()/,/^}/p' "$HERE/mux/mx-platform.sh")"
[[ -n "$FN" ]] || { echo "FAIL 提取 mxp_copy_git_tracked 失败"; exit 1; }
eval "$FN"
mxp_is_gbash() { return 1; }
log() { printf '[provision-test] %s\n' "$*"; }
fail() { printf 'provision-fail: %s\n' "$*" >&2; return 1; }

HOST="$T/host"
HERMES_AGENT_SRC_FROM="$HOST"
PATCH_DIR="$T/patches"
SIM_ROOT="$T/sim"
AGENT_SRC="$SIM_ROOT/hermes-agent-src"
HARNESS_ROOT="$T/harness"
HOME="$T/home"
mkdir -p "$HOST"/{agent,gateway,hermes_cli,tools,plugins,docs} "$PATCH_DIR" "$HARNESS_ROOT" \
  "$HOME/.hermes/hermes-agent/.venv/bin"
printf 'agent = 1\n' > "$HOST/agent/core.py"
printf 'gateway = 1\n' > "$HOST/gateway/run.py"
printf 'cli = 1\n' > "$HOST/hermes_cli/main.py"
printf 'tool = 1\n' > "$HOST/tools/probe.py"
printf 'plugin = 1\n' > "$HOST/plugins/base.py"
printf 'docs v1\n' > "$HOST/docs/README.md"
printf '001-demo.patch\n' > "$PATCH_DIR/series"
printf 'diff --git a/gateway/run.py b/gateway/run.py\n' > "$PATCH_DIR/001-demo.patch"
git -C "$HOST" init -q -b main
git -C "$HOST" add -A
git -C "$HOST" -c user.name=run31-test -c user.email=run31@test commit -qm 'base'
cat > "$HOME/.hermes/hermes-agent/.venv/bin/python" <<'EOF'
#!/bin/sh
# 仅供 venv 候选依赖探针返回成功；测试不执行生成的 wrapper。
exit 0
EOF
chmod +x "$HOME/.hermes/hermes-agent/.venv/bin/python"

if mx_provision_agent_src && [[ -d "$AGENT_SRC/gateway" && -x "$SIM_ROOT/bin/hermes-sim" ]]; then
  ok "初始 agent 快照供给成功"
else
  bad "初始 agent 快照供给失败"
fi
KEY1="$(mx_agent_provision_key "$HOST" "$PATCH_DIR")"
printf 'keep patched files\n' > "$AGENT_SRC/reprovision-sentinel"
printf 'docs v2 committed\n' >> "$HOST/docs/README.md"
git -C "$HOST" add docs/README.md
git -C "$HOST" -c user.name=run31-test -c user.email=run31@test commit -qm 'docs only'
KEY2="$(mx_agent_provision_key "$HOST" "$PATCH_DIR")"
expect_eq "$KEY2" "$KEY1" "docs-only 提交不换快照键"
if mx_provision_agent_src && [[ -f "$AGENT_SRC/reprovision-sentinel" ]]; then
  ok "docs-only 提交不触发重灌（补丁哨兵保留）"
else
  bad "docs-only 提交触发重灌或供给失败"
fi
printf 'docs dirty only\n' >> "$HOST/docs/README.md"
expect_eq "$(mx_agent_provision_key "$HOST" "$PATCH_DIR")" "$KEY1" "docs-only 工作树脏态不换键"
if mx_provision_agent_src && [[ -f "$AGENT_SRC/reprovision-sentinel" ]]; then
  ok "docs-only 脏态不触发重灌"
else
  bad "docs-only 脏态触发重灌或供给失败"
fi

printf 'gateway = 2  # runtime semantic change\n' >> "$HOST/gateway/run.py"
KEY3="$(mx_agent_provision_key "$HOST" "$PATCH_DIR")"
[[ "$KEY3" != "$KEY2" ]] && ok "gateway 工作态内容变化换键" || bad "gateway 内容变化未换键"
if mx_provision_agent_src && [[ ! -e "$AGENT_SRC/reprovision-sentinel" ]] \
    && grep -q 'runtime semantic change' "$AGENT_SRC/gateway/run.py"; then
  ok "gateway 内容变化真实重灌并带入新内容"
else
  bad "gateway 内容变化未正确重灌"
fi

printf 'patch sentinel\n' > "$AGENT_SRC/patch-reprovision-sentinel"
printf '# patch byte change\n' >> "$PATCH_DIR/001-demo.patch"
KEY4="$(mx_agent_provision_key "$HOST" "$PATCH_DIR")"
[[ "$KEY4" != "$KEY3" ]] && ok "补丁字节变化换键" || bad "补丁字节变化未换键"
if mx_provision_agent_src && [[ ! -e "$AGENT_SRC/patch-reprovision-sentinel" ]]; then
  ok "补丁字节变化真实重灌"
else
  bad "补丁字节变化未触发重灌"
fi
printf '# series order/metadata change\n' >> "$PATCH_DIR/series"
[[ "$(mx_agent_provision_key "$HOST" "$PATCH_DIR")" != "$KEY4" ]] \
  && ok "series 内容变化换键" || bad "series 内容变化未换键"

for f in "$HERE/mux/mx-recovery-lib.sh" "$HERE/mux/mx-run.sh" \
  "$HERE/mux/run-driver-supervisor.sh" "$HERE/mux/mx-lib.sh" "$HERE/tests/run31-resume-provision.test.sh"; do
  bash -n "$f" && ok "bash -n $(basename "$f")" || bad "$(basename "$f") 语法错"
done

if (( fails == 0 )); then echo "ALL-PASS"; else echo "HAS-FAIL"; exit 1; fi
