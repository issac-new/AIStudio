---
name: redteam-ai-serving
description: "AI 推理服务层红队测试 — SGLang/vLLM/Ollama/Langflow 等 model server 控制平面 + LiteLLM 等 AI 网关层：fail-open 鉴权矩阵、默认主密钥(sk-1234)、pickle/dill 反序列化端点狩猎、SafeUnpickler 式 denylist 绕过、配置泄露、云元数据窃取与分布式权重面。授权安全测试使用。"
version: 1.2.0
author: "Hermes Agent (gap-20260914-hack-7e8f3c; sources: VicOne / Apoorv Dayal / Antiproof / CERT-CC VU#281278 VU#777338 公开披露; v1.1 gap-20260916-hack-b1620b 增补部署面: FreeBuf 500602 / NSFOCUS CNVD-2025-04094 / CSA 2026-05; v1.2 gap-20260910-hack-c2377c 增补 AI 网关层: Wiz Research《Off Guard》2026-09-09 / The Hacker News 2026-09-10 / CISA KEV CVE-2026-59822)"
license: MIT
metadata:
  hermes:
    tags: [ai-serving-security, ai-gateway, inference-server, pickle-deserialization, sglang, vllm, ollama, langflow, litellm, default-credential, fail-open-auth, CWE-502, CWE-798]
---

# AI 推理服务层红队测试（Inference Serving Layer）

> **定位**：LLM 应用层（prompt/RAG/agentic）由 `llm-redteam` 覆盖；本技能覆盖其下一层——**推理服务基础设施层（model server）与 AI 网关层（LiteLLM 类控制平面）**。model server 不是无状态文本 API，而是控制平面：持有模型权重、云凭据、HF token、TLS 材料，能下载制品、加入分布式组、替换运行中的模型。
> **判据来源**：2026 年 SGLang 反序列化波次（CVE-2026-3059 → 7301/7302/7304 → 15969 等六连 → 86793）与 18 天四 CVE 窗口（NemoClaw 65105 / DeepSeek Harness 82533 / IBM Langflow 81204 / SGLang 86793，2026-08-25~09-11）。

## 测试规则（RoE）

授权门禁沿用 `scope-gate`（consent.txt + 危险操作单独放行 + dangerous.log）。本层追加两条：

1. **marker 纪律**：验证代码执行只用无副作用标记命令（`touch /tmp/<engagement>_RCE_CONFIRMED`），严禁真实反弹/窃取；权重面验证只证明「路由可达 + 认证行为矩阵」，不实际拉取权重。
2. **证据三级标注**（对齐 AGENTS.md 证据强度）：每个 finding 标注 `demonstrated`（实测执行）/ `source-confirmed`（源码确认路径）/ `not-demonstrated`（推断未证），三者不得混写。

## 攻击面一：Fail-open 鉴权矩阵（ADMIN_OPTIONAL 模式）

AI serving 框架常见认证决策树：

```
if endpoint_is_admin_optional:
    if admin_api_key configured: require_admin_key()
    elif api_key configured:     require_api_key()
    else:                        allow_request()   # ← 漏洞放大器：缺省即公开
```

**测试法——四配置行为矩阵**：分别在「无 key / 仅 --api-key / 仅 --admin-api-key / 双 key」四种启动配置下，对全部管理端点逐一探活并记录可达性。高危信号：

- 端点**无认证装饰器**（SGLang 实例：`/server_info`、`/load_lora_adapter_from_tensors` 无 `@auth_level`，任何配置下均公开）
- ADMIN_OPTIONAL 端点在无 key 配置下全部落地为公开（`/update_weights_from_tensor` 等）
- 文档声称「admin 保护」但实现未强制（文档与实现边界不一致本身是 finding）

## 攻击面二：pickle/dill 反序列化端点狩猎（CWE-502）

### 端点指纹清单（按框架）

