#!/usr/bin/env bash
# 运行时生成 decisions.jsonl（.swarm-yuan/ 被根 .gitignore 忽略，不能入库）
set -u
mkdir -p .swarm-yuan
cat > .swarm-yuan/decisions.jsonl <<'JSON'
{"ts":"2026-07-22T10:00:00Z","phase":"design","type":"UserChallenge","ai_suggestion":"u","user_action":"approved","rationale":"r","actor":"a","alternatives":"x","missing_context":"y","cost_if_wrong":"z"}
JSON
