#!/usr/bin/env bash
# codex.sh — Codex 适配器：项目级 <proj>/AGENTS.md；用户级 ~/.codex/AGENTS.md（标记区块包裹）
# TA_TIER=cli（目录复制 + --render-tools 规则派生）
# 依据（访问 2026-07-20）：https://gist.github.com/hungson175/76131bb8434f9d58ee7b2f08c3242624
#   AGENTS.md 是 Codex 原生标准（项目内 root→cwd 级联拼接），纯 markdown 无 frontmatter。
render_tool_codex() {  # <skill_dir> <proj> <level>
  local dest
  if [[ "$3" == "user" ]]; then dest="$HOME/.codex/AGENTS.md"; else dest="$2/AGENTS.md"; fi
  if ! ta_upsert_marker_block "$dest" "codex" "$TA_SKILL_NAME" "$TA_BODY"; then
    return 1
  fi
  # R118 ⑧：user 级不写项目 hooks；用 if 块并显式 return 0——旧写法
  # `[[ "$3" != "user" ]] && render_tool_codex_hooks ...` 在 user 级末条返回 1，
  # 调用方（ta_render_tools）把它当成“渲染失败”误报。
  if [[ "$3" != "user" ]]; then
    render_tool_codex_hooks "$1" "$2" || return 1
  fi
  return 0
}

