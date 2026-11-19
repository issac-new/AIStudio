#!/usr/bin/env node
// overlay/scripts/modelcap-build.mjs
// 能力矩阵生产者薄壳（2026-11-19 调度智能批）：委托 vite-node 运行 TS 主体，
// 参数原样透传。默认 dry-run；--write 才落盘。
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const viteNodeEntry = resolve(here, '../../node_modules/vite-node/vite-node.mjs')
const entry = resolve(here, 'modelcap-build-cli.ts')

const r = spawnSync(process.execPath, [viteNodeEntry, entry, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