| 框架 | 入口 | 反序列化点 | 参考 CVE |
|------|------|-----------|----------|
| SGLang | `POST /update_weights_from_tensor`、`POST /load_lora_adapter_from_tensors`（base64 字段 `serialized_tensors`） | `MultiprocessingSerializer.deserialize` → SafeUnpickler | 15969 / 86793 |
| SGLang | ZMQ scheduler ROUTER（`--host 0.0.0.0` 时暴露）、多模态 broker REP（**无条件绑 0.0.0.0**） | 裸 `pickle.loads(payload)` | 7301 / 3059 |
| SGLang | generation 端点 `custom_logit_processor` 字段（hex 编码 dill） | `dill.loads(bytes.fromhex(...))` | 7304 |
| SGLang | `/update_weights_from_disk` 模型加载 | `torch.load` 的 `weights_only=False` 回退（legacy tar/.bin） | 15976 |
| Langflow | graph 构建 / lfx CodeParser | 返回类型注解源码直接 `eval()` | 81204 |
| Ollama 生态 | 管理 API（Host 头校验缺失 + DNS rebinding） | 间接控制 | 65105 |

### SafeUnpickler 式过滤器审计法（denylist 绕过）

典型「安全」unpickler 结构 = **模块前缀 allowlist + 危险函数 denylist**。审计口诀：**denylist 完备性不可证，永远找平行 allow 路径**。

1. allowlist 含整个 `builtins.` 前缀 ≈ 形同虚设：`__import__` 与 `getattr` 不在 denylist 即可链式逃逸：
   `builtins.__import__("os")` → `builtins.getattr(os_module, "system")` → `os.system(cmd)`。
   find_class() 只看到 `("builtins","__import__")`，永远看不到 `("os","system")` 被解析。
2. 即使补上这两个，平行 gadget 族仍在：`operator.attrgetter`、`functools.partial` 等可重建同等能力。**修 payload 不修 class = 打地鼠**；报告结论必须落到「移除可执行数据格式」（safetensors / 约束 schema），而非建议扩充 denylist。
3. 验证 PoC（base64 pickle，marker 命令）：

```python
import pickle, base64
class R:
    def __reduce__(self):
        import builtins
        return (builtins.getattr, (builtins.__import__("os"), "system"))
# 实际链：__import__("os") → getattr(os,"system") → os.system("touch /tmp/<eng>_RCE_CONFIRMED")
```

注意：SGLang 实测中 LoRA 守卫检查发生在反序列化**之后**，服务器返回 400 时 payload 已执行——HTTP 错误码 ≠ 未执行，须以 marker 文件为准。

### weights_only=False 回退检测

源码模式：`try: torch.load(ckpt, weights_only=True) except RuntimeError as e: if "legacy .tar format" in str(e): torch.load(ckpt, weights_only=False)`——**安全回退方向反了**：被受限加载器拒绝的文件获得危险行为重试。测试：构造 legacy tar 格式恶意 checkpoint 经 HTTP 路径投递，marker 在架构/形状校验之前即执行。

## 攻击面三：配置序列化泄露（/server_info 类）

端点用 `dataclasses.asdict(server_args)` 宽序列化内部配置对象直接返回 → `api_key`、`admin_api_key`、`ssl_keyfile_password` 随响应泄露。两条升级链：

- 仅 `--admin-api-key`：未认证请求直接拿回 admin key 明文
- 双 key：普通 api-key 持有者应得 admin key → 管理面全通

审计要点：宽序列化 + 事后打地鼠式字段脱敏 = 反向安全模型（未来每个新增 secret 字段默认公开）。报告建议必须是**显式 allowlist 响应 schema**。

## 攻击面四：分布式权重面

- 未鉴权 peer enrollment：HTTP 请求字段（master_address/port/rank/world_size）直入 `torch.distributed` 初始化，caller 自选 peer 即成为集群成员 → `named_parameters()` 全量广播 → 模型权重外泄（CVE-2026-15978）
- 反向路径（权重注入）如未实测，标注 `not-demonstrated`
- 组合链：`/server_info` 泄 key → 认证分布式路由 → peer enrollment → 权重广播

## 部署面攻击：本地推理服务公网暴露（v1.1 增补，gap-20260916）

模型 server 的 RCE/反序列化是高端攻击；更高频的现实入口是**部署配置直接把无认证 API 暴露到网络可达位置**。Ollama 是样本量最大的实例（CNVD-2025-04094，2025-03 披露且已在野利用）。

### 事实基线（三角验证过，引用时勿复述谣言）

