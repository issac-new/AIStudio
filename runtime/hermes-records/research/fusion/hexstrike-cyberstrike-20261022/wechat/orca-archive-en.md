---
id: 2026-09-22-vulnhouse-100h-agent-pentest
title: "100 hours, one agent: what the VulnHouse autonomous-pentest marathon produced"
title_zh: "100 小时、一个 Agent：VulnHouse 自主渗透马拉松的战报"
title_ja: "100時間、1つのエージェント：VulnHouse自律ペンテストマラソンの戦果"
title_ko: "100시간, 하나의 에이전트: VulnHouse 자율 펜테스트 마라톤의 결과"
title_de: "100 Stunden, ein Agent: Was der autonome Pentest-Marathon von VulnHouse hervorbrachte"
title_fr: "100 heures, un agent : ce qu'a produit le marathon de pentest autonome de VulnHouse"
title_es: "100 horas, un agente: lo que produjo el maratón de pentest autónomo de VulnHouse"
date: 2026-09-22
date_raw: "2026-09-22"
date_precision: day

kind: research
type: [WEAPON]
severity: high
confidence: A
real_harm: false
ai_involvement: confirmed

region: [CN]

summary: |
  **The first publicly streamed 100-hour unattended agent pentest marathon concludes: 464 tasks, 233 verified passes, 19,340 points — a 78.5% pass rate on the 297 tasks the agent actually ran to verification (50.2% of the full 464).** Running 7–11 September and live-streamed by the Chinese bug-bounty platform **VulnBox (Douxiang Technology)** as the "Cyber Driver Plan", the challenge put **Waqi AI Desktop with its Sonic Harness** — a Manager/Executor/Auditor loop built for long-horizon tasks — against **VulnHouse**, a benchmark lab of hundreds of web tasks, real-CVE reproductions, source-audit and memory-safety PoCs, with an independent verification engine scoring each submission. The numbers: **90.8% phase success over the first 72 hours** (197/217), throughput of 5–6.25 tasks/hour (≈120–150/day at peak), a **54-second** fastest solve (a CWE-200 leak, one-shot), and a "comeback" case — a JBoss deserialisation task where the agent, lacking Java and unable to download a JDK, located a bundled JRE in an unrelated application, rebuilt its payload and finished the RCE in **33 minutes 11 seconds across 104 tool calls, six strategy shifts and three self-corrections**. The organisers are candid about the limits: stability still depends on harness, tool-chain and verification infrastructure, and complex or tool-poor environments still cause thrashing. Recorded `research` / `WEAPON` / `high` / `real_harm: false`

summary_zh: |
  **首场公开直播的 100 小时无人值守 Agent 渗透马拉松收官：464 道题、233 次验证通过、19,340 分——对实际跑完验证的 297 道，通过率 78.5%（对全部 464 道为 50.2%）。** 挑战于 9 月 7–11 日进行，由中国漏洞赏金平台**漏洞盒子（斗象科技）**以「赛博司机计划」名义直播：**蛙池 AI Desktop 搭载 Sonic Harness**——为长程任务设计的 Manager/Executor/Auditor 三角循环——对阵 **VulnHouse**：一个包含数百道 Web 题、真实 CVE 复现、源码审计与内存安全 PoC 的评测靶场，由独立验证引擎对每次提交判分。关键数据：**前 72 小时阶段成功率 90.8%**（197/217）；吞吐 5–6.25 题/小时（峰值约 120–150 题/日）；最快 **54 秒**通关（一道 CWE-200 信息泄露，一次提交即过）；以及一个「逆风破局」案例——JBoss 反序列化任务中，环境没有 Java、JDK 也下载超时，Agent 在无关软件中找到了自带的 JRE，重建载荷，以 **104 次工具调用、6 次策略转向、3 次自我修正、33 分 11 秒**完成 RCE。主办方对局限同样坦率：稳定发挥仍依赖 Harness、工具链与验证机制，环境复杂或工具缺失时仍会反复碰壁。本条记为 `research` / `WEAPON` / `high` / `real_harm: false`

summary_ja: |
  **公開ライブ配信された初の100時間無人エージェントペンテストマラソンが終了：464タスク、233件の検証済み成功、19,340点——実際に検証まで完走した297タスクで通過率78.5%（全464タスクでは50.2%）。** 9月7〜11日、中国のバグバウンティプラットフォーム**漏洞盒子（斗象科技）**が「サイバードライバー計画」としてライブ配信した挑戦で、**蛙池AI Desktop＋Sonic Harness**（長距離タスク向けのManager/Executor/Auditorループ）が**VulnHouse**（数百のWebタスク、実CVE再現、ソース監査、メモリ安全性PoCを備えたベンチマーク）に挑んだ。数字：**最初の72時間で段階成功率90.8%**（197/217）、毎時5〜6.25タスク（ピーク日約120〜150）、**最速54秒**（CWE-200情報漏洩、一発合格）、そしてJBossデシリアライゼーションでの「逆転劇」——JavaがなくJDKダウンロードもタイムアウトする中、無関係なアプリの同梱JREを発見して**104回のツール呼び出し、6回の戦略転換、3回の自己修正、33分11秒**でRCEを完成させた

