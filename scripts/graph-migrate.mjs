#!/usr/bin/env node
// overlay/scripts/graph-migrate.mjs
// P1 Task 8 — 旧 LoopInstance → GraphSpec 迁移 CLI（薄壳：委托 vite-node 运行 TS 主体，
// custom 代码的扩展名省略 import 只有 vite 解析器能处理；参数原样透传）
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
// vite-node 的 node 可执行入口:Windows 下 .bin/vite-node 是 sh shim,
// spawnSync 直跑 ENOENT;统一经 process.execPath 跑包内 .mjs。
const viteNodeEntry = resolve(here, '../node_modules/vite-node/vite-node.mjs')
const entry = resolve(here, 'graph-migrate-cli.ts')

const r = spawnSync(process.execPath, [viteNodeEntry, entry, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
