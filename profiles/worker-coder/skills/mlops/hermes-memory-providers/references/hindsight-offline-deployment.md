# Hindsight Offline Deployment Package (ZH+EN Local Models)

Build a self-contained offline package for deploying Hindsight on a machine
without internet access. Includes Docker image, **both local model weights**
(Embedding + Reranker), config, and platform-specific start scripts.

## When to Use

- Target machine is behind a firewall or has restricted internet
- Need reproducible deployment without HuggingFace/Docker Hub downloads
- Cross-platform migration (e.g. macOS → Windows) where model caches don't transfer
- **Chinese + English** bilingual support required

## Architecture Overview

```
Hermes Agent (HTTP localhost:8888)
       │
       ▼
┌──────────────────────────────────────────────────┐
│             Hindsight API Server                  │
│  (uv tool: hindsight-api-slim, 1.4GB)             │
│                                                   │
│  LLM:        DeepSeek V4 Flash (API, 在线)         │
│  Embedding:  BAAI/bge-large-zh-v1.5 (本地, 1.2G)   │
│  Reranker:   BAAI/bge-reranker-large (本地, 2.1G)   │
│  Database:   pgvector:pg16 (Docker容器)            │
└──────────────────────┬────────────────────────────┘
                       │ TCP localhost:5432
                       ▼
              ┌─────────────────────┐
              │  Docker: pgvector    │
              │  pg16 (640MB)        │
              │  数据库: hindsight    │
              └─────────────────────┘
```

**Key distinction**: Both Embedding and Reranker run **fully local** from disk —
no SiliconFlow/HuggingFace download needed. Only the LLM (DeepSeek) uses an
online API. This is the recommended config for ZH+EN environments.

## Package Contents (2.7GB total)

```
hindsight-offline/
├── docker-compose.yml          # PostgreSQL container orchestration
├── pgvector-pg16.tar           # Docker image (147MB, docker load offline)
├── model/
│   ├── embedding/              # BAAI/bge-large-zh-v1.5 (1.2G)
│   │   ├── model.safetensors   # 1.2G — main weight file
│   │   ├── config.json
│   │   ├── tokenizer.json / vocab.txt
│   │   ├── modules.json / sentence_bert_config.json
│   │   ├── config_sentence_transformers.json
│   │   └── 1_Pooling/config.json
│   └── reranker/               # BAAI/bge-reranker-large (2.1G)
│       ├── model.safetensors   # 2.1G — main weight file
│       ├── config.json
│       ├── tokenizer.json (16M)
│       ├── sentencepiece.bpe.model (4.8M)
│       ├── special_tokens_map.json
│       └── tokenizer_config.json
├── config/                     # Hindsight configuration files
│   ├── config.json             # Hermes-side hindsight client config
│   ├── start.sh                # macOS/Linux start script (original)
│   ├── launch.py               # Python launcher (macOS launchd)
│   └── HINDSIGHT_DEPLOY_GUIDE.md
└── scripts/                    # Platform-specific start scripts
    ├── start-hindsight.ps1     # Windows PowerShell
    └── start-hindsight.sh      # Git Bash / WSL
```

## Building the Package

### 1. Save Docker Image

```bash
docker save pgvector/pgvector:pg16 -o hindsight-offline/pgvector-pg16.tar
# Result: ~147MB tar file
```

### 2. Download Local Models

```bash
export HF_ENDPOINT=https://hf-mirror.com
PYBIN=~/.local/share/uv/tools/hindsight-api-slim/bin/python

# Embedding: BAAI/bge-large-zh-v1.5 (1024-dim, ZH+EN, C-MTEB #1)
$PYBIN -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('BAAI/bge-large-zh-v1.5')"

# Reranker: BAAI/bge-reranker-large (ZH+EN, C-MTEB #1)
$PYBIN -c "from sentence_transformers import CrossEncoder; CrossEncoder('BAAI/bge-reranker-large')"
```

### 3. Extract Model Files (Dereference HF Symlinks)

HF Hub cache stores files as `blobs/` + `snapshots/` symlinks. Use `cp -RL`
to copy actual files into a flat directory:

```bash
PKG=hindsight-offline

# Embedding — NOTE: may split across two snapshot dirs!
EMB_CACHE=~/.cache/huggingface/hub/models--BAAI--bge-large-zh-v1.5/snapshots
mkdir -p "$PKG/model/embedding"
cp -RL "$EMB_CACHE"/*/1_Pooling "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/config.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/config_sentence_transformers.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/modules.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/sentence_bert_config.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/special_tokens_map.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/tokenizer_config.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/tokenizer.json "$PKG/model/embedding/" 2>/dev/null
cp -RL "$EMB_CACHE"/*/vocab.txt "$PKG/model/embedding/" 2>/dev/null
# safetensors may be in a DIFFERENT snapshot dir — find and copy it
find "$EMB_CACHE" -name "model.safetensors" -exec cp -L {} "$PKG/model/embedding/" \;

# Reranker
RER_CACHE=~/.cache/huggingface/hub/models--BAAI--bge-reranker-large/snapshots
mkdir -p "$PKG/model/reranker"
cp -RL "$RER_CACHE"/*/* "$PKG/model/reranker/" 2>/dev/null
```

