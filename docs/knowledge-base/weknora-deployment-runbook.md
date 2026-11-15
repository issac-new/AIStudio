# WeKnora v0.9.0 自托管部署 Runbook（Apple Silicon 实测）

5 容器（app / docreader / postgres(paradedb) / redis / frontend），默认 profile 即最小集；实测全流程内存峰值 ~1.15GB、闲置 ~650MB。

## 部署步骤

1. `docker-compose.yml` 版本锁定 `wechatopenai/weknora-app:v0.9.0` 系列；数据卷 bind mount 外置盘（postgres 数据 + 原始文件分离）。
2. 端口让位（按本机占用情况改 `.env`）：`APP_PORT` / `FRONTEND_PORT`（默认 8080/80 常被占）。
3. app 挂载的 `config/config.yaml` 必须先落盘再 `up`——挂载源不存在时 Docker 会建成同名目录导致启动类型冲突。
4. 镜像串行 `docker pull` 再 `up -d`（compose 并行 pull 对带 build 段服务会死锁）。
5. LLM/嵌入供给（协议要点）：
   - 嵌入：本机 Ollama（如 `qwen3-embedding:0.6b`，1024 维）
   - LLM：任意 OpenAI 兼容端点；若网关只说 Responses 协议，需一层 chat/completions 转换桥（stdlib 30 行可实现，见本文末附录思路）
   - 容器侧统一用 `host.docker.internal`；**v0.9.0 SSRF 防护默认拦私网**，`.env` 加 `SSRF_WHITELIST_EXTRA=host.docker.internal` 后须 `docker compose up -d --force-recreate app`
6. 首个注册用户即管理员。生产建议建独立服务账号；`JWT_SECRET` 必须显式设（不设则进程重启全员掉登录——源码 user.go:80-83）。

## API 速查（实测可用，v0.9.0）

```
POST /api/v1/auth/register        {username,email,password}
POST /api/v1/auth/login           → body.token (JWT)
POST /api/v1/models               租户级模型注册（幂等）。关键形状：name 必须就是调用名（如 Ollama 真实模型名）；parameters 必含 base_url（Ollama 端点要带 /v1 后缀，平台按 OpenAI 接口拼 /v1/embeddings）、interface_type="openai"、api_key 非空占位、provider="generic"、embedding_parameters.dimension
POST /api/v1/knowledge-bases      {name, embedding_model_id=<注册后的真实模型 id>}  ← 必须先绑嵌入，否则解析报 model ID empty
POST /api/v1/knowledge-bases/{id}/knowledge/file    单文件上传（multipart 字段名 "file"；上限默认 50MB）
POST /api/v1/knowledge-bases/{id}/hybrid-search     {query_text, top_k}
POST /api/v1/sessions + /api/v1/sessions/{sid}/chat 问答（agent_enabled:false 走直答管线，带引用）
```

坑：PATCH models 的 parameters 更新会静默失效——改模型配置删旧重建；新建 KB 时 embedding_model_id 必须用注册接口返回的真实 id（非自拟名字）。

## 验收口径（机械实测）

- 内存：`docker exec <c> cat /sys/fs/cgroup/memory.peak` 逐容器求和（覆盖导入+检索+问答全程）
- 检索：三类盲测（字面 / 中文换词 / PDF 内容）top1 命中
- 问答：答案长度合理 + 引用文件名真实存在于语料
- 大文件（>10MB）单独分批导入（上游有导入内存放大的 issue 记录）

## 运维要点

- Docker Desktop 有自动清理容器的前科：容器消失后 `docker compose up -d` 重建即回，数据在外置卷不受影响。
- 增量同步：manifest（本地文件 md5 清单）对比后只传新增/变更文件，适合挂每日定时任务。
- 检索参数（RRF k 值/权重/topK/阈值）是租户级 JSONB 配置，可经设置接口调，不必改代码。
