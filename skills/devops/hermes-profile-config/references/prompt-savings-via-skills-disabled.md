# 节省 System Prompt Tokens: skills.disabled Path

**适用**: 任何想压缩 Hermes agent `<available_skills>` index 体积的人。
**实测收益**: orchestrator profile — skills index **26.8KB → 2.8KB**（-90%）、
完整 system prompt **72.8KB → 48.8KB**（-24KB）、**节省 ~6,000 tokens/每次 prompt**、
skill 数量 **270 → 22**。

## When to Use

- 你做了 `hermes prompt-size` 看到 skills index 占 system prompt 30%+
  （orchestrator 当前是 26.8KB / 72.8KB = 37%）。
- profile 下大量 skill 长期不用（state.db `messages` 表 LIKE
  `'%skill_view%'` 几乎全部 NULL）。
- 想给"未用 skill"加保护机制，而不是直接删除。

## Core Mechanism

`config.yaml` 有两层全局配置：

| 配置 | 作用范围 | 优先级 | 适用场景 |
|------|----------|--------|----------|
| `skills.disabled` | 全局禁用 | 高 | 大批未用 skill |
| `skills.platform_disabled.<platform>` | 按平台禁用 | 低 | 仅某平台不用 |

`get_disabled_skill_names()`（在 `agent/skill_utils.py` 行 437）返回
`global_disabled ∪ platform_disabled`。被禁用 skill **完全从 index 移除** —
不是 hidden，是不渲染。

## Root Cause Traps（必须先看清再做）

### Trap 1: 配置层级（profile-level > global）

`_load_raw_config()` 用 `get_config_path()`，而 `get_config_path()` 返回的是
**当前 active profile** 的 `config.yaml`，**不是** `~/.hermes/config.yaml`。

```bash
# 验证当前 active profile 用的是哪个文件
python3 -c "
import sys; sys.path.insert(0, '$HOME/.hermes/hermes-agent')
from hermes_constants import get_config_path
print(get_config_path())
"
# 输出: $HOME/.hermes/profiles/orchestrator/config.yaml
#       (不是 $HOME/.hermes/config.yaml)
```

**教训**: 写 `skills.disabled` 必须写到 `~/.hermes/profiles/<active>/config.yaml`，
写到 `~/.hermes/config.yaml` 完全无效。

### Trap 2: yaml 字面 `\n` 不是真换行

Python 字符串里用 `'\n\n# skills:\n  disabled:\n    - name\n'` 想拼出多行
yaml — 全部被 yaml_load 解析为**前一个 key 的 string value**，看起来像
"加上了"，但实际 `parsed['skills']` 还是不存在。

**正确做法**: 用 `yaml.dump` 重写整个文件，永远不要手工拼 yaml 字符串。

### Trap 3: Disk snapshot 缓存

`build_skills_system_prompt` 有两层 cache：

| 层 | Key | 失效条件 |
|----|-----|----------|
| In-memory LRU | `(skills_dir, tools, disabled, ...)` tuple | 进程退出 |
| Disk snapshot | `~/.hermes/profiles/<profile>/.skills_prompt_snapshot.json` + manifest | 文件 mtime/size 变化 |

**实测**: 改完 config.yaml 后跑 `hermes prompt-size`，**如果 skills 数量没变**，
第一件事是 `rm .skills_prompt_snapshot.json`（manifest 可能在 mtime 缓存窗口
内没感知）。

### Trap 4: snapshot manifest 是 mtime+size，不是内容哈希

`_load_skills_snapshot`（`agent/prompt_builder.py` 行 1594）校验：
```python
if snapshot.get("manifest") != _build_skills_manifest(skills_dir):
    return None
```

manifest 是 `dict[str, list[int]]`（path → [size, mtime]）。**改 config.yaml
不会触发 manifest 变化** — 只有 SKILL.md 文件本身改了才触发。

→ 改完 disabled 列表后必须手动删 snapshot，或者修改一个 SKILL.md 的 mtime。

## Workflow（已验证 2026-08-19）

### Step 1: 备份 + 确认 active profile

```bash
# 备份 active profile 的 config.yaml
cp ~/.hermes/profiles/orchestrator/config.yaml \
   ~/.hermes/profiles/orchestrator/config.yaml.bak-$(date +%Y%m%d_%H%M%S)
```

