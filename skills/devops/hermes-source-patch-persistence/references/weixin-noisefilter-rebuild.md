# weixin noise-filter 重建：patch 重叠冲突 + 陈旧 patch 回归的完整处置

> 2026-09-03。`hermes-source-patch-persistence` 的实战补充案例。当 patch 重叠 /
> 陈旧 patch 自愈回归这两类坑同时命中时的处置流程。涉及文件均在 hermes-agent 仓。

## 背景

`gateway/platforms/weixin.py` 被两个 patch 覆盖：
- `~/.hermes/patches/hermes-weixin-local.patch` — voice-STT 云转写主路径（正常，已应用）
- `~/.hermes/profiles/_shared/decisions/weixin-adapter-noisefilter.patch` — noise-filter 防循环

问题：后者**捆绑了同一段 voice-STT 代码**（`_extract_text` 的 ITEM_VOICE 分支 +
`_collect_media` 的 silk 下载分支）。hermes-weixin-local 以**不同形式**落了这段 STT，
导致 noise-filter patch 永远 `git apply` 不上（watchdog 报"无法干净应用"）。
同时共享 util `gateway/noise_filter.py` 被 watchdog 的陈旧 module patch 重打过、
又被后续操作删掉，matrix adapter import 它 → 编译断裂。

## 诊断命令（先确认缺失性质）

```bash
cd ~/.hermes/hermes-agent

# 1. 标记在位吗？
grep -c "swarm:noise-filter" gateway/platforms/weixin.py     # 0 = 缺失

# 2. patch 为什么应用不上？（看 hunks 落在哪）
grep -n "^@@" ~/.hermes/profiles/_shared/decisions/weixin-adapter-noisefilter.patch

# 3. dry-run + 3way 都试，确认是真冲突不是路径问题
git apply --check  <patch>   # fail
git apply --3way   <patch>   # fail → 目标区域被另一 patch 重写

# 4. 找到是谁重写了目标区域
grep -l "gateway/platforms/weixin.py" ~/.hermes/patches/*.patch
```

## 处置：只补缺的那个 feature，不整 patch 重打

旧 patch 捆绑了 STT + noise-filter 两块，但 STT 已在位。**只把 noise-filter 两处插入**：

### 落点 A：helper 函数（在 `_coerce_bool` 之后、`_extract_text` 之前）

```python
# >>> swarm:noise-filter >>>
from gateway.noise_filter import noise_reason as _shared_noise_reason

def _weixin_noise_reason(body: str) -> Optional[str]:
    return _shared_noise_reason(
        body, "weixin",
        enable_decrypt=False,      # weixin 非 E2EE
        enable_sync_replay=False,  # weixin 轮询，无同步重放
        enable_stt_failure=True,   # 家庭语音 STT 失败占位符常见
        enable_recall=False,       # 撤回走系统事件
    )
# <<< swarm:noise-filter <<<
```

### 落点 B：inbound 拦截（在 `_process_message` 里 `if not text and not media_paths: return` 之后、`build_source` 之前）

```python
# >>> swarm:noise-filter >>>
if text:
    _noise = _weixin_noise_reason(text)
    if _noise:
        logger.debug("[%s] dropping %s noise from %s: %.40r",
                     self.name, _noise, sender_id, text)
        return
# <<< swarm:noise-filter <<<
```

落点必须在 DM/group 准入检查**之后**、`build_source` **之前**——先确定这条消息本会进入 agent，才值得花过滤。

## 验证：三层，缺一不可

```bash
# 1. 编译
python3 -m py_compile gateway/platforms/weixin.py

# 2. 行为探针（关键！patch/grep 测不出陈旧重打回归）
python3 -c "
import sys; sys.path.insert(0,'.')
from gateway.platforms.weixin import _weixin_noise_reason
# 高置信度噪声 → 拦
assert _weixin_noise_reason('heartbeat') == 'heartbeat_exact'
assert _weixin_noise_reason('???') == 'punctuation_only'
assert _weixin_noise_reason('k') == 'single_char_noise'
assert _weixin_noise_reason('[语音转文字失败]') == 'stt_failure'
# 正常中文短消息 → 放行（不过度拦截）
assert _weixin_noise_reason('好') is None
assert _weixin_noise_reason('在吗') is None
assert _weixin_noise_reason('your-child今天表现不错') is None
print('behavioral probe OK')
"

# 3. 平台测试套件零回归
./venv/bin/python -m pytest tests/gateway/test_weixin.py -q   # 34/34
```

**行为探针为何必须**：watchdog 曾对 `noise_filter.py` "成功"重打了一个陈旧 module
patch，把已被取代的逻辑复活。grep 标记在、patch-check 也过，但实际行为错了。
只有直接调函数断言输出才能暴露。

## 同步 patch 备份（让 watchdog 以后能干净重打）

旧 patch 名不副实且无法应用，备份为 `.bak-<date>-superseded`，用**只含 noise-filter
hunk** 的新 diff 替换。提取器见 `scripts/extract-noisefilter-patch.py`：

```bash
cd ~/.hermes/hermes-agent
git diff -U1 gateway/platforms/weixin.py > /tmp/weixin.diff   # -U1 减小 hunk 边界重叠
python3 scripts/extract-noisefilter-patch.py /tmp/weixin.diff "swarm:noise-filter" \
    > ~/.hermes/profiles/_shared/decisions/weixin-adapter-noisefilter.patch
# 验证：内容已在位 → reverse-check 必须过
git apply --reverse --check ~/.hermes/profiles/_shared/decisions/weixin-adapter-noisefilter.patch && echo OK
```

## 收尾

- 复跑 watchdog：`bash matrix_antiloop_drift_check.sh --verbose` → `✓ ... 标记均存在`，exit 0
- 若 watchdog 曾把陈旧 module patch 重打进 `gateway/noise_filter.py`，`git apply --reverse` 移除污染后**立即**用上面流程更新备份，否则下次 update 又重打。
- 16 个未 commit 的工作树改动靠 patch + post-merge hook 保护（既定架构），本次新增同理。

## witness（本次实测结论）

- weixin noise-filter 2 处插入后 `swarm:noise-filter` 标记 = 4（两处配对块）
- `noise_filter.py` 恢复 204 行，AST 通过
- watchdog 复跑 exit 0 静默
- weixin 套件 34/34 通过，零回归
