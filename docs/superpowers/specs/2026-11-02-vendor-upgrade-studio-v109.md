# 2026-11-02 第三方依赖升级批：hermes-studio v1.0.9 + element-web v1.12.33 + superpowers v7.0.1

## 变更

- **A：vendor/hermes-studio 基线 v0.8.0（f67b587b9）→ v1.0.9（上游 tag，2026-11-01 发布）**。走 `scripts/vendor-sync.sh` 整树替换 + `npm run inject` 补丁重放；失败补丁逐个修。上游 diff 实测 13 提交/100 文件（+4081/−456，主集中 packages/ 65 文件）。
- **B：element-web v1.12.32 → v1.12.33（本机构建面，产物不入库）**。延续 2026-10-26-cockpit-debt-completion E2 决策：`upstream/element-web` checkout v1.12.33 → `pnpm install --frozen-lockfile` + `pnpm --filter element-web build` → `ELEMENT_WEB_DIR` 契约不变。
- **C：superpowers 插件 7.0.0 → v7.0.1（本机 ~/.zcode 配置面，不入库）**。上游 obra/superpowers 最新 tag v7.0.1（main 2ce8aa1）；手动换装 cache 目录 + installed_plugins.json 指向（无 CLI 更新通道），换装前备份 installed_plugins.json。
- **零动项（对账留痕）**：hermes-agent 维持 v0.22.5（上游最新稳定 tag 仍是 v0.22.5，main 领先 3315c 全是未发版主线，升快照风险不可控）；zcode 维持 a60ba6a7（=上游 origin/main 最新，10-31 同步批已到位）。

## 决策记录

1. studio 升级口径用**上游 tag**（v1.0.9），与 zcode 的"看 main 非 tag"口径（2026-10-25 用户裁定）区分——studio 上游 tag 与包版本脱钩（tag v1.0.9 的 package.json=0.8.11），台账记 tag commit 为准。
2. 升级动机：本仓 10-31 轮刚钉 v0.8.0，上游 11-01 即发 v1.0.9；用户 2026-11-02 裁决"执行 A+B+C"。
3. B 不入仓依据：`scripts/verify-clean.mjs:7` 明文 element-web 参照实现不入仓；静态面缺席是 fail-soft 常态（server-info.ts:61-65 契约）。
4. C 不入仓依据：插件缓存与 installed_plugins.json 均为 ~/.zcode 运行态（D14 离线包口径），非仓库资产。

## 验证

- 执行中（收口前回填）：A=clean→inject 重放全绿＋全量 vitest；B=/element-web/ 200 + elementWebAvailable:true + CSP 补丁面走查；C=新版本技能可加载。

## 设计文档影响

- DESIGN_SYNC: touched——`vendor/VENDOR.md` 台账版本行与本批升级说明；项目 AGENTS.md vendor 版本锚（现存 v0.7.39/0.22.5/3.16.1 系已落后两轮，随批修正为实况）。整合正本版本锚 grep 无命中则不动。