### Step 2: 收集 "用过 vs 未用" skill 集合

不要靠直觉 — 用 `hermes prompt-size` + state.db 实测：

```python
import json, subprocess, re

# 1) 当前 index 里所有 skill name
r = subprocess.run(['hermes', 'prompt-size', '--json'], capture_output=True, text=True, timeout=30)
data = json.loads(r.stdout)
all_skills = sorted({s['name'] for s in data.get('skills_breakdown', [])})

# 2) state.db 里真实出现过的 skill（tool calls LIKE '%skill_view%' 的 name）
db_path = '$HOME/.hermes/profiles/orchestrator/state.db'
# SQLite schema: messages 表, tool_calls 字段是 JSON list
# SELECT DISTINCT name WHERE tool_calls LIKE '%skill_view%'
# （用 sqlite3 直查，pattern 是 skill name 紧跟 'skill_view('）

# 3) 已知 "orchestrator 主动用" 的 skill（祖训 / 配置 / cron / 系统治理）
used_known = {
    'hermes-agent', 'hermes-gateway-operations', 'hermes-profile-config',
    'harness-entropy-management', 'open-source-skill-fusion',
    'skill-library-maintenance', 'skill-self-evolution-fusion',
    'prompt-as-model-adapter', 'real-browser-antibot-bypass',
    'wechat-article-research', 'weixin-multi-account-delivery',
    'wechat-article-extractor', 'computer-use',
    'cognition-lattice', 'cognition-self-check', 'scope-discipline',
    'personal-life-workbench', 'worldmonitor-intel',
    'report-data-verification',
    'web-research-fetching', 'web-search-antibot-research',
    'github-profile-distribution', '[已移除]-context-profile-enrichment',
    'mom-feedback-coaching-generation', 'pentest-methodology-fusion',
    'pua-harness-governance', 'pua-methodology-router', 'pua-pressure-engine',
    'security-tool-github-research', 'open-source-architecture-research',
    'agent-harness-best-practices', 'deep-research-workflow',
    'markdown-viewer', 'powerpoint', 'xlsx', 'scikit-learn',
    # ↑ orchestrator 当前实战的 36 个（22 core + 14 偶尔 load）
}

unused = [s for s in all_skills if s not in used_known]
print(f'total: {len(all_skills)}, used: {len(used_known)}, unused: {len(unused)}')
```

**安全边界**: `used_known` 宁可保守 — 用过的扔进 disabled 不致命（agent
会改用 `skills_list` 重新发现），未用却放进 `used_known` 反而浪费 token。

### Step 3: 用 yaml 库正确写 skills.disabled

```python
import yaml

class _NoAliasDumper(yaml.SafeDumper):
    def ignore_aliases(self, data):
        return True

config_path = '$HOME/.hermes/profiles/orchestrator/config.yaml'

# 1) 用 PyYAML 读（不是 hermes 内部的 yaml_load — 它们行为不一致）
parsed = yaml.safe_load(open(config_path))

# 2) 设置 skills.disabled
parsed.setdefault('skills', {})
parsed['skills']['disabled'] = unused

# 3) yaml.dump 写回（保持 key 顺序 + Unicode）
new_content = yaml.dump(
    parsed, Dumper=_NoAliasDumper,
    default_flow_style=False, allow_unicode=True, sort_keys=False,
)
open(config_path, 'w').write(new_content)
```

### Step 4: 清 disk snapshot（强制重扫）

```bash
rm ~/.hermes/profiles/orchestrator/.skills_prompt_snapshot.json
```

### Step 5: 验证

```bash
hermes prompt-size --json | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'skills_index: {d[\"skills_index\"][\"bytes\"]}B')
print(f'system_prompt: {d[\"system_prompt\"][\"bytes\"]}B')
print(f'skill count: {len(d[\"skills_breakdown\"])}')
"
```

**期望**: skills_index 减少 80%+，system_prompt 减少 20%+，skill count 减少 80%+。

### Step 6: Smoke test — profile list + 一次对话

