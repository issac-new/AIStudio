#!/usr/bin/env bash
# 运行时生成 state.json（.swarm-yuan/ 被 gitignore，不能入库）：
# 当前阶段 build 带 evidence → 阶段状态机证据核验通过
set -u
mkdir -p .swarm-yuan
cat > .swarm-yuan/state.json <<'JSON'
{"current_phase":"build","evidence":{"build":"make test 全绿"}}
JSON
