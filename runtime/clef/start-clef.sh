#!/bin/bash
# 启动本地 Clef SystemOne 决策服务
# 主力：clef-flash-4bit（9B，端口 8000）——Laya 退役后的默认判定端
# 备件：clef-4bit 27B（端口 8001）——CLEF_MODEL=27b 时启用，仅异步低频场景
# 注意：LM Studio 只当下载器，服务必须经 clef_mlx.py（决策头只有它认）
set -e
MODE="${CLEF_MODEL:-flash}"
BASE=/Volumes/nvme2230/lm-studio-model/mlx-community
# 挂载守卫（2026-11-05 nvme 去依赖批）：模型库为低频大件留 nvme，缺席时明确报错
if [ ! -d "$BASE" ]; then
  echo "错误：模型库未挂载（$BASE）——请先挂载 /Volumes/nvme2230 或改 BASE 指向本地副本" >&2
  exit 1
fi
PY=/Users/cuishi/lab/clef-runtime/venv/bin/python

if [ "$MODE" = "27b" ]; then
  DIR="$BASE/clef-4bit"; PORT="${CLEF_PORT:-8001}"
else
  DIR="$BASE/clef-flash-4bit"; PORT="${CLEF_PORT:-8000}"
fi

if ls "$DIR"/downloading_*.part >/dev/null 2>&1; then
  echo "模型还在下载中：$DIR"; du -sh "$DIR"; exit 1
fi

exec "$PY" "$DIR/clef_mlx.py" serve --port "$PORT"
