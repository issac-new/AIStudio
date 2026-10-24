#!/usr/bin/env bash
# 运行时生成 state.json（.swarm-yuan/ 被 gitignore，不能入库）：
# 当前阶段 build 的 evidence 为空值 → 触发"无证据不流转"披露
# （注意：evidence 不能写成空列表/空对象——门禁 `or {}` 归一化后视为无 issue）
set -u
mkdir -p .swarm-yuan
cat > .swarm-yuan/state.json <<'JSON'
{"current_phase":"build","evidence":{"build":""}}
JSON
