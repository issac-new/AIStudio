---
name: evidence-labeled-research
description: Tag claims with evidence source, re-read configs live first.
---

# Evidence-Labeled Research & Config-State Reporting

## Why this exists (user correction history)

The user rejected two full report rounds in one session:
- "这个方案里有很多幻觉（此前讨论的内容 不等同真实决策），进行复盘重构，出一个准确的方案" (twice)
- "实证下 不要瞎说（比如：所有的模型配置应该都是 ccswitch的aim）"

Root causes, in order of severity:
1. **Snapshot rot**: reports cited config state read earlier in the session, but configs had changed since (user edits, other agents, cron). An old `read_file` is NOT current state.
2. **Proposal→decision drift**: things the assistant *suggested* in earlier turns reappeared in later reports as "we decided X" / "current policy is X".
3. **Plausible fabrication**: invented CLI commands (`ccswitch reload`), invented quota policies ("GLM 30%/K3 40%"), invented KPI baselines, invented monthly costs — none ever verified by a tool call.

## Evidence label taxonomy (mandatory on every claim)

Tag each key claim at first mention:

| Label | Meaning | Proof attached |
|---|---|---|
| **[实证]** | Verified by a tool call THIS session | show the command + output summary |
| **[文章]** | Quoted from a researched source | name the source/article |
| **[指令]** | Explicit user decision this session | quote the user's words |
| **[建议—待确认]** | Your proposal — NOT a decision | mark clearly, never present as fact |

A proposal the user has not approved is never "current state". In later turns, re-check: did the user actually approve it? If not, it is still [建议—待确认].

## Hard rules

1. **Live re-read rule**: before ANY claim of the form "all N profiles set X" / "config is Y", re-read the configs IN THE SAME TURN and show the sweep output (e.g. `grep -rh ... | sort | uniq -c`). Never cite a file snapshot from earlier in the session.
2. **Fresh data wins**: when a stored summary/old read contradicts a fresh run, the fresh run wins — say so and self-correct visibly.
3. **No invented specifics**: commands never run, quotas never measured, KPIs never baselined, dollar figures never queried — mark [建议—待确认] or omit. Never dress a guess as an observation.
4. **Credential hygiene in evidence work**: never print key values — list keys with `grep -n "^[A-Z_]*=" .env | sed 's/=.*/=<REDACTED>/'`; for live API probes, read the key from its file into a variable, never echo it.
5. **Before/after pairs**: for any config change, report the verification sweep (YAML parse N/N pass, residue grep = 0, live endpoint probe) — not "done".

## Theory anchors (added 2026-09-08, 知识底座融合 A7+D9)

**科学素养参照（A7）**：本 skill 的证据分级目标与通识科学教育同构——教会信息使用者区分数据与谬误（"endow people with the mental tools to separate the wealth of data from the morass of misinformation"）。[实证] 标签即这一素养目标的操作化：可复跑的工具输出优先，自报叙述降级。

> 来源: synthesis-fusion-plan.md A7 / chem-bio-3books-report.md C2（生物学与生活 Pearson 官网原文+豆瓣译者序双源）

**三表法注脚（D9）**：「论断须有本/原/用」出自《墨子·非儒下》三表法——立论要有历史本证（本）、当下可察的百姓耳目之实（原）、施于政事的实际效用（用）。是「来源标注 + 可验证性 + 实效检验」三要求的中文先声，与本 skill 标签体系的对应关系：[实证]≈原、来源引用≈本、before/after 验证≈用。

> 来源: synthesis-fusion-plan.md D9 / philosophy-logic-report.md §3.1 第 6 条（ctext.org/mozi/zhs 实测 200，目录级）

## CVE / threat-intel verification protocol (lesson from gap-20260904-hack-003)

1. **News-article CVE scores are snapshots, not facts.** Vendor CNA self-scores drift after disclosure (case [实证 2026-09-05]: CVE-2026-6876 was reported 8.7/PR:L on Aug 28; NVD record lastModified 2026-09-01 shows 10.0/PR:N — vendor raised it post-disclosure). Before citing any score, re-pull NVD at analysis time and cite `lastModified`.
2. **KEV feed URL**: use `https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json` (the short `cisa.gov/known-exploited-vulnerabilities.json` URL returned 404 [实证 2026-09-05]). GitHub mirror `cisagov/kev-data` (kev.json, develop branch) is the fallback.
3. **NVD API**: `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=<CVE>`. `vulnStatus=Awaiting Analysis` means the vendor CNA score is the ONLY severity basis — treat NVD enrichment as not latency-free. Some metric entries (SSVC) carry no `cvssData`; guard before reading fields.
4. **Reusable script**: `scripts/cve_kev_nvd_check.py` — run `python3 .../scripts/cve_kev_nvd_check.py CVE-... [CVE-...]`; prints KEV membership + full NVD metric table per CVE. Verified live 2026-09-05 against the ServiceNow Aug-2026 batch.

## Report skeleton (user's 总分总 convention)

- 总：Executive summary — current verified state vs proposed changes, one paragraph.
- 分：Findings, each claim labeled per the taxonomy, each with its proof anchor.
- 总：Recommendations as an explicit [建议—待确认] list, decoupled from the findings above.
- No version/iteration traces in the final document (no "v2", "修订", "与上版相比").

## Fleet config changes discovered during research

When research concludes a config change is needed and the user approves, do NOT hand-edit blindly — follow the backup→edit→verify protocol in `references/fleet-config-edit-mechanics.md` (verified end-to-end 2026-09-01: 31-file unification, YAML 31/31, residue 0, live proxy probe).
