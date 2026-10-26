# IC 全产业链 Team（Hermes EDA 看板）编制与契约总纲

> 来源：2026-09-04 三份调研（[已移除].md / [已移除].md / chip-org-ai4eda-research-report.md）
> 原则：岗位划分对标 Fabless 编制；协作契约 = PDK / GDSII / STDF / 可靠性四大数据契约；AI 自主边界画在签核与流片决策。

## 编制（10 agents）

```
[已移除]        架构部     spec/微架构起草 + 性能模型（人裁决架构）
[已移除]      前端设计   RISC-V/RTL 实现 + 加密 IP（已有）
[已移除]          验证部     cocotb 环境生成 + 覆盖率闭环（最大杠杆）
[已移除]     后端部     综合→P&R→STA→DRC/LVS→GDS
[已移除]         模拟设计   Ngspice/Xschem + 自动版图 + 后仿
[已移除]     物理建模   PDE/FDTD/FEM 数值求解（已有）
[已移除]   工具链     SI/PI/眼图/PDN 分析（已有）
[已移除]         制造端     TCAD + PDK 审计 + 良率数据
[已移除]    封测端     测试程序 + STDF 报表 + 封装热评估
[已移除]          AI+EDA     神经算子/FNO/PINN（已有）
```

## 主流程依赖（kanban parents 映射）

```
[已移除] ──spec卡──> [已移除] ──RTL──> [已移除]（覆盖率门）──> [已移除] ──GDS──> [人签核] ──> [已移除](CP/FT) ──STDF──> [已移除](良率归因) ──根因──> 回流 arch/ipcore
[已移除] ──模拟指标──> [已移除] ──宏单元GDS/LEF──> [已移除]
[已移除] / [已移除] / [已移除] = 横向能力层（按需挂接）
```

## 四大数据契约（交接硬约束）

1. **PDK 契约（[已移除] → 全设计端）**：PDK 版本锁定记录必附于一切 signoff；模型/deck 一致性由 [已移除] 审计。
2. **GDSII 契约（设计端 → [已移除]/流片）**：交付 = DRC 0 + LVS match + STA 全 corner clean + signoff 报告包；**流片决策人签发**。
3. **STDF 契约（[已移除] → [已移除]）**：测试视角分层（bin/margin）与工艺视角归因（wafer map/PCM）分离，根因裁决留人。
4. **Spec 同源契约（[已移除] → [已移除]/[已移除]）**：实现与验证从同一 spec 卡出发互为对手方；spec 变更走 [已移除] 审批。

## AI 自主边界（全 team 统一）

- **可自主**：spec 起草、模块级 RTL、验证全闭环、流程编排与调参、仿真矩阵、DRC/LVS 修复、数据报表
- **人机协同**（agent 出数据，人决策）：架构裁决、拓扑选型、覆盖率阈值、bug 定级、筛片门限、归因结论
- **禁触**：GDS 签核、流片/投片决策、真实仪器操作、foundry/OSAT 商务承诺、安全合规审批

## 证据锚点（调研来源，2026-09-04）

- OpenROAD 600+ tapeouts、LibreLane 取代 OpenLane：github.com/The-OpenROAD-Project、fossi-foundation.org/blog/2025-08-17-librelane
- OpenFASOC 64 传感器 MPW-1：github.com/idea-fasoc/openfasoc-tapeouts
- 验证占周期 60-70%：arXiv:2604.27643 + arXiv:2506.12200 双源
- L3 早期为业界最高生产级自主度：arXiv:2512.23189（Agentic EDA survey）+ Synopsys 自评
- 跳过验证代价（55nm 三次流片失败，单次约 50 万美元）：open-verify.cc
