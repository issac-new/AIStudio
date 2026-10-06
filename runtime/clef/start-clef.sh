#!/bin/bash
# 启动本地 Clef 27B (MLX 4bit) SystemOne 决策服务
# 模型来源：LM Studio 下载目录（勿用 LM Studio 界面跑，决策头只有 clef_mlx.py 会加载）
# 服务：POST http://127.0.0.1:8001/v1/systemone（兼容 Jev/SystemOne 协议）
set -e
CLEF_DIR=/Volumes/nvme2230/lm-studio-model/mlx-community/clef-4bit
PY=/Users/cuishi/lab/clef-runtime/venv/bin/python

# 分片未下完时给出明确提示（.part 文件存在即未完成）
if ls "$CLEF"/downloading_*.part >/dev/null 2>&1; then
  DONE=$(ls "$CLEF"/model-*.safetensors 2>/dev/null | wc -l | tr -d ' ')
  echo "模型还在下载中（$DONE/3 分片完成），稍后再试。查看进度："
  du -sh "$CLEF"
  exit 1
fi

exec "$PY" "$CLEF_DIR/clef_mlx.py" serve --port 8001
