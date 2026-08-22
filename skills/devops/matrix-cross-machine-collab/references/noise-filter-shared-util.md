# 环境噪声过滤共享 util（gateway/noise_filter.py）

> 2026-08-20 方式 A 重构产物。把 matrix 专属的 `_matrix_noise_reason` 抽成共享模块，matrix + weixin 共用。
> 单一事实源 = `~/.hermes/hermes-agent/gateway/noise_filter.py`。本文是平台传参表 + 噪声类型全集 + 挂载点 + 验证。

---

## 为什么先查订阅层再设计过滤

很多经典环境噪声**根本没订阅事件 handler**，天然不烧 token——为它们写过滤是空规则。先查 adapter 注册了哪些 handler：

- **matrix adapter**（`plugins/platforms/matrix/adapter.py` L2074-2088）只注册 `ROOM_MESSAGE / REACTION / INVITE` 三个 handler。typing 指示、已读回执、presence 在线状态、成员加入/离开这些 ephemeral/state event **在订阅层就挡了**。
- 真正漏进来烧 token 的，是混在 `m.room.message`（matrix）/ 文本 item（weixin）里的**伪消息**。

**教训**：别按「经典噪声清单」凭空设防，先确认哪些噪声实际会漏进 agent turn。

## 共享模块 API

```python
from gateway.noise_filter import noise_reason, semantic_reason

# 高置信度噪声判定（默认拦）
noise_reason(
    body: str,
    platform: str,                      # "matrix" / "weixin" / ...
    *,
    event_ts: float = 0.0,              # 有同步机制的平台传，否则 0
    startup_ts: float = 0.0,            # 有同步机制的平台传，否则 0
    enable_decrypt: bool = True,        # E2EE 平台（matrix）开，非 E2EE（weixin）关
    enable_sync_replay: bool = True,    # 有同步重放（matrix）开，轮询（weixin）关
    enable_stt_failure: bool = True,    # 有语音（weixin）开
    enable_recall: bool = True,         # 有撤回（weixin）开
) -> Optional[str]                      # 噪声原因 or None

# 语义级噪声判定（默认只记日志不拦）
semantic_reason(body: str, platform: str) -> Optional[str]
```

## 噪声类型全集 + 平台适用性

| 噪声类型 | reason 返回值 | matrix | weixin | 类别 |
|---------|--------------|:------:|:------:|------|
| 空消息 | `empty` | ✅ | ✅ | 高置信度 |
| 纯标点 | `punctuation_only` | ✅ | ✅ | 高置信度 |
| 加密失败占位符 | `decrypt_failure` | ✅ | — | 高置信度 |
| 心跳/健康检查（整句） | `heartbeat_exact` | ✅ | ✅ | 高置信度 |
| 心跳（前缀，<30字符） | `heartbeat_prefix` | ✅ | ✅ | 高置信度 |
| 单字符符号（非字母数字非命令） | `single_char_symbol` | ✅ | ✅ | 高置信度 |
| 单字符无意义（c/嗯/啊/哦等） | `single_char_noise` | ✅ | ✅ | 高置信度 |
| 同步重放回声 | `sync_replay` | ✅ | — | 高置信度 |
| 语音转文字失败占位 | `stt_failure` | — | ✅ | 高置信度 |
| 撤回回声 | `recall_echo` | — | ✅ | 高置信度 |
| 纯表情 | `emoji_only` | 记日志 | 记日志 | 语义级 |
| 链接卡片无文字 | `link_card_only` | 记日志 | 记日志 | 语义级 |

## 平台传参对照（两个 adapter 的实际调用）

```python
# matrix adapter（_matrix_noise_reason 包装）
noise_reason(body, "matrix", event_ts=ets, startup_ts=sts,
             enable_decrypt=True, enable_sync_replay=True,
             enable_stt_failure=False, enable_recall=False)

# weixin adapter（_process_message 内联）
noise_reason(text, "weixin",
             enable_decrypt=False, enable_sync_replay=False,
             enable_stt_failure=True, enable_recall=True)
```

## 挂载点

- **matrix**：`plugins/platforms/matrix/adapter.py` 的 `_handle_text_message`，在进 `_resolve_message_context`（触发 agent）之前拦。`_matrix_noise_reason` 是共享函数的薄包装（保持原函数签名兼容）。
- **weixin**：`gateway/platforms/weixin.py` 的 `_process_message`，在 `build_source` / `_enqueue_text_event`（触发 agent）之前拦。仅当 `text` 非空时判定。

## 开关（{PLATFORM}_NOISE_FILTER 系列）

- 总开关 `{PLATFORM}_NOISE_FILTER`（默认 true）
- 子类 `{PLATFORM}_NOISE_FILTER_{EMPTY,DECRYPT,HEARTBEAT,SINGLE_CHAR,SYNC_REPLAY,STT_FAILURE,RECALL}`（默认 true）
- 语义级 `{PLATFORM}_NOISE_FILTER_SEMANTIC_{EMOJI,LINK_CARD}`（默认 **false** = 只记日志不拦）
- 开关读取：`noise_env(platform, name, default)`，env 名 = `{PLATFORM}_NOISE_FILTER_{name}`

## 特征库（小写匹配）

- `HEARTBEAT_PATTERNS`：alive/heartbeat/ping/health check/keep-alive/uptime/心跳/存活 等
- `DECRYPT_FAILURE_PATTERNS`：unable to decrypt/decryption failed/megolm/无法解密 等
- `STT_FAILURE_PATTERNS`：[语音]/语音转文字失败/transcription failed 等
- `RECALL_PATTERNS`：撤回了一条消息/recalled a message/已撤回 等
- `SINGLE_CHAR_NOISE`：c/k/z/嗯/啊/哦/呃/哈/哼（保留数字和 `/` 命令）

## 防误杀设计

- heartbeat prefix 检测有 `< 30 字符` 限制（"今天 online 会议怎么样" 不误杀）
- 单字符检测保留数字和 `/` 命令
- sync_replay 只在 event_ts 有效且早于启动前 5 分钟才判
- 语义级默认只记日志不拦（日常通讯平台含家人，可能是真实意图）

## 单元测试（2026-08-20 全过）

matrix 路径 10 例 + weixin 路径 9 例 + 语义级 2 例。平台差异精确：matrix 拦加密占位/同步重放、weixin 拦 STT 失败/撤回回声；语义级默认不拦。验证命令见 SKILL.md §七。

## 持久化

共享模块是 **untracked 新文件**——`git diff` 抓不到，需 `git add -N gateway/noise_filter.py` 后再 `git diff` 生成 patch。watchdog 检测三处标记：matrix adapter（anti-loop+noise-filter）、weixin adapter（noise-filter）、共享模块（文件存在性）。详见 `hermes-source-patch-persistence` skill。
