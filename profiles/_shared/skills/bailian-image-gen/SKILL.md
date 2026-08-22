---
name: bailian-image-gen
description: "通过阿里百炼 DashScope 生成图片。支持通义万相系列模型。异步生成→轮询→下载。"
version: 1.0.0
platforms: [macos, linux]
metadata:
  hermes:
    tags: [image-generation, bailian, dashscope, aliyun, chinese]
---

# 百炼图像生成

通过阿里百炼 DashScope API 生成图片。

## 环境要求

- 环境变量 `DASHSCOPE_API_KEY` 已设置（在 `~/.hermes/.env` 中）
- 脚本路径：`~/.hermes/bin/dashscope-image-gen.py`

## 可用模型

| 模型 | 价格 | 说明 |
|------|------|------|
| `wanx2.1-t2i-plus` | ¥0.20/张 | **推荐**，质量最好 |
| `wanx2.1-t2i-turbo` | ¥0.14/张 | 快速生成 |
| `wanx2.0-t2i-turbo` | ¥0.04/张 | 最便宜 |
| `wanx-v1` | ¥0.16/张 | 上一代 |
| `z-image-turbo` | ¥0.10/张 | 轻量版 |

## 用法

```bash
export DASHSCOPE_API_KEY="sk-xxx"

# 生成单张图片
~/.hermes/bin/dashscope-image-gen.py \
  --prompt "描述文字（英文效果更好）" \
  --output /path/to/output.png \
  --model wanx2.1-t2i-plus \
  --size 1024*1024

# 生成多张
~/.hermes/bin/dashscope-image-gen.py \
  --prompt "描述" \
  --output /path/to/output.png \
  --model wanx2.1-t2i-plus \
  --n 3
```

## 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--prompt` | （必填） | 生成提示词，建议英文 |
| `--output` | （必填） | 输出路径 |
| `--model` | `wanx2.1-t2i-plus` | 模型名 |
| `--size` | `1024*1024` | 尺寸（宽*高），支持 1024*1024/1328*1328/1664*928/928*1664 等 |
| `--n` | `1` | 生成数量 |
| `--max-wait` | `120` | 最大等待秒数 |

## 最佳实践

- **提示词用英文**效果更好（百炼的文生图模型主要用英文数据训练）
- 生成耗时约 10-30 秒
- 图片 URL 有效期约 24 小时，请及时下载
- 异步流程：提交任务 → 轮询状态 → 下载图片
