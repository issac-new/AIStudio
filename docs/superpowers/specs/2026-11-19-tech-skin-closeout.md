# 科技感皮肤挂账清偿＋走查缺陷清偿批

日期：2026-11-19　分支：feat/tech-skin-closeout　类型：A 类（skin.scss＋cockpit 域文件）　前置：2026-11-19-ui-tech-skin-global（main 534c7cf0e 起）与本日全站走查报告

## 变更

清偿前批挂账两项＋走查新发现缺陷清单（用户令「完成挂账及剩余所有」）：

| # | 项 | 落点 |
|---|---|---|
| 1 | 顶栏光线改挂内容区（`.studio-page-header` 在多页 display:none，CSS 命中但不可见） | skin.scss：光线挂 `.app-box` 顶缘（全内容区可见） |
| 2 | 侧栏渐变被原样式覆盖＋玻璃不可感知（背后纯深底 blur 无效果） | skin.scss：双类提权 `.app-shell .studio-navigation-rail`＋微底 alpha 提至可感知档（0.055→0.12 级） |
| 3 | 自研搜索框/下拉无青蓝 focus 态（skin 层 input 元素级规则未覆盖自研控件） | 探查真实类名后 skin.scss 补通用覆盖（不打业务域类，打结构类） |
| 4 | 看板域：告警条红/青对撞、灰色按钮无皮肤 hover、列卡片皮肤不一致、黄徽标辨识度 | cockpit 域文件（A 类直改） |
| 5 | 小字号灰字对比度（12px 说明文字疑似 <WCAG AA） | 尝试微调 `--text-muted`（守门 wcag-contrast 验证，红则回退并降级记录） |
| 6 | 首屏「加载中…」白屏态无皮肤 | 不处置：首帧毫秒级、属 vendor index.html 内联态，为一个底色动补丁不值 |
| 7 | 顶栏「IDE 工作区」按钮 pointer 探测不到 | 记录不复核：人工点击大概率正常（自动化探测限制），非产品缺陷 |

## 决策记录

- **D1（光线落点从 header 移到内容区）**：header 显隐随视图布局变化（流程总览 display:none），挂 `.app-box` 顶缘全内容区恒可见；header 原规则保留（有 header 的页面双光线不冲突——`::after` 在 header 底边、`.app-box::before` 在内容顶，若重叠视觉上只是增强）。
- **D2（侧栏提权用双类而非 !important）**：`.app-shell .studio-navigation-rail` 特异性 0,2,0 打平 scoped 后加载胜出，不引入 !important 维护债。
- **D3（灰字对比度改 token 须过守门）**：wcag-contrast.test.ts 是既有守门，改 `--text-muted` 当轮验证；不过则只改域内文字类并留痕。
- **D4（看板域细改落 cockpit 域文件）**：走查缺陷的按钮/告警/列卡片都在 custom/client/cockpit（A 类职权），不走 skin 全局层打域类。

## 验证

- [x] 活体验证（worktree vite 8658 + production serve）：app-box 顶缘光线命中（rgba(accent,0.65) 渐变）；侧栏三连类提权后渐变+blur(14px) 命中（双类被 scoped 平手压住，0,3,0 稳赢）；告警条降饱和实测（border 0.55→0.40、bg 0.10→0.06）；muted 亮 #767676/暗 #9a9a9a 实测+守门绿
- [x] 看板域：告警条/筛选聚焦/任务卡 hover 微光三改落地（前两处静态实测命中，hover 态属交互面留用户复核）
- [x] wcag-contrast 6/6＋raw-hex-budget 2/2＋kanban/chat/ia2 目标面 21 文件 124 用例全绿
- [x] 全量 `npm test`（2026-11-19）：9205 例 9189 绿 / 5 failed 定谳——索引 2（新 spec 补账转绿）+pristine-replay 1（worktree serve 挡 clean，停服后绿）＝本批责任面全清；release-manifest 版本锁 2＝pre-existing（主检出 main 同红：yuan-skill CHANGELOG v2.101.0≠清单 v2.100.4，归 2026-11-19 skill 批会话收口，本批不动并行在途面）；复跑 3 文件 31 用例全绿

### 过程坑（补丁 802）

- 补丁头 `+++` 误带 vendor/hermes-studio 前缀 → git apply 解读为「删旧建新」：variables.scss 被删 + vendor 树内嵌套 vendor/ 残尸 → inject 报「上游工作树不干净」。修复=改头+git restore+git clean 残尸+全量重放。生成脚本两分支（base 相对 vs vendor 绝对）不对称是根因。

## 设计文档影响

DESIGN_SYNC: touched

- `docs/DESIGN.md` §2.9 全局视觉皮肤节补一句挂账清偿与看板域细改——随批修订。


### 附：两处聊天 A2UI 卡片管道验证（用户令「用 A2UI 完善下」的定谳）

代码级全通，无需接线：①日常聊天窗=补丁 777 在 vendor MessageItem 无条件挂载（v-if 仅判 isSurfaceToolName）；②IDE 控制台聊天（IdeChatPane）共用同一 MessageList 渲染链；③全部 profile 的 ekko-studio-interaction MCP 在位（~/.hermes/profiles/*/config.yaml 实测 interaction=2）。落地增强一件：EkkoUISurface 窄容器（IDE 侧栏会话 350-480px）容器查询降列防溢出（Agent 声明多列网格时单列化，grid 行内 style 仅 !important 可压）。