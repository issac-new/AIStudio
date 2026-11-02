# 2026-11-02 回归轮挂账四件清偿

## 变更

上轮（2026-11-02-full-regression-fixes）交付说明中四项「未做/未验证」本批全部清偿：

1. **vite 长会话劣化根因（挂账①）**
   - 定谳：三跑劣化非 vite 固有缺陷，是**并行 git 操作重写工作树触发 vite 自重启**——劣化期日志实录 `vendor/hermes-studio/vite.config.ts changed, restarting server`＋40 余文件 page reload（01:39:31，恰为走查中段；同代码二轮干净、四轮 fresh vite 复越故障带）。
   - 落地：walk-routes.mjs 导航 catch 加环境闪断韧性——超时先重导航一次，重试通过记 WARN（`环境闪断重试通过`），仍失败才进权限回退/缺陷定性；`导航` 缺陷注记加「重试仍失败」。
2. **matrix 两页真实会话内容验收（挂账②）**
   - 新探针 `scripts/regression/matrix-session-walkthrough.mjs`：REST 以网关矩阵账号真建房＋真发 3 条消息（帧内容一致法），UI 走 /matrix（面板挂载）与 /matrix/room/:roomId（store 自动桥 gateway-credentials→sync）断言消息标记真实渲染，收尾离房清场。
   - 实测 5/5 全过（@swarm:matrix.test @127.0.0.1:8008，时间线 3/3 命中、房名在场、零 console 错误）。走查 allowBlank 的「访客空态」口径不变，内容门由本探针承担。
3. **pytest 拼合树（挂账③）**
   - 配方固化：`rsync vendor/hermes-agent → /tmp 树＋rsync runtime/ 覆盖`，`python3.14 -m pytest`（pytest 9.1.1）。
   - 首跑 29 注入测试文件 256/1：红＝`test_subagent_source_marks` 的 SimpleNamespace 缺 `refused=[]`——生产 dataclass 后加 `refused` 字段（delegate_tool_dispatch.py:55）而补丁 410 的测试没跟上，拼合树轴抓到的真欠账。
   - 修复：补丁 410＋注入树测试补 `refused=[]`（新文件 hunk 计数 86→87）；复跑 **257/257 全绿**。
4. **补丁 070 CSS 三重复制清理（挂账④）**
   - `.connections-empty` 规则在 070 内重复 3 份（v0.8.0 迁移期粘连残留）→去重为 1 份（hunk `+96,33`→`+96,15`）；pristine 基线预检 RC=0，全量重放后应用树 CSS 规则 2 处＝070 的 1＋650 原有 1，合法。

## 决策记录

- **D1（vite 根因定性＝环境互作非产品缺陷）**：证据链＝劣化期 vite 日志 restart 实录＋同代码二/四轮对照；修法取探针韧性（重试）而非改 vite 配置——重启由并行 git 操作合法触发，探针侧消化是正确分层。
- **D2（matrix 内容门独立探针而非放宽 allowBlank）**：走查保持无会话快速口径，内容真实性由专项探针闭环（建房/发消息/验读/清场全链），两把尺各司其职。
- **D3（410 测试修复随生产字段演进）**：`refused` 是生产正规字段，测试 SimpleNamespace 须跟上——修测试不修生产（生产无缺陷）。

## 验证

- 拼合树 pytest：29 注入文件 **257/257**（33.65s）。
- matrix 专项探针：**5/5**（建房/发消息/面板挂载/时间线 3/3/清场）。
- 补丁重放：clean+inject 全量 RC=0 零 agent WARN；ConnectionsPanel `.connections-empty` CSS 规则 2 处（070 去重后 1＋650 的 1）；070 pristine 预检 RC=0。
- 走查冒烟（重试版脚本）：connections＋settings 过滤 **12/0**。
- 根 vitest 全量：见随批对账（收口跑）。

## 设计文档影响

DESIGN_SYNC: none——四件均为回归工装/补丁载体/测试补齐，无产品行为面变化；matrix 内容验收与 pytest 拼合树属验证面扩容，设计文档无对应记载面需要修订。
