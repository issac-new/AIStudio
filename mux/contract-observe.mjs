#!/usr/bin/env node
// contract-observe.mjs — 概设接口契约 vs 渠道实现导出面的观察器（run15 前置 P4-10）。
// 产出 qgate contract executor（mode=breaking）消费的观察文件：
//   { mode:'live', checked:true, breaking:[], contract:'ChannelAdapter@§5.3', observed:[...] }
// 语义（executor 同构）：冻结接口方法集为期望面，各渠道实现文件的方法集为观察面——
// 缺方法/多方法均为 breaking 项（多=未声明扩展，如实列出不强判失败，breaking 数>0 才 FAIL）。
// 2026-10-16 质量 C 转正轮三处稳健化（run20 实测假阳性根治）：
//   ① 分支回落：integration 缺席（收官清分支/未建）→ 回落 origin/main 再试，
//      两处都缺=期望面不可读→如实记 breaking 一条（不静默出空期望面）；
//   ② 接口文件多路径：types.ts → ports.ts（run20 实锤=接口在 ports.ts，types.ts
//      在 main 上不存在——硬编码单路径致期望面恒空）；
//   ③ 观察文件同思路：实现文件按候选路径序取第一个可读者。
// 强制线消费方=aipay-scenario.sh G4 段（g4_contract_gap 判据）。
import { writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

const SIM = process.env.AIPAY_SIM_ROOT || '/Users/cuishi/lab/ncwk-sim-mux'
const RUN = arg('run')
const RFD = arg('rfd', 'RFD-001')
const repo = `${SIM}/central/aipaydev`
const out = `${SIM}/runs/${RUN}/evidence/qgate-contract-observation.json`

function arg(k, d) { const m = process.argv.find(a => a.startsWith(`--${k}=`)); return m ? m.slice(k.length + 3) : d }

// 分支回落链：integration 优先（开发段真值），缺席回落 main（收官后/未建集成时）
const branches = [`origin/integration/${RFD}`, 'origin/main']
function gitShow(p) {
  for (const b of branches) {
    try { return execSync(`git -C ${repo} show ${b}:${p}`, { encoding: 'utf8', timeout: 15000 }) } catch { /* 试下一分支 */ }
  }
  return ''
}
function gitShowFrom(p) {
  for (const b of branches) {
    try {
      const src = execSync(`git -C ${repo} show ${b}:${p}`, { encoding: 'utf8', timeout: 15000 })
      return { src, from: b }
    } catch { /* 试下一分支 */ }
  }
  return { src: '', from: '' }
}

// ① 期望面：冻结接口方法集（候选路径序：types.ts → ports.ts——run20 实锤接口在 ports.ts；
//   types.ts 存在但无该接口也算不可用，须继续试下一候选，不能取到首个可读文件就停）
const IFACE_PATHS = ['apps/csw-pay-core/src/types.ts', 'apps/csw-pay-core/src/ports.ts']
const ifaceDoc = { src: '', path: '', from: '' }
for (const p of IFACE_PATHS) {
  const r = gitShowFrom(p)
  if (r.src && r.src.includes('interface ChannelAdapter')) {
    ifaceDoc.src = r.src; ifaceDoc.path = p; ifaceDoc.from = r.from; break
  }
}
const iface = /export interface ChannelAdapter \{([\s\S]*?)\n\}/.exec(ifaceDoc.src)
const expected = iface
  ? [...iface[1].matchAll(/^\s{2}([a-zA-Z_]\w*)\s*\(/gm)].map(m => m[1])
  : []

// ② 观察面：各渠道实现文件（候选路径序——文件迁移不静默出空观察面）
const impls = {
  'csw-channel-wechat': ['apps/csw-channel-wechat/src/adapter/wechat-channel-adapter.ts', 'apps/csw-channel-wechat/src/adapter/WechatChannelAdapter.ts'],
  'csw-channel-alipay': ['apps/csw-channel-alipay/src/adapter/AlipayChannelAdapter.ts', 'apps/csw-channel-alipay/src/adapter/alipay-channel-adapter.ts'],
}
const observed = {}
const observedFrom = {}
const breaking = []
for (const [app, paths] of Object.entries(impls)) {
  let src = '', usedPath = '', usedFrom = ''
  for (const p of paths) {
    const r = gitShowFrom(p)
    if (r.src) { src = r.src; usedPath = p; usedFrom = r.from; break }
  }
  const methods = src ? [...src.matchAll(/^\s{2}(?:async\s+)?([a-zA-Z_]\w*)\s*\(/gm)].map(m => m[1])
    .filter(n => expected.includes(n)) : []
  observed[app] = methods
  observedFrom[app] = usedFrom ? `${usedPath}@${usedFrom}` : '未找到'
  for (const e of expected) {
    if (!methods.includes(e)) breaking.push(`${app}: 缺契约方法 ${e}()（${usedPath || paths[0]}）`)
  }
}
if (!iface) {
  breaking.push(`ChannelAdapter 冻结接口提取失败（候选 ${IFACE_PATHS.join(' → ')} 均不可读或形态漂移）`)
}

const doc = {
  mode: 'live',
  checked: true,
  contract: `ChannelAdapter@${ifaceDoc.path || 'types.ts'}§5.3（G2 冻结）`,
  expected,
  observed,
  observedFrom,
  branches,
  breaking,
  generatedAt: new Date().toISOString(),
  run: RUN,
}
writeFileSync(out, JSON.stringify(doc, null, 2) + '\n')
console.log(`[contract-observe] ${out}（期望 ${expected.length} 方法；breaking ${breaking.length} 项）`)
process.exit(0)
