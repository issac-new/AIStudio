---
name: dashscope-realtime-asr
description: "DashScope 实时流式 ASR 与开源 Qwen3-ASR/FunASR 集成调研。"
---

# DashScope 实时流式 ASR 调研与集成

Use when the task involves evaluating, comparing, or integrating Alibaba Cloud DashScope (百炼) realtime streaming ASR models — or their open-source counterparts (Qwen3-ASR, FunASR paraformer-zh-streaming, SenseVoice) — for Hermes voice_mode / voice pipelines.

## 核心事实速查（验证于 2026-08，详见 references/dashscope-realtime-asr.md）

**云端三模型**（均 WebSocket，RPM 1200，北京地域）：
- `qwen3-asr-flash-realtime`：OpenAI-Realtime 风格事件协议；pcm/opus 8/16kHz；0.00033 元/秒 ≈1.19 元/时；28 语种+方言；独有情感识别；server_vad + Manual 双模式。**Hermes voice_mode 首选**（协议同构 OpenAI Realtime，迁移成本最低）。
- `fun-asr-realtime`：DashScope 任务式 WS + AOQ 协议；任意采样率多格式；同价；RAG 热词/ITN/语气词过滤强；有 8kHz 电话版。
- `paraformer-realtime-v2`：任务式 WS；0.00024 元/秒 ≈0.86 元/时（最便宜）；上代模型，官方建议迁移；仅北京。
- TTFT 官方均未公布毫秒数；延迟由 VAD `silence_duration_ms`（默认 800，对话推荐 400ms）控制。
- 免费额度：新用户每模型独立、90 天、仅北京；具体小时数公开文档未列，控制台查询。

**开源侧**：
- **Qwen3-ASR 已开源**（2026-01，github.com/QwenLM/Qwen3-ASR）：1.7B/0.6B + ForcedAligner；30 语言+22 方言；**流式仅 vLLM 后端**；ModelScope 可国内下载；有 GGUF/MLX 移植。
- **SenseVoiceSmall 非流式**：准实时 = FSMN-VAD 切句 + 逐段识别。
- **FunASR runtime**：Docker WebSocket server，online/offline/2pass 三模式（2pass-offline 支持 SenseVoiceSmall）。

**集成推荐排序**：① qwen3-asr-flash-realtime（云）② fun-asr-realtime（热词重/AOQ 弱网）③ 本地 Qwen3-ASR-0.6B vLLM（隐私）④ FunASR runtime paraformer-zh-streaming（CPU 轻量）⑤ paraformer-realtime-v2（仅价格敏感）。

## 协议要点（qwen3-asr-flash-realtime）

- URL `wss://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/api-ws/v1/realtime?model=<model>`，`Authorization: Bearer <key>` 握手鉴权。
- 客户端：`session.update` → `input_audio_buffer.append`（Base64 音频，≤15MiB/事件）→ `session.finish`（必发，否则丢结果）。
- 服务端：partial = `conversation.item.input_audio_transcription.text`（text+stash 拼接）；final = `conversation.item.input_audio_transcription.completed`（含 transcript/language/emotion）；`session.finished` 后断连。
- VAD：`turn_detection={type:server_vad, threshold:0.0, silence_duration_ms:400}`；设 null 切 Manual（客户端 commit 断句）。

## 调研方法（Aliyun 帮助中心）

help.aliyun.com 静态 HTML 可直接 curl；URL slug 不规则且错误 slug 返回 HTTP 200 软 404（标题含 `404错误页`）。可靠发现路径：先取已知模型页（`/zh/model-studio/<model-name>`），再 `grep -o 'href="..."'` 挖侧边栏兄弟页面；每页用 `<title>` 校验。

## References

- `references/dashscope-realtime-asr.md` — 完整对比表、全部文档 URL、开源部署细节（2026-08 调研浓缩）

## Pitfalls

1. **不要编造官方未公布的延迟数字** — 百炼 realtime ASR 无官方 TTFT 毫秒指标；只能说 SDK 暴露 `first package delay ms` 实测字段，VAD 断句阈值是主要可控延迟来源。
2. **qwen3 系列与 paraformer/fun-asr 协议不同族** — 前者 OpenAI Realtime 风格事件，后两者 DashScope 任务式（run-task/result-generated/finish-task）；写客户端代码前确认目标模型属于哪一族。
3. **免费额度按模型独立且会过期**（90 天），快照版与主版本额度不共享；实时 ASR 的额度单位是时长不是 token，公开 FAQ 页不列具体数字。
4. **模型迭代快** — 2026 年已有更新的 qwen-audio-3.0-asr-flash-streaming 成为选型页首推（热词/Prompt 上下文/AOQ）；引用本参考时注意时效，先看 /zh/model-studio/speech-recognition 选型页确认当前推荐。