summary_ko: |
  **공개 생중계된 최초의 100시간 무인 에이전트 펜테스트 마라톤 종료: 464개 과제, 233건 검증 통과, 19,340점 — 실제로 검증까지 완주한 297개 과제에서 통과율 78.5%(전체 464개 기준 50.2%).** 9월 7~11일 중국 버그바운티 플랫폼 **漏洞盒子(斗象科技)**가 "사이버 드라이버 계획"으로 생중계한 도전에서 **蛙池 AI Desktop + Sonic Harness**(장기 태스크용 Manager/Executor/Auditor 루프)가 **VulnHouse**(수백 개 웹 과제, 실제 CVE 재현, 소스 감사, 메모리 안전 PoC를 갖춘 벤치마크)에 도전했다. 수치: **첫 72시간 단계 성공률 90.8%**(197/217), 시간당 5~6.25개 과제(피크 약 120~150개/일), **최단 54초** 해결(CWE-200 정보 노출, 원샷), 그리고 JBoss 역직렬화에서의 역전 사례 — Java도 없고 JDK 다운로드도 시간 초과된 환경에서 무관한 앱에 번들된 JRE를 찾아 **104회 도구 호출, 6회 전략 전환, 3회 자기 수정, 33분 11초**로 RCE 완성

summary_de: |
  **Der erste öffentlich gestreamte 100-Stunden-Marathon eines unbeaufsichtigten Agenten endet: 464 Aufgaben, 233 verifizierte Erfolge, 19.340 Punkte – 78,5 % Erfolgsquote bei den 297 tatsächlich bis zur Verifikation gelaufenen Aufgaben (50,2 % aller 464).** Vom 7. bis 11. September veranstaltete die chinesische Bug-Bounty-Plattform **VulnBox (Douxiang Technology)** den „Cyber Driver Plan" als Livestream: **Waqi AI Desktop mit Sonic Harness** – ein Manager/Executor/Auditor-Loop für Langhorizont-Aufgaben – trat gegen **VulnHouse** an, ein Benchmark mit Hunderten Web-Aufgaben, echten CVE-Reproduktionen, Quellcode-Audits und Memory-Safety-PoCs. Die Zahlen: **90,8 % Phasenerfolg in den ersten 72 Stunden** (197/217), 5–6,25 Aufgaben/Stunde (Spitze ≈120–150/Tag), ein **54-Sekunden**-Schnellster Erfolg (CWE-200, One-Shot) und ein Comeback-Fall – eine JBoss-Deserialisierung, bei der der Agent ohne Java und mit fehlgeschlagenem JDK-Download ein gebündeltes JRE in einer fremden Anwendung fand und die RCE in **33 Minuten 11 Sekunden, 104 Tool-Aufrufen, sechs Strategiewechseln und drei Selbstkorrekturen** abschloss

summary_fr: |
  **Le premier marathon de pentest autonome de 100 heures diffusé en direct se conclut : 464 tâches, 233 réussites vérifiées, 19 340 points — 78,5 % de réussite sur les 297 tâches réellement menées jusqu'à vérification (50,2 % des 464).** Du 7 au 11 septembre, la plateforme chinoise de bug bounty **VulnBox (Douxiang Technology)** a diffusé en direct le « Cyber Driver Plan » : **Waqi AI Desktop avec Sonic Harness** — une boucle Manager/Executor/Auditor pour tâches longues — affrontait **VulnHouse**, un banc d'essai de centaines de tâches web, reproductions de CVE réelles, audits de code et PoC de sûreté mémoire. Les chiffres : **90,8 % de réussite sur les 72 premières heures** (197/217), 5–6,25 tâches/heure (≈120–150/jour au pic), un record de **54 secondes** (CWE-200, du premier coup) et un cas de rattrapage — une désérialisation JBoss où l'agent, sans Java et sans JDK téléchargeable, a trouvé un JRE embarqué dans une application sans rapport et terminé la RCE en **33 minutes 11 secondes, 104 appels d'outils, six virages stratégiques et trois auto-corrections**

