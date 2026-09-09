#!/usr/bin/env node
// overlay/scripts/graph-migrate.mjs
// P1 Task 8 — 旧 LoopInstance → GraphSpec 迁移 CLI（薄壳：委托 vite-node 运行 TS 主体，
// custom 代码的扩展名省略 import 只有 vite 解析器能处理；参数原样透传）
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const viteNodeBin = resolve(here, '../node_modules/.bin/vite-node')
const entry = resolve(here, 'graph-migrate-cli.ts')

const r = spawnSync(viteNodeBin, [entry, ...process.argv.slice(2)], { stdio: 'inherit' })
process.exit(r.status ?? 1)