**⚠️ bge-large-zh-v1.5 dual-snapshot pitfall**: This model's HF cache may split
files across two snapshot directories — `model.safetensors` (1.2G) in one,
config/tokenizer in another. Use `find ... -name model.safetensors` to locate
the weight file regardless of which snapshot it landed in.

### 4. Verify Models Load

```bash
$PYBIN -c "
from sentence_transformers import SentenceTransformer, CrossEncoder
e = SentenceTransformer('$PKG/model/embedding')
print(f'Embedding dim: {e.get_embedding_dimension()}')  # 1024
r = CrossEncoder('$PKG/model/reranker')
print(f'Reranker score: {r.predict([(\"测试\", \"test\")])}')  # ~1.0
"
```

### 5. Create docker-compose.yml

```yaml
version: "3.8"
services:
  hindsight-db:
    image: pgvector/pgvector:pg16
    container_name: hindsight-db
    environment:
      POSTGRES_DB: hindsight
      POSTGRES_USER: hindsight
      POSTGRES_PASSWORD: hindsight_dev
    ports: ["5432:5432"]
    volumes: [hindsight_data:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U hindsight -d hindsight"]
      interval: 10s
      timeout: 5s
      retries: 5
    restart: unless-stopped
volumes:
  hindsight_data:
    driver: local
```

### 6. Package and Upload

```bash
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
zip -r "hindsight-offline-${TIMESTAMP}.zip" hindsight-offline/
cd /path/to/modelscope/repo
git add hindsight-offline-*.zip
git commit -m "feat: add Hindsight offline package with ZH+EN local models"
git push origin master
```

## Deploying on Target Machine (Windows)

### Step 1: Install Docker Desktop

```powershell
winget install Docker.DockerDesktop
docker --version
```

### Step 2: Extract Package

```powershell
Expand-Archive -Path "hindsight-offline-*.zip" -DestinationPath $env:USERPROFILE\.hermes\ -Force
```

### Step 3: Load Docker Image and Start PostgreSQL

```powershell
docker load -i $env:USERPROFILE\.hermes\hindsight-offline\pgvector-pg16.tar
cd $env:USERPROFILE\.hermes\hindsight-offline
docker compose up -d
docker ps   # verify hindsight-db is healthy
```

### Step 4: Install Hindsight API

```powershell
uv tool install hindsight-api-slim
```

### Step 5: Start Hindsight API

```powershell
.\.hermes\hindsight-offline\scripts\start-hindsight.ps1
```

### Step 6: Verify

```powershell
curl http://localhost:8888/health
# Expected: {"status":"healthy","database":"connected"}
```

## Model Summary

| Model | Purpose | Runs Where | Size | ZH+EN | In Package? |
|-------|---------|------------|------|-------|-------------|
| `BAAI/bge-large-zh-v1.5` | Embedding | **Local** (offline) | 1.2G | ✅ C-MTEB #1 | ✅ Yes |
| `BAAI/bge-reranker-large` | Reranker | **Local** (offline) | 2.1G | ✅ C-MTEB #1 | ✅ Yes |
| `deepseek-v4-flash` | LLM memory synthesis | DeepSeek API (online) | — | ✅ | ❌ API only |

## Pitfalls

### 1. bge-large-zh-v1.5 dual-snapshot issue

This model's HF cache may split files across two snapshot directories.
Use `find` to locate `model.safetensors` across all snapshots.

### 2. Don't include pytorch_model.bin AND model.safetensors

Both contain identical weights. Use `snapshot_download(ignore_patterns=['*.bin'])`.

### 3. Docker image platform must match target OS

For Windows x64 targets, pull the amd64 image first:
```bash
docker pull --platform linux/amd64 pgvector/pgvector:pg16
docker save pgvector/pgvector:pg16 -o pgvector-pg16.tar
```

### 4. PostgreSQL password must match

docker-compose sets `POSTGRES_PASSWORD: hindsight_dev`. Hindsight env uses
`postgresql://hindsight:hindsight_dev@localhost:5432/hindsight`. Change both
if modifying, plus the migration URL (`postgresql+psycopg2://`).

### 5. Online API dependency (LLM only)

Even with the offline package, Hindsight needs internet for DeepSeek API.
Embedding and Reranker are fully local.

### 6. Large LFS push timeout

The 2.7GB package exceeds default git push timeouts. Use `background=true`
with `notify_on_complete=true` and timeout 1800s+. ModelScope LFS upload
~3.2 MB/s, so 2.7GB takes ~14 minutes.