- **默认绑定是 127.0.0.1:11434，不是 0.0.0.0**。流行文章（含 FreeBuf 500602）普遍写错。暴露全部源于部署选择：`OLLAMA_HOST=0.0.0.0`、Docker `-p 11434:11434`、云厂商模板、frp/nps 内网穿透。审计报告若断言「默认监听所有接口」即为误报信号。
- Ollama **原生零认证**：无 API key、无 Basic Auth、无 mTLS。网络可达 = 与本地管理员等价的 API 权限。
- 暴露规模锚点：Cisco Shodan 实测 1,139 实例（~20% 可未授权推理）；CSA 2026-05：5,200+ 直连实例中 31%（1,652）响应未授权 prompt；SecurityWeek 估约 30 万互联网可达。

### 暴露→窃取攻击链（授权测试 SOP）

```
1. 探活     GET  /api/version、/           → "Ollama is running"
2. 枚举     GET  /api/tags                  → 模型清单/大小/时间（技术栈画像）
3. 状态     GET  /api/ps                    → 运行中模型 + GPU 占用
4. 泄露     POST /api/show {name}           → 系统提示词/模板/参数/许可证
                                            （system prompt 常含内网 API 地址、数据库凭证）
5. 越狱     POST /api/chat                  → 结合 llm-redteam prompt 注入
6. 窃取     POST /api/pull {model}          → 攻击者侧拉取同款权重（商用模型资产流失）
            或 attacker 对 /api/show 提取 Modelfile 后重建
7. 破坏     POST /api/delete、/api/pull 大模型 → DoS / 磁盘撑爆
8. 横向     /api/pull 接受任意 registry URL → 恶意模型引入（供应链 + GGUF 解析内存安全）
```

RoE 约束：窃取步骤在授权测试中只证明到「路由可达 + 返回 200 + blob digest 可见」即止，不实际传输权重；marker 纪律同上。

### 部署面加固 checklist（报告修复段模板，按优先级）

| 层 | 措施 | 验证命令 |
|---|---|---|
| P0 网络 | 回环绑定 `OLLAMA_HOST=127.0.0.1:11434` | `ss -tlnp \| grep 11434` 输出仅 127.0.0.1/[::1] |
| P0 网络 | 防火墙/安全组禁外部 11434（需远程时走 VPN/SSH 隧道） | 外部主机 `curl http://IP:11434` 超时 |
| P1 边界 | 反向代理（nginx/Caddy）+ Basic Auth/API key + HTTPS，禁 /api/create、/api/delete、/api/pull 直通 | 未带凭据 curl 返回 401/403 |
| P1 容器 | 不用 `-p 11434:11434` 直映射；容器加 `read_only`/`cap_drop: ALL`/`no-new-privileges` | `docker inspect` 核对 |
| P2 模型 | 模型目录 `chmod 700 ~/.ollama/models`；blob SHA256 基线比对（防篡改/投毒） | `sha256sum ~/.ollama/models/blobs/*` 对基线 |
| P2 检测 | 监控 /api/pull、/api/delete、/api/create 异常调用；配置漂移审计（bind 地址 CI 检查） | 定时 `ss -tlnp` 断言 |

通用化：任何「零认证 + 配置驱动绑定」的 model server（vLLM `--host`、llama.cpp `--host 0.0.0.0`、LM Studio 1234、GPT4All 4891）同链路同 checklist，端口面见 Cisco Shodan case study 端口表。

## 部署面攻击：AI 网关默认主密钥与认证缺口（LiteLLM 案例，v1.2 增补，gap-20260910-hack-c2377c）

网关层与 model server 层的共性：**部署配置错误就是 pre-auth 入口**。LiteLLM（BerriAI，统一 100+ 模型供应商的 OpenAI 兼容 AI 网关，Wiz 遥测约 1/3 云环境有部署）是样本量最大的实例——主密钥（master key）同时是管理员凭据与鉴权开关，一份文档示例值被近 1/10 暴露实例原样沿用（Wiz Research 2026-02 Shodan 扫描 3,074 实例，2026-09-09 披露，DEF CON 34 报告）。

### 事实基线（三角验证过，引用时勿复述谣言）

