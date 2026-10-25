# R142 补记：routa/codex 两项待裁决同步上游（用户裁决回写）

- 日期：2026-10-25
- 分支：feat/skill-r142-followup
- 关联：`2026-10-25-skill-r142-runtime-refresh.md`（R142 主轮，其 §四 两项异常本次两清）

## 变更

- `skills/swarm-yuan/docs/research/R142-runtime-refresh.md` §四：两项处置列改写为终态（routa 已同步 / codex 误报更正零动作）。
- `skills/swarm-yuan/docs/research/upstream-changelog.md`：R142 节末追加「补记」段（裁决、动作、误报更正、教训）。

## 决策记录

1. **用户裁决（2026-10-25）**：「待裁决都需要同步上游」——R142 §四 两项异常不再挂起，全部对齐上游。
2. **routa 同步方式=main 快进不合并分叉**：核实仓内实为双线（本地 `main` 分支=上游跟踪分支，仅落后 4；detached HEAD 钉的本地 tag v0.19.0 才是 4083 提交分叉线）——R142 主轮把两线混读为「本地 main 领先 4083」。处置：`main` 快进至 origin/main tip `9dc7b7be`，HEAD 随迁至 main；分叉线以 tag v0.19.0 保留可达、零丢失。
3. **codex「来路不明本地提交」=误报，更正入册**：6aaac69480（celia@openai.com）即上游 rust-v0.164.0 发版提交本身（本地/远端 tag 对象一致 fe3b2945，剥壳正指向该提交）；缓存本就精确钉上游稳定 tag，零动作。原判只核了「非 origin/main 祖先」，未核作者与 tag 落点。
4. **教训沉淀**（进 changelog 补记）：detached HEAD 与分支线的领先数必须分开核；判「本地私货」前先核提交作者与 tag 剥壳落点。

## 验证

- routa 合并态实测：`main` ahead 0 / behind 0（=origin/main tip 9dc7b7be），工作树 0 脏；tag v0.19.0 仍存在（分叉线可达）。
- codex 实测：`git rev-parse rust-v0.164.0^{commit}` == HEAD（6aaac69480），describe=rust-v0.164.0。
- `registry-render.sh --check` 注册表一致性通过（changelog 字节变化不在 dist 锚面，无需同步）。
