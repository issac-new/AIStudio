---
name: wih-secret-hunter
description: "纯 Python Web 敏感信息提取引擎：JS chunk 4 级瀑布解析(HTML→Webpack/Vite/Next.js)挖掘云凭据/AK/JWT/身份证。来源 ARL-Next(GPL-3.0)。"
version: 1.0.0
author: Hermes Agent (ported from owl234/ARL-Next)
license: GPL-3.0
metadata:
  hermes:
    tags: [recon, sensitive-info, js-analysis, cloud-credentials, wih, arl-next]
    source: "https://github.com/owl234/ARL-Next/tree/main/backend/app/services/wih"
    ported: "2026-09-08"
    scope: hack-recon 主用；hack-exploit/auditor 可复用
---

# WIH Secret Hunter — Web 敏感信息提取引擎

> 移植自 ARL-Next（ARL 灯塔现代化重构版）的纯 Python WIH 引擎，剥离 MongoDB/Celery 依赖，
> 收敛为自包含单文件 `scripts/wih_engine.py`（~800 行，仅依赖 requests，PyYAML 可选）。

## 机制（对应源码锚点）

| 能力 | 源锚点 | 移植锚点（wih_engine.py） |
|---|---|---|
| 4 级瀑布 chunk 发现：HTML→Next.js manifest→Webpack 3/4/5/Vite→generic 启发 | `services/wih/chunk_parser.py` | `WebpackChunkParser` (§5) |
| 38 条敏感规则：阿里/腾讯/京东/火山/金山/GCP/AWS AK ID、JWT、身份证、secret_key 键值对 | `dicts/wih_rules.yml`（38 rules） | `scripts/wih_rules.yml` + `WihRuleEngine` (§4) |
| FNV-1a 64-bit 按 (hash, site) 去重（跨域同文件不误合并） | `services/wih/fnv1a.py` + `modules/wihRecord.py` | `fnv1a_64` + `WihRecord` (§2/§3) |
| 风险三级分级（CRITICAL/MEDIUM/LOW） | `modules/wihRecord.py:risk_level` | `WihRecord.risk_level` |
| exclude_rules 反误报（target/content/source/source_tag 四维） | `rule_engine.py:ExcludeRuleMatcher` | `ExcludeRuleMatcher` (§4) |
| 流式下载防 OOM（5MB 截断 + 30s Slowloris 超时 + 连续 5 错停） | `hunter.py:_safe_stream_get` | `_safe_stream_get` (§6) |
| 零依赖 YAML fallback 解析器（PyYAML 缺失自动降级） | `rule_engine.py:_parse_yaml_fallback` | `WihRuleEngine._parse_yaml_fallback` |

## 何时用

- 授权渗透测试的侦察阶段：从目标 Web/JS 资产挖掘泄露的云凭据、AK/SK、JWT、内网域名、身份证
- SPA 深挖：入口 HTML 只有一行 `<script src>` 时，靠 Webpack/Vite/Next.js chunk 瀑布自动展开动态 JS
- 已有站点列表（来自 subfinder/amass/httpx 产出的存活 Web 资产）后的敏感信息批扫

## 用法（copy-paste 可执行）

```bash
ENGINE=~/.hermes/skills/hack-team/wih-secret-hunter/scripts/wih_engine.py

# 基础扫描（默认 38 条规则；结果 JSON 落盘 + stdout 精炼摘要）
python3 $ENGINE --sites https://target.example.com --max-chunks 50

# 只看高危（stdout 过滤；JSON 仍全量）
python3 $ENGINE --sites https://target.example.com --min-risk CRITICAL

# 多站点 + 代理（Burp/HTTPX 抓包链）+ 自定义规则
python3 $ENGINE --sites https://a.example.com https://b.example.com \
    --proxy http://127.0.0.1:8080 --rule-file ./my_rules.yml --output recon/$APEX/wih.json

# 自检（9+3 断言全 PASS 才算可用）
python3 /tmp/test_wih_engine.py && python3 /tmp/test_wih_edge.py
```

退出码：`0`=有发现，`1`=无发现（fail-closed 语义，可接 evidence_gate），`2`=运行错误。

## 与本机 hack 体系的接线

- **上游输入**：hack-recon 存活站点清单（`recon/$APEX/httpx_probed.txt`），逐行 URL 喂 `--sites`
- **下游输出**：JSON records 与 `evidence_gate.py` 同构（content/source 键）→ 直接作为 evidence 入库 `hack-kb/`
- **云凭据验证**：AK ID 格式命中后，配合 `_shared/scripts/verify_finding.py` 做执行级验证（ARL 原 verifier.py 仅做格式校验，主动云 API 验证需用户显式授权——遵守 constraint-policy 风险门）
- **Scope 门**：扫描前必须已固化 `scope.txt`（`_shared/constraint-policy.md` §二），禁止越界站点

## 红线

1. 仅限授权范围；每次运行前核对 scope.txt
2. 只做被动抓取与正则提取，**不做**主动云 API 凭据验证（除非用户显式批准）
3. 发现的凭据在报告中脱敏（保留前 8 字符 + hash），完整值仅存 evidence 目录

## 测试证据（2026-09-08 实测）

- 单测：本机回环 HTTP 假 SPA（注入合成 JWT/AK/secret_key/身份证）→ 9/9 断言 PASS
- 边界：Next.js `_buildManifest.js`→chunk 瀑布三层链路 PASS；exclude_rules 屏蔽后 exit=1 PASS；
  零依赖 fallback 解析默认规则（30 rules/2 exclude）PASS
- 已知语义：同一敏感值在同站点 page/inline 双来源时按 (fnv_hash, site) 合并保留单一记录（源设计如此，
  「跨域不误去重」指跨 site，非同 site 跨 source_tag）

## 修订记录

| 版本 | 日期 | 内容 |
|---|---|---|
| 1.0.0 | 2026-09-08 | 自 ARL-Next main 分支移植：hunter 265L + chunk_parser 293L + rule_engine 311L + fnv1a 46L + WihRecord + verifier 格式校验注释保留；Mongo/Celery/Config 剥离 |