summary_es: |
  **El primer maratón de pentest autónomo de 100 horas retransmitido en directo concluye: 464 tareas, 233 aprobaciones verificadas, 19.340 puntos — 78,5 % de aprobados en las 297 tareas realmente ejecutadas hasta verificación (50,2 % de las 464).** Del 7 al 11 de septiembre, la plataforma china de bug bounty **VulnBox (Douxiang Technology)** retransmitió el «Cyber Driver Plan»: **Waqi AI Desktop con Sonic Harness** — un bucle Manager/Executor/Auditor para tareas largas — se enfrentó a **VulnHouse**, un banco de cientos de tareas web, reproducciones de CVE reales, auditoría de código y PoC de seguridad de memoria. Los números: **90,8 % de éxito en las primeras 72 horas** (197/217), 5–6,25 tareas/hora (≈120–150/día en el pico), un récord de **54 segundos** (CWE-200, a la primera) y un caso de remontada — una deserialización JBoss donde el agente, sin Java y con la descarga del JDK agotada, encontró un JRE incluido en una aplicación ajena y completó el RCE en **33 minutos 11 segundos, 104 llamadas a herramientas, seis giros de estrategia y tres autocorrecciones**

sources:
  - url: https://www.freebuf.com/articles/502543.html
    label: FreeBuf (full battle report)
  - url: https://cn-sec.com/archives/5452134.html
    label: CN-SEC (independent republication)
  - url: https://www.sohu.com/a/1068905442_120747399
    label: Sohu (pre-event announcement)

disputed: false
landmark: false
scan_month: 2026-09
scan_ref: "SCAN.md §6 2026-09"
---

# 100 hours, one agent: what the VulnHouse autonomous-pentest marathon produced

