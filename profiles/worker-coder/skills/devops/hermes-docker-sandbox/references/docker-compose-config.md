# Docker Compose Multi-Instance Configuration

Full docker-compose.yml for deploying 3 Hermes sandbox instances (design, generator, evaluator).

## Compose File — Gateway Mode (Always-On API)

```yaml
services:
  design:
    image: hermes-sandbox:latest
    container_name: hermes-design
    hostname: hermes-design
    restart: unless-stopped
    command: gateway run
    ports:
      - "8643:8642"
    volumes:
      - hermes-data-design:/opt/hermes-data
      - ./profiles/design/config.yaml:/opt/hermes-data/config.yaml:ro
      - ./profiles/design/.env:/opt/hermes-data/.env:ro
      - ./workspace:/opt/workspace
    environment:
      - HERMES_INSTANCE=design
      - HERMES_DASHBOARD=0
    mem_limit: 4g
    cpus: '2'
    networks:
      - hermes-net
    healthcheck:
      test: ["CMD", "hermes", "doctor"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s

  generator:
    image: hermes-sandbox:latest
    container_name: hermes-generator
    hostname: hermes-generator
    restart: unless-stopped
    command: gateway run
    ports:
      - "8644:8642"
    volumes:
      - hermes-data-generator:/opt/hermes-data
      - ./profiles/generator/config.yaml:/opt/hermes-data/config.yaml:ro
      - ./profiles/generator/.env:/opt/hermes-data/.env:ro
      - ./workspace:/opt/workspace
    environment:
      - HERMES_INSTANCE=generator
      - HERMES_DASHBOARD=0
    mem_limit: 4g
    cpus: '2'
    networks:
      - hermes-net
    healthcheck:
      test: ["CMD", "hermes", "doctor"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s

  evaluator:
    image: hermes-sandbox:latest
    container_name: hermes-evaluator
    hostname: hermes-evaluator
    restart: unless-stopped
    command: gateway run
    ports:
      - "8645:8642"
    volumes:
      - hermes-data-evaluator:/opt/hermes-data
      - ./profiles/evaluator/config.yaml:/opt/hermes-data/config.yaml:ro
      - ./profiles/evaluator/.env:/opt/hermes-data/.env:ro
      - ./workspace:/opt/workspace
    environment:
      - HERMES_INSTANCE=evaluator
      - HERMES_DASHBOARD=0
    mem_limit: 4g
    cpus: '2'
    networks:
      - hermes-net
    healthcheck:
      test: ["CMD", "hermes", "doctor"]
      interval: 60s
      timeout: 10s
      retries: 3
      start_period: 30s

volumes:
  hermes-data-design:
  hermes-data-generator:
  hermes-data-evaluator:

networks:
  hermes-net:
    driver: bridge
```

## Directory Structure

```
project/
├── docker-compose.yml
├── profiles/
│   ├── design/
│   │   ├── config.yaml
│   │   └── .env
│   ├── generator/
│   │   ├── config.yaml
│   │   └── .env
│   └── evaluator/
│       ├── config.yaml
│       └── .env
└── workspace/
```

## Usage

```bash
# Start all instances
docker compose up -d

# Check logs
docker compose logs -f design

# Enter CLI
docker compose exec -it design hermes

# Stop
docker compose down
```

## Design/Generator/Evaluator Profile Configs

### design/config.yaml
```yaml
# Design agent — high-level planning and specification
model:
  default: openrouter/anthropic/claude-sonnet-4
  provider: openrouter
agent:
  max_turns: 50
  tool_use_enforcement: true
terminal:
  backend: local
  timeout: 300
compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
memory:
  memory_enabled: true
  user_profile_enabled: true
```

### generator/config.yaml
```yaml
# Generator agent — code/content generation (higher turns + longer timeout)
model:
  default: openrouter/anthropic/claude-sonnet-4
  provider: openrouter
agent:
  max_turns: 80
  tool_use_enforcement: true
terminal:
  backend: local
  timeout: 600
compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
memory:
  memory_enabled: true
  user_profile_enabled: true
```

### evaluator/config.yaml
```yaml
# Evaluator agent — testing, review, quality checks
model:
  default: openrouter/anthropic/claude-sonnet-4
  provider: openrouter
agent:
  max_turns: 40
  tool_use_enforcement: true
terminal:
  backend: local
  timeout: 300
compression:
  enabled: true
  threshold: 0.50
  target_ratio: 0.20
memory:
  memory_enabled: true
  user_profile_enabled: true
```

### .env template
```
# At least one API key required
# OPENROUTER_API_KEY=sk-or-...
# ANTHROPIC_API_KEY=sk-ant-...
# OPENAI_API_KEY=sk-...
# DEEPSEEK_API_KEY=***
```

## Network Details

All three containers share the `hermes-net` bridge network and can reach each other by container name:

```bash
# From design container, reach generator's API
docker compose exec design curl -s http://generator:8642/health
```

Host-accessible ports:
- `http://localhost:8643` → design
- `http://localhost:8644` → generator
- `http://localhost:8645` → evaluator

## Compose File — Interactive Mode (CLI First)

For initial setup (API key configuration, `hermes setup`), use interactive mode with `stdin_open` and `tty`:

```yaml
services:
  design:
    image: hermes-sandbox:latest
    container_name: hermes-design
    hostname: hermes-design
    restart: unless-stopped
    stdin_open: true      # Required for interactive CLI
    tty: true             # Required for interactive CLI
    ports:
      - "8643:8642"
    volumes:
      - hermes-data-design:/opt/hermes-data
      - ./workspace:/opt/workspace
    environment:
      - HERMES_INSTANCE=design
    mem_limit: 4g
    cpus: '2'
    networks:
      - hermes-net

volumes:
  hermes-data-design:

networks:
  hermes-net:
    driver: bridge
```

Usage:
```bash
# Enter interactive CLI
docker compose exec -it design hermes

# Run setup wizard
docker compose exec -it design hermes setup

# One-shot query (works in both modes)
docker compose exec design hermes chat -q "Hello"
```
