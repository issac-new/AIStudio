# Docker Sandbox Deployment (ARM64/China Edition)

> Absorbed from `hermes-docker-sandbox-deploy`. Chinese documentation for ARM64 and China-network Docker deployment. The `hermes-docker-sandbox` skill (English) covers the general case.

## ARM64 Build Notes

```dockerfile
FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y curl ca-certificates git xz-utils python3.11 python3.11-venv
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs
RUN git clone --depth 1 https://github.com/NousResearch/hermes-agent.git /usr/local/lib/hermes-agent
RUN cd /usr/local/lib/hermes-agent && python3.11 -m venv venv && pip install -e '.[all]'
RUN npm install -g @anthropic-ai/claude-code
```

- `uv` works natively on ARM64 (only crashes under QEMU amd64 emulation)
- Use USTC Debian mirror: `sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources`
- If GitHub unreachable: clone on host → COPY into image

## Chinese Registry Mirror Workaround

```bash
# When docker pull 429s:
docker pull docker.m.daocloud.io/library/python:3.12-slim-bookworm
docker tag docker.m.daocloud.io/library/python:3.12-slim-bookworm python:3.12-slim-bookworm
```

## cc switch Proxy in Containers

```bash
# Fix proxy address for container
for c in design generator evaluator; do
  docker compose exec -T "$c" sh -c '
    sed -i "s|http://127.0.0.1:15721|http://host.docker.internal:15721|g" /root/.claude.json
    sed -i "s|\"ANTHROPIC_BASE_URL\": \".*:15721\"|\"ANTHROPIC_BASE_URL\": \"http://host.docker.internal:15721\"|g" /root/.claude/settings.json
  '
done
```

## Hindsight Memory Config per Container

```json
{
  "mode": "local_external",
  "api_url": "http://host.docker.internal:8888",
  "bank_id": "hermes-sandbox-<instance>",
  "recall_budget": "mid",
  "memory_mode": "hybrid",
  "auto_recall": true,
  "auto_retain": true
}
```
