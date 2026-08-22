# context_length 解析链与 cc-switch Anthropic 格式探测盲区

> 2026-08-16 实测会话存档。症状：TUI 状态栏显示 `151.6k/202.8k 75%`，用户配置
> 的是 1M（1048576）。用户质疑"cc-switch 声明了 1M，为什么不直接读"——
> 质疑正确，是 Hermes 侧探测格式不匹配 + 配置层级写错双重原因。

## 1. 状态栏数字的真实来源

- `appChrome.tsx` StatusRule: `ctxLabel = fmtK(context_used)/fmtK(context_max)`，`pct = usage.context_percent`
- `tui_gateway/server.py:5267`: `context_percent = round(last_prompt / ctx_max * 100)`
- `ctx_max` = `context_compressor.context_length` = 启动时 `get_model_context_length()` 的解析结果
- `fmtK(202752)` = "202.8k"（Intl.NumberFormat compact，4 位有效）——**202.8k 不是任意数，是 model_metadata.py:511 的 `"glm": 202752`**

自洽验证：151.6/202.8 = 74.8% ≈ 75%。数字计算无误，错在 ctx_max。

## 2. get_model_context_length 完整解析顺序（源码 docstring + 实测）

```
0.  config 显式 override（model.context_length 或 custom_providers per-model）
0b. model_overrides（per-provider+model context_window）
0c. endpoint-scoped metadata（multiplex 端点验证过的）
1.  持久缓存 ~/.hermes/context_length_cache.yaml
2.  活动端点 /models 元数据探测
...
8.  硬编码 family 表（model_metadata.py:495+，longest-key-first 子串匹配）
9.  默认 256K
```

关键实测（真实调用，非推断）：

```python
from hermes_cli.config import get_custom_provider_context_length
# 条目级写法（- name: cc-switch + context_length: 1048576）
get_custom_provider_context_length('glm-5.3', 'http://127.0.0.1:15721', cps)  # → None
# 模型级写法（models.glm-5.3.context_length: 1048576）→ 1048576
```

`get_custom_provider_context_length`（config.py:1757）只读
`custom_providers[i].models[model].context_length`——条目级值零读取者。

## 3. 硬编码表陷阱：新 slug 落到通用键

```python
# model_metadata.py:507-511
"glm-5.2": 1_048_576,   # 只有 5.2 有 1M 条目
"glm": 202752,           # glm-5.3 不含 "glm-5.2" 子串 → 落到这里
```

新模型上线（glm-5.3、未来的 5.4）在表更新前全部落到家族通用键。经本地代理
（无法探测）时尤其如此。

## 4. cc-switch 确实声明了 1M —— 两层探测盲区

用户质疑成立。cc-switch `/v1/models` 实测返回（Anthropic 格式）：

```json
{"models": [{"slug": "glm-5.3", "display_name": "GLM-5.3",
  "context_window": 1000000, "max_context_window": 1000000,
  "effective_context_window_percent": 95}]}
```

Hermes 探测不到的机械原因：

| 层 | 断点 | 位置 |
|----|------|------|
| 响应数组 | Hermes 解析 `payload["data"]`（OpenAI），cc-switch 返回 `payload["models"]`（Anthropic） | model_metadata.py:1338 |
| 字段名 | Anthropic 用 `slug`/`context_window`，Hermes 取 `id`（`context_window` 在 `_CONTEXT_LENGTH_KEYS` 里能匹配，但进不到那一步） | :636, :640 |

实测复现：

```python
fetch_endpoint_model_metadata('http://127.0.0.1:15721', api_key='PROXY_MANAGED')  # → {}
_resolve_endpoint_context_length('glm-5.3', 'http://127.0.0.1:15721')             # → None
```

根因：cc-switch 是 `api_mode: anthropic_messages` 代理，Hermes 的端点探测
是按 OpenAI-compat `/v1/models` 写的。

## 5. 为什么"写死 per-model override"仍是当下正解

即使修了探测格式，还有三个残留问题：

1. **持久缓存冻结**：step-1 缓存探测结果到 yaml，cc-switch failover 切上游后
   不重探就沿用旧值
2. **failover 是常态**：cc-switch 的核心用法就是上游切换，今天 1M 明天 200K，
   `/v1/models` 声明跟着变，缓存语义与之冲突
3. **`effective_context_window_percent: 95`** 语义（可用窗口 95%）Hermes 不处理

→ 配置 override（优先级 0）是唯一确定性的路径。代价：上游真实窗口变了需手工改。

## 6. 诊断 recipe（下次遇到状态栏百分比异常）

```bash
# ① 数字自洽性：used/max ≈ pct？
# ② max 是哪个解析结果：202.8k=硬编码glm / 1.0m=配置生效 / 256k=最终默认
# ③ override 是否生效（走真实代码路径）：
cd ~/.hermes/hermes-agent && python3 -c "
import sys, yaml; sys.path.insert(0,'.')
from hermes_cli.config import get_custom_provider_context_length
cfg = yaml.safe_load(open('$HOME/.hermes/profiles/<p>/config.yaml'))
print(get_custom_provider_context_length('<model>','<base_url>',custom_providers=cfg.get('custom_providers')))"
# ④ 端点声明什么（区分格式）：
curl -s http://127.0.0.1:15721/v1/models -o /tmp/m.json && python3 -m json.tool /tmp/m.json | grep -E 'slug|context_window'
# ⑤ 缓存冻结排查：
grep -A2 'glm' ~/.hermes/context_length_cache.yaml 2>/dev/null
```

## 7. 修复记录（2026-08-16）

- 29 个 config（全局 + 28 profile）`custom_providers[].models.glm-5.3.context_length: 1048576`
- 备份：`~/.hermes/backup/config-ctx-fix-20260816/`
- 验证：28/28 profile + GLOBAL 经真实解析代码返回 1048576
- 重启 TUI 生效；hermes update 若重置 config 需重查
- 批量 patch 教训：models 键序两种变体（glm 首位 / 字典序中间），第一轮正则漏 8 个

## 8. 未采纳的替代方案（记录，不推荐盲做）

- patch `fetch_endpoint_model_metadata` 加 Anthropic `models[]` 分支：可行，
  但与持久缓存语义冲突（failover 后冻结旧值），需同时禁缓存，复杂度高
- patch model_metadata.py 硬编码表加 glm-5.3：hermes update 会冲掉，
  需挂 patch watchdog
