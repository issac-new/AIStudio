# 标签页品牌收尾：Ekko Studio → SwarmStudio（标题＋图标＋manifest）

> 2026-10-22 用户裁定（附浏览器标签截图）：「此处的图标及 Ekko Studio 调整为
> Swarm Studio」。上游 v0.7.38 品牌已从 Hermes 换为 Ekko，补丁 111 覆盖了加载
> 文案等正文，但标签页三处用户可见面漏网。

## 改动（patch 675，全部 upstream 文件走补丁链）

- `packages/client/index.html`：
  - `<title>` 与 `apple-mobile-web-app-title`：Ekko Studio → **SwarmStudio**
    （连写，与应用内既有品牌一致——侧栏 logo/boot 文案均为 SwarmStudio）；
  - favicon：新增内联 SVG data-URI `<link rel="icon" type="image/svg+xml">`
    （64×64 圆角方 #0d1428 ＋ 青色 #38bdf8 粗体 S，与侧栏品牌配色同源），
    置于原 favicon.ico 引用之前——Chromium 优先取 SVG；.ico 保留为兜底。
- `packages/client/public/manifest.webmanifest`：name/short_name/description
  同步 SwarmStudio。
- 登记进 `patches/series`（675 号），经主检出 `npm run ensure-injected` 差量补套。

## 不改

- upstream `favicon.ico`/`logo.png` 二进制（PWA 安装面/旧浏览器兜底沿用原样，
  换二进制资产补丁代价高且非用户所指）；客户端源码内部 Ekko* 组件标识符
  （代码符号非用户可见）。

## 决策记录

| # | 决策 | 理由 | 否决的备选 | 可逆 |
|---|---|---|---|---|
| 1 | 品牌串用 SwarmStudio（连写）非 Swarm Studio | 应用内品牌单一事实源=SwarmStudio（侧栏/boot/文档），标签页与之一致 | 按用户字面用带空格（否决：与应用内品牌分裂出两种写法） | 是 |
| 2 | 图标走内联 SVG data-URI，不动二进制资产 | 免 GIT binary patch（生成/维护代价高）；Chromium（IAB/桌面 Web）优先 SVG；.ico 兜底保留 | 重做 favicon.ico/logo.png（否决：二进制补丁链重，收益仅 PWA 安装面） | 是 |
| 3 | 新增 675 号补丁而非扩写 111 | 111 已合入历史多轮，追改老补丁会破坏已注入树的差量对账；series 尾追加是既定惯例 | 扩写 111（否决：manifest 已登记 111 为 applied，内容变化 ensure-injected 有盲区） | 是 |
