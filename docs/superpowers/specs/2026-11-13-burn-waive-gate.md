# 烧机收据第三态（burn-waived）——外部归因豁免产品化（2026-11-13）

## 变更

背景：run30 开跑链被㉛ 烧机门阻塞 6 小时（两轮烧机 5 小时全 fail：一轮暴露凭证核验 bug 已根治；一轮 4 试全败于外部 LLM 通道高峰期、机制面零错误）。「外部阻塞复现两次即换策略」立法给了「凭归因证据链替代 PASS 直接起正式轮」路径，但落地形态是人工拍板——2026-11-13 14:30 值守会话因此空等 1.6 小时（用户质询后纠正）。

修复：`mx-mechanism-receipt.py` 新增 `waive` 子命令＋`verify-latest` 认豁免（第三态），豁免合法性全部机械判据、fail-closed：

1. **waive 命令**（`waive --root --receipts --reason [--evidence]`）：写一行到收据同目录 `burn-waivers.jsonl`（digest/at/reason/evidence/operator）。前置硬断言：
   - 当前机制 digest 存在 **fail 收据**（先有机械 fail 才可豁免；无收据/索引缺席=不可豁免）；
   - 该 fail 收据 **fail_lines==1 且 reasons 含 goal_step_not_reached**（机制面零多重失败的代理判据；fail_lines>1=多重失败不豁免）；
   - `--reason` 非空（留档依据）。
2. **verify-latest 认豁免**：走到 fail 分支前查 waivers——同 digest 存在豁免且豁免时间距今 **<24h** → 输出 `WAIVED`（附理由）return 0；过期/缺席照常 fail。prelaunch ㉛ 零改动（verify-latest 过即过）。
3. 豁免不掩盖历史：waivers 追加型独立文件，收据索引不动——复盘仍见原始 fail。

## 决策记录

- D1：豁免判据用「fail_lines==1＋goal_step_not_reached」作机制面零错误的代理——完整归因需要解析 FAIL 行语义，代理判据可机械执行且方向保守（多重失败必拦）。
- D2：24h 新鲜窗——外部通道故障（高峰期/限流）是时限性的；过期豁免自动失效须重烧或重豁免（重豁免=新一行留痕）。
- D3：不建「跳过烧机」通道——豁免只认「跑过且机械判据指向外部」，从未烧机无豁免权（digest 无收据即 fail）。

## 验证

- `simharness/tests/run30-burn-verify.test.sh` 扩展 waive 断言组（waive 拒绝无收据/拒绝多重失败/认新鲜豁免/拒过期豁免——夹具临时仓全活体）；
- `python3 -I -m py_compile`＋现有 run30-burn-verify/run30-actions/run-gates 回归全绿；
- 活体验证：对 burn-20261113-104808 的真实收据执行 waive→verify-latest 转 WAIVED。

## 设计文档影响

DESIGN_SYNC: none——harness 门禁实现扩展，不触及 DESIGN_DOCS 四正本；与「外部阻塞两次换策略」立法的机械落点对齐。
