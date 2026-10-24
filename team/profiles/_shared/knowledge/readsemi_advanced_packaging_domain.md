# 高级封装与异构集成领域知识（readsemi/芯联汇 调研沉淀）

> 来源：readsemi（公众号「芯联汇」）41 篇技术文章全量抓取（2026-08-27）。所有断言均来自原文标题/正文，可回溯，无臆造参数。
> 用途：[已移除] Team 4 个 profile 共享的领域背景速查。详见 `~/hermes-docker-sandbox/workspace/readsemi_research_report.md` 完整报告。

## 一、核心范式转变：从 Device Scaling 到 System Scaling

半导体竞争已从「制程驱动」转向「系统驱动」。真正限制 AI 芯片性能的，已不只是晶体管微缩，而是**互连、供电、存储、散热、光互连、3D 集成**这一整套系统级问题。

readsemi 的「不是 X，而是 Y」洞察范式（可指导学生代理的归因思维）：
- 不是键合做不好，而是**缺陷检测不清**（X-ray/CL 非破坏性检测）
- 不是对准不准，而是**界面控制/界面水/Cu 表面自扩散**（亚微米 Hybrid Bonding）
- 不是光模块速率，而是**材料耦合 + 温度**（CPO/硅光热失控）
- 不是算力不够，而是**内存与存储喂不饱**（HBM/HBF）
- 不是制程不先进，而是**互连/供电/系统**拖后腿

## 二、先进封装互连形态谱系

| 形态 | 关键特征 | 瓶颈/关注点 |
|------|----------|-------------|
| **Hybrid Bonding（混合键合）** | 亚微米 pitch（1µm→0.5µm 以下）Cu-Cu 直接键合 | CMP 表面工程（亚纳米粗糙度）、界面化学（界面水、Cu 表面自扩散、等离子活化）；非破坏性检测难 |
| **CoWoS → CoPoS** | Wafer-Level → Panel-Level(PLP)/FOPLP | 封装尺寸 1×Reticle→5.5×/7.5×/9×，突破 reticle 极限 |
| **Glass Core + TGV** | 玻璃核心基板（低 CTE、低损耗、低粗糙度） | TGV 量产能力 + HVM 级 APC 闭环决定 3D 封装上限；毫米波/sub-THz 高频平台 |
| **Fine RDL / EMIB / Embedded Bridge** | 封装基板从「电气连接」走向「电+光+供电+异构集成」 | System Integration Platform |
| **Chiplet / 3D IC / CMOS 2.0** | 算力竞争从制程转向「怎么连、怎么堆、基板怎么扩」 | System Scaling |

## 三、光互连 / CPO（光电协同是封装新前沿）

- 演进路径：**可插拔光模块 → CPO（共封装光学）→ OCS（光交换）**。数据中心瓶颈从器件层转向封装层。
- CPO 难点在**材料不在器件**：光/电/热/机械在同一封装高度耦合（玻璃中介层、波导、粘接剂、热界面材料）。
- 硅光子难题正从带宽转向**温度**：700W+ GPU 热失控，XPU/EIC/PIC 3D 堆叠 + 混合键合。
- **3D 硅光 × 5nm CMOS**：EAM 替代微环调制器、硅光芯片与 CMOS 3D 集成、带宽密度 >600 Gb/s/mm²。

## 四、供电与热（PDN / IR Drop / TSV / BSPDN）

- **电流拥挤（Current Crowding）**：3D 芯片中电流经 TSV 跨层分布不均 → IR-drop 增加、局部电流密度过高、可靠性下降。
- **BSPDN（背面供电，如三星 SF2Z/DBC/STC/BGC）**：释放正面布线资源、降低 IR Drop；与 DTCO 深度绑定，并向 Backside Signal Routing 演进。
- **千瓦级供电架构**：GPU 300W→700W→1000W→2000W，机架电流逼近上千安培；IVR 与封装级供电崛起（intel/台积电/AMD/ASE 共识）。

## 五、材料与工艺

- **光刻胶国产替代**：高端（EUV/ArFi）垄断，破局点在材料与配方。
- **超导材料**：高温超导规模化（核聚变/电力）打开新市场。
- **CMP 表面工程**：Hybrid Bonding 成败在 CMP（亚纳米粗糙度、dishing/erosion 控制）；FinFET/RMG 的 Poly CMP→W Gate CMP 精准控栅高。

## 六、存储-算力协同（HBM/PIM/CXL）

- HBM 正在决定 AI 算力实际边界；HBM + HBF（High Bandwidth Flash）混合存储分层成为 LLM 推理新范式。
- 3D DRAM / HBM4 / MRDIMM / CXL / PIM 是 DRAM 技术路线图五大方向。

## 七、检测与计量

- **X-ray + CL（阴极发光）**：破解 3D IC 检测难题，分辨率/速度/大尺寸权衡。
- **SIMS/Orbitrap**：imec 用超高质量分辨率 Orbitrap + SF-SIMS 实现 GAA/CFET 微小结构掺杂定量（质量分辨率 240,000，破解 SiGe 中 As 质量峰干扰）。

## 八、对 [已移除] Team 4 profile 的能力映射

- **[已移除]**：先进封装 SI/PI 分析、TGV/玻璃基板 S 参数与翘曲、CPO 光-热耦合可视化、PDN IR-drop 仿真、PLP DFM。
- **[已移除]**：Hybrid Bonding CMP 表面/界面物理、TGV 电磁特性、CPO 热-光耦合 PDE/CEM/TCAD 求解器支撑、X-ray/CL/SIMS 成像仿真接口。
- **[已移除]**：HBM/PIM/CXL 存储-算力协同建模、BSPDN/供电 RL 优化、DTCO/STCO 系统级协同（补「System Scaling」视角）。
- **[已移除]**：Chiplet 互连标准（UCIe 等）、RISC-V PM 控制器（AI 加速器细粒度电源管理）RTL/IP 输入。

---
*审计锚点*：本文件由 orchestrator 在 2026-08-27 全量调研 readsemi 后沉淀，供后续 [已移除] 任务直接引用，避免重复抓取。
