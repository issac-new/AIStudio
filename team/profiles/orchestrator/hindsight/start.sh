#!/bin/bash
# Hindsight API launcher script — 本地中英文模型离线模式
set -e

# Route LLM through cc-switch claude queue (127.0.0.1:15721)
# CRITICAL: use anthropic provider → /v1/messages → cc-switch routes to CLAUDE app_type
# (openai provider → /v1/chat/completions → gets routed to CODEX app_type which has broken MKimi)
# This ensures Hindsight uses the same claude failover queue as Hermes itself.
export HINDSIGHT_API_LLM_PROVIDER=anthropic
export HINDSIGHT_API_LLM_API_KEY="PROXY_MANAGED"
export HINDSIGHT_API_LLM_MODEL=glm-5.3-flash
export HINDSIGHT_API_LLM_BASE_URL="http://127.0.0.1:15721"
# 2026-09-20: glm-5.3-flash 免费通道（SRK 实测 260 次全 0 成本）。
# 原 glm-5.3 每文档抽取一次，单日 2300+ 次调用打穿订阅额度（详见
# ~/.hermes/backup/hindsight-fix-20260920/ 事故备份）。抽取不需要旗舰模型。
# cc-switch may route glm-5.3 to providers that reject explicit temperature
# (e.g. HKimi/Kimi K3 only allows temperature=1). Omit it so the upstream
# picks its own default.
export HINDSIGHT_API_LLM_TEMPERATURE=none
# 2026-09-26 invalid-JSON 修复：GLM-5.3(经 cc-switch claude 队列→SGLM/SRK Anthropic 端点)
# 默认深度思考模型，thinking 块常耗尽 max_tokens=4096 → 0 个 text 块 → 解析空串
# → "Anthropic returned invalid JSON" 重试循环(7803次/数周)。注入 Anthropic 标准
# thinking:disabled 后实测纯 text 输出(7tok/1.8s)。已直连上游验证参数被接受。
export HINDSIGHT_API_LLM_EXTRA_BODY='{"thinking":{"type":"disabled"}}'
export HINDSIGHT_API_DATABASE_URL="postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
export HINDSIGHT_API_MIGRATION_DATABASE_URL="postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
export HINDSIGHT_API_HOST=0.0.0.0
export HINDSIGHT_API_PORT=8888
export HINDSIGHT_API_LOG_LEVEL=info

# --- Embeddings: 本地 BAAI/bge-large-zh-v1.5 (1024-dim, 中英文, C-MTEB #1) ---
export HINDSIGHT_API_EMBEDDINGS_PROVIDER=local
export HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL="BAAI/bge-large-zh-v1.5"
# 2026-09-26 崩溃循环 → 2026-09-27 根治：根因是 torch 2.14 MPS 多线程 command
# buffer 提交竞态（单模型 4 线程即崩，实验 A/B 实证），已在 hindsight 源码加
# 进程级 MPS 推理锁（engine/__init__.py get_mps_inference_lock，embed+rerank
# 共享）。10 分钟 3+4 并发压测零断言。MPS 恢复：2.3-2.5x 吞吐 vs CPU。
export HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_EMBEDDINGS_LOCAL_TRUST_REMOTE_CODE=false

# --- Reranker: 本地 BAAI/bge-reranker-large (中英文, C-MTEB #1) ---
export HINDSIGHT_API_RERANKER_PROVIDER=local
export HINDSIGHT_API_RERANKER_LOCAL_MODEL="BAAI/bge-reranker-large"
export HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU=false
export HINDSIGHT_API_RERANKER_LOCAL_FP16=true

export HINDSIGHT_API_RUN_MIGRATIONS=true
export HF_ENDPOINT=https://hf-mirror.com
# 2026-09-20 启动风暴修复：默认 32 路并发 LLM 会把免费档 flash 打到 429，
# 连带启动期 LLM 验证被淹没（300s 超时自杀→KeepAlive 无限重启）。
# 压到 4 并发 + 加长初始化宽限，积压任务以温和速率回放。
export HINDSIGHT_API_LLM_MAX_CONCURRENT=4
export HINDSIGHT_API_MODEL_INIT_TIMEOUT=600
# 2026-10-02 token 审计优化：consolidation 默认每 LLM call 只装 8 条 fact（固定模板
# overhead 摊 3000+ 次/天，10-02 实测 3081 calls × 7.4k input = 22.9M tokens/日，占
# Hindsight 总消耗 90%）。批到 32：调用数 -75%，事实覆盖不变。单批 32×256tok 源事实
# + 模板 ≈ 10k input，仍在 flash 队列单请求舒适区。
export HINDSIGHT_API_CONSOLIDATION_LLM_BATCH_SIZE=32
# 同批收紧：单轮 consolidation 处理的记忆上限对齐批大小倍数（100→128），减少尾批
export HINDSIGHT_API_CONSOLIDATION_MAX_MEMORIES_PER_ROUND=128

echo "Starting Hindsight API (Local Models Mode)..."
echo "  LLM:        $HINDSIGHT_API_LLM_PROVIDER/$HINDSIGHT_API_LLM_MODEL (via cc-switch 15721)"
echo "  Port:       $HINDSIGHT_API_PORT"
echo "  DB:         localhost:5432/hindsight"
echo "  Embeddings: local BAAI/bge-large-zh-v1.5 (1024-dim, zh+en)"
echo "  Reranker:   local BAAI/bge-reranker-large (zh+en)"

# 钉死版本：0.8.2 已知可用（模型缓存兼容）。2026-09-20 事故：裸 `uv tool run`
# 每次解析最新版，漂到 0.8.5 后启动时重查 BGE 模型且 hf-mirror 元数据校验失败，
# KeepAlive 无限重启。升级版本须先验证 HF 缓存兼容性再改这里。
uv tool run hindsight-api==0.8.2