# Codex v0.148 hooks 注册——生成目标技能的预检门禁接 Codex 官方强制点。
# PreToolUse Bash → fail-gate-hook（exit 2=deny，stderr 原因透传给模型）；PostToolUse → failure-detector。
# 配置位置：项目级 <proj>/.codex/hooks.json（hooks/src/engine/discovery.rs 的 config layer 探测点）。
# 铁律（audit-2026-08-25）：PreToolUse 命令禁止 `|| true` / `2>/dev/null`——|| true 把 exit 2 吞成 0、
# stderr 重定向丢弃透传原因，deny 协议将整体静默失效；PostToolUse 为 advisory 可 fail-open（|| true）但须保留 stderr。
# 回归发现 #23（2026-08-27，两宿主整合）：原扁平 {"matcher","command","timeout"} 不符 Codex 真实
# schema（config/src/hook_config.rs MatcherGroup）——matcher 组的执行体是 hooks 数组、元素为
# tag 判别 {"type":"command","command":...}。扁平 command 字段被 serde 静默丢弃、hooks 空数组
# → 注册了 matcher 却零 handler，Codex 门禁 hook 完全惰性。改为嵌套 schema（对 research/codex
# 源码逐字段核验：matcher/hooks[].type=command/command/timeout）。
# 回归发现#24（同轮）：命令原用相对路径 scripts/...，但 wrapper 部署在 skill 目录、项目根无
# scripts/——注册未部署，运行必 No such file。改绝对路径（与 AGENTS.md 体内 bash "<skill>/...
# 绝对引用同款）；另：旧版扁平 hooks.json 已存在时升级重写（检测缺 "type": "command" 即旧形态）。
# R118 ⑥⑨：与 ta_merge_json_hook 同范式——用户 hooks.json 解析失败或结构异常时 fail-closed
# （打印原因、跳过、不写回）；合法 JSON 按“本技能绝对路径”合并，保留其他事件/用户条目，
# 同项目多技能各自登记（旧实现只要文件里出现 "type": "command" 就整体跳过，第二个技能永远不生效）。
render_tool_codex_hooks() {  # <skill_dir> <proj>
  local skill_dir="$1" hdir="$2/.codex" hfile="$2/.codex/hooks.json" tmp
  # R126：hooks 脚本路径按实际布局探测（scripts/ 或 assets/hooks/）——生成器自身布局
  # 硬编码 scripts/ 会渲染出死命令。两脚本缺一即整组跳过并如实披露。
  local _gw _fd
  _gw="$(ta_hook_path "$skill_dir" codex-gate-wrapper.sh)"
  _fd="$(ta_hook_path "$skill_dir" failure-detector.sh)"
  if [[ -z "$_gw" || -z "$_fd" ]]; then
    echo "  ⚠ Codex hooks 未渲染：$skill_dir 缺 codex-gate-wrapper.sh/failure-detector.sh（scripts/ 与 assets/hooks/ 均无）——如实披露，不写死命令"
    return 0
  fi
  mkdir -p "$hdir"
  if command -v python3 >/dev/null 2>&1; then
    if ! python3 - "$hfile" "$skill_dir" "$_gw" "$_fd" <<'PYEOF'
import json, os, sys
dest, skill, gw, fd = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
pre_id = gw
post_id = fd
spec = {
    'PreToolUse': {'id': pre_id, 'handler': {
        'type': 'command',
        'command': 'bash "%s"' % gw,
        'timeout': 5}},
    'PostToolUse': {'id': post_id, 'handler': {
        'type': 'command',
        'command': 'bash "%s" || true' % fd,
        'timeout': 5}},
}

def fail(msg):
    sys.stderr.write('  ✗ %s: %s——已跳过，未写回\n' % (dest, msg))
    sys.exit(3)

def dump(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)

d = {}
if os.path.exists(dest):
    try:
        raw = open(dest, encoding='utf-8').read()
        d = json.loads(raw) if raw.strip() else {}
    except Exception as e:
        fail('用户 hooks JSON 解析失败（%s）' % e)
if not isinstance(d, dict):
    fail('用户 hooks JSON 顶层不是对象')
hooks = d.get('hooks')
if hooks is None:
    hooks = {}
    d['hooks'] = hooks
if not isinstance(hooks, dict):
    fail('hooks 字段不是对象（用户配置结构异常）')

changed = False
for event, s in spec.items():
    groups = hooks.get(event, [])
    if not isinstance(groups, list):
        fail('%s 事件不是数组（用户配置结构异常）' % event)
    kept = []
    for g in groups:
        if isinstance(g, dict) and isinstance(g.get('hooks'), list):
            kept.append(g)
        else:
            changed = True   # 旧扁平 schema（matcher/command 平级）对 Codex 是惰性死配置，升级丢弃
    target = None
    for g in kept:
        for h in g['hooks']:
            if isinstance(h, dict) and s['id'] in dump(h):
                target = g
                break
        if target is not None:
            break
    if target is None:
        group = None
        for g in kept:
            if g.get('matcher') == 'Bash':
                group = g
                break
        if group is None:
            group = {'matcher': 'Bash', 'hooks': []}
            kept.append(group)
        group['hooks'].append(dict(s['handler']))
        changed = True
    else:
        new_hooks, seen = [], False
        for h in target['hooks']:
            if isinstance(h, dict) and s['id'] in dump(h):
                if seen:
                    changed = True   # 同技能重复条目，收敛为一条
                    continue
                seen = True
                if dump(h) != dump(s['handler']):
                    new_hooks.append(dict(s['handler']))
                    changed = True
                else:
                    new_hooks.append(h)
            else:
                new_hooks.append(h)
        target['hooks'] = new_hooks
    hooks[event] = kept

if not changed:
    print('  · %s: Codex hooks 已含本技能条目（幂等，未改动）' % dest)
    sys.exit(0)

tmp = dest + '.swarm-tmp'
os.makedirs(os.path.dirname(dest) or '.', exist_ok=True)
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
os.replace(tmp, dest)
print('  ✓ %s: Codex hooks 已合并（PreToolUse/PostToolUse）' % dest)
PYEOF
    then
      echo "  ✗ ${hfile} Codex hooks 合并失败（fail-closed，未写回）" >&2
      return 1
    fi
    return 0
  fi
  # 无 python3 的降级路径：只有文件不存在/为空、或可识别的旧扁平 schema 才写；
  # 其余（可能是用户自己的嵌套配置）一律 fail-closed，避免覆盖用户配置。
  if [[ -s "$hfile" ]] && ! { grep -q '"matcher"' "$hfile" 2>/dev/null && ! grep -q '"type": *"command"' "$hfile" 2>/dev/null; }; then
    echo "  ⚠ 缺 python3，无法安全合并既有 ${hfile}（保留用户配置，未改动）——请安装 python3 后重跑，或手工把 Codex hook 加入该文件" >&2
    return 1
  fi
  tmp="$(mktemp "${TMPDIR:-/tmp}/rtcodexh.XXXXXX")" || return 1
  cat > "$tmp" <<HJEOF
{
  "hooks": {
    "PreToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash ${_gw}", "timeout": 5}]}
    ],
    "PostToolUse": [
      {"matcher": "Bash", "hooks": [{"type": "command", "command": "bash ${_fd} || true", "timeout": 5}]}
    ]
  }
}
HJEOF
  mv -f "$tmp" "$hfile"
}

