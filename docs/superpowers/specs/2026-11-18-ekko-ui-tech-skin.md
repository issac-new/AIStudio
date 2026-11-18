# Ekko UI Surface 科技感皮肤（渲染器默认视觉升级）

日期：2026-11-18　分支：feat/ekko-ui-tech-skin　类型：A 类（纯 custom/，协议零变更）

## 变更

用户观察：A2UI（Ekko UI Surface）渲染出的界面毫无科技感——现状为原生控件 + 素色 token（原生 select/checkbox、1px 素边框卡片、纯色按钮）。本批升级渲染器**默认皮肤**为克制的科技感风格，改动三处：

| 文件 | 改动 |
|---|---|
| `custom/client/chat/components/EkkoUISurfaceCard.vue` | 外壳卡片：玻璃拟态底（半透明 + backdrop-blur）＋顶部 accent 渐变光带；头部改等宽大写字距标签感＋状态指示点（pending 呼吸脉冲）；状态徽章 tone 光晕 |
| `custom/client/chat/ekko-ui/EkkoUISurface.vue` | 宿主壳：同套派生变量；footer 主按钮渐变＋hover 光晕 |
| `custom/client/chat/ekko-ui/EkkoUINode.vue` | 组件树皮肤：card 内发光描边、input 聚焦外发光、badge tone 底微光、alert 发光左条、progress 渐变流光动画、table 表头微光行 hover、heading accent 竖条、code 深色微描边、switch 自绘胶囊滑动（替换裸 16px checkbox） |

不动：`protocol.ts` 白名单、组件树结构语义、类名、事件边界——Agent 侧 spec 零变更，存量 surface 全兼容。

## 决策记录

- **D1（视觉方向＝克制的科技感，非赛博朋克）**：玻璃拟态 + accent 发光描边 + 等宽字体点缀 + 低频微动画（呼吸/流光），不做紫粉渐变/扫描线重特效——专业工具产品语境，重特效显玩具。
- **D2（token 派生为主＋皮肤专属交互色）**：结构视觉（玻璃、边框、阴影）从既有 Pure Ink token 用 `color-mix()` 派生，亮暗两主题自动成立，不碰 vendor token 定义。**修订（2026-11-18 同日）**：实测全局 accent 是纯灰阶（亮 #333333 / 暗 #e0e0e0，`variables.scss:38,114`），纯派生只有「灰光」、科技感不成立——皮肤作用域新增 `--ekko-skin-accent`（亮 #0891b2 cyan-600 / 暗 #22d3ee cyan-400，随 `.dark` 切换）仅作用于 surface 皮肤内部，全局主题与其他界面零影响；D4「Agent 不能指定颜色」不破——该变量由宿主定义，Agent spec 无任何控制面。
- **D3（协议不加 theme 字段）**：科技感是宿主默认皮肤，遵循原 spec D4「视觉 100% 走宿主、Agent 不能指定颜色」——皮肤演进是宿主职权，无需 Agent 参与。
- **D4（动画尊重 reduced-motion）**：呼吸/流光动画全部包 `@media (prefers-reduced-motion: reduce)` 关停。

## 验证

- [x] 目标测试：`npx vitest run custom/client/chat` → 5 文件 48 用例全绿（ekko-ui-card/renderer/protocol 三套不红——类名与行为未动）
- [x] 浏览器实物走查（2026-11-18）：worktree dev server（vite :8648 + serve :8647，避让宿主常驻 :8649/:8650）挂走查页（vendor 注入态临时文件，不入库），亮/暗/已提交三态全组件渲染。亮色特写复核＝霓虹描边+外围微光+顶部光线+统一青蓝控件体系，科技感 8.5/10，无渲染缺陷；暗色段发光滑块/进度条/开关胶囊/玻璃底全部落地；已提交态徽章绿色+状态点无脉冲（DOM 计算色复核 rgb(46,125,50)，推翻视觉评估的误读）。亮色初版发光偏弱，当场上调（描边 22→32%、外光 6→10%+24px 层、光线 70→85%）后复核通过
- [ ] 全量 `npm test`（合并前）

## 设计文档影响

- **touched**：`docs/superpowers/specs/2026-11-16-ekko-ui-surface-chat-design.md` 补 D10 决策（宿主默认皮肤＝科技感玻璃拟态，token 派生，Agent 侧零变更），D4 原则不变、本批是其职权内的视觉演进。
