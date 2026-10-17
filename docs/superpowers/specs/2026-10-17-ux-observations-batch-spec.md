# 存量设计观察项清偿 spec（走查观察四件）

日期：2026-10-17
来源：《2026-10-17-swarmstudio-frontend-ux-consolidation-report.md》§五「走查发现的存量设计议题」四项，用户指令「做完」。
验收：vitest 全量绿＋build 过＋dev 双主题走查四屏（看板/工作台/治理/推演+侧栏）截图取证；报告 §五改记「已清偿」并重出衍生格式。

## 决策记录

- O-1 侧栏彩色头像灰度化：走查判读的「AK 彩色 logo」实为 boring-avatars beam 生成的账号几何头像（ProfileAvatar.vue，彩色为生成器固有）。修复=侧栏范围灰度（`.page-sidebar-account-btn`/`.sidebar-account-menu` 内 `.profile-avatar-svg` 加 `filter: grayscale(1)`），规则放 overlay ui.scss 全局层——零 upstream patch。范围只限侧栏账号位：用户上传的图片头像（个人内容）与其他界面的头像不灰；「全应用头像黑白化」是更大的审美决策，记开放项不动。
- O-2 工作台右栏（TaskDecisionPanel）分组层次：`.tdp__sec-head` 改贴顶 sticky＋同族淡底（--accent-bg）＋圆角，两节头加 12px currentColor 小图标（待我处理=铃、上下文=链）；`.tdp__sub` 相邻块加发丝分隔线＋统一上距。不增纵向体量（D19 密度纪律），纯视觉分组强化。
- O-3 顶栏密度两处：看板板筛选 chips 行（SwarmKanbanView `.kanban-boardbar`）gap 6→8px＋显式 row-gap 4px（视觉模型判「左疏右密」源于换行后无行距）＋标签右距；壳头（IaShellHeader `.cockpit-top`）gap 6→8px。upstream 多页签行零 patch 不动（边界同上轮）。
- O-4 「签 N·」前缀弱化：gov/sim 两中心面板标题由「签 N·名称」改为「名称＋尾部辅助小标（签 N）」——主文本用名称，`签 N` 降为 aux 色 10px 尾标。术语「签」保留（术语冻结+机器锚），只做视觉降级；页签栏本就是纯名称不动。受影响测试断言 5 处（sim-center-shell 3＋gov-center 2）改为顺序无关双包含（`签 N` 与名称分开断言）。