# R128 卸载对偶（--uninstall）：移除 AGENTS.md 标记块 + 剔 .codex/hooks.json 本技能条目。
# Codex 的 hooks 是 matcher 组嵌套形（组内 hooks 数组才是条目层）——不能整组删（组可能
# 还承载其他技能/用户条目），须组内逐条剔（按 wrapper/detector 绝对路径判别），组剔空才
# 删组、事件剔空才删事件键；其他事件/用户条目原样保留；解析失败 fail-closed 不写回。
# 判别键回退：技能目录已消失时 ta_hook_path 探测不到，回退 scripts/ 布局路径 + 目录前缀。
unrender_tool_codex() {  # <skill_dir> <proj> <level>
  local dest rc=0
  if [[ "$3" == "user" ]]; then dest="$HOME/.codex/AGENTS.md"; else dest="$2/AGENTS.md"; fi
  ta_remove_marker_block "$dest" "codex" "$TA_SKILL_NAME" || rc=1
  unrender_tool_codex_hooks "$1" "$2" || rc=1
  return $rc
}

unrender_tool_codex_hooks() {  # <skill_dir> <proj>
  local skill_dir="$1" hfile="$2/.codex/hooks.json"
  if [[ ! -f "$hfile" ]]; then
    echo "  · ${hfile} 不存在——Codex hooks 已不在（幂等）"
    return 0
  fi
  local _gw _fd
  _gw="$(ta_hook_path "$skill_dir" codex-gate-wrapper.sh)"
  _fd="$(ta_hook_path "$skill_dir" failure-detector.sh)"
  [[ -z "$_gw" ]] && _gw="$skill_dir/scripts/codex-gate-wrapper.sh"
  [[ -z "$_fd" ]] && _fd="$skill_dir/scripts/failure-detector.sh"
  if ! command -v python3 >/dev/null 2>&1; then
    echo "  ⚠ 缺 python3，${hfile} 条目未移除（手工：从 PreToolUse/PostToolUse 各组 hooks 数组删除含 ${_gw} / ${_fd} 的条目）"
    return 0
  fi
  if ! python3 - "$hfile" "$_gw" "$_fd" "$skill_dir" <<'PYEOF'
import json, os, sys
dest, gw, fd, skill = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
ids = [gw, fd, skill]
def fail(msg):
    sys.stderr.write('  ✗ %s: %s——已跳过，未写回\n' % (dest, msg))
    sys.exit(3)
def dump(x):
    return json.dumps(x, ensure_ascii=False, sort_keys=True)
def hit(x):
    return any(i in dump(x) for i in ids)
try:
    d = json.load(open(dest, encoding='utf-8'))
except Exception as e:
    fail('用户 hooks JSON 解析失败（%s）' % e)
if not isinstance(d, dict):
    fail('用户 hooks JSON 顶层不是对象')
hooks = d.get('hooks')
if not isinstance(hooks, dict):
    print('  · %s: 无 hooks 键（幂等，未改动）' % dest)
    sys.exit(0)
changed = False
for event in list(hooks.keys()):
    groups = hooks[event]
    if not isinstance(groups, list):
        fail('%s 事件不是数组（用户配置结构异常）' % event)
    kept_groups = []
    for g in groups:
        if not isinstance(g, dict):
            kept_groups.append(g)
            continue
        inner = g.get('hooks')
        if not isinstance(inner, list):
            kept_groups.append(g)
            continue
        kept_inner = [h for h in inner if not (isinstance(h, dict) and hit(h))]
        if len(kept_inner) != len(inner):
            changed = True
            if kept_inner:
                g['hooks'] = kept_inner
                kept_groups.append(g)
            # 组剔空则整组删（组只是 matcher 容器，非用户内容）
        else:
            kept_groups.append(g)
    if kept_groups:
        hooks[event] = kept_groups
    else:
        del hooks[event]
        changed = True
if not hooks:
    del d['hooks']
if not changed:
    print('  · %s: Codex hooks 无本技能条目（幂等，未改动）' % dest)
    sys.exit(0)
tmp = dest + '.swarm-tmp'
with open(tmp, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)
    f.write('\n')
os.replace(tmp, dest)
print('  ✓ %s: Codex hooks 本技能条目已移除（PreToolUse/PostToolUse）' % dest)
PYEOF
  then
    echo "  ✗ ${hfile} Codex hooks 移除失败（fail-closed，未写回）" >&2
    return 1
  fi
  return 0
}
