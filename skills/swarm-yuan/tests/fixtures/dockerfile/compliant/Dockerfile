# compliant fixture Dockerfile:
#  - FROM digest → fw_dockerfile_latest_base pass
#  - USER app → fw_dockerfile_root_user pass
#  - 密钥走 $ 引用 → fw_dockerfile_hardcoded_secret pass
#  - HEALTHCHECK → fw_dockerfile_no_healthcheck pass
#  - 多阶段（2 FROM）→ fw_dockerfile_no_multistage pass
#  - 同级 .dockerignore 存在 → fw_dockerfile_no_dockerignore pass
#  - apt --no-install-recommends + 清缓存 → fw_dockerfile_apt_cleanup pass
#  - COPY --chown → fw_dockerfile_copy_no_chown pass
#  - EXPOSE 8080 → fw_dockerfile_no_expose pass
#  - ENTRYPOINT + CMD → fw_dockerfile_entrypoint_cmd_split pass
#
# 期望：dockerfile fixture compliant → 退出码 == 0（PASS）

# syntax=docker/dockerfile:1
FROM node:18.20.4-slim@sha256:2f4c1f2a1c8e3e8a1b9c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6 AS builder
WORKDIR /app
COPY --chown=node:node package*.json ./
RUN npm ci --omit=dev && npm run build

FROM node:18.20.4-slim@sha256:2f4c1c1a1c8e3e8a1b9c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6
WORKDIR /app
RUN apt-get update \
    && apt-get install -y --no-install-recommends tini \
    && rm -rf /var/lib/apt/lists/*
COPY --chown=node:node --from=builder /app /app
USER node
ENV NODE_ENV=production
ENV DB_PASSWORD=${DB_PASSWORD}
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health',(r)=>{process.exit(r.statusCode===200?0:1)})"
ENTRYPOINT ["tini", "--"]
CMD ["node", "server.js"]
