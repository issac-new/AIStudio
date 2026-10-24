---
name: chinese-image-api-integration
description: "Integrate Chinese cloud image generation APIs (Alibaba Bailian/DashScope, ByteDance Volcano Engine, etc.) into Hermes. Covers async API patterns, adapter scripts, model selection from official docs, and the qwen-image vs wanx endpoint difference."
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [image-generation, chinese-api, bailian, dashscope, aliyun, volcengine, wanx, qwen-image]
    related_skills: [apikey-image-gen]
---

# Chinese Image API Integration

Chinese cloud image generation APIs (Alibaba Bailian, ByteDance Volcano
Engine, etc.) differ from Western APIs in three ways that require adapter
patterns beyond what `apikey-image-gen` covers:

1. **Async submission model** — submit task → poll for completion → download
   (not a single synchronous request/response).
2. **Model-specific endpoints** — `qwen-image-3.0-pro` uses the multimodal
   generation endpoint; `wanx` series uses the text2image async endpoint.
3. **Account activation** — models must be individually activated/purchased
   on the cloud console before use, even with a valid API key.

## When to Use

- User wants to generate images via Alibaba Bailian / DashScope
- User asks to configure 百炼/通义万相/Qwen-Image for image generation
- User asks about Chinese image APIs (豆包/火山引擎, 文心一格, etc.)
- The `apikey-image-gen` skill fails with `missing_fun_codex_provider`
- You need to generate images but have no Western API key (OpenAI/Google)

## Alibaba Bailian (DashScope) — Verified Working

### Prerequisites

- API Key from https://bailian.console.aliyun.com (支付宝扫码注册, 个人可用)
- Key stored in `~/.hermes/.env` as `DASHSCOPE_API_KEY`
- Adapter script at `~/.hermes/bin/dashscope-image-gen.py`

### Model Selection (from official doc 3026916)

| Quality Tier | Western Equivalent | Bailian Model | Price | Endpoint |
|---|---|---|---|---|
| **High quality** | Nano Banana Pro, GPT Image, Seedream 4.0 | `qwen-image-3.0-pro` | ~¥0.50/张 | Multimodal sync |
| Balanced | Imagen 4 Ultra, Midjourney v7 | `qwen-image-3.0`, `wan2.7-image` | ~¥0.20-0.25 | Sync / Async |
| Fast low-cost | FLUX.2 | `z-image-turbo` | ¥0.10/张 | Async |

### Key Distinction: qwen-image vs wanx — Different API patterns

**`qwen-image-3.0-pro` (multimodal sync)**:
- Endpoint: `/api/v1/services/aigc/multimodal-generation/generation`
- Header: `X-DashScope-SSE: enable` (streaming)
- Returns image URL directly in SSE `data:` line
- 2048×2048 output, ~30-60 seconds
- Best for: complex layouts, text rendering, multi-language fonts
- Requires account activation + balance (reports `Arrearage` if not funded)

**`wanx2.1-t2i-plus` / `wanx2.1-t2i-turbo` (async)**:
- Endpoint: `/api/v1/services/aigc/text2image/image-synthesis`
- Header: `X-DashScope-Async: enable`
- Returns `task_id` → poll `/api/v1/tasks/{task_id}` → download from OSS URL
- 1024×1024 output, ~10-20 seconds
- Best for: watercolor illustrations, storybook art, general-purpose

### Common Errors

| Error | Meaning | Fix |
|---|---|---|
| `Arrearage` / `AccessDenied.Unpurchased` | Account not funded or model not activated | Recharge balance at bailian.console.aliyun.com |
| `Throttling.RateQuota` | Rate limited (too many requests) | Wait 30-60 seconds and retry |
| `InvalidParameter: url error` | Wrong endpoint for this model | Switch to multimodal-generation endpoint |
| `Input should be a valid list: input.messages.0.content` | Content must be array of objects, not string | Use `[{"type":"text","text":"..."}]` format |

### Adapter Script Usage

```bash
export DASHSCOPE_API_KEY="sk-xxx"

# qwen-image-3.0-pro (high quality, sync)
~/.hermes/bin/dashscope-image-gen.py \
  --prompt "描述（英文效果更好）" \
  --output out.png \
  --model qwen-image-3.0-pro

# wanx2.1-t2i-plus (balanced, async)
~/.hermes/bin/dashscope-image-gen.py \
  --prompt "description" \
  --output out.png \
  --model wanx2.1-t2i-plus \
  --size 1024*1024
```

The adapter auto-detects the model type and routes to the correct endpoint.

### Integration Files

- **Adapter script**: `~/.hermes/bin/dashscope-image-gen.py`
- **API key**: `~/.hermes/.env` → `DASHSCOPE_API_KEY` + `BAILIAN_API_KEY`
- **Skill**: `~/.hermes/profiles/_shared/skills/bailian-image-gen/`

## ByteDance Volcano Engine (豆包) — Not Yet Integrated

Volcano Engine requires **enterprise authentication** (企业认证) for image
APIs, making it harder for individual users. If needed:

1. Register at https://www.volcengine.com/product/ark
2. Complete enterprise certification
3. Enable "视觉智能" or "方舟" service
4. Models: `doubao-image-3-0` (~¥0.06/张), `doubao-image-2-0` (~¥0.04/张)

## Model Selection Decision Guide

| User's Need | Recommended Model | Why |
|---|---|---|
|绘本插图 (storybook) | `qwen-image-3.0-pro` | Best quality, text rendering |
| 快速验证 prompt | `z-image-turbo` (¥0.10) | Fast 10×, cheap 1/5 |
| 品牌海报 (brand poster) | `wan2.7-image-pro` | Brand color, 4K resolution |
| 日常配图 (cost-sensitive) | `wanx2.1-t2i-plus` (¥0.20) | Good enough, half price |
| 写实人像 (realistic portrait) | `z-image-turbo` | Specialized for realism |

## Pitfalls

### qwen-image-3.0-pro reports "url error" on text2image endpoint

`qwen-image-3.0-pro` does NOT use the `/services/aigc/text2image/image-synthesis`
endpoint. It uses the **multimodal generation** endpoint. The adapter script
handles this automatically by checking model name prefix.

### English prompts produce better results

All Bailian image models are trained primarily on English data. Chinese
prompts work but yield lower quality. Always translate prompts to English
before calling the API.

### API key works but model returns Arrearage

The API key is valid (can query model list at `/api/v1/models`), but
specific models require **individual activation + account balance**.
Recharge at bailian.console.aliyun.com, then retry.

### Image URLs expire in ~24 hours

DashScope returns OSS URLs with `Expires` query parameter. Download
images immediately after generation — don't store the URL for later use.

## Related Skills

- `apikey-image-gen` — Western image APIs via Hermes Web UI (OpenAI, Google)
  This skill covers the Chinese API complement.
