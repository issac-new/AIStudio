# ============================================
# Hindsight API 启动脚本 — 本地中英文模型离线模式
# 模型: BAAI/bge-large-zh-v1.5 (Embedding) + BAAI/bge-reranker-large (Reranker)
# 适用: Windows PowerShell
# 用法: .\start-hindsight.ps1
# 前提: PostgreSQL (pgvector) 已在 Docker 中运行
# ============================================
$ErrorActionPreference = "Stop"

# --- 路径配置 ---
$hermesHome = "${env:USERPROFILE}\.hermes"
$dotEnv = "$hermesHome\profiles\orchestrator\.env"
$hindsightOffline = "$hermesHome\hindsight-offline"

if (-not (Test-Path $dotEnv)) {
    Write-Error "ERROR: $dotEnv not found."
    exit 1
}

# 解析 .env
$envVars = @{}
Get-Content $dotEnv | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
        $parts = $line.Split("=", 2)
        $envVars[$parts[0].Trim()] = $parts[1].Trim()
    }
}

$dsKey = $envVars["DEEPSEEK_API_KEY"]
if (-not $dsKey) {
    Write-Error "ERROR: DEEPSEEK_API_KEY not found in .env"
    exit 1
}

# --- 数据库 ---
$env:HINDSIGHT_API_DATABASE_URL = "postgresql://hindsight:hindsight_dev@localhost:5432/hindsight"
$env:HINDSIGHT_API_MIGRATION_DATABASE_URL = "postgresql+psycopg2://hindsight:hindsight_dev@127.0.0.1:5432/hindsight"
$env:HINDSIGHT_API_RUN_MIGRATIONS = "true"

# --- 服务 ---
$env:HINDSIGHT_API_HOST = "0.0.0.0"
$env:HINDSIGHT_API_PORT = "8888"
$env:HINDSIGHT_API_LOG_LEVEL = "info"

# --- LLM: DeepSeek API (在线, 记忆综合) ---
$env:HINDSIGHT_API_LLM_PROVIDER = "deepseek"
$env:HINDSIGHT_API_LLM_API_KEY = $dsKey
$env:HINDSIGHT_API_LLM_MODEL = "deepseek-v4-flash"

# --- Embedding: 本地 BAAI/bge-large-zh-v1.5 (1024-dim, 中英文, C-MTEB #1) ---
$env:HINDSIGHT_API_EMBEDDINGS_PROVIDER = "local"
$env:HINDSIGHT_API_EMBEDDINGS_LOCAL_MODEL = "$hindsightOffline\model\embedding"
$env:HINDSIGHT_API_EMBEDDINGS_LOCAL_FORCE_CPU = "false"
$env:HINDSIGHT_API_EMBEDDINGS_LOCAL_TRUST_REMOTE_CODE = "false"

# --- Reranker: 本地 BAAI/bge-reranker-large (中英文, C-MTEB #1) ---
$env:HINDSIGHT_API_RERANKER_PROVIDER = "local"
$env:HINDSIGHT_API_RERANKER_LOCAL_MODEL = "$hindsightOffline\model\reranker"
$env:HINDSIGHT_API_RERANKER_LOCAL_FORCE_CPU = "false"
$env:HINDSIGHT_API_RERANKER_LOCAL_FP16 = "true"

# --- HF 镜像 (备用) ---
$env:HF_ENDPOINT = "https://hf-mirror.com"

Write-Host "Starting Hindsight API (Local ZH+EN Models Mode)..." -ForegroundColor Cyan
Write-Host "  LLM:        $env:HINDSIGHT_API_LLM_PROVIDER/$env:HINDSIGHT_API_LLM_MODEL (API)" -ForegroundColor White
Write-Host "  Embedding:  local BAAI/bge-large-zh-v1.5 (1024-dim, zh+en, offline)" -ForegroundColor Green
Write-Host "  Reranker:   local BAAI/bge-reranker-large (zh+en, offline)" -ForegroundColor Green
Write-Host "  Port:       $env:HINDSIGHT_API_PORT"
Write-Host "  DB:         localhost:5432/hindsight"
Write-Host "  Model dir:  $hindsightOffline\model"

uv tool run hindsight-api
