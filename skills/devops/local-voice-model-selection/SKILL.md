---
name: local-voice-model-selection
description: "Use when choosing local offline STT/TTS models for Hermes."
---

# Local Voice Model Selection (STT/TTS, China/offline focus)

Use when the user asks to compare, choose, or download **local/open-source** speech models for Hermes voice — especially "质量最好", "国产模型", "更大参数规模", "完全离线", or "流式语音对话" requirements. Complements `hermes-voice-setup` (default profile, Hermes-side config mechanics) and `dashscope-realtime-asr` (default profile, cloud API side) with the **local model selection facts**.

## 模型矩阵（2026-08 实测调研）

### STT（语音识别）

| 模型 | 参数 | 流式 | 中文 CER（WenetSpeech） | 部署 | M1 Pro 32GB |
|------|------|------|------------------------|------|-------------|
| **Qwen3-ASR-1.7B** | 1.7B | ✅ vLLM only | **4.97%**（开源 SOTA） | transformers / vLLM | ✅ ~4GB bf16 |
| Qwen3-ASR-0.6B | 0.6B | ✅ vLLM only | 5.97% | 同上 | ✅ 轻松 |
| Whisper-large-v3 | 1.55B | ❌ 批式 | 6.35% | faster-whisper | ✅ |
| SenseVoice-Small | ~300M | ❌ 非流式 | 优秀（情感/事件识别强） | FunASR/ONNX/llama.cpp | ✅ 轻松 |

Qwen3-ASR-1.7B 相对 Whisper-large-v3：中文 +22% 准确率，粤语碾压（5.82% vs 32.26% CER），川渝方言 11.99% vs 14.35%。52 语言+22 方言。仓库 `github.com/QwenLM/Qwen3-ASR`（⭐3.3k），ModelScope `Qwen/Qwen3-ASR-1.7B` 国内直下。

### TTS（语音合成）

| 模型 | 参数 | 流式 | 中文质量 | M1 Pro |
|------|------|------|---------|--------|
| **Fun-CosyVoice3-0.5B-2512_RL** | **0.5B（上限）** | ✅ | CER 0.81% SS 77.4%（开源 SOTA） | ✅ ~1.5GB |
| Fun-CosyVoice3-0.5B-2512 | 0.5B | ✅ | CER 1.21% SS 78.0% | ✅ |
| CosyVoice2-0.5B | 0.5B | ✅ | CER 1.45% SS 75.7% | ✅ |

**CosyVoice 参数上限就是 0.5B，没有更大版本。** 用户问"有没有更大参数"时直接回答没有，RL 版（`_RL` 后缀）就是质量最优。ModelScope `FunAudioLLM/Fun-CosyVoice3-0.5B-2512`。

## 关键硬约束

1. **Qwen3-ASR 流式 = vLLM only，vLLM 无 macOS wheel（2026-08 实测）**。官方原文："streaming inference is only available with the vLLM backend"。vLLM PyPI 0 个 macOS 产物（只有 Linux CUDA wheel + 源码）。macOS 上 Qwen3-ASR 只能 transformers 后端离线批式。验证命令：
   ```bash
   curl -sS https://pypi.org/pypi/vllm/json | python3 -c "import json,sys; d=json.load(sys.stdin); print(sum('macosx' in u['filename'] for u in d['urls']), 'macOS wheels')"
   ```
   Mac 上要真流式 STT 只有两条路：① DashScope `qwen3-asr-flash-realtime`（云端 WebSocket，见 `dashscope-realtime-asr` skill）② Docker Linux 容器跑 vLLM（无 GPU 很慢，不推荐）。

2. **Qwen3-ASR 接入 Hermes 需写自定义 STT provider**。Hermes 内置 `stt.provider: local` 只认 faster-whisper；Qwen3-ASR 走 `qwen-asr` PyPI 包（transformers/vLLM 两种后端），不在 Hermes 内置 provider 列表里。

3. **下载一律走 ModelScope**（国内）。huggingface.co 直连超时，hf-mirror.com 的 API 会 301 重定向回 huggingface.co 导致 Python SDK SSL 握手超时（curl 能通是因 curl 跟随重定向行为不同）。ModelScope 下载后的 HF 缓存目录结构修复方法（含 refs 换行符坑）见 `hermes-voice-setup` skill。

## 推荐组合（按需求）

| 用户需求 | STT | TTS |
|---------|-----|-----|
| 完全离线 + 最高中文质量 | Qwen3-ASR-1.7B（transformers 批式） | Fun-CosyVoice3-0.5B-2512_RL |
| 流式语音对话（Mac） | DashScope qwen3-asr-flash-realtime（云端） | DashScope qwen3-tts-flash（云端） |
| 现状够用 | faster-whisper large-v3（已装） | Edge zh-CN-YunxiNeural（已配） |

## 调研方法沉淀

- GitHub 仓库迁移探测：`FunAudioLLM/*` 已迁移到 `QwenAudio/*`（301），`alibaba-damo-academy/FunASR` → `modelscope/FunASR`。用 `curl -sSL` 跟随重定向拿真实位置。
- ModelScope 搜索 API 端点 2026-08 已变更（`/api/v1/models?search=`、`/api/v1/dolphin/models` 均 404）；可靠路径是 GitHub README 里给的 ModelScope 模型 ID 直接 `modelscope download --model <id>`。
- benchmark 数字从官方 README 的对比表格提取（Qwen3-ASR README 含 WenetSpeech/WenetSpeech-Yue/WenetSpeech-Chuan 三组中文 benchmark，CosyVoice README 含 test-zh CER/SS 对比表）。
