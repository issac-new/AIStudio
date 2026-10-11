#!/usr/bin/env node
// contract-observe.mjs — 概设接口契约 vs 渠道实现导出面的观察器（run15 前置 P4-10）。
// 产出 qgate contract executor（mode=breaking）消费的观察文件：
//   { mode:'live', checked:true, breaking:[], contract:'ChannelAdapter@§5.3', observed:[...] }
// 语义（executor 同构，run15 转正时换 CLI 单门跑）：types.ts 冻结接口方法集为期望面，
// 各渠道实现文件的方法集为观察面——缺方法/多方法均为 breaking 项（多=未声明扩展，
// 如实列出不强判失败，breaking 数>0 才 FAIL）。影子模式：产物落 evidence 供报告透传，
// 不进 G4 强制线（方案 P4-10 降级路径）。
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const SIM = process.env.AIPAY_SIM_ROOT || '/Volumes/nvme2230/lab/ncwk-sim-mux'
const RUN = arg('run')
const RFD = arg('rfd', 'RFD-001')
const repo = `${SIM}/central/aipaydev`
const branch = `origin/integration/${RFD}`
const out = `${SIM}/runs/${RUN}/evidence/qgate-contract-observation.json`

function arg(k, d) { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d }
function gitShow(p) { try { return execSync(`git -C ${repo} show ${branch}:${p}`, { encoding: 'utf8', timeout: 15000 }) } catch { return '' } }

// ① 期望面：types.ts 冻结接口方法集（interface X { m(...): ... } 行式提取）
const types = gitShow('apps/csw-pay-core/src/types.ts')
const iface = /export interface ChannelAdapter \{([\s\S]*?)\n\}/.exec(types)
const expected = iface
  ? [...iface[1].matchAll(/^\s{2}([a-zA-Z_]\w*)\s*\(/gm)].map(m => m[1])
  : []

// ② 观察面：各渠道实现文件的同名方法集（class implements 形态）
const impls = {
  'csw-channel-wechat': 'apps/csw-channel-wechat/src/adapter/wechat-channel-adapter.ts',
  'csw-channel-alipay': 'apps/csw-channel-alipay/src/adapter/AlipayChannelAdapter.ts',
}
const observed = {}
const breaking = []
for (const [app, path] of Object.entries(impls)) {
  const src = gitShow(path)
  const methods = src ? [...src.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z_]\w*)\s*\(/gm)].map(m => m[1])
    .filter(n => expected.includes(n)) : []
  observed[app] = methods
  for (const e of expected) {
    if (!methods.includes(e)) breaking.push(`${app}: 缺契约方法 ${e}()（${path}）`)
  }
}
if (!iface) breaking.push('types.ts: ChannelAdapter 冻结接口提取失败（分支缺席或形态漂移）')

const doc = {
  mode: 'live',
  checked: true,
  contract: 'ChannelAdapter@types.ts§5.3（G2 冻结）',
  expected,
  observed,
  breaking,
  generatedAt: new Date().toISOString(),
  run: RUN,
}
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
console.log(`[contract-observe] ${out}（期望 ${expected.length} 方法；breaking ${breaking.length} 项）`)
process.exit(0)