![severity: high](https://img.shields.io/badge/severity-high-B23B40?style=flat-square) ![confidence: A](https://img.shields.io/badge/confidence-A-157A41?style=flat-square) ![real harm: no](https://img.shields.io/badge/real_harm-no-7A868C?style=flat-square) ![AI involvement: confirmed](https://img.shields.io/badge/AI_involvement-confirmed-1F9D55?style=flat-square) ![kind: research](https://img.shields.io/badge/kind-research-48545A?style=flat-square) ![type: WEAPON](https://img.shields.io/badge/type-WEAPON-B08528?style=flat-square)

## Summary

**The first publicly streamed 100-hour unattended agent pentest marathon concludes: 464 tasks, 233 verified passes, 19,340 points — a 78.5% pass rate on the 297 tasks the agent actually ran to verification (50.2% of the full 464).** Running 7–11 September and live-streamed by the Chinese bug-bounty platform **VulnBox (Douxiang Technology)** as the "Cyber Driver Plan", the challenge put **Waqi AI Desktop with its Sonic Harness** — a Manager/Executor/Auditor loop built for long-horizon tasks — against **VulnHouse**, a benchmark lab of hundreds of web tasks, real-CVE reproductions, source-audit and memory-safety PoCs, with an independent verification engine scoring each submission. The numbers: **90.8% phase success over the first 72 hours** (197/217), throughput of 5–6.25 tasks/hour (≈120–150/day at peak), a **54-second** fastest solve (a CWE-200 leak, one-shot), and a "comeback" case — a JBoss deserialisation task where the agent, lacking Java and unable to download a JDK, located a bundled JRE in an unrelated application, rebuilt its payload and finished the RCE in **33 minutes 11 seconds across 104 tool calls, six strategy shifts and three self-corrections**. The organisers are candid about the limits: stability still depends on harness, tool-chain and verification infrastructure, and complex or tool-poor environments still cause thrashing. Recorded `research` / `WEAPON` / `high` / `real_harm: false`

## Attack chain

```mermaid
flowchart LR
    E["7-11 Sep: 100-hour live stream -<br/>Waqi AI Desktop + Sonic Harness vs VulnHouse"]:::entry
    S1["464 tasks available; 297 run to verification;<br/>peak throughput ~120-150/day"]:::step
    S2["Phase success 90.8% over first 72h;<br/>fastest solve 54 seconds (CWE-200)"]:::step
    I["233 verified passes / 19,340 points;<br/>78.5% of attempted, 50.2% of 464"]:::impact
    E --> S1 --> S2 --> I
    classDef entry  fill:#FBF3E0,stroke:#B08528,stroke-width:1px,color:#3A2C08;
    classDef step   fill:#F1F4F5,stroke:#8FA0A6,stroke-width:1px,color:#182124;
    classDef impact fill:#FBE7E9,stroke:#D1394B,stroke-width:1px,color:#4A1119;
```

## Details

**The setup.** "Cyber Driver Plan" launched on **7 September** at 10:00 and streamed for 100 hours; the harness was **Waqi AI Desktop** — a white-hat client from the bug-bounty platform — carrying **Sonic Harness**, an architecture built for long-horizon work: it breaks the task chain into hand-off-able, auditable, resumable rounds, with a **Manager / Executor / Auditor** three-role loop (plan, execute, audit) and checkpoint recovery after crashes. The target was **VulnHouse**, a lab with hundreds of tasks across difficulty tiers: black-box web (SQLi, SSRF chains, JWT tampering, deserialisation, SSTI), white-box memory-safety audits drawn from real projects (libxml2, Wireshark, ImageMagick, cURL, llama.cpp and more), and CVE reproductions (Struts2, WebLogic, Shiro, JBoss). Judging was independent of the agent: four verification strategies — flag capture, effect proof, PoC crash (with ASan and differential "vuln crashes, fixed doesn't" container checks), and oracle scripts — run by a verification engine that hash-seals every evidence trail and de-sensitises responses so the agent cannot reverse-extract answers from the judge.

**The numbers, with the organisers' own caveats.** Of **464** tasks, **233 passed verification** for **19,340 points**. The organisers warn against a single pass-rate reading: 167 tasks never entered effective execution inside the 100-hour window, so the fair denominators are **78.5% for the 297 actually completed** and **50.2% across all 464**. The first 72 hours ran at **90.8% phase success** (197/217), then difficulty climbed — complex attack chains, source audit, memory safety — and the organisers explicitly note the later hit-rate decline mirrors what CyberGym-class evaluations show as "information about the target decreases": performance drops as tasks approach real-world zero-information discovery. Two cases carry the qualitative story: the **54-second** CWE-200 solve (a one-shot when target, entry and flag all aligned), and the **33-minute, 104-tool-call** JBoss deserialisation where, with no Java and timed-out JDK downloads, the agent abandoned the standard path, found a bundled JRE inside Adobe Animate on the box, and rebuilt its payload — *"no longer template-answering, but adjusting strategy dynamically against environment feedback."*

**Why it sits in the archive.** The archive already tracks agent-pentest capability from the attacker side (HexStrike-class tooling, the GTIG tracker's autonomous exploitation pipelines) and the defensive-demonstration side (X-BOW-style agentic pentesting). This record is the first **long-duration, publicly streamed, independently judged** run in this archive: 100 hours is exactly the regime where human operators fatigue — and the notable result is not the headline 78.5%, but the shape of the curve: high, stable throughput on standard paths; real difficulty under tool-poor, information-sparse conditions; and a harness — not the model alone — doing the work of keeping it recoverable. The organisations say the Sonic Harness will go to public white-hat use in October, which is itself the finding: autonomous exploitation capability is being packaged for general availability, with the verification stack as the control.

## Sources

| # | Source | Link |
|---|---|---|
| 1 | FreeBuf (full battle report) | <https://www.freebuf.com/articles/502543.html> |
| 2 | CN-SEC (independent republication) | <https://cn-sec.com/archives/5452134.html> |
| 3 | Sohu (pre-event announcement) | <https://www.sohu.com/a/1068905442_120747399> |

## Metadata

| Field | Value |
|---|---|
| Date | `2026-09-22` (raw: 2026-09-22, precision `day`) |
| Kind | Research demo `research` |
| Type | [`WEAPON`](../../taxonomy/types.md#weapon) Agent used as a weapon |
| Severity | **High** `high` |
| Confidence | **A** — the organiser's own full battle report with independent verification-engine methodology, plus independent republication and a pre-event announcement |
| Real harm | No |
| AI involvement | Confirmed `confirmed` |
| Region | [CN](../../regions/cn.md) |
| Archive ID | `2026-09-22-vulnhouse-100h-agent-pentest` |

<sub>**Why this classification:** A deliberate, sandboxed demonstration of agent offensive capability by its developers — the `WEAPON` pattern in the archive's sense (an operator using agents as the executing tool), with a lab target and an independent judge, hence `research` / `real_harm: false`. Rated `high` as a significant capability demonstration: first public 100-hour unattended run, quantified throughput and limits, and an October public release of the harness. Dated to the battle report (22 September 2026); the run itself took place 7–11 September. Grading criteria: [severity.md](../../taxonomy/severity.md) and [confidence.md](../../taxonomy/confidence.md).</sub>

## Related

**Topic:** [Offensive AI capability evolution](../../topics/offensive-ai.md)

**Related records:**

- `2026-09-08` [GTIG AI threat tracker: from prompting to autonomy](2026-09-08-gtig-prompting-to-autonomy.md)<br>  <sub>The ecosystem view of the same capability, from the defender's threat side</sub>
- `2025-09-01` [Villager (Cyberspike) AI pentest tool](../2025-09/2025-09-01-villager-cyberspike-shen-tou-gong.md)<br>  <sub>An earlier AI-pentest tooling entry in this archive</sub>

---

[← 2026-09 index](README.md) · [← All records](../../README.md) · [Chinese](../i18n/zh/2026-09/2026-09-22-vulnhouse-100h-agent-pentest.md)

<sub>This record is part of the **Orca AI Incident Archive**, licensed [CC BY 4.0](../../LICENSE). Found a factual error or a missing source? [Open an issue or PR](../../CONTRIBUTING.md) — corrections are recorded in the record's revision history, never silently overwritten.</sub>
