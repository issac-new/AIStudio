# gap-20260926-004 差距分析：搭建 AI 渗透复现框架

- **卡**: t_07a887e1 | **域**: hack | **证据**: llm_advice:hack:2026-09-26 | **日期**: 2026-10-09
- **判定**: **ADOPT**（框架已建成并落盘，A/B 动态复现受环境卷故障阻塞，见 §4）

## 1. 缺口确认（差距分析）

缺口原文：**缺乏 AI 接口漏洞标准化复现流程**。

现状核查：
- `hack-team/redteam-ai-serving` 已有 LiteLLM 攻击面知识 + CVE 案例台账（含 CVE-2026-59822 行），
  但**只有「是什么漏洞」，没有「怎么标准复现」**——台账行不等于可重复的复现脚本与判定协议。
- 各 hack profile 复现 AI 接口漏洞时靠临时拼 curl，无统一 ENV/RECON/EXPLOIT/VERDICT 流程，
  无 A/B 版本对照，无上游数据流证据，导致：① 每次从零摸索环境依赖（litellm[proxy] extras、prisma、DB 要求）；
  ② 误报/假阴性风险（异常码选择错误）。这与「降低 50% 复现工时」的提升方向对应。

## 2. 改进方案（已实施）：AI 渗透复现框架

交付物（落盘位置见 §5）：
1. **7 步复现法**（SAST 定位 → 情报三角 → ENV → 双 oracle 设计 → RECON → EXPLOIT → VERDICT A/B）。
2. **版本无关判定协议**：oracle_A（HTTP status + tools/list）∧ oracle_B（上游 canary REQUEST_LOG 增量），
   判定 VULNERABLE / PATCHED / INCONCLUSIVE，双 oracle 免疫 proxy 异常误报。
3. **模板化套件**（4 件套）：`fake_mcp_server.py`（上游 canary）、`config.yaml`（A/B 共用）、
   `start_victim.sh`（venv/db/port 三参启动）、`poc_<CVE>.py`（单脚本复现）。
4. **SKILL 文档** `ai-pentest-repro-framework-SKILL.md`：流程 + LiteLLM CVE-2026-59822 案例 + 环境坑。

### LiteLLM 案例验证（框架的 worked example）

- **CVE-2026-59822 / GHSA-7488-6r32-c95q**（CWE-287/306, CVSS 8.8, CISA KEV 2026-09-02, Wiz Research），
  影响 litellm < 1.84.0 —— 三方（OSV/NVD/GHSA）一致。
- **白盒根因已确认（人工数据流可达，反幻觉）**：
  - 受影响版 1.83.3 `user_api_key_auth_mcp.py:136-151`：`except HTTPException: if status in (401,403):
    validated_user_api_key_auth = UserAPIKeyAuth()` —— 伪造 Bearer 触发 401 后被静默换成匿名空 auth，
    请求继续进入 MCP tooling。
  - 修复版 1.104.2 `_admission_failure_fallback()`：只对真 passthrough cold-start 放匿名，其他 401 `raise exc`。
- **框架判定已设计并落盘**：同一 PoC 对 1.83.3(:4101) 与 1.104.2(:4102) 跑，前者 200+tools+上游 log 增量
  → VULNERABLE，后者 401 → PATCHED。

## 3. 效能论证（50% 降低复现工时的机制）

| 传统每次临时拼 | 本框架一次沉淀后 |
|----------------|------------------|
| 猜环境依赖（extras/prisma/DB）| SKILL 记录坑，ENV 步骤照抄 |
| 单 oracle 靠响应体猜 | 双 oracle 版本无关判定 |
| 白盒/动态割裂 | SAST 根因直接驱动 EXPLOIT 向量 |
| 结论不可复用 | 4 件套模板换 CVE 即复用 |

机制上把「每次从零摸索」压缩为「填 CVE + 换目标」，支撑 50% 工时下降（实测工时对比需后续卡在真实多 CVE 上采样）。

## 4. 未完成部分（诚实边界）

**A/B 动态复现未能完成**——非方法论问题，是**环境故障**：
- 任务 workspace（`/Volumes/YOURVOLUME/lab/.../gap-20260926-004`）在 A/B 启动阶段遭遇**卷级内容访问被拒**
  （`dd`/`touch`/`cat` 均 `Operation not permitted`，卷挂载表正常、非只读）。
- canary 停止写日志、litellm victim 启动到 DB 阶段被拒、PoC 无法写 evidence——A/B 两步均无法推进。
- **产物抢救**：全部框架文件 + 漏洞源码已转移到**可访问的共享 scratch**（见 §5）。
- 恢复路径：卷访问恢复后，按 SKILL 的 A/B 命令段重跑即可完成 VERDICT（ENV 已在 SKILL 详述）。

**非阻塞**：白盒根因（步骤 1）与判定设计（步骤 4-7 设计）已完成且经人工确认；仅「按脚本跑出两版 status」未执行。

## 5. 产物清单

| 文件 | 说明 |
|------|------|
| `.../gap-20260926-004-repro/ai-pentest-repro-framework-SKILL.md` | 框架 SKILL（7 步法 + 案例 + 坑） |
| `.../gap-20260926-004-repro/pocs/poc_cve_2026_59822.py` | 单脚本复现 PoC（oracle_A） |
| `.../gap-20260926-004-repro/pocs/fake_mcp_server.py` | 上游 canary（oracle_B） |
| `.../gap-20260926-004-repro/pocs/config.yaml` | A/B 共用 victim 配置 |
| `.../gap-20260926-004-repro/pocs/start_victim.sh` | venv/db/port 三参启动 |
| `.../gap-20260926-004-repro/vuln_user_api_key_auth_mcp_1833.py` | 受影响版源码（根因取证） |

前缀 `.../` = `/Users/YOURNAME/.hermes/profiles/_shared/03-evolution-memory/tmp/`

## 6. 建议后续

1. **卷恢复后补跑 A/B**：按 SKILL 复现命令段，产出 `poc_4101_result.json`(VULNERABLE) + `poc_4102_result.json`(PATCHED)，
   作为 evidence 补进本卡。
2. **框架推广**：将 SKILL 安装到 hack-team 链接板（`redteam-ai-serving` 已在 §联动声明），供 exploit 团队复用。
3. **效能采样**：后续 2-3 个 AI 接口漏洞用本框架复现，实测工时对比，把「50%」从机制论证升级为实测数据。