- **9.6%（294/3,074）暴露实例接受示例主密钥 `sk-1234` 或完全无认证**；其中 191 个未设任何 master key——<1.82.0-stable 无 key 启动 = 所有请求自动获得 PROXY_ADMIN（无 CVE 设计行为，随 CVE-2026-59821 一并修复）。出处：Wiz《Off Guard》2026-09-09 + The Hacker News 2026-09-10 + thecybersignal/requesty 转载，三源一致。
- **`sk-1234` 至今印在官方 setup guide**（截至 2026-09-09 仍在，上方注释要求替换为随机值——注释挡不住复制粘贴部署）。审计报告若断言「文档已删除示例值」即为过时误报。
- **2026-08 复扫 >85,000 实例**，但 Wiz 判断多为蜜罐/测试系统，与 2 月口径不可比；**生产部署无现势数字**。引用「8.5 万暴露」即为口径误用。
- CVE-2026-59822（MCP 认证绕过，CVSS 8.8）2026-09-02 入 CISA KEV（联邦修复截止 09-16），Wiz 蜜罐自 2026-07-07 观测在野利用（单字符 Bearer 探测模型列表）——默认密钥不是纯卫生问题，是活跃利用链入口。
- **严重度争议判例**：同一 CVE-2026-59821，Wiz 定性 post-auth root RCE（实测 `uid=0(root)`），LiteLLM 官方通告仅评 Low CVSS 2.1（「需高权限账号」）——维护者威胁模型假设 admin 可信，与默认密钥现实脱节；引用厂商评分必须并排争议。
- 平行利用链（Microsoft 2026-08 案例）：CVE-2026-42271（CVSS 8.7，两个 MCP test 端点任意认证用户命令执行）+ CVE-2026-48710（Starlette host-header）链成**无凭据**命令执行，在野被用于装挖矿木马；攻击者从容器环境提取 master key、provider keys、DB 连接串 → 直连 PostgreSQL 拖库。「AI 网关当 Tier-0 secrets store 防」（Microsoft）。
- 攻击面三角（Wiz 用 Claude Code 审 LiteLLM 源码定位）：MCP 端点独立认证处理器（`user_api_key_auth_mcp.py`）、custom code guardrails（`guardrail_endpoints.py`，`exec(compile(...))`）、pass-through 端点（`pass_through_endpoints.py`，转发任意 URL 无校验）。

### 攻击链（授权测试 SOP，curl-first）

```
1. 探活      GET /、/health/liveliness        → 网关指纹与版本
2. 认证矩阵  GET /key/info 四凭据态：无头 / sk-1234 / 垃圾串 / 正常 vkey
             → 200 with sk-1234 = 默认主密钥；200 无头 = 无认证模式（PROXY_ADMIN）
3. 提权验证  GET /user/info、/view/users、/model/info（带 sk-1234）→ 管理面可达性
4. 凭据库    GET /key/info 枚举 → 各 team/key 元数据与预算面
5. 云凭据    POST /passthrough/<route> 指向 169.254.169.254/latest/meta-data/iam/...
             + x-pass- 前缀头穿透 IMDSv2（pass-through 无 URL 校验，设计内行为，无 CVE 无修复）
6. RCE 升级  <1.82.0：POST /guardrails custom_code → exec(compile(...)) 无沙箱、
             不清空 __builtins__（test 端点清了、注册端点没清，Python 会自动重灌 builtins）
             → 容器内 root RCE（CVE-2026-59821，默认 Docker 镜像 root 运行；修复 PR #22095）
             平行：POST /mcp-rest/test/connection、/mcp-rest/test/tools/list、/guardrails/test_custom_code（CVE-2026-42271）
7. MCP 横向  POST /mcp/ Bearer <任意串> → CVE-2026-59822：token 校验 401 被吞、空 auth 对象放行
             → allow_all_keys 配置下全部 MCP 工具面（DB 查询/CI/Jira/文件系统）
```

RoE 约束：步骤 5-6 只证明「路由可达 + 响应结构确认」即止，不窃取真实 IAM 凭据、不执行破坏性命令；marker 纪律同前（`touch /tmp/<engagement>_RCE_CONFIRMED`）。

### 加固 checklist（报告修复段模板，按优先级）