```bash
# 1) 27 profile 全部能加载（防止 yaml 写错）
for p in ~/.hermes/profiles/*/; do
  python3 -c "
import yaml
c = yaml.safe_load(open('${p}config.yaml'))
print('${p}', 'ok' if isinstance(c, dict) else 'BROKEN')
" 2>&1 | head -1
done

# 2) 跑一次 hermes chat 确认 system prompt 正常
hermes chat -q "Say 'ok' to confirm system prompt is healthy" -p orchestrator
```

## Revert

```bash
# 1) 回滚 config.yaml
cp ~/.hermes/profiles/orchestrator/config.yaml.bak-<TS> \
   ~/.hermes/profiles/orchestrator/config.yaml

# 2) 删 disk snapshot（下次 prompt 时重扫 + 重建）
rm ~/.hermes/profiles/orchestrator/.skills_prompt_snapshot.json

# 3) 验证恢复
hermes prompt-size --json
# skills_index 应该回到 26.8KB 附近
```

## 实测数字（orchestrator profile，2026-08-19）

| 指标 | Before | After | 节省 |
|------|--------|-------|------|
| skills index | 26,784 B | 2,802 B | **-23,982 B（-89.5%）** |
| 完整 system prompt | 72,764 B | 48,782 B | **-23,982 B（-33%）** |
| Skill 数量 | 270 | 22 | -248 |
| 每次 prompt 节省 tokens | — | — | **~5,995 tokens** |

## Pitfalls（决策前必须读）

### ⚠️ 这是不可逆/部分可逆操作

**不可逆部分**: 删除的 248 个 skill **仍占磁盘**（1.4MB SKILL.md）。
**可逆部分**: 删除 `skills.disabled` 段后立即恢复（成本：1 次 disk snapshot
rebuild）。

**祖训红线**:
- 必须先备份（`.bak-<TS>`）
- 必须 smoke test（27 profile 加载 + 1 次 chat）
- "不可逆操作必须先有共识才动手" — 即便"只动 config.yaml"也属于这层

### ⚠️ 改完 config 后 hermes 没重读 — 必须删 snapshot

如果 `hermes prompt-size` 显示 skills 数量没变：
1. 确认改了**正确的文件**（active profile 不是全局）
2. 删 `.skills_prompt_snapshot.json`
3. 跑 `python3 -c "from agent.skill_utils import _load_raw_config, _RAW_CONFIG_CACHE; _RAW_CONFIG_CACHE.clear(); print(_load_raw_config().get('skills', {}).get('disabled', [])[:3])"` 验证 disabled 真读到了

### ⚠️ Used-known 边界

`state.db` 里出现过的 skill 不等于"必须保留"。有些 skill 只是被
`skills_list`/`skill_view` 一次性引用过（比如别人查询时）。判断优先级：

1. **祖训常驻**：coding/SOUL 红线提到的 → 必保留
2. **持久 config/cron 引用**：environment_hint / generate-configs / 个人 cron
3. **state.db LIKE 'skill_view%'**：参考但不绝对
4. **没有上述任何一项** → 默认归入 unused

### ⚠️ 不要尝试物理删除 skill 目录

祖训**明确禁止**走 `rm -rf` 删 248 个 skill 目录：
- 1.4MB 磁盘节省 vs. 24KB token 节省 — 不值
- 删除后无法用 `skills_list` 重新发现（除非 `hermes skills install`）
- 不可逆

**唯一例外**: 已知废弃的、GitHub distribution repo 也删了的、且明确不会再用。

## 不应做（明确禁止）

- ❌ 把 `skills.disabled` 加到 `~/.hermes/config.yaml`（profile-level 优先，完全无效）
- ❌ 用字符串拼接 + `sed -i 's/.../.../'` 改 yaml（破坏引号/缩进/转义）
- ❌ 不删 snapshot 就跑 hermes prompt-size 验证（看不到效果会以为配置错）
- ❌ 把"祖训常驻 skill"（hermes-agent / hermes-gateway-operations / cognition-lattice
  等）放进 unused 列表 — 那是 orchestrator 行为的根基
- ❌ 跨 profile 共享 disabled 列表 — 每个 profile 的 skill 使用模式不同

## See Also

- `references/context-length-resolution.md` — config override 优先序，与本路径同
  源（config → runtime 行为）
- `references/orchestrator-write-guard-detail.md` — active profile config 是
  write-guarded 的，需绕道 `hermes config set` 或 Python file I/O（实际
  yaml.dump 重写更稳）
