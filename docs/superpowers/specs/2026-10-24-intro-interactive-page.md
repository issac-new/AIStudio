# 交互式项目介绍页（参考 AgentCore 介绍形式）

日期：2026-10-24　分支：docs/intro-interactive-page　类型：docs

## 变更

- 新增 `docs/intro.html`：单文件交互式项目介绍页，零外部依赖（无 CDN、无字体加载），file:// 直接打开。
- `README.md` 文档节挂链一行。

## 背景

用户指示：参考 https://mp.weixin.qq.com/s/sh49iR-W1NI41ToYZbrnRQ （阿里云云原生《用 Kimi K3.1 Pro 重新介绍 AgentCore》，2026-10-24）的**介绍形式**更新本项目介绍。明确裁定：参考的是文章的形式（一组设计排版的交互页面介绍产品：每屏一个主题、一句核心判断句、深色高级感、滚动递进叙事），**不吸收其叙事框架与内容**（初版方向"吸收生命周期闭环叙事入 README"已被用户当场纠正打回）。

## 决策记录

1. **产物形态 = 入仓独立 HTML**，不是 README 重写、不是会话内可视化片段。理由：文章的形式本体是"可传播的独立介绍页"；README 五层形态是 10-24 刚定稿的用户认可结构，不动。
2. **零外部依赖**：不引 Three.js/CDN（文章用 K3.1 Pro 生成 Three.js 场景；本页用纯 CSS/Canvas 实现同等量级的视觉叙事，保证离线可开、内网可看、无供应链）。
3. **视觉基因沿用产品正身**：Pure Ink 黑白水墨（暗底 #1a1a1a 系，锚点 custom/client/matrix-chat/styles/_tokens.scss:3 与 patches/318 --bg-primary 暗色值），强调色沿用产品主色 #18a058（patches/503 --primary-color 实锚），仅在通过态/关键强调少量使用。
4. **内容全部用本仓真实数字**（锚点：README「现状与验证」+ 设计数字总账 2026-10-23 核实口径）：42 智能体、30 账号、15 人编制、33 页签、6,149 测试、872 测试文件、22 轮推演、run22 19.6 小时六闸全过、684 补丁、G1-G6。不发明任何文章里的数字或概念。
5. 章节叙事为 SwarmStudio 自己的主线（定位→四阶段问题→五件套→编制→凭证→质量门→推演证明→三断言收口），仅借用"每屏一句判断句+滚动递进"的形式节奏。
6. 可访问性：prefers-reduced-motion 降级、语义标签、对比度按灰阶层级保证。

## 验证

- 浏览器实物走查（file:// 打开，滚动全章节、数字动画、G1-G6 递进、reduced-motion 降级、窄屏 ≥320px）。
- 零外部请求核验（无 http(s) 资源引用）。
- README 改动跑 `python3 ~/.zcode/skills/gongwen-bifa/scripts/gongwen-lint.py README.md`。
- 纯静态文档改动，无测试面；不涉及 vitest。