| 层 | 措施 | 验证方法 |
|---|---|---|
| P0 凭据 | 轮换所有非常随机的主密钥；`sk-1234` 永不入产；曾用默认值的下游 provider key 全部轮换 | 用 sk-1234 打 /key/info 必须 401 |
| P0 版本 | 升级 ≥1.84.0（覆盖本波全部修复；1.82.0 起无 key 启动不再自动 PROXY_ADMIN） | 版本端点/镜像 tag 核对 |
| P0 应急 | 主密钥轮换先确认是否设独立 salt key（流程不同，用错致存量凭据不可读）；**升级不清除攻击者已注册 guardrail / 添加的 SSH key**——重启进程清内存代码 + 逐条审查 guardrails 列表 + 全量轮换 provider/master/DB 凭据 | guardrails 列表 diff + 新增 key 审计 |
| P0 网络 | 网关不暴露公网；管理面（/user/*、/key/*、/guardrails、/passthrough 管理）独立 listener 内网绑定 | 外部 curl 超时；仅业务面可达 |
| P1 边界 | OIDC/mTLS 前置；MCP 端点禁 allow_all_keys（按 team 授权）；pass-through 路由 URL allowlist | 垃圾串 Bearer 打 /mcp/ 必须 401 |
| P2 检测 | 监控 sk-1234 认证成功、/guardrails 写操作与 /guardrails/test_custom_code、/mcp-rest/test/*、/passthrough 新建、/mcp/ 异常会话；无法升级时反代直接封 /mcp/ 与 test 端点 | SIEM 规则 + 暴露面外部扫描 |
| P2 云 | LiteLLM 服务账号最小 IAM（Bedrock invoke/Vertex 授权而非 `*`）；禁用 IMDSv1、metadata hop 限制 | IAM policy diff + IMDS 探测 |

### 网关层判读要点（白盒视角）

- 主密钥双重角色（admin 凭据 + 鉴权开关）= 单点失效设计；审计任何 LLM 网关先问「master key 泄露的爆炸半径」
- 「threat model 把 admin 视为可信」在默认凭据横行的现实中已被打破——pass-through 元数据窃取无 CVE 无修复，链入默认密钥即等效 pre-auth
- MCP 认证 fallback（合法 OAuth2 token 与垃圾 token 不区分、401 被吞、空 auth 对象放行）= fail-open 家族新形态，与攻击面一矩阵同源
- 链式结论：默认凭据/无认证 → guardrails RCE（root）→ IMDS 云凭据 → 云环境接管，「AI 网关当 Tier-0 secrets store 防」（Microsoft 语，经 Wiz 引述）

## 邻近模式速查（同窗口另三框架）

| 模式 | 机制 | 实例 |
|------|------|------|
| DNS rebinding + Host 头校验缺失 | 一次网页访问 → 未鉴权管理 API | NemoClaw/Ollama CVE-2026-65105 |
| agent runtime 本地未鉴权 API | 沙箱内一条 curl 调本地端口 API → 关闭全部 confinement（danger-full-access） | DeepSeek Harness CVE-2026-82533 |
| eval() 伪沙箱 | `eval(expr, {"__builtins__": {}}, ns)` 仍可经字面量→`__class__`→`__subclasses__` 图恢复模块引用；`bool()` 包裹只使其变盲，不阻止副作用 | Langflow CodeParser / SGLang dumper（需 DUMPER_SERVER_PORT） |
| 文档示例密钥当真凭据 | setup guide 印 `sk-1234`，运维复制粘贴进产线；master key 兼任鉴权开关，无 key 启动即全员 PROXY_ADMIN | LiteLLM（9.6% 暴露实例，Wiz 2026-09） |
| 认证 fallback 吞 401 | MCP 端点双认证路径：LiteLLM key 校验失败回退 OAuth2 透传，垃圾 token 与合法 token 不区分，返回空 auth 对象 | LiteLLM CVE-2026-59822（CISA KEV，CVSS 8.8） |

## 防护与检测清单（报告修复段模板）

1. **fail-closed**：管理路由无凭据时拒绝启动/拒绝公开 bind，而非警告了事
2. **管理面分离**：模型加载/权重传输/profiling 独立 listener，默认私有绑定
3. **非可执行格式**：网络面张量只用 safetensors；legacy pickle checkpoint 不给不安全重试
4. **显式响应 schema**：运营端点返回 allowlist 模型，禁止宽序列化内部配置
5. **peer 即身份**：权重传输通道 mTLS + 运营方 peer allowlist + egress 策略禁任意出网
6. **检测**：监控 `/server_info`、`/update_weights_from_*`、tensor 更新路由、分布式权重组路由的异常请求；SGLANG_USE_PICKLE_IPC=false（兼容时）

## CVE 案例台账（2026，SGLang + LiteLLM 波次）

| CVE | 时间 | 类 | 研究者/协调 |
|-----|------|----|------------|
| CVE-2026-3059 | 03 | ZMQ broker 裸 pickle.loads，无条件绑 0.0.0.0 | Orca |
| CVE-2026-7301/7302/7304 | 05 | scheduler pickle / 路径穿越任意写 / dill logit processor | Antiproof, VU#777338 |
| CVE-2026-15969 等六个 | 07 | SafeUnpickler builtins 绕过（/load_lora_adapter_from_tensors）、dumper eval 逃逸、多模态 SSRF、weights_only 回退、/server_info 泄 key、peer enrollment | Apoorv Dayal, VU#281278 |
| CVE-2026-86793 | 09-11 | SafeUnpickler builtins 绕过**再现**（/update_weights_from_tensor）——7 月修复未关 class | VicOne Reuel Magistrado |
| CVE-2026-59821 | 09-09 | custom code guardrails `exec(compile(...))` 无沙箱不清 builtins → 容器 root RCE；PR #22095 修复 | Wiz Research（DEF CON 34） |
| CVE-2026-59822 | 09-09 | MCP 认证 fallback 吞 401 返回空 auth 对象 → 任意 Bearer 串建会话；**已入 CISA KEV + 蜜罐观测在野利用** | Wiz Research（DEF CON 34） |
| CVE-2026-42271 | 06 前 | 两个 MCP test 端点任意认证用户命令执行（CVSS 8.7）；与 CVE-2026-48710（Starlette host-header）链成无凭据 RCE，在野装挖矿 | Horizon3.ai / Microsoft 案例 |
| CVE-2026-40217 | 05 | 沙箱字节码逃逸，代码运行于 proxy 进程（默认镜像 root）；影响 1.81.8~1.83.10 | LiteLLM 官方通告 |

教训锚点：同一 gadget 类六周内两次独立披露（15969 → 86793），实证「denylist 修复 = 打地鼠」。

## 参考资源

- VicOne 技术分析（CVE-2026-86793，2026-09-11）
- Apoorv Dayal《Breaking SGLang's Trust Boundaries》+ CERT/CC VU#281278：https://thoughts.apoorvdayal.com/posts/sglang-disclosures/
- Antiproof《Three RCEs in SGLang》+ VU#777338：https://antiproof.ai/blog/three-rces-in-sglang/
- GitHub sgl-project/sglang issue #30165（SafeUnpickler bypass 复现路径）
- 部署面（v1.1）：NSFOCUS CNVD-2025-04094 公告（2025-03，确认默认绑 127.0.0.1）；Cisco《Detecting Exposed LLM Servers: A Shodan Case Study on Ollama》（1,139 实例实测）；CSA《Exposed AI Infrastructure》research note（2026-05，31% 未授权推理率）；ollama/ollama#16236（官方确认默认 bind + 545 实例 Shodan 实证）
- AI 网关面（v1.2）：Wiz Research《Off Guard: Breaking LiteLLM from authentication bypass to cloud compromise》2026-09-09（DEF CON 34 报告；294/3,074=9.6% 默认密钥率、CVE-2026-59821/59822、PR #22095、IMDS x-pass- 穿透）；The Hacker News 2026-09-10《Nearly 1 in 10 Exposed LiteLLM Gateways Accepted the Example "sk-1234" Admin Key》（2026-08 复扫 8.5 万多为蜜罐的口径警告）；CISA KEV CVE-2026-59822（2026-09-02 入库，联邦修复截止 09-16，蜜罐观测自 07-07）；BerriAI/litellm PR #22095（commit e50b4486）；THN 全文镜像 news.lavx.hu（CVE-2026-42271+48710 挖矿链 / Microsoft Tier-0 案例 / 1.84.0 修复基线 / salt key 轮换告警 / 升级不清除持久化 guardrail）
- 关联技能：`llm-redteam`（应用层）、`redteam-ssrf`（多模态 URL 抓取面）、`redteam-auth`（通用认证）、`fp-check`（finding 六门复核）、`target-scoped-workspace`（产物落盘规范）
